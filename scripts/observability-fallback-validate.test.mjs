#!/usr/bin/env node
/**
 * observability-fallback-validate 회귀 — 세션 84/85/86.
 *
 * 커버리지 (1-hop, 세션 84):
 *  - 완전한 fallback 스냅샷 → violations=0.
 *  - fallback_total sample 누락 → violation.
 *  - call_total{status=5xx,nano-banana} 누락 → violation.
 *  - sdxl success 누락 → violation.
 *  - queue_duration_count 미달 → violation.
 *  - queue_failed_total 에 sample 있음 → violation (terminal failure 존재).
 *  - readSample: label 집합 exact match 만 허용 (부분 일치 거부).
 *  - hasAnySample: TYPE-only 는 false, sample 있으면 true.
 *
 * 커버리지 (2-hop, 세션 85):
 *  - 완전한 2-hop 스냅샷 → violations=0. hop2 fallback_total + sdxl 5xx call_total 포함.
 *  - hop2 fallback_total 누락 → violation.
 *  - sdxl 5xx call_total 누락 → violation.
 *  - flux-fill success 누락 (2-hop 도착지) → violation.
 *
 * 커버리지 (terminal, 세션 86):
 *  - 완전한 terminal 스냅샷 → violations=0 (3 벤더 5xx + 2 hop fallback + failed=20).
 *  - 개별 축 누락 검증 (nano/sdxl/flux-fill 5xx, fallback hop1/hop2, queue_failed_total,
 *    queue_duration_count{failed}, queue_duration_count{succeeded} 존재).
 *  - status=success sample 이 있으면 violation.
 *  - listSamples: partial label 필터로 multi-vendor 검색.
 */

import assert from "node:assert/strict";
import {
  validateFallbackSnapshot,
  validateTerminalFailureSnapshot,
  readSample,
  hasAnySample,
  listSamples,
} from "./observability-fallback-validate.mjs";

let passed = 0;
let failed = 0;

function check(name, fn) {
  try {
    fn();
    process.stdout.write(`  ✓ ${name}\n`);
    passed += 1;
  } catch (err) {
    process.stdout.write(`  ✖ ${name}\n    ${err?.stack ?? err}\n`);
    failed += 1;
  }
}

const FULL = [
  "# TYPE geny_ai_call_total counter",
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="nano-banana"} 20',
  'geny_ai_call_total{model="0.1.0",stage="generation",status="success",vendor="sdxl"} 20',
  "# TYPE geny_ai_fallback_total counter",
  'geny_ai_fallback_total{from_vendor="nano-banana",reason="5xx",to_vendor="sdxl"} 20',
  "# TYPE geny_queue_duration_seconds histogram",
  'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="x"} 20',
  "# TYPE geny_queue_failed_total counter",
  "",
].join("\n");

process.stdout.write("[fallback-validate-test] start\n");

check("full fallback snapshot → 0 violations", () => {
  const { violations, report } = validateFallbackSnapshot(FULL, 20);
  assert.deepEqual(violations, []);
  assert.equal(report.fallback_nano_to_sdxl_5xx, 20);
  assert.equal(report.call_total_nano_5xx, 20);
  assert.equal(report.call_total_sdxl_success, 20);
  assert.equal(report.queue_duration_succeeded_count, 20);
  assert.equal(report.queue_failed_has_sample, false);
});

check("fallback_total sample 누락 → violation", () => {
  const text = FULL.replace(/geny_ai_fallback_total\{.*\n/, "");
  const { violations } = validateFallbackSnapshot(text, 20);
  assert.ok(violations.some((v) => v.includes("geny_ai_fallback_total") && v.includes("missing")));
});

check("nano-banana 5xx 누락 → violation", () => {
  const text = FULL.replace(/geny_ai_call_total\{[^}]*status="5xx"[^}]*\}.*\n/, "");
  const { violations } = validateFallbackSnapshot(text, 20);
  assert.ok(violations.some((v) => v.includes("status=5xx,vendor=nano-banana") && v.includes("missing")));
});

check("sdxl success 누락 → violation", () => {
  const text = FULL.replace(/geny_ai_call_total\{[^}]*status="success"[^}]*\}.*\n/, "");
  const { violations } = validateFallbackSnapshot(text, 20);
  assert.ok(violations.some((v) => v.includes("status=success,vendor=sdxl") && v.includes("missing")));
});

