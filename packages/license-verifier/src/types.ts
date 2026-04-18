/**
 * `@geny/license-verifier` 가 소비하는 도메인 타입.
 *
 * 권위 정의는 `schema/v1/{license,provenance,signer-registry}.schema.json`.
 * 여기서는 검증기가 직접 참조하는 최소 필드만 선언 — 모든 선택 필드는 `unknown`
 * 으로 허용해 향후 스키마 확장 시 타입 변경 없이 통과한다.
 */

export type SignerKeyStatus = "active" | "retired" | "revoked";
export type SignerKeyTrustScope = "production" | "fixture";

export interface SignerKeyEntry {
  key_id: string;
  algorithm: "ed25519";
  public_key: string;
  status: SignerKeyStatus;
  trust_scope: SignerKeyTrustScope;
  not_before: string;
  not_after?: string | null;
  issuer?: string;
  note?: string;
}

export interface SignerRegistryJson {
  schema_version: "v1";
  registry_version: string;
  keys: SignerKeyEntry[];
}

export interface SignedDocument {
  schema_version: "v1";
  signer_key_id: string;
  signature: string;
  [key: string]: unknown;
}

export interface LicenseDocument extends SignedDocument {
  license_id: string;
  avatar_id: string;
  template_id: string;
  template_version: string;
  bundle_manifest_sha256: string;
  issued_at: string;
  expires_at: string | null;
  platform_terms_version: string;
  owner: unknown;
  license_type: string;
  usage_rights: string[];
  restrictions: string[];
}

export interface ProvenanceDocument extends SignedDocument {
  avatar_id: string;
  template_id: string;
  template_version: string;
  bundle_manifest_sha256: string;
  parts: unknown[];
  post_processing: unknown[];
  generated_at: string;
}
