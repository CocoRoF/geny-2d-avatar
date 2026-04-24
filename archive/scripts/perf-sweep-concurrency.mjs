#!/usr/bin/env node
// scripts/perf-sweep-concurrency.mjs
// 세션 74 — consumer `--concurrency N` 스윕 측정 오케스트레이션.
//
// 같은 producer/Redis 를 고정한 상태에서 consumer 만 매 회 재기동하며 C∈{1,2,4,8,16}
// 스윕해 tput 포화점 + accept/orch p95 degrade 지점 탐색.
//
// 전제: (1) Redis 가 `--redis-url` 로 떠있음, (2) producer 가 `--producer-url` 로 떠있음,
//       (3) 현재 시점에 해당 queueName 에서 consumer 가 돌고 있지 않음 (본 스크립트가 기동).
//
// Usage:
//   node scripts/perf-sweep-concurrency.mjs \
//     --producer-url http://127.0.0.1:9091 \
//     --consumer-port 9092 \
//     --redis-url redis://127.0.0.1:6380 \
//     --queue-name geny-perf-74 \
//     --jobs 200 \
//     --harness-concurrency 16 \
//     --concurrencies 1,2,4,8,16 \
//     --out-dir /tmp/perf-sweep-74

import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
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
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const ARGS = parseArgv(process.argv.slice(2));
const PRODUCER_URL = String(ARGS["producer-url"] ?? "http://127.0.0.1:9091");
const CONSUMER_PORT = Number(ARGS["consumer-port"] ?? 9092);
const REDIS_URL = String(ARGS["redis-url"] ?? "redis://127.0.0.1:6380");
const QUEUE_NAME = String(ARGS["queue-name"] ?? "geny-perf-74");
const JOBS = Number(ARGS["jobs"] ?? 200);
const HARNESS_CONCURRENCY = Number(ARGS["harness-concurrency"] ?? 16);
const CONCURRENCIES = String(ARGS["concurrencies"] ?? "1,2,4,8,16")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n >= 1);
const OUT_DIR = String(ARGS["out-dir"] ?? `/tmp/perf-sweep-${Date.now()}`);

mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((ok) => setTimeout(ok, ms));
}

async function httpPing(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function flushRedis() {
  // `docker exec geny-perf-redis redis-cli FLUSHALL` 이 가장 확실하지만 컨테이너 이름이
  // 환경 의존 — ioredis 로 직접 FLUSHALL 날림.
  const { Redis } = await import("ioredis");
  const client = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  try {
    await client.flushall();
  } finally {
    await client.quit();
  }
}

function startConsumer(concurrency) {
  const env = { ...process.env, REDIS_URL };
  const proc = spawn(
    "node",
    [
      "apps/worker-generate/dist/main.js",
      "--port",
      String(CONSUMER_PORT),
      "--host",
      "127.0.0.1",
      "--driver",
      "bullmq",
      "--role",
      "consumer",
      "--queue-name",
      QUEUE_NAME,
      "--concurrency",
      String(concurrency),
    ],
    {
      cwd: repoRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  const logs = [];
  proc.stdout?.on("data", (c) => logs.push(c.toString()));
  proc.stderr?.on("data", (c) => logs.push(c.toString()));
  return { proc, logs };
}

async function stopConsumer(handle) {
  if (!handle?.proc) return;
  handle.proc.kill("SIGTERM");
  await new Promise((ok) => {
    const t = setTimeout(() => {
      try {
        handle.proc.kill("SIGKILL");
      } catch {}
      ok();
    }, 5000);
    handle.proc.once("exit", () => {
      clearTimeout(t);
      ok();
    });
  });
}

function runHarness(reportPath) {
  return new Promise((ok, fail) => {
    const proc = spawn(
      "node",
      [
        "scripts/perf-harness.mjs",
        "--jobs",
        String(JOBS),
        "--concurrency",
        String(HARNESS_CONCURRENCY),
        "--queue-name",
        QUEUE_NAME,
        "--target-url",
        PRODUCER_URL,
        "--report",
        reportPath,
      ],
      { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    const logs = [];
    proc.stdout?.on("data", (c) => logs.push(c.toString()));
    proc.stderr?.on("data", (c) => logs.push(c.toString()));
    proc.on("exit", (code) => {
      if (code === 0) ok(logs.join(""));
      else fail(new Error(`perf-harness exited ${code}\n${logs.join("")}`));
    });
  });
}

async function main() {
  if (!(await httpPing(`${PRODUCER_URL}/healthz`))) {
    throw new Error(`producer not reachable: ${PRODUCER_URL}`);
  }
  console.log(`[sweep] producer OK — redis=${REDIS_URL} queue=${QUEUE_NAME}`);

  const rows = [];
  for (const c of CONCURRENCIES) {
    console.log(`[sweep] ── concurrency=${c} ──`);
    await flushRedis();
    const handle = startConsumer(c);
    const ok = await httpPing(`http://127.0.0.1:${CONSUMER_PORT}/healthz`, 60);
    if (!ok) {
      await stopConsumer(handle);
      throw new Error(`consumer failed to start (C=${c})\n${handle.logs.join("").slice(-500)}`);
    }
    // warm-up: consumer 는 첫 Redis connection + BullMQ Worker 부트가 tput 측정에 섞이지
    // 않도록 소규모 run 1회 — 결과 버림.
    const warmPath = path.join(OUT_DIR, `c${c}-warm.json`);
    try {
      await runHarness(warmPath);
    } catch (err) {
      await stopConsumer(handle);
      throw err;
    }
    // 본 측정
    const reportPath = path.join(OUT_DIR, `c${c}.json`);
    await flushRedis();
    let harnessOut;
    try {
      harnessOut = await runHarness(reportPath);
    } catch (err) {
      await stopConsumer(handle);
      throw err;
    }
    await stopConsumer(handle);

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    rows.push({
      concurrency: c,
      run_ms: report.stats.run_ms,
      accept_p95: report.stats.accept_latency_ms.p95,
      orch_p95: report.stats.orchestrate_latency_ms.p95,
      orch_p99: report.stats.orchestrate_latency_ms.p99,
      tput: report.stats.throughput_jobs_per_s,
      err: report.stats.error_count,
      enqueued: report.queue?.enqueued_total ?? null,
      pass: report.pass,
    });
    console.log(
      `[sweep] C=${c} run=${report.stats.run_ms}ms accept_p95=${report.stats.accept_latency_ms.p95}ms orch_p95=${report.stats.orchestrate_latency_ms.p95}ms tput=${report.stats.throughput_jobs_per_s}/s err=${report.stats.error_count}`,
    );
  }

  const summaryPath = path.join(OUT_DIR, "summary.json");
  writeFileSync(
    summaryPath,
    JSON.stringify(
      {
        schema: "geny-perf-sweep-v1",
        timestamp: new Date().toISOString(),
        config: {
          producerUrl: PRODUCER_URL,
          redisUrl: REDIS_URL,
          queueName: QUEUE_NAME,
          jobs: JOBS,
          harnessConcurrency: HARNESS_CONCURRENCY,
          consumerConcurrencies: CONCURRENCIES,
        },
        rows,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`[sweep] summary → ${summaryPath}`);

  // markdown table to stdout
  console.log("\n| consumer C | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | err | enqueued |");
  console.log("|---|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.concurrency} | ${r.run_ms} | ${r.accept_p95} | ${r.orch_p95} | ${r.orch_p99} | ${r.tput} | ${r.err} | ${r.enqueued ?? "—"} |`,
    );
  }
}

main().catch((err) => {
  console.error("[sweep] error:", err);
  process.exit(1);
});
