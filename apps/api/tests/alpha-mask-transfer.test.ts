// applyReferenceAlpha — AI RGB + reference A 합성 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { applyReferenceAlpha } from "../src/lib/alpha-mask-transfer.js";

async function solidRgba(w: number, h: number, r: number, g: number, b: number, a: number): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r, g, b, alpha: a / 255 } },
  })
    .png()
    .toBuffer();
}

async function readPixel(buf: Buffer, x: number, y: number): Promise<[number, number, number, number]> {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (y * info.width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

test("applyReferenceAlpha: AI 빨강 opaque + reference 투명 → 결과는 투명 (배경 보존)", async () => {
  const ai = await solidRgba(64, 64, 255, 0, 0, 255);
  const ref = await solidRgba(64, 64, 0, 0, 0, 0);
  const out = await applyReferenceAlpha({ aiPng: ai, referencePng: ref, width: 64, height: 64 });
  const px = await readPixel(out, 32, 32);
  assert.equal(px[3], 0, "alpha 가 reference 의 0 을 따라 투명");
  // RGB 는 AI 의 빨강 유지 (alpha=0 이라 화면엔 안 보이지만 데이터는 보존).
  assert.equal(px[0], 255);
});

test("applyReferenceAlpha: AI 파랑 opaque + reference 불투명 → 결과 파랑 + 불투명", async () => {
  const ai = await solidRgba(64, 64, 0, 0, 255, 255);
  const ref = await solidRgba(64, 64, 100, 100, 100, 255);
  const out = await applyReferenceAlpha({ aiPng: ai, referencePng: ref, width: 64, height: 64 });
  const px = await readPixel(out, 32, 32);
  assert.equal(px[3], 255, "reference 가 opaque 면 결과도 opaque");
  assert.equal(px[2], 255, "B 는 AI 의 파랑");
  assert.equal(px[0], 0);
  assert.equal(px[1], 0);
});

test("applyReferenceAlpha: 출력 사이즈 = target", async () => {
  const ai = await solidRgba(32, 48, 200, 100, 50, 255);
  const ref = await solidRgba(64, 64, 0, 0, 0, 128);
  const out = await applyReferenceAlpha({ aiPng: ai, referencePng: ref, width: 64, height: 64 });
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 64);
  assert.equal(meta.height, 64);
});

test("applyReferenceAlpha: AI 검정 배경 (gpt-image-2 처럼) + reference 투명 → 투명 보존", async () => {
  // AI 가 검정 배경 (R=G=B=0, alpha=255) 으로 만든 시나리오.
  const ai = await solidRgba(64, 64, 0, 0, 0, 255);
  // reference atlas 의 투명 영역 (alpha=0).
  const ref = await solidRgba(64, 64, 200, 100, 50, 0);
  const out = await applyReferenceAlpha({ aiPng: ai, referencePng: ref, width: 64, height: 64 });
  const px = await readPixel(out, 32, 32);
  assert.equal(px[3], 0, "AI 가 검정 opaque 만들었어도 reference alpha=0 이라 투명");
});
