#!/usr/bin/env node
// scripts/observability-e2e.mjs
// 세션 77 — Observability end-to-end 오케스트레이션.
//
// 세션 75 `observability-smoke.mjs` 를 "실 Redis + producer + consumer 기동 + 스모크
// 부하 투하" 까지 한 번에 돌리는 상위 스크립트. 로컬 개발 루프에서 한 커맨드로 검증
// 하고, 장기적으로 `bullmq-integration` CI lane 에 승격할 때 체크리스트 역할도.
//
// 파이프라인:
//   1. `docker run --rm -d redis:7.2-alpine --maxmemory-policy noeviction` (기본)
//      또는 `--reuse-redis` 로 이미 떠있는 `--redis-url` 재사용.
//   2. producer (port 9091) + consumer (port 9092, concurrency 4) spawn.
//   3. perf-harness smoke (N=20, harness_C=4, --target-url producer).
//   4. observability-smoke validation (`--expect-enqueued N --expect-ai-calls N`).
//   5. 정리 — consumer/producer SIGTERM, Redis 컨테이너 제거 (reuse 가 아니면).
//
// 실패 시 exit 1 + 마지막 100 줄 프로세스 로그 stderr dump.
//
// Usage:
//   node scripts/observability-e2e.mjs                    # 기본값 (docker 필수)
//   node scripts/observability-e2e.mjs --reuse-redis \
//     --redis-url redis://127.0.0.1:6379                  # 이미 떠있는 Redis 재사용

