import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  hasRenderableResult,
  summarizeCategoryOutcomes,
  type CategoryOutcome,
} from "../src/index.js";

/**
 * β P4-S4 — 카테고리 partial failure 요약 회귀 고정.
 *
 * `planSlotGenerations` 가 돌려준 4 카테고리 중 일부만 실패하는 경우가 실
 * 벤더 (P3) 에선 일상이므로, run=fail 로 단순 종결하지 않고 부분 성공을
 * 표현하는 pure 함수의 분류/메시지/카운트 축을 고정.
 */

describe("summarizeCategoryOutcomes — 경계", () => {
  test("빈 배열 → status='empty', total=0, 고유 message", () => {
    const s = summarizeCategoryOutcomes([]);
    assert.equal(s.status, "empty");
    assert.equal(s.total, 0);
    assert.equal(s.okCount, 0);
    assert.equal(s.failedCount, 0);
    assert.deepEqual(s.successCategories, []);
    assert.deepEqual(s.failedCategories, []);
    assert.ok(s.displayMessage.includes("카테고리 없음"));
  });

  test("단일 성공 → 'success'", () => {
    const s = summarizeCategoryOutcomes([{ category: "Face", ok: true }]);
    assert.equal(s.status, "success");
    assert.equal(s.okCount, 1);
    assert.equal(s.failedCount, 0);
    assert.deepEqual(s.successCategories, ["Face"]);
  });

  test("단일 실패 → 'failed' — okCount=0 이면 partial 이 아님", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Hair", ok: false, error: "503 upstream" },
    ]);
    assert.equal(s.status, "failed");
    assert.equal(s.failedCount, 1);
    assert.deepEqual(s.failedCategories, ["Hair"]);
  });
});

describe("summarizeCategoryOutcomes — 4 카테고리 분포", () => {
  test("4/4 성공 → 'success' + ✓ 메시지", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Face", ok: true },
      { category: "Hair", ok: true },
      { category: "Body", ok: true },
      { category: "Accessory", ok: true },
    ]);
    assert.equal(s.status, "success");
    assert.equal(s.okCount, 4);
    assert.equal(s.failedCount, 0);
    assert.ok(s.displayMessage.startsWith("✓"));
    assert.ok(s.displayMessage.includes("4"));
  });

  test("Hair 1 개만 실패 → 'partial' + ⚠ + 실패 카테고리 명시", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Face", ok: true },
      { category: "Hair", ok: false, error: "vendor 503" },
      { category: "Body", ok: true },
      { category: "Accessory", ok: true },
    ]);
    assert.equal(s.status, "partial");
    assert.equal(s.okCount, 3);
    assert.equal(s.failedCount, 1);
    assert.deepEqual(s.successCategories, ["Face", "Body", "Accessory"]);
    assert.deepEqual(s.failedCategories, ["Hair"]);
    assert.ok(s.displayMessage.startsWith("⚠"));
    assert.ok(s.displayMessage.includes("Hair"));
  });

  test("4/4 실패 → 'failed' + 모든 카테고리 나열", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Face", ok: false },
      { category: "Hair", ok: false },
      { category: "Body", ok: false },
      { category: "Accessory", ok: false },
    ]);
    assert.equal(s.status, "failed");
    assert.equal(s.okCount, 0);
    assert.equal(s.failedCount, 4);
    assert.deepEqual(s.failedCategories, ["Face", "Hair", "Body", "Accessory"]);
    assert.ok(s.displayMessage.startsWith("✗"));
    for (const c of ["Face", "Hair", "Body", "Accessory"]) {
      assert.ok(s.displayMessage.includes(c), `message should mention ${c}`);
    }
  });

  test("2 성공 + 2 실패 → 'partial' (실패 회수가 성공과 같아도 부분 성공)", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
      { category: "Body", ok: true },
      { category: "Accessory", ok: false },
    ]);
    assert.equal(s.status, "partial");
    assert.deepEqual(s.failedCategories, ["Hair", "Accessory"]);
    assert.deepEqual(s.successCategories, ["Face", "Body"]);
  });
});

describe("summarizeCategoryOutcomes — 순서 + 라벨", () => {
  test("카테고리 순서는 입력 순서 그대로 보존 (정렬 X)", () => {
    const s = summarizeCategoryOutcomes([
      { category: "Body", ok: true },
      { category: "Face", ok: true },
      { category: "Hair", ok: true },
    ]);
    assert.deepEqual(s.successCategories, ["Body", "Face", "Hair"]);
  });

  test("error 필드는 요약 카운트에 영향 없음 (진단 전용)", () => {
    const s1 = summarizeCategoryOutcomes([
      { category: "Hair", ok: false, error: "timeout" },
    ]);
    const s2 = summarizeCategoryOutcomes([{ category: "Hair", ok: false }]);
    assert.equal(s1.status, s2.status);
    assert.equal(s1.failedCount, s2.failedCount);
    assert.equal(s1.displayMessage, s2.displayMessage);
  });
});

describe("hasRenderableResult", () => {
  test("success/partial 은 renderable → atlas 교체 OK", () => {
    const success = summarizeCategoryOutcomes([{ category: "Face", ok: true }]);
    const partial = summarizeCategoryOutcomes([
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
    ]);
    assert.equal(hasRenderableResult(success), true);
    assert.equal(hasRenderableResult(partial), true);
  });

  test("failed/empty 는 NOT renderable → placeholder 유지", () => {
    const failed = summarizeCategoryOutcomes([{ category: "Face", ok: false }]);
    const empty = summarizeCategoryOutcomes([]);
    assert.equal(hasRenderableResult(failed), false);
    assert.equal(hasRenderableResult(empty), false);
  });
});

describe("summarizeCategoryOutcomes — 불변성", () => {
  test("입력 배열을 변경하지 않음", () => {
    const input: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
    ];
    const snapshot = JSON.stringify(input);
    summarizeCategoryOutcomes(input);
    assert.equal(JSON.stringify(input), snapshot);
  });

  test("반환된 배열은 입력과 참조 공유 X", () => {
    const input: CategoryOutcome[] = [
      { category: "Face", ok: true },
      { category: "Hair", ok: false },
    ];
    const s = summarizeCategoryOutcomes(input);
    assert.notEqual(s.successCategories, input);
    assert.notEqual(s.failedCategories, input);
  });
});
