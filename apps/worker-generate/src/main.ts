/**
 * `@geny/worker-generate` CLI 엔트리 (세션 44).
 *
 * 사용:
 *   node dist/main.js --port 9091 [--catalog path] [--http]
 *
 * 동작:
 *   1. `@geny/orchestrator-service` 와 동일한 `--catalog` / `--http` 플래그를 받는다.
 *   2. `createWorkerGenerate` 로 orchestrator + jobs router 를 하나의 프로세스에 묶는다.
 *   3. `/metrics` + `/healthz` + `/jobs` + `/jobs/{id}` 를 같은 포트에 바인딩.
 *   4. SIGTERM / SIGINT 수신 시 서버 정지 + 드레인 + exit.
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

import { createWorkerGenerate } from "./index.js";

interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
  http: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let port = 9091;
  let host = "0.0.0.0";
  let catalog: string | undefined;
  let http = false;
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
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: worker-generate [--port N] [--host H] [--catalog PATH] [--http]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return { port, host, catalog, http };
}

async function main(): Promise<void> {
  const { port, host, catalog, http } = parseArgs(process.argv.slice(2));
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

  const worker = createWorkerGenerate({
    orchestratorOptions: { catalog: parsedCatalog, factories },
    logger: {
      info(msg, meta) {
        process.stderr.write(`[worker-generate] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
      },
      warn(msg, meta) {
        process.stderr.write(`[worker-generate][warn] ${msg} ${meta ? JSON.stringify(meta) : ""}\n`);
      },
    },
  });

  const server = worker.createServer();
  await new Promise<void>((ok) => server.listen(port, host, ok));
  const addr = server.address();
  const boundPort = addr && typeof addr !== "string" ? addr.port : port;
  const mode = http
    ? `HTTP: [${httpNames.join(", ") || "(none — env 미설정)"}] / Mock: 나머지`
    : "Mock: 전 어댑터";
  process.stderr.write(
    `[worker-generate] listening on http://${host}:${boundPort}/{metrics,healthz,jobs} — ${worker.service.adapters.length} adapters — ${mode}\n`,
  );

  const shutdown = async (signal: string): Promise<void> => {
    process.stderr.write(`[worker-generate] ${signal} — draining jobs\n`);
    try {
      await worker.store.drain(10_000);
    } catch (err) {
      process.stderr.write(`[worker-generate] drain error: ${(err as Error).message}\n`);
    }
    await worker.store.stop();
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
