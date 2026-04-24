import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  mergeCategoryOutcomes,
  selectPlansForRetry,
} from "../src/partial-retry.js";
import type { CategoryOutcome } from "../src/category-outcome.js";
import type { SlotGenerationPlan } from "../src/prompt-slot-planner.js";

const makePlan = (
  category: SlotGenerationPlan["category"],
  slots: string[],
): SlotGenerationPlan => ({
  category,
  slots,
  prompt: `prompt-${category}`,
});

const PLANS: readonly SlotGenerationPlan[] = [
  makePlan("Face", ["face_1", "face_2"]),
  makePlan("Hair", ["hair_front", "hair_back"]),
  makePlan("Body", ["body_1"]),
  makePlan("Accessory", ["acc_1"]),
];

describe("selectPlansForRetry — 선택 규칙 (β P4-S5)", () => {
  it("빈 outcomes 면 빈 배열을 반환한다", () => {
    assert.deepStrictEqual(selectPlansForRetry(PLANS, []), []);
  });

  it("모든 outcome 이 성공이면 재시도 대상 없음", () => {
    const outcomes: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: true },
      { category: "Body", ok: true },
      { category: "Accessory", ok: true },
    ];
    assert.deepStrictEqual(selectPlansForRetry(PLANS, outcomes), []);
  });

  it("1 실패 → 해당 카테고리 plan 만 반환", () => {
    const outcomes: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "vendor 500" },
      { category: "Body", ok: true },
      { category: "Accessory", ok: true },
    ];
    const picked = selectPlansForRetry(PLANS, outcomes);
    assert.strictEqual(picked.length, 1);
    assert.strictEqual(picked[0]?.category, "Hair");
    assert.deepStrictEqual(picked[0]?.slots, ["hair_front", "hair_back"]);
  });

  it("2 실패 → 원본 plans 순서로 2 plan 반환 (Hair 먼저 Accessory 뒤)", () => {
    const outcomes: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "timeout" },
      { category: "Body", ok: true },
      { category: "Accessory", ok: false, error: "quota" },
    ];
    const picked = selectPlansForRetry(PLANS, outcomes);
    assert.deepStrictEqual(
      picked.map((p) => p.category),
      ["Hair", "Accessory"],
    );
  });

  it("outcome 에 plans 에 없는 카테고리가 있어도 무시 — plan subset 만 반환", () => {
    const outcomes: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
      { category: "NonExistent", ok: false },
    ];
    const picked = selectPlansForRetry(PLANS, outcomes);
    assert.strictEqual(picked.length, 1);
    assert.strictEqual(picked[0]?.category, "Hair");
  });

  it("입력 plans 배열을 수정하지 않는다 (불변성)", () => {
    const frozen = Object.freeze([...PLANS]);
    const outcomes: CategoryOutcome[] = [
      { category: "Face", ok: false },
      { category: "Hair", ok: false },
    ];
    const picked = selectPlansForRetry(frozen, outcomes);
    assert.strictEqual(picked.length, 2);
    assert.strictEqual(frozen.length, 4);
  });
});

