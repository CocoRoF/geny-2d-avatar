/**
 * morphCloseAlpha — docs/06 §4.2 step 3 회귀.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createImageBuffer, morphCloseAlpha } from "../src/index.js";

function makeImg(w: number, h: number, pixels: Array<[number, number, number, number]>) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < pixels.length; i++) {
    const px = pixels[i]!;
    buf[i * 4] = px[0];
    buf[i * 4 + 1] = px[1];
    buf[i * 4 + 2] = px[2];
    buf[i * 4 + 3] = px[3];
  }
  return createImageBuffer(w, h, buf);
}

function alphaGrid(img: ReturnType<typeof makeImg>): number[][] {
  const rows: number[][] = [];
  for (let y = 0; y < img.height; y++) {
    const row: number[] = [];
    for (let x = 0; x < img.width; x++) {
      row.push(img.data[(y * img.width + x) * 4 + 3] ?? 0);
    }
    rows.push(row);
  }
  return rows;
}

test("morphCloseAlpha: 단일 픽셀 구멍 채움 (radius=1)", () => {
  // 3x3 solid 중앙에 α=0 구멍
  const solid: [number, number, number, number] = [200, 100, 50, 255];
  const hole: [number, number, number, number] = [0, 0, 0, 0];
  const img = makeImg(3, 3, [solid, solid, solid, solid, hole, solid, solid, solid, solid]);

  const out = morphCloseAlpha(img, { radius: 1 });
  const alpha = alphaGrid(out);
  assert.equal(alpha[1]![1], 255, "중앙 구멍이 α=255 로 채워짐");
  // RGB 이웃 평균 ≈ solid 색
  assert.equal(out.data[(1 * 3 + 1) * 4], 200);
  assert.equal(out.data[(1 * 3 + 1) * 4 + 1], 100);
  assert.equal(out.data[(1 * 3 + 1) * 4 + 2], 50);
});

test("morphCloseAlpha: radius=1 은 3x3 구멍의 중앙만 미충전 (에로전이 복구 못함)", () => {
  // 5x5 solid 중앙 3x3 구멍 — 내부 3x3 중 중앙은 너무 깊어서 radius=1 close 가 복구 못함
  const solid: [number, number, number, number] = [255, 255, 255, 255];
  const hole: [number, number, number, number] = [0, 0, 0, 0];
  const pixels: Array<[number, number, number, number]> = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      if (x >= 1 && x <= 3 && y >= 1 && y <= 3) pixels.push(hole);
      else pixels.push(solid);
    }
  }
  const img = makeImg(5, 5, pixels);
  const out = morphCloseAlpha(img, { radius: 1 });
  const alpha = alphaGrid(out);
  assert.equal(alpha[2]![2], 0, "중앙 픽셀은 아직 비어 있어야 함 (의도된 구멍 보호)");
  // radius=2 면 닫힘
  const out2 = morphCloseAlpha(img, { radius: 2 });
  assert.equal(alphaGrid(out2)[2]![2], 255);
});

test("morphCloseAlpha: 완전 투명 입력 → 입력 동일 (닫을 게 없음)", () => {
  const transparent: [number, number, number, number] = [0, 0, 0, 0];
  const img = makeImg(3, 3, Array.from({ length: 9 }, () => transparent));
  const out = morphCloseAlpha(img, { radius: 1 });
  assert.deepEqual(Array.from(out.data), Array.from(img.data));
});

test("morphCloseAlpha: 완전 solid 입력 → 입력 동일", () => {
  const solid: [number, number, number, number] = [128, 64, 32, 255];
  const img = makeImg(3, 3, Array.from({ length: 9 }, () => solid));
  const out = morphCloseAlpha(img, { radius: 1 });
  assert.deepEqual(Array.from(out.data), Array.from(img.data));
});

test("morphCloseAlpha: radius=0 → 입력 동일 (no-op)", () => {
  const solid: [number, number, number, number] = [100, 100, 100, 255];
  const hole: [number, number, number, number] = [0, 0, 0, 0];
  const img = makeImg(3, 3, [solid, solid, solid, solid, hole, solid, solid, solid, solid]);
  const out = morphCloseAlpha(img, { radius: 0 });
  assert.deepEqual(Array.from(out.data), Array.from(img.data));
});

test("morphCloseAlpha: premultiplied 입력 → throw", () => {
  const buf = new Uint8ClampedArray(1 * 1 * 4);
  const img = createImageBuffer(1, 1, buf, true);
  assert.throws(() => morphCloseAlpha(img), /straight-alpha/);
});

test("morphCloseAlpha: radius 범위 가드 (음수/5 이상 throw)", () => {
  const img = makeImg(1, 1, [[0, 0, 0, 0]]);
  assert.throws(() => morphCloseAlpha(img, { radius: -1 }), /radius/);
  assert.throws(() => morphCloseAlpha(img, { radius: 5 }), /radius/);
});

test("morphCloseAlpha: 결정론 — 두 번 호출 동일 결과", () => {
  const solid: [number, number, number, number] = [123, 45, 67, 255];
  const hole: [number, number, number, number] = [0, 0, 0, 0];
  const img = makeImg(3, 3, [solid, solid, solid, solid, hole, solid, solid, solid, solid]);
  const a = morphCloseAlpha(img, { radius: 1 });
  const b = morphCloseAlpha(img, { radius: 1 });
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});