check("queue_duration_count 미달 → violation", () => {
  const text = FULL.replace(
    'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="x"} 20',
    'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="x"} 10',
  );
  const { violations } = validateFallbackSnapshot(text, 20);
  assert.ok(violations.some((v) => v.includes("geny_queue_duration_seconds_count") && v.includes("< expected 20")));
});

check("queue_failed_total 에 sample 있음 → violation", () => {
  const text = FULL.replace(
    "# TYPE geny_queue_failed_total counter",
    "# TYPE geny_queue_failed_total counter\ngeny_queue_failed_total{queue_name=\"x\",reason=\"other\"} 3",
  );
  const { violations, report } = validateFallbackSnapshot(text, 20);
  assert.equal(report.queue_failed_has_sample, true);
  assert.ok(violations.some((v) => v.includes("geny_queue_failed_total has samples")));
});

check("readSample: label exact match만 허용", () => {
  // want={from_vendor:nano-banana, to_vendor:sdxl, reason:5xx} 에서 reason 만 틀린 샘플은 매치 안 됨.
  const text = 'geny_ai_fallback_total{from_vendor="nano-banana",reason="timeout",to_vendor="sdxl"} 7';
  const v = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "nano-banana", to_vendor: "sdxl", reason: "5xx",
  });
  assert.equal(v, null);
});

check("readSample: 부분 라벨로 쿼리 가능 (want 에 없는 키는 무시)", () => {
  const text = 'geny_ai_call_total{model="0.1.0",status="success",vendor="sdxl",stage="generation"} 42';
  const v = readSample(text, "geny_ai_call_total", { status: "success", vendor: "sdxl" });
  assert.equal(v, 42);
});

check("hasAnySample: TYPE-only → false, sample 있음 → true", () => {
  const typeOnly = "# TYPE geny_queue_failed_total counter\n";
  assert.equal(hasAnySample(typeOnly, "geny_queue_failed_total"), false);
  const withSample = typeOnly + 'geny_queue_failed_total{queue_name="x",reason="other"} 1\n';
  assert.equal(hasAnySample(withSample, "geny_queue_failed_total"), true);
});

// ── 2-hop (세션 85) — nano → sdxl → flux-fill 체인 ──

const FULL_2HOP = [
  "# TYPE geny_ai_call_total counter",
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="nano-banana"} 20',
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="sdxl"} 20',
  'geny_ai_call_total{model="0.1.0",stage="generation",status="success",vendor="flux-fill"} 20',
  "# TYPE geny_ai_fallback_total counter",
  'geny_ai_fallback_total{from_vendor="nano-banana",reason="5xx",to_vendor="sdxl"} 20',
  'geny_ai_fallback_total{from_vendor="sdxl",reason="5xx",to_vendor="flux-fill"} 20',
  "# TYPE geny_queue_duration_seconds histogram",
  'geny_queue_duration_seconds_count{outcome="succeeded",queue_name="x"} 20',
  "# TYPE geny_queue_failed_total counter",
  "",
].join("\n");

check("2-hop full snapshot → 0 violations", () => {
  const { violations, report } = validateFallbackSnapshot(FULL_2HOP, 20, 2);
  assert.deepEqual(violations, []);
  assert.equal(report.hops, 2);
  assert.equal(report.fallback_nano_to_sdxl_5xx, 20);
  assert.equal(report.fallback_sdxl_to_flux_5xx, 20);
  assert.equal(report.call_total_nano_5xx, 20);
  assert.equal(report.call_total_sdxl_5xx, 20);
  assert.equal(report.call_total_dest_success, 20);
  assert.equal(report.dest_vendor, "flux-fill");
  assert.equal(report.queue_duration_succeeded_count, 20);
  assert.equal(report.queue_failed_has_sample, false);
});

check("2-hop: hop2 fallback_total 누락 → violation", () => {
  const text = FULL_2HOP.replace(
    /geny_ai_fallback_total\{from_vendor="sdxl"[^\n]*\n/,
    "",
  );
  const { violations } = validateFallbackSnapshot(text, 20, 2);
  assert.ok(
    violations.some((v) => v.includes("from_vendor=sdxl") && v.includes("missing")),
    `expected hop2 missing violation, got: ${JSON.stringify(violations)}`,
  );
});

check("2-hop: sdxl 5xx call_total 누락 → violation", () => {
  const text = FULL_2HOP.replace(
    /geny_ai_call_total\{[^}]*status="5xx"[^}]*vendor="sdxl"[^}]*\}[^\n]*\n/,
    "",
  );
  const { violations } = validateFallbackSnapshot(text, 20, 2);
  assert.ok(
    violations.some((v) => v.includes("status=5xx,vendor=sdxl") && v.includes("missing")),
    `expected sdxl 5xx missing violation, got: ${JSON.stringify(violations)}`,
  );
});

