import { strict as assert } from "node:assert";
import { test } from "node:test";

import { AdapterError, AdapterRegistry } from "../src/index.js";
import type {
  AIAdapter,
  AdapterMeta,
  Capability,
  GenerationResult,
  GenerationTask,
  ProbeReport,
} from "../src/index.js";

function makeStubAdapter(meta: AdapterMeta, cost: number): AIAdapter {
  return {
    meta,
    estimateCost: () => cost,
    async probe(): Promise<ProbeReport> {
      return { ok: true, latency_ms: 1, checked_at: new Date().toISOString() };
    },
    async generate(task: GenerationTask): Promise<GenerationResult> {
      return {
        schema_version: "v1",
        task_id: task.task_id,
        slot_id: task.slot_id,
        image_sha256: "0".repeat(64),
        alpha_sha256: null,
        bbox: [0, 0, task.size[0], task.size[1]],
        vendor: meta.name,
        model_version: meta.version,
        seed: 0,
        prompt_sha256: "0".repeat(64),
        cost_usd: cost,
        latency_ms: 10,
        completed_at: new Date().toISOString(),
      };
    },
  };
}

function makeTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "task.hair-front.001",
    slot_id: "hair_front",
    prompt: "clean thin line pink hair",
    negative_prompt: "face, background",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: "idem-001",
    capability_required: ["edit"],
    ...overrides,
  };
}

test("AdapterRegistry: duplicate registration rejected", () => {
  const r = new AdapterRegistry();
  const caps: Capability[] = ["edit"];
  r.register(makeStubAdapter({ name: "a", version: "1", capability: caps, cost_per_call_usd: 0.01, max_parallel: 4, routing_weight: 100 }, 0.01));
  assert.throws(() =>
    r.register(
      makeStubAdapter(
        { name: "a", version: "1", capability: caps, cost_per_call_usd: 0.02, max_parallel: 4, routing_weight: 50 },
        0.02,
      ),
    ),
  );
});

test("AdapterRegistry.route: capability-match only", () => {
  const r = new AdapterRegistry();
  r.register(
    makeStubAdapter(
      { name: "edit-only", version: "1", capability: ["edit"], cost_per_call_usd: 0.01, max_parallel: 4, routing_weight: 100 },
      0.01,
    ),
  );
  r.register(
    makeStubAdapter(
      { name: "seg-only", version: "1", capability: ["seg"], cost_per_call_usd: 0.01, max_parallel: 4, routing_weight: 100 },
      0.01,
    ),
  );
  const picked = r.route(makeTask({ capability_required: ["edit"] }));
  assert.equal(picked.length, 1);
  assert.equal(picked[0]?.meta.name, "edit-only");
});

test("AdapterRegistry.route: budget filters out expensive adapters", () => {
  const r = new AdapterRegistry();
  r.register(
    makeStubAdapter(
      { name: "cheap", version: "1", capability: ["edit"], cost_per_call_usd: 0.01, max_parallel: 4, routing_weight: 50 },
      0.01,
    ),
  );
  r.register(
    makeStubAdapter(
      { name: "expensive", version: "1", capability: ["edit"], cost_per_call_usd: 1.0, max_parallel: 4, routing_weight: 100 },
      1.0,
    ),
  );
  const picked = r.route(makeTask({ budget_usd: 0.05, capability_required: ["edit"] }));
  assert.equal(picked.length, 1);
  assert.equal(picked[0]?.meta.name, "cheap");
});

test("AdapterRegistry.route: ordered by routing_weight desc, then cost asc, then name asc", () => {
  const r = new AdapterRegistry();
  r.register(
    makeStubAdapter(
      { name: "b-mid", version: "1", capability: ["edit"], cost_per_call_usd: 0.02, max_parallel: 4, routing_weight: 50 },
      0.02,
    ),
  );
  r.register(
    makeStubAdapter(
      { name: "a-top", version: "1", capability: ["edit"], cost_per_call_usd: 0.03, max_parallel: 4, routing_weight: 100 },
      0.03,
    ),
  );
  r.register(
    makeStubAdapter(
      { name: "c-top", version: "1", capability: ["edit"], cost_per_call_usd: 0.02, max_parallel: 4, routing_weight: 100 },
      0.02,
    ),
  );
  const names = r.route(makeTask({ budget_usd: 1 })).map((a) => a.meta.name);
  assert.deepEqual(names, ["c-top", "a-top", "b-mid"]);
});

test("AdapterRegistry.route: NO_ELIGIBLE_ADAPTER when none matches", () => {
  const r = new AdapterRegistry();
  r.register(
    makeStubAdapter(
      { name: "edit", version: "1", capability: ["edit"], cost_per_call_usd: 0.01, max_parallel: 4, routing_weight: 100 },
      0.01,
    ),
  );
  assert.throws(
    () => r.route(makeTask({ capability_required: ["upscale"] })),
    (err: unknown) =>
      err instanceof AdapterError && err.code === "NO_ELIGIBLE_ADAPTER",
  );
});
