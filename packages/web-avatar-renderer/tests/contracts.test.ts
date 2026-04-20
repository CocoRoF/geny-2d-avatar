/**
 * `@geny/web-avatar-renderer` contracts 회귀 — ADR 0007 의 어떤 렌더러 경로로
 * 확정되어도 본 인터페이스는 불변. 가드 함수는 **존재성/타입** 만 검사하고 값
 * 범위는 스키마 레이어에 위임(ADR 0002).
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isRendererBundleMeta,
  isRendererParameterChangeEventDetail,
  type RendererBundleMeta,
  type RendererHost,
  type RendererPart,
  type RendererParameterChangeEventDetail,
  type RendererReadyEventDetail,
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

test("RendererPart structural — role + slot_id 두 축만", () => {
  const p: RendererPart = { role: "face_base", slot_id: "slot_face" };
  assert.equal(p.role, "face_base");
  assert.equal(p.slot_id, "slot_face");
});

test("RendererHost: duck-typed EventTarget + optional bundle", () => {
  const target = new EventTarget();
  const host: RendererHost = Object.assign(target, { bundle: null });
  assert.equal(host.bundle, null);

  const meta = sampleMeta(2);
  const hostWithBundle: RendererHost = Object.assign(new EventTarget(), {
    bundle: { meta },
  });
  assert.equal(hostWithBundle.bundle?.meta.parts.length, 2);
});

test("RendererReadyEventDetail / RendererParameterChangeEventDetail shape", () => {
  const ready: RendererReadyEventDetail = { bundle: { meta: sampleMeta(1) } };
  assert.equal(ready.bundle.meta.parts[0]?.role, "role_0");

  const pc: RendererParameterChangeEventDetail = { id: "head_angle_x", value: 10 };
  assert.equal(pc.id, "head_angle_x");
  assert.equal(pc.value, 10);
});

test("isRendererBundleMeta — accepts canonical meta shape", () => {
  assert.equal(isRendererBundleMeta(sampleMeta(0)), true);
  assert.equal(isRendererBundleMeta(sampleMeta(5)), true);
});

test("isRendererBundleMeta — rejects non-object / null / primitives", () => {
  assert.equal(isRendererBundleMeta(null), false);
  assert.equal(isRendererBundleMeta(undefined), false);
  assert.equal(isRendererBundleMeta(42), false);
  assert.equal(isRendererBundleMeta("meta"), false);
  assert.equal(isRendererBundleMeta([]), false);
});

test("isRendererBundleMeta — rejects missing arrays", () => {
  assert.equal(isRendererBundleMeta({ parts: [] }), false);
  assert.equal(isRendererBundleMeta({ parameters: [] }), false);
  assert.equal(isRendererBundleMeta({ parts: "nope", parameters: [] }), false);
});

test("isRendererBundleMeta — rejects malformed part entries", () => {
  assert.equal(
    isRendererBundleMeta({ parts: [{ role: "x" }], parameters: [] }),
    false,
    "missing slot_id",
  );
  assert.equal(
    isRendererBundleMeta({ parts: [{ role: 1, slot_id: "s" }], parameters: [] }),
    false,
    "role not string",
  );
  assert.equal(
    isRendererBundleMeta({ parts: [null], parameters: [] }),
    false,
    "null part entry",
  );
});

test("isRendererBundleMeta — rejects malformed parameter entries", () => {
  assert.equal(
    isRendererBundleMeta({ parts: [], parameters: [{ id: "x", default: 0 }] }),
    false,
    "missing range",
  );
  assert.equal(
    isRendererBundleMeta({ parts: [], parameters: [{ id: "x", range: [0], default: 0 }] }),
    false,
    "range length != 2",
  );
  assert.equal(
    isRendererBundleMeta({ parts: [], parameters: [{ id: "x", range: ["a", "b"], default: 0 }] }),
    false,
    "range not numbers",
  );
  assert.equal(
    isRendererBundleMeta({ parts: [], parameters: [{ id: 1, range: [0, 1], default: 0 }] }),
    false,
    "id not string",
  );
});

test("isRendererParameterChangeEventDetail — accepts canonical shape", () => {
  assert.equal(
    isRendererParameterChangeEventDetail({ id: "head_angle_x", value: 15 }),
    true,
  );
});

test("isRendererParameterChangeEventDetail — rejects malformed shapes", () => {
  assert.equal(isRendererParameterChangeEventDetail(null), false);
  assert.equal(isRendererParameterChangeEventDetail({ id: "x" }), false);
  assert.equal(isRendererParameterChangeEventDetail({ id: 1, value: 0 }), false);
  assert.equal(isRendererParameterChangeEventDetail({ id: "x", value: "10" }), false);
});
