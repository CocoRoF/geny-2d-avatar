/**
 * Inpainting 후처리 합성 — AI 결과의 mask 영역만 채택, 외부는 원본 보존.
 *
 * 핵심 가치: AI 가 mask 를 무시하고 전체를 다시 그려도 우리가 강제로 mask 외부는 원본
 * 픽셀로 복원. 결과적으로 사용자가 그린 mask 영역만 변형, 외부는 atlas 100% 보존.
 *
 * Mask convention (표준 inpainting):
 *   - RGB grayscale: white (255) = 변형 영역, black (0) = 보존 영역
 *   - alpha 무시 (사용자 UI 가 grayscale RGB 로 그림)
 *   - 중간값 (gray) 은 부분 블렌딩
 *
 * 알고리즘 (per-pixel RGBA):
 *   w = mask.R / 255
 *   final.RGB = w * ai.RGB + (1 - w) * original.RGB
 *   final.A   = max(original.A, w * ai.A)   // 원본 alpha 유지 + mask 영역에서만 추가
 */

import sharp from "sharp";

export interface InpaintCompositeInput {
  readonly originalPng: Buffer;
  readonly aiResultPng: Buffer;
  readonly maskPng: Buffer;
  readonly width: number;
  readonly height: number;
  /** 마스크 경계 부드럽게 (sharp blur). 0 = off. */
  readonly featherPx?: number;
}

async function toRgbaRaw(
  png: Buffer,
  width: number,
  height: number,
): Promise<Buffer> {
  const r = await sharp(png)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (r.info.channels !== 4 || r.info.width !== width || r.info.height !== height) {
    throw new Error(
      "toRgbaRaw size mismatch: " + r.info.width + "x" + r.info.height + "/" + r.info.channels,
    );
  }
  return r.data;
}

export async function compositeInpaintResult(input: InpaintCompositeInput): Promise<Buffer> {
  const { originalPng, aiResultPng, maskPng, width, height, featherPx = 2 } = input;

  // mask: grayscale 로 변환 후 R 채널만 사용 (white=변형, black=보존). alpha 무시.
  let maskPipeline = sharp(maskPng).resize(width, height, { fit: "fill" }).removeAlpha().grayscale();
  if (featherPx > 0) {
    maskPipeline = maskPipeline.blur(featherPx);
  }
  const maskRaw = await maskPipeline.raw().toBuffer({ resolveWithObject: true });
  const m = maskRaw.data;
  const maskChannels = maskRaw.info.channels; // 보통 1 (grayscale).

  const orig = await toRgbaRaw(originalPng, width, height);
  const ai = await toRgbaRaw(aiResultPng, width, height);
  const out = Buffer.alloc(orig.length);
  const len = orig.length;
  for (let i = 0; i < len; i += 4) {
    const maskIdx = (i / 4) * maskChannels;
    const w = m[maskIdx]! / 255;
    const inv = 1 - w;
    out[i] = Math.round(w * ai[i]! + inv * orig[i]!);
    out[i + 1] = Math.round(w * ai[i + 1]! + inv * orig[i + 1]!);
    out[i + 2] = Math.round(w * ai[i + 2]! + inv * orig[i + 2]!);
    // alpha: 원본 alpha 유지 + mask 영역에서만 ai alpha 적용.
    const aiA = w * ai[i + 3]!;
    out[i + 3] = Math.max(orig[i + 3]!, Math.round(aiA));
  }
  return await sharp(out, { raw: { width, height, channels: 4 } })
    .png({ compressionLevel: 6 })
    .toBuffer();
}

/**
 * OpenAI `/v1/images/edits` 의 mask convention 변환.
 *   우리: grayscale RGB white = 변형 영역
 *   OpenAI: alpha=0 = 변형 영역 (transparent 가 편집 가능)
 * → mask 의 R 값을 (255 - R) 로 alpha 채널에 매핑한 새 PNG 생성.
 */
export async function maskToOpenAIConvention(maskPng: Buffer): Promise<Buffer> {
  const r = await sharp(maskPng).removeAlpha().grayscale().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = r.info;
  const gray = r.data;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    const o = i * 4;
    rgba[o] = 0;
    rgba[o + 1] = 0;
    rgba[o + 2] = 0;
    rgba[o + 3] = 255 - v; // white(변형) → alpha 0 (OpenAI 변형)
  }
  return await sharp(rgba, { raw: { width, height, channels: 4 } }).png().toBuffer();
}
