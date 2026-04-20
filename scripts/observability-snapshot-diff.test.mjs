#!/usr/bin/env node
// scripts/observability-snapshot-diff.test.mjs
// 세션 80 — snapshot diff 파서 + diff 알고리즘 단위 테스트.

import assert from "node:assert/strict";
import { parseExposition, diffExpositions } from "./observability-snapshot-diff.mjs";

// 1) `# TYPE <name>` + `_bucket`/`_sum`/`_count` 접미사 축약 + label key 수집.
{
  const exp = [
    "# TYPE geny_queue_duration_seconds histogram",
    'geny_queue_duration_seconds_bucket{le="0.05",outcome="succeeded",queue_name="q"} 20',
    'geny_queue_duration_seconds_sum{outcome="succeeded",queue_name="q"} 0.1',
    'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="q"} 20',
  ].join("\n");
  const m = parseExposition(exp);
  const entry = m.get("geny_queue_duration_seconds");
  assert.ok(entry, "base name 으로 축약");
  assert.equal(entry.type, "histogram");
  assert.deepEqual([...entry.labelKeys].sort(), ["le", "outcome", "queue_name"]);
  assert.equal(entry.sampleCount, 3, "bucket+sum+count = 3 samples");
  console.log("  ✓ histogram suffix 축약 + label key 수집");
}

// 2) TYPE-only 라인도 metric 으로 인정 (labelKeys 는 비어있음).
{
  const exp = [
    "# HELP geny_queue_failed_total 큐 terminal 실패",
    "# TYPE geny_queue_failed_total counter",
  ].join("\n");
  const m = parseExposition(exp);
  const entry = m.get("geny_queue_failed_total");
  assert.ok(entry, "샘플 없어도 TYPE 선언은 존재");
  assert.equal(entry.type, "counter");
  assert.equal(entry.labelKeys.size, 0);
  assert.equal(entry.sampleCount, 0);
  console.log("  ✓ TYPE-only 는 sampleCount=0 + 빈 labelKeys");
}

// 3) escape 된 label value 안의 쉼표/따옴표 방어.
{
  const exp = 'foo_metric{key1="v1,v2",key2="v3"} 1';
  const m = parseExposition(exp);
  const entry = m.get("foo_metric");
  assert.deepEqual([...entry.labelKeys].sort(), ["key1", "key2"]);
  console.log("  ✓ escape 된 label value 안 쉼표/따옴표 방어");
}

// 4) diff: 동일 → no drift.
{
  const exp = "# TYPE m1 counter\nm1{a=\"1\"} 1\n";
  const a = parseExposition(exp);
  const b = parseExposition(exp);
  const diff = diffExpositions(a, b);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.labelDrift.length, 0);
  console.log("  ✓ 동일 exposition → no drift");
}

// 5) diff: metric added / removed 감지.
{
  const base = parseExposition("# TYPE m1 counter\n# TYPE m2 counter\n");
  const curr = parseExposition("# TYPE m2 counter\n# TYPE m3 counter\n");
  const diff = diffExpositions(base, curr);
  assert.deepEqual(diff.added, ["m3"]);
  assert.deepEqual(diff.removed, ["m1"]);
  console.log("  ✓ added/removed metric 감지");
}

// 6) diff: label key drift 감지 (missing + extra).
{
  const base = parseExposition('# TYPE m1 counter\nm1{a="1",b="2"} 1');
  const curr = parseExposition('# TYPE m1 counter\nm1{a="1",c="3"} 1');
  const diff = diffExpositions(base, curr);
  assert.equal(diff.labelDrift.length, 1);
  assert.equal(diff.labelDrift[0].metric, "m1");
  assert.deepEqual(diff.labelDrift[0].missingKeys, ["b"]);
  assert.deepEqual(diff.labelDrift[0].extraKeys, ["c"]);
  console.log("  ✓ label key missing/extra drift 감지");
}

// 7) diff: sample count delta 는 informational (structural 이 아님).
{
  const base = parseExposition("# TYPE m1 counter\nm1{} 1");
  const curr = parseExposition("# TYPE m1 counter\nm1{} 1\nm1{} 2");
  const diff = diffExpositions(base, curr);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.labelDrift.length, 0);
  assert.equal(diff.sampleCountDelta.length, 1);
  assert.equal(diff.sampleCountDelta[0].metric, "m1");
  assert.equal(diff.sampleCountDelta[0].baseline, 1);
  assert.equal(diff.sampleCountDelta[0].current, 2);
  console.log("  ✓ sample count delta 는 informational");
}

// 8) 실 스냅샷 (session 75) 를 baseline 과 current 양쪽에 넣어 drift 0 확인.
{
  const fs = await import("node:fs");
  const snap = fs.readFileSync("infra/observability/smoke-snapshot-session-75.txt", "utf8");
  const a = parseExposition(snap);
  const b = parseExposition(snap);
  const diff = diffExpositions(a, b);
  assert.equal(diff.added.length, 0);
  assert.equal(diff.removed.length, 0);
  assert.equal(diff.labelDrift.length, 0);
  // 카탈로그 §2.1 + §3 = 8 metrics
  assert.equal(a.size, 8, `expected 8 metrics in smoke-snapshot-session-75, got ${a.size}`);
  console.log(`  ✓ smoke-snapshot-session-75.txt self-diff → 0 drift (${a.size} metrics)`);
}

console.log("[obs-snapshot-diff-test] ✅ all checks pass");
