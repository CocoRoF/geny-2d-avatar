/**
 * docs/06 §4 — Stage 1 입출력의 RGBA8 인메모리 표현.
 *
 * `data` 는 `width * height * 4` 길이의 `Uint8ClampedArray` (R,G,B,A 순차).
 * `premultiplied` 플래그는 "현재 색채널이 알파로 곱해진 상태인지" — PNG 디코드 직후는
 * 일반적으로 `false`(straight). 세션 15 web-avatar 텍스처는 항상 straight 이므로 Stage 1
 * 입력은 straight 로 가정하되, `straightToPremultiplied()` 가 역변환용으로 제공된다.
 */
export interface ImageBuffer {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  readonly premultiplied: boolean;
}

export interface BBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function createImageBuffer(
  width: number,
  height: number,
  data: Uint8ClampedArray,
  premultiplied = false,
): ImageBuffer {
  if (!Number.isInteger(width) || width <= 0) {
    throw new RangeError(`width must be positive integer, got ${width}`);
  }
  if (!Number.isInteger(height) || height <= 0) {
    throw new RangeError(`height must be positive integer, got ${height}`);
  }
  if (data.length !== width * height * 4) {
    throw new RangeError(
      `data length ${data.length} != expected ${width * height * 4} (${width}x${height}×4)`,
    );
  }
  return { width, height, data, premultiplied };
}
