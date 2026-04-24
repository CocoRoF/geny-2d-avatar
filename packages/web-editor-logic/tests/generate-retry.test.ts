import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  attemptOutcomeLabels,
  classifyGenerateFailure,
  nextAttemptBackoffMs,
  planGenerateAttempts,
  shouldRetry,
} from "../src/generate-retry.js";

/**
 * β P2-S7 — Generate 재시도/실패 분류 규칙 회귀 고정.
 *
 * 실 vendor (β P3) 합류 시 실패율이 올라가도 본 파일의 invariant 는 변하지 않음.
 * index.html 의 runGenerate 는 이 공식들을 얇게 wrapping 할 뿐.
 */

describe("classifyGenerateFailure — 실패 분류", () => {
  test("null/undefined → unknown (permanent)", () => {
    assert.equal(classifyGenerateFailure(null).kind, "unknown");
    assert.equal(classifyGenerateFailure(undefined).kind, "unknown");
    assert.equal(classifyGenerateFailure(null).transient, false);
  });

  test("AbortError (name) → canceled, not transient", () => {
    const f = classifyGenerateFailure({ name: "AbortError", message: "aborted" });
    assert.equal(f.kind, "canceled");
    assert.equal(f.transient, false);
  });

  test("message 에 'canceled' → canceled", () => {
    const f = classifyGenerateFailure({ name: "Error", message: "operation canceled by user" });
    assert.equal(f.kind, "canceled");
  });

  test("HTTP 429 → rate_limit, transient", () => {
    const f = classifyGenerateFailure({ status: 429, message: "Too Many Requests" });
    assert.equal(f.kind, "rate_limit");
    assert.equal(f.transient, true);
  });

  test("HTTP 408/502/503/504 → timeout, transient", () => {
    for (const status of [408, 502, 503, 504]) {
      const f = classifyGenerateFailure({ status });
      assert.equal(f.kind, "timeout", `${status} → timeout`);
      assert.equal(f.transient, true);
    }
  });

  test("HTTP 500/501/505 → server, transient", () => {
    for (const status of [500, 501, 505]) {
      const f = classifyGenerateFailure({ status });
      assert.equal(f.kind, "server", `${status} → server`);
      assert.equal(f.transient, true);
    }
  });

  test("HTTP 400/401/403/404/422 → contract, permanent (재시도 소용없음)", () => {
    for (const status of [400, 401, 403, 404, 422]) {
      const f = classifyGenerateFailure({ status });
      assert.equal(f.kind, "contract", `${status} → contract`);
      assert.equal(f.transient, false);
    }
  });

  test("code=ECONNRESET/ECONNREFUSED/ENOTFOUND → network, transient", () => {
    for (const code of ["ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN"]) {
      const f = classifyGenerateFailure({ code });
      assert.equal(f.kind, "network", `${code} → network`);
      assert.equal(f.transient, true);
    }
  });

  test("code=ETIMEDOUT → timeout", () => {
    assert.equal(classifyGenerateFailure({ code: "ETIMEDOUT" }).kind, "timeout");
  });

  test("TypeError + 'fetch' 포함 → network (브라우저 fetch 실패)", () => {
    const f = classifyGenerateFailure({ name: "TypeError", message: "Failed to fetch" });
    assert.equal(f.kind, "network");
    assert.equal(f.transient, true);
  });

  test("message 에 'timeout' → timeout", () => {
    const f = classifyGenerateFailure({ name: "Error", message: "request timed out" });
    assert.equal(f.kind, "timeout");
  });

  test("string err: 'aborted' / 'timeout' / 'network' / 알 수 없음", () => {
    assert.equal(classifyGenerateFailure("user aborted").kind, "canceled");
    assert.equal(classifyGenerateFailure("timed out after 5s").kind, "timeout");
    assert.equal(classifyGenerateFailure("network failure").kind, "network");
    assert.equal(classifyGenerateFailure("something weird").kind, "unknown");
  });

  test("알 수 없는 shape → unknown, permanent (보수적)", () => {
    const f = classifyGenerateFailure({ name: "WeirdError", message: "does not match anything" });
    assert.equal(f.kind, "unknown");
    assert.equal(f.transient, false);
  });

  test("분류 priorities: canceled 가 status 보다 우선", () => {
    const f = classifyGenerateFailure({ name: "AbortError", status: 500, message: "user aborted" });
    assert.equal(f.kind, "canceled", "AbortError 는 5xx 보다 우선");
  });
});

