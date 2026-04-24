#!/usr/bin/env node
// scripts/observability-smoke.test.mjs
// 세션 76 — observability-smoke 파서 단위 테스트.

import assert from "node:assert/strict";
import { extractMetricNames, readSampleValue } from "./observability-smoke.mjs";

// 1) `# TYPE <name> <kind>` 라인만으로도 "노출됨" 으로 간주 — 0건 counter/fallback 메트릭 보호.
{
  const exp = [
    "# HELP geny_queue_failed_total 큐 terminal 실패",
    "# TYPE geny_queue_failed_total counter",
    "",
  ].join("\n");
  const names = extractMetricNames(exp);
  assert.ok(names.has("geny_queue_failed_total"), "TYPE 라인만 있어도 노출로 간주");
  assert.equal(names.size, 1, "HELP 는 이름 집합에 영향 없음");
  console.log("  ✓ TYPE-only 라인이 노출로 간주");
}

// 2) 히스토그램 `_bucket`/`_sum`/`_count` 접미사가 base name 으로 축약.
{
  const exp = [
    "# TYPE geny_queue_duration_seconds histogram",
    'geny_queue_duration_seconds_bucket{le="0.05",outcome="succeeded",queue_name="q"} 20',
    'geny_queue_duration_seconds_bucket{le="+Inf",outcome="succeeded",queue_name="q"} 20',
    'geny_queue_duration_seconds_sum{outcome="succeeded",queue_name="q"} 0.062',
    'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="q"} 20',
  ].join("\n");
  const names = extractMetricNames(exp);
  assert.ok(names.has("geny_queue_duration_seconds"), "base name 포함");
  assert.ok(!names.has("geny_queue_duration_seconds_bucket"), "_bucket 접미사 제거");
  assert.ok(!names.has("geny_queue_duration_seconds_sum"), "_sum 접미사 제거");
  assert.ok(!names.has("geny_queue_duration_seconds_count"), "_count 접미사 제거");
  assert.equal(names.size, 1, "다섯 라인이 하나의 base name 으로 축약");
  console.log("  ✓ _bucket/_sum/_count 접미사 축약");
}

// 3) label filter 가 정확히 일치하는 샘플 value 를 반환.
{
  const exp = [
    "# TYPE geny_ai_call_total counter",
    'geny_ai_call_total{model="0.1.0",stage="generation",status="success",vendor="nano-banana"} 20',
    'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="nano-banana"} 3',
  ].join("\n");
  const success = readSampleValue(exp, "geny_ai_call_total", { status: "success" });
  assert.equal(success, 20, "status=success 필터로 20 반환");
  const fiveXx = readSampleValue(exp, "geny_ai_call_total", { status: "5xx" });
  assert.equal(fiveXx, 3, "status=5xx 필터로 3 반환");
  console.log("  ✓ label filter exact match");
}

// 4) label filter 불일치 시 null.
{
  const exp = [
    "# TYPE geny_queue_depth gauge",
    'geny_queue_depth{queue_name="q-a",state="waiting"} 5',
  ].join("\n");
  const miss = readSampleValue(exp, "geny_queue_depth", { queue_name: "q-b" });
  assert.equal(miss, null, "라벨 불일치 시 null");
  console.log("  ✓ label filter 불일치 시 null");
}

// 5) 메트릭 이름 자체가 없으면 null.
{
  const exp = '# TYPE geny_queue_depth gauge\ngeny_queue_depth{queue_name="q"} 0\n';
  const v = readSampleValue(exp, "geny_does_not_exist");
  assert.equal(v, null, "부재 메트릭은 null");
  console.log("  ✓ 부재 메트릭은 null");
}

// 6) 여러 샘플 — 라벨 필터 미지정 시 첫 샘플 반환 (결정적).
{
  const exp = [
    "# TYPE geny_queue_enqueued_total counter",
    'geny_queue_enqueued_total{queue_name="q-a"} 10',
    'geny_queue_enqueued_total{queue_name="q-b"} 20',
  ].join("\n");
  const v = readSampleValue(exp, "geny_queue_enqueued_total");
  assert.equal(v, 10, "첫 매치 샘플 반환");
  console.log("  ✓ 다중 샘플 — 첫 매치 반환");
}

// 7) producer+consumer 합쳐진 실 fixture 와 유사한 케이스 — 8종 union 추출 검증.
{
  const producerExp = [
    "# TYPE geny_ai_call_total counter",
    "# TYPE geny_ai_call_duration_seconds histogram",
    "# TYPE geny_ai_call_cost_usd counter",
    "# TYPE geny_ai_fallback_total counter",
    "# TYPE geny_queue_depth gauge",
    'geny_queue_depth{queue_name="q",state="waiting"} 0',
    "# TYPE geny_queue_enqueued_total counter",
    'geny_queue_enqueued_total{queue_name="q"} 20',
  ].join("\n");
  const consumerExp = [
    "# TYPE geny_ai_call_total counter",
    'geny_ai_call_total{status="success",vendor="v"} 20',
    "# TYPE geny_queue_duration_seconds histogram",
    'geny_queue_duration_seconds_bucket{le="+Inf",outcome="succeeded",queue_name="q"} 20',
    'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="q"} 20',
    "# TYPE geny_queue_failed_total counter",
  ].join("\n");
  const union = new Set([...extractMetricNames(producerExp), ...extractMetricNames(consumerExp)]);
  for (const m of [
    "geny_queue_depth",
    "geny_queue_enqueued_total",
    "geny_queue_failed_total",
    "geny_queue_duration_seconds",
    "geny_ai_call_total",
    "geny_ai_call_duration_seconds",
    "geny_ai_call_cost_usd",
    "geny_ai_fallback_total",
  ]) {
    assert.ok(union.has(m), `union missing ${m}`);
  }
  console.log("  ✓ producer+consumer union 8종 커버 (카탈로그 §2.1 + §3)");
}

console.log("[obs-smoke-test] ✅ all checks pass");
