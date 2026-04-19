/**
 * featherAlpha — docs/06 §4.2 step 4 회귀.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { createImageBuffer, featherAlpha } from "../src/index.js";

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

function alphaAt(img: ReturnType<typeof makeImg>, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3] ?? 0;
}

test("featherAlpha: radius=0 → 입력 동일 (no-op)", () => {
  const img = makeImg(3, 3, [
    [0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 0, 0],
    [0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 0, 0],
    [0, 0, 0, 0], [255, 0, 0, 255], [0, 0, 0, 0],
  ]);
  const out = featherAlpha(img, { radius: 0 });
  assert.deepEqual(Array.from(out.data), Array.from(img.data));
});

test("featherAlpha: 완전 solid (α=255) 내부는 그대로 유지", () => {
  const solid: [number, number, number, number] = [100, 100, 100, 255];
  // 5x5 완전 solid — 내부 3x3 은 feather 후에도 α=255 (이웃 전부 255)
  const img = makeImg(5, 5, Array.from({ length: 25 }, () => solid));
  const out = featherAlpha(img, { radius: 1 });
  // 내부 (2,2) 는 3x3 이웃 평균이 전부 255 → 255
  assert.equal(alphaAt(out, 2, 2), 255);
});

test("featherAlpha: 에지 픽셀은 알파가 부드러워짐 (투명 이웃이 평균을 낮춤)", () => {
  const solid: [number, number, number, number] = [100, 100, 100, 255];
  const trans: [number, number, number, number] = [0, 0, 0, 0];
  // 수평 경계: 좌측 3열 solid / 우측 3열 transparent (3x6)
  const pixels: Array<[number, number, number, number]> = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 6; x++) {
      pixels.push(x < 3 ? solid : trans);
    }
  }
  const img = makeImg(6, 3, pixels);
  const out = featherAlpha(img, { radius: 1 });
  // (2,1) (solid edge) 알파는 내려갔음 (이웃 중 투명 포함) 하지만 0 은 아님
  const edgeAlpha = alphaAt(out, 2, 1);
  assert.ok(edgeAlpha < 255 && edgeAlpha > 0, `edge alpha ${edgeAlpha} ∈ (0, 255)`);
  // (3,1) (transparent side edge) 알파는 올라갔음
  const transEdgeAlpha = alphaAt(out, 3, 1);
  assert.ok(transEdgeAlpha > 0, `transparent-side alpha ${transEdgeAlpha} > 0`);
});

test("featherAlpha: RGB 채널은 변경되지 않음", () => {
  const pixels: Array<[number, number, number, number]> = [
    [255, 0, 0, 255],
    [0, 255, 0, 255],
    [0, 0, 255, 0],
    [128, 64, 32, 128],
  ];
  const img = makeImg(2, 2, pixels);
  const out = featherAlpha(img, { radius: 1 });
  for (let i = 0; i < 4; i++) {
    assert.equal(out.data[i * 4], pixels[i]![0], `R[${i}]`);
    assert.equal(out.data[i * 4 + 1], pixels[i]![1], `G[${i}]`);
    assert.equal(out.data[i * 4 + 2], pixels[i]![2], `B[${i}]`);
  }
});

test("featherAlpha: premultiplied 입력 → throw", () => {
  const buf = new Uint8ClampedArray(1 * 1 * 4);
  const img = createImageBuffer(1, 1, buf, true);
  assert.throws(() => featherAlpha(img), /straight-alpha/);
});

test("featherAlpha: radius 범위 가드", () => {
  const img = makeImg(1, 1, [[0, 0, 0, 0]]);
  assert.throws(() => featherAlpha(img, { radius: -1 }), /radius/);
  assert.throws(() => featherAlpha(img, { radius: 5 }), /radius/);
});

test("featherAlpha: 결정론 — 두 번 호출 동일 결과", () => {
  const pixels: Array<[number, number, number, number]> = [];
  for (let i = 0; i < 9; i++) pixels.push([i * 30, 255, 0, i < 5 ? 255 : 0]);
  const img = makeImg(3, 3, pixels);
  const a = featherAlpha(img, { radius: 1 });
  const b = featherAlpha(img, { radius: 1 });
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});
