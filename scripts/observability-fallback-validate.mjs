#!/usr/bin/env node
/**
 * Observability fallback snapshot validator — 세션 84/85.
 *
 * `observability-snapshot-diff.mjs` 가 metric 이름 + label 키 집합의 **구조적** drift 를 보는 반면,
 * 이 스크립트는 **fallback 경로가 실제로 발동됐는지** 를 label 값 + sample 값 레벨로 어서션한다.
 *
 * 두 가지 모드:
 *
 *  - `--expect-hops 1` (기본, 세션 84): nano=1.0 / sdxl=0 / flux-fill=0 결정론 조합에서
 *    전부 nano-banana → sdxl 한 번 폴백 후 성공. 검증 5 축 (아래 1~5).
 *  - `--expect-hops 2` (세션 85): nano=1.0 / sdxl=1.0 / flux-fill=0 + capability=[] + with-mask
 *    조합에서 전부 nano-banana → sdxl → flux-fill 두 번 폴백 후 성공. 검증 7 축
 *    (1-hop 5 축에 hop2 fallback_total + sdxl 5xx call_total 추가).
 *
 * 공통 검증 축 (1-hop 기준):
 *  1) `geny_ai_fallback_total{from_vendor="nano-banana", to_vendor="sdxl", reason="5xx"} >= N`
 *     — 라우터가 nano-banana 실패를 감지 후 sdxl 로 폴백한 횟수.
 *  2) `geny_ai_call_total{status="5xx", vendor="nano-banana"} >= N`
 *     — 5xx 상태 라벨 값이 실제로 등장 (nano-banana 단에서).
 *  3) `geny_ai_call_total{status="success", vendor=<dest>} >= N`
 *     — 폴백 도착지(1-hop: sdxl, 2-hop: flux-fill)가 성공 카운트에 잡힘.
 *  4) `geny_queue_duration_seconds_count{outcome="succeeded"} >= N`
 *     — fallback 성공 잡도 `succeeded` 로 분류되는지 (terminal 성공 계약).
 *  5) `geny_queue_failed_total` sample 없음 (TYPE-only 허용) — 폴백으로 구제되어 터미널 실패 0.
 *
 * 2-hop 추가 검증 축:
 *  6) `geny_ai_fallback_total{from_vendor="sdxl", to_vendor="flux-fill", reason="5xx"} >= N`
 *     — 2 번째 hop fallback 이 label-set 으로 구분돼 방출되는지. 세션 85 전까지는 1 label-set
 *     만 증명됐음 (nano→sdxl). 여기서 **다른 label 조합**이 독립 샘플로 존재해야 함.
 *  7) `geny_ai_call_total{status="5xx", vendor="sdxl"} >= N`
 *     — sdxl 단의 5xx 도 독립 샘플. 2-hop 에서만 등장.
 *
 * 한 줄로 말하면: **fallback 경로(1-hop 또는 2-hop)가 관측 상 "없었던 일" 이 되지 않았음** 을
 * CI 에서 고정.
 *
 * CLI:
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-fallback-session-84.txt [--expect-jobs 20]
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-fallback-session-85-2hop.txt --expect-hops 2
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
    else if (a === "--expect-hops") { out.expectHops = Number(next); i += 1; }
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

/**
 * @param {string} text - Prometheus exposition 전문
 * @param {number} expectJobs - 각 counter 최소값 (N 잡 전부 해당 경로 경유 기대)
 * @param {1|2} hops - fallback hop 수 (1 = 세션 84, 2 = 세션 85)
 */
