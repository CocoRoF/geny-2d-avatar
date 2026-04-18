/**
 * docs/06 §6 — Stage 3 color normalize 의 선형 재매핑.
 *
 * Reinhard et al. (2001) "Color Transfer" 의 RGB 공간 한정 버전:
 *
 *     newC = (C - src.mean) * (dst.std / src.std) + dst.mean
 *
 * Foundation 단계는 L*a*b* 전환을 하지 않는다 — 결정론적 단순 경로만 확보. 세션 30+ 에서 색공간
 * 변환을 추가할 때 인터페이스(`remapColorLinear(img, source, target)`) 는 유지.
 *
 * 주의:
 *   - `src.std[c] === 0` 인 채널(단색) 은 "평행 이동" 만 적용 → `newC = C + (dst.mean - src.mean)`
 *   - α 는 건드리지 않음 (Stage 1 에서 이미 정제)
 *   - 알파 < alphaThreshold 픽셀은 그대로 두어 edge 잔재가 새 색으로 번지는 것을 방지
 *   - premultiplied 입력은 먼저 straight 로 역변환해 remap 한 뒤 다시 premult 할 필요가 있지만,
 *     호출자가 파이프라인(`normalizeColor()`) 를 쓰면 자동 처리. 낮은 레벨 `remapColorLinear()` 는
 *     straight 입력을 가정.
 */
import type { ColorStats } from "./color-stats.js";
import type { ImageBuffer } from "./types.js";

export interface RemapColorOptions {
  /** 이 이상인 α 픽셀만 remap. 기본 1 (완전 투명은 건드리지 않음). */
  alphaThreshold?: number;
}

export function remapColorLinear(
  img: ImageBuffer,
  source: ColorStats,
  target: ColorStats,
  opts: RemapColorOptions = {},
): ImageBuffer {
  if (img.premultiplied) {
    throw new Error(
      "remapColorLinear: input must be straight (non-premultiplied); " +
        "convert first or use normalizeColor() pipeline",
    );
  }
  const alphaThreshold = opts.alphaThreshold ?? 1;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new RangeError(
      `alphaThreshold must be integer in [0,255], got ${alphaThreshold}`,
    );
  }
  const scaleR = source.std[0] === 0 ? 1 : target.std[0] / source.std[0];
  const scaleG = source.std[1] === 0 ? 1 : target.std[1] / source.std[1];
  const scaleB = source.std[2] === 0 ? 1 : target.std[2] / source.std[2];
  const offR = target.mean[0] - source.mean[0] * scaleR;
  const offG = target.mean[1] - source.mean[1] * scaleG;
  const offB = target.mean[2] - source.mean[2] * scaleB;

  const out = new Uint8ClampedArray(img.data.length);
  const { width, height, data } = img;
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = data[base + 3] ?? 0;
    if (a < alphaThreshold) {
      out[base] = data[base] ?? 0;
      out[base + 1] = data[base + 1] ?? 0;
      out[base + 2] = data[base + 2] ?? 0;
      out[base + 3] = a;
      continue;
    }
    const r = data[base] ?? 0;
    const g = data[base + 1] ?? 0;
    const b = data[base + 2] ?? 0;
    out[base] = clampByte(Math.round(r * scaleR + offR));
    out[base + 1] = clampByte(Math.round(g * scaleG + offG));
    out[base + 2] = clampByte(Math.round(b * scaleB + offB));
    out[base + 3] = a;
  }
  return {
    width: img.width,
    height: img.height,
    data: out,
    premultiplied: false,
  };
}

function clampByte(v: number): number {
  if (v < 0) return 0;
  if (v > 255) return 255;
  return v;
}
