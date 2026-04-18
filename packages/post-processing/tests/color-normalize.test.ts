/**
 * normalizeColor() 회귀 — Stage 3 파이프라인 합성 (stats → remap → applied stats).
 */
import { strict as assert } from "node:assert";
import { createHash } from "node:crypto";
import { test } from "node:test";

import {
  createImageBuffer,
  normalizeColor,
  computeColorStats,
  straightToPremultiplied,
} from "../src/index.js";
import type { ColorStats } from "../src/index.js";

function stats(mean: [number, number, number], std: [number, number, number]): ColorStats {
  return { mean, std, sampleCount: 1 };
}

// 결정론적 LCG — 외부 RNG 의존 없이 골든 sha 를 고정.
function lcgImage(width: number, height: number, seed: number) {
  const buf = new Uint8ClampedArray(width * height * 4);
  let s = seed >>> 0;
  for (let i = 0; i < width * height; i++) {
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i * 4] = s & 0xff;
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i * 4 + 1] = s & 0xff;
    s = (s * 1664525 + 1013904223) >>> 0;
    buf[i * 4 + 2] = s & 0xff;
    buf[i * 4 + 3] = 255;
  }
  return createImageBuffer(width, height, buf);
}

function sha256(buf: Uint8ClampedArray): string {
  return createHash("sha256").update(Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength)).digest("hex");
}

test("normalizeColor: source 통계 + applied 통계가 target 에 가깝다", () => {
  const img = lcgImage(8, 8, 42);
  const target: ColorStats = {
    mean: [128, 128, 128],
    std: [30, 30, 30],
    sampleCount: 0,
  };
  const { source, applied } = normalizeColor(img, target);
  // source 는 LCG 분포라 평균/std 가 있음 (count = 64).
  assert.equal(source.sampleCount, 64);
  // applied 평균이 target 평균에 1 픽셀 이내 (정수화 오차).
  for (let c = 0; c < 3; c++) {
    assert.ok(
      Math.abs(applied.mean[c]! - target.mean[c]!) <= 1.5,
      `channel ${c} mean drift: ${applied.mean[c]} vs ${target.mean[c]}`,
    );
  }
});

test("normalizeColor: premultiplied 입력 → 자동 straight 복원 후 정규화", () => {
  const straight = lcgImage(4, 4, 7);
  const premult = straightToPremultiplied(straight);
  const target = stats([200, 100, 50], [10, 10, 10]);
  const res = normalizeColor(premult, target);
  // 결과는 straight 여야 함 (다음 단계가 다시 premult 하기 쉽게).
  assert.equal(res.image.premultiplied, false);
});

test("normalizeColor: alphaThreshold 전달 → source/applied 모두 같은 gate 사용", () => {
  const buf = new Uint8ClampedArray(2 * 4);
  // 픽셀 0 α=4 (노이즈), 픽셀 1 α=255
  buf[0] = 10;
  buf[1] = 10;
  buf[2] = 10;
  buf[3] = 4;
  buf[4] = 100;
  buf[5] = 100;
  buf[6] = 100;
  buf[7] = 255;
  const img = createImageBuffer(2, 1, buf);
  const target = stats([200, 200, 200], [0, 0, 0]);
  const { source, applied } = normalizeColor(img, target, { alphaThreshold: 8 });
  // gate 가 작동하면 source 는 픽셀 1 만 포함.
  assert.equal(source.sampleCount, 1);
  assert.equal(applied.sampleCount, 1);
});

test("normalizeColor: 입력 불변 — 원본 data 는 건드리지 않음", () => {
  const img = lcgImage(4, 4, 11);
  const orig = Array.from(img.data);
  normalizeColor(img, stats([100, 100, 100], [20, 20, 20]));
  assert.deepEqual(Array.from(img.data), orig);
});

test("normalizeColor: 결정론적 — 같은 입력/target 은 같은 sha256", () => {
  const img1 = lcgImage(8, 8, 1337);
  const img2 = lcgImage(8, 8, 1337);
  const target = stats([150, 120, 90], [25, 25, 25]);
  const r1 = normalizeColor(img1, target);
  const r2 = normalizeColor(img2, target);
  assert.equal(sha256(r1.image.data), sha256(r2.image.data));
});

test("normalizeColor: target std=0 → applied std≈0 (모든 색이 단일 평균으로 붕괴)", () => {
  const img = lcgImage(8, 8, 99);
  const target = stats([128, 64, 200], [0, 0, 0]);
  const { applied } = normalizeColor(img, target);
  for (let c = 0; c < 3; c++) {
    assert.ok(applied.std[c]! < 1, `channel ${c} std should collapse: ${applied.std[c]}`);
    assert.ok(
      Math.abs(applied.mean[c]! - target.mean[c]!) <= 1,
      `channel ${c} mean ${applied.mean[c]} != ${target.mean[c]}`,
    );
  }
});

test("normalizeColor: α=0 픽셀은 remap 에서 제외 (원본 rgb 유지)", () => {
  const buf = new Uint8ClampedArray(2 * 4);
  buf[0] = 50;
  buf[1] = 50;
  buf[2] = 50;
  buf[3] = 0; // 투명
  buf[4] = 100;
  buf[5] = 100;
  buf[6] = 100;
  buf[7] = 255;
  const img = createImageBuffer(2, 1, buf);
  const target = stats([200, 200, 200], [0, 0, 0]);
  const { image } = normalizeColor(img, target);
  // 투명 픽셀 rgb 는 그대로
  assert.equal(image.data[0], 50);
  assert.equal(image.data[3], 0);
  // 유효 픽셀은 target 평균으로 이동 (std=0 → translate only)
  // source.std=0 (단일 픽셀 100) → scale=1, offset = 200 - 100 = 100 → 100+100=200
  assert.equal(image.data[4], 200);
});

test("normalizeColor: applied stats 는 결과 이미지를 다시 측정한 값 (재검증용)", () => {
  const img = lcgImage(4, 4, 2026);
  const target = stats([100, 150, 200], [15, 15, 15]);
  const { image, applied } = normalizeColor(img, target);
  // 명시적으로 computeColorStats(image) 를 한 번 더 돌려도 동일해야 함.
  const recomputed = computeColorStats(image);
  assert.deepEqual(applied.mean, recomputed.mean);
  assert.deepEqual(applied.std, recomputed.std);
  assert.equal(applied.sampleCount, recomputed.sampleCount);
});
