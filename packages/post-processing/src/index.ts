/**
 * docs/06 §4 — Stage 1 alpha sanitation skeleton.
 */
export { createImageBuffer } from "./types.js";
export type { ImageBuffer, BBox } from "./types.js";

export { straightToPremultiplied, premultipliedToStraight } from "./alpha-premult.js";

export { cleanAlphaNoise } from "./alpha-threshold.js";
export type { AlphaThresholdOptions } from "./alpha-threshold.js";

export { computeAlphaBbox } from "./alpha-bbox.js";
export type { AlphaBBoxOptions } from "./alpha-bbox.js";

export { applyAlphaSanitation } from "./pipeline.js";
export type { AlphaSanitationOptions, AlphaSanitationResult } from "./pipeline.js";

export { computeColorStats } from "./color-stats.js";
export type { ColorStats, ColorStatsOptions } from "./color-stats.js";

export { remapColorLinear } from "./color-remap.js";
export type { RemapColorOptions } from "./color-remap.js";

export { normalizeColor } from "./color-normalize.js";
export type { ColorNormalizeOptions, ColorNormalizeResult } from "./color-normalize.js";
