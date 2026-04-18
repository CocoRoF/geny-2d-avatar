/**
 * docs/06 §6 — Stage 3 color normalize 파이프라인 합성.
 *
 * 입력: RGBA8 ImageBuffer + target ColorStats
 * 출력: { image (straight), stats: { source, applied } }
 *
 * 동작:
 *   1) premultiplied 입력은 먼저 straight 으로 역변환
 *   2) source stats 계산 (alphaThreshold 기본 1)
 *   3) source → target 선형 재매핑
 *   4) applied stats 재계산 (QA/로깅용 — target 에 얼마나 가까운지 확인 가능)
 */
import { computeColorStats, type ColorStats, type ColorStatsOptions } from "./color-stats.js";
import { remapColorLinear, type RemapColorOptions } from "./color-remap.js";
import { premultipliedToStraight } from "./alpha-premult.js";
import type { ImageBuffer } from "./types.js";

export interface ColorNormalizeOptions extends ColorStatsOptions, RemapColorOptions {}

export interface ColorNormalizeResult {
  readonly image: ImageBuffer;
  readonly source: ColorStats;
  readonly applied: ColorStats;
}

export function normalizeColor(
  input: ImageBuffer,
  target: ColorStats,
  opts: ColorNormalizeOptions = {},
): ColorNormalizeResult {
  const straight = input.premultiplied ? premultipliedToStraight(input) : input;
  const source = computeColorStats(straight, opts);
  const remapped = remapColorLinear(straight, source, target, opts);
  const applied = computeColorStats(remapped, opts);
  return { image: remapped, source, applied };
}
