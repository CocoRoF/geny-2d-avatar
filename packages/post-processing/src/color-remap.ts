/**
 * docs/06 §6 — Stage 3 color normalize 의 선형 재매핑.
 *
 * Reinhard et al. (2001) "Color Transfer" 의 **채널별 선형 이동** 버전 (covariance 는 미사용 —
 * 향후 CIEDE2000/Cholesky 전체 공분산으로 확장 여지). colorSpace 옵션으로 동작 분기:
 *
 *   colorSpace="rgb"  ← 기본, v0.1.0 동일 동작. 0..255 각 채널에 직접 선형 매핑.
 *   colorSpace="lab"  ← 세션 32 신규. sRGB→Lab 변환 후 L*a*b* 각 채널에 선형 매핑, 다시 sRGB 로.
 *
 *     newC = (C - src.mean) * (dst.std / src.std) + dst.mean
 *
 * 주의:
 *   - `src.std[c] === 0` 인 채널(단색) 은 "평행 이동" 만 적용 → `newC = C + (dst.mean - src.mean)`.
 *   - α 는 건드리지 않음 (Stage 1 에서 이미 정제).
 *   - 알파 < alphaThreshold 픽셀은 그대로 두어 edge 잔재가 새 색으로 번지는 것을 방지.
 *   - premultiplied 입력은 throw — `normalizeColor()` 파이프라인이 auto-unwrap.
 *   - source.colorSpace 와 target.colorSpace 가 다르면 throw — 두 통계는 같은 공간에서 재매핑되어야 한다.
 */
import { labToRgb, rgbToLab } from "./color-space.js";
import type { ColorStats, ColorSpace } from "./color-stats.js";
import type { ImageBuffer } from "./types.js";

export interface RemapColorOptions {
  /** 이 이상인 α 픽셀만 remap. 기본 1 (완전 투명은 건드리지 않음). */
  alphaThreshold?: number;
  /** remap 공간. 생략 시 source/target 의 colorSpace 에서 유추. */
  colorSpace?: ColorSpace;
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
  // 하위 호환: source/target 이 colorSpace 필드를 갖고 있지 않으면 "rgb" 로 간주.
  const srcSpace: ColorSpace = source.colorSpace ?? "rgb";
  const dstSpace: ColorSpace = target.colorSpace ?? "rgb";
  if (srcSpace !== dstSpace) {
    throw new Error(
      `remapColorLinear: source/target colorSpace must match (source=${srcSpace}, target=${dstSpace})`,
    );
  }
  const effective = opts.colorSpace ?? srcSpace;
  if (effective !== srcSpace) {
    throw new Error(
      `remapColorLinear: opts.colorSpace=${effective} conflicts with stats colorSpace=${srcSpace}`,
    );
  }

  const scale0 = source.std[0] === 0 ? 1 : target.std[0] / source.std[0];
  const scale1 = source.std[1] === 0 ? 1 : target.std[1] / source.std[1];
  const scale2 = source.std[2] === 0 ? 1 : target.std[2] / source.std[2];
  const off0 = target.mean[0] - source.mean[0] * scale0;
  const off1 = target.mean[1] - source.mean[1] * scale1;
  const off2 = target.mean[2] - source.mean[2] * scale2;

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
    let nr: number;
    let ng: number;
    let nb: number;
    if (effective === "lab") {
      const lab = rgbToLab(r, g, b);
      const nL = lab.L * scale0 + off0;
      const nA = lab.a * scale1 + off1;
      const nB = lab.b * scale2 + off2;
      const [r2, g2, b2] = labToRgb(nL, nA, nB);
      nr = r2;
      ng = g2;
      nb = b2;
    } else {
      nr = clampByte(Math.round(r * scale0 + off0));
      ng = clampByte(Math.round(g * scale1 + off1));
      nb = clampByte(Math.round(b * scale2 + off2));
    }
    out[base] = nr;
    out[base + 1] = ng;
    out[base + 2] = nb;
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
