/**
 * docs/06 §6 — Stage 3 color normalize 의 통계 수집.
 *
 * `computeColorStats()` 는 알파 ≥ `alphaThreshold` 인 픽셀을 모집단으로, per-channel 평균과
 * population 표준편차(n 으로 나눔)를 계산한다. 투명 픽셀은 제외 — 알파 주변의 검정/흰색이
 * 평균을 왜곡하면 후속 `remapColorLinear()` 가 원하는 방향과 반대로 끌려간다.
 *
 * 출력 구조(`ColorStats`) 는 Stage 3 파이프라인 전 구간에서 전달되는 "색 프로파일" 단위:
 *   - mean: [r, g, b]  또는 [L*, a*, b*] (colorSpace 에 따라)
 *   - std:  [r, g, b]  또는 [L*, a*, b*]
 *   - sampleCount: 모집단 크기
 *   - colorSpace: "rgb" 또는 "lab" (세션 32 부터 추가 — 기본값 "rgb" 로 하위 호환)
 *
 * `std = 0` 인 채널(단색) 은 remap 시 나눔 방어가 필요 — remap 코드에서 처리.
 */
import { rgbToLab } from "./color-space.js";
import type { ImageBuffer } from "./types.js";

export type ColorSpace = "rgb" | "lab";

export interface ColorStats {
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
  readonly sampleCount: number;
  /** 세션 32 부터 추가. 기존 "rgb" 통계는 이 필드가 없어도 된다(하위 호환 — 런타임은 생략 시 "rgb" 로 간주). */
  readonly colorSpace?: ColorSpace;
}

export interface ColorStatsOptions {
  /** 이 이상인 α 픽셀만 모집단에 포함. 기본 1 (완전 투명만 제외). */
  alphaThreshold?: number;
  /** 통계 측정 공간. "rgb" 는 0..255 선형 / "lab" 은 CIE L*a*b* (D65). 기본 "rgb". */
  colorSpace?: ColorSpace;
}

export function computeColorStats(
  img: ImageBuffer,
  opts: ColorStatsOptions = {},
): ColorStats {
  const alphaThreshold = opts.alphaThreshold ?? 1;
  const colorSpace = opts.colorSpace ?? "rgb";
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new RangeError(
      `alphaThreshold must be integer in [0,255], got ${alphaThreshold}`,
    );
  }
  if (colorSpace !== "rgb" && colorSpace !== "lab") {
    throw new RangeError(`colorSpace must be "rgb" or "lab", got ${colorSpace}`);
  }
  const { width, height, data, premultiplied } = img;

  let sum0 = 0;
  let sum1 = 0;
  let sum2 = 0;
  let count = 0;

  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = data[base + 3] ?? 0;
    if (a < alphaThreshold) continue;
    let r = data[base] ?? 0;
    let g = data[base + 1] ?? 0;
    let b = data[base + 2] ?? 0;
    if (premultiplied && a > 0) {
      r = Math.min(255, Math.round((r * 255) / a));
      g = Math.min(255, Math.round((g * 255) / a));
      b = Math.min(255, Math.round((b * 255) / a));
    }
    if (colorSpace === "lab") {
      const lab = rgbToLab(r, g, b);
      sum0 += lab.L;
      sum1 += lab.a;
      sum2 += lab.b;
    } else {
      sum0 += r;
      sum1 += g;
      sum2 += b;
    }
    count++;
  }

  if (count === 0) {
    return { mean: [0, 0, 0], std: [0, 0, 0], sampleCount: 0, colorSpace };
  }

  const mean0 = sum0 / count;
  const mean1 = sum1 / count;
  const mean2 = sum2 / count;

  let var0 = 0;
  let var1 = 0;
  let var2 = 0;
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = data[base + 3] ?? 0;
    if (a < alphaThreshold) continue;
    let r = data[base] ?? 0;
    let g = data[base + 1] ?? 0;
    let b = data[base + 2] ?? 0;
    if (premultiplied && a > 0) {
      r = Math.min(255, Math.round((r * 255) / a));
      g = Math.min(255, Math.round((g * 255) / a));
      b = Math.min(255, Math.round((b * 255) / a));
    }
    let c0: number;
    let c1: number;
    let c2: number;
    if (colorSpace === "lab") {
      const lab = rgbToLab(r, g, b);
      c0 = lab.L;
      c1 = lab.a;
      c2 = lab.b;
    } else {
      c0 = r;
      c1 = g;
      c2 = b;
    }
    var0 += (c0 - mean0) * (c0 - mean0);
    var1 += (c1 - mean1) * (c1 - mean1);
    var2 += (c2 - mean2) * (c2 - mean2);
  }

  return {
    mean: [mean0, mean1, mean2],
    std: [
      Math.sqrt(var0 / count),
      Math.sqrt(var1 / count),
      Math.sqrt(var2 / count),
    ],
    sampleCount: count,
    colorSpace,
  };
}
