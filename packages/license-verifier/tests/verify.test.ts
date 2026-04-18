import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { createHash, createPrivateKey, sign } from "node:crypto";
import { test } from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  LicenseVerifyError,
  SignerRegistry,
  canonicalJson,
  stripSignature,
  verifyLicense,
  verifyProvenance,
} from "../src/index.js";
import type { LicenseDocument, ProvenanceDocument } from "../src/types.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");

// RFC 8032 §7.1 Test 1 — 저장소 내 샘플 서명과 동일 키 (fixture only).
const RFC8032_TEST1_SEED_HEX =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const RFC8032_TEST1_PUBKEY_HEX =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

function loadSampleRegistry(): SignerRegistry {
  const path = resolve(repoRoot, "infra", "registry", "signer-keys.json");
  return SignerRegistry.loadFromFile(path);
}

function loadLicenseSample(): LicenseDocument {
  const path = resolve(
    repoRoot,
    "samples",
    "avatars",
    "sample-01-aria.license.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as LicenseDocument;
}

function loadProvenanceSample(): ProvenanceDocument {
  const path = resolve(
    repoRoot,
    "samples",
    "avatars",
    "sample-01-aria.provenance.json",
  );
  return JSON.parse(readFileSync(path, "utf8")) as ProvenanceDocument;
}

function bundleSha(stem: string): string {
  const snap = JSON.parse(
    readFileSync(
      resolve(repoRoot, "samples", "avatars", `${stem}.bundle.snapshot.json`),
      "utf8",
    ),
  ) as { files: { path: string; sha256: string }[] };
  const entry = snap.files.find((f) => f.path === "bundle.json");
  if (!entry) throw new Error("missing bundle.json entry");
  return entry.sha256;
}

function signWithFixture<T extends { signature?: unknown }>(doc: T): string {
  const payload = Buffer.from(canonicalJson(stripSignature(doc)), "utf8");
  const der = Buffer.concat([
    PKCS8_ED25519_PREFIX,
    Buffer.from(RFC8032_TEST1_SEED_HEX, "hex"),
  ]);
  const privKey = createPrivateKey({ key: der, format: "der", type: "pkcs8" });
  const sigBytes = sign(null, payload, privKey);
  return "ed25519:" + sigBytes.toString("base64url");
}

// ----------- Registry parsing -----------

test("SignerRegistry.loadFromFile resolves fixture key", () => {
  const registry = loadSampleRegistry();
  const key = registry.lookup("geny.fixture.rfc8032-test1");
  assert.ok(key, "fixture key present");
  assert.equal(key?.algorithm, "ed25519");
  assert.equal(key?.public_key, RFC8032_TEST1_PUBKEY_HEX);
  assert.equal(key?.status, "active");
  assert.equal(key?.trust_scope, "fixture");
});

test("SignerRegistry.parse rejects duplicate key_id", () => {
  const reg = {
    schema_version: "v1",
    registry_version: "2026.04.18",
    keys: [
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: RFC8032_TEST1_PUBKEY_HEX,
        status: "active",
        trust_scope: "fixture",
        not_before: "2026-04-01T00:00:00Z",
      },
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: RFC8032_TEST1_PUBKEY_HEX,
        status: "active",
        trust_scope: "fixture",
        not_before: "2026-04-01T00:00:00Z",
      },
    ],
  };
  assert.throws(() => SignerRegistry.parse(reg), (err: unknown) => {
    return err instanceof LicenseVerifyError && err.code === "INVALID_REGISTRY";
  });
});

test("SignerRegistry rejects invalid hex public_key", () => {
  const reg = {
    schema_version: "v1",
    registry_version: "2026.04.18",
    keys: [
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: "ZZZ",
        status: "active",
        trust_scope: "fixture",
        not_before: "2026-04-01T00:00:00Z",
      },
    ],
  };
  assert.throws(() => SignerRegistry.parse(reg), (err: unknown) => {
    return err instanceof LicenseVerifyError && err.code === "INVALID_REGISTRY";
  });
});

// ----------- Happy path -----------

test("verifyLicense passes on aria sample with fixture trust", () => {
  const registry = loadSampleRegistry();
  const license = loadLicenseSample();
  const result = verifyLicense(license, registry, {
    trust: "fixture",
    now: new Date("2026-04-18T12:00:00Z"),
  });
  assert.equal(result.ok, true);
  assert.equal(result.key.key_id, "geny.fixture.rfc8032-test1");
  assert.equal(result.trust, "fixture");
});

test("verifyProvenance passes on aria sample with fixture trust", () => {
  const registry = loadSampleRegistry();
  const prov = loadProvenanceSample();
  const result = verifyProvenance(prov, registry, {
    trust: "fixture",
    now: new Date("2026-04-18T12:00:00Z"),
  });
  assert.equal(result.ok, true);
});

test("verifyLicense passes with expectedBundleManifestSha256", () => {
  const registry = loadSampleRegistry();
  const license = loadLicenseSample();
  const expected = bundleSha("sample-01-aria");
  const result = verifyLicense(license, registry, {
    trust: "fixture",
    expectedBundleManifestSha256: expected,
    now: new Date("2026-04-18T12:00:00Z"),
  });
  assert.equal(result.ok, true);
});

