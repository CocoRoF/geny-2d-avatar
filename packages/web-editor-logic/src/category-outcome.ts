/**
 * `@geny/web-editor-logic/category-outcome` — β P4-S4
 *
 * `planSlotGenerations` 가 N 카테고리로 분해된 run 에서, 각 카테고리 벤더
 * call 의 성공/실패 결과 (`CategoryOutcome[]`) 를 받아 run 수준의 요약으로
 * 환산. 실 nano-banana (P3) 합류 시 "Hair 카테고리만 실패했고 나머지는 성공"
 * 같은 partial failure 가 일상화되므로, run=fail 로 blanket 종결하는 대신
 * "부분 성공" 을 1 등 시민으로 대우하기 위한 축.
 *
 * 순수 함수 — DOM/브라우저 의존성 없이 node:test 회귀 고정. runGenerate 와
 * auto-preview 는 이 요약 결과로 (a) UI 문구 결정, (b) metric `ok` / per-
 * category `category_ok` 분포 산출, (c) atlas 교체 여부 결정을 한다.
 *
 * "empty" 는 planSlotGenerations 가 돌려준 카테고리가 0 개인 경계 — atlas
 * 에 알려진 role 이 하나도 없을 때. 이 경우 partial/failed 와는 다른 경로
 * (예: fallback 경로 one-shot Mock) 로 빠져야 하므로 상태를 구분.
 */

export type CategoryRunStatus = "success" | "partial" | "failed" | "empty";

/**
 * 한 카테고리의 vendor call 결과. 실패 시 `error` 에 사람이 읽을 수 있는
 * 메시지를 담는다 — stack trace 는 metric cardinality 를 늘리므로 지양.
 *
 * `retried` 는 P4-S5 에서 추가 — 이 outcome 이 partial retry 경로로 확정된
 * 결과임을 표시. partial-retry.ts 의 `mergeCategoryOutcomes` 만 설정한다.
 */
export interface CategoryOutcome {
  readonly category: string;
  readonly ok: boolean;
  readonly error?: string;
  readonly retried?: boolean;
}

export interface CategoryOutcomeSummary {
  readonly status: CategoryRunStatus;
  readonly total: number;
  readonly okCount: number;
  readonly failedCount: number;
  /** 성공한 카테고리들 (입력 순서 보존). */
  readonly successCategories: readonly string[];
  /** 실패한 카테고리들 (입력 순서 보존). */
  readonly failedCategories: readonly string[];
  /** UI status 바에 바로 쓰일 1줄 문구. status 별로 prefix + 카테고리 조합. */
  readonly displayMessage: string;
}

export function summarizeCategoryOutcomes(
  outcomes: readonly CategoryOutcome[],
): CategoryOutcomeSummary {
  if (outcomes.length === 0) {
    return {
      status: "empty",
      total: 0,
      okCount: 0,
      failedCount: 0,
      successCategories: [],
      failedCategories: [],
      displayMessage: "카테고리 없음",
    };
  }
  const okCats: string[] = [];
  const failCats: string[] = [];
  for (const o of outcomes) {
    if (o.ok) okCats.push(o.category);
    else failCats.push(o.category);
  }
  let status: CategoryRunStatus;
  let displayMessage: string;
  if (failCats.length === 0) {
    status = "success";
    displayMessage = `✓ ${okCats.length} 카테고리 완료`;
  } else if (okCats.length === 0) {
    status = "failed";
    displayMessage = `✗ 모든 카테고리 실패 (${failCats.join(", ")})`;
  } else {
    status = "partial";
    displayMessage = `⚠ 부분 성공 — 실패: ${failCats.join(", ")}`;
  }
  return {
    status,
    total: outcomes.length,
    okCount: okCats.length,
    failedCount: failCats.length,
    successCategories: okCats,
    failedCategories: failCats,
    displayMessage,
  };
}

/**
 * atlas 를 화면에 실제 교체할 것인가의 결정 — success/partial 은 교체, failed/
 * empty 는 기존 placeholder 유지. runGenerate 와 auto-preview 모두에서 이
 * 규약으로 `pixiRenderer.regenerate` 호출 여부 판단.
 */
export function hasRenderableResult(summary: CategoryOutcomeSummary): boolean {
  return summary.status === "success" || summary.status === "partial";
}
