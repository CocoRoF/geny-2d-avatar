/**
 * `@geny/worker-generate` CLI 엔트리 (세션 44 / 63 / 64 / 65).
 *
 * 사용:
 *   node dist/main.js --port 9091 [--catalog path] [--http]
 *                     [--driver in-memory|bullmq] [--queue-name N]
 *                     [--role producer|consumer|both]
 *
 * `--role` (세션 65, ADR 0006 §D3 X+2):
 *   - `both` (기본) — 기존 인라인 경로: producer + in-process consumer(setImmediate orchestrate).
 *     in-memory driver 호환. session 63 X+1 까지의 배포 형상.
 *   - `producer` — HTTP `/jobs` + BullMQ `Queue` 만. `mode="producer-only"` 로 in-process
 *     orchestrate 훅 생략. consumer 역 프로세스가 따로 돌아야 잡이 처리됨.
 *   - `consumer` — BullMQ `Worker` 만. `/jobs` 라우터는 미노출. `/metrics` + `/healthz` 유지.
 *   producer/consumer 는 `--driver bullmq` 필수.
 *
 * 메트릭 배선 (catalog §2.1):
 *   - `geny_queue_enqueued_total{queue_name}` — producer/both (store.onEnqueued 훅).
 *   - `geny_queue_failed_total{queue_name,reason}` — consumer (consumer sink).
 *   - `geny_queue_duration_seconds{queue_name,outcome}` — consumer (consumer sink).
 *   - `geny_queue_depth{queue_name,state}` — producer/both (세션 64 sampler).
 *
 * SIGTERM/SIGINT — 공통: sampler stop → consumer/worker drain → redis quit → server close.
 */

import process from "node:process";
import { readFileSync } from "node:fs";
import type { Server } from "node:http";

import {
  createHttpAdapterFactories,
  createMockAdapterFactories,
  createOrchestratorService,
  DEFAULT_CATALOG_PATH,
  loadApiKeysFromCatalogEnv,
  type OrchestratorService,
} from "@geny/orchestrator-service";
import {
  parseAdapterCatalog,
  type GenerationTask,
  type AdapterCatalog,
  type AdapterFactory,
} from "@geny/ai-adapter-core";

type AdapterFactories = Record<string, AdapterFactory>;
import {
  createBullMQConsumer,
  createBullMQDriverFromRedis,
  createBullMQJobStore,
  createQueueMetricsSampler,
  type BullMQConsumer,
  type BullMQDriver,
  type QueueMetricsSampler,
} from "@geny/job-queue-bullmq";

import { createWorkerGenerate, type JobStoreFactory } from "./index.js";

const DEFAULT_SAMPLER_INTERVAL_MS = 30_000;

type DriverKind = "in-memory" | "bullmq";
type Role = "producer" | "consumer" | "both";

interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
  http: boolean;
  driver: DriverKind;
  queueName: string;
  role: Role;
}

const DEFAULT_QUEUE_NAME = "geny-generate";

function parseArgs(argv: readonly string[]): CliArgs {
  let port = 9091;
  let host = "0.0.0.0";
  let catalog: string | undefined;
  let http = false;
  let driver: DriverKind = "in-memory";
  let queueName = DEFAULT_QUEUE_NAME;
  let role: Role = "both";
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
    } else if (a === "--role") {
      const v = argv[++i];
      if (v !== "producer" && v !== "consumer" && v !== "both") {
        throw new Error(`--role 는 "producer"|"consumer"|"both" 만 허용: ${v}`);
      }
      role = v;
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: worker-generate [--port N] [--host H] [--catalog PATH] [--http]" +
          " [--driver in-memory|bullmq] [--queue-name NAME]" +
          " [--role producer|consumer|both]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  if ((role === "producer" || role === "consumer") && driver !== "bullmq") {
    throw new Error(`--role ${role} 은 --driver bullmq 에서만 사용 가능`);
  }
  return { port, host, catalog, http, driver, queueName, role };
}

interface RedisBundle {
  client: import("ioredis").Redis;
  close: () => Promise<void>;
}

async function openRedis(): Promise<RedisBundle> {
  const redisUrl = process.env["REDIS_URL"];
  if (!redisUrl) {
    throw new Error("--driver bullmq 는 REDIS_URL 환경변수를 요구한다 (예: redis://127.0.0.1:6379)");
  }
  const { Redis } = await import("ioredis");
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const close = async (): Promise<void> => {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  };
  return { client, close };
}

interface LogSink {
  info(msg: string, meta?: unknown): void;
  warn(msg: string, meta?: unknown): void;
}

