/**
 * docs/06 §4.2 step 6 — 알파 바운딩박스 재계산.
 *
 * 알파가 `minAlpha` 이상인 픽셀들의 tight bbox. 전부 투명이면 `null`.
 * 결과는 `[x, y, w, h]` — avatar-metadata/web-avatar atlas 의 bbox 표기와 동일.
 */
import type { BBox, ImageBuffer } from "./types.js";

export interface AlphaBBoxOptions {
  /** 이 값 이상인 알파만 bbox 에 포함. 기본 1 (완전 투명만 제외). */
  minAlpha?: number;
}

export function computeAlphaBbox(
  img: ImageBuffer,
  opts: AlphaBBoxOptions = {},
): BBox | null {
  const minAlpha = opts.minAlpha ?? 1;
  if (!Number.isInteger(minAlpha) || minAlpha < 0 || minAlpha > 255) {
    throw new RangeError(`minAlpha must be integer in [0,255], got ${minAlpha}`);
  }
  const { width, height, data } = img;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3] ?? 0;
      if (a < minAlpha) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
