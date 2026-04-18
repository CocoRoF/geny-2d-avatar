export { canonicalJson, canonicalJsonBytes, stripSignature } from "./canonical-json.js";
export { LicenseVerifyError } from "./errors.js";
export type { LicenseVerifyErrorCode } from "./errors.js";
export { SignerRegistry } from "./registry.js";
export { verifyLicense, verifyProvenance, verifySignedDocument } from "./verify.js";
export type { VerifyOptions, VerifyResult } from "./verify.js";
export type {
  LicenseDocument,
  ProvenanceDocument,
  SignedDocument,
  SignerKeyEntry,
  SignerKeyStatus,
  SignerKeyTrustScope,
  SignerRegistryJson,
} from "./types.js";
