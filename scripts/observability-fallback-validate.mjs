#!/usr/bin/env node
/**
 * Observability fallback snapshot validator — 세션 84/85/86.
 *
 * `observability-snapshot-diff.mjs` 가 metric 이름 + label 키 집합의 **구조적** drift 를 보는 반면,
 * 이 스크립트는 **fallback 경로가 실제로 발동됐는지** 를 label 값 + sample 값 레벨로 어서션한다.
 *
 * 네 가지 모드:
 *
 *  - `--expect-hops 1` (기본, 세션 84): nano=1.0 / sdxl=0 / flux-fill=0 결정론 조합에서
 *    전부 nano-banana → sdxl 한 번 폴백 후 성공. 검증 5 축 (아래 1~5).
 *  - `--expect-hops 2` (세션 85): nano=1.0 / sdxl=1.0 / flux-fill=0 + capability=[] + with-mask
 *    조합에서 전부 nano-banana → sdxl → flux-fill 두 번 폴백 후 성공. 검증 7 축
 *    (1-hop 5 축에 hop2 fallback_total + sdxl 5xx call_total 추가).
 *  - `--expect-terminal-failure` (세션 86): nano=1.0 / sdxl=1.0 / flux-fill=1.0 + capability=[]
 *    + with-mask 조합에서 전부 3-hop 체인 끝에서 실패 → `routeWithFallback` 이 마지막 에러
 *    (VENDOR_ERROR_5XX) 를 throw 하고 consumer `processWithMetrics` 가 `queue_failed_total{
 *    reason=ai_5xx}` + `queue_duration_seconds{outcome=failed}` 를 emit. 검증 9 축 (아래 1~9).
 *    hops 와 직교하는 독립 모드: 성공/실패 계약이 대칭 반전되므로 assertion shape 완전 교체.
 *  - `--expect-unsafe` (세션 88): consumer `--safety-preset block-vendors:nano-banana` +
 *    전 벤더 성공(fail-rate=0). nano-banana 의 결과만 SafetyFilter 가 차단 → UNSAFE_CONTENT 기록 후
 *    sdxl 폴백 성공. `reason="5xx"` 가 아닌 `reason="unsafe"` label-set 으로 fallback_total 이
 *    떠야 한다는 점이 hop1 5xx 모드와의 본질적 차이. 검증 5 축 (아래 U1~U5).
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
 * UNSAFE 검증 축 (unsafe 모드, 세션 88 — hop1 5xx 와 구조 동형이되 reason/status 만 교체):
 *  U1) `geny_ai_fallback_total{from_vendor="nano-banana", to_vendor="sdxl", reason="unsafe"} >= N`
 *      — fallback 사유가 5xx 가 아니라 "unsafe" 로 분류돼야 한다 (routeWithFallback:173).
 *  U2) `geny_ai_call_total{status="unsafe", vendor="nano-banana"} >= N`
 *      — status 라벨이 "unsafe" 로 등장 (routeWithFallback:165, metrics.ts AdapterCallStatus).
 *  U3) `geny_ai_call_total{status="success", vendor="sdxl"} >= N`
 *      — 폴백 도착지 sdxl 이 성공.
 *  U4) `geny_queue_duration_seconds_count{outcome="succeeded"} >= N`
 *      — 잡 레벨에서는 성공으로 분류 (sdxl 이 결과를 반환했으므로).
 *  U5) `geny_queue_failed_total` TYPE-only — terminal 실패 0.
 *
 * 터미널 실패 검증 축 (terminal 모드, 2-hop 과 독립):
 *  T1) `geny_ai_fallback_total{nano-banana→sdxl, 5xx} >= N` (공통 hop1)
 *  T2) `geny_ai_fallback_total{sdxl→flux-fill, 5xx} >= N` (공통 hop2 — 3개 후보 전부 시도)
 *  T3) `geny_ai_call_total{5xx, nano-banana} >= N`
 *  T4) `geny_ai_call_total{5xx, sdxl} >= N`
 *  T5) `geny_ai_call_total{5xx, flux-fill} >= N` (세션 86 추가 — flux-fill 도 실패)
 *  T6) `geny_ai_call_total{status="success", vendor=*}` 전부 부재 — 어떤 벤더도 성공 X
 *  T7) `geny_queue_duration_seconds_count{outcome="failed"} >= N` — terminal 실패 카운트
 *  T8) `geny_queue_duration_seconds_count{outcome="succeeded"}` 부재 (TYPE-only) — 성공 0
 *  T9) `geny_queue_failed_total{reason="ai_5xx"} >= N` — `defaultClassifyQueueError` 가
 *      `VENDOR_ERROR_5XX` → `ai_5xx` 정규화 (processor-metrics.ts §defaultClassifyQueueError).
 *
 * 한 줄로 말하면: **fallback 경로(1-hop / 2-hop / terminal)가 관측 상 "없었던 일" 이 되지 않았음** 을
 * CI 에서 고정.
 *
 * CLI:
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-fallback-session-84.txt [--expect-jobs 20]
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-fallback-session-85-2hop.txt --expect-hops 2
 *   node scripts/observability-fallback-validate.mjs \
 *     --file infra/observability/smoke-snapshot-terminal-session-86.txt --expect-terminal-failure
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
    else if (a === "--expect-terminal-failure") { out.expectTerminalFailure = true; }
    else if (a === "--expect-unsafe") { out.expectUnsafe = true; }
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
 * metric + partial label filter 에 매치하는 **모든** 샘플의 label 맵 배열.
 * 터미널 실패 모드에서 `call_total{status="success", vendor=*}` 부재 검증에 사용 —
 * 어떤 vendor 도 status=success 레이블로 샘플이 없어야 한다.
 */
