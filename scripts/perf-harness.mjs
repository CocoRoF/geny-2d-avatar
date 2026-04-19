#!/usr/bin/env node
// scripts/perf-harness.mjs
// Foundation 성능 SLO 측정 하네스 (docs/14 §10 "성능 SLO 초과 없음" 게이트).
//
// 목적:
//  - `@geny/worker-generate` 를 in-process 로 기동, 실 HTTP `POST /jobs` 경로에
//    N 개의 Mock 어댑터 잡을 concurrency C 로 투하.
//  - 각 잡의 (a) accept latency (POST 응답까지) + (b) orchestrate latency
//    (submit → terminal) 을 측정해 p50/p95/p99/max + 에러율 + 처리량 보고.
//  - Foundation 기준 SLO 와 대비하여 exit code 결정. 초과 시 non-zero.
//
// Mock 어댑터만 사용 — 실 벤더 네트워크 지연 제외, 파이프라인 오버헤드만 측정.
// 실 벤더 부하는 별도 staging 환경에서 `--http` 로 재활용.
//
// 사용:
//   node scripts/perf-harness.mjs                    # 기본 (N=50, C=8, driver=in-memory)
//   node scripts/perf-harness.mjs --jobs 200 --concurrency 16
//   node scripts/perf-harness.mjs --jobs 20 --concurrency 4 --smoke
//   node scripts/perf-harness.mjs --report /tmp/perf.json
//   REDIS_URL=redis://127.0.0.1:6379 node scripts/perf-harness.mjs --driver bullmq
//
// 옵션:
//   --jobs N           총 잡 수 (기본 50)
//   --concurrency C    동시 in-flight POST 수 (기본 8)
//   --smoke            SLO 임계 완화 (CI 빠른 회귀 용 — p95 ≤ 2s, err ≤ 5%)
//   --report PATH      JSON 보고서 저장. 생략 시 stdout 만.
//   --driver KIND      in-memory | bullmq (기본 in-memory).
//                      bullmq 는 REDIS_URL 환경변수와 미리 기동된 Redis 7+ 필요.
//                      ADR 0006 §4 X+4 staging 회귀에 사용.
//   --queue-name N     BullMQ queue 이름 (기본 geny-perf).
//
// SLO 임계 (Foundation, Mock 파이프라인 기준 — 실측 재조정 가능):
//   - accept_latency_ms       p95 ≤ 100
//   - orchestrate_latency_ms  p95 ≤ 500, p99 ≤ 1500
//   - error_rate_ratio        ≤ 0.01
//   - throughput_jobs_per_s   ≥ 10   (Mock CPU-only, 개발 하드웨어 기준)
//
// 보고서 스키마:
//   { schema: "geny-perf-v1", config, slo, stats, violations[], pass: boolean }

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { request as httpRequest } from "node:http";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { createWorkerGenerate } from "../apps/worker-generate/dist/index.js";

const ARGV = parseArgv(process.argv.slice(2));
const SMOKE = ARGV.smoke;
const DRIVER = ARGV.driver ?? "in-memory";
if (DRIVER !== "in-memory" && DRIVER !== "bullmq") {
  throw new Error(`--driver 는 "in-memory" | "bullmq" 만 허용: ${DRIVER}`);
}

const CONFIG = {
  jobs: Number(ARGV.jobs ?? (SMOKE ? 20 : 50)),
  concurrency: Number(ARGV.concurrency ?? (SMOKE ? 4 : 8)),
  smoke: SMOKE,
  reportPath: ARGV.report ?? null,
  driver: DRIVER,
  queueName: ARGV["queue-name"] ?? "geny-perf",
};

const SLO = SMOKE
  ? {
      accept_latency_ms_p95: 500,
      orchestrate_latency_ms_p95: 2000,
      orchestrate_latency_ms_p99: 5000,
      error_rate_ratio_max: 0.05,
      throughput_jobs_per_s_min: 1,
    }
  : {
      accept_latency_ms_p95: 100,
      orchestrate_latency_ms_p95: 500,
      orchestrate_latency_ms_p99: 1500,
      error_rate_ratio_max: 0.01,
      throughput_jobs_per_s_min: 10,
    };

