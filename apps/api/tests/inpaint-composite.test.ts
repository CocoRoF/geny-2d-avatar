// Inpaint composite — mask 영역만 AI, 외부는 원본 보존 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { compositeInpaintResult, maskToOpenAIConvention } from "../src/lib/inpaint-composite.js";

async function solid(w: number, h: number, r: number, g: number, b: number, a: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: a / 255 } },
  })
    .png()
    .toBuffer();
}

async function readPx(buf: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

test("compositeInpaintResult: mask=흰색 → ai 픽셀, mask=검정 → 원본", async () => {
  const original = await solid(64, 64, 200, 100, 50, 255); // 주황색
  const ai = await solid(64, 64, 0, 0, 255, 255); // 파랑
  // 좌측 절반은 흰색, 우측은 검정.
  const maskRaw = Buffer.alloc(64 * 64 * 4);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const idx = (y * 64 + x) * 4;
      const v = x < 32 ? 255 : 0;
      maskRaw[idx] = v; maskRaw[idx + 1] = v; maskRaw[idx + 2] = v;
      maskRaw[idx + 3] = 255;
    }
  }
  const maskPng = await sharp(maskRaw, { raw: { width: 64, height: 64, channels: 4 } }).png().toBuffer();

  const out = await compositeInpaintResult({
    originalPng: original, aiResultPng: ai, maskPng,
    width: 64, height: 64, featherPx: 0,
  });
  const left = await readPx(out, 5, 32);
  const right = await readPx(out, 60, 32);
  // 좌측 (mask=255) → ai 의 파랑 (B=255).
  assert.ok(left[2] > 200, "좌측 B≈255 (ai). got=" + left[2]);
  // 우측 (mask=0) → 원본의 주황 (R=200, B=50).
  assert.ok(right[0] > 150 && right[2] < 100, "우측 원본 보존 (R 큼, B 작음). got=" + right);
});

test("compositeInpaintResult: 원본 transparent (alpha=0) 영역은 변형 영역이라도 alpha 보존 → atlas 비어있는 부분 유지", async () => {
  // 원본은 투명 (alpha=0).
  const original = await solid(32, 32, 0, 0, 0, 0);
  // AI 는 검정 opaque.
  const ai = await solid(32, 32, 0, 0, 0, 255);
  // mask 전체 흰색 (변형 영역).
  const mask = await solid(32, 32, 255, 255, 255, 255);
  const out = await compositeInpaintResult({
    originalPng: original, aiResultPng: ai, maskPng: mask,
    width: 32, height: 32, featherPx: 0,
  });
  const px = await readPx(out, 16, 16);
  // alpha 는 max(원본 alpha, mask*ai alpha) = max(0, 1*255) = 255.
  // 즉 원본이 투명이어도 mask 영역 안에서 AI 가 그렸으면 보임. (사용자가 일부러 그린 영역.)
  // 단 atlas 의 caractere 외 영역에 사용자가 mask 안 그렸으면 mask=0 → 원본 alpha=0 유지.
  assert.equal(px[3], 255);
});

test("compositeInpaintResult: 출력 크기 = target", async () => {
  const o = await solid(20, 30, 100, 100, 100, 255);
  const a = await solid(20, 30, 0, 200, 0, 255);
  const m = await solid(20, 30, 128, 128, 128, 255);
  const out = await compositeInpaintResult({
    originalPng: o, aiResultPng: a, maskPng: m,
    width: 64, height: 64, featherPx: 0,
  });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 64);
  assert.equal(meta.height, 64);
});

test("compositeInpaintResult: mask=128 (반투명) → 원본/ai 50:50 블렌딩", async () => {
  const original = await solid(16, 16, 0, 0, 0, 255); // 검정
  const ai = await solid(16, 16, 255, 255, 255, 255); // 흰색
  const mask = await solid(16, 16, 128, 128, 128, 255); // 회색 = 50%
  const out = await compositeInpaintResult({
    originalPng: original, aiResultPng: ai, maskPng: mask,
    width: 16, height: 16, featherPx: 0,
  });
  const px = await readPx(out, 8, 8);
  // 50% 블렌딩 → ~127.
  assert.ok(px[0] > 100 && px[0] < 160, "blend 중간값. got=" + px[0]);
});

// maskToOpenAIConvention

test("maskToOpenAIConvention: alpha=255 (변형) → alpha=0 (OpenAI 변형)", async () => {
  const our = await solid(8, 8, 255, 255, 255, 255);
  const oa = await maskToOpenAIConvention(our);
  const px = await readPx(oa, 4, 4);
  assert.equal(px[3], 0, "alpha invert 됨");
});

test("maskToOpenAIConvention: alpha=0 (보존) → alpha=255 (OpenAI 보존)", async () => {
  const our = await solid(8, 8, 0, 0, 0, 0);
  const oa = await maskToOpenAIConvention(our);
  const px = await readPx(oa, 4, 4);
  assert.equal(px[3], 255);
});
