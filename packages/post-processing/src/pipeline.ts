/**
 * docs/06 §4 Stage 1 pipeline — 전체 step 1..6 구현 (세션 26 skeleton + 세션 35 확장).
 *
 * 순서:
 *   (1) premultiplied → straight 역변환 (필요 시)
 *   (2) alpha threshold noise 제거
 *   (3) morphological close (opts.close 가 있을 때)
 *   (4) alpha feather (opts.feather 가 있을 때)
 *   (5) UV box clip (opts.uvClip 가 있을 때)
 *   (6) tight bbox 재계산
 *
 * 설계:
 *   - close/feather/uvClip 은 **opt-in**. `options` 에 키가 존재할 때만 실행.
 *   - 각 단계는 순수 함수이며 결정론적. 동일 입력 → 동일 출력.
 *   - 결과는 기본 straight. `keepStraight=false` 를 주면 premultiplied 로 재변환 (현재는 미지원
 *     — 추후 요구되면 straightToPremultiplied 를 연결).
 */
import { premultipliedToStraight } from "./alpha-premult.js";
import { cleanAlphaNoise, type AlphaThresholdOptions } from "./alpha-threshold.js";
import { morphCloseAlpha, type MorphCloseOptions } from "./morph-close.js";
import { featherAlpha, type FeatherOptions } from "./feather.js";
import { clipToUvBox } from "./uv-clip.js";
import { computeAlphaBbox, type AlphaBBoxOptions } from "./alpha-bbox.js";
import type { BBox, ImageBuffer } from "./types.js";

export interface AlphaSanitationOptions {
  threshold?: AlphaThresholdOptions;
  close?: MorphCloseOptions;
  feather?: FeatherOptions;
  uvClip?: BBox;
  bbox?: AlphaBBoxOptions;
  /** 결과를 premultiplied 로 재변환하지 않음 (기본) — 후속 스테이지가 straight 을 기대. */
  keepStraight?: boolean;
}

export interface AlphaSanitationResult {
  readonly image: ImageBuffer;
  readonly bbox: BBox | null;
}

export function applyAlphaSanitation(
  input: ImageBuffer,
  opts: AlphaSanitationOptions = {},
): AlphaSanitationResult {
  let working = input.premultiplied ? premultipliedToStraight(input) : input;
  working = cleanAlphaNoise(working, opts.threshold);
  if (opts.close) working = morphCloseAlpha(working, opts.close);
  if (opts.feather) working = featherAlpha(working, opts.feather);
  if (opts.uvClip) working = clipToUvBox(working, opts.uvClip);
  const bbox = computeAlphaBbox(working, opts.bbox);
  return { image: working, bbox };
}