export async function runHarness(overrides = {}) {
  const cfg = { ...CONFIG, ...overrides };
  const slo = { ...SLO, ...(overrides.slo ?? {}) };

  const { worker, cleanup: driverCleanup } = await buildWorker(cfg);
  const server = worker.createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const port = server.address().port;

  const runStart = Date.now();
  const acceptLatencies = [];
  const orchestrateLatencies = [];
  const errors = [];
  let queueMetrics; // bullmq 경로에서 /metrics 스크레이프 결과.

  try {
    let issued = 0;
    async function worker_() {
      while (true) {
        const i = issued++;
        if (i >= cfg.jobs) return;
        const task = buildTask(i);
        const postStart = process.hrtime.bigint();
        let jobId;
        try {
          const res = await postJob(port, task);
          const postEnd = process.hrtime.bigint();
          acceptLatencies.push(nsToMs(postEnd - postStart));
          if (res.status !== 202) {
            errors.push({ i, phase: "accept", reason: `status=${res.status}` });
            continue;
          }
          jobId = JSON.parse(res.body).job_id;
        } catch (err) {
          errors.push({ i, phase: "accept", reason: String(err?.message ?? err) });
          continue;
        }

        const orchStart = postStart;
        try {
          await worker.store.waitFor(jobId, 15_000);
          const orchEnd = process.hrtime.bigint();
          const rec = await worker.store.get(jobId);
          if (rec?.status !== "succeeded") {
            errors.push({ i, phase: "orchestrate", reason: rec?.error ?? "non-succeeded" });
          }
          orchestrateLatencies.push(nsToMs(orchEnd - orchStart));
        } catch (err) {
          errors.push({ i, phase: "orchestrate", reason: String(err?.message ?? err) });
        }
      }
    }

    await Promise.all(
      Array.from({ length: cfg.concurrency }, () => worker_()),
    );
  } finally {
    // bullmq 경로에서는 서버 종료 전에 /metrics 를 한 번 긁어 queue counter 를 캡처.
    // in-memory 는 counter 가 없으므로 skip.
    if (cfg.driver === "bullmq") {
      try {
        const text = await fetchMetrics(port);
        queueMetrics = parseMetrics(text, { queueName: cfg.queueName });
      } catch (err) {
        queueMetrics = { error: String(err?.message ?? err) };
      }
    }
    await new Promise((ok) => server.close(() => ok()));
    await worker.store.stop();
    if (driverCleanup) await driverCleanup();
  }

  const runMs = Date.now() - runStart;

  const acceptStats = percentiles(acceptLatencies);
  const orchestrateStats = percentiles(orchestrateLatencies);
  const errorCount = errors.length;
  const errorRate = cfg.jobs === 0 ? 0 : errorCount / cfg.jobs;
  const throughput = runMs === 0 ? 0 : (orchestrateLatencies.length / runMs) * 1000;

  const stats = {
    run_ms: runMs,
    jobs: cfg.jobs,
    jobs_accepted: acceptLatencies.length,
    jobs_terminal: orchestrateLatencies.length,
    error_count: errorCount,
    error_rate: round(errorRate, 4),
    throughput_jobs_per_s: round(throughput, 2),
    accept_latency_ms: acceptStats,
    orchestrate_latency_ms: orchestrateStats,
  };

  const violations = [];
  if (acceptStats.p95 > slo.accept_latency_ms_p95)
    violations.push({ slo: "accept_latency_ms_p95", observed: acceptStats.p95, limit: slo.accept_latency_ms_p95 });
  if (orchestrateStats.p95 > slo.orchestrate_latency_ms_p95)
    violations.push({ slo: "orchestrate_latency_ms_p95", observed: orchestrateStats.p95, limit: slo.orchestrate_latency_ms_p95 });
  if (orchestrateStats.p99 > slo.orchestrate_latency_ms_p99)
    violations.push({ slo: "orchestrate_latency_ms_p99", observed: orchestrateStats.p99, limit: slo.orchestrate_latency_ms_p99 });
  if (errorRate > slo.error_rate_ratio_max)
    violations.push({ slo: "error_rate_ratio_max", observed: round(errorRate, 4), limit: slo.error_rate_ratio_max });
  if (throughput < slo.throughput_jobs_per_s_min)
    violations.push({ slo: "throughput_jobs_per_s_min", observed: round(throughput, 2), limit: slo.throughput_jobs_per_s_min });

  const report = {
    schema: "geny-perf-v1",
    timestamp: new Date().toISOString(),
    ...(queueMetrics ? { queue: queueMetrics } : {}),
    config: {
      jobs: cfg.jobs,
      concurrency: cfg.concurrency,
      smoke: !!cfg.smoke,
      driver: cfg.driver ?? "in-memory",
      queueName: cfg.queueName ?? null,
    },
    slo,
    stats,
    violations,
    pass: violations.length === 0,
  };

  if (cfg.reportPath) {
    await mkdir(dirname(cfg.reportPath), { recursive: true });
    await writeFile(cfg.reportPath, JSON.stringify(report, null, 2));
  }

  return report;
}

