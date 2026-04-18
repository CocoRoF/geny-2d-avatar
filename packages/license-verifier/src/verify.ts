import { createPublicKey, verify as cryptoVerify } from "node:crypto";
import { canonicalJsonBytes, stripSignature } from "./canonical-json.js";
import { LicenseVerifyError } from "./errors.js";
import type { SignerRegistry } from "./registry.js";
import type {
  LicenseDocument,
  ProvenanceDocument,
  SignedDocument,
  SignerKeyEntry,
} from "./types.js";

const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

export interface VerifyOptions {
  /**
   * `production` 이면 `trust_scope === "fixture"` 키로 서명된 문서를 기본 거절.
   * `fixture` 이면 픽스처 키도 허용. 생략 시 `"production"` (안전 기본값).
   */
  trust?: "production" | "fixture";
  /**
   * 검증 시점. 기본은 `new Date()`.
   * 문서의 `expires_at` / 키의 `not_before` / `not_after` 비교에 사용.
   */
  now?: Date;
  /**
   * 이 sha256 과 문서의 `bundle_manifest_sha256` 가 일치해야 함.
   * 생략 시 bundle 결합은 검증하지 않음 (스키마 필드 존재만 확인).
   */
  expectedBundleManifestSha256?: string;
}

export interface VerifyResult {
  ok: true;
  key: SignerKeyEntry;
  trust: "production" | "fixture";
}

/**
 * 라이선스 또는 provenance 문서 모두에 공통인 저수준 검증.
 * 호출자는 먼저 스키마 검증을 수행한 뒤 이 함수를 사용한다.
 */
export function verifySignedDocument(
  doc: SignedDocument,
  registry: SignerRegistry,
  opts: VerifyOptions = {},
): VerifyResult {
  const trust = opts.trust ?? "production";
  const now = opts.now ?? new Date();

  const keyId = doc.signer_key_id;
  const key = registry.lookup(keyId);
  if (!key) {
    throw new LicenseVerifyError(
      `unknown signer_key_id: ${keyId}`,
      "UNKNOWN_KEY",
      { key_id: keyId },
    );
  }

  if (key.status === "revoked") {
    throw new LicenseVerifyError(
      `signer key '${keyId}' is revoked`,
      "KEY_REVOKED",
      { key_id: keyId },
    );
  }

  if (trust === "production" && key.trust_scope === "fixture") {
    throw new LicenseVerifyError(
      `fixture key '${keyId}' rejected in production trust mode`,
      "FIXTURE_KEY_REJECTED",
      { key_id: keyId },
    );
  }

  const notBefore = Date.parse(key.not_before);
  if (!Number.isNaN(notBefore) && now.getTime() < notBefore) {
    throw new LicenseVerifyError(
      `signer key '${keyId}' not yet valid (not_before=${key.not_before})`,
      "KEY_NOT_YET_VALID",
      { key_id: keyId, not_before: key.not_before },
    );
  }
  if (key.not_after) {
    const notAfter = Date.parse(key.not_after);
    if (!Number.isNaN(notAfter) && now.getTime() > notAfter) {
      throw new LicenseVerifyError(
        `signer key '${keyId}' expired at ${key.not_after}`,
        "KEY_EXPIRED",
        { key_id: keyId, not_after: key.not_after },
      );
    }
  }

  if (typeof doc.signature !== "string" || !doc.signature.startsWith("ed25519:")) {
    throw new LicenseVerifyError(
      "signature must be 'ed25519:<base64url>'",
      "BAD_SIGNATURE_FORMAT",
    );
  }
  const sigB64 = doc.signature.slice("ed25519:".length);
  let sigBytes: Buffer;
  try {
    sigBytes = Buffer.from(sigB64, "base64url");
  } catch {
    throw new LicenseVerifyError(
      "signature base64url decode failed",
      "BAD_SIGNATURE_FORMAT",
    );
  }
  if (sigBytes.length !== 64) {
    throw new LicenseVerifyError(
      `ed25519 signature must be 64 bytes (got ${sigBytes.length})`,
      "BAD_SIGNATURE_FORMAT",
    );
  }

  const payload = canonicalJsonBytes(stripSignature(doc));
  const publicKeyObj = createPublicKey({
    key: Buffer.concat([
      SPKI_ED25519_PREFIX,
      Buffer.from(key.public_key, "hex"),
    ]),
    format: "der",
    type: "spki",
  });

  const verified = cryptoVerify(null, Buffer.from(payload), publicKeyObj, sigBytes);
  if (!verified) {
    throw new LicenseVerifyError(
      `signature verification failed for key ${keyId}`,
      "SIGNATURE_MISMATCH",
      { key_id: keyId },
    );
  }

  return { ok: true, key, trust };
}

function assertBundleSha(doc: { bundle_manifest_sha256: string }, expected?: string) {
  if (!expected) return;
  if (doc.bundle_manifest_sha256 !== expected) {
    throw new LicenseVerifyError(
      `bundle_manifest_sha256 mismatch: expected ${expected}, got ${doc.bundle_manifest_sha256}`,
      "BUNDLE_SHA_MISMATCH",
      { expected, actual: doc.bundle_manifest_sha256 },
    );
  }
}

export function verifyLicense(
  doc: LicenseDocument,
  registry: SignerRegistry,
  opts: VerifyOptions = {},
): VerifyResult {
  const now = opts.now ?? new Date();

  if (doc.expires_at) {
    const exp = Date.parse(doc.expires_at);
    if (!Number.isNaN(exp) && now.getTime() > exp) {
      throw new LicenseVerifyError(
        `license expired at ${doc.expires_at}`,
        "DOCUMENT_EXPIRED",
        { license_id: doc.license_id, expires_at: doc.expires_at },
      );
    }
  }
  const issuedAt = Date.parse(doc.issued_at);
  if (!Number.isNaN(issuedAt) && now.getTime() < issuedAt) {
    throw new LicenseVerifyError(
      `license issued in the future (issued_at=${doc.issued_at})`,
      "DOCUMENT_NOT_YET_VALID",
      { license_id: doc.license_id, issued_at: doc.issued_at },
    );
  }

  assertBundleSha(doc, opts.expectedBundleManifestSha256);
  return verifySignedDocument(doc, registry, opts);
}

export function verifyProvenance(
  doc: ProvenanceDocument,
  registry: SignerRegistry,
  opts: VerifyOptions = {},
): VerifyResult {
  assertBundleSha(doc, opts.expectedBundleManifestSha256);
  return verifySignedDocument(doc, registry, opts);
}
