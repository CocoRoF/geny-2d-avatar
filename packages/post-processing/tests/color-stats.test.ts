/**
 * computeColorStats() 회귀 — per-channel 평균/표준편차 + alpha gate.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { computeColorStats, createImageBuffer } from "../src/index.js";

function solidBuffer(
  width: number,
  height: number,
  rgba: [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return buf;
}

test("computeColorStats: 단색 α=255 이미지 — mean=픽셀값, std=0", () => {
  const img = createImageBuffer(4, 4, solidBuffer(4, 4, [120, 80, 200, 255]));
  const s = computeColorStats(img);
  assert.deepEqual(s.mean, [120, 80, 200]);
  assert.deepEqual(s.std, [0, 0, 0]);
  assert.equal(s.sampleCount, 16);
});

test("computeColorStats: 전부 투명 → count=0 + mean=[0,0,0]", () => {
  const img = createImageBuffer(4, 4, solidBuffer(4, 4, [120, 80, 200, 0]));
  const s = computeColorStats(img);
  assert.equal(s.sampleCount, 0);
  assert.deepEqual(s.mean, [0, 0, 0]);
  assert.deepEqual(s.std, [0, 0, 0]);
});

test("computeColorStats: alphaThreshold 로 노이즈 픽셀 제외", () => {
  const buf = solidBuffer(2, 2, [100, 100, 100, 4]); // 모두 노이즈
  buf[0] = 200;
  buf[1] = 50;
  buf[2] = 50;
  buf[3] = 255;
  const img = createImageBuffer(2, 2, buf);
  const s = computeColorStats(img, { alphaThreshold: 8 });
  assert.equal(s.sampleCount, 1);
  assert.deepEqual(s.mean, [200, 50, 50]);
});

test("computeColorStats: 두 색 반반 — mean=중간, std=|차이|/2", () => {
  // 4 픽셀 중 2 개 R=50, 2 개 R=150 → mean=100, population std=50
  const buf = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < 4; i++) {
    const r = i < 2 ? 50 : 150;
    buf[i * 4] = r;
    buf[i * 4 + 1] = r;
    buf[i * 4 + 2] = r;
    buf[i * 4 + 3] = 255;
  }
  const img = createImageBuffer(2, 2, buf);
  const s = computeColorStats(img);
  assert.equal(s.mean[0], 100);
  assert.equal(s.std[0], 50);
});

test("computeColorStats: premultiplied 입력은 straight 으로 복원 후 측정", () => {
  // premultiplied α=128 에서 rgb=64 는 straight rgb=128 (정확히).
  const buf = solidBuffer(2, 2, [64, 64, 64, 128]);
  const img = createImageBuffer(2, 2, buf, true);
  const s = computeColorStats(img);
  // round((64*255)/128) = round(127.5) = 128
  assert.equal(s.mean[0], 128);
});

test("computeColorStats: alphaThreshold 범위 밖 → throw", () => {
  const img = createImageBuffer(1, 1, solidBuffer(1, 1, [0, 0, 0, 255]));
  assert.throws(
    () => computeColorStats(img, { alphaThreshold: 256 }),
    /alphaThreshold/,
  );
  assert.throws(
    () => computeColorStats(img, { alphaThreshold: -1 }),
    /alphaThreshold/,
  );
});