async function buildWorker(cfg) {
  if (cfg.driver === "in-memory") {
    return { worker: createWorkerGenerate(), cleanup: undefined };
  }
  // bullmq — ADR 0006 §4 X+4 staging 경로. REDIS_URL 필수.
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error("--driver bullmq 는 REDIS_URL 환경변수를 요구한다 (예: redis://127.0.0.1:6379)");
  }
  const { Redis } = await import("ioredis");
  const { createBullMQDriverFromRedis, createBullMQJobStore } = await import(
    "../packages/job-queue-bullmq/dist/index.js"
  );
  const client = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const driver = createBullMQDriverFromRedis(client, { queueName: cfg.queueName });
  // `onEnqueued` 는 store 생성 이전에 필요하지만 counter 는 worker.service.registry 가 만들어진
  // **이후** 등록 — closure 로 늦 바인딩 (apps/worker-generate/src/main.ts 와 동일 패턴).
  let enqueueInc;
  const onEnqueued = () => {
    enqueueInc?.({ queue_name: cfg.queueName });
  };
  const storeFactory = (orchestrate) =>
    createBullMQJobStore({ driver, orchestrate, mode: "inline", onEnqueued });
  const worker = createWorkerGenerate({ storeFactory });
  const counter = worker.service.registry.counter(
    "geny_queue_enqueued_total",
    "큐에 투입된 누적 잡 수 (catalog §2.1)",
  );
  enqueueInc = (labels) => counter.inc(labels);
  const cleanup = async () => {
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  };
  return { worker, cleanup };
}

function buildTask(i) {
  const idem = `perf-${i}-${createHash("sha256").update(String(i)).digest("hex").slice(0, 10)}`;
  return {
    schema_version: "v1",
    task_id: `perf-t-${i}`,
    slot_id: "hair_front",
    prompt: "pastel soft hair, perf harness",
    negative_prompt: "",
    size: [512, 512],
    deadline_ms: 5000,
    budget_usd: 0.1,
    idempotency_key: idem,
    capability_required: ["edit"],
  };
}

function postJob(port, body) {
  return new Promise((ok, fail) => {
    const payload = JSON.stringify(body);
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: "POST",
        path: "/jobs",
        headers: {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", fail);
    req.write(payload);
    req.end();
  });
}

function fetchMetrics(port) {
  return new Promise((ok, fail) => {
    const req = httpRequest(
      { host: "127.0.0.1", port, method: "GET", path: "/metrics" },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          if ((res.statusCode ?? 0) !== 200) {
            fail(new Error(`/metrics status=${res.statusCode}`));
            return;
          }
          ok(Buffer.concat(chunks).toString("utf8"));
        });
      },
    );
    req.on("error", fail);
    req.end();
  });
}

