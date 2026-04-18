export type AdapterErrorCode =
  | "CAPABILITY_MISMATCH"
  | "BUDGET_EXCEEDED"
  | "DEADLINE_EXCEEDED"
  | "UNSAFE_CONTENT"
  | "VENDOR_ERROR_4XX"
  | "VENDOR_ERROR_5XX"
  | "INVALID_OUTPUT"
  | "PROBE_FAILED"
  | "NO_ELIGIBLE_ADAPTER";

/**
 * 모든 어댑터가 던지는 에러는 이 클래스로 매핑된다 (docs/05 §12.3).
 * 벤더별 에러 코드 → 이 `code` 로의 매핑은 각 어댑터의 책임.
 * 라우터는 4xx 는 폴백 금지(클라이언트 오류), 5xx 는 폴백 허용 규칙을 적용한다.
 */
export class AdapterError extends Error {
  override readonly name = "AdapterError";
  constructor(
    message: string,
    readonly code: AdapterErrorCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }

  get retryable(): boolean {
    switch (this.code) {
      case "VENDOR_ERROR_5XX":
      case "DEADLINE_EXCEEDED":
      case "PROBE_FAILED":
        return true;
      default:
        return false;
    }
  }
}
