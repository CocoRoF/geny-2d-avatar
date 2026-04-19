/**
 * docs/06 §4 Stage 1 alpha sanitation + §6 Stage 3 color normalize.
 */
export { createImageBuffer } from "./types.js";
export type { ImageBuffer, BBox } from "./types.js";

export { straightToPremultiplied, premultipliedToStraight } from "./alpha-premult.js";

export { cleanAlphaNoise } from "./alpha-threshold.js";
export type { AlphaThresholdOptions } from "./alpha-threshold.js";

export { morphCloseAlpha } from "./morph-close.js";
export type { MorphCloseOptions } from "./morph-close.js";

export { featherAlpha } from "./feather.js";
export type { FeatherOptions } from "./feather.js";

export { clipToUvBox } from "./uv-clip.js";

export { computeAlphaBbox } from "./alpha-bbox.js";
export type { AlphaBBoxOptions } from "./alpha-bbox.js";

export { applyAlphaSanitation } from "./pipeline.js";
export type { AlphaSanitationOptions, AlphaSanitationResult } from "./pipeline.js";

export { computeColorStats } from "./color-stats.js";
export type { ColorStats, ColorStatsOptions, ColorSpace } from "./color-stats.js";

export { remapColorLinear } from "./color-remap.js";
export type { RemapColorOptions } from "./color-remap.js";

export { normalizeColor } from "./color-normalize.js";
export type { ColorNormalizeOptions, ColorNormalizeResult } from "./color-normalize.js";

export { rgbToLab, labToRgb, deltaE76 } from "./color-space.js";
export type { LabColor } from "./color-space.js";

export { fitToPalette, parsePaletteCatalog } from "./palette.js";
export type {
  FitToPaletteOptions,
  FitToPaletteResult,
  ClusterDecision,
  PaletteEntry,
  PaletteColor,
} from "./palette.js";

export { applyPreAtlasNormalization } from "./atlas-hook.js";
export type {
  PreAtlasOptions,
  PreAtlasPartInput,
  PreAtlasPartOutput,
  PreAtlasReport,
  PreAtlasResult,
} from "./atlas-hook.js";
