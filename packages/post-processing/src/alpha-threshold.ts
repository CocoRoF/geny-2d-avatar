/**
 * docs/06 §4.2 step 2 — 알파 임계 클리너.
 *
 * `0 < α < threshold` 인 픽셀의 알파(와 premultiplied 면 RGB 도)를 0 으로. 기본 임계는
 * docs/06 §4.2 에 명시된 8. "노이즈 알파" 만 제거하므로 threshold 는 작게 유지.
 */
import { createImageBuffer, type ImageBuffer } from "./types.js";

export interface AlphaThresholdOptions {
  /** 기본 8 — 이보다 작은 양수 알파는 0 으로 떨어뜨림. */
  threshold?: number;
}

export function cleanAlphaNoise(
  img: ImageBuffer,
  opts: AlphaThresholdOptions = {},
): ImageBuffer {
  const threshold = opts.threshold ?? 8;
  if (!Number.isInteger(threshold) || threshold < 0 || threshold > 255) {
    throw new RangeError(`threshold must be integer in [0,255], got ${threshold}`);
  }
  if (threshold === 0) return img;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  out.set(src);
  for (let i = 0; i < out.length; i += 4) {
    const a = out[i + 3] ?? 0;
    if (a > 0 && a < threshold) {
      out[i + 3] = 0;
      if (img.premultiplied) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
      }
    }
  }
  return createImageBuffer(img.width, img.height, out, img.premultiplied);
}
