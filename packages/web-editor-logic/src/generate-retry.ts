/**
 * `@geny/web-editor-logic/generate-retry` — β P2-S7.
 *
 * Generate 한 회의 **시도 플랜 + 실패 분류** 순수 함수 모듈. index.html 의 runGenerate
 * 는 네트워크/vendor 실패 (β P3+ 실 nano-banana 로드 시 현실적인 실패율 ~5-15%)
 * 에 대비한 자동 재시도 로직이 필요한데, closure 안에서 엮이면 회귀 고정이 어렵다.
 *
 * 본 모듈이 고정하는 비즈니스 규칙:
 * 1) **시도 플랜** — 총 budget 안에서 몇 번까지 시도할지 / 각 시도의 deadline / backoff.
 * 2) **실패 분류** — transient (재시도해 볼 수 있음) vs permanent (프롬프트/계약 실패,
 *    재시도 소용없음). 이 경계가 흐릿하면 사용자는 영구 오류를 3 번씩 보게 된다.
 * 3) **retry 판정** — 방금 실패 + 플랜 + 경과 ms → 다음 attempt 로 갈지 결정.
 *
 * 실 nano-banana 도입 전 단계에선 Mock 이 절대 실패하지 않으므로 런타임 상 no-op
 * 에 가깝다. 그러나 β §7 "preview ≤5000ms" 예산을 **attempt 1 + backoff + attempt 2**
 * 에도 깨뜨리지 않도록 플랜 자체는 현 단계부터 고정돼야 한다. 이 모듈이 플랜 계약
 * 을 node:test 로 박아두면, P3 합류 시점에 벤더 실패율이 올라가도 규칙은 변하지
 * 않는다 — 오로지 vendor wiring 만 바뀐다.
 */

/** 외부 코드가 던질 수 있는 오류의 모양. `Error` 뿐만 아니라 fetch 실패·timeout 등. */
export type GenerateFailureInput =
  | { readonly name?: string; readonly message?: string; readonly code?: string | number; readonly status?: number; readonly cause?: unknown }
  | string
  | undefined
  | null;

/**
 * 실패가 재시도로 해결될 법한지 — 재시도 결정의 단일 분류기.
 *
 * - `network` — fetch/TCP/TLS 문제. TypeError: Failed to fetch, ECONNRESET 등.
 * - `timeout` — 시도 단독의 deadline 초과 또는 server 5xx 중 indicating timeout.
 * - `server` — HTTP 5xx (일부 재시도 가능 — 503/504/502/429).
 * - `rate_limit` — 429. 짧은 backoff 후 한 번 더 해볼 만함.
 * - `canceled` — 사용자 취소 (AbortError). 재시도 금지.
 * - `contract` — schema 불일치·프롬프트 거부·4xx (429 제외). 재시도 소용없음.
 * - `unknown` — 분류 불가. 보수적으로 permanent 취급.
 */
export type GenerateFailureKind =
  | "network"
  | "timeout"
  | "server"
  | "rate_limit"
  | "canceled"
  | "contract"
  | "unknown";

export interface GenerateFailure {
  readonly kind: GenerateFailureKind;
  /** retry 로 해결될 가능성이 있는 종류면 true. */
  readonly transient: boolean;
  /** 원본 메시지 (없으면 kind 를 그대로). metric 라벨·디버그용. */
  readonly message: string;
}

/**
 * 원본 에러 값을 `GenerateFailure` 로 분류. 어떤 shape 의 입력이 와도 throw 하지
 * 않고 `unknown` 을 반환 — metric emit 경로가 분류 실패로 깨지지 않게.
 *
 * 판정 규칙 (우선순위 상단부터):
 * 1) `name === "AbortError"` 또는 message 에 "abort"/"canceled" → `canceled`.
 * 2) HTTP status:
 *    - 429 → `rate_limit` (transient)
 *    - 408/502/503/504 → `timeout` (transient)
 *    - 500/501/505~599 → `server` (transient)
 *    - 나머지 4xx → `contract` (permanent)
 * 3) code:
 *    - ECONNRESET/ECONNREFUSED/ENOTFOUND/ETIMEDOUT/EAI_AGAIN → `network` (transient)
 * 4) TypeError + "fetch" → `network` (transient, 브라우저 네트워크 실패).
 * 5) message 에 "timeout"/"timed out" → `timeout`.
 * 6) 그 외 → `unknown` (permanent).
 */
