import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildProvenancePartEntry } from "../src/provenance.js";
import type { GenerationResult, GenerationTask } from "../src/types.js";

function mkTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "task.hair-front.001",
    slot_id: "hair_front",
    prompt: "pink hair",
    negative_prompt: "face",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: "idem-hair-001",
    reference_image_sha256: "a".repeat(64),
    ...overrides,
  };
}

function mkResult(overrides: Partial<GenerationResult> = {}): GenerationResult {
  return {
    schema_version: "v1",
    task_id: "task.hair-front.001",
    slot_id: "hair_front",
    image_sha256: "b".repeat(64),
    alpha_sha256: null,
    bbox: [0, 0, 1024, 1024],
    vendor: "nano-banana",
    model_version: "mock-2026.04.18",
    seed: 42,
    prompt_sha256: "c".repeat(64),
    cost_usd: 0.015,
    latency_ms: 120,
    completed_at: "2026-04-18T12:00:00Z",
    ...overrides,
  };
}

test("buildProvenancePartEntry: matches provenance.schema.json shape", () => {
  const entry = buildProvenancePartEntry(mkTask(), mkResult());
  assert.deepEqual(entry, {
    slot_id: "hair_front",
    source_type: "ai_generated",
    vendor: "nano-banana",
    model_version: "mock-2026.04.18",
    seed: 42,
    prompt_sha256: "c".repeat(64),
    source_asset_sha256: "a".repeat(64),
  });
});

test("buildProvenancePartEntry: null reference → null source_asset_sha256", () => {
  const entry = buildProvenancePartEntry(
    mkTask({ reference_image_sha256: null }),
    mkResult(),
  );
  assert.equal(entry.source_asset_sha256, null);
});

test("buildProvenancePartEntry: rejects slot_id mismatch", () => {
  assert.throws(
    () =>
      buildProvenancePartEntry(
        mkTask({ slot_id: "hair_front" }),
        mkResult({ slot_id: "hair_back" }),
      ),
    /provenance: task.slot_id/,
  );
});

test("buildProvenancePartEntry: rejects task_id mismatch", () => {
  assert.throws(
    () =>
      buildProvenancePartEntry(
        mkTask({ task_id: "task.a" }),
        mkResult({ task_id: "task.b" }),
      ),
    /provenance: task.task_id/,
  );
});
