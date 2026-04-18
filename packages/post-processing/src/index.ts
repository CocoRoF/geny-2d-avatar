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
