/**
 * docs/05 §2.3 — AdapterRegistry.route() 폴백 순서 증명.
 *
 *   edit / style_ref → nano-banana(100) > sdxl(80)
 *   mask             → nano-banana(100) > flux-fill(70)
 *
 * nano-banana 가 실패해도 registry.route() 는 정렬된 후보 리스트를 내려주므로,
 * "다음 후보" 를 깎아가며 처리하는 것만으로 자동 폴백이 된다.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AdapterRegistry, } from "@geny/ai-adapter-core";
import { NanoBananaAdapter } from "@geny/ai-adapter-nano-banana";
import { FluxFillAdapter } from "../src/flux-fill-adapter.js";
import { SDXLAdapter } from "../src/sdxl-adapter.js";
function buildRegistry() {
    const r = new AdapterRegistry();
    r.register(new NanoBananaAdapter());
    r.register(new SDXLAdapter());
    r.register(new FluxFillAdapter());
    return r;
}
function makeTask(slot, caps, overrides = {}) {
    return {
        schema_version: "v1",
        task_id: `task.${slot}.router`,
        slot_id: slot,
        prompt: `${slot} router probe`,
        negative_prompt: "text, watermark",
        size: [1024, 1024],
        deadline_ms: 60000,
        budget_usd: 0.05,
        idempotency_key: `idem-${slot}-router`,
        capability_required: caps,
        ...overrides,
    };
}
test("router: edit → [nano-banana, sdxl] in that order", () => {
    const r = buildRegistry();
    const candidates = r.route(makeTask("hair_front", ["edit"]));
    const names = candidates.map((a) => a.meta.name);
    assert.deepEqual(names, ["nano-banana", "sdxl"]);
});
test("router: style_ref → [nano-banana, sdxl]", () => {
    const r = buildRegistry();
    const candidates = r.route(makeTask("outfit_upper", ["style_ref"], {
        style_reference_sha256: ["a".repeat(64)],
    }));
    assert.deepEqual(candidates.map((a) => a.meta.name), ["nano-banana", "sdxl"]);
});
test("router: mask → [nano-banana, flux-fill] (sdxl excluded)", () => {
    const r = buildRegistry();
    const candidates = r.route(makeTask("face_base", ["mask"], {
        reference_image_sha256: "a".repeat(64),
        mask_sha256: "b".repeat(64),
    }));
    assert.deepEqual(candidates.map((a) => a.meta.name), ["nano-banana", "flux-fill"]);
});
test("router: edit+mask → [nano-banana] only (sdxl/flux-fill both excluded)", () => {
    const r = buildRegistry();
    const candidates = r.route(makeTask("face_base", ["edit", "mask"], {
        reference_image_sha256: "a".repeat(64),
        mask_sha256: "b".repeat(64),
    }));
    assert.deepEqual(candidates.map((a) => a.meta.name), ["nano-banana"]);
});
test("router: fallback — nano-banana 실패 시 sdxl 으로 내려 edit 처리", async () => {
    const r = buildRegistry();
    const task = makeTask("hair_front", ["edit"]);
    const candidates = r.route(task);
    assert.equal(candidates[0]?.meta.name, "nano-banana");
    assert.equal(candidates[1]?.meta.name, "sdxl");
    const primary = candidates[0];
    assert.ok(primary);
    const mocked = Object.create(primary);
    mocked.generate = async () => {
        throw new Error("simulated nano-banana 503");
    };
    let lastError = null;
    let result = null;
    for (const [i, adapter] of candidates.entries()) {
        const a = i === 0 ? mocked : adapter;
        try {
            result = await a.generate(task);
            break;
        }
        catch (err) {
            lastError = err;
        }
    }
    assert.ok(result, `fallback failed; lastError=${String(lastError)}`);
    assert.equal(result?.vendor, "sdxl");
});
test("router: fallback — mask 는 nano-banana 실패 시 flux-fill 으로만 내려감", async () => {
    const r = buildRegistry();
    const task = makeTask("face_base", ["mask"], {
        reference_image_sha256: "a".repeat(64),
        mask_sha256: "b".repeat(64),
    });
    const candidates = r.route(task);
    assert.equal(candidates.length, 2);
    const secondary = candidates[1];
    assert.ok(secondary);
    const out = await secondary.generate(task);
    assert.equal(out.vendor, "flux-fill");
});
test("router: unsupported capability → NO_ELIGIBLE_ADAPTER", () => {
    const r = buildRegistry();
    assert.throws(() => r.route(makeTask("some_slot", ["upscale"])), (e) => e.code === "NO_ELIGIBLE_ADAPTER");
});
test("router: budget below all candidates → NO_ELIGIBLE_ADAPTER", () => {
    const r = buildRegistry();
    assert.throws(() => r.route(makeTask("hair_front", ["edit"], { budget_usd: 0.0001 })), (e) => e.code === "NO_ELIGIBLE_ADAPTER");
});
test("router: sort is deterministic — weight desc, cost asc, name asc", () => {
    const r = buildRegistry();
    const first = r.route(makeTask("hair_front", ["edit"]));
    const second = r.route(makeTask("hair_front", ["edit"]));
    assert.deepEqual(first.map((a) => a.meta.name), second.map((a) => a.meta.name));
});
//# sourceMappingURL=router-fallback.test.js.map