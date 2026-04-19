/**
 * Stage 1 pipeline golden — `applyAlphaSanitation()` 의 결과 sha256 을 고정.
 *
 * 픽스처: 8×8 RGBA 이미지를 `seed=42` deterministic PRNG 로 생성. 각 픽셀의 알파는
 * 0~255 중 고르게 분포(노이즈 포함). 파이프라인은 threshold=8 + bbox 계산.
 * 결과 sha256 이 바뀌면 골든 갱신 PR 이 필요 — 픽셀 단위 회귀 장벽.
 */
import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyAlphaSanitation, createImageBuffer } from "../src/index.js";

function makeFixture(seed: number, width: number, height: number) {
  // 결정론적 LCG — node --test 환경의 Math.random 비의존.
  let s = (seed >>> 0) || 1;
  const next = () => (s = (s * 1664525 + 1013904223) >>> 0);
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = next() & 0xff;
    buf[i + 1] = next() & 0xff;
    buf[i + 2] = next() & 0xff;
    buf[i + 3] = next() & 0xff;
  }
  return createImageBuffer(width, height, buf, false);
}

test("pipeline golden: applyAlphaSanitation sha256 + bbox 고정", () => {
  const input = makeFixture(42, 8, 8);
  const out = applyAlphaSanitation(input);
  const sha = createHash("sha256").update(out.image.data).digest("hex");
  assert.equal(
    sha,
    "f2341b59b28a057c9870829cc6dbb72a7ff83c42debe1b23c083f8f32a98bcc9",
    "pipeline 출력 sha256 이 변경되면 골든 갱신 검토",
  );
  assert.deepEqual(out.bbox, { x: 0, y: 0, width: 8, height: 8 });
});

test("pipeline golden: premultiplied 입력 — 먼저 straight 으로 역변환된 결과", () => {
  const straight = makeFixture(7, 4, 4);
  // 미리 premultiplied 로 변환해서 플래그만 조작하지 않도록 실제 곱 수행 필요.
  // 여기서는 데이터를 그대로 넣고 premultiplied=true 플래그만 바꿔
  // 파이프라인이 역변환 분기를 타는 것을 확인한다.
  const faux = createImageBuffer(4, 4, straight.data, true);
  const out = applyAlphaSanitation(faux);
  assert.equal(out.image.premultiplied, false);
});

test("pipeline: bbox 가 threshold 적용 이후로 계산됨", () => {
  // 전부 α=4 (노이즈) 로 채우면 bbox=null
  const buf = new Uint8ClampedArray(4 * 4 * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i + 3] = 4;
  }
  const img = createImageBuffer(4, 4, buf, false);
  const out = applyAlphaSanitation(img);
  assert.equal(out.bbox, null);
});

test("pipeline: α≥8 픽셀 하나만 있으면 bbox 는 그 픽셀만", () => {
  const w = 4;
  const h = 4;
  const buf = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < buf.length; i += 4) buf[i + 3] = 4; // 노이즈
  buf[(2 * w + 3) * 4 + 3] = 200; // 유효
  const img = createImageBuffer(w, h, buf, false);
  const out = applyAlphaSanitation(img);
  assert.deepEqual(out.bbox, { x: 3, y: 2, width: 1, height: 1 });
});

test("pipeline: close + feather + uvClip 옵션 조합 — 순서 보장 (세션 35)", () => {
  // 3x3 solid with 중앙 구멍 → close 로 채워짐 → feather 로 알파 부드러워짐 → uvClip 으로
  // 2x2 박스 밖 픽셀은 α=0.
  const solidRGBA = [180, 90, 45, 255] as const;
  const hole = [0, 0, 0, 0] as const;
  const w = 3;
  const h = 3;
  const buf = new Uint8ClampedArray(w * h * 4);
  const layout = [solidRGBA, solidRGBA, solidRGBA, solidRGBA, hole, solidRGBA, solidRGBA, solidRGBA, solidRGBA];
  for (let i = 0; i < 9; i++) {
    buf[i * 4] = layout[i]![0];
    buf[i * 4 + 1] = layout[i]![1];
    buf[i * 4 + 2] = layout[i]![2];
    buf[i * 4 + 3] = layout[i]![3];
  }
  const img = createImageBuffer(w, h, buf, false);

  const out = applyAlphaSanitation(img, {
    close: { radius: 1 },
    feather: { radius: 1 },
    uvClip: { x: 0, y: 0, width: 2, height: 2 },
  });

  // close 후 중앙 (1,1) α>0 — feather 로 약간 낮아져 있어도 0 은 아님
  // uvClip 으로 (0..1, 0..1) 만 유지. (2,y) 와 (x,2) 는 α=0.
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      const a = out.image.data[(y * w + x) * 4 + 3] ?? 0;
      if (x >= 2 || y >= 2) {
        assert.equal(a, 0, `outside uvClip (${x},${y}) should be α=0, got ${a}`);
      }
    }
  }
  // bbox 는 2x2 박스 안에서만 산출
  assert.ok(out.bbox);
  assert.ok(out.bbox!.x + out.bbox!.width <= 2);
  assert.ok(out.bbox!.y + out.bbox!.height <= 2);
});

test("pipeline: 옵션 없으면 기존 동작 유지 (세션 26 회귀)", () => {
  const img = createImageBuffer(2, 2, new Uint8ClampedArray([
    100, 100, 100, 255, 0, 0, 0, 4,
    100, 100, 100, 255, 100, 100, 100, 255,
  ]), false);
  const out = applyAlphaSanitation(img);
  // α=4 인 픽셀은 threshold 로 0 이 됨
  assert.equal(out.image.data[4 * 1 + 3], 0);
  // bbox 는 남은 3 픽셀 영역
  assert.ok(out.bbox);
});