check("2-hop: flux-fill success 누락 → violation (dest=flux-fill)", () => {
  const text = FULL_2HOP.replace(
    /geny_ai_call_total\{[^}]*status="success"[^}]*vendor="flux-fill"[^}]*\}[^\n]*\n/,
    "",
  );
  const { violations, report } = validateFallbackSnapshot(text, 20, 2);
  assert.equal(report.dest_vendor, "flux-fill");
  assert.ok(
    violations.some((v) => v.includes("status=success,vendor=flux-fill") && v.includes("missing")),
    `expected flux-fill success missing violation, got: ${JSON.stringify(violations)}`,
  );
});

check("1-hop baseline(FULL)은 2-hop 모드로 돌리면 hop2 + sdxl 5xx 둘 다 violation", () => {
  // FULL (세션 84 1-hop) 은 flux-fill 성공/sdxl 5xx 샘플이 없음 → 2-hop 모드에서 3종 위반 기대
  const { violations } = validateFallbackSnapshot(FULL, 20, 2);
  assert.ok(violations.some((v) => v.includes("from_vendor=sdxl") && v.includes("missing")));
  assert.ok(violations.some((v) => v.includes("status=5xx,vendor=sdxl") && v.includes("missing")));
  // dest 은 flux-fill 인데 FULL 에는 sdxl success 만 → flux-fill success 도 missing
  assert.ok(violations.some((v) => v.includes("vendor=flux-fill") && v.includes("missing")));
});

// ── terminal failure (세션 86) — nano=sdxl=flux-fill=1.0 체인 끝에서도 실패 ──

const FULL_TERMINAL = [
  "# TYPE geny_ai_call_total counter",
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="nano-banana"} 20',
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="sdxl"} 20',
  'geny_ai_call_total{model="0.1.0",stage="generation",status="5xx",vendor="flux-fill"} 20',
  "# TYPE geny_ai_fallback_total counter",
  'geny_ai_fallback_total{from_vendor="nano-banana",reason="5xx",to_vendor="sdxl"} 20',
  'geny_ai_fallback_total{from_vendor="sdxl",reason="5xx",to_vendor="flux-fill"} 20',
  "# TYPE geny_queue_duration_seconds histogram",
  'geny_queue_duration_seconds_count{outcome="failed",queue_name="x"} 20',
  "# TYPE geny_queue_failed_total counter",
  'geny_queue_failed_total{queue_name="x",reason="ai_5xx"} 20',
  "",
].join("\n");

check("terminal full snapshot → 0 violations", () => {
  const { violations, report } = validateTerminalFailureSnapshot(FULL_TERMINAL, 20);
  assert.deepEqual(violations, [], `unexpected: ${JSON.stringify(violations)}`);
  assert.equal(report.mode, "terminal-failure");
  assert.equal(report.fallback_nano_to_sdxl_5xx, 20);
  assert.equal(report.fallback_sdxl_to_flux_5xx, 20);
  assert.equal(report.call_total_nano_banana_5xx, 20);
  assert.equal(report.call_total_sdxl_5xx, 20);
  assert.equal(report.call_total_flux_fill_5xx, 20);
  assert.equal(report.call_total_success_sample_count, 0);
  assert.equal(report.queue_duration_failed_count, 20);
  assert.equal(report.queue_duration_succeeded_count, null);
  assert.equal(report.queue_failed_total_ai_5xx, 20);
});

check("terminal: flux-fill 5xx 누락 → violation (nano/sdxl 은 있음)", () => {
  const text = FULL_TERMINAL.replace(
    /geny_ai_call_total\{[^}]*status="5xx"[^}]*vendor="flux-fill"[^}]*\}[^\n]*\n/,
    "",
  );
  const { violations } = validateTerminalFailureSnapshot(text, 20);
  assert.ok(
    violations.some((v) => v.includes("status=5xx,vendor=flux-fill") && v.includes("missing")),
    `expected flux-fill 5xx missing violation, got: ${JSON.stringify(violations)}`,
  );
});

