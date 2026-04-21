/**
 * Atlas UV 좌표 → PIXI 텍스처 frame(px) 변환 순수 함수. 번들 `atlas.json` 의
 * `slots[].uv = [x, y, w, h]` 는 **정규화 좌표(0..1)** 이고, PIXI.Texture 의 frame 은
 * **픽셀 좌표** 이므로 구현체가 매번 이 변환을 해야 한다. 테스트 가능한 pure
 * helper 로 분리.
 *
 * β 로드맵 P1-S1 — PixiJS 렌더러 scaffold. P1-S2 실 atlas 슬롯 합류 시 사용.
 */

export interface AtlasUvRect {
  /** 정규화 UV (0..1). `[x, y, w, h]`. */
  readonly uv: readonly [number, number, number, number];
}

export interface AtlasTextureSize {
  readonly width: number;
  readonly height: number;
}

export interface PixiTextureFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 정규화 UV 를 텍스처 크기(px) 에 투영한 PIXI frame 으로 변환.
 * - `uv[0..1]` 이 범위를 벗어나면 clamp (atlas 경계 이탈 방지).
 * - 결과 width/height 는 최소 1px 보장 (PIXI 가 0-size frame 을 거부).
 */
export function atlasUvToFrame(rect: AtlasUvRect, texture: AtlasTextureSize): PixiTextureFrame {
  const [ux, uy, uw, uh] = rect.uv;
  const x = clamp01(ux) * texture.width;
  const y = clamp01(uy) * texture.height;
  const width = Math.max(1, clamp01(uw) * texture.width);
  const height = Math.max(1, clamp01(uh) * texture.height);
  return { x, y, width, height };
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}
