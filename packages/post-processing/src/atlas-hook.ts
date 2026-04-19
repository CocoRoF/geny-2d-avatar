/**
 * docs/06 §6 + docs/11 §6 — Pre-atlas color normalization hook.
 *
 * exporter-core 의 `assembleWebAvatarBundle()` stage 2 atlas emit 직전에 파츠별 텍스처를
 * 정규화하기 위한 순수 함수. exporter 가 이 hook 의 유무를 알 필요가 없도록 자료형은
 * post-processing 자체만 의존 — exporter 는 이 모듈을 얕게 import 해서 맵-함수처럼 호출한다.
 *
 * 계약:
 *   applyPreAtlasNormalization({ parts, target, palette?, options? })
 *     → { parts: [{ slotId, image, source, applied, paletteDecisions? }], report }
 *
 *   - `target` (ColorStats, colorSpace="rgb" 또는 "lab") 이 있으면 normalizeColor 적용.
 *   - `palette` 가 같이 있으면 normalize 이후 fitToPalette 를 체인.
 *   - 둘 다 없으면 identity (입력 그대로, report.normalized=0).
 *   - parts 의 순서/길이 불변 — atlas emit 의 인덱스 안정성 보장.
 */
import { normalizeColor, type ColorNormalizeResult } from "./color-normalize.js";
import { fitToPalette, type ClusterDecision, type PaletteEntry } from "./palette.js";
import type { ColorStats } from "./color-stats.js";
import type { ImageBuffer } from "./types.js";

export interface PreAtlasPartInput {
  readonly slotId: string;
  readonly image: ImageBuffer;
}

export interface PreAtlasOptions {
  /** 정규화 타깃 통계. 없으면 normalize skip. */
  target?: ColorStats;
  /** 팔레트 엔트리. 없으면 fit-to-palette skip. */
  palette?: PaletteEntry;
  /** α-gate threshold (기본 1). */
  alphaThreshold?: number;
}

export interface PreAtlasPartOutput {
  readonly slotId: string;
  readonly image: ImageBuffer;
  readonly normalize: ColorNormalizeResult | null;
  readonly paletteDecisions: readonly ClusterDecision[] | null;
}

export interface PreAtlasReport {
  readonly total: number;
  readonly normalized: number;
  readonly paletteApplied: number;
  /** 이동이 거부된(ΔE > cap) 클러스터 수의 합. */
  readonly paletteSkipped: number;
}

export interface PreAtlasResult {
  readonly parts: readonly PreAtlasPartOutput[];
  readonly report: PreAtlasReport;
}

export function applyPreAtlasNormalization(
  inputs: readonly PreAtlasPartInput[],
  opts: PreAtlasOptions = {},
): PreAtlasResult {
  const outParts: PreAtlasPartOutput[] = [];
  let normalized = 0;
  let paletteApplied = 0;
  let paletteSkipped = 0;
  for (const part of inputs) {
    let working = part.image;
    let normalize: ColorNormalizeResult | null = null;
    let paletteDecisions: ClusterDecision[] | null = null;
    if (opts.target) {
      const normOpts: { alphaThreshold?: number } = {};
      if (opts.alphaThreshold !== undefined) normOpts.alphaThreshold = opts.alphaThreshold;
      normalize = normalizeColor(working, opts.target, normOpts);
      working = normalize.image;
      normalized++;
    }
    if (opts.palette) {
      const fitOpts: { alphaThreshold?: number } = {};
      if (opts.alphaThreshold !== undefined) fitOpts.alphaThreshold = opts.alphaThreshold;
      const fit = fitToPalette(working, opts.palette, fitOpts);
      working = fit.image;
      paletteDecisions = [...fit.decisions];
      if (fit.decisions.some((d) => d.moved)) paletteApplied++;
      for (const d of fit.decisions) {
        if (!d.moved) paletteSkipped++;
      }
    }
    outParts.push({
      slotId: part.slotId,
      image: working,
      normalize,
      paletteDecisions,
    });
  }
  return {
    parts: outParts,
    report: {
      total: inputs.length,
      normalized,
      paletteApplied,
      paletteSkipped,
    },
  };
}
