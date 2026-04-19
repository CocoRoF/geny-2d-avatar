/**
 * `@geny/orchestrator-service` CLI 엔트리 (세션 39, HTTP 팩토리 주입 세션 42).
 *
 * 사용:
 *   node dist/main.js --port 9090 [--catalog path] [--http]
 *
 * 동작:
 *   1. 카탈로그를 읽음.
 *   2. `--http` 가 켜져 있으면 카탈로그 `config.api_key_env` 가 가리키는 env 변수에서
 *      API 키를 수집해 해당 어댑터만 HTTP 팩토리로 빌드. 키 없는 어댑터는 Mock 유지.
 *      `--http` 생략 시 모든 어댑터 Mock.
 *   3. `/metrics` + `/healthz` 를 여는 HTTP 서버를 바인딩.
 *   4. `SIGTERM` / `SIGINT` 수신 시 서버 정지 + exit.
 */

import process from "node:process";
import { readFileSync } from "node:fs";

import {
  createHttpAdapterFactories,
  createMockAdapterFactories,
  createOrchestratorService,
  DEFAULT_CATALOG_PATH,
  loadApiKeysFromCatalogEnv,
} from "./index.js";
import { parseAdapterCatalog } from "@geny/ai-adapter-core";

interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
  http: boolean;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let port = 9090;
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
        "usage: orchestrator-service [--port N] [--host H] [--catalog PATH] [--http]\n",
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
  let httpAdapterNames: string[] = [];
  let factories = mockFactories;
  if (http) {
    const apiKeys = loadApiKeysFromCatalogEnv(parsedCatalog);
    const httpFactories = createHttpAdapterFactories(parsedCatalog, { apiKeys });
    httpAdapterNames = Object.keys(httpFactories).sort();
    factories = { ...mockFactories, ...httpFactories };
  }

  const service = createOrchestratorService({ catalog: parsedCatalog, factories });

  const server = service.createMetricsServer();
  await new Promise<void>((ok) => server.listen(port, host, ok));
  const addr = server.address();
  const boundPort =
    addr && typeof addr !== "string" ? addr.port : port;
  const mode = http
    ? `HTTP: [${httpAdapterNames.join(", ") || "(none — env 미설정)"}] / Mock: 나머지`
    : "Mock: 전 어댑터";
  process.stderr.write(
    `[orchestrator] listening on http://${host}:${boundPort}/metrics — ${service.adapters.length} adapters loaded — ${mode}\n`,
  );

  const shutdown = (signal: string): void => {
    process.stderr.write(`[orchestrator] ${signal} — shutting down\n`);
    server.close((err) => {
      if (err) {
        process.stderr.write(`[orchestrator] close error: ${err.message}\n`);
        process.exit(1);
      }
      process.exit(0);
    });
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  process.stderr.write(`[orchestrator] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
