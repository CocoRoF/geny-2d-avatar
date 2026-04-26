/**
 * AI 응답의 RGB 채널 + reference 의 A 채널을 합성. AI image API (Gemini / OpenAI) 가
 * 결과 PNG 의 alpha 를 보존하지 않고 검정/단색 배경으로 채워버리는 문제 해결.
 *
 * 작동:
 *   1. AI 응답 PNG 와 reference PNG 를 모두 target (atlas) 사이즈로 resize (fit: fill)
 *   2. AI 의 RGB + reference 의 A → 새 RGBA 버퍼 합성
 *   3. PNG 인코딩
 *
 * 효과:
 *   - reference 의 transparent 영역 (alpha=0) → 결과도 transparent
 *   - reference 의 opaque 영역 (alpha=255) → AI 결과 색상 그대로
 *   - 즉 atlas 의 캐릭터 영역에만 AI 색이 나타나고, 그 외 영역은 보존된 transparent
 *
 * 한계:
 *   - AI 가 생성한 캐릭터가 reference 의 캐릭터와 픽셀 단위로 정렬되지 않으면 결과가 이상해 보임.
 *     하지만 적어도 transparent 배경은 보장.
 *   - AI 가 atlas 형식을 무시하고 portrait 만 그려도 alpha mask 만 원본 따라가서 시각적
 *     혼란 발생 가능. 진짜 atlas 보존 변형은 ControlNet inpainting 류 별도 도구 필요.
 */

import sharp from "sharp";

export interface AlphaMaskTransferInput {
  readonly aiPng: Buffer;
  readonly referencePng: Buffer;
  readonly width: number;
  readonly height: number;
}

export async function applyReferenceAlpha(input: AlphaMaskTransferInput): Promise<Buffer> {
  const { aiPng, referencePng, width, height } = input;
  // 두 입력을 동일 사이즈 + RGBA 4채널로 정규화.
  const ai = await sharp(aiPng)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ref = await sharp(referencePng)
    .resize(width, height, { fit: "fill" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    ai.info.width !== ref.info.width ||
    ai.info.height !== ref.info.height ||
    ai.info.channels !== 4 ||
    ref.info.channels !== 4
  ) {
    throw Object.assign(
      new Error(
        "applyReferenceAlpha: dimension/channel mismatch ai=" +
          ai.info.width + "x" + ai.info.height + "/" + ai.info.channels +
          " ref=" + ref.info.width + "x" + ref.info.height + "/" + ref.info.channels,
      ),
      { code: "INVALID_OUTPUT" },
    );
  }
  // RGB from AI, A from reference.
  const out = Buffer.alloc(ai.data.length);
  for (let i = 0; i < ai.data.length; i += 4) {
    out[i] = ai.data[i]!;
    out[i + 1] = ai.data[i + 1]!;
    out[i + 2] = ai.data[i + 2]!;
    out[i + 3] = ref.data[i + 3]!;
  }
  return await sharp(out, {
    raw: { width: ai.info.width, height: ai.info.height, channels: 4 },
  })
    .png({ compressionLevel: 6 })
    .toBuffer();
}
