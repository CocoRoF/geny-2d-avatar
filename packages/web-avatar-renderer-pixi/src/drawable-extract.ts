/**
 * RX.1 — 로드된 Live2D 모델에서 drawable 메타데이터 추출.
 *
 * 사용 흐름 (apps/web-preview/builder.html 의 reloadLivePreview 후):
 *   const meta = extractDrawables(model, { w: atlasW, h: atlasH });
 *   layerPanel.render(meta);
 *
 * 메커니즘:
 *   - Cubism Core 의 wrapper (pixi-live2d-display-advanced) 가 노출하는
 *     getDrawable*, getPart* 함수로 데이터 read.
 *   - UV 는 [0..1] top-left origin → atlas pixel space 로 변환 (axis-aligned bbox).
 *   - V 가 flip 된 모델은 internalModel.textureFlipY=true (드물지만 지원).
 *
 * 본 함수는 render 사이드 이펙트 없이 read-only — RX.2 부터는 Layer Panel UI 에서
 * 이 데이터를 표시하고, setMultiplyColorByRGBA 로 visibility/색상 토글.
 */

import type { Live2DModelLike } from "./pixi-live2d-renderer.js";

export type DrawableBlendMode = "normal" | "additive" | "multiplicative" | "unknown";

export interface DrawableUvBbox {
  /** atlas pixel space, top-left origin. textureFlipY 처리 후. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** UV 원래 값 (정규화 [0..1]) — UI 에서 sub-image crop 시 유용. */
  readonly uMin: number;
  readonly uMax: number;
  readonly vMin: number;
  readonly vMax: number;
}

export interface DrawableMeta {
  readonly index: number;
  readonly id: string;
  readonly partIndex: number;
  readonly partId: string | null;
  readonly textureIndex: number;
  readonly renderOrder: number;
  readonly blendMode: DrawableBlendMode;
  readonly uvBbox: DrawableUvBbox;
  readonly initialOpacity: number;
}

export interface AtlasSize {
  readonly w: number;
  readonly h: number;
}

export interface ExtractDrawablesOptions {
  /** Atlas 픽셀 크기. multi-texture 면 textureIndex 0 의 사이즈만 적용 (현재 mao_pro 단일 4096). */
  readonly atlasSize: AtlasSize;
  /** 사이즈 0 / NaN UV bbox drawable 을 건너뛸지 (default true). */
  readonly skipDegenerate?: boolean;
}

function blendModeFromCubism(code: number): DrawableBlendMode {
  switch (code) {
    case 0:
      return "normal";
    case 1:
      return "additive";
    case 2:
      return "multiplicative";
    default:
      return "unknown";
  }
}

/**
 * UV Float32Array 에서 axis-aligned bbox 계산.
 *
 * @param uvs [u0, v0, u1, v1, ...]  Cubism 의 vertex UV 는 top-left [0..1].
 * @param flipY true 면 V 를 (1 - V) 로 변환 (internalModel.textureFlipY).
 */
export function uvBbox(
  uvs: Float32Array | ReadonlyArray<number>,
  atlasSize: AtlasSize,
  flipY = false,
): DrawableUvBbox {
  let uMin = 1, uMax = 0, vMin = 1, vMax = 0;
  for (let i = 0; i < uvs.length; i += 2) {
    const u = uvs[i]!;
    const vRaw = uvs[i + 1]!;
    const v = flipY ? 1 - vRaw : vRaw;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
    if (v < vMin) vMin = v;
    if (v > vMax) vMax = v;
  }
  // Degenerate (UV 못 읽음) → all zeros.
  if (!Number.isFinite(uMin) || uMin > uMax || vMin > vMax) {
    return { x: 0, y: 0, w: 0, h: 0, uMin: 0, uMax: 0, vMin: 0, vMax: 0 };
  }
  const x = Math.max(0, Math.floor(uMin * atlasSize.w));
  const y = Math.max(0, Math.floor(vMin * atlasSize.h));
  const x2 = Math.min(atlasSize.w, Math.ceil(uMax * atlasSize.w));
  const y2 = Math.min(atlasSize.h, Math.ceil(vMax * atlasSize.h));
  return {
    x, y,
    w: Math.max(0, x2 - x),
    h: Math.max(0, y2 - y),
    uMin, uMax, vMin, vMax,
  };
}

