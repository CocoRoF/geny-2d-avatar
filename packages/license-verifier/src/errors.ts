export type LicenseVerifyErrorCode =
  | "INVALID_REGISTRY"
  | "UNKNOWN_KEY"
  | "KEY_REVOKED"
  | "KEY_NOT_YET_VALID"
  | "KEY_EXPIRED"
  | "KEY_RETIRED_FOR_SIGNING"
  | "FIXTURE_KEY_REJECTED"
  | "BAD_SIGNATURE_FORMAT"
  | "SIGNATURE_MISMATCH"
  | "BUNDLE_SHA_MISMATCH"
  | "DOCUMENT_EXPIRED"
  | "DOCUMENT_NOT_YET_VALID";

export class LicenseVerifyError extends Error {
  override readonly name = "LicenseVerifyError";
  constructor(
    message: string,
    readonly code: LicenseVerifyErrorCode,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
  }
}
