/**
 * docs/06 §6 — Stage 3 color normalize 파이프라인 합성.
 *
 * 입력: RGBA8 ImageBuffer + target ColorStats (colorSpace 포함)
 * 출력: { image (straight), stats: { source, applied } }
 *
 * 동작:
 *   1) premultiplied 입력은 먼저 straight 으로 역변환
 *   2) source stats 계산 — target 과 **같은 colorSpace** 로 (RGB 또는 Lab)
 *   3) source → target 선형 재매핑 (colorSpace 별 분기)
 *   4) applied stats 재계산 (QA/로깅용 — target 에 얼마나 가까운지 확인 가능)
 *
 * 세션 32: colorSpace="lab" 경로 추가. target.colorSpace 를 정답으로 삼아 source 측정/remap/applied
 * 측정 모두 같은 공간에서 수행 — 혼용 방지.
 */
import { computeColorStats, type ColorStats, type ColorStatsOptions, type ColorSpace } from "./color-stats.js";
import { remapColorLinear, type RemapColorOptions } from "./color-remap.js";
import { premultipliedToStraight } from "./alpha-premult.js";
import type { ImageBuffer } from "./types.js";

export interface ColorNormalizeOptions extends ColorStatsOptions, RemapColorOptions {}

export interface ColorNormalizeResult {
  readonly image: ImageBuffer;
  readonly source: ColorStats;
  readonly applied: ColorStats;
  readonly colorSpace: ColorSpace;
}

export function normalizeColor(
  input: ImageBuffer,
  target: ColorStats,
  opts: ColorNormalizeOptions = {},
): ColorNormalizeResult {
  const targetSpace: ColorSpace = target.colorSpace ?? "rgb";
  const optSpace = opts.colorSpace;
  if (optSpace && optSpace !== targetSpace) {
    throw new Error(
      `normalizeColor: opts.colorSpace=${optSpace} conflicts with target.colorSpace=${targetSpace}`,
    );
  }
  const colorSpace = targetSpace;
  const straight = input.premultiplied ? premultipliedToStraight(input) : input;
  const statsOpts: { alphaThreshold?: number; colorSpace: ColorSpace } = { colorSpace };
  if (opts.alphaThreshold !== undefined) statsOpts.alphaThreshold = opts.alphaThreshold;
  const source = computeColorStats(straight, statsOpts);
  const remapOpts: { alphaThreshold?: number; colorSpace: ColorSpace } = { colorSpace };
  if (opts.alphaThreshold !== undefined) remapOpts.alphaThreshold = opts.alphaThreshold;
  const remapped = remapColorLinear(straight, source, target, remapOpts);
  const applied = computeColorStats(remapped, statsOpts);
  return { image: remapped, source, applied, colorSpace };
}
