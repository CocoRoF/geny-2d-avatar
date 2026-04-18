/**
 * remapColorLinear() 회귀 — 선형 재매핑의 경계 케이스.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createImageBuffer,
  computeColorStats,
  remapColorLinear,
} from "../src/index.js";
import type { ColorStats } from "../src/index.js";

function solid(w: number, h: number, rgba: [number, number, number, number]) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return createImageBuffer(w, h, buf);
}

function stats(mean: [number, number, number], std: [number, number, number]): ColorStats {
  return { mean, std, sampleCount: 1 };
}

test("remapColorLinear: source=target → 동일 이미지", () => {
  const img = solid(2, 2, [100, 150, 200, 255]);
  const src = computeColorStats(img);
  const out = remapColorLinear(img, src, src);
  assert.deepEqual(Array.from(out.data), Array.from(img.data));
});

test("remapColorLinear: std=0 인 채널은 평행 이동만 (scale=1)", () => {
  // 단색 → std=0. target mean 만 바뀌면 모든 픽셀이 target mean 으로 이동해야 함.
  const img = solid(2, 2, [100, 100, 100, 255]);
  const src = computeColorStats(img);
  const tgt = stats([200, 50, 100], [10, 10, 10]);
  const out = remapColorLinear(img, src, tgt);
  // scale=1 (src std=0) 이므로 newC = C + (dst.mean - src.mean)
  assert.equal(out.data[0], 200); // 100 + (200 - 100)
  assert.equal(out.data[1], 50);  // 100 + (50 - 100) = 50
  assert.equal(out.data[2], 100); // 100 + (100 - 100) = 100
});

test("remapColorLinear: clamp 0..255 (오버플로우 방지)", () => {
  const img = solid(2, 2, [200, 200, 200, 255]);
  const src = stats([200, 200, 200], [1, 1, 1]);
  // scale = 100/1 = 100 → (200 - 200)*100 + 400 = 400 → clamp 255
  const tgt = stats([400, 400, 400], [100, 100, 100]);
  const out = remapColorLinear(img, src, tgt);
  assert.equal(out.data[0], 255);
  assert.equal(out.data[1], 255);
  assert.equal(out.data[2], 255);
});

test("remapColorLinear: α=0 픽셀은 건드리지 않음 (edge 잔재 방지)", () => {
  const buf = new Uint8ClampedArray(4);
  buf[0] = 100;
  buf[1] = 100;
  buf[2] = 100;
  buf[3] = 0;
  const img = createImageBuffer(1, 1, buf);
  const src = stats([100, 100, 100], [1, 1, 1]);
  const tgt = stats([200, 200, 200], [1, 1, 1]);
  const out = remapColorLinear(img, src, tgt);
  assert.equal(out.data[0], 100);
  assert.equal(out.data[1], 100);
  assert.equal(out.data[2], 100);
  assert.equal(out.data[3], 0);
});

test("remapColorLinear: premultiplied 입력 → throw", () => {
  const buf = new Uint8ClampedArray(4);
  buf[3] = 255;
  const img = createImageBuffer(1, 1, buf, true);
  const src = stats([0, 0, 0], [1, 1, 1]);
  assert.throws(() => remapColorLinear(img, src, src), /straight/);
});

test("remapColorLinear: alphaThreshold 로 노이즈 픽셀은 그대로 둠", () => {
  const buf = new Uint8ClampedArray(2 * 4);
  // 픽셀 0: α=4 노이즈, RGB=100
  buf[0] = 100;
  buf[1] = 100;
  buf[2] = 100;
  buf[3] = 4;
  // 픽셀 1: α=255, RGB=50
  buf[4] = 50;
  buf[5] = 50;
  buf[6] = 50;
  buf[7] = 255;
  const img = createImageBuffer(2, 1, buf);
  const src = stats([50, 50, 50], [1, 1, 1]);
  const tgt = stats([200, 200, 200], [1, 1, 1]);
  const out = remapColorLinear(img, src, tgt, { alphaThreshold: 8 });
  // 노이즈 픽셀은 그대로
  assert.equal(out.data[0], 100);
  // 유효 픽셀은 remap: (50-50)*1 + 200 = 200
  assert.equal(out.data[4], 200);
});

test("remapColorLinear: 결과는 새 Uint8ClampedArray (입력 불변)", () => {
  const img = solid(2, 2, [100, 100, 100, 255]);
  const orig = Array.from(img.data);
  const src = stats([100, 100, 100], [1, 1, 1]);
  const tgt = stats([200, 200, 200], [1, 1, 1]);
  const out = remapColorLinear(img, src, tgt);
  assert.notEqual(out.data, img.data);
  assert.deepEqual(Array.from(img.data), orig);
});
