/**
 * `@geny/worker-generate` SafetyFilter CLI 프리셋 (세션 88).
 *
 * `--safety-preset <spec>` 플래그로 주입되는 테스트/e2e 용 SafetyFilter 프리셋 파서.
 * Foundation 단계에서 **실 안전성 판정** 은 Runtime 의 외부 모델 서비스(docs/05 §9) 몫이고,
 * 본 모듈은 UNSAFE_CONTENT 폴백 경로가 관측 계약(`geny_ai_fallback_total{reason="unsafe"}`)
 * 에 나타나는지 CI 에서 회귀하기 위한 결정론적 주입점이다.
 *
 * 지원 프리셋:
 *  - `noop` — 모든 결과 통과. 미주입과 동일하며 명시적 선택지로 노출.
 *  - `block-vendors:NAME[,NAME...]` — `result.vendor` 가 목록에 포함되면 차단. 목록은 쉼표 분리.
 *    예: `--safety-preset block-vendors:nano-banana` → 라우터 첫 후보(nano-banana) 결과만
 *    unsafe 로 차단 → sdxl 폴백 성공 → `geny_ai_fallback_total{from=nano-banana,to=sdxl,reason=unsafe}=N`
 *    + `geny_ai_call_total{vendor=sdxl,status=success}=N`.
 *
 * 파서는 **엄격** — 알 수 없는 프리셋 / 빈 벤더 목록 / 중복 벤더는 throw. CI 에서 오타가
 * silent 하게 noop 으로 흘러내리지 않도록.
 */

import type {
  GenerationResult,
  GenerationTask,
  SafetyFilter,
  SafetyVerdict,
} from "@geny/ai-adapter-core";

export interface SafetyPresetSpec {
  kind: "noop" | "block-vendors";
  /** block-vendors 일 때만 채워진다. */
  blockedVendors?: readonly string[];
}

export function parseSafetyPreset(raw: string): SafetyPresetSpec {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("--safety-preset 값이 비어있음");
  }
  if (raw === "noop") return { kind: "noop" };
  const colon = raw.indexOf(":");
  if (colon === -1) {
    throw new Error(`알 수 없는 safety preset: ${raw} (지원: noop / block-vendors:NAME[,NAME...])`);
  }
  const kind = raw.slice(0, colon);
  const rest = raw.slice(colon + 1);
  if (kind !== "block-vendors") {
    throw new Error(`알 수 없는 safety preset kind: ${kind} (지원: noop / block-vendors)`);
  }
  const vendors = rest.split(",").map((v) => v.trim()).filter((v) => v.length > 0);
  if (vendors.length === 0) {
    throw new Error("block-vendors: 최소 1 벤더 필요 (예: block-vendors:nano-banana)");
  }
  const seen = new Set<string>();
  for (const v of vendors) {
    if (seen.has(v)) throw new Error(`block-vendors 에 중복된 벤더: ${v}`);
    seen.add(v);
  }
  return { kind: "block-vendors", blockedVendors: vendors };
}

export function createSafetyFilterFromPreset(spec: SafetyPresetSpec): SafetyFilter {
  if (spec.kind === "noop") {
    return {
      async check(): Promise<SafetyVerdict> {
        return { allowed: true };
      },
    };
  }
  const blocked = new Set(spec.blockedVendors ?? []);
  return {
    async check(result: GenerationResult, _task: GenerationTask): Promise<SafetyVerdict> {
      if (blocked.has(result.vendor)) {
        return {
          allowed: false,
          reason: `safety preset: vendor ${result.vendor} is blocked`,
          categories: ["test-preset"],
        };
      }
      return { allowed: true };
    },
  };
}