function stderrLogger(): LogSink {
  return {
    info(msg, meta) {
      process.stderr.write(`[worker-generate] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
    },
    warn(msg, meta) {
      process.stderr.write(`[worker-generate][warn] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const catalogPath = args.catalog ?? DEFAULT_CATALOG_PATH;
  const parsedCatalog = parseAdapterCatalog(JSON.parse(readFileSync(catalogPath, "utf8")));

  const mockFactories = createMockAdapterFactories();
  let httpNames: string[] = [];
  let factories: AdapterFactories = mockFactories;
  if (args.http) {
    const apiKeys = loadApiKeysFromCatalogEnv(parsedCatalog);
    const httpFactories = createHttpAdapterFactories(parsedCatalog, { apiKeys });
    httpNames = Object.keys(httpFactories).sort();
    factories = { ...mockFactories, ...httpFactories };
  }

  if (args.role === "consumer") {
    await runConsumer(args, parsedCatalog, factories, httpNames);
    return;
  }
  await runProducerOrBoth(args, parsedCatalog, factories, httpNames);
}

async function runProducerOrBoth(
  args: CliArgs,
  catalog: AdapterCatalog,
  factories: AdapterFactories,
  httpNames: string[],
): Promise<void> {
  // `onEnqueued` 는 store 생성 이전에 설정되지만, counter 는 worker.service.registry 가 만들어진
  // **이후** 등록할 수 있다 — 순환 의존. closure ref 로 늦 바인딩.
  let enqueueInc: ((labels: { queue_name: string }) => void) | undefined;
  const onEnqueued = (_task: GenerationTask): void => {
    enqueueInc?.({ queue_name: args.queueName });
  };

  let storeFactory: JobStoreFactory | undefined;
  let closeConnection: (() => Promise<void>) | undefined;
  let bullmqDriver: BullMQDriver | undefined;
  if (args.driver === "bullmq") {
    const { client, close } = await openRedis();
    closeConnection = close;
    bullmqDriver = createBullMQDriverFromRedis(client, { queueName: args.queueName });
    const mode = args.role === "producer" ? "producer-only" : "inline";
    const capturedDriver = bullmqDriver;
    storeFactory = (orchestrate) =>
      createBullMQJobStore({ driver: capturedDriver, orchestrate, mode, onEnqueued });
  }

  const worker = createWorkerGenerate({
    orchestratorOptions: { catalog, factories },
    ...(storeFactory ? { storeFactory } : {}),
    logger: stderrLogger(),
  });

  if (args.driver === "bullmq") {
    const counter = worker.service.registry.counter(
      "geny_queue_enqueued_total",
      "큐에 투입된 누적 잡 수 (catalog §2.1)",
    );
    enqueueInc = (labels) => counter.inc(labels);
  }

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
      queueName: args.queueName,
      intervalMs: DEFAULT_SAMPLER_INTERVAL_MS,
      onError(err) {
        process.stderr.write(
          `[worker-generate][sampler] getCounts 실패: ${(err as Error).message}\n`,
        );
      },
    });
    sampler.start();
    void sampler.tickOnce();
  }

  const server = worker.createServer();
  await new Promise<void>((ok) => server.listen(args.port, args.host, ok));
  logBoundSummary(server, args, httpNames, "store=" + (args.role === "producer" ? "producer-only" : "inline"));

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

async function runConsumer(
  args: CliArgs,
  catalog: AdapterCatalog,
  factories: AdapterFactories,
  httpNames: string[],
): Promise<void> {
  const svc: OrchestratorService = createOrchestratorService({ catalog, factories });
  const failedCounter = svc.registry.counter(
    "geny_queue_failed_total",
    "큐 처리 실패 (terminal, catalog §2.1)",
  );
  const durationHistogram = svc.registry.histogram(
    "geny_queue_duration_seconds",
    "큐 처리 지연 — consumer 처리 구간 (catalog §2.1)",
  );

  const { client, close: closeRedis } = await openRedis();
  const consumer: BullMQConsumer = createBullMQConsumer(client, {
    queueName: args.queueName,
    processor: async (data) => svc.orchestrate(data.payload as GenerationTask),
    sink: {
      onFailed(labels) {
        failedCounter.inc(labels);
      },
      onDuration(labels, seconds) {
        durationHistogram.observe(labels, seconds);
      },
    },
  });
  await consumer.ready();

  const server = svc.createMetricsServer();
  await new Promise<void>((ok) => server.listen(args.port, args.host, ok));
  logBoundSummary(server, args, httpNames, "worker=bullmq");

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[worker-generate] ${signal} — consumer draining\n`);
    try {
      await consumer.close();
    } catch (err) {
      process.stderr.write(`[worker-generate] consumer close error: ${(err as Error).message}\n`);
    }
    try {
      await closeRedis();
    } catch (err) {
      process.stderr.write(`[worker-generate] redis close error: ${(err as Error).message}\n`);
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

function logBoundSummary(
  server: Server,
  args: CliArgs,
  httpNames: string[],
  extra: string,
): void {
  const addr = server.address();
  const boundPort = addr && typeof addr !== "string" ? addr.port : args.port;
  const mode = args.http
    ? `HTTP: [${httpNames.join(", ") || "(none — env 미설정)"}] / Mock: 나머지`
    : "Mock: 전 어댑터";
  const driverDesc =
    args.driver === "bullmq"
      ? `driver=bullmq queue=${args.queueName} redis=${process.env["REDIS_URL"]}`
      : "driver=in-memory";
  process.stderr.write(
    `[worker-generate] listening on http://${args.host}:${boundPort} role=${args.role} — ${mode} — ${driverDesc} — ${extra}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[worker-generate] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
