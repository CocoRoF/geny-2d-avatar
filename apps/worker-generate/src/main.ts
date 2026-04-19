/**
 * `@geny/worker-generate` CLI 엔트리 (세션 44 / 63).
 *
 * 사용:
 *   node dist/main.js --port 9091 [--catalog path] [--http]
 *                     [--driver in-memory|bullmq] [--queue-name N]
 *
 * 동작:
 *   1. `@geny/orchestrator-service` 와 동일한 `--catalog` / `--http` 플래그를 받는다.
 *   2. `--driver bullmq` 시 `REDIS_URL` env 를 소비, `createBullMQDriverFromRedis` +
 *      `createBullMQJobStore` 로 JobStore 를 교체 주입 (세션 63, ADR 0006 §D3 X+1).
 *   3. `createWorkerGenerate` 로 orchestrator + jobs router 를 하나의 프로세스에 묶는다.
 *   4. `/metrics` + `/healthz` + `/jobs` + `/jobs/{id}` 를 같은 포트에 바인딩.
 *   5. SIGTERM / SIGINT 수신 시 서버 정지 + 드레인 + (bullmq) ioredis quit + exit.
 */

import process from "node:process";
import { readFileSync } from "node:fs";

import {
  createHttpAdapterFactories,
  createMockAdapterFactories,
  DEFAULT_CATALOG_PATH,
  loadApiKeysFromCatalogEnv,
} from "@geny/orchestrator-service";
import { parseAdapterCatalog } from "@geny/ai-adapter-core";
import {
  createBullMQDriverFromRedis,
  createBullMQJobStore,
  createQueueMetricsSampler,
  type BullMQDriver,
  type QueueMetricsSampler,
} from "@geny/job-queue-bullmq";

import { createWorkerGenerate, type JobStoreFactory } from "./index.js";

const DEFAULT_SAMPLER_INTERVAL_MS = 30_000;

type DriverKind = "in-memory" | "bullmq";

interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
  http: boolean;
  driver: DriverKind;
  queueName: string;
}

const DEFAULT_QUEUE_NAME = "geny-generate";

function parseArgs(argv: readonly string[]): CliArgs {
  let port = 9091;
  let host = "0.0.0.0";
  let catalog: string | undefined;
  let http = false;
  let driver: DriverKind = "in-memory";
  let queueName = DEFAULT_QUEUE_NAME;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") {
      const v = argv[++i];
      if (!v) throw new Error("--port 값 누락");
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 65535) throw new Error(`--port 범위 오류: ${v}`);
      port = n;
    } else if (a === "--host") {
      const v = argv[++i];
      if (!v) throw new Error("--host 값 누락");
      host = v;
    } else if (a === "--catalog") {
      const v = argv[++i];
      if (!v) throw new Error("--catalog 값 누락");
      catalog = v;
    } else if (a === "--http") {
      http = true;
    } else if (a === "--driver") {
      const v = argv[++i];
      if (v !== "in-memory" && v !== "bullmq") {
        throw new Error(`--driver 는 "in-memory" 또는 "bullmq" 만 허용: ${v}`);
      }
      driver = v;
    } else if (a === "--queue-name") {
      const v = argv[++i];
      if (!v) throw new Error("--queue-name 값 누락");
      queueName = v;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: worker-generate [--port N] [--host H] [--catalog PATH] [--http]" +
          " [--driver in-memory|bullmq] [--queue-name NAME]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return { port, host, catalog, http, driver, queueName };
}

/**
 * `--driver bullmq` 경로의 store 팩토리를 빌드한다. `REDIS_URL` 을 읽고, 그것이 없으면
 * 명시적으로 에러 throw — 묵시적 in-memory fallback 금지 (ops 혼란 방지).
 *
 * 반환: `{ factory, closeConnection }` — factory 는 `createWorkerGenerate.storeFactory`
 * 로 주입, closeConnection 은 SIGTERM 시 ioredis `quit()` 호출.
 */
async function buildBullMQStoreFactory(queueName: string): Promise<{
  factory: JobStoreFactory;
  driver: BullMQDriver;
  closeConnection: () => Promise<void>;
}> {
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    throw new Error("--driver bullmq 는 REDIS_URL 환경변수를 요구한다 (예: redis://127.0.0.1:6379)");
  }
  const { Redis } = await import("ioredis");
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const driver = createBullMQDriverFromRedis(client, { queueName });
  const factory: JobStoreFactory = (orchestrate) =>
    createBullMQJobStore({ driver, orchestrate });
  const closeConnection = async (): Promise<void> => {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  };
  return { factory, driver, closeConnection };
}

