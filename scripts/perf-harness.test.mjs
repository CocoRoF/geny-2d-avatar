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

import { runHarness, parseMetrics, parseTargetUrl } from "./perf-harness.mjs";

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

  // 6) 세션 72 — parseMetrics 파서: bullmq 경로 /metrics 스크레이프 계약.
  //    enqueued_total 과 depth{state=...} 둘 다 queue_name 라벨로 필터링 돼야 함.
  {
    const sample = [
      "# HELP geny_queue_enqueued_total 큐 투입",
      "# TYPE geny_queue_enqueued_total counter",
      'geny_queue_enqueued_total{queue_name="other"} 7',
      'geny_queue_enqueued_total{queue_name="geny-perf-72"} 100',
      "# HELP geny_queue_depth BullMQ depth",
      "# TYPE geny_queue_depth gauge",
      'geny_queue_depth{queue_name="geny-perf-72",state="waiting"} 0',
      'geny_queue_depth{queue_name="geny-perf-72",state="active"} 3',
      'geny_queue_depth{queue_name="geny-perf-72",state="completed"} 97',
      'geny_queue_depth{queue_name="other",state="waiting"} 42',
      "",
    ].join("\n");

    const got = parseMetrics(sample, { queueName: "geny-perf-72" });
    assert.equal(got.enqueued_total, 100, "queue_name 라벨로 정확히 분기돼야 함");
    assert.deepEqual(
      got.depth,
      { waiting: 0, active: 3, completed: 97 },
      `depth: ${JSON.stringify(got.depth)}`,
    );

    // queue 가 없으면 그 섹션 자체가 생략.
    const miss = parseMetrics("# nothing matching\n", { queueName: "geny-perf-72" });
    assert.equal(miss.enqueued_total, undefined);
    assert.equal(miss.depth, undefined);
    console.log("  ✓ parseMetrics — enqueued_total + depth{state=*} label 필터링 (세션 72)");
  }

  // 7) 세션 73 — parseTargetUrl: http(s) 스킴 + 포트 디폴트 + 오입력 방어.
  {
    assert.deepEqual(
      parseTargetUrl("http://127.0.0.1:9091"),
      { host: "127.0.0.1", port: 9091 },
    );
    assert.deepEqual(
      parseTargetUrl("http://producer.internal/"),
      { host: "producer.internal", port: 80 },
    );
    assert.deepEqual(
      parseTargetUrl("https://producer.example/"),
      { host: "producer.example", port: 443 },
    );
    assert.throws(() => parseTargetUrl("ftp://nope"), /--target-url 은 http/);
    assert.throws(() => parseTargetUrl("not a url"), /--target-url 파싱 실패/);
    console.log("  ✓ parseTargetUrl — http(s) + port 디폴트 + 오입력 throw (세션 73)");
  }

  console.log("[perf-harness] ✅ all checks pass");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
