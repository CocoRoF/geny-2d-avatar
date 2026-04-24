import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  cancelCheckpoint,
  cancelReasonPriority,
  cancelStopReason,
  initialCancelState,
  isAbortError,
  isCancelRequested,
  markAborted,
  requestCancel,
} from "../src/generate-cancel.js";

/**
 * β P2-S8 — Generate 취소 상태 기계 회귀 고정.
 *
 * runGenerate 의 모든 취소 경로 (사용자 Cancel / budget timer / navigation /
 * internal abort) 를 단일 pure 모듈로 수렴시켰고, 본 테스트는 그 전이 규칙을
 * DOM 없이 회귀 검증.
 */

describe("initialCancelState — 초기 상태", () => {
  test("status='idle', reason=null, requestedAt=null", () => {
    const s = initialCancelState();
    assert.equal(s.status, "idle");
    assert.equal(s.reason, null);
    assert.equal(s.requestedAt, null);
  });

  test("isCancelRequested(initial) === false", () => {
    assert.equal(isCancelRequested(initialCancelState()), false);
  });

  test("cancelStopReason(initial) === null", () => {
    assert.equal(cancelStopReason(initialCancelState()), null);
  });
});

describe("requestCancel — idle → requested 전이", () => {
  test("idle → user 요청 시 requested + reason='user'", () => {
    const s = requestCancel(initialCancelState(), "user", 1234);
    assert.equal(s.status, "requested");
    assert.equal(s.reason, "user");
    assert.equal(s.requestedAt, 1234);
  });

  test("idle → timeout_budget", () => {
    const s = requestCancel(initialCancelState(), "timeout_budget", 5000);
    assert.equal(s.status, "requested");
    assert.equal(s.reason, "timeout_budget");
  });

  test("requested 상태에서 재호출 시 초기 reason 유지 (중복 cancel 무시)", () => {
    const first = requestCancel(initialCancelState(), "user", 100);
    const second = requestCancel(first, "navigation", 200);
    // 두 번째 reason 은 덮어쓰지 않음
    assert.equal(second.reason, "user");
    assert.equal(second.requestedAt, 100);
  });

  test("aborted 상태에서 재호출 시에도 reason 유지", () => {
    const requested = requestCancel(initialCancelState(), "user", 100);
    const aborted = markAborted(requested);
    const secondCancel = requestCancel(aborted, "timeout_budget", 500);
    assert.equal(secondCancel.status, "aborted");
    assert.equal(secondCancel.reason, "user");
  });

  test("모든 CancelReason 이 허용됨 (컴파일 + 런타임)", () => {
    const reasons = ["user", "timeout_budget", "navigation", "internal"] as const;
    for (const r of reasons) {
      const s = requestCancel(initialCancelState(), r, 0);
      assert.equal(s.reason, r);
    }
  });

  test("불변성 — 원본 state 객체를 수정하지 않음", () => {
    const s0 = initialCancelState();
    requestCancel(s0, "user", 100);
    assert.equal(s0.status, "idle", "requestCancel 이 원본을 뮤테이트하면 안 됨");
  });
});

describe("markAborted — requested → aborted 전이", () => {
  test("requested → aborted", () => {
    const req = requestCancel(initialCancelState(), "user", 100);
    const ab = markAborted(req);
    assert.equal(ab.status, "aborted");
    assert.equal(ab.reason, "user");
    assert.equal(ab.requestedAt, 100);
  });

  test("idle 에서 markAborted 호출 → idle 유지 (spurious abort 무시)", () => {
    const s = markAborted(initialCancelState());
    assert.equal(s.status, "idle");
  });

  test("aborted 에서 다시 markAborted → 변화 없음 (idempotent)", () => {
    const ab = markAborted(requestCancel(initialCancelState(), "user", 50));
    const ab2 = markAborted(ab);
    assert.equal(ab2.status, "aborted");
    assert.equal(ab2.reason, "user");
    assert.equal(ab2.requestedAt, 50);
  });
});

describe("isCancelRequested — requested/aborted 둘 다 true", () => {
  test("idle → false", () => {
    assert.equal(isCancelRequested(initialCancelState()), false);
  });

  test("requested → true", () => {
    assert.equal(isCancelRequested(requestCancel(initialCancelState(), "user", 1)), true);
  });

  test("aborted → true", () => {
    const ab = markAborted(requestCancel(initialCancelState(), "user", 1));
    assert.equal(isCancelRequested(ab), true);
  });
});

describe("cancelStopReason — metric label 변환", () => {
  test("idle → null (취소가 아님)", () => {
    assert.equal(cancelStopReason(initialCancelState()), null);
  });

  test("requested user → 'canceled_by_user'", () => {
    const s = requestCancel(initialCancelState(), "user", 0);
    assert.equal(cancelStopReason(s), "canceled_by_user");
  });

  test("requested timeout_budget → 'canceled_by_timeout_budget'", () => {
    const s = requestCancel(initialCancelState(), "timeout_budget", 0);
    assert.equal(cancelStopReason(s), "canceled_by_timeout_budget");
  });

  test("aborted 도 requested 과 동일 label", () => {
    const ab = markAborted(requestCancel(initialCancelState(), "navigation", 0));
    assert.equal(cancelStopReason(ab), "canceled_by_navigation");
  });
});