export function classifyGenerateFailure(err: GenerateFailureInput): GenerateFailure {
  if (err === null || err === undefined) {
    return { kind: "unknown", transient: false, message: "unknown" };
  }
  if (typeof err === "string") {
    return classifyByString(err);
  }

  const name = typeof err.name === "string" ? err.name : "";
  const message = typeof err.message === "string" ? err.message : "";
  const code = err.code;
  const status = typeof err.status === "number" ? err.status : NaN;
  const combined = `${name} ${message}`.toLowerCase();

  if (name === "AbortError" || combined.includes("abort") || combined.includes("canceled") || combined.includes("cancelled")) {
    return { kind: "canceled", transient: false, message: message || "canceled" };
  }

  if (Number.isFinite(status)) {
    if (status === 429) return { kind: "rate_limit", transient: true, message: message || `http ${status}` };
    if (status === 408 || status === 502 || status === 503 || status === 504) {
      return { kind: "timeout", transient: true, message: message || `http ${status}` };
    }
    if (status >= 500 && status <= 599) {
      return { kind: "server", transient: true, message: message || `http ${status}` };
    }
    if (status >= 400 && status <= 499) {
      return { kind: "contract", transient: false, message: message || `http ${status}` };
    }
  }

  if (typeof code === "string") {
    const up = code.toUpperCase();
    if (
      up === "ECONNRESET" ||
      up === "ECONNREFUSED" ||
      up === "ENOTFOUND" ||
      up === "EAI_AGAIN" ||
      up === "ENETUNREACH" ||
      up === "EPIPE"
    ) {
      return { kind: "network", transient: true, message: message || up };
    }
    if (up === "ETIMEDOUT") {
      return { kind: "timeout", transient: true, message: message || up };
    }
  }

  if (name === "TypeError" && combined.includes("fetch")) {
    return { kind: "network", transient: true, message: message || "fetch failed" };
  }

  if (combined.includes("timeout") || combined.includes("timed out")) {
    return { kind: "timeout", transient: true, message: message || "timeout" };
  }

  return { kind: "unknown", transient: false, message: message || name || "unknown" };
}

function classifyByString(s: string): GenerateFailure {
  const lower = s.toLowerCase();
  if (lower.includes("abort") || lower.includes("cancel")) {
    return { kind: "canceled", transient: false, message: s };
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { kind: "timeout", transient: true, message: s };
  }
  if (lower.includes("network") || lower.includes("fetch")) {
    return { kind: "network", transient: true, message: s };
  }
  return { kind: "unknown", transient: false, message: s };
}

/**
 * 시도 플랜의 입력. 호출자는 β §7 예산 + 재시도 허용 횟수를 고정해 전달.
 *
 * `totalBudgetMs` 는 β 제품 5000ms 예산. `maxAttempts` ≥ 1 (최소 1 회 시도).
 * `backoffMs` 는 각 실패 후 다음 attempt 전 대기 시간 — 첫 실패에는
 * `backoffMs[0]`, 두 번째에는 `backoffMs[1]` … 인덱스 초과 시 마지막 값 재사용.
 * β P2-S7 기본: `[300]` (첫 재시도는 300ms 대기 — UI 가 깜빡이되 사용자가
 * 기다려줄 만한 수준).
 *
 * `perAttemptBudgetMs` 가 주어지면 각 attempt 의 deadline 을 총 예산과 별개로
 * 캡 — 첫 attempt 이 5000ms 안에 안 끝나는 게 아니라 `perAttemptBudgetMs` 안에
 * 안 끝나면 timeout 처리하고 재시도. 기본은 undefined (총 예산에서 남은 만큼).
 */
export interface GenerateAttemptPlanInput {
  readonly totalBudgetMs: number;
  readonly maxAttempts: number;
  readonly backoffMs?: readonly number[];
  readonly perAttemptBudgetMs?: number;
}

export interface GenerateAttemptPlan {
  readonly totalBudgetMs: number;
  readonly maxAttempts: number;
  readonly backoffMs: readonly number[];
  readonly perAttemptBudgetMs?: number;
}

/**
 * 입력을 검증·정규화한 플랜 반환. maxAttempts 는 [1, 5] 로 클램프, backoffMs 는
 * 음수·NaN 을 0 으로, totalBudgetMs 는 최소 100ms 로. 공격적 재시도 (maxAttempts>5)
 * 는 β 에서는 불가 — 실 벤더 quota 를 태운다.
 */
export function planGenerateAttempts(input: GenerateAttemptPlanInput): GenerateAttemptPlan {
  const totalBudgetMs = Math.max(100, Number.isFinite(input.totalBudgetMs) ? input.totalBudgetMs : 5000);
  const maxAttempts = Math.max(1, Math.min(5, Math.floor(Number.isFinite(input.maxAttempts) ? input.maxAttempts : 1)));
  const rawBackoff = input.backoffMs ?? [];
  const backoffMs = rawBackoff.map((v) => (Number.isFinite(v) && v > 0 ? v : 0));
  const perAttemptBudgetMs = input.perAttemptBudgetMs !== undefined && input.perAttemptBudgetMs > 0
    ? input.perAttemptBudgetMs
    : undefined;
  const plan: GenerateAttemptPlan =
    perAttemptBudgetMs !== undefined
      ? { totalBudgetMs, maxAttempts, backoffMs, perAttemptBudgetMs }
      : { totalBudgetMs, maxAttempts, backoffMs };
  return plan;
}