export function extractDrawables(
  model: Live2DModelLike,
  opts: ExtractDrawablesOptions,
): DrawableMeta[] {
  const cm = model.internalModel?.coreModel;
  if (!cm) return [];
  const getCount = cm.getDrawableCount;
  if (typeof getCount !== "function") return [];
  const count = getCount.call(cm);
  if (!Number.isFinite(count) || count <= 0) return [];

  const flipY = !!model.internalModel.textureFlipY;
  const skipDegenerate = opts.skipDegenerate !== false;
  const out: DrawableMeta[] = [];
  // part id 캐시 — 매 drawable 마다 getPartId 호출하지 않게.
  const partIds: (string | null)[] = [];
  if (typeof cm.getPartCount === "function" && typeof cm.getPartId === "function") {
    const partCount = cm.getPartCount.call(cm) | 0;
    for (let i = 0; i < partCount; i++) {
      try {
        partIds.push(cm.getPartId.call(cm, i) ?? null);
      } catch {
        partIds.push(null);
      }
    }
  }

  for (let i = 0; i < count; i++) {
    let id = "";
    try {
      id = cm.getDrawableId?.call(cm, i) ?? "";
    } catch {
      id = "";
    }
    if (!id) continue;
    let uvs: Float32Array | null = null;
    try {
      const v = cm.getDrawableVertexUvs?.call(cm, i);
      if (v && (v as { length?: number }).length) uvs = v as Float32Array;
    } catch {
      uvs = null;
    }
    const bbox = uvs
      ? uvBbox(uvs, opts.atlasSize, flipY)
      : { x: 0, y: 0, w: 0, h: 0, uMin: 0, uMax: 0, vMin: 0, vMax: 0 };
    if (skipDegenerate && bbox.w === 0 && bbox.h === 0) {
      // mesh 가 없거나 UV 가 비어있는 drawable — 패스.
      continue;
    }
    const partIndex = (() => {
      try { return cm.getDrawableParentPartIndex?.call(cm, i) ?? -1; } catch { return -1; }
    })();
    const partId = partIndex >= 0 && partIndex < partIds.length ? partIds[partIndex] ?? null : null;
    const textureIndex = (() => {
      try { return cm.getDrawableTextureIndex?.call(cm, i) ?? 0; } catch { return 0; }
    })();
    const renderOrder = (() => {
      try { return cm.getDrawableRenderOrder?.call(cm, i) ?? 0; } catch { return 0; }
    })();
    const blendCode = (() => {
      try { return cm.getDrawableBlendMode?.call(cm, i) ?? 0; } catch { return 0; }
    })();
    const initialOpacity = (() => {
      try { return cm.getDrawableOpacity?.call(cm, i) ?? 1; } catch { return 1; }
    })();
    out.push({
      index: i,
      id,
      partIndex,
      partId,
      textureIndex,
      renderOrder,
      blendMode: blendModeFromCubism(blendCode),
      uvBbox: bbox,
      initialOpacity,
    });
  }
  return out;
}

/**
 * Drawable 의 visibility 토글 (multiply color alpha).
 * SDK 의 override flag 는 한 번 true 로 설정되면 매 프레임 우리 값 유지 → side effect 없음.
 */
export function setDrawableVisible(
  model: Live2DModelLike,
  drawableIndex: number,
  visible: boolean,
): void {
  const cm = model.internalModel?.coreModel;
  if (!cm) return;
  cm.setOverrideFlagForDrawableMultiplyColors?.call(cm, drawableIndex, true);
  cm.setMultiplyColorByRGBA?.call(cm, drawableIndex, 1, 1, 1, visible ? 1 : 0);
}

/**
 * Drawable 의 multiply color 설정 (RGB shift). 알파는 1 고정 (visibility 와 분리).
 */
export function setDrawableMultiplyRgb(
  model: Live2DModelLike,
  drawableIndex: number,
  rgb: { r: number; g: number; b: number },
): void {
  const cm = model.internalModel?.coreModel;
  if (!cm) return;
  cm.setOverrideFlagForDrawableMultiplyColors?.call(cm, drawableIndex, true);
  cm.setMultiplyColorByRGBA?.call(cm, drawableIndex, rgb.r, rgb.g, rgb.b, 1);
}
