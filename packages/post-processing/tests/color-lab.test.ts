/**
 * Stage 3 Lab* 경로 회귀 — computeColorStats / remapColorLinear / normalizeColor 의 colorSpace="lab".
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  createImageBuffer,
  computeColorStats,
  normalizeColor,
  remapColorLinear,
  rgbToLab,
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

function labStats(
  mean: [number, number, number],
  std: [number, number, number],
): ColorStats {
  return { mean, std, sampleCount: 1, colorSpace: "lab" };
}

test("computeColorStats(colorSpace=lab): 단색 픽셀 — mean=Lab 변환값, std=0", () => {
  const img = solid(2, 2, [128, 128, 128, 255]);
  const stats = computeColorStats(img, { colorSpace: "lab" });
  const expected = rgbToLab(128, 128, 128);
  assert.equal(stats.colorSpace, "lab");
  assert.ok(Math.abs(stats.mean[0]! - expected.L) < 0.01);
  assert.ok(Math.abs(stats.mean[1]! - expected.a) < 0.01);
  assert.ok(Math.abs(stats.mean[2]! - expected.b) < 0.01);
  assert.equal(stats.std[0], 0);
  assert.equal(stats.std[1], 0);
  assert.equal(stats.std[2], 0);
});

test("computeColorStats(colorSpace=rgb)(기본값) 은 세션 29 와 동일 — mean/std rgb 공간", () => {
  const img = solid(2, 2, [100, 150, 200, 255]);
  const defaultStats = computeColorStats(img);
  assert.equal(defaultStats.colorSpace, "rgb");
  assert.equal(defaultStats.mean[0], 100);
  assert.equal(defaultStats.mean[1], 150);
  assert.equal(defaultStats.mean[2], 200);
});

test("computeColorStats: colorSpace=invalid → throw", () => {
  const img = solid(1, 1, [0, 0, 0, 255]);
  assert.throws(() => computeColorStats(img, { colorSpace: "hsv" as any }), /colorSpace/);
});

test("remapColorLinear(lab): source=target → 동일 이미지 (identity)", () => {
  const img = solid(3, 3, [100, 150, 200, 255]);
  const src = computeColorStats(img, { colorSpace: "lab" });
  const out = remapColorLinear(img, src, src);
  // int 반올림 ± 1 허용
  for (let i = 0; i < img.data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      assert.ok(
        Math.abs((out.data[i + c] ?? 0) - (img.data[i + c] ?? 0)) <= 1,
        `px${i / 4} c${c} in=${img.data[i + c]} out=${out.data[i + c]}`,
      );
    }
  }
});

test("remapColorLinear(lab): source/target colorSpace 불일치 → throw", () => {
  const img = solid(1, 1, [100, 100, 100, 255]);
  const srcRgb = computeColorStats(img); // rgb
  const dstLab = labStats([50, 0, 0], [10, 5, 5]); // lab
  assert.throws(() => remapColorLinear(img, srcRgb, dstLab), /colorSpace/);
});

test("normalizeColor(lab): 단색 회색 → 목표 Lab mean (L 변경) 에 근접 이동", () => {
  const img = solid(4, 4, [100, 100, 100, 255]);
  const target = labStats([70, 0, 0], [0, 0, 0]);
  const res = normalizeColor(img, target);
  assert.equal(res.colorSpace, "lab");
  // applied.mean[0] 은 target.mean[0] (=70) 에 매우 근접해야 함
  assert.ok(Math.abs(res.applied.mean[0]! - 70) < 0.5, `L=${res.applied.mean[0]}`);
});

test("normalizeColor(lab): target.colorSpace=lab 과 opts.colorSpace=rgb 충돌 → throw", () => {
  const img = solid(1, 1, [100, 100, 100, 255]);
  const target = labStats([50, 0, 0], [0, 0, 0]);
  assert.throws(
    () => normalizeColor(img, target, { colorSpace: "rgb" }),
    /colorSpace/,
  );
});

test("normalizeColor(lab) vs (rgb): 다채로운 입력에서 두 경로가 다른 결과", () => {
  // 단색 입력은 std=0 이라 두 경로 모두 target mean 으로 붕괴하므로 구별 불가.
  // 두 색 (붉은색 + 푸른색) 섞으면 std>0 → Lab 과 RGB 의 remap 경로가 다르게 동작.
  const buf = new Uint8ClampedArray(4 * 4);
  for (let i = 0; i < 4; i++) {
    const base = i * 4;
    if (i < 2) {
      buf[base] = 220; buf[base + 1] = 80; buf[base + 2] = 80; buf[base + 3] = 255;
    } else {
      buf[base] = 80; buf[base + 1] = 80; buf[base + 2] = 220; buf[base + 3] = 255;
    }
  }
  const img = createImageBuffer(4, 1, buf);

  const rgbTarget: ColorStats = {
    mean: [130, 130, 130],
    std: [30, 30, 30],
    sampleCount: 1,
    colorSpace: "rgb",
  };
  const labTarget = labStats([55, 5, -5], [20, 15, 10]);
  const rgbRes = normalizeColor(img, rgbTarget);
  const labRes = normalizeColor(img, labTarget);
  // 두 경로의 결과는 달라야 함 — 동일 픽셀 중 최소 하나는 다른 값
  let differs = false;
  for (let i = 0; i < rgbRes.image.data.length; i++) {
    if (rgbRes.image.data[i] !== labRes.image.data[i]) {
      differs = true;
      break;
    }
  }
  assert.ok(differs, "RGB 와 Lab 경로는 다른 결과를 내야 한다");
});

test("normalizeColor(lab): 입력이 premultiplied 면 auto-unwrap", () => {
  // premultiplied 상태의 [100,100,100, α=128] → straight 복원 후 Lab 측정
  const buf = new Uint8ClampedArray(4);
  buf[0] = 50; // premult r = 100 * 128 / 255 ≈ 50
  buf[1] = 50;
  buf[2] = 50;
  buf[3] = 128;
  const img = createImageBuffer(1, 1, buf, true);
  const target = labStats([50, 0, 0], [0, 0, 0]);
  const res = normalizeColor(img, target);
  assert.equal(res.colorSpace, "lab");
  assert.equal(res.image.premultiplied, false);
});