describe("mergeCategoryOutcomes — 병합 규칙 (β P4-S5)", () => {
  it("retry 가 비어 있으면 first 를 그대로 복제 반환 (내용 동일, 참조 다름)", () => {
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "v500" },
    ];
    const merged = mergeCategoryOutcomes(first, []);
    assert.deepStrictEqual(merged, first);
    assert.notStrictEqual(merged, first);
    assert.notStrictEqual(merged[0], first[0]);
  });

  it("retry 가 같은 카테고리를 성공으로 override 하면 retried=true 마킹", () => {
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "v500" },
      { category: "Body", ok: true },
    ];
    const retry: CategoryOutcome[] = [{ category: "Hair", ok: true }];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.strictEqual(merged.length, 3);
    assert.deepStrictEqual(merged[0], { category: "Face", ok: true });
    assert.deepStrictEqual(merged[1], {
      category: "Hair",
      ok: true,
      retried: true,
    });
    assert.deepStrictEqual(merged[2], { category: "Body", ok: true });
  });

  it("retry 도 실패해도 retried=true 는 붙고 ok=false 유지", () => {
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "first-fail" },
    ];
    const retry: CategoryOutcome[] = [
      { category: "Hair", ok: false, error: "retry-fail" },
    ];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.strictEqual(merged[1]?.ok, false);
    assert.strictEqual(merged[1]?.retried, true);
    assert.strictEqual(merged[1]?.error, "retry-fail");
  });

  it("first 순서 유지 — merged 의 카테고리 순서는 first 기준", () => {
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
      { category: "Body", ok: false },
      { category: "Accessory", ok: true },
    ];
    const retry: CategoryOutcome[] = [
      { category: "Body", ok: true },
      { category: "Hair", ok: true },
    ];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.deepStrictEqual(
      merged.map((o) => o.category),
      ["Face", "Hair", "Body", "Accessory"],
    );
    assert.strictEqual(merged[1]?.retried, true);
    assert.strictEqual(merged[2]?.retried, true);
    assert.strictEqual(merged[0]?.retried, undefined);
    assert.strictEqual(merged[3]?.retried, undefined);
  });

  it("retry 에만 있는 카테고리는 뒤에 append + retried=true (방어적)", () => {
    const first: CategoryOutcome[] = [{ category: "Face", ok: true }];
    const retry: CategoryOutcome[] = [{ category: "Hair", ok: true }];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.strictEqual(merged.length, 2);
    assert.deepStrictEqual(
      merged.map((o) => o.category),
      ["Face", "Hair"],
    );
    assert.strictEqual(merged[0]?.retried, undefined);
    assert.strictEqual(merged[1]?.retried, true);
  });

  it("first / retry 원본 배열 및 원소를 수정하지 않는다", () => {
    const first: CategoryOutcome[] = [
      { category: "Hair", ok: false, error: "x" },
    ];
    const retry: CategoryOutcome[] = [{ category: "Hair", ok: true }];
    const firstSnapshot = JSON.parse(JSON.stringify(first));
    const retrySnapshot = JSON.parse(JSON.stringify(retry));
    mergeCategoryOutcomes(first, retry);
    assert.deepStrictEqual(first, firstSnapshot);
    assert.deepStrictEqual(retry, retrySnapshot);
    assert.strictEqual(first[0]?.retried, undefined);
    assert.strictEqual(retry[0]?.retried, undefined);
  });

  it("error 필드는 retry 결과 기준으로 덮어씌운다", () => {
    const first: CategoryOutcome[] = [
      { category: "Hair", ok: false, error: "vendor timeout" },
    ];
    const retry: CategoryOutcome[] = [
      { category: "Hair", ok: false, error: "retry quota exceeded" },
    ];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.strictEqual(merged[0]?.error, "retry quota exceeded");
  });

  it("retry 가 기존 성공 카테고리를 다시 포함해도 retried=true 로 marking", () => {
    const first: CategoryOutcome[] = [{ category: "Face", ok: true }];
    const retry: CategoryOutcome[] = [{ category: "Face", ok: true }];
    const merged = mergeCategoryOutcomes(first, retry);
    assert.strictEqual(merged[0]?.retried, true);
  });

  it("summarizeCategoryOutcomes 와 조합 — partial → success 전이", async () => {
    const { summarizeCategoryOutcomes } = await import(
      "../src/category-outcome.js"
    );
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "v500" },
      { category: "Body", ok: true },
      { category: "Accessory", ok: true },
    ];
    const retry: CategoryOutcome[] = [{ category: "Hair", ok: true }];
    const merged = mergeCategoryOutcomes(first, retry);
    const summary = summarizeCategoryOutcomes(merged);
    assert.strictEqual(summary.status, "success");
    assert.strictEqual(summary.okCount, 4);
    assert.strictEqual(summary.failedCount, 0);
  });

  it("summarizeCategoryOutcomes 조합 — retry 도 실패 시 partial 유지", async () => {
    const { summarizeCategoryOutcomes } = await import(
      "../src/category-outcome.js"
    );
    const first: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "first" },
      { category: "Body", ok: true },
    ];
    const retry: CategoryOutcome[] = [
      { category: "Hair", ok: false, error: "retry" },
    ];
    const merged = mergeCategoryOutcomes(first, retry);
    const summary = summarizeCategoryOutcomes(merged);
    assert.strictEqual(summary.status, "partial");
    assert.deepStrictEqual(summary.failedCategories, ["Hair"]);
  });
});