/**
 * 미니멀 Prometheus text 파서 — 세션 72: perf-harness bullmq 경로 queue counter 캡처 목적만.
 * 전체 exposition 문법을 다루지 않는다.
 *
 *  - `geny_queue_enqueued_total{queue_name="<q>"}` 의 값을 `enqueued_total` 로 추출.
 *  - `geny_queue_depth{queue_name="<q>",state="<s>"}` 들을 `{ waiting, active, delayed, completed, failed }`
 *    object 로 합산. 세션 72 에선 perf 실행 중 sampler 가 동작하지 않는 경로 (createWorkerGenerate
 *    를 직접 쓰는 in-process 하네스) — 값이 없으면 `depth` 필드 자체를 생략.
 *
 * 계약:
 *   input  : /metrics text body, `queueName` label
 *   output : { enqueued_total?: number, depth?: { state: count } }
 */
export function parseMetrics(text, { queueName }) {
  const out = {};
  const escQ = queueName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const enqueuedRe = new RegExp(
    `^geny_queue_enqueued_total\\{[^}]*queue_name="${escQ}"[^}]*\\}\\s+([0-9.eE+-]+)`,
    "m",
  );
  const m = text.match(enqueuedRe);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v)) out.enqueued_total = v;
  }
  const depthRe = new RegExp(
    `^geny_queue_depth\\{([^}]*queue_name="${escQ}"[^}]*)\\}\\s+([0-9.eE+-]+)`,
    "gm",
  );
  const depth = {};
  let hit;
  while ((hit = depthRe.exec(text)) !== null) {
    const labels = hit[1];
    const value = Number(hit[2]);
    const stateMatch = labels.match(/state="([^"]+)"/);
    if (stateMatch && Number.isFinite(value)) depth[stateMatch[1]] = value;
  }
  if (Object.keys(depth).length > 0) out.depth = depth;
  return out;
}

function percentiles(samples) {
  if (samples.length === 0) return { n: 0, p50: 0, p95: 0, p99: 0, max: 0, mean: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return {
    n: sorted.length,
    p50: round(pick(0.5), 2),
    p95: round(pick(0.95), 2),
    p99: round(pick(0.99), 2),
    max: round(sorted[sorted.length - 1], 2),
    mean: round(mean, 2),
  };
}

function round(n, digits) {
  const m = 10 ** digits;
  return Math.round(n * m) / m;
}

function nsToMs(ns) {
  return Number(ns) / 1_000_000;
}

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const isEntrypoint = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isEntrypoint) {
  try {
    const report = await runHarness(CONFIG);
    printReport(report);
    process.exit(report.pass ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(2);
  }
}

function printReport(r) {
  process.stdout.write(
    [
      `[perf] driver=${r.config.driver ?? "in-memory"}${r.config.queueName ? ` queue=${r.config.queueName}` : ""} jobs=${r.stats.jobs} concurrency=${r.config.concurrency} run_ms=${r.stats.run_ms}`,
      `[perf] accept  p50=${r.stats.accept_latency_ms.p50}ms p95=${r.stats.accept_latency_ms.p95}ms p99=${r.stats.accept_latency_ms.p99}ms`,
      `[perf] orch    p50=${r.stats.orchestrate_latency_ms.p50}ms p95=${r.stats.orchestrate_latency_ms.p95}ms p99=${r.stats.orchestrate_latency_ms.p99}ms`,
      `[perf] tput=${r.stats.throughput_jobs_per_s}/s err=${r.stats.error_rate} (${r.stats.error_count}/${r.stats.jobs})`,
      r.violations.length === 0
        ? `[perf] ✅ SLO pass`
        : `[perf] ✖ SLO violations:\n${r.violations
            .map((v) => `  - ${v.slo}: observed=${v.observed} limit=${v.limit}`)
            .join("\n")}`,
    ].join("\n") + "\n",
  );
}
