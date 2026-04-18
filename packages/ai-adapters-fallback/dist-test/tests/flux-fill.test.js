/**
 * docs/05 §2.3 — FluxFillAdapter capability matrix (mask only).
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { FluxFillAdapter } from "../src/flux-fill-adapter.js";
function makeTask(slot, caps, overrides = {}) {
    return {
        schema_version: "v1",
        task_id: `task.${slot}.flux`,
        slot_id: slot,
        prompt: `${slot} flux-fill probe`,
        negative_prompt: "text, watermark",
        size: [1024, 1024],
        deadline_ms: 60000,
        budget_usd: 0.05,
        idempotency_key: `idem-${slot}-flux`,
        capability_required: caps,
        reference_image_sha256: "a".repeat(64),
        mask_sha256: "b".repeat(64),
        ...overrides,
    };
}
test("flux-fill: declares capability = {mask} only", () => {
    const a = new FluxFillAdapter();
    assert.deepEqual(a.meta.capability, ["mask"]);
});
test("flux-fill: routing_weight defaults to 70 (below sdxl)", () => {
    const a = new FluxFillAdapter();
    assert.equal(a.meta.routing_weight, 70);
});
test("flux-fill: generate(mask) returns schema-compliant result", async () => {
    const a = new FluxFillAdapter();
    const t = makeTask("face_base", ["mask"]);
    const r = await a.generate(t);
    assert.equal(r.schema_version, "v1");
    assert.equal(r.vendor, "flux-fill");
    assert.match(r.image_sha256, /^[0-9a-f]{64}$/);
    assert.match(r.prompt_sha256, /^[0-9a-f]{64}$/);
    assert.ok(r.bbox && r.bbox[2] > 0 && r.bbox[3] > 0);
    assert.ok(r.cost_usd <= t.budget_usd);
});
test("flux-fill: rejects edit/style_ref — CAPABILITY_MISMATCH", async () => {
    const a = new FluxFillAdapter();
    await assert.rejects(a.generate(makeTask("face_base", ["edit"])), (e) => e.code === "CAPABILITY_MISMATCH");
    await assert.rejects(a.generate(makeTask("face_base", ["style_ref"])), (e) => e.code === "CAPABILITY_MISMATCH");
});
test("flux-fill: missing reference_image → CAPABILITY_MISMATCH", async () => {
    const a = new FluxFillAdapter();
    await assert.rejects(a.generate(makeTask("face_base", ["mask"], { reference_image_sha256: null })), (e) => e.code === "CAPABILITY_MISMATCH");
});
test("flux-fill: missing mask → CAPABILITY_MISMATCH", async () => {
    const a = new FluxFillAdapter();
    await assert.rejects(a.generate(makeTask("face_base", ["mask"], { mask_sha256: null })), (e) => e.code === "CAPABILITY_MISMATCH");
});
test("flux-fill: BUDGET_EXCEEDED when estimate > budget", async () => {
    const a = new FluxFillAdapter();
    await assert.rejects(a.generate(makeTask("face_base", ["mask"], { budget_usd: 0.001 })), (e) => e.code === "BUDGET_EXCEEDED");
});
test("flux-fill: deterministic — same task twice → same image_sha256/seed", async () => {
    const a = new FluxFillAdapter();
    const t = makeTask("face_base", ["mask"]);
    const x = await a.generate(t);
    const y = await a.generate(t);
    assert.equal(x.image_sha256, y.image_sha256);
    assert.equal(x.seed, y.seed);
});
test("flux-fill: different mask → different image_sha256", async () => {
    const a = new FluxFillAdapter();
    const t1 = makeTask("face_base", ["mask"], { mask_sha256: "b".repeat(64) });
    const t2 = makeTask("face_base", ["mask"], { mask_sha256: "c".repeat(64) });
    const x = await a.generate(t1);
    const y = await a.generate(t2);
    assert.notEqual(x.image_sha256, y.image_sha256);
});
test("flux-fill: estimateCost scales with size", () => {
    const a = new FluxFillAdapter();
    const s = a.estimateCost(makeTask("face_base", ["mask"], { size: [1024, 1024] }));
    const l = a.estimateCost(makeTask("face_base", ["mask"], { size: [4096, 4096] }));
    assert.ok(l > s);
});
test("flux-fill: probe returns ok for mock", async () => {
    const a = new FluxFillAdapter();
    const p = await a.probe();
    assert.equal(p.ok, true);
});
//# sourceMappingURL=flux-fill.test.js.map