// ----------- Failure modes -----------

test("production trust rejects fixture key", () => {
  const registry = loadSampleRegistry();
  const license = loadLicenseSample();
  try {
    verifyLicense(license, registry, {
      trust: "production",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "FIXTURE_KEY_REJECTED");
  }
});

test("unknown signer_key_id → UNKNOWN_KEY", () => {
  const registry = loadSampleRegistry();
  const license = { ...loadLicenseSample(), signer_key_id: "geny.fixture.unknown" };
  try {
    verifyLicense(license, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "UNKNOWN_KEY");
  }
});

test("revoked key rejected", () => {
  const registry = SignerRegistry.parse({
    schema_version: "v1",
    registry_version: "2026.04.18",
    keys: [
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: RFC8032_TEST1_PUBKEY_HEX,
        status: "revoked",
        trust_scope: "fixture",
        not_before: "2026-04-01T00:00:00Z",
      },
    ],
  });
  try {
    verifyLicense(loadLicenseSample(), registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "KEY_REVOKED");
  }
});

test("expired key rejected", () => {
  const registry = SignerRegistry.parse({
    schema_version: "v1",
    registry_version: "2026.04.18",
    keys: [
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: RFC8032_TEST1_PUBKEY_HEX,
        status: "retired",
        trust_scope: "fixture",
        not_before: "2026-04-01T00:00:00Z",
        not_after: "2026-04-10T00:00:00Z",
      },
    ],
  });
  try {
    verifyLicense(loadLicenseSample(), registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "KEY_EXPIRED");
  }
});

test("key not yet valid rejected", () => {
  const registry = SignerRegistry.parse({
    schema_version: "v1",
    registry_version: "2026.04.18",
    keys: [
      {
        key_id: "geny.fixture.rfc8032-test1",
        algorithm: "ed25519",
        public_key: RFC8032_TEST1_PUBKEY_HEX,
        status: "active",
        trust_scope: "fixture",
        not_before: "2030-04-01T00:00:00Z",
      },
    ],
  });
  try {
    verifyLicense(loadLicenseSample(), registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "KEY_NOT_YET_VALID");
  }
});

test("tampered payload → SIGNATURE_MISMATCH", () => {
  const registry = loadSampleRegistry();
  const license = loadLicenseSample();
  const tampered = { ...license, license_type: "enterprise" };
  try {
    verifyLicense(tampered, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "SIGNATURE_MISMATCH");
  }
});

test("malformed signature format → BAD_SIGNATURE_FORMAT", () => {
  const registry = loadSampleRegistry();
  const license = { ...loadLicenseSample(), signature: "rsa:abc" };
  try {
    verifyLicense(license, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "BAD_SIGNATURE_FORMAT");
  }
});

test("bundle sha mismatch rejected", () => {
  const registry = loadSampleRegistry();
  const license = loadLicenseSample();
  try {
    verifyLicense(license, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
      expectedBundleManifestSha256: "0".repeat(64),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "BUNDLE_SHA_MISMATCH");
  }
});

test("document expired rejected", () => {
  const registry = loadSampleRegistry();
  const license: LicenseDocument = {
    ...loadLicenseSample(),
    expires_at: "2026-04-10T00:00:00Z",
  };
  // 재서명: expires_at 변경 때문에.
  license.signature = signWithFixture(license);
  try {
    verifyLicense(license, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "DOCUMENT_EXPIRED");
  }
});

test("document issued in the future rejected", () => {
  const registry = loadSampleRegistry();
  const license: LicenseDocument = {
    ...loadLicenseSample(),
    issued_at: "2030-04-18T10:00:00Z",
  };
  license.signature = signWithFixture(license);
  try {
    verifyLicense(license, registry, {
      trust: "fixture",
      now: new Date("2026-04-18T12:00:00Z"),
    });
    assert.fail("expected throw");
  } catch (err) {
    assert.ok(err instanceof LicenseVerifyError);
    assert.equal((err as LicenseVerifyError).code, "DOCUMENT_NOT_YET_VALID");
  }
});

test("sign-then-verify round trip (cross-check with sign-fixture algorithm)", () => {
  const registry = loadSampleRegistry();
  const license: LicenseDocument = {
    ...loadLicenseSample(),
    issued_at: "2026-04-18T11:30:00Z",
  };
  license.signature = signWithFixture(license);
  const result = verifyLicense(license, registry, {
    trust: "fixture",
    now: new Date("2026-04-18T12:00:00Z"),
  });
  assert.equal(result.ok, true);
});

test("canonical json matches bundle sha format", () => {
  // Canonicalization은 문서 외적 속성(키 순서 등)에 불변이어야 한다.
  const a = { b: 1, a: 2 };
  const b = { a: 2, b: 1 };
  assert.equal(canonicalJson(a), canonicalJson(b));
  // bundle sha 계산 스모크 — 테스트용 해시가 실제 sha256 임을 확인.
  const hash = createHash("sha256").update("abc").digest("hex");
  assert.equal(hash.length, 64);
});