describe("planGenerateAttempts — 입력 정규화", () => {
  test("기본 입력 그대로 통과", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, backoffMs: [300] });
    assert.equal(plan.totalBudgetMs, 5000);
    assert.equal(plan.maxAttempts, 2);
    assert.deepEqual(plan.backoffMs, [300]);
  });

  test("maxAttempts 는 [1, 5] 로 클램프", () => {
    assert.equal(planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 0 }).maxAttempts, 1);
    assert.equal(planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 99 }).maxAttempts, 5);
    assert.equal(planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: -1 }).maxAttempts, 1);
  });

  test("totalBudgetMs 는 최소 100ms", () => {
    assert.equal(planGenerateAttempts({ totalBudgetMs: 10, maxAttempts: 1 }).totalBudgetMs, 100);
    assert.equal(planGenerateAttempts({ totalBudgetMs: Number.NaN, maxAttempts: 1 }).totalBudgetMs, 5000);
  });

  test("backoff 음수/NaN → 0 으로 정규화", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 3, backoffMs: [-100, Number.NaN, 500] });
    assert.deepEqual(plan.backoffMs, [0, 0, 500]);
  });

  test("perAttemptBudgetMs ≤ 0 → undefined", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, perAttemptBudgetMs: 0 });
    assert.equal(plan.perAttemptBudgetMs, undefined);
    const plan2 = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, perAttemptBudgetMs: 2000 });
    assert.equal(plan2.perAttemptBudgetMs, 2000);
  });
});

describe("nextAttemptBackoffMs — backoff 순서 조회", () => {
  test("배열 인덱스 안 — 해당 값 반환", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 3, backoffMs: [200, 500] });
    assert.equal(nextAttemptBackoffMs(plan, 0), 200);
    assert.equal(nextAttemptBackoffMs(plan, 1), 500);
  });

  test("배열 범위 초과 — 마지막 값 재사용", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 5, backoffMs: [100, 300] });
    assert.equal(nextAttemptBackoffMs(plan, 2), 300);
    assert.equal(nextAttemptBackoffMs(plan, 99), 300);
  });

  test("backoff 비어있음 → 0", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2 });
    assert.equal(nextAttemptBackoffMs(plan, 0), 0);
  });

  test("음수 인덱스 → 0 (방어)", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, backoffMs: [500] });
    assert.equal(nextAttemptBackoffMs(plan, -1), 0);
  });
});

describe("shouldRetry — 재시도 판정", () => {
  const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, backoffMs: [300] });

  test("canceled → retry=false, reason=canceled_by_user", () => {
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "canceled", transient: false, message: "user abort" },
      elapsedMs: 100,
    });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "canceled_by_user");
  });

  test("permanent (contract) → retry=false", () => {
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "contract", transient: false, message: "400" },
      elapsedMs: 100,
    });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "permanent_failure");
  });

  test("transient + attempt 0, 예산 충분 → retry=true + backoff 300ms", () => {
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "timeout", transient: true, message: "timed out" },
      elapsedMs: 500,
    });
    assert.equal(d.retry, true);
    assert.equal(d.reason, "transient_within_budget");
    assert.equal(d.backoffMs, 300);
    assert.equal(d.nextAttemptIndex, 1);
  });

  test("transient 이지만 max attempts 도달 → retry=false, max_attempts_exhausted", () => {
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 1,
      failure: { kind: "timeout", transient: true, message: "" },
      elapsedMs: 1000,
    });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "max_attempts_exhausted");
  });

  test("transient 이지만 예산 초과 예상 → retry=false, budget_would_exceed", () => {
    // elapsedMs(4800) + backoff(300) + min(50) = 5150 > 5000
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "network", transient: true, message: "" },
      elapsedMs: 4800,
    });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "budget_would_exceed");
  });

  test("경계: elapsed + backoff + 50 정확히 == budget → 예산 초과로 판정 (여유 없음)", () => {
    // elapsed(4650) + backoff(300) + 50 = 5000 — minNextAttemptMs 50 포함으로 safety margin
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "network", transient: true, message: "" },
      elapsedMs: 4650,
    });
    assert.equal(d.retry, false, "정확히 예산 == elapsed + backoff + 50 이면 초과로 취급");
  });

  test("경계: 여유가 1ms 라도 있으면 retry", () => {
    const d = shouldRetry({
      plan,
      failedAttemptIndex: 0,
      failure: { kind: "rate_limit", transient: true, message: "" },
      elapsedMs: 4649,
    });
    assert.equal(d.retry, true);
  });
});

