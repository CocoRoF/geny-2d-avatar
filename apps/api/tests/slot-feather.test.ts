// P4.5 - slot-feather 회귀. sharp dest-in 으로 alpha 감쇠 검증.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { applySlotFeather } from "../src/lib/slot-feather.js";

// 완전 불투명 흰색 RGBA PNG 생성 (테스트용).
async function opaqueWhite(w: number, h: number): Promise<Buffer> {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function readAlphaAt(buf: Buffer, x: number, y: number): Promise<number> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return data[i + 3]!;
}

test("applySlotFeather: featherPx=0 → 원본 반환 (no-op)", async () => {
  const src = await opaqueWhite(64, 64);
  const out = await applySlotFeather(src, { width: 64, height: 64, featherPx: 0 });
  assert.equal(out, src, "feather 0 은 같은 버퍼 ref 반환");
});

test("applySlotFeather: 너무 작은 슬롯 (<16px) 은 no-op", async () => {
  const src = await opaqueWhite(8, 8);
  const out = await applySlotFeather(src, { width: 8, height: 8, featherPx: 4 });
  assert.equal(out, src);
});

test("applySlotFeather: 64x64 에 4px feather 적용 시 코너 alpha 가 중앙보다 낮음", async () => {
  const src = await opaqueWhite(64, 64);
  const out = await applySlotFeather(src, { width: 64, height: 64, featherPx: 4 });
  // 결과는 다른 버퍼.
  assert.notEqual(out, src);
  const center = await readAlphaAt(out, 32, 32);
  const corner = await readAlphaAt(out, 0, 0);
  const edgeMid = await readAlphaAt(out, 0, 32);
  assert.ok(center >= 250, "중앙은 거의 원본 alpha 유지 (got " + center + ")");
  assert.ok(corner < 50, "코너는 크게 감쇠 (got " + corner + ")");
  assert.ok(edgeMid < center, "엣지 중간도 중앙보다 낮음 (edge=" + edgeMid + " center=" + center + ")");
});

test("applySlotFeather: 결과 PNG 크기 유지", async () => {
  const src = await opaqueWhite(128, 96);
  const out = await applySlotFeather(src, { width: 128, height: 96, featherPx: 6 });
  const info = await sharp(out).metadata();
  assert.equal(info.width, 128);
  assert.equal(info.height, 96);
});

test("applySlotFeather: inset 는 min dim /8 로 클램프", async () => {
  // 16x16 에 feather=32 요청. min/8 = 2 로 제한되어야 함.
  const src = await opaqueWhite(16, 16);
  const out = await applySlotFeather(src, { width: 16, height: 16, featherPx: 32 });
  // inset=2 이면 center 는 높은 alpha, 코너는 낮은 alpha 유지.
  const center = await readAlphaAt(out, 8, 8);
  const corner = await readAlphaAt(out, 0, 0);
  assert.ok(center > corner);
  // 그리고 결과 이미지는 모든 alpha 가 0 이 아니어야 함 (즉 over-feather 아님).
  assert.ok(center > 100, "excessive feather 방지 확인");
});

test("applySlotFeather: 완전 투명 입력 → 여전히 투명 (mask 는 alpha 곱)", async () => {
  const src = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .png()
    .toBuffer();
  const out = await applySlotFeather(src, { width: 64, height: 64, featherPx: 4 });
  const center = await readAlphaAt(out, 32, 32);
  assert.equal(center, 0);
});
