/**
 * docs/06 §4 Stage 1 pipeline skeleton — 현재 구현 범위:
 *   (1) premultiplied → straight 필요 시 역변환
 *   (2) alpha threshold noise 제거
 *   (3) tight bbox 재계산
 *
 * 미구현(후속 세션):
 *   - morphological close (step 3) — 슬롯별 `max_hole_px` 필요, 라이브러리 결정 선행
 *   - alpha feather (step 4) — `alpha_edge_policy` 메타 연결 선행
 *   - UV box clip (step 5) — 파츠 메타의 uv_bbox 연결 선행
 *
 * 현재 단계에서도 결과는 `schema/v1` 의 bbox 표기를 그대로 채워줄 수 있으므로,
 * web-avatar 번들 atlas/texture 파이프라인에 바로 물릴 수 있다.
 */
import { premultipliedToStraight } from "./alpha-premult.js";
import { cleanAlphaNoise, type AlphaThresholdOptions } from "./alpha-threshold.js";
import { computeAlphaBbox, type AlphaBBoxOptions } from "./alpha-bbox.js";
import type { BBox, ImageBuffer } from "./types.js";

export interface AlphaSanitationOptions {
  threshold?: AlphaThresholdOptions;
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
  const straightInput = input.premultiplied ? premultipliedToStraight(input) : input;
  const cleaned = cleanAlphaNoise(straightInput, opts.threshold);
  const bbox = computeAlphaBbox(cleaned, opts.bbox);
  return { image: cleaned, bbox };
}
