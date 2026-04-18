/**
 * docs/06 §4.2 step 6 — tight bbox 계산 테스트.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeAlphaBbox, createImageBuffer } from "../src/index.js";

function makeImage(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function setAlpha(
  buf: Uint8ClampedArray,
  width: number,
  x: number,
  y: number,
  a: number,
): void {
  buf[(y * width + x) * 4 + 3] = a;
}

test("computeAlphaBbox: 전부 투명 → null", () => {
  const img = createImageBuffer(4, 4, makeImage(4, 4), false);
  assert.equal(computeAlphaBbox(img), null);
});

test("computeAlphaBbox: 단일 픽셀", () => {
  const w = 4;
  const buf = makeImage(w, 4);
  setAlpha(buf, w, 2, 1, 255);
  const img = createImageBuffer(w, 4, buf, false);
  assert.deepEqual(computeAlphaBbox(img), { x: 2, y: 1, width: 1, height: 1 });
});

test("computeAlphaBbox: tight bbox — 외곽만", () => {
  const w = 5;
  const h = 4;
  const buf = makeImage(w, h);
  setAlpha(buf, w, 1, 1, 255);
  setAlpha(buf, w, 3, 1, 255);
  setAlpha(buf, w, 2, 2, 255);
  const img = createImageBuffer(w, h, buf, false);
  assert.deepEqual(computeAlphaBbox(img), { x: 1, y: 1, width: 3, height: 2 });
});

test("computeAlphaBbox: 전체 채움 → 전체 크기", () => {
  const w = 3;
  const h = 2;
  const buf = makeImage(w, h);
  for (let i = 0; i < w * h; i++) buf[i * 4 + 3] = 200;
  const img = createImageBuffer(w, h, buf, false);
  assert.deepEqual(computeAlphaBbox(img), { x: 0, y: 0, width: w, height: h });
});

test("computeAlphaBbox: minAlpha 로 노이즈 픽셀 제외", () => {
  const w = 4;
  const buf = makeImage(w, 4);
  setAlpha(buf, w, 0, 0, 3); // 노이즈
  setAlpha(buf, w, 2, 2, 200); // 실제
  const img = createImageBuffer(w, 4, buf, false);
  const tight = computeAlphaBbox(img, { minAlpha: 8 });
  assert.deepEqual(tight, { x: 2, y: 2, width: 1, height: 1 });
  const loose = computeAlphaBbox(img, { minAlpha: 1 });
  assert.deepEqual(loose, { x: 0, y: 0, width: 3, height: 3 });
});

test("computeAlphaBbox: minAlpha 범위 밖이면 throw", () => {
  const img = createImageBuffer(1, 1, new Uint8ClampedArray(4), false);
  assert.throws(() => computeAlphaBbox(img, { minAlpha: -1 }), RangeError);
  assert.throws(() => computeAlphaBbox(img, { minAlpha: 300 }), RangeError);
});