export function listSamples(text, metric, wantLabels = {}) {
  const out = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{([^}]*)\})?\s+(\S+)/);
    if (!m) continue;
    const [, name, , labelStr, value] = m;
    if (name !== metric) continue;
    if (!matchesLabels(labelStr, wantLabels)) continue;
    const labels = {};
    if (labelStr) {
      for (const pair of labelStr.matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"\\]*)"/g)) {
        labels[pair[1]] = pair[2];
      }
    }
    out.push({ labels, value: Number(value) });
  }
  return out;
}

/**
 * @param {string} text - Prometheus exposition 전문
 * @param {number} expectJobs - 각 counter 최소값 (N 잡 전부 해당 경로 경유 기대)
 * @param {1|2} hops - fallback hop 수 (1 = 세션 84, 2 = 세션 85)
 */
export function validateFallbackSnapshot(text, expectJobs, hops = 1) {
  const violations = [];
  const report = { mode: `hops-${hops}`, hops };
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

/**
 * 터미널 실패 모드 검증 — 세션 86. nano=sdxl=flux-fill=1.0 per-endpoint fail-rate +
 * capability=[] + with-mask 조합에서 3 후보 전부 실패 → `routeWithFallback` 이 마지막 에러를
 * rethrow → consumer `processWithMetrics` 가 `queue_failed_total{reason=ai_5xx}` emit.
 *
 * assertion 계약이 hops 모드와 대칭 반전 (success → failure / absent → present) 이므로
 * `validateFallbackSnapshot` 분기 대신 독립 함수로 분리.
 *
 * @param {string} text
 * @param {number} expectJobs
 */
export function validateTerminalFailureSnapshot(text, expectJobs) {
  const violations = [];
  const report = { mode: "terminal-failure" };

  // T1, T2) hop1 + hop2 fallback 전부 발동
  const fallback1 = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "nano-banana", to_vendor: "sdxl", reason: "5xx",
  });
  report.fallback_nano_to_sdxl_5xx = fallback1;
  if (fallback1 === null) {
    violations.push("geny_ai_fallback_total{nano→sdxl,5xx} sample missing");
  } else if (fallback1 < expectJobs) {
    violations.push(`geny_ai_fallback_total{nano→sdxl}=${fallback1} < expected ${expectJobs}`);
  }

  const fallback2 = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "sdxl", to_vendor: "flux-fill", reason: "5xx",
  });
  report.fallback_sdxl_to_flux_5xx = fallback2;
  if (fallback2 === null) {
    violations.push("geny_ai_fallback_total{sdxl→flux-fill,5xx} sample missing");
  } else if (fallback2 < expectJobs) {
    violations.push(`geny_ai_fallback_total{sdxl→flux-fill}=${fallback2} < expected ${expectJobs}`);
  }

  // T3, T4, T5) 3 벤더 전부 5xx call_total
  for (const vendor of ["nano-banana", "sdxl", "flux-fill"]) {
    const v = readSample(text, "geny_ai_call_total", { status: "5xx", vendor });
    report[`call_total_${vendor.replace("-", "_")}_5xx`] = v;
    if (v === null) {
      violations.push(`geny_ai_call_total{status=5xx,vendor=${vendor}} sample missing`);
    } else if (v < expectJobs) {
      violations.push(`geny_ai_call_total{status=5xx,vendor=${vendor}}=${v} < expected ${expectJobs}`);
    }
  }

  // T6) 어떤 벤더도 status=success 샘플이 있으면 안 됨
  const successSamples = listSamples(text, "geny_ai_call_total", { status: "success" });
  report.call_total_success_sample_count = successSamples.length;
  if (successSamples.length > 0) {
    const vendors = successSamples.map((s) => s.labels.vendor ?? "?").join(",");
    violations.push(
      `geny_ai_call_total{status=success} has samples for vendor(s)=${vendors} — expected none (terminal failure)`,
    );
  }

  // T7) terminal 실패 카운트
  const queueFailed = readSample(text, "geny_queue_duration_seconds_count", { outcome: "failed" });
  report.queue_duration_failed_count = queueFailed;
  if (queueFailed === null || queueFailed < expectJobs) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=failed}=${queueFailed} < expected ${expectJobs}`,
    );
  }

  // T8) succeeded 카운트 부재 (TYPE-only 또는 0 허용 — 샘플이 있어도 값이 0 이면 통과)
  const queueSucceeded = readSample(text, "geny_queue_duration_seconds_count", { outcome: "succeeded" });
  report.queue_duration_succeeded_count = queueSucceeded;
  if (queueSucceeded !== null && queueSucceeded > 0) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=succeeded}=${queueSucceeded} > 0 — expected TYPE-only or 0`,
    );
  }

  // T9) queue_failed_total{reason=ai_5xx}
  // `defaultClassifyQueueError` 가 `VENDOR_ERROR_5XX` → "ai_5xx" 로 정규화 (packages/job-queue-bullmq/
  //  src/processor-metrics.ts §defaultClassifyQueueError).
  const queueFailedReason = readSample(text, "geny_queue_failed_total", { reason: "ai_5xx" });
  report.queue_failed_total_ai_5xx = queueFailedReason;
  if (queueFailedReason === null) {
    violations.push("geny_queue_failed_total{reason=ai_5xx} sample missing");
  } else if (queueFailedReason < expectJobs) {
    violations.push(
      `geny_queue_failed_total{reason=ai_5xx}=${queueFailedReason} < expected ${expectJobs}`,
    );
  }

  return { report, violations };
}

