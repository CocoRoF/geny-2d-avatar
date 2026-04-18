/**
 * docs/05 §2.3 — SDXLAdapter capability matrix + deterministic behavior.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { SDXLAdapter } from "../src/sdxl-adapter.js";
function makeTask(slot, caps, overrides = {}) {
    return {
        schema_version: "v1",
        task_id: `task.${slot}.sdxl`,
        slot_id: slot,
        prompt: `${slot} sdxl probe`,
        negative_prompt: "text, watermark",
        size: [1024, 1024],
        deadline_ms: 60000,
        budget_usd: 0.05,
        idempotency_key: `idem-${slot}-sdxl`,
        capability_required: caps,
        ...overrides,
    };
}
test("sdxl: declares capability = {edit, style_ref} only", () => {
    const a = new SDXLAdapter();
    assert.deepEqual(a.meta.capability.slice().sort(), ["edit", "style_ref"]);
});
test("sdxl: routing_weight defaults to 80 (below nano-banana)", () => {
    const a = new SDXLAdapter();
    assert.equal(a.meta.routing_weight, 80);
});
test("sdxl: generate(edit) returns schema-compliant result", async () => {
    const a = new SDXLAdapter();
    const t = makeTask("hair_front", ["edit"]);
    const r = await a.generate(t);
    assert.equal(r.schema_version, "v1");
    assert.equal(r.vendor, "sdxl");
    assert.match(r.image_sha256, /^[0-9a-f]{64}$/);
    assert.match(r.prompt_sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.bbox && r.bbox[2] > 0 && r.bbox[3] > 0);
    assert.ok(r.cost_usd <= t.budget_usd);
});
test("sdxl: generate(style_ref) supported", async () => {
    const a = new SDXLAdapter();
    const r = await a.generate(makeTask("outfit_upper", ["style_ref"], {
        style_reference_sha256: ["a".repeat(64)],
    }));
    assert.match(r.image_sha256, /^[0-9a-f]{64}$/);
});
test("sdxl: mask capability is rejected — CAPABILITY_MISMATCH", async () => {
    const a = new SDXLAdapter();
    await assert.rejects(a.generate(makeTask("face_base", ["mask"], { mask_sha256: "b".repeat(64) })), (e) => e.code === "CAPABILITY_MISMATCH");
});
test("sdxl: upscale capability rejected", async () => {
    const a = new SDXLAdapter();
    await assert.rejects(a.generate(makeTask("hair_front", ["upscale"])), (e) => e.code === "CAPABILITY_MISMATCH");
});
test("sdxl: BUDGET_EXCEEDED when estimate exceeds budget", async () => {
    const a = new SDXLAdapter();
    await assert.rejects(a.generate(makeTask("hair_front", ["edit"], { budget_usd: 0.001 })), (e) => e.code === "BUDGET_EXCEEDED");
});
test("sdxl: deterministic — same task twice → same image_sha256/seed", async () => {
    const a = new SDXLAdapter();
    const t = makeTask("hair_front", ["edit"]);
    const x = await a.generate(t);
    const y = await a.generate(t);
    assert.equal(x.image_sha256, y.image_sha256);
    assert.equal(x.seed, y.seed);
    assert.equal(x.prompt_sha256, y.prompt_sha256);
});
test("sdxl: estimateCost scales with size", () => {
    const a = new SDXLAdapter();
    const s = a.estimateCost(makeTask("hair_front", ["edit"], { size: [1024, 1024] }));
    const m = a.estimateCost(makeTask("hair_front", ["edit"], { size: [2048, 2048] }));
    const l = a.estimateCost(makeTask("hair_front", ["edit"], { size: [4096, 4096] }));
    assert.ok(m > s);
    assert.ok(l > m);
});
test("sdxl: INVALID_OUTPUT if client returns bad sha", async () => {
    const a = new SDXLAdapter({
        client: {
            modelVersion: "mock-bad",
            costPerCallUsd: 0.008,
            async invoke() {
                return {
                    image_sha256: "not-a-sha",
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
    await assert.rejects(a.generate(makeTask("hair_front", ["edit"])), (e) => e.code === "INVALID_OUTPUT");
});
test("sdxl: probe returns ok for mock", async () => {
    const a = new SDXLAdapter();
    const p = await a.probe();
    assert.equal(p.ok, true);
    assert.match(p.checked_at, /^\d{4}-\d{2}-\d{2}T/);
});
//# sourceMappingURL=sdxl.test.js.map