/**
 * `atlasUvToFrame` 회귀 — 정규화 UV → PIXI 픽셀 frame 변환. β P1-S1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { atlasUvToFrame } from "../src/index.js";

test("atlasUvToFrame: basic center square", () => {
  const frame = atlasUvToFrame(
    { uv: [0.25, 0.25, 0.5, 0.5] },
    { width: 1024, height: 1024 },
  );
  assert.equal(frame.x, 256);
  assert.equal(frame.y, 256);
  assert.equal(frame.width, 512);
  assert.equal(frame.height, 512);
});

test("atlasUvToFrame: non-square texture", () => {
  const frame = atlasUvToFrame(
    { uv: [0, 0, 1, 1] },
    { width: 2048, height: 1024 },
  );
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0);
  assert.equal(frame.width, 2048);
  assert.equal(frame.height, 1024);
});

test("atlasUvToFrame: clamps out-of-range UV into [0,1]", () => {
  const frame = atlasUvToFrame(
    { uv: [-0.5, 1.5, 2.0, -1] },
    { width: 100, height: 100 },
  );
  assert.equal(frame.x, 0, "negative x clamped to 0");
  assert.equal(frame.y, 100, "y > 1 clamped to 1 (full height origin)");
  assert.equal(frame.width, 100, "w > 1 clamped to 1");
  assert.equal(frame.height, 1, "w < 0 clamped to 0 then min 1 applied");
});

test("atlasUvToFrame: NaN and Infinity treated as 0", () => {
  const frame = atlasUvToFrame(
    { uv: [Number.NaN, Number.POSITIVE_INFINITY, 0.5, 0.5] },
    { width: 512, height: 512 },
  );
  assert.equal(frame.x, 0);
  assert.equal(frame.y, 0, "Infinity clamps to 0 via guard (not-finite)");
  assert.equal(frame.width, 256);
  assert.equal(frame.height, 256);
});

test("atlasUvToFrame: zero-width UV becomes 1px (PIXI frame constraint)", () => {
  const frame = atlasUvToFrame(
    { uv: [0.5, 0.5, 0, 0] },
    { width: 1024, height: 1024 },
  );
  assert.equal(frame.width, 1, "0 width bumped to 1");
  assert.equal(frame.height, 1, "0 height bumped to 1");
});
