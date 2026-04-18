/**
 * docs/06 §4.2 step 2 — 알파 노이즈 임계 정리 테스트.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { cleanAlphaNoise, createImageBuffer } from "../src/index.js";

test("cleanAlphaNoise: 0<α<8 → α=0 (기본 threshold)", () => {
  const data = new Uint8ClampedArray([
    255, 128, 64, 0,
    255, 128, 64, 1,
    255, 128, 64, 7,
    255, 128, 64, 8,
    255, 128, 64, 128,
    255, 128, 64, 255,
  ]);
  const img = createImageBuffer(6, 1, data, false);
  const out = cleanAlphaNoise(img);
  const alphas = Array.from(
    { length: 6 },
    (_, i) => out.data[i * 4 + 3],
  );
  assert.deepEqual(alphas, [0, 0, 0, 8, 128, 255]);
});

test("cleanAlphaNoise: straight 입력의 RGB 는 보존", () => {
  const data = new Uint8ClampedArray([200, 100, 50, 4]);
  const img = createImageBuffer(1, 1, data, false);
  const out = cleanAlphaNoise(img);
  assert.deepEqual(Array.from(out.data), [200, 100, 50, 0]);
});

test("cleanAlphaNoise: premultiplied 입력은 노이즈 픽셀의 RGB 도 0 으로", () => {
  const data = new Uint8ClampedArray([100, 50, 25, 4]);
  const img = createImageBuffer(1, 1, data, true);
  const out = cleanAlphaNoise(img);
  assert.equal(out.premultiplied, true);
  assert.deepEqual(Array.from(out.data), [0, 0, 0, 0]);
});

test("cleanAlphaNoise: threshold=0 → 입력 그대로(동일 참조)", () => {
  const data = new Uint8ClampedArray([255, 128, 64, 3]);
  const img = createImageBuffer(1, 1, data, false);
  const out = cleanAlphaNoise(img, { threshold: 0 });
  assert.equal(out, img);
});

test("cleanAlphaNoise: threshold=16 → 8 도 제거", () => {
  const data = new Uint8ClampedArray([
    255, 128, 64, 8,
    255, 128, 64, 15,
    255, 128, 64, 16,
  ]);
  const img = createImageBuffer(3, 1, data, false);
  const out = cleanAlphaNoise(img, { threshold: 16 });
  assert.equal(out.data[3], 0);
  assert.equal(out.data[7], 0);
  assert.equal(out.data[11], 16);
});

test("cleanAlphaNoise: threshold 범위 밖이면 throw", () => {
  const data = new Uint8ClampedArray([0, 0, 0, 0]);
  const img = createImageBuffer(1, 1, data, false);
  assert.throws(() => cleanAlphaNoise(img, { threshold: -1 }), RangeError);
  assert.throws(() => cleanAlphaNoise(img, { threshold: 256 }), RangeError);
  assert.throws(() => cleanAlphaNoise(img, { threshold: 1.5 }), RangeError);
});

test("cleanAlphaNoise: 새 버퍼 반환 (입력 불변)", () => {
  const data = new Uint8ClampedArray([255, 128, 64, 4]);
  const img = createImageBuffer(1, 1, data, false);
  const out = cleanAlphaNoise(img);
  assert.notEqual(out.data, img.data);
  assert.equal(img.data[3], 4);
});