describe("attemptOutcomeLabels — metric 라벨", () => {
  test("성공 → attempts=1, last_failure_kind=success, stop_reason=success", () => {
    const labels = attemptOutcomeLabels({ attempts: 1, ok: true, stopReason: "success" });
    assert.deepEqual(labels, {
      attempts: "1",
      last_failure_kind: "success",
      stop_reason: "success",
    });
  });

  test("retry 후 성공 → attempts=2", () => {
    const labels = attemptOutcomeLabels({ attempts: 2, ok: true, stopReason: "success" });
    assert.equal(labels["attempts"], "2");
  });

  test("재시도 실패 → last_failure_kind + stop_reason", () => {
    const labels = attemptOutcomeLabels({
      attempts: 2,
      ok: false,
      lastFailureKind: "timeout",
      stopReason: "max_attempts_exhausted",
    });
    assert.equal(labels["last_failure_kind"], "timeout");
    assert.equal(labels["stop_reason"], "max_attempts_exhausted");
  });

  test("user cancel → attempts=1, stop_reason=canceled_by_user", () => {
    const labels = attemptOutcomeLabels({
      attempts: 1,
      ok: false,
      lastFailureKind: "canceled",
      stopReason: "canceled_by_user",
    });
    assert.equal(labels["last_failure_kind"], "canceled");
    assert.equal(labels["stop_reason"], "canceled_by_user");
  });
});

describe("end-to-end scenario — 재시도 플랜 실행", () => {
  test("first timeout → retry → success: 2 attempts, ok=true", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2, backoffMs: [300] });
    const firstErr = classifyGenerateFailure({ status: 504, message: "gateway timeout" });
    const d = shouldRetry({ plan, failedAttemptIndex: 0, failure: firstErr, elapsedMs: 800 });
    assert.equal(d.retry, true);
    // 시나리오: second attempt 성공 — labels 조립
    const labels = attemptOutcomeLabels({ attempts: 2, ok: true, stopReason: "success" });
    assert.equal(labels["attempts"], "2");
  });

  test("first contract (4xx) → retry=false 즉시 종료, metric 으로 연결", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 2 });
    const err = classifyGenerateFailure({ status: 400, message: "bad prompt" });
    const d = shouldRetry({ plan, failedAttemptIndex: 0, failure: err, elapsedMs: 200 });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "permanent_failure");
    const labels = attemptOutcomeLabels({
      attempts: 1,
      ok: false,
      lastFailureKind: err.kind,
      stopReason: d.reason,
    });
    assert.equal(labels["stop_reason"], "permanent_failure");
    assert.equal(labels["last_failure_kind"], "contract");
  });

  test("budget 소진 — attempt1 이 느려 4.8s 걸리면 retry 포기", () => {
    const plan = planGenerateAttempts({ totalBudgetMs: 5000, maxAttempts: 3, backoffMs: [500] });
    const err = classifyGenerateFailure({ status: 503 });
    const d = shouldRetry({ plan, failedAttemptIndex: 0, failure: err, elapsedMs: 4800 });
    assert.equal(d.retry, false);
    assert.equal(d.reason, "budget_would_exceed");
  });
});
