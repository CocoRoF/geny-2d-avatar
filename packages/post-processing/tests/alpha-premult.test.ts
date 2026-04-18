/**
 * docs/06 §4.2 step 1 — premult ↔ straight 변환 라운드트립 테스트.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createImageBuffer,
  premultipliedToStraight,
  straightToPremultiplied,
} from "../src/index.js";

test("straightToPremultiplied: α=255 → 원본 RGB 보존", () => {
  const data = new Uint8ClampedArray([
    255, 128, 64, 255,
    10, 20, 30, 255,
  ]);
  const img = createImageBuffer(2, 1, data, false);
  const pm = straightToPremultiplied(img);
  assert.equal(pm.premultiplied, true);
  assert.deepEqual(Array.from(pm.data), [255, 128, 64, 255, 10, 20, 30, 255]);
});

test("straightToPremultiplied: α=0 → RGB 강제 0", () => {
  const data = new Uint8ClampedArray([200, 200, 200, 0]);
  const img = createImageBuffer(1, 1, data, false);
  const pm = straightToPremultiplied(img);
  assert.deepEqual(Array.from(pm.data), [0, 0, 0, 0]);
});

test("straightToPremultiplied: α=128 → RGB = round(RGB*128/255)", () => {
  const data = new Uint8ClampedArray([200, 100, 50, 128]);
  const img = createImageBuffer(1, 1, data, false);
  const pm = straightToPremultiplied(img);
  assert.deepEqual(
    Array.from(pm.data),
    [Math.round((200 * 128) / 255), Math.round((100 * 128) / 255), Math.round((50 * 128) / 255), 128],
  );
});

test("premultipliedToStraight: α=0 → RGB 유지 0", () => {
  const data = new Uint8ClampedArray([0, 0, 0, 0]);
  const img = createImageBuffer(1, 1, data, true);
  const s = premultipliedToStraight(img);
  assert.equal(s.premultiplied, false);
  assert.deepEqual(Array.from(s.data), [0, 0, 0, 0]);
});

test("premultipliedToStraight: α=255 → 원본 RGB 보존", () => {
  const data = new Uint8ClampedArray([255, 128, 64, 255]);
  const img = createImageBuffer(1, 1, data, true);
  const s = premultipliedToStraight(img);
  assert.deepEqual(Array.from(s.data), [255, 128, 64, 255]);
});

test("roundtrip: α=255 인 픽셀은 bit-exact 복원", () => {
  const data = new Uint8ClampedArray([
    255, 128, 64, 255,
    10, 20, 30, 255,
    200, 150, 100, 255,
  ]);
  const img = createImageBuffer(3, 1, data, false);
  const pm = straightToPremultiplied(img);
  const back = premultipliedToStraight(pm);
  assert.deepEqual(Array.from(back.data), Array.from(data));
});

test("roundtrip: α=0 인 픽셀은 RGB 손실(정보 없음) — 다른 RGB 가 0 으로 수렴", () => {
  const data = new Uint8ClampedArray([200, 150, 100, 0]);
  const img = createImageBuffer(1, 1, data, false);
  const back = premultipliedToStraight(straightToPremultiplied(img));
  assert.deepEqual(Array.from(back.data), [0, 0, 0, 0]);
});

test("straightToPremultiplied: 이미 premultiplied 면 그대로 반환(동일 참조)", () => {
  const data = new Uint8ClampedArray([100, 50, 25, 128]);
  const img = createImageBuffer(1, 1, data, true);
  const out = straightToPremultiplied(img);
  assert.equal(out, img);
});

test("premultipliedToStraight: 이미 straight 면 그대로 반환", () => {
  const data = new Uint8ClampedArray([100, 50, 25, 128]);
  const img = createImageBuffer(1, 1, data, false);
  const out = premultipliedToStraight(img);
  assert.equal(out, img);
});

test("createImageBuffer: 크기/길이 검증", () => {
  assert.throws(() => createImageBuffer(0, 1, new Uint8ClampedArray(0)), RangeError);
  assert.throws(() => createImageBuffer(2, 2, new Uint8ClampedArray(15)), RangeError);
});