import { spawn, spawnSync } from "node:child_process";
import { createWriteStream, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    // 세션 85 — 빈 문자열 value 보존: `--harness-capability-required ""` 로 "capability=[]"
    // 를 지정하는 2-hop fallback e2e 경로가 있음. 이전 `!next` 는 empty string 을 falsy 로
    // 간주해 boolean true 로 설정했고, 빈 리스트 override 가 무음으로 기본값("edit")으로 복구됐다.
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const ARGS = parseArgv(process.argv.slice(2));
const REUSE_REDIS = ARGS["reuse-redis"] === true;
const REDIS_URL = String(ARGS["redis-url"] ?? "redis://127.0.0.1:6382");
const REDIS_PORT = Number(new URL(REDIS_URL).port || "6379");
const CONTAINER_NAME = String(ARGS["container-name"] ?? "geny-obs-e2e");
const PRODUCER_PORT = Number(ARGS["producer-port"] ?? 9091);
const CONSUMER_PORT = Number(ARGS["consumer-port"] ?? 9092);
const QUEUE_NAME = String(ARGS["queue-name"] ?? "geny-obs-e2e");
const JOBS = Number(ARGS["jobs"] ?? 20);
const HARNESS_CONCURRENCY = Number(ARGS["harness-concurrency"] ?? 4);
const CONSUMER_CONCURRENCY = Number(ARGS["consumer-concurrency"] ?? 4);
const SNAPSHOT_PATH = ARGS["snapshot"] ? String(ARGS["snapshot"]) : null;
const LOG_DIR = path.resolve(repoRoot, String(ARGS["log-dir"] ?? "artifacts/observability-e2e"));
// 세션 83 — `--vendor-mock` 시 scripts/mock-vendor-server.mjs 를 ephemeral port 로 기동하고
// adapters.json 의 endpoint 를 덮어쓴 임시 카탈로그 + API key env 를 워커에 주입. Mock 어댑터가
// 아닌 **실 HTTP 어댑터** 경로로 perf-harness smoke 가 흐르게 된다 (세션 82 mock-vendor-server
// 는 그 HTTP 계약 재현 담당).
const VENDOR_MOCK = ARGS["vendor-mock"] === true;
const MOCK_SEED = Number(ARGS["mock-seed"] ?? 42);
const MOCK_LATENCY_MEAN_MS = Number(ARGS["mock-latency-mean-ms"] ?? 0);
const MOCK_LATENCY_JITTER_MS = Number(ARGS["mock-latency-jitter-ms"] ?? 0);
const MOCK_FAIL_RATE = Number(ARGS["mock-fail-rate"] ?? 0);
// 세션 84 — 엔드포인트별 fail rate override. undefined 는 `--mock-fail-rate` 상속 (세션 83 호환).
// nano-banana=1.0 / sdxl=0 / flux-fill=0 이면 매 호출 nano-banana 실패 → sdxl 폴백 성공, 결정론적.
const MOCK_FAIL_RATE_GENERATE = ARGS["mock-fail-rate-generate"] !== undefined
  ? Number(ARGS["mock-fail-rate-generate"]) : undefined;
const MOCK_FAIL_RATE_EDIT = ARGS["mock-fail-rate-edit"] !== undefined
  ? Number(ARGS["mock-fail-rate-edit"]) : undefined;
const MOCK_FAIL_RATE_FILL = ARGS["mock-fail-rate-fill"] !== undefined
  ? Number(ARGS["mock-fail-rate-fill"]) : undefined;
// 세션 85 — perf-harness buildTask 의 task shape 을 CLI 로 투명하게 덮는다. 2-hop fallback
// e2e 는 `--harness-capability-required=""` (빈 리스트) + `--harness-with-mask` 로 3 어댑터
// 전부 eligible + flux-fill 의 reference_image/mask 검증 통과 조건을 만든다.
const HARNESS_CAPABILITY_REQUIRED = ARGS["harness-capability-required"] !== undefined
  ? String(ARGS["harness-capability-required"]) : undefined;
const HARNESS_WITH_MASK = ARGS["harness-with-mask"] === true;

mkdirSync(LOG_DIR, { recursive: true });

const cleanupTasks = [];

async function runCleanup() {
  for (const task of cleanupTasks.reverse()) {
    try {
      await task();
    } catch (err) {
      console.error("[e2e] cleanup error:", err.message ?? err);
    }
  }
}

function sleep(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

async function httpPing(url, tries = 60) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

function startRedisContainer() {
  // 이미 같은 이름 컨테이너가 남아있으면 재사용이 아닌 한 제거.
  spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
  const res = spawnSync(
    "docker",
    [
      "run",
      "-d",
      "--rm",
      "--name",
      CONTAINER_NAME,
      "-p",
      `${REDIS_PORT}:6379`,
      "redis:7.2-alpine",
      "redis-server",
      "--maxmemory-policy",
      "noeviction",
    ],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`docker run failed: ${res.stderr || res.stdout}`);
  }
  console.log(`[e2e] redis container started ${CONTAINER_NAME} (${REDIS_URL})`);
  cleanupTasks.push(async () => {
    spawnSync("docker", ["rm", "-f", CONTAINER_NAME], { stdio: "ignore" });
    console.log(`[e2e] redis container removed`);
  });
}

function startWorker(role, port, extra = [], extraEnv = {}) {
  const env = { ...process.env, REDIS_URL, ...extraEnv };
  const args = [
    "apps/worker-generate/dist/main.js",
    "--port",
    String(port),
    "--host",
    "127.0.0.1",
    "--driver",
    "bullmq",
    "--role",
    role,
    "--queue-name",
    QUEUE_NAME,
    ...extra,
  ];
  const proc = spawn("node", args, { cwd: repoRoot, env, stdio: ["ignore", "pipe", "pipe"] });
  const logs = [];
  // 세션 79 — CI 실패 시 로그를 artifact 로 업로드하려면 파일로도 남겨야 함. 스트림이 살아있는
  // 동안 flush 되도록 append 모드로 열고 exit 시 close.
  const logPath = path.join(LOG_DIR, `${role}.log`);
  const logFile = createWriteStream(logPath, { flags: "w" });
  proc.stdout?.on("data", (c) => {
    logs.push(c.toString());
    logFile.write(c);
  });
  proc.stderr?.on("data", (c) => {
    logs.push(c.toString());
    logFile.write(c);
  });
  proc.once("exit", () => logFile.end());
  cleanupTasks.push(async () => {
    try {
      proc.kill("SIGTERM");
    } catch {}
    await new Promise((ok) => {
      const t = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {}
        ok();
      }, 5000);
      proc.once("exit", () => {
        clearTimeout(t);
        ok();
      });
    });
  });
  return { proc, logs };
}

