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
  /**
   * 입력 이미지의 aspect ratio 가 target ratio 와 너무 다르면 INVALID_OUTPUT 으로 reject.
   * AI vendor 가 atlas 형식 (정사각형 등) 무시하고 portrait 같은 비율로 그릴 때 거부 → fallback.
   * 기본 0.5 = 50% 차이까지 허용. 0 = 검증 안 함.
   */
  readonly maxAspectRatioDelta?: number;
}

/**
 * 입력: JPEG/PNG/WebP 등 sharp 가 디코딩 가능한 이미지 bytes.
 * 출력: 정확히 targetWidth × targetHeight 크기의 RGBA PNG bytes.
 */
export async function normalizeToPng(
  inputBytes: Buffer,
  opts: NormalizeOptions,
): Promise<Buffer> {
  try {
    // aspect ratio 검증 (옵션). target=1:1 인데 응답이 portrait 면 atlas 형식 위배 → reject.
    const maxDelta = opts.maxAspectRatioDelta;
    if (maxDelta !== undefined && maxDelta > 0) {
      const meta = await sharp(inputBytes).metadata();
      if (meta.width && meta.height) {
        const targetRatio = opts.targetWidth / opts.targetHeight;
        const inputRatio = meta.width / meta.height;
        const delta = Math.abs(inputRatio - targetRatio) / targetRatio;
        if (delta > maxDelta) {
          const err = new Error(
            "vendor returned image with incompatible aspect ratio: " +
              meta.width + "x" + meta.height +
              " (ratio " + inputRatio.toFixed(2) +
              ") vs target " + opts.targetWidth + "x" + opts.targetHeight +
              " (ratio " + targetRatio.toFixed(2) +
              "), delta " + delta.toFixed(2) +
              " > " + maxDelta + ". Likely portrait/full-body image instead of atlas.",
          ) as Error & { code?: string };
          err.code = "ATLAS_RATIO_MISMATCH";
          throw err;
        }
      }
    }
    return await sharp(inputBytes)
      .resize(opts.targetWidth, opts.targetHeight, {
        fit: "cover",
        position: "center",
      })
      .png({ compressionLevel: 6 })
      .toBuffer();
  } catch (err) {
    const e = err as Error & { code?: string };
    if (e.code === "ATLAS_RATIO_MISMATCH") throw err;
    const wrapped = new Error(
      "normalizeToPng failed (" + (e.message || "unknown") + ")",
    ) as Error & { code?: string };
    wrapped.code = "INVALID_OUTPUT";
    throw wrapped;
  }
}
