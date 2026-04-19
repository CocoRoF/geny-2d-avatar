/**
 * docs/06 §4.2 step 4 — 경계 에지 페더 (alpha-only box blur).
 *
 * 목표: `alpha_edge_policy` 에 대응하는 2px (기본) 알파 부드러움. 구현은 가우시안 근사로
 * **하나의 박스 블러 패스** (kernel size = 2*radius+1). 시각적으로 단일 박스 블러는
 * 1-pass 가우시안보다 약간 평평하지만 2-3 픽셀 스케일에서는 차이가 작고, 결정론적이며 빠르다.
 *
 * 제약:
 *   - 입력은 straight (premultiplied=false). premultiplied 면 throw.
 *   - 결과도 straight.
 *   - RGB 채널은 변경하지 않음 — 페더는 "외곽에서 색이 번지는" 효과가 아니라 알파 램프일 뿐.
 *     (번져보이는 효과가 필요하면 premultiplied 공간에서 처리해야 하며 이는 renderer 몫.)
 *   - `radius=0` → 입력 그대로 반환.
 *   - 최대 radius 4 로 제한 (시각 가드).
 */
import { createImageBuffer, type ImageBuffer } from "./types.js";

export interface FeatherOptions {
  /** 박스 블러 반경 (픽셀). 기본 2 — alpha_edge_policy feather_2px 대응. */
  radius?: number;
}

export function featherAlpha(
  img: ImageBuffer,
  opts: FeatherOptions = {},
): ImageBuffer {
  if (img.premultiplied) {
    throw new Error("featherAlpha requires straight-alpha input (premultiplied=false)");
  }
  const radius = opts.radius ?? 2;
  if (!Number.isInteger(radius) || radius < 0 || radius > 4) {
    throw new RangeError(`radius must be integer in [0,4], got ${radius}`);
  }
  if (radius === 0) return img;

  const { width, height, data } = img;
  const n = width * height;

  // 1-pass separable box blur on alpha only — O(n * radius)
  const alpha = new Uint16Array(n);
  for (let i = 0; i < n; i++) alpha[i] = data[i * 4 + 3] ?? 0;

  // horizontal pass
  const hBlur = new Uint16Array(n);
  const k = 2 * radius + 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dx = -radius; dx <= radius; dx++) {
        const nx = x + dx;
        if (nx < 0 || nx >= width) continue;
        sum += alpha[y * width + nx] ?? 0;
        count++;
      }
      hBlur[y * width + x] = count === k ? Math.round(sum / k) : Math.round(sum / count);
    }
  }

  // vertical pass
  const vBlur = new Uint16Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        sum += hBlur[ny * width + x] ?? 0;
        count++;
      }
      vBlur[y * width + x] = count === k ? Math.round(sum / k) : Math.round(sum / count);
    }
  }

  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  for (let i = 0; i < n; i++) {
    out[i * 4 + 3] = vBlur[i] ?? 0;
  }

  return createImageBuffer(width, height, out, false);
}
