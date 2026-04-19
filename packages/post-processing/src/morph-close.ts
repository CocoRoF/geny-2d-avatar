/**
 * docs/06 §4.2 step 3 — 알파 형태학적 닫힘 (binary close on alpha > 0).
 *
 * `radius=1` (3×3 SE) 은 1–2 픽셀 구멍을 닫는다 (doc 기준). `radius=2` (5×5 SE) 까지는
 * AI 생성물의 작은 고스트 구멍 제거에 적절. 그보다 크게 잡으면 "의도된 구멍" (눈꼬리 틈 등)
 * 까지 메울 수 있으므로 주의.
 *
 * 알고리즘:
 *   1. 이진 마스크 M[i] = (α[i] > 0).
 *   2. dilate(M, r)   — r 픽셀 반경 내 하나라도 solid 면 solid.
 *   3. erode(Md, r)   — r 픽셀 반경 전부 solid 여야 solid. → Mc (닫힘 마스크).
 *   4. 새로 solid 가 된 픽셀 (Mc ∧ ¬M) 에 대해:
 *      - α 를 255 로 채움.
 *      - RGB 는 반경 `r` 이내의 solid 이웃들의 α-가중 평균으로 보간.
 *
 * 제약:
 *   - 입력은 straight (premultiplied=false). premultiplied 면 throw.
 *   - 결과 역시 straight.
 *   - `maxHolePx` (의도된 구멍 보존) 은 이번 버전에서 미구현 — radius 로 간접 제어.
 */
import { createImageBuffer, type ImageBuffer } from "./types.js";

export interface MorphCloseOptions {
  /** 구조 원소 반경 (픽셀). 기본 1 — 3×3 SE. 최대 4 로 제한 (시각적 안전 가드). */
  radius?: number;
}

export function morphCloseAlpha(
  img: ImageBuffer,
  opts: MorphCloseOptions = {},
): ImageBuffer {
  if (img.premultiplied) {
    throw new Error("morphCloseAlpha requires straight-alpha input (premultiplied=false)");
  }
  const radius = opts.radius ?? 1;
  if (!Number.isInteger(radius) || radius < 0 || radius > 4) {
    throw new RangeError(`radius must be integer in [0,4], got ${radius}`);
  }
  if (radius === 0) return img;

  const { width, height, data } = img;
  const n = width * height;

  const solid = new Uint8Array(n);
  for (let i = 0; i < n; i++) solid[i] = (data[i * 4 + 3] ?? 0) > 0 ? 1 : 0;

  const dilated = dilate(solid, width, height, radius);
  const closed = erode(dilated, width, height, radius);

  const out = new Uint8ClampedArray(data.length);
  out.set(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (closed[idx] === 1 && solid[idx] === 0) {
        // 이웃 가중 평균
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let sumW = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -radius; dx <= radius; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (solid[nIdx] !== 1) continue;
            const a = data[nIdx * 4 + 3] ?? 0;
            sumR += (data[nIdx * 4] ?? 0) * a;
            sumG += (data[nIdx * 4 + 1] ?? 0) * a;
            sumB += (data[nIdx * 4 + 2] ?? 0) * a;
            sumW += a;
          }
        }
        if (sumW > 0) {
          out[idx * 4] = Math.round(sumR / sumW);
          out[idx * 4 + 1] = Math.round(sumG / sumW);
          out[idx * 4 + 2] = Math.round(sumB / sumW);
          out[idx * 4 + 3] = 255;
        }
      }
    }
  }

  return createImageBuffer(width, height, out, false);
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let hit = 0;
      for (let dy = -r; dy <= r && !hit; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) continue;
          if (mask[ny * w + nx] === 1) {
            hit = 1;
            break;
          }
        }
      }
      out[y * w + x] = hit;
    }
  }
  return out;
}

function erode(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let allSolid = 1;
      for (let dy = -r; dy <= r && allSolid; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= h) {
          allSolid = 0;
          break;
        }
        for (let dx = -r; dx <= r; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= w) {
            allSolid = 0;
            break;
          }
          if (mask[ny * w + nx] !== 1) {
            allSolid = 0;
            break;
          }
        }
      }
      out[y * w + x] = allSolid;
    }
  }
  return out;
}
