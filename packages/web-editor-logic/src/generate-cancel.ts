/**
 * `@geny/web-editor-logic/generate-cancel` — β P2-S8.
 *
 * **Generate 취소 상태 기계** + 유틸. `AbortController` 자체는 브라우저 네이티브로
 * 쓰고, 본 모듈은 그 주변 비즈니스 로직을 pure function 으로 고정한다:
 *
 * 1) 취소 **이유** 구분 — 사용자 버튼 / budget timeout / 페이지 이탈 / 내부 오류.
 *    `classifyGenerateFailure` 는 취소 여부만 분류 (kind="canceled"); 본 모듈은
 *    "왜 취소됐는지" 를 metric label (`cancel_reason`) 으로 남기기 위한 정보.
 * 2) 상태 전이 — idle → requested → aborted. 한 번 requested 되면 idle 로
 *    돌아갈 수 없음 (같은 run 안에서는). 새 run 시작 시 `initialCancelState()`
 *    로 리셋.
 * 3) `cancelCheckpoint(state)` — phase 경계에서 상태를 확인해 필요하면 throw.
 *    fetch 중단은 AbortSignal 로, phase 사이 await 은 본 함수로.
 * 4) `isAbortError(err)` — `DOMException.name==="AbortError"` 와 Node 의
 *    AbortError 양쪽을 잡는 런타임 독립 감지.
 *
 * **왜 pure 로?** runGenerate 안에 직접 abortController 를 관리하면 DOM 없이
 * 테스트 불가. 본 모듈은 pure 이므로 node:test 로 전 시나리오 (중복 cancel /
 * reset / reason 우선순위 / checkpoint throw) 를 회귀 고정.
 */

/**
 * 취소 이유. metric label `cancel_reason` 에 1:1 로 매핑. 이후 P5 (관측) 에서
 * Prometheus 카디널리티 문제 없도록 유한 enum 으로 고정.
 */
export type CancelReason =
  | "user" // 사용자 Cancel 버튼
  | "timeout_budget" // 5000ms β §7 예산 초과
  | "navigation" // 페이지 이탈 / 라우터 전환
  | "internal"; // 내부 오류로 인한 programmatic 취소

export type CancelStatus = "idle" | "requested" | "aborted";

/**
 * 취소 상태 스냅샷. 불변 — 전이는 새 객체 반환.
 *
 * - `status==="idle"` : 취소 요청 없음. 정상 실행 중.
 * - `status==="requested"` : 사용자 혹은 타이머가 cancel 을 눌렀으나 아직
 *   in-flight promise 가 AbortError 로 종료되지 않음.
 * - `status==="aborted"` : abort 가 실제 체인에 전파돼 throw 된 이후.
 */
export interface CancelSnapshot {
  readonly status: CancelStatus;
  readonly reason: CancelReason | null;
  /** requestCancel 이 호출된 시각 (ms, performance.now() 기준). */
  readonly requestedAt: number | null;
}

export function initialCancelState(): CancelSnapshot {
  return { status: "idle", reason: null, requestedAt: null };
}

/**
 * 취소 요청. 이미 requested 이거나 aborted 면 **초기 요청의 이유를 유지** —
 * 첫 취소 원인 을 metric 으로 보존하기 위함. 예: 사용자가 Cancel 을 눌렀고
 * 직후 navigation 이 일어나도 reason 은 "user" 로 유지.
 */
export function requestCancel(
  prev: CancelSnapshot,
  reason: CancelReason,
  at: number,
): CancelSnapshot {
  if (prev.status !== "idle") return prev;
  return { status: "requested", reason, requestedAt: at };
}

/**
 * in-flight promise 가 실제로 AbortError 를 throw 한 시점에 호출. `requested`
 * 상태에서만 `aborted` 로 전이. `idle` 상태에서 호출되면 무시 (spurious abort).
 */
export function markAborted(prev: CancelSnapshot): CancelSnapshot {
  if (prev.status !== "requested") return prev;
  return { status: "aborted", reason: prev.reason, requestedAt: prev.requestedAt };
}

/**
 * 취소 요청이 "이미 들어왔는가?" — runGenerate 는 phase 경계에서 이걸 보고
 * 즉시 중단. `requested` 와 `aborted` 둘 다 true.
 */
export function isCancelRequested(state: CancelSnapshot): boolean {
  return state.status !== "idle";
}

/**
 * metric stopReason 으로 변환. 취소가 아닌 상태에서 호출되면 null. canceled 이면
 * reason 을 그대로 label 값으로.
 */
export function cancelStopReason(state: CancelSnapshot): string | null {
  if (state.status === "idle") return null;
  return `canceled_by_${state.reason ?? "user"}`;
}

/**
 * 런타임 독립 AbortError 감지. 브라우저는 `DOMException("...", "AbortError")`,
 * Node 는 `Error` 에 `code: "ABORT_ERR"` 또는 `name: "AbortError"`. 양쪽과
 * 메시지 기반 fallback 까지.
 */
export function isAbortError(err: unknown): boolean {
  if (err == null) return false;
  if (typeof err !== "object") return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  if (e.name === "AbortError") return true;
  if (e.code === "ABORT_ERR") return true;
  if (typeof e.message === "string") {
    const lower = e.message.toLowerCase();
    if (lower.includes("abort") || lower.includes("cancel")) return true;
  }
  return false;
}

/**
 * Phase 경계 checkpoint. 취소 요청 상태면 AbortError 를 throw — runGenerate 의
 * catch 에서 classifyGenerateFailure 가 kind="canceled" 으로 분류하고 shouldRetry
 * 가 `canceled_by_user` stopReason 으로 즉시 종료. 요청 없으면 no-op.
 *
 * 네이티브 `DOMException` 이 없는 환경 (node:test) 을 위해 `Error` fallback.
 */
export function cancelCheckpoint(state: CancelSnapshot): void {
  if (!isCancelRequested(state)) return;
  const reason = state.reason ?? "user";
  const msg = `aborted:${reason}`;
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof DOMException !== "undefined") {
    throw new DOMException(msg, "AbortError");
  }
  const err = new Error(msg) as Error & { name: string };
  err.name = "AbortError";
  throw err;
}

/**
 * Reason 우선순위 — 동시 경합 시 (예: 사용자 클릭과 budget timer 동시 발화)
 * 어느 reason 을 남길지. 숫자가 **작을수록 우선** (첫 번째가 이긴다).
 *
 * 규칙: 사용자 개입이 최우선. 나머지는 발화 순서대로. 이미 `requestCancel` 이
 * 먼저 들어온 reason 을 유지하므로 본 함수는 "명시적으로 override 해야 하는 경우"
 * 를 위한 비교 helper.
 */
export function cancelReasonPriority(reason: CancelReason): number {
  switch (reason) {
    case "user": return 0;
    case "timeout_budget": return 1;
    case "navigation": return 2;
    case "internal": return 3;
  }
}
