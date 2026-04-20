/**
 * `createNullRenderer` 회귀 — ready/parameterchange 을 구독해 상태만 추적, DOM
 * 조작 없음. 세션 115 — ADR 0007 Decision 불변 구현체 (A/D/E 공통).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createNullRenderer,
  type RendererBundleMeta,
  type RendererHost,
} from "../src/index.js";

function sampleMeta(partCount = 3): RendererBundleMeta {
  return {
    parts: Array.from({ length: partCount }, (_, i) => ({
      role: `role_${i}`,
      slot_id: `slot_${i}`,
    })),
    parameters: [
      { id: "head_angle_x", range: [-30, 30], default: 0 },
      { id: "body_breath", range: [0, 1], default: 0 },
    ],
  };
}

function makeHost(initialBundle?: { meta: RendererBundleMeta }): RendererHost {
  const target = new EventTarget();
  return Object.assign(target, {
    bundle: initialBundle ?? null,
  }) as unknown as RendererHost;
}

test("createNullRenderer: initial state empty", () => {
  const host = makeHost();
  const r = createNullRenderer({ element: host });
  assert.equal(r.partCount, 0);
  assert.equal(r.lastMeta, null);
  assert.equal(r.lastParameterChange, null);
  assert.equal(r.readyCount, 0);
  assert.equal(r.parameterChangeCount, 0);
  r.destroy();
});

test("createNullRenderer: reads meta from late-attach host.bundle", () => {
  const meta = sampleMeta(4);
  const host = makeHost({ meta });
  const r = createNullRenderer({ element: host });
  assert.equal(r.partCount, 4);
  assert.equal(r.lastMeta, meta);
  assert.equal(r.readyCount, 1, "late-attach counts as 1 ready");
  r.destroy();
});

test("createNullRenderer: ready event updates partCount + readyCount", () => {
  const host = makeHost();
  const r = createNullRenderer({ element: host });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(5) } } }),
  );
  assert.equal(r.partCount, 5);
  assert.equal(r.readyCount, 1);

  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(2) } } }),
  );
  assert.equal(r.partCount, 2, "second ready overrides");
  assert.equal(r.readyCount, 2);
  r.destroy();
});

test("createNullRenderer: parameterchange updates last + count", () => {
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createNullRenderer({ element: host });

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 15 } }),
  );
  assert.deepEqual(r.lastParameterChange, { id: "head_angle_x", value: 15 });
  assert.equal(r.parameterChangeCount, 1);

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "body_breath", value: 0.8 } }),
  );
  assert.deepEqual(r.lastParameterChange, { id: "body_breath", value: 0.8 });
  assert.equal(r.parameterChangeCount, 2);
  r.destroy();
});

test("createNullRenderer: malformed detail is ignored (no state change)", () => {
  const host = makeHost();
  const r = createNullRenderer({ element: host });

  host.dispatchEvent(new CustomEvent("ready", { detail: null }));
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: null } }));
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: {} } }));
  assert.equal(r.readyCount, 0, "invalid ready payloads rejected");
  assert.equal(r.lastMeta, null);

  host.dispatchEvent(new CustomEvent("parameterchange", { detail: null }));
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: 1, value: 0 } as never }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "x", value: "nope" } as never }),
  );
  assert.equal(r.parameterChangeCount, 0, "invalid parameterchange payloads rejected");
  r.destroy();
});

test("createNullRenderer: destroy removes listeners (subsequent events ignored)", () => {
  const host = makeHost();
  const r = createNullRenderer({ element: host });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(3) } } }),
  );
  assert.equal(r.readyCount, 1);

  r.destroy();
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(9) } } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "x", value: 1 } }),
  );
  assert.equal(r.readyCount, 1, "ready count frozen after destroy");
  assert.equal(r.parameterChangeCount, 0, "parameterchange count frozen after destroy");
  assert.equal(r.partCount, 3, "last meta preserved post-destroy (read-only snapshot)");
});
