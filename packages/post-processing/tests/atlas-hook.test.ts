/**
 * atlas-hook.ts — pre-atlas color normalize + fit-to-palette 파이프라인 회귀.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  applyPreAtlasNormalization,
  createImageBuffer,
  rgbToLab,
} from "../src/index.js";
import type { ColorStats, PaletteEntry } from "../src/index.js";

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

const PALETTE: PaletteEntry = {
  id: "test",
  colors: [
    { name: "pink", rgb: [236, 190, 200] },
    { name: "mint", rgb: [166, 220, 210] },
  ],
  move_cap_delta_e: 15,
};

test("applyPreAtlasNormalization: target/palette 없음 → identity", () => {
  const parts = [{ slotId: "a", image: solid(2, 2, [10, 20, 30, 255]) }];
  const res = applyPreAtlasNormalization(parts);
  assert.equal(res.parts.length, 1);
  assert.deepEqual(Array.from(res.parts[0]!.image.data), Array.from(parts[0]!.image.data));
  assert.equal(res.parts[0]!.normalize, null);
  assert.equal(res.parts[0]!.paletteDecisions, null);
  assert.equal(res.report.normalized, 0);
  assert.equal(res.report.paletteApplied, 0);
});

test("applyPreAtlasNormalization: target 만 → normalize 적용, 팔레트 skip", () => {
  const parts = [
    { slotId: "skin", image: solid(2, 2, [100, 100, 100, 255]) },
    { slotId: "hair", image: solid(2, 2, [120, 120, 120, 255]) },
  ];
  const target: ColorStats = {
    mean: [200, 200, 200],
    std: [5, 5, 5],
    sampleCount: 1,
    colorSpace: "rgb",
  };
  const res = applyPreAtlasNormalization(parts, { target });
  assert.equal(res.report.normalized, 2);
  assert.equal(res.report.paletteApplied, 0);
  for (const p of res.parts) {
    assert.ok(p.normalize !== null);
    assert.equal(p.paletteDecisions, null);
  }
});

test("applyPreAtlasNormalization: palette 만 → fit-to-palette 적용, normalize skip", () => {
  const parts = [{ slotId: "hair_front", image: solid(4, 4, [236, 190, 200, 255]) }];
  const res = applyPreAtlasNormalization(parts, { palette: PALETTE });
  assert.equal(res.report.normalized, 0);
  assert.equal(res.report.paletteApplied, 1);
  assert.ok(res.parts[0]!.paletteDecisions !== null);
  assert.ok(res.parts[0]!.paletteDecisions!.length >= 1);
  // 모든 결정이 pink 로 수렴 (단색 입력)
  for (const d of res.parts[0]!.paletteDecisions!) {
    assert.equal(d.matchedPaletteName, "pink");
  }
});

test("applyPreAtlasNormalization: target + palette 체인", () => {
  const parts = [{ slotId: "hair_front", image: solid(4, 4, [240, 196, 205, 255]) }];
  const labTarget: ColorStats = {
    mean: [78, 14, 6],
    std: [2, 2, 2],
    sampleCount: 1,
    colorSpace: "lab",
  };
  const res = applyPreAtlasNormalization(parts, { target: labTarget, palette: PALETTE });
  assert.equal(res.report.normalized, 1);
  assert.equal(res.report.paletteApplied, 1);
  const part = res.parts[0]!;
  assert.ok(part.normalize !== null);
  assert.equal(part.normalize!.colorSpace, "lab");
  assert.ok(part.paletteDecisions !== null);
});

test("applyPreAtlasNormalization: 입력 순서/길이 불변 (atlas 인덱스 안정성)", () => {
  const parts = [
    { slotId: "a", image: solid(1, 1, [10, 10, 10, 255]) },
    { slotId: "b", image: solid(1, 1, [20, 20, 20, 255]) },
    { slotId: "c", image: solid(1, 1, [30, 30, 30, 255]) },
  ];
  const res = applyPreAtlasNormalization(parts, { palette: PALETTE });
  assert.equal(res.parts.length, 3);
  assert.deepEqual(
    res.parts.map((p) => p.slotId),
    ["a", "b", "c"],
  );
});

test("applyPreAtlasNormalization: report.paletteSkipped — cap 초과 클러스터 집계", () => {
  // 팔레트와 매우 먼 색상 (순녹) — moveCap 엄격하게 → skipped 증가
  const parts = [{ slotId: "x", image: solid(3, 3, [0, 255, 0, 255]) }];
  const tightPalette: PaletteEntry = { ...PALETTE, move_cap_delta_e: 1 };
  const res = applyPreAtlasNormalization(parts, { palette: tightPalette });
  assert.ok(res.report.paletteSkipped > 0);
});

test("applyPreAtlasNormalization: 결정론 — 두 번 호출 동일 결과", () => {
  const parts = [
    { slotId: "a", image: solid(2, 2, [236, 190, 200, 255]) },
    { slotId: "b", image: solid(2, 2, [166, 220, 210, 255]) },
  ];
  const run = () => applyPreAtlasNormalization(parts, { palette: PALETTE });
  const r1 = run();
  const r2 = run();
  for (let i = 0; i < r1.parts.length; i++) {
    assert.deepEqual(
      Array.from(r1.parts[i]!.image.data),
      Array.from(r2.parts[i]!.image.data),
    );
  }
});
