/**
 * docs/06 §6 — Stage 3 color normalize 의 통계 수집.
 *
 * `computeColorStats()` 는 알파 ≥ `alphaThreshold` 인 픽셀을 모집단으로, per-channel 평균과
 * population 표준편차(n 으로 나눔)를 계산한다. 투명 픽셀은 제외 — 알파 주변의 검정/흰색이
 * 평균을 왜곡하면 후속 `remapColorLinear()` 가 원하는 방향과 반대로 끌려간다.
 *
 * 출력 구조(`ColorStats`) 는 Stage 3 파이프라인 전 구간에서 전달되는 "색 프로파일" 단위:
 *   - mean: [r, g, b]  (각 0..255)
 *   - std:  [r, g, b]  (각 >= 0)
 *   - sampleCount: 모집단 크기
 *
 * `std = 0` 인 채널(단색) 은 remap 시 나눔 방어가 필요 — remap 코드에서 처리.
 */
import type { ImageBuffer } from "./types.js";

export interface ColorStats {
  readonly mean: readonly [number, number, number];
  readonly std: readonly [number, number, number];
  readonly sampleCount: number;
}

export interface ColorStatsOptions {
  /** 이 이상인 α 픽셀만 모집단에 포함. 기본 1 (완전 투명만 제외). */
  alphaThreshold?: number;
}

export function computeColorStats(
  img: ImageBuffer,
  opts: ColorStatsOptions = {},
): ColorStats {
  const alphaThreshold = opts.alphaThreshold ?? 1;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new RangeError(
      `alphaThreshold must be integer in [0,255], got ${alphaThreshold}`,
    );
  }
  const { width, height, data, premultiplied } = img;

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let count = 0;

  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = data[base + 3] ?? 0;
    if (a < alphaThreshold) continue;
    let r = data[base] ?? 0;
    let g = data[base + 1] ?? 0;
    let b = data[base + 2] ?? 0;
    if (premultiplied && a > 0) {
      // premultiplied 를 straight 로 역변환한 값에서 통계. a=0 은 이미 걸러짐.
      r = Math.min(255, Math.round((r * 255) / a));
      g = Math.min(255, Math.round((g * 255) / a));
      b = Math.min(255, Math.round((b * 255) / a));
    }
    sumR += r;
    sumG += g;
    sumB += b;
    count++;
  }

  if (count === 0) {
    return { mean: [0, 0, 0], std: [0, 0, 0], sampleCount: 0 };
  }

  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;

  // 두 번째 pass — 분산 계산.
  let varR = 0;
  let varG = 0;
  let varB = 0;
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
    varR += (r - meanR) * (r - meanR);
    varG += (g - meanG) * (g - meanG);
    varB += (b - meanB) * (b - meanB);
  }

  return {
    mean: [meanR, meanG, meanB],
    std: [
      Math.sqrt(varR / count),
      Math.sqrt(varG / count),
      Math.sqrt(varB / count),
    ],
    sampleCount: count,
  };
}
