#!/usr/bin/env node
// scripts/perf-harness.test.mjs
// Foundation 성능 SLO 하네스 smoke test — 회귀 방지용.
//
// 수행:
//   1) 짧은 smoke 실행 (N=20, C=4) 이 끝까지 도는지 + 보고서 shape 이 계약을 만족하는지.
//   2) SLO 임계를 의도적으로 아주 작게(=반드시 위반) 주입 → violations 배열이 비지 않는지.
//   3) 에러율 계산 경계 — 0 jobs 투하 시 0 으로 나누지 않고 0 반환.
//
// golden step 20 엔트리 — 실 성능 벤치는 별도 `node scripts/perf-harness.mjs` 수동 실행.

import assert from "node:assert/strict";

import { runHarness } from "./perf-harness.mjs";

async function main() {
  // 1) smoke 실행 — Foundation Mock 파이프라인은 CI 머신에서도 이 정도면 통과해야 함.
  {
    const report = await runHarness({
      jobs: 20,
      concurrency: 4,
      smoke: true,
    });
    assert.equal(report.schema, "geny-perf-v1");
    assert.equal(report.config.jobs, 20);
    assert.equal(report.config.concurrency, 4);
    assert.equal(report.stats.jobs, 20);
    assert.equal(report.stats.jobs_accepted, 20, `accept: ${report.stats.error_count} errors`);
    assert.equal(report.stats.jobs_terminal, 20, `terminal: ${report.stats.error_count} errors`);
    assert.equal(report.stats.error_count, 0);
    assert.equal(report.stats.error_rate, 0);
    assert.ok(report.stats.orchestrate_latency_ms.p50 >= 0);
    assert.ok(report.stats.orchestrate_latency_ms.p95 >= report.stats.orchestrate_latency_ms.p50);
    assert.ok(report.stats.orchestrate_latency_ms.p99 >= report.stats.orchestrate_latency_ms.p95);
    assert.ok(report.stats.accept_latency_ms.n === 20);
    assert.ok(report.stats.throughput_jobs_per_s > 0);
    assert.equal(report.pass, true, `violations: ${JSON.stringify(report.violations)}`);
    console.log("  ✓ smoke 20 jobs / concurrency 4 → pass");
  }

  // 2) SLO 위반 강제 — p95 ≤ 0.001ms 는 물리적으로 불가능.
  {
    const report = await runHarness({
      jobs: 10,
      concurrency: 2,
      smoke: true,
      slo: {
        orchestrate_latency_ms_p95: 0.001,
      },
    });
    assert.equal(report.pass, false);
    assert.ok(
      report.violations.some((v) => v.slo === "orchestrate_latency_ms_p95"),
      `expected p95 violation, got: ${JSON.stringify(report.violations)}`,
    );
    console.log("  ✓ 강제 SLO 위반 → pass=false + violations 정확히 감지");
  }

  // 3) 에러율 0-division 방지 (jobs=0 경로는 실무에선 없지만 계약 보호).
  {
    const report = await runHarness({ jobs: 0, concurrency: 1, smoke: true });
    assert.equal(report.stats.jobs, 0);
    assert.equal(report.stats.error_rate, 0);
    assert.equal(report.stats.accept_latency_ms.n, 0);
    assert.equal(report.stats.orchestrate_latency_ms.n, 0);
    // throughput 0 < slo.throughput_jobs_per_s_min (1) → 위반 1건.
    assert.ok(report.violations.some((v) => v.slo === "throughput_jobs_per_s_min"));
    console.log("  ✓ jobs=0 경계 — error_rate=0, p* 전부 0, throughput 위반만 발생");
  }

  // 4) 세션 66 — report.config.driver 가 실제 경로를 반영한다.
  //    in-memory 경로: driver 필드가 "in-memory" 로 렌더.
  {
    const report = await runHarness({ jobs: 1, concurrency: 1, smoke: true });
    assert.equal(report.config.driver, "in-memory");
    assert.equal(report.config.queueName ?? "geny-perf", "geny-perf");
    console.log("  ✓ config.driver=in-memory 기본값 (세션 66)");
  }

  // 5) 세션 66 — bullmq 경로 가드. REDIS_URL 없으면 안전하게 즉시 실패.
  {
    const savedRedis = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      let threw = null;
      try {
        await runHarness({ jobs: 1, concurrency: 1, smoke: true, driver: "bullmq" });
      } catch (err) {
        threw = err;
      }
      assert.ok(threw, "REDIS_URL 미설정 + driver=bullmq → throw 기대");
      assert.match(String(threw.message ?? threw), /REDIS_URL/);
      console.log("  ✓ driver=bullmq + REDIS_URL 미설정 → 가드 동작 (세션 66)");
    } finally {
      if (savedRedis !== undefined) process.env.REDIS_URL = savedRedis;
    }
  }

  console.log("[perf-harness] ✅ all checks pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
