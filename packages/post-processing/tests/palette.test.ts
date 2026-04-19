/**
 * palette.ts — fit-to-palette k-means + ΔE ≤ cap 이동 회귀.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createImageBuffer, fitToPalette, parsePaletteCatalog, rgbToLab } from "../src/index.js";
import type { PaletteEntry } from "../src/index.js";

function mkImage(pixels: Array<[number, number, number, number]>) {
  const w = pixels.length;
  const buf = new Uint8ClampedArray(w * 4);
  for (let i = 0; i < w; i++) {
    buf[i * 4] = pixels[i]![0];
    buf[i * 4 + 1] = pixels[i]![1];
    buf[i * 4 + 2] = pixels[i]![2];
    buf[i * 4 + 3] = pixels[i]![3];
  }
  return createImageBuffer(w, 1, buf);
}

const PALETTE: PaletteEntry = {
  id: "test",
  colors: [
    { name: "skin", rgb: [250, 224, 211] },
    { name: "hair", rgb: [236, 190, 200] },
    { name: "cloth", rgb: [196, 188, 232] },
  ],
  move_cap_delta_e: 12,
};

test("fitToPalette: 팔레트 색과 매우 가까운 입력 — 매핑 가능 cluster 는 moved=true", () => {
  // 모두 skin 과 유사 (ΔE 소)
  const img = mkImage([
    [250, 224, 211, 255],
    [248, 222, 210, 255],
    [252, 226, 212, 255],
  ]);
  const res = fitToPalette(img, PALETTE, { k: 1 });
  assert.equal(res.decisions.length, 1);
  assert.equal(res.decisions[0]!.moved, true);
  assert.equal(res.decisions[0]!.matchedPaletteName, "skin");
  assert.ok(res.decisions[0]!.deltaE < 5, `deltaE=${res.decisions[0]!.deltaE}`);
});

test("fitToPalette: 팔레트에서 멀리 떨어진 색 — moved=false (cap 초과) + 원본 보존", () => {
  // 순녹색 — 팔레트 3색(skin/hair/cloth) 모두 멀리 떨어져 있음 (ΔE ≫ 12)
  const img = mkImage([
    [0, 255, 0, 255],
    [0, 250, 0, 255],
    [0, 245, 0, 255],
  ]);
  const res = fitToPalette(img, PALETTE, { k: 1, moveCapDeltaE: 5 });
  assert.equal(res.decisions[0]!.moved, false);
  assert.ok(res.decisions[0]!.deltaE > 5);
  // 이동하지 않았으니 출력 rgb 가 입력과 동일
  assert.equal(res.image.data[0], 0);
  assert.equal(res.image.data[1], 255);
  assert.equal(res.image.data[2], 0);
});

test("fitToPalette: α=0 픽셀은 α-gate 로 클러스터링에서 제외", () => {
  const img = mkImage([
    [250, 224, 211, 255], // skin, 유효
    [0, 0, 0, 0], // 투명, 건드리면 안 됨
  ]);
  const res = fitToPalette(img, PALETTE, { k: 1 });
  // 투명 픽셀은 원본 그대로
  assert.equal(res.image.data[4], 0);
  assert.equal(res.image.data[5], 0);
  assert.equal(res.image.data[6], 0);
  assert.equal(res.image.data[7], 0);
});

test("fitToPalette: k=2 — 두 지배색 → 각자 다른 팔레트 매핑", () => {
  const img = mkImage([
    [250, 224, 211, 255], // skin
    [249, 223, 210, 255],
    [248, 222, 209, 255],
    [236, 190, 200, 255], // hair
    [235, 189, 199, 255],
    [234, 188, 198, 255],
  ]);
  const res = fitToPalette(img, PALETTE, { k: 2 });
  assert.equal(res.decisions.length, 2);
  const matched = new Set(res.decisions.map((d) => d.matchedPaletteName));
  assert.ok(matched.has("skin"));
  assert.ok(matched.has("hair"));
  // 둘 다 이동 가능
  for (const d of res.decisions) assert.equal(d.moved, true);
});

test("fitToPalette: premultiplied 입력 → throw", () => {
  const buf = new Uint8ClampedArray(4);
  buf[3] = 255;
  const img = createImageBuffer(1, 1, buf, true);
  assert.throws(() => fitToPalette(img, PALETTE), /straight/);
});

test("fitToPalette: 결정론 — 같은 입력/팔레트 → 같은 결과", () => {
  const img = mkImage([
    [220, 180, 170, 255],
    [180, 170, 220, 255],
    [210, 190, 180, 255],
    [190, 180, 210, 255],
  ]);
  const r1 = fitToPalette(img, PALETTE, { k: 2 });
  const r2 = fitToPalette(img, PALETTE, { k: 2 });
  assert.deepEqual(Array.from(r1.image.data), Array.from(r2.image.data));
  assert.deepEqual(
    r1.decisions.map((d) => [d.matchedPaletteName, d.moved, Math.round(d.deltaE * 100)]),
    r2.decisions.map((d) => [d.matchedPaletteName, d.moved, Math.round(d.deltaE * 100)]),
  );
});

test("fitToPalette: 이동된 픽셀은 원본보다 팔레트 중심에 더 가깝다", () => {
  // skin 에서 살짝 벗어난 색 — 이동 후 skin 중심 쪽으로 더 가까워져야 함
  const img = mkImage([
    [240, 215, 205, 255],
    [241, 216, 204, 255],
    [239, 214, 206, 255],
  ]);
  const res = fitToPalette(img, PALETTE, { k: 1 });
  const d0 = res.decisions[0]!;
  assert.equal(d0.moved, true);
  const before = rgbToLab(240, 215, 205);
  const after = rgbToLab(res.image.data[0]!, res.image.data[1]!, res.image.data[2]!);
  const skinLab = rgbToLab(250, 224, 211);
  const beforeDist = Math.sqrt(
    (before.L - skinLab.L) ** 2 + (before.a - skinLab.a) ** 2 + (before.b - skinLab.b) ** 2,
  );
  const afterDist = Math.sqrt(
    (after.L - skinLab.L) ** 2 + (after.a - skinLab.a) ** 2 + (after.b - skinLab.b) ** 2,
  );
  assert.ok(afterDist < beforeDist, `after=${afterDist} before=${beforeDist}`);
});

test("parsePaletteCatalog: 정상 JSON", () => {
  const raw = {
    schema_version: "v1",
    palettes: [
      { id: "p1", colors: [{ name: "a", rgb: [0, 0, 0] }] },
      { id: "p2", colors: [{ name: "b", rgb: [255, 255, 255] }] },
    ],
  };
  const out = parsePaletteCatalog(raw);
  assert.equal(out.length, 2);
  assert.equal(out[0]!.id, "p1");
});

test("parsePaletteCatalog: schema_version 오류 → throw", () => {
  assert.throws(
    () => parsePaletteCatalog({ schema_version: "v0", palettes: [] }),
    /schema_version/,
  );
});

test("parsePaletteCatalog: 중복 id → throw", () => {
  assert.throws(
    () =>
      parsePaletteCatalog({
        schema_version: "v1",
        palettes: [
          { id: "dup", colors: [{ name: "a", rgb: [0, 0, 0] }] },
          { id: "dup", colors: [{ name: "b", rgb: [255, 255, 255] }] },
        ],
      }),
    /duplicate/,
  );
});

test("parsePaletteCatalog: 빈 palettes → throw", () => {
  assert.throws(
    () => parsePaletteCatalog({ schema_version: "v1", palettes: [] }),
    /non-empty/,
  );
});
