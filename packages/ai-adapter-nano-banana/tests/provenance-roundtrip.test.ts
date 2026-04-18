/**
 * 세션 22 통합 테스트: nano-banana 어댑터 결과 → provenance `ai_generated` 엔트리
 * → `@geny/license-verifier` 로 서명/검증 전체 경로가 계약대로 동작함을 보장.
 *
 * 시나리오: aria 샘플 provenance 의 `hair_front` 엔트리를 어댑터 재호출 결과로 교체하고
 *          fixture 키로 재서명한 뒤, verifyProvenance 가 통과해야 한다.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createPrivateKey, sign } from "node:crypto";
import { test } from "node:test";

import { buildProvenancePartEntry } from "@geny/ai-adapter-core";
import type { GenerationTask } from "@geny/ai-adapter-core";
import {
  SignerRegistry,
  canonicalJson,
  stripSignature,
  verifyProvenance,
} from "@geny/license-verifier";
import type { ProvenanceDocument } from "@geny/license-verifier";

import { NanoBananaAdapter } from "../src/adapter.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");

const RFC8032_TEST1_SEED_HEX =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const PKCS8_ED25519_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function loadRegistry(): SignerRegistry {
  return SignerRegistry.loadFromFile(
    resolve(repoRoot, "infra", "registry", "signer-keys.json"),
  );
}

function loadProvenance(): ProvenanceDocument {
  return JSON.parse(
    readFileSync(
      resolve(repoRoot, "samples", "avatars", "sample-01-aria.provenance.json"),
      "utf8",
    ),
  ) as ProvenanceDocument;
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

test("adapter → provenance → license-verifier round trip", async () => {
  const adapter = new NanoBananaAdapter();
  const task: GenerationTask = {
    schema_version: "v1",
    task_id: "task.hair-front.roundtrip",
    slot_id: "hair_front",
    prompt: "aria hair_front test",
    negative_prompt: "face, background",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: "idem-roundtrip-hair-front",
    capability_required: ["edit"],
  };
  const result = await adapter.generate(task);
  const partEntry = buildProvenancePartEntry(task, result);
  assert.equal(partEntry.source_type, "ai_generated");
  assert.equal(partEntry.vendor, "nano-banana");
  assert.match(partEntry.prompt_sha256, /^[0-9a-f]{64}$/);

  // 기존 provenance 의 hair_front 엔트리를 어댑터 결과로 교체.
  const original = loadProvenance();
  type AiPart = {
    slot_id: string;
    source_type: string;
    vendor: string | null;
    model_version: string | null;
    seed: number | null;
    prompt_sha256: string | null;
    source_asset_sha256: string | null;
  };
  const parts = (original.parts as AiPart[]).map((p) =>
    p.slot_id === "hair_front"
      ? {
          slot_id: partEntry.slot_id,
          source_type: partEntry.source_type,
          vendor: partEntry.vendor,
          model_version: partEntry.model_version,
          seed: partEntry.seed,
          prompt_sha256: partEntry.prompt_sha256,
          source_asset_sha256: partEntry.source_asset_sha256,
        }
      : p,
  );
  const updated: ProvenanceDocument = {
    ...original,
    parts,
  };
  updated.signature = signWithFixture(updated);

  const registry = loadRegistry();
  const verify = verifyProvenance(updated, registry, {
    trust: "fixture",
    now: new Date("2026-04-18T12:00:00Z"),
  });
  assert.equal(verify.ok, true);
});
