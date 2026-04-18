/**
 * docs/05 §9 — 어댑터 결과에 대한 안전성(Safety) 필터 훅.
 *
 * `routeWithFallback()` 는 각 후보 어댑터의 성공 결과를 반환 직전에 이 훅으로 통과시킨다.
 * 훅이 `allowed=false` 를 돌려주면 결과는 `AdapterError { code: UNSAFE_CONTENT }` 로 변환되고,
 * 라우터는 **다음 후보로 폴백한다** (다른 벤더가 안전한 결과를 낼 가능성이 있으므로).
 *
 * Foundation 단계의 기본 필터는 `NoopSafetyFilter` — 모든 결과를 통과. 프로덕션은 이미지 분석
 * 서비스(예: Cloud Vision Safe Search, 자체 모델) 로 교체.
 */
import type { GenerationResult, GenerationTask } from "./types.js";

export interface SafetyVerdict {
  allowed: boolean;
  reason?: string;
  categories?: string[];
}

export interface SafetyFilter {
  check(result: GenerationResult, task: GenerationTask): Promise<SafetyVerdict>;
}

/**
 * 모든 결과를 통과시키는 기본 필터. 테스트/Foundation 에서 사용.
 */
export class NoopSafetyFilter implements SafetyFilter {
  async check(): Promise<SafetyVerdict> {
    return { allowed: true };
  }
}
