/**
 * clipToUvBox — docs/06 §4.2 step 5 회귀.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { clipToUvBox, createImageBuffer } from "../src/index.js";

function solid(w: number, h: number, rgba: [number, number, number, number], premult = false) {
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    buf[i * 4] = rgba[0];
    buf[i * 4 + 1] = rgba[1];
    buf[i * 4 + 2] = rgba[2];
    buf[i * 4 + 3] = rgba[3];
  }
  return createImageBuffer(w, h, buf, premult);
}

function alphaAt(img: ReturnType<typeof solid>, x: number, y: number): number {
  return img.data[(y * img.width + x) * 4 + 3] ?? 0;
}

test("clipToUvBox: 박스 안은 유지 / 밖은 α=0", () => {
  const img = solid(4, 4, [200, 100, 50, 255]);
  const out = clipToUvBox(img, { x: 1, y: 1, width: 2, height: 2 });
  // 안쪽 (1,1), (2,1), (1,2), (2,2)
  for (const [x, y] of [[1, 1], [2, 1], [1, 2], [2, 2]]) {
    assert.equal(alphaAt(out, x!, y!), 255, `inside (${x},${y})`);
  }
  // 바깥
  for (const [x, y] of [[0, 0], [3, 0], [0, 3], [3, 3]]) {
    assert.equal(alphaAt(out, x!, y!), 0, `outside (${x},${y})`);
  }
});

test("clipToUvBox: 박스 안의 RGB 는 보존", () => {
  const img = solid(3, 3, [123, 45, 67, 255]);
  const out = clipToUvBox(img, { x: 0, y: 0, width: 2, height: 2 });
  // (0,0): 안쪽
  assert.equal(out.data[0], 123);
  assert.equal(out.data[1], 45);
  assert.equal(out.data[2], 67);
  assert.equal(out.data[3], 255);
});

test("clipToUvBox: premultiplied 입력 — 바깥 RGB 도 0", () => {
  const img = solid(2, 2, [255, 0, 0, 255], true);
  const out = clipToUvBox(img, { x: 0, y: 0, width: 1, height: 1 });
  // (1,0) 은 바깥
  assert.equal(out.data[4], 0);
  assert.equal(out.data[5], 0);
  assert.equal(out.data[6], 0);
  assert.equal(out.data[7], 0);
});

test("clipToUvBox: 이미지 완전 밖 박스 → 전부 투명", () => {
  const img = solid(3, 3, [100, 100, 100, 255]);
  const out = clipToUvBox(img, { x: 10, y: 10, width: 2, height: 2 });
  for (let i = 0; i < 9; i++) {
    assert.equal(out.data[i * 4 + 3], 0);
  }
});

test("clipToUvBox: 박스 일부가 이미지 외부로 튀어나옴 → 교집합만 유지", () => {
  const img = solid(3, 3, [1, 2, 3, 255]);
  const out = clipToUvBox(img, { x: 1, y: 1, width: 10, height: 10 });
  // (0,0), (1,0), (2,0), (0,1), (0,2) 는 바깥
  assert.equal(alphaAt(out, 0, 0), 0);
  assert.equal(alphaAt(out, 1, 0), 0);
  assert.equal(alphaAt(out, 0, 1), 0);
  // (1,1), (2,2) 는 안
  assert.equal(alphaAt(out, 1, 1), 255);
  assert.equal(alphaAt(out, 2, 2), 255);
});

test("clipToUvBox: width=0 → 전부 투명 (빈 박스)", () => {
  const img = solid(3, 3, [100, 100, 100, 255]);
  const out = clipToUvBox(img, { x: 0, y: 0, width: 0, height: 3 });
  for (let i = 0; i < 9; i++) {
    assert.equal(out.data[i * 4 + 3], 0);
  }
});

test("clipToUvBox: 정수 검증 — 소수점 throw", () => {
  const img = solid(2, 2, [100, 100, 100, 255]);
  assert.throws(() => clipToUvBox(img, { x: 0.5, y: 0, width: 1, height: 1 }), /integer/);
  assert.throws(() => clipToUvBox(img, { x: 0, y: 0, width: 1.5, height: 1 }), /integer/);
});

test("clipToUvBox: 음수 크기 throw", () => {
  const img = solid(2, 2, [100, 100, 100, 255]);
  assert.throws(
    () => clipToUvBox(img, { x: 0, y: 0, width: -1, height: 1 }),
    /non-negative/,
  );
});

test("clipToUvBox: 결정론 — 두 번 호출 동일 결과", () => {
  const img = solid(4, 4, [200, 150, 100, 255]);
  const a = clipToUvBox(img, { x: 1, y: 1, width: 2, height: 2 });
  const b = clipToUvBox(img, { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual(Array.from(a.data), Array.from(b.data));
});