/** 0-indexed attempt 번호에 해당하는 backoff ms. 배열 범위 초과 시 마지막 값 재사용. 0 이면 즉시 재시도. */
export function nextAttemptBackoffMs(plan: GenerateAttemptPlan, failedAttemptIndex: number): number {
  if (failedAttemptIndex < 0) return 0;
  if (plan.backoffMs.length === 0) return 0;
  const last = plan.backoffMs[plan.backoffMs.length - 1] ?? 0;
  const v = plan.backoffMs[failedAttemptIndex] ?? last;
  return Math.max(0, v);
}

export interface ShouldRetryInput {
  readonly plan: GenerateAttemptPlan;
  /** 방금 실패한 attempt 의 0-indexed 번호. 0 이 첫 시도. */
  readonly failedAttemptIndex: number;
  /** 분류된 실패. `classifyGenerateFailure` 결과를 넘기면 됨. */
  readonly failure: GenerateFailure;
  /** Generate 시작(t0) 이후 누적 ms. backoff 추가 후 예산 안에 다음 attempt 완료 가능한지 추정. */
  readonly elapsedMs: number;
}

export type ShouldRetryReason =
  | "transient_within_budget"
  | "permanent_failure"
  | "canceled_by_user"
  | "max_attempts_exhausted"
  | "budget_would_exceed";

export interface ShouldRetryDecision {
  readonly retry: boolean;
  readonly reason: ShouldRetryReason;
  /** retry=true 일 때 호출자가 대기할 ms. 0 이면 즉시. */
  readonly backoffMs: number;
  /** retry=true 일 때 사용할 다음 attempt 번호. */
  readonly nextAttemptIndex: number;
}

/**
 * 다음 attempt 로 갈지 판정. 네 가지 게이트 통과 시에만 retry=true:
 * 1) failure.transient (네트워크/timeout/429/5xx) 여야 함 — canceled/contract 는 즉시 종료.
 * 2) failedAttemptIndex+1 < maxAttempts — 시도 횟수 남아 있어야 함.
 * 3) elapsedMs + backoff < totalBudgetMs — 백오프 후에도 총 예산 안에 들어와야 함.
 *    (남은 예산이 한 번의 attempt 최소시간도 감당 못 하면 의미 없음 — 한 attempt
 *    당 최소 50ms 여유는 확보.)
 * 4) 명시적 user cancel 이면 어떠한 경우에도 retry=false.
 */
export function shouldRetry(input: ShouldRetryInput): ShouldRetryDecision {
  const { plan, failedAttemptIndex, failure, elapsedMs } = input;
  if (failure.kind === "canceled") {
    return { retry: false, reason: "canceled_by_user", backoffMs: 0, nextAttemptIndex: failedAttemptIndex };
  }
  if (!failure.transient) {
    return { retry: false, reason: "permanent_failure", backoffMs: 0, nextAttemptIndex: failedAttemptIndex };
  }
  const nextAttemptIndex = failedAttemptIndex + 1;
  if (nextAttemptIndex >= plan.maxAttempts) {
    return { retry: false, reason: "max_attempts_exhausted", backoffMs: 0, nextAttemptIndex };
  }
  const backoffMs = nextAttemptBackoffMs(plan, failedAttemptIndex);
  const minNextAttemptMs = 50;
  if (elapsedMs + backoffMs + minNextAttemptMs >= plan.totalBudgetMs) {
    return { retry: false, reason: "budget_would_exceed", backoffMs, nextAttemptIndex };
  }
  return { retry: true, reason: "transient_within_budget", backoffMs, nextAttemptIndex };
}

/**
 * metric 라벨용 — 실패 경로 emit 시 `attempts` / `last_failure_kind` 를 채워
 * Prometheus cardinality 는 유지하면서 후처리에서 재시도 분포를 볼 수 있게.
 */
export interface GenerateAttemptOutcome {
  /** 실행된 attempt 개수 (실패 포함 총 시도, 최소 1). */
  readonly attempts: number;
  /** 최종 성공 여부. 성공 시 마지막 attempt 에 성공한 것으로 간주. */
  readonly ok: boolean;
  /** 마지막 실패 분류. 성공 시 undefined. */
  readonly lastFailureKind?: GenerateFailureKind;
  /** 재시도 중단 사유. 성공 시 "success". */
  readonly stopReason: ShouldRetryReason | "success";
}

/**
 * metric 라벨 레코드로 변환 — `labels.attempts` / `labels.last_failure_kind` /
 * `labels.stop_reason` 3 개. stop_reason 은 항상 있음 — 성공은 `"success"` 로
 * 구분. cardinality: attempts 는 1~5, kind 는 7 + success, stop_reason 은 5 +
 * success → 총 1×8×6=48 조합으로 경계 명확.
 */
export function attemptOutcomeLabels(outcome: GenerateAttemptOutcome): Record<string, string> {
  return {
    attempts: String(outcome.attempts),
    last_failure_kind: outcome.lastFailureKind ?? "success",
    stop_reason: outcome.stopReason,
  };
}
