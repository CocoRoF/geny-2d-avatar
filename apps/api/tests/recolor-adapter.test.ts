// recolor 어댑터 회귀 — sharp hue/saturation shift 로 atlas 보존 변형.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createRecolorAdapter } from "../src/lib/adapters/recolor-adapter.js";
import { generateMockTexture } from "../src/lib/mock-generator.js";
import type { TextureTask } from "../src/lib/texture-adapter.js";

const SAMPLE = generateMockTexture({ prompt: "ref", seed: 1, width: 256, height: 256 });

function task(over?: Partial<TextureTask>): TextureTask {
  return {
    preset: { id: "tpl.base.v1.mao_pro", version: "1.0.0" },
    prompt: "blue hair",
    seed: 42,
    width: 256,
    height: 256,
    referenceImage: { png: SAMPLE },
    ...over,
  };
}

test("recolor.supports: referenceImage + 색 키워드 → true", () => {
  const a = createRecolorAdapter();
  assert.equal(a.supports(task()), true);
});

test("recolor.supports: referenceImage 없음 → false", () => {
  const a = createRecolorAdapter();
  const t = { ...task() } as { referenceImage?: unknown };
  delete t.referenceImage;
  assert.equal(a.supports(t as TextureTask), false);
});

test("recolor.supports: 색 키워드 없음 → false (다른 어댑터로 fallback)", () => {
  const a = createRecolorAdapter();
  assert.equal(a.supports(task({ prompt: "make it look fancy" })), false);
});

test("recolor.supports: enabled=false → false", () => {
  const a = createRecolorAdapter({ enabled: false });
  assert.equal(a.supports(task()), false);
});

test("recolor.generate: blue 단서 → atlas size 보존 + 색 변경", async () => {
  const a = createRecolorAdapter();
  const r = await a.generate(task({ prompt: "navy blue hair", width: 128, height: 128 }));
  assert.equal(r.width, 128);
  assert.equal(r.height, 128);
  // 결과는 ref 와 다른 픽셀 (hue 회전).
  assert.notEqual(r.sha256, SAMPLE.toString("hex").slice(0, 64));
  // 결과가 valid PNG.
  const meta = await sharp(r.png).metadata();
  assert.equal(meta.width, 128);
  assert.equal(meta.height, 128);
});

test("recolor.generate: silver → 채도 0 (회색조)", async () => {
  const a = createRecolorAdapter();
  const r = await a.generate(task({ prompt: "silver long hair" }));
  // silver = saturation 0. raw stats 의 평균 채도가 매우 낮을 것 — sharp.stats 로 검증.
  const stats = await sharp(r.png).stats();
  // RGB 의 R/G/B 평균이 비슷해야 회색조.
  const rMean = stats.channels[0]!.mean;
  const gMean = stats.channels[1]!.mean;
  const bMean = stats.channels[2]!.mean;
  const maxDiff = Math.max(
    Math.abs(rMean - gMean),
    Math.abs(gMean - bMean),
    Math.abs(rMean - bMean),
  );
  assert.ok(
    maxDiff < 30,
    "silver 변환 후 R/G/B 평균 차이가 작아야 함 (got " + maxDiff.toFixed(1) + ")",
  );
});

test("recolor.generate: 결정론 - 동일 (referenceImage, prompt) → 동일 sha256", async () => {
  const a = createRecolorAdapter();
  const r1 = await a.generate(task({ prompt: "blue hair" }));
  const r2 = await a.generate(task({ prompt: "blue hair" }));
  assert.equal(r1.sha256, r2.sha256);
});

test("recolor.name", () => {
  const a = createRecolorAdapter();
  assert.equal(a.name, "recolor@local-hue");
});
