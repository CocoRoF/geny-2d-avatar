/**
 * `@geny/web-editor-logic/partial-retry` — β P4-S5
 *
 * partial failure (1+ 카테고리 성공 + 1+ 카테고리 실패) 발생 시 **실패한
 * 카테고리만 선택적으로 재호출** 하기 위한 순수 정책 모듈.
 *
 * run 전체 재시도는 `generate-retry` 가 담당하고, 본 모듈은 "이미 부분
 * 성공한 run 안에서 실패 카테고리만 재호출" 경로를 다룬다. 실 nano-banana
 * (P3) 에서 1 카테고리 transient 실패가 흔해질 것이므로, 성공한 3 카테고리
 * 를 재호출하는 건 벤더 비용과 UX latency 모두 낭비 — 재시도 대상 plan
 * subset 과 merge 규칙을 pure function 으로 고정해 Mock + 실 어댑터 양쪽
 * 모두에서 동일 경로로 돌게 한다.
 *
 * **책임 분리**:
 * - `selectPlansForRetry` — outcomes 에서 ok=false 카테고리를 골라내 plans
 *   중 해당 카테고리의 subset 만 반환. 입력 plans 순서 보존.
 * - `mergeCategoryOutcomes` — 첫 시도 결과 + 재시도 결과를 병합. 같은
 *   카테고리는 retry 가 우선 (retry 가 최종 상태), 원래 순서는 first 기준.
 *   retry 로 결정된 outcome 에는 `retried: true` 를 덧붙여 Grafana 에서
 *   first-try success 와 retry-success 를 구분할 수 있게.
 *
 * 본 모듈은 DOM/Canvas 에 의존하지 않는다 — runGenerateAttempt 가 Mock
 * (또는 실 어댑터) 의 retry 호출 결과를 본 모듈로 병합해 최종 outcomes /
 * summary 를 산출한다.
 */

import type { SlotGenerationPlan } from "./prompt-slot-planner.js";
import type { CategoryOutcome } from "./category-outcome.js";

/**
 * `outcomes` 에서 실패한 (ok=false) 카테고리를 찾아, 해당 카테고리의 plan
 * 만 `plans` 에서 골라 반환. 입력 `plans` 순서 보존 — 실 벤더 호출 순서가
 * UX 에 영향을 주므로 일관성 유지.
 *
 * 방어적 동작:
 * - outcomes 에 있는 카테고리가 plans 에 없으면 해당 outcome 는 무시 (재시도
 *   할 plan 이 없으므로 no-op).
 * - 빈 outcomes / 모두 성공 → 빈 배열 반환.
 */
export function selectPlansForRetry(
  plans: readonly SlotGenerationPlan[],
  outcomes: readonly CategoryOutcome[],
): SlotGenerationPlan[] {
  if (outcomes.length === 0) return [];
  const failedSet = new Set<string>();
  for (const o of outcomes) {
    if (!o.ok) failedSet.add(o.category);
  }
  if (failedSet.size === 0) return [];
  return plans.filter((p) => failedSet.has(p.category));
}

/**
 * 첫 시도(`first`) 와 재시도(`retry`) 결과를 병합. 같은 카테고리가 양쪽에
 * 있으면 **retry 가 우선** (retry 가 최신 상태) — retry 로 얻은 결과는
 * `retried: true` 로 표시되어 metric 에서 분리 가능.
 *
 * 순서 보존:
 * - first 에 존재하는 카테고리는 first 순서로 유지.
 * - retry 가 first 에 없는 새 카테고리를 가져오는 경우는 일반적으로 없지만
 *   (selectPlansForRetry 가 first 의 실패 카테고리만 고름), 방어적으로
 *   append — 역시 retry 순서로.
 *
 * 불변성: `first` / `retry` 배열 및 그 원소들은 수정되지 않음. 병합 결과의
 * 객체들은 새 객체이며, retry 유래 객체에는 `retried: true` 가 덧씌워진다.
 */
export function mergeCategoryOutcomes(
  first: readonly CategoryOutcome[],
  retry: readonly CategoryOutcome[],
): CategoryOutcome[] {
  if (retry.length === 0) return first.map((o) => ({ ...o }));
  const retryMap = new Map<string, CategoryOutcome>();
  for (const o of retry) retryMap.set(o.category, o);
  const merged: CategoryOutcome[] = [];
  const seen = new Set<string>();
  for (const o of first) {
    const r = retryMap.get(o.category);
    if (r) {
      merged.push({ ...r, retried: true });
      seen.add(o.category);
    } else {
      merged.push({ ...o });
    }
  }
  for (const o of retry) {
    if (!seen.has(o.category)) {
      merged.push({ ...o, retried: true });
    }
  }
  return merged;
}
