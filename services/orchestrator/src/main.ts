/**
 * `@geny/orchestrator-service` CLI 엔트리 (세션 39).
 *
 * 사용:
 *   node dist/main.js --port 9090 [--catalog path]
 *
 * 동작:
 *   1. 카탈로그를 읽어 Mock 기반 어댑터로 서비스를 구성.
 *   2. `/metrics` + `/healthz` 를 여는 HTTP 서버를 바인딩.
 *   3. `SIGTERM` / `SIGINT` 수신 시 서버 정지 + exit.
 *
 * 실제 벤더 HTTP 호출은 Foundation 범위 밖 — 호출자가 Http*Client 로 교체해 라이브러리 레벨
 * 로 재초기화하는 건 다음 세션 (어댑터 http-client 주입 패턴 고도화).
 */

import process from "node:process";

import { createOrchestratorService } from "./index.js";

interface CliArgs {
  port: number;
  host: string;
  catalog: string | undefined;
}

function parseArgs(argv: readonly string[]): CliArgs {
  let port = 9090;
  let host = "0.0.0.0";
  let catalog: string | undefined;
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
    } else if (a === "--help" || a === "-h") {
      process.stdout.write(
        "usage: orchestrator-service [--port N] [--host H] [--catalog PATH]\n",
      );
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${a}`);
    }
  }
  return { port, host, catalog };
}

async function main(): Promise<void> {
  const { port, host, catalog } = parseArgs(process.argv.slice(2));
  const service = createOrchestratorService(
    catalog !== undefined ? { catalogPath: catalog } : {},
  );

  const server = service.createMetricsServer();
  await new Promise<void>((ok) => server.listen(port, host, ok));
  const addr = server.address();
  const boundPort =
    addr && typeof addr !== "string" ? addr.port : port;
  process.stderr.write(
    `[orchestrator] listening on http://${host}:${boundPort}/metrics — ${service.adapters.length} adapters loaded\n`,
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