check("terminal: queue_failed_total{ai_5xx} 누락 → violation", () => {
  const text = FULL_TERMINAL.replace(
    /geny_queue_failed_total\{[^}]*reason="ai_5xx"[^}]*\}[^\n]*\n/,
    "",
  );
  const { violations } = validateTerminalFailureSnapshot(text, 20);
  assert.ok(
    violations.some((v) => v.includes("geny_queue_failed_total{reason=ai_5xx}") && v.includes("missing")),
    `expected queue_failed_total missing violation, got: ${JSON.stringify(violations)}`,
  );
});

check("terminal: success 샘플 있으면 violation", () => {
  // sdxl 이 20잡 중 5잡을 성공했다고 가정
  const text = FULL_TERMINAL.replace(
    "# TYPE geny_ai_fallback_total counter",
    'geny_ai_call_total{model="0.1.0",stage="generation",status="success",vendor="sdxl"} 5\n# TYPE geny_ai_fallback_total counter',
  );
  const { violations, report } = validateTerminalFailureSnapshot(text, 20);
  assert.equal(report.call_total_success_sample_count, 1);
  assert.ok(
    violations.some((v) => v.includes("status=success") && v.includes("sdxl")),
    `expected success violation, got: ${JSON.stringify(violations)}`,
  );
});

check("terminal: queue_duration_count{failed} 미달 → violation", () => {
  const text = FULL_TERMINAL.replace(
    'geny_queue_duration_seconds_count{outcome="failed",queue_name="x"} 20',
    'geny_queue_duration_seconds_count{outcome="failed",queue_name="x"} 15',
  );
  const { violations } = validateTerminalFailureSnapshot(text, 20);
  assert.ok(
    violations.some((v) => v.includes("outcome=failed") && v.includes("< expected 20")),
    `expected failed < expected violation, got: ${JSON.stringify(violations)}`,
  );
});

check("terminal: queue_duration_count{succeeded}>0 → violation", () => {
  const text = FULL_TERMINAL.replace(
    'geny_queue_duration_seconds_count{outcome="failed",queue_name="x"} 20',
    'geny_queue_duration_seconds_count{outcome="failed",queue_name="x"} 20\ngeny_queue_duration_seconds_count{outcome="succeeded",queue_name="x"} 1',
  );
  const { violations } = validateTerminalFailureSnapshot(text, 20);
  assert.ok(
    violations.some((v) => v.includes("outcome=succeeded") && v.includes("expected TYPE-only or 0")),
    `expected succeeded>0 violation, got: ${JSON.stringify(violations)}`,
  );
});

check("terminal: hop1 fallback 누락 → violation", () => {
  const text = FULL_TERMINAL.replace(
    /geny_ai_fallback_total\{from_vendor="nano-banana"[^\n]*\n/,
    "",
  );
  const { violations } = validateTerminalFailureSnapshot(text, 20);
  assert.ok(violations.some((v) => v.includes("nano→sdxl") && v.includes("missing")));
});

check("listSamples: partial label 로 multi-vendor success 샘플 열거", () => {
  const text = [
    'geny_ai_call_total{status="success",vendor="nano-banana"} 10',
    'geny_ai_call_total{status="success",vendor="sdxl"} 5',
    'geny_ai_call_total{status="5xx",vendor="flux-fill"} 3',
  ].join("\n");
  const got = listSamples(text, "geny_ai_call_total", { status: "success" });
  assert.equal(got.length, 2);
  const vendors = got.map((s) => s.labels.vendor).sort();
  assert.deepEqual(vendors, ["nano-banana", "sdxl"]);
});

check("terminal: 2-hop baseline 을 terminal 모드로 돌리면 flux-fill 5xx / failed / ai_5xx 전부 violation", () => {
  // FULL_2HOP 은 flux-fill 성공 + queue_failed=TYPE-only + queue_duration succeeded=20
  // → terminal 모드에서는 여러 축 위반 기대.
  const { violations } = validateTerminalFailureSnapshot(FULL_2HOP, 20);
  assert.ok(violations.some((v) => v.includes("status=5xx,vendor=flux-fill") && v.includes("missing")));
  assert.ok(violations.some((v) => v.includes("geny_queue_failed_total{reason=ai_5xx}") && v.includes("missing")));
  assert.ok(violations.some((v) => v.includes("outcome=failed")));
  assert.ok(violations.some((v) => v.includes("status=success")));
});

process.stdout.write(`\n[fallback-validate-test] passed=${passed} failed=${failed}\n`);
if (failed > 0) process.exit(1);
