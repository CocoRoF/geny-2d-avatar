/**
 * docs/06 §4.2 step 5 — UV 박스 바깥 알파 제거 (clip-to-box).
 *
 * `parts/<slot>.meta.json` 의 `uv_bbox` 밖에 AI 가 페인트한 흘러나온 픽셀을 0 으로. 박스는
 * 파츠 스펙의 `uv_box` (integer pixel coords, inclusive x..x+w-1 / y..y+h-1) 기준.
 *
 * 제약:
 *   - bbox 가 이미지 영역과 **완전히 겹치지 않으면** 전부 0 (전부 투명) 결과.
 *   - bbox 가 이미지 외부로 일부 튀어나오면 겹치는 부분만 유지.
 *   - premultiplied 여부와 무관 — α=0 으로 떨어뜨리고, premultiplied 면 RGB 도 0.
 */
import { createImageBuffer, type BBox, type ImageBuffer } from "./types.js";

export function clipToUvBox(img: ImageBuffer, bbox: BBox): ImageBuffer {
  if (!Number.isInteger(bbox.x) || !Number.isInteger(bbox.y)) {
    throw new RangeError(`bbox.x and bbox.y must be integers, got x=${bbox.x} y=${bbox.y}`);
  }
  if (!Number.isInteger(bbox.width) || !Number.isInteger(bbox.height)) {
    throw new RangeError(
      `bbox.width and bbox.height must be integers, got w=${bbox.width} h=${bbox.height}`,
    );
  }
  if (bbox.width < 0 || bbox.height < 0) {
    throw new RangeError(`bbox size must be non-negative, got w=${bbox.width} h=${bbox.height}`);
  }

  const { width, height, data, premultiplied } = img;
  const out = new Uint8ClampedArray(data.length);
  out.set(data);

  const x0 = bbox.x;
  const y0 = bbox.y;
  const x1 = bbox.x + bbox.width; // exclusive
  const y1 = bbox.y + bbox.height;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= x0 && x < x1 && y >= y0 && y < y1;
      if (inside) continue;
      const i = (y * width + x) * 4;
      out[i + 3] = 0;
      if (premultiplied) {
        out[i] = 0;
        out[i + 1] = 0;
        out[i + 2] = 0;
      }
    }
  }

  return createImageBuffer(width, height, out, premultiplied);
}
