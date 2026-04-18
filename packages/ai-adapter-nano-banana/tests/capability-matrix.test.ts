/**
 * docs/05 §13.1 — capability matrix offline test.
 * 동일 입력에 대해 어댑터가:
 *   (a) 선언된 capability 를 모두 처리하는지,
 *   (b) 결과 계약(alpha/bbox/latency 상한) 을 지키는지
 * 를 증명한다. 새 어댑터를 카탈로그에 편입할 때 이 테스트를 통과해야 한다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import type { Capability, GenerationTask } from "@geny/ai-adapter-core";

import { NanoBananaAdapter } from "../src/adapter.js";

function makeTask(
  slot: string,
  caps: Capability[],
  overrides: Partial<GenerationTask> = {},
): GenerationTask {
  return {
    schema_version: "v1",
    task_id: `task.${slot}.cap`,
    slot_id: slot,
    prompt: `${slot} capability probe`,
    negative_prompt: "text, watermark",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: `idem-${slot}-cap`,
    capability_required: caps,
    ...overrides,
  };
}

test("nano-banana: declares capability = {edit, style_ref, mask}", () => {
  const adapter = new NanoBananaAdapter();
  assert.deepEqual(
    adapter.meta.capability.slice().sort(),
    ["edit", "mask", "style_ref"],
  );
});

test("nano-banana: generate(edit) returns schema-compliant result", async () => {
  const adapter = new NanoBananaAdapter();
  const task = makeTask("hair_front", ["edit"]);
  const r = await adapter.generate(task);
  assert.equal(r.schema_version, "v1");
  assert.equal(r.slot_id, "hair_front");
  assert.match(r.image_sha256, /^[0-9a-f]{64}$/);
  assert.match(r.prompt_sha256, /^[0-9a-f]{64}$/);
  assert.ok(r.bbox && r.bbox[2] > 0 && r.bbox[3] > 0, "bbox non-empty");
  assert.ok(r.latency_ms >= 0 && r.latency_ms <= 1000, "latency within bound");
  assert.ok(r.cost_usd <= task.budget_usd, "cost within budget");
});

test("nano-banana: generate(style_ref + mask) supported", async () => {
  const adapter = new NanoBananaAdapter();
  const r = await adapter.generate(
    makeTask("face_base", ["edit", "style_ref", "mask"], {
      style_reference_sha256: ["a".repeat(64)],
      mask_sha256: "b".repeat(64),
    }),
  );
  assert.match(r.image_sha256, /^[0-9a-f]{64}$/);
});

test("nano-banana: rejects unsupported capability with CAPABILITY_MISMATCH", async () => {
  const adapter = new NanoBananaAdapter();
  await assert.rejects(
    adapter.generate(makeTask("upscale_test", ["upscale"])),
    (err: unknown) =>
      (err as { code?: string }).code === "CAPABILITY_MISMATCH",
  );
});

test("nano-banana: BUDGET_EXCEEDED when estimate > budget", async () => {
  const adapter = new NanoBananaAdapter();
  await assert.rejects(
    adapter.generate(
      makeTask("hair_front", ["edit"], { budget_usd: 0.001 }),
    ),
    (err: unknown) => (err as { code?: string }).code === "BUDGET_EXCEEDED",
  );
});

test("nano-banana: deterministic — same task twice → same image_sha256, seed, prompt_sha256", async () => {
  const adapter = new NanoBananaAdapter();
  const task = makeTask("hair_front", ["edit"]);
  const a = await adapter.generate(task);
  const b = await adapter.generate(task);
  assert.equal(a.image_sha256, b.image_sha256);
  assert.equal(a.seed, b.seed);
  assert.equal(a.prompt_sha256, b.prompt_sha256);
});

test("nano-banana: DEADLINE_EXCEEDED when client never resolves", async () => {
  const adapter = new NanoBananaAdapter({
    client: {
      modelVersion: "mock-slow",
      costPerCallUsd: 0.01,
      async invoke() {
        await new Promise((resolve) => setTimeout(resolve, 500));
        return {
          image_sha256: "0".repeat(64),
          alpha_sha256: null,
          bbox: [0, 0, 1, 1],
          latency_ms: 500,
          vendor_metadata: {},
        };
      },
      async health() {
        return { ok: true, latencyMs: 1 };
      },
    },
  });
  await assert.rejects(
    adapter.generate(
      makeTask("hair_front", ["edit"], { deadline_ms: 100 }),
    ),
    (err: unknown) =>
      (err as { code?: string }).code === "DEADLINE_EXCEEDED",
  );
});

test("nano-banana: INVALID_OUTPUT if vendor returns bad sha", async () => {
  const adapter = new NanoBananaAdapter({
    client: {
      modelVersion: "mock-bad",
      costPerCallUsd: 0.01,
      async invoke() {
        return {
          image_sha256: "not-a-sha",
          alpha_sha256: null,
          bbox: [0, 0, 1, 1],
          latency_ms: 1,
          vendor_metadata: {},
        };
      },
      async health() {
        return { ok: true, latencyMs: 1 };
      },
    },
  });
  await assert.rejects(
    adapter.generate(makeTask("hair_front", ["edit"])),
    (err: unknown) =>
      (err as { code?: string }).code === "INVALID_OUTPUT",
  );
});

test("nano-banana: probe returns ok for mock client", async () => {
  const adapter = new NanoBananaAdapter();
  const p = await adapter.probe();
  assert.equal(p.ok, true);
  assert.match(p.checked_at, /^\d{4}-\d{2}-\d{2}T/);
});

test("nano-banana: estimateCost scales with size", () => {
  const adapter = new NanoBananaAdapter();
  const small = adapter.estimateCost(makeTask("hair_front", ["edit"], { size: [1024, 1024] }));
  const mid = adapter.estimateCost(makeTask("hair_front", ["edit"], { size: [2048, 2048] }));
  const large = adapter.estimateCost(makeTask("hair_front", ["edit"], { size: [4096, 4096] }));
  assert.ok(mid > small);
  assert.ok(large > mid);
});