async function waitForHealth(role, url, logs) {
  const ok = await httpPing(url, 60);
  if (!ok) {
    throw new Error(`${role} not healthy at ${url} — tail:\n${logs.join("").slice(-800)}`);
  }
  console.log(`[e2e] ${role} OK — ${url}`);
}

function runSubprocess(cmd, args, { logName } = {}) {
  return new Promise((ok, fail) => {
    const proc = spawn(cmd, args, { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    const logs = [];
    const logFile = logName ? createWriteStream(path.join(LOG_DIR, `${logName}.log`), { flags: "w" }) : null;
    proc.stdout?.on("data", (c) => {
      process.stdout.write(c);
      logs.push(c.toString());
      logFile?.write(c);
    });
    proc.stderr?.on("data", (c) => {
      process.stderr.write(c);
      logs.push(c.toString());
      logFile?.write(c);
    });
    proc.on("exit", (code) => {
      logFile?.end();
      if (code === 0) ok(logs.join(""));
      else fail(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

// 세션 83 — mock-vendor-server 를 ephemeral port 로 기동하고 "mock-vendor listening: <url>"
// stdout 한 줄을 파싱해 base URL 을 반환. cleanupTasks 에 SIGTERM → 3s 뒤 SIGKILL 패턴을
// push (세션 77 startWorker 와 동형).
async function startMockVendor() {
  const mockArgs = [
    "scripts/mock-vendor-server.mjs",
    "--port", "0",
    "--seed", String(MOCK_SEED),
    "--latency-mean-ms", String(MOCK_LATENCY_MEAN_MS),
    "--latency-jitter-ms", String(MOCK_LATENCY_JITTER_MS),
    "--fail-rate", String(MOCK_FAIL_RATE),
  ];
  if (MOCK_FAIL_RATE_GENERATE !== undefined) mockArgs.push("--fail-rate-generate", String(MOCK_FAIL_RATE_GENERATE));
  if (MOCK_FAIL_RATE_EDIT !== undefined) mockArgs.push("--fail-rate-edit", String(MOCK_FAIL_RATE_EDIT));
  if (MOCK_FAIL_RATE_FILL !== undefined) mockArgs.push("--fail-rate-fill", String(MOCK_FAIL_RATE_FILL));
  const proc = spawn("node", mockArgs, { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
  const logFile = createWriteStream(path.join(LOG_DIR, "mock-vendor.log"), { flags: "w" });
  let buf = "";
  return await new Promise((ok, fail) => {
    let resolved = false;
    proc.stdout.on("data", (c) => {
      logFile.write(c);
      buf += c.toString();
      const m = buf.match(/mock-vendor listening: (http:\/\/\S+)/);
      if (m && !resolved) {
        resolved = true;
        const url = m[1];
        console.log(`[e2e] mock-vendor OK — ${url}`);
        cleanupTasks.push(async () => {
          try { proc.kill("SIGTERM"); } catch {}
          await new Promise((r) => {
            const t = setTimeout(() => { try { proc.kill("SIGKILL"); } catch {} ; r(); }, 3000);
            proc.once("exit", () => { clearTimeout(t); r(); });
          });
          logFile.end();
          console.log("[e2e] mock-vendor stopped");
        });
        ok(url);
      }
    });
    proc.stderr.on("data", (c) => logFile.write(c));
    proc.once("exit", (code) => {
      if (!resolved) fail(new Error(`mock-vendor exited before listening: code=${code}`));
    });
    setTimeout(() => {
      if (!resolved) fail(new Error("mock-vendor listening line not seen within 5s"));
    }, 5000).unref();
  });
}

// infra/adapters/adapters.json 을 읽어 모든 어댑터의 `config.endpoint` 를 mock URL 로 치환한
// 임시 카탈로그를 LOG_DIR 에 쓴다. api_key_env 키는 그대로 두고, 호출자가 env 에 "test-token"
// 을 주입 (mock 은 키 값 일치를 보지 않고 헤더 존재만 검증 — 세션 82 D4).
function writeHttpMockCatalog(mockUrl) {
  const baseCatalogPath = path.resolve(repoRoot, "infra/adapters/adapters.json");
  const catalog = JSON.parse(readFileSync(baseCatalogPath, "utf8"));
  for (const entry of catalog.adapters) {
    if (entry.config) entry.config.endpoint = mockUrl;
  }
  const tmpPath = path.join(LOG_DIR, "vendor-mock-catalog.json");
  writeFileSync(tmpPath, JSON.stringify(catalog, null, 2) + "\n");
  return tmpPath;
}

async function main() {
  console.log(`[e2e] reuse-redis=${REUSE_REDIS} redis=${REDIS_URL} queue=${QUEUE_NAME} jobs=${JOBS} vendor-mock=${VENDOR_MOCK}`);

  if (!REUSE_REDIS) {
    startRedisContainer();
  } else {
    console.log(`[e2e] reusing existing redis at ${REDIS_URL}`);
  }

  // Redis ready-check via ioredis ping — docker run 은 -d 후 서비스 준비까지 수백ms 지연 가능.
  const { Redis } = await import("ioredis");
  {
    const client = new Redis(REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        await client.connect();
        const pong = await client.ping();
        if (pong === "PONG") {
          ready = true;
          break;
        }
      } catch {}
      await sleep(200);
    }
    await client.quit().catch(() => {});
    if (!ready) throw new Error("redis not ready after 6s");
    console.log("[e2e] redis PING OK");
  }

  let httpArgs = [];
  let httpEnv = {};
  if (VENDOR_MOCK) {
    const mockUrl = await startMockVendor();
    const catalogPath = writeHttpMockCatalog(mockUrl);
    httpArgs = ["--http", "--catalog", catalogPath];
    httpEnv = {
      NANO_BANANA_API_KEY: "test-token",
      SDXL_API_KEY: "test-token",
      FLUX_FILL_API_KEY: "test-token",
    };
    console.log(`[e2e] vendor-mock wired — catalog=${catalogPath}`);
  }

  const producer = startWorker("producer", PRODUCER_PORT, httpArgs, httpEnv);
  await waitForHealth("producer", `http://127.0.0.1:${PRODUCER_PORT}/healthz`, producer.logs);

  const consumer = startWorker("consumer", CONSUMER_PORT, [
    "--concurrency",
    String(CONSUMER_CONCURRENCY),
    ...httpArgs,
  ], httpEnv);
  await waitForHealth("consumer", `http://127.0.0.1:${CONSUMER_PORT}/healthz`, consumer.logs);

  // 스모크 부하
  console.log("[e2e] ── perf-harness smoke ──");
  const harnessArgs = [
    "scripts/perf-harness.mjs",
    "--jobs",
    String(JOBS),
    "--concurrency",
    String(HARNESS_CONCURRENCY),
    "--queue-name",
    QUEUE_NAME,
    "--target-url",
    `http://127.0.0.1:${PRODUCER_PORT}`,
    "--report",
    path.join(LOG_DIR, "perf-harness-report.json"),
  ];
  // 세션 85 — 2-hop fallback 용 task shape override (빈 문자열도 그대로 전달 = capability=[])
  if (HARNESS_CAPABILITY_REQUIRED !== undefined) {
    harnessArgs.push("--capability-required", HARNESS_CAPABILITY_REQUIRED);
  }
  if (HARNESS_WITH_MASK) harnessArgs.push("--with-mask");
  await runSubprocess("node", harnessArgs, { logName: "perf-harness" });

  // 메트릭 검증
  console.log("[e2e] ── observability-smoke ──");
  const smokeArgs = [
    "scripts/observability-smoke.mjs",
    "--producer-url",
    `http://127.0.0.1:${PRODUCER_PORT}`,
    "--consumer-url",
    `http://127.0.0.1:${CONSUMER_PORT}`,
    "--expect-enqueued",
    String(JOBS),
    "--expect-ai-calls",
    String(JOBS),
  ];
  if (SNAPSHOT_PATH) smokeArgs.push("--snapshot", SNAPSHOT_PATH);
  await runSubprocess("node", smokeArgs, { logName: "observability-smoke" });

  console.log("[e2e] ✅ observability e2e pass");
  console.log(`[e2e] logs saved to ${LOG_DIR}`);
}

let exitCode = 0;
try {
  await main();
} catch (err) {
  console.error("[e2e] ❌", err.message ?? err);
  exitCode = 1;
} finally {
  await runCleanup();
  process.exit(exitCode);
}
