/**
 * 슬롯 경계 블렌딩 - Phase 4.5 (docs/02-TEXTURE-PIPELINE.md §5 Post-processing).
 *
 * 슬롯별 생성된 PNG 를 atlas 에 composite 할 때 서로 맞닿은 UV 경계가 hard edge
 * 로 보이지 않도록, 각 슬롯 이미지의 외곽 alpha 를 feather_px 만큼 점진적으로
 * 감쇠시킨다. sharp 의 Porter-Duff `dest-in` 합성으로 구현:
 *
 *   1) 원본 슬롯 크기의 흰색 inset rect 를 SVG 로 그려 mask 생성
 *   2) 해당 mask 를 sharp.blur() 로 부드럽게 번짐
 *   3) 슬롯 이미지에 `dest-in` 으로 mask 합성 → 결과 alpha = src.alpha × mask.alpha
 *
 * 너무 작은 슬롯 (min dim < 16px) 이나 feather_px=0 은 no-op.
 */

import sharp from "sharp";

export interface SlotFeatherOptions {
  readonly width: number;
  readonly height: number;
  readonly featherPx: number;
}

/** 슬롯 PNG 의 외곽 alpha 를 점진적으로 감쇠시킨 새 PNG 버퍼 반환. */
export async function applySlotFeather(
  pngBuf: Buffer,
  opts: SlotFeatherOptions,
): Promise<Buffer> {
  const { width, height, featherPx } = opts;
  if (featherPx <= 0) return pngBuf;
  if (width < 16 || height < 16) return pngBuf;
  // inset 는 작은 변의 1/8 이내로 제한 (과도한 feather 방지).
  const inset = Math.min(featherPx, Math.floor(Math.min(width, height) / 8));
  if (inset < 1) return pngBuf;
  const innerW = Math.max(1, width - 2 * inset);
  const innerH = Math.max(1, height - 2 * inset);

  const maskSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '">' +
      '<rect x="' + inset + '" y="' + inset + '" width="' + innerW + '" height="' + innerH +
      '" fill="white"/>' +
      "</svg>",
  );
  const mask = await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: maskSvg, blend: "over" }])
    .blur(Math.max(0.3, inset))
    .png()
    .toBuffer();

  return sharp(pngBuf)
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}
