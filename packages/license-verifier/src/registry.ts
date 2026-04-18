import { readFileSync } from "node:fs";
import { LicenseVerifyError } from "./errors.js";
import type { SignerKeyEntry, SignerRegistryJson } from "./types.js";

const KEY_ID_RE = /^[a-z][a-z0-9._-]{2,62}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const STATUSES = new Set(["active", "retired", "revoked"]);
const TRUST_SCOPES = new Set(["production", "fixture"]);

/**
 * 파싱된 레지스트리의 읽기 전용 인덱스. `lookup(key_id)` 가 O(1).
 */
export class SignerRegistry {
  private readonly byId: ReadonlyMap<string, SignerKeyEntry>;

  private constructor(
    readonly raw: SignerRegistryJson,
    byId: ReadonlyMap<string, SignerKeyEntry>,
  ) {
    this.byId = byId;
  }

  static parse(json: unknown): SignerRegistry {
    const registry = validateRegistry(json);
    const byId = new Map<string, SignerKeyEntry>();
    for (const key of registry.keys) {
      if (byId.has(key.key_id)) {
        throw new LicenseVerifyError(
          `duplicate key_id in registry: ${key.key_id}`,
          "INVALID_REGISTRY",
          { key_id: key.key_id },
        );
      }
      byId.set(key.key_id, key);
    }
    return new SignerRegistry(registry, byId);
  }

  static loadFromFile(path: string): SignerRegistry {
    const text = readFileSync(path, "utf8");
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      throw new LicenseVerifyError(
        `registry file is not valid JSON: ${(err as Error).message}`,
        "INVALID_REGISTRY",
        { path },
      );
    }
    return SignerRegistry.parse(parsed);
  }

  lookup(keyId: string): SignerKeyEntry | null {
    return this.byId.get(keyId) ?? null;
  }

  get version(): string {
    return this.raw.registry_version;
  }

  get size(): number {
    return this.byId.size;
  }
}

function validateRegistry(json: unknown): SignerRegistryJson {
  if (!isObject(json)) {
    throw new LicenseVerifyError(
      "registry must be an object",
      "INVALID_REGISTRY",
    );
  }
  if (json.schema_version !== "v1") {
    throw new LicenseVerifyError(
      `registry schema_version must be "v1" (got ${String(json.schema_version)})`,
      "INVALID_REGISTRY",
    );
  }
  if (typeof json.registry_version !== "string" ||
      !/^[0-9]{4}\.[0-9]{2}\.[0-9]{2}$/.test(json.registry_version)) {
    throw new LicenseVerifyError(
      "registry_version must match YYYY.MM.DD",
      "INVALID_REGISTRY",
      { got: json.registry_version },
    );
  }
  if (!Array.isArray(json.keys) || json.keys.length === 0) {
    throw new LicenseVerifyError(
      "registry.keys must be a non-empty array",
      "INVALID_REGISTRY",
    );
  }
  const keys: SignerKeyEntry[] = json.keys.map((entry, idx) =>
    validateKeyEntry(entry, idx),
  );
  return {
    schema_version: "v1",
    registry_version: json.registry_version,
    keys,
  };
}

function validateKeyEntry(entry: unknown, idx: number): SignerKeyEntry {
  if (!isObject(entry)) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}] must be an object`,
      "INVALID_REGISTRY",
    );
  }
  const keyId = entry.key_id;
  if (typeof keyId !== "string" || !KEY_ID_RE.test(keyId)) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].key_id invalid`,
      "INVALID_REGISTRY",
      { idx, key_id: keyId },
    );
  }
  if (entry.algorithm !== "ed25519") {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].algorithm must be "ed25519"`,
      "INVALID_REGISTRY",
      { idx, algorithm: entry.algorithm },
    );
  }
  const publicKey = entry.public_key;
  if (typeof publicKey !== "string" || !HEX64_RE.test(publicKey)) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].public_key must be 64 hex chars`,
      "INVALID_REGISTRY",
      { idx },
    );
  }
  const status = entry.status;
  if (typeof status !== "string" || !STATUSES.has(status)) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].status invalid`,
      "INVALID_REGISTRY",
      { idx, status },
    );
  }
  const trustScope = entry.trust_scope;
  if (typeof trustScope !== "string" || !TRUST_SCOPES.has(trustScope)) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].trust_scope invalid`,
      "INVALID_REGISTRY",
      { idx, trust_scope: trustScope },
    );
  }
  if (typeof entry.not_before !== "string" || Number.isNaN(Date.parse(entry.not_before))) {
    throw new LicenseVerifyError(
      `registry.keys[${idx}].not_before must be RFC3339`,
      "INVALID_REGISTRY",
      { idx, not_before: entry.not_before },
    );
  }
  const notAfter = entry.not_after;
  if (notAfter !== null && notAfter !== undefined) {
    if (typeof notAfter !== "string" || Number.isNaN(Date.parse(notAfter))) {
      throw new LicenseVerifyError(
        `registry.keys[${idx}].not_after must be RFC3339 or null`,
        "INVALID_REGISTRY",
        { idx, not_after: notAfter },
      );
    }
  }
  const out: SignerKeyEntry = {
    key_id: keyId,
    algorithm: "ed25519",
    public_key: publicKey,
    status: status as SignerKeyEntry["status"],
    trust_scope: trustScope as SignerKeyEntry["trust_scope"],
    not_before: entry.not_before,
    not_after: notAfter === undefined ? null : (notAfter as string | null),
  };
  if (typeof entry.issuer === "string") out.issuer = entry.issuer;
  if (typeof entry.note === "string") out.note = entry.note;
  return out;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
