/**
 * recolor 어댑터 — referenceImage 의 atlas 를 결정론적으로 hue/saturation 변형.
 *
 * Generic LLM image API (Gemini, OpenAI) 가 "atlas 형식 보존" 을 못 지키는 한계 때문에
 * 추가. 사용자 prompt 에서 색상 키워드 (blue, silver, red, ...) 를 추출해 sharp.modulate
 * 로 hue 를 shift. atlas 의 UV 레이아웃은 100% 보존 — 출력 size = 입력 size.
 *
 * 한계:
 *   - 색만 변경 가능. 헤어스타일/길이/형태 변경은 못 함 (그런 변형은 ControlNet/inpainting 필요).
 *   - 영역 단위 (hair only, skin only) 분리 안 함 — atlas 전체에 동일 변형 적용.
 *     향후 atlas.slots 의 UV 영역 단위 적용으로 확장 가능.
 *
 * 적용 우선순위: AI 어댑터들이 atlas 형식 위배 시 fallback 으로 동작 → 항상 동작 보장.
 *
 * 환경변수:
 *   GENY_RECOLOR_DISABLED=true   — 강제 off
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";

export interface RecolorAdapterOptions {
  readonly enabled?: boolean;
}

/**
 * prompt 에서 색상 단서를 추출해 hue rotation degrees + saturation/brightness 조정 반환.
 * 매칭 안 되면 null — 어댑터 supports=false 로 폴백.
 */
function parseColorIntent(prompt: string): {
  hueDeg: number;
  saturation: number;
  brightness: number;
  matched: string;
} | null {
  const p = prompt.toLowerCase();
  // 우선순위 (먼저 매칭되는 색): grayscale 류 → 컬러
  const table: Array<{
    re: RegExp;
    hueDeg: number;
    saturation: number;
    brightness: number;
    label: string;
  }> = [
    { re: /\b(silver|gray|grey|white|monochrome)\b/, hueDeg: 0, saturation: 0.0, brightness: 1.15, label: "silver" },
    { re: /\bblack\b/, hueDeg: 0, saturation: 0.4, brightness: 0.5, label: "black" },
    { re: /\b(blue|navy|cobalt|sapphire)\b/, hueDeg: 200, saturation: 1.1, brightness: 1.0, label: "blue" },
    { re: /\b(red|crimson|scarlet)\b/, hueDeg: 0, saturation: 1.3, brightness: 1.0, label: "red" },
    { re: /\b(pink|magenta|rose)\b/, hueDeg: 320, saturation: 1.2, brightness: 1.05, label: "pink" },
    { re: /\b(purple|violet|lavender)\b/, hueDeg: 280, saturation: 1.1, brightness: 1.0, label: "purple" },
    { re: /\b(green|emerald|teal|mint)\b/, hueDeg: 130, saturation: 1.1, brightness: 1.0, label: "green" },
    { re: /\b(yellow|gold|blonde|blond)\b/, hueDeg: 50, saturation: 1.2, brightness: 1.1, label: "yellow" },
    { re: /\b(orange|amber)\b/, hueDeg: 30, saturation: 1.2, brightness: 1.0, label: "orange" },
    { re: /\b(brown|chestnut|hazel)\b/, hueDeg: 25, saturation: 0.8, brightness: 0.85, label: "brown" },
  ];
  for (const entry of table) {
    if (entry.re.test(p)) {
      return {
        hueDeg: entry.hueDeg,
        saturation: entry.saturation,
        brightness: entry.brightness,
        matched: entry.label,
      };
    }
  }
  return null;
}

export function createRecolorAdapter(opts: RecolorAdapterOptions = {}): TextureAdapter {
  const enabled = opts.enabled ?? process.env.GENY_RECOLOR_DISABLED !== "true";
  return {
    name: "recolor@local-hue",
    supports(task: TextureTask): boolean {
      if (!enabled) return false;
      // referenceImage 없으면 변형할 base 없음 → 다른 어댑터로.
      if (!task.referenceImage?.png) return false;
      // prompt 에 색 키워드 없으면 변형 의도 불명 → skip.
      if (!parseColorIntent(task.prompt)) return false;
      return true;
    },
    async generate(task: TextureTask) {
      const intent = parseColorIntent(task.prompt);
      if (!intent) {
        const err = new Error("recolor: no color keyword in prompt") as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }
      // sharp.modulate: hue 는 절대 회전 (deg, 0~360), saturation/brightness 는 상대.
      // 입력 atlas 의 UV / 픽셀 위치는 그대로 유지하면서 색만 회전.
      let pipeline = sharp(task.referenceImage!.png).ensureAlpha();
      pipeline = pipeline.modulate({
        hue: intent.hueDeg,
        saturation: intent.saturation,
        brightness: intent.brightness,
      });
      // task.width/height 와 정확히 일치시킴 (atlas size 안 바뀌게).
      pipeline = pipeline.resize(task.width, task.height, { fit: "fill" });
      const png = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      return {
        png,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: task.width,
        height: task.height,
      };
    },
  };
}
