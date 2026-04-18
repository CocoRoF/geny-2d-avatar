/**
 * docs/06 §4.2 step 1 — premultiplied ↔ straight alpha 변환.
 *
 * 수식: premult = straight * (alpha/255). 라운드는 항상 `Math.round` — 결정론 필수.
 * α=0 픽셀은 정보 손실 이 되므로 straight 로 복원 시 RGB=0 유지 (lossy 구간).
 */
import { createImageBuffer, type ImageBuffer } from "./types.js";

export function straightToPremultiplied(img: ImageBuffer): ImageBuffer {
  if (img.premultiplied) return img;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] ?? 0;
    if (a === 255) {
      out[i] = src[i] ?? 0;
      out[i + 1] = src[i + 1] ?? 0;
      out[i + 2] = src[i + 2] ?? 0;
      out[i + 3] = a;
      continue;
    }
    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    out[i] = Math.round(((src[i] ?? 0) * a) / 255);
    out[i + 1] = Math.round(((src[i + 1] ?? 0) * a) / 255);
    out[i + 2] = Math.round(((src[i + 2] ?? 0) * a) / 255);
    out[i + 3] = a;
  }
  return createImageBuffer(img.width, img.height, out, true);
}

export function premultipliedToStraight(img: ImageBuffer): ImageBuffer {
  if (!img.premultiplied) return img;
  const src = img.data;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] ?? 0;
    if (a === 0) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }
    if (a === 255) {
      out[i] = src[i] ?? 0;
      out[i + 1] = src[i + 1] ?? 0;
      out[i + 2] = src[i + 2] ?? 0;
      out[i + 3] = a;
      continue;
    }
    out[i] = Math.min(255, Math.round(((src[i] ?? 0) * 255) / a));
    out[i + 1] = Math.min(255, Math.round(((src[i + 1] ?? 0) * 255) / a));
    out[i + 2] = Math.min(255, Math.round(((src[i + 2] ?? 0) * 255) / a));
    out[i + 3] = a;
  }
  return createImageBuffer(img.width, img.height, out, false);
}