export function validateFallbackSnapshot(text, expectJobs, hops = 1) {
  const violations = [];
  const report = { hops };
  const destVendor = hops === 2 ? "flux-fill" : "sdxl";

  // 1) hop1: nano → sdxl
  const fallback1 = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "nano-banana", to_vendor: "sdxl", reason: "5xx",
  });
  report.fallback_nano_to_sdxl_5xx = fallback1;
  if (fallback1 === null) {
    violations.push("geny_ai_fallback_total{from_vendor=nano-banana,to_vendor=sdxl,reason=5xx} sample missing");
  } else if (fallback1 < expectJobs) {
    violations.push(`geny_ai_fallback_total{nano→sdxl}=${fallback1} < expected ${expectJobs}`);
  }

  // 2) nano-banana 단의 5xx call_total
  const nanoFail = readSample(text, "geny_ai_call_total", { status: "5xx", vendor: "nano-banana" });
  report.call_total_nano_5xx = nanoFail;
  if (nanoFail === null) {
    violations.push("geny_ai_call_total{status=5xx,vendor=nano-banana} sample missing");
  } else if (nanoFail < expectJobs) {
    violations.push(`geny_ai_call_total{status=5xx,vendor=nano-banana}=${nanoFail} < expected ${expectJobs}`);
  }

  // 3) 도착지 벤더의 success call_total (1-hop: sdxl, 2-hop: flux-fill)
  const destSuccess = readSample(text, "geny_ai_call_total", {
    status: "success", vendor: destVendor,
  });
  report.call_total_dest_success = destSuccess;
  report.dest_vendor = destVendor;
  if (destSuccess === null) {
    violations.push(`geny_ai_call_total{status=success,vendor=${destVendor}} sample missing`);
  } else if (destSuccess < expectJobs) {
    violations.push(`geny_ai_call_total{status=success,vendor=${destVendor}}=${destSuccess} < expected ${expectJobs}`);
  }

  // 4) terminal 성공 카운트
  const queueSucceeded = readSample(text, "geny_queue_duration_seconds_count", { outcome: "succeeded" });
  report.queue_duration_succeeded_count = queueSucceeded;
  if (queueSucceeded === null || queueSucceeded < expectJobs) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=succeeded}=${queueSucceeded} < expected ${expectJobs}`,
    );
  }

  // 5) 터미널 실패 0 — queue_failed_total 은 TYPE-only 여야 함
  const queueFailedSample = hasAnySample(text, "geny_queue_failed_total");
  report.queue_failed_has_sample = queueFailedSample;
  if (queueFailedSample) {
    violations.push("geny_queue_failed_total has samples — expected TYPE-only (no terminal failures)");
  }

  // 6/7) 2-hop 추가 축: sdxl → flux-fill fallback + sdxl 단 5xx
  if (hops === 2) {
    const fallback2 = readSample(text, "geny_ai_fallback_total", {
      from_vendor: "sdxl", to_vendor: "flux-fill", reason: "5xx",
    });
    report.fallback_sdxl_to_flux_5xx = fallback2;
    if (fallback2 === null) {
      violations.push("geny_ai_fallback_total{from_vendor=sdxl,to_vendor=flux-fill,reason=5xx} sample missing");
    } else if (fallback2 < expectJobs) {
      violations.push(`geny_ai_fallback_total{sdxl→flux-fill}=${fallback2} < expected ${expectJobs}`);
    }

    const sdxlFail = readSample(text, "geny_ai_call_total", { status: "5xx", vendor: "sdxl" });
    report.call_total_sdxl_5xx = sdxlFail;
    if (sdxlFail === null) {
      violations.push("geny_ai_call_total{status=5xx,vendor=sdxl} sample missing");
    } else if (sdxlFail < expectJobs) {
      violations.push(`geny_ai_call_total{status=5xx,vendor=sdxl}=${sdxlFail} < expected ${expectJobs}`);
    }
  } else {
    // 1-hop 모드에서는 sdxl 이 성공 경로이므로 별도 alias 유지 (하위호환 — 세션 84 테스트에서 사용).
    report.call_total_sdxl_success = destSuccess;
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
  const hops = args.expectHops === 2 ? 2 : 1;
  const text = readFileSync(args.file, "utf8");
  const { report, violations } = validateFallbackSnapshot(text, expectJobs, hops);
  if (args.verbose) {
    process.stdout.write(`[fallback-validate] report=${JSON.stringify(report)}\n`);
  }
  if (violations.length > 0) {
    process.stderr.write(`[fallback-validate] ❌ ${violations.length} violation(s):\n`);
    for (const v of violations) process.stderr.write(`  - ${v}\n`);
    process.exit(1);
  }
  process.stdout.write(`[fallback-validate] ✅ fallback path observable (hops=${hops}) — ${JSON.stringify(report)}\n`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[fallback-validate] ✖ ${err?.stack ?? err}\n`);
    process.exit(2);
  });
}
