/**
 * 이미지 후처리 유틸 — 벤더가 반환한 raw bytes 를 우리 파이프라인이 요구하는
 * RGBA PNG + 지정 크기로 정규화.
 *
 * 모든 벤더 어댑터 (nano-banana / openai-image / pollinations) 가 공유.
 */

import sharp from "sharp";

export interface NormalizeOptions {
  readonly targetWidth: number;
  readonly targetHeight: number;
}

/**
 * 입력: JPEG/PNG/WebP 등 sharp 가 디코딩 가능한 이미지 bytes.
 * 출력: 정확히 targetWidth × targetHeight 크기의 RGBA PNG bytes.
 *
 * sharp 의 `fit: "cover"` 로 종횡비 유지 + crop. 벤더 반환 비율이 달라도
 * 우리 atlas 크기에 맞춰 중앙 crop.
 */
export async function normalizeToPng(
  inputBytes: Buffer,
  opts: NormalizeOptions,
): Promise<Buffer> {
  try {
    return await sharp(inputBytes)
      .resize(opts.targetWidth, opts.targetHeight, {
        fit: "cover",
        position: "center",
      })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (err) {
    const e = err as Error;
    const wrapped = new Error(
      "normalizeToPng failed (" + (e.message || "unknown") + ")",
    ) as Error & { code?: string };
    wrapped.code = "INVALID_OUTPUT";
    throw wrapped;
  }
}
