#!/usr/bin/env node
/**
 * Observability fallback snapshot validator — 세션 84.
 *
 * `observability-snapshot-diff.mjs` 가 metric 이름 + label 키 집합의 **구조적** drift 를 보는 반면,
 * 이 스크립트는 **fallback 경로가 실제로 발동됐는지** 를 label 값 + sample 값 레벨로 어서션한다.
 *
 * 검증 대상 (기본값 — `--expect-jobs 20` 로 덮어쓸 수 있음):
 *  1) `geny_ai_fallback_total{from_vendor="nano-banana", to_vendor="sdxl", reason="5xx"} >= N`
 *     — 라우터가 nano-banana 실패를 감지 후 sdxl 로 폴백한 횟수. session-75 Mock 스냅샷에서는
 *     TYPE-only (sample 없음) 였던 것을 본 베이스라인에서는 양수로 증명.
 *  2) `geny_ai_call_total{status="5xx", vendor="nano-banana"} >= N`
 *     — 5xx 상태 라벨 값이 실제로 등장. session-75/83 에서는 status="success" 만.
 *  3) `geny_ai_call_total{status="success", vendor="sdxl"} >= N`
 *     — 폴백 도착지가 성공 카운트에 잡힘.
 *  4) `geny_queue_duration_seconds_count{outcome="succeeded"} >= N`
 *     — fallback 성공 잡도 `succeeded` 로 분류되는지 (terminal 성공 계약).
 *  5) `geny_queue_failed_total` sample 없음 (TYPE-only 허용) — 폴백으로 구제되어 터미널 실패 0.
 *
 * 한 줄로 말하면: **fallback 경로가 관측 상 "없었던 일" 이 되지 않았음** 을 CI 에서 고정.
 *
 * CLI:
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-fallback-session-84.txt [--expect-jobs 20]
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--file") { out.file = next; i += 1; }
    else if (a === "--expect-jobs") { out.expectJobs = Number(next); i += 1; }
    else if (a === "--verbose") { out.verbose = true; }
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

/**
 * Prometheus exposition 에서 metric + label 조합의 샘플 값을 읽는다.
 * 여러 샘플이 있을 때 첫 매치 반환 (본 검증 대상은 모두 단일 샘플).
 */
export function readSample(text, metric, wantLabels = {}) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(\S+)/);
    if (!m) continue;
    const [, name, , labelStr, value] = m;
    if (name !== metric) continue;
    if (!matchesLabels(labelStr, wantLabels)) continue;
    const v = Number(value);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}

function matchesLabels(labelStr, want) {
  if (!labelStr) return Object.keys(want).length === 0;
  const actual = {};
  for (const pair of labelStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"\\]*)"/g)) {
    actual[pair[1]] = pair[2];
  }
  for (const [k, v] of Object.entries(want)) {
    if (actual[k] !== v) return false;
  }
  return true;
}

/**
 * metric 이 exposition 에 어떤 형태로든 등장했는지 — TYPE-only 포함.
 * geny_queue_failed_total 가 TYPE 선언만 있고 샘플은 없어야 한다는 assertion 을 위해 사용.
 */
export function hasAnySample(text, metric) {
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+\S+/);
    if (m && m[1] === metric) return true;
  }
  return false;
}

export function validateFallbackSnapshot(text, expectJobs) {
  const violations = [];
  const report = {};

  const fallback = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "nano-banana", to_vendor: "sdxl", reason: "5xx",
  });
  report.fallback_nano_to_sdxl_5xx = fallback;
  if (fallback === null) {
    violations.push("geny_ai_fallback_total{from_vendor=nano-banana,to_vendor=sdxl,reason=5xx} sample missing");
  } else if (fallback < expectJobs) {
    violations.push(`geny_ai_fallback_total=${fallback} < expected ${expectJobs}`);
  }

  const nanoFail = readSample(text, "geny_ai_call_total", { status: "5xx", vendor: "nano-banana" });
  report.call_total_nano_5xx = nanoFail;
  if (nanoFail === null) {
    violations.push("geny_ai_call_total{status=5xx,vendor=nano-banana} sample missing");
  } else if (nanoFail < expectJobs) {
    violations.push(`geny_ai_call_total{status=5xx,vendor=nano-banana}=${nanoFail} < expected ${expectJobs}`);
  }

  const sdxlSuccess = readSample(text, "geny_ai_call_total", { status: "success", vendor: "sdxl" });
  report.call_total_sdxl_success = sdxlSuccess;
  if (sdxlSuccess === null) {
    violations.push("geny_ai_call_total{status=success,vendor=sdxl} sample missing");
  } else if (sdxlSuccess < expectJobs) {
    violations.push(`geny_ai_call_total{status=success,vendor=sdxl}=${sdxlSuccess} < expected ${expectJobs}`);
  }

  const queueSucceeded = readSample(text, "geny_queue_duration_seconds_count", { outcome: "succeeded" });
  report.queue_duration_succeeded_count = queueSucceeded;
  if (queueSucceeded === null || queueSucceeded < expectJobs) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=succeeded}=${queueSucceeded} < expected ${expectJobs}`,
    );
  }

  const queueFailedSample = hasAnySample(text, "geny_queue_failed_total");
  report.queue_failed_has_sample = queueFailedSample;
  if (queueFailedSample) {
    violations.push("geny_queue_failed_total has samples — expected TYPE-only (no terminal failures)");
  }

  return { report, violations };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.file) {
    process.stderr.write("--file <snapshot.txt> required\n");
    process.exit(2);
  }
  const expectJobs = Number.isFinite(args.expectJobs) ? args.expectJobs : 20;
  const text = readFileSync(args.file, "utf8");
  const { report, violations } = validateFallbackSnapshot(text, expectJobs);
  if (args.verbose) {
    process.stdout.write(`[fallback-validate] report=${JSON.stringify(report)}\n`);
  }
  if (violations.length > 0) {
    process.stderr.write(`[fallback-validate] ❌ ${violations.length} violation(s):\n`);
    for (const v of violations) process.stderr.write(`  - ${v}\n`);
    process.exit(1);
  }
  process.stdout.write(`[fallback-validate] ✅ fallback path observable — ${JSON.stringify(report)}\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[fallback-validate] ✖ ${err?.stack ?? err}\n`);
    process.exit(2);
  });
}