/**
 * UNSAFE_CONTENT 폴백 검증 — 세션 88. consumer `--safety-preset block-vendors:nano-banana`
 * + 전 벤더 fail-rate=0 조합. routeWithFallback 가 nano-banana 결과를 safety.check → allowed=false
 * 로 받아 status="unsafe" / reason="unsafe" 라벨로 메트릭 emit 후 sdxl 폴백 성공.
 *
 * hop1 5xx (validateFallbackSnapshot) 와 구조 동형이되, reason/status 두 라벨만 "5xx" → "unsafe" 로
 * 교체된 형태. 별도 함수로 분리한 이유는 의미론적 구별을 테스트 레벨에서 보존하기 위함.
 *
 * @param {string} text
 * @param {number} expectJobs
 */
export function validateUnsafeSnapshot(text, expectJobs) {
  const violations = [];
  const report = { mode: "unsafe" };

  // U1) fallback_total{nano→sdxl, reason=unsafe}
  const fallback = readSample(text, "geny_ai_fallback_total", {
    from_vendor: "nano-banana", to_vendor: "sdxl", reason: "unsafe",
  });
  report.fallback_nano_to_sdxl_unsafe = fallback;
  if (fallback === null) {
    violations.push("geny_ai_fallback_total{from_vendor=nano-banana,to_vendor=sdxl,reason=unsafe} sample missing");
  } else if (fallback < expectJobs) {
    violations.push(`geny_ai_fallback_total{nano→sdxl,unsafe}=${fallback} < expected ${expectJobs}`);
  }

  // U2) call_total{status=unsafe, vendor=nano-banana}
  const nanoUnsafe = readSample(text, "geny_ai_call_total", { status: "unsafe", vendor: "nano-banana" });
  report.call_total_nano_unsafe = nanoUnsafe;
  if (nanoUnsafe === null) {
    violations.push("geny_ai_call_total{status=unsafe,vendor=nano-banana} sample missing");
  } else if (nanoUnsafe < expectJobs) {
    violations.push(`geny_ai_call_total{status=unsafe,vendor=nano-banana}=${nanoUnsafe} < expected ${expectJobs}`);
  }

  // U3) call_total{status=success, vendor=sdxl}
  const sdxlSuccess = readSample(text, "geny_ai_call_total", { status: "success", vendor: "sdxl" });
  report.call_total_sdxl_success = sdxlSuccess;
  if (sdxlSuccess === null) {
    violations.push("geny_ai_call_total{status=success,vendor=sdxl} sample missing");
  } else if (sdxlSuccess < expectJobs) {
    violations.push(`geny_ai_call_total{status=success,vendor=sdxl}=${sdxlSuccess} < expected ${expectJobs}`);
  }

  // U4) queue duration succeeded
  const queueSucceeded = readSample(text, "geny_queue_duration_seconds_count", { outcome: "succeeded" });
  report.queue_duration_succeeded_count = queueSucceeded;
  if (queueSucceeded === null || queueSucceeded < expectJobs) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=succeeded}=${queueSucceeded} < expected ${expectJobs}`,
    );
  }

  // U5) queue_failed_total TYPE-only
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
  const exclusiveModes = [args.expectTerminalFailure, args.expectUnsafe, args.expectHops !== undefined].filter(Boolean).length;
  if (exclusiveModes > 1) {
    process.stderr.write("--expect-terminal-failure / --expect-unsafe / --expect-hops 는 상호 배타\n");
    process.exit(2);
  }
  const expectJobs = Number.isFinite(args.expectJobs) ? args.expectJobs : 20;
  const text = readFileSync(args.file, "utf8");
  let result;
  if (args.expectTerminalFailure) result = validateTerminalFailureSnapshot(text, expectJobs);
  else if (args.expectUnsafe) result = validateUnsafeSnapshot(text, expectJobs);
  else result = validateFallbackSnapshot(text, expectJobs, args.expectHops === 2 ? 2 : 1);
  const { report, violations } = result;
  if (args.verbose) {
    process.stdout.write(`[fallback-validate] report=${JSON.stringify(report)}\n`);
  }
  if (violations.length > 0) {
    process.stderr.write(`[fallback-validate] ❌ ${violations.length} violation(s):\n`);
    for (const v of violations) process.stderr.write(`  - ${v}\n`);
    process.exit(1);
  }
  process.stdout.write(
    `[fallback-validate] ✅ fallback path observable (${report.mode}) — ${JSON.stringify(report)}\n`,
  );
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[fallback-validate] ✖ ${err?.stack ?? err}\n`);
    process.exit(2);
  });
}