describe("isAbortError — 런타임 독립 감지", () => {
  test("name='AbortError' → true", () => {
    const e = new Error("any") as Error & { name: string };
    e.name = "AbortError";
    assert.equal(isAbortError(e), true);
  });

  test("code='ABORT_ERR' → true (Node AbortSignal)", () => {
    const e = { code: "ABORT_ERR", message: "signal aborted" };
    assert.equal(isAbortError(e), true);
  });

  test("message 에 'abort' 포함 → true", () => {
    assert.equal(isAbortError(new Error("request aborted")), true);
  });

  test("message 에 'cancel' 포함 → true", () => {
    assert.equal(isAbortError(new Error("user canceled")), true);
  });

  test("일반 Error 는 false", () => {
    assert.equal(isAbortError(new Error("network error")), false);
    assert.equal(isAbortError(new Error("timeout")), false);
  });

  test("null/undefined/primitive 도 안전하게 false", () => {
    assert.equal(isAbortError(null), false);
    assert.equal(isAbortError(undefined), false);
    assert.equal(isAbortError("abort"), false); // string 은 err 객체가 아님
    assert.equal(isAbortError(42), false);
  });

  test("빈 객체 → false", () => {
    assert.equal(isAbortError({}), false);
  });
});

describe("cancelCheckpoint — phase 경계 throw", () => {
  test("idle 상태 → throw 하지 않음 (no-op)", () => {
    assert.doesNotThrow(() => cancelCheckpoint(initialCancelState()));
  });

  test("requested 상태 → AbortError throw", () => {
    const req = requestCancel(initialCancelState(), "user", 0);
    let caught: unknown = null;
    try {
      cancelCheckpoint(req);
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, "must throw");
    assert.ok(isAbortError(caught), "thrown error 는 AbortError 여야 classifyGenerateFailure 가 canceled 로 분류");
  });

  test("aborted 상태 → 여전히 throw (이미 abort 됐으나 다시 checkpoint 걸리면)", () => {
    const ab = markAborted(requestCancel(initialCancelState(), "user", 0));
    assert.throws(() => cancelCheckpoint(ab), (e: unknown) => isAbortError(e));
  });

  test("throw 된 error 의 message 에 reason 포함", () => {
    const req = requestCancel(initialCancelState(), "timeout_budget", 0);
    try {
      cancelCheckpoint(req);
      assert.fail("should throw");
    } catch (e) {
      const msg = (e as Error).message;
      assert.ok(msg.includes("timeout_budget"), `message='${msg}' 에 reason 누락`);
    }
  });
});

describe("cancelReasonPriority — 우선순위 비교", () => {
  test("user < timeout_budget < navigation < internal", () => {
    assert.ok(cancelReasonPriority("user") < cancelReasonPriority("timeout_budget"));
    assert.ok(cancelReasonPriority("timeout_budget") < cancelReasonPriority("navigation"));
    assert.ok(cancelReasonPriority("navigation") < cancelReasonPriority("internal"));
  });

  test("user 가 최우선 (값 0)", () => {
    assert.equal(cancelReasonPriority("user"), 0);
  });
});

describe("end-to-end 시나리오 — 실제 runGenerate 흐름", () => {
  test("phase 2 실행 중 사용자 취소 → phase 3 진입 전 AbortError", () => {
    // runGenerate 시뮬레이션: phase 1 완료, phase 2 시작, 사용자 cancel.
    let state = initialCancelState();
    // phase 1 OK
    cancelCheckpoint(state);
    // phase 2 시작 → 사용자 클릭
    state = requestCancel(state, "user", 200);
    // phase 2 끝나고 checkpoint → throw 해야 함
    assert.throws(() => cancelCheckpoint(state));
  });

  test("budget timer 가 먼저 터져도 user 클릭이 들어오면 reason 은 user 유지 (첫 요청 보존)", () => {
    // 실제 런타임에서는 budget timer 와 user click 이 micro-seconds 차로 경합 가능.
    // requestCancel 은 이미 requested 상태이면 reason 덮어쓰기 안 함 — 첫 요청자가 metric 에 남음.
    let state = initialCancelState();
    state = requestCancel(state, "timeout_budget", 4999);
    state = requestCancel(state, "user", 5001);
    // 첫 요청 (timeout_budget) 이 이미 requested 이므로 user 는 무시됨
    assert.equal(state.reason, "timeout_budget");
    assert.equal(cancelStopReason(state), "canceled_by_timeout_budget");
  });

  test("새 Generate run 시작 시 initialCancelState() 로 리셋", () => {
    let state = initialCancelState();
    state = requestCancel(state, "user", 100);
    state = markAborted(state);
    assert.equal(state.status, "aborted");
    // 다음 Generate run 시작
    state = initialCancelState();
    assert.equal(state.status, "idle");
    assert.equal(state.reason, null);
    // 새로운 취소 가능
    state = requestCancel(state, "timeout_budget", 200);
    assert.equal(state.reason, "timeout_budget");
  });

  test("취소된 실행의 throw 가 classifyGenerateFailure 와 호환 — AbortError 포맷", () => {
    // classifyGenerateFailure 는 name==="AbortError" 를 canceled 로 분류.
    // 우리 cancelCheckpoint 도 동일 포맷을 throw 해야 classifyGenerateFailure 가 canceled 로 분류 가능.
    const req = requestCancel(initialCancelState(), "user", 0);
    try {
      cancelCheckpoint(req);
      assert.fail("should throw");
    } catch (e) {
      assert.equal((e as Error).name, "AbortError");
    }
  });
});