async function main(): Promise<void> {
  const { port, host, catalog, http, driver, queueName } = parseArgs(process.argv.slice(2));
  const catalogPath = catalog ?? DEFAULT_CATALOG_PATH;
  const parsedCatalog = parseAdapterCatalog(
    JSON.parse(readFileSync(catalogPath, "utf8")),
  );

  const mockFactories = createMockAdapterFactories();
  let httpNames: string[] = [];
  let factories = mockFactories;
  if (http) {
    const apiKeys = loadApiKeysFromCatalogEnv(parsedCatalog);
    const httpFactories = createHttpAdapterFactories(parsedCatalog, { apiKeys });
    httpNames = Object.keys(httpFactories).sort();
    factories = { ...mockFactories, ...httpFactories };
  }

  let storeFactory: JobStoreFactory | undefined;
  let closeConnection: (() => Promise<void>) | undefined;
  let bullmqDriver: BullMQDriver | undefined;
  if (driver === "bullmq") {
    const built = await buildBullMQStoreFactory(queueName);
    storeFactory = built.factory;
    closeConnection = built.closeConnection;
    bullmqDriver = built.driver;
  }

  const worker = createWorkerGenerate({
    orchestratorOptions: { catalog: parsedCatalog, factories },
    ...(storeFactory ? { storeFactory } : {}),
    logger: {
      info(msg, meta) {
        process.stderr.write(`[worker-generate] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
      },
      warn(msg, meta) {
        process.stderr.write(`[worker-generate][warn] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
      },
    },
  });

  // 세션 64 — bullmq 드라이버 사용 시 geny_queue_depth gauge sampler 등록.
  // gauge 는 worker.service.registry (InMemoryMetricsRegistry) 에 바인딩 → `/metrics`
  // text exposition 에 그대로 노출. 폴링 주기 = 30s (catalog §2.1).
  let sampler: QueueMetricsSampler | undefined;
  if (bullmqDriver) {
    const gauge = worker.service.registry.gauge(
      "geny_queue_depth",
      "BullMQ queue depth by state (catalog §2.1)",
    );
    sampler = createQueueMetricsSampler({
      driver: bullmqDriver,
      sink: {
        setDepth(labels, value) {
          gauge.set(labels, value);
        },
      },
      queueName,
      intervalMs: DEFAULT_SAMPLER_INTERVAL_MS,
      onError(err) {
        process.stderr.write(
          `[worker-generate][sampler] getCounts 실패: ${(err as Error).message}\n`,
        );
      },
    });
    sampler.start();
    // 초기 1회 즉시 샘플링 — listen 직후 /metrics scrape 에 0 이 아닌 값이 실릴 수 있게.
    void sampler.tickOnce();
  }

  const server = worker.createServer();
  await new Promise<void>((ok) => server.listen(port, host, ok));
  const addr = server.address();
  const boundPort = addr && typeof addr !== "string" ? addr.port : port;
  const mode = http
    ? `HTTP: [${httpNames.join(", ") || "(none — env 미설정)"}] / Mock: 나머지`
    : "Mock: 전 어댑터";
  const driverDesc = driver === "bullmq"
    ? `driver=bullmq queue=${queueName} redis=${process.env["REDIS_URL"]}`
    : "driver=in-memory";
  process.stderr.write(
    `[worker-generate] listening on http://${host}:${boundPort}/{metrics,healthz,jobs} — ${worker.service.adapters.length} adapters — ${mode} — ${driverDesc}\n`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[worker-generate] ${signal} — draining jobs\n`);
    if (sampler) await sampler.stop();
    try {
      await worker.store.drain(10_000);
    } catch (err) {
      process.stderr.write(`[worker-generate] drain error: ${(err as Error).message}\n`);
    }
    await worker.store.stop();
    if (closeConnection) {
      try {
        await closeConnection();
      } catch (err) {
        process.stderr.write(`[worker-generate] redis close error: ${(err as Error).message}\n`);
      }
    }
    server.close((err) => {
      if (err) {
        process.stderr.write(`[worker-generate] close error: ${err.message}\n`);
        process.exit(1);
      }
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  process.stderr.write(`[worker-generate] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
