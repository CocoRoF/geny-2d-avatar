export {
  createPixiRenderer,
  resolvePivotPlacement,
  computePivotMarkerPositions,
  type PixiRenderer,
  type PixiRendererOptions,
  type PixiRendererStage,
  type CreatePixiApp,
  type CreatePixiAppOptions,
  type PixiAppHandle,
  type PixiSceneInput,
  type RegenerateInput,
  type PixiPartTransform,
  type PivotDebugMarker,
} from "./pixi-renderer.js";

export {
  atlasUvToFrame,
  type AtlasUvRect,
  type AtlasTextureSize,
  type PixiTextureFrame,
} from "./atlas-uv.js";

export {
  advanceBreathFrame,
  initialBreathState,
  startBreath,
  stopBreath,
  BREATH_AMPLITUDE,
  BREATH_MIN_PERIOD_MS,
  type BreathState,
  type BreathFrame,
} from "./motion-ticker.js";

export {
  advanceExpressionFrame,
  initialExpressionState,
  setExpressionTarget,
  EXPRESSION_ACTIVE_ALPHA,
  EXPRESSION_MIN_DURATION_MS,
  EXPRESSION_NEUTRAL_ALPHA,
  EXPRESSION_NEUTRAL_FADE_SEC,
  type ExpressionState,
  type ExpressionFrame,
} from "./expression-ticker.js";
