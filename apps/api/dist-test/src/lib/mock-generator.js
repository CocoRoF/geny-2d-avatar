/**
 * 결정론적 mock 텍스처 생성기. (prompt, seed, width, height) → RGBA PNG.
 *
 * 실 AI 벤더 통합 전 파이프라인 라운드트립 검증용. 특징:
 *   - 동일 (prompt, seed, width, height) → 바이트 동일 PNG (결정론)
 *   - prompt 해시 → 주요 hue, seed → 보조 hue / 패턴 variation
 *   - 빠름 (CPU only, pngjs 로 write)
 *   - 시각적으로도 구분 가능 (blocky gradient + seed stamp)
 *
 * 본 파일의 출력은 "실 생성이 아님" 을 명시하는 watermark bar 를 좌하단에 포함.
 */
import { createHash } from "node:crypto";
import { PNG } from "pngjs";
/** HSL → RGB (모두 0..1 입력/출력). */
function hslToRgb(h, s, l) {
    h = ((h % 1) + 1) % 1;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h * 6) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 1 / 6)
        [r, g, b] = [c, x, 0];
    else if (h < 2 / 6)
        [r, g, b] = [x, c, 0];
    else if (h < 3 / 6)
        [r, g, b] = [0, c, x];
    else if (h < 4 / 6)
        [r, g, b] = [0, x, c];
    else if (h < 5 / 6)
        [r, g, b] = [x, 0, c];
    else
        [r, g, b] = [c, 0, x];
    return [r + m, g + m, b + m];
}
function hashToFloat(input) {
    const digest = createHash("sha256").update(input).digest();
    // 첫 4 bytes → 0..1
    return digest.readUInt32BE(0) / 0xffffffff;
}
export function generateMockTexture(opts) {
    const { prompt, seed, width, height } = opts;
    if (width <= 0 || height <= 0)
        throw new Error("width/height must be positive");
    const promptHue = hashToFloat(prompt + "|hue");
    const seedHue = (seed % 360) / 360;
    const blockSize = Math.max(4, Math.min(width, height) / 16);
    const png = new PNG({ width, height });
    const data = png.data;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const bx = Math.floor(x / blockSize);
            const by = Math.floor(y / blockSize);
            const blockMix = ((bx * 31 + by * 17) % 7) / 7;
            const hue = (promptHue + seedHue * 0.3 + blockMix * 0.15) % 1;
            const sat = 0.55 + blockMix * 0.3;
            const lum = 0.55 + Math.sin((x / width) * Math.PI * 2) * 0.08;
            const [r, g, b] = hslToRgb(hue, sat, lum);
            const idx = (width * y + x) * 4;
            data[idx] = Math.round(r * 255);
            data[idx + 1] = Math.round(g * 255);
            data[idx + 2] = Math.round(b * 255);
            data[idx + 3] = 255;
        }
    }
    // 좌하단 8px 스트라이프 "MOCK" 표시 — 실 생성이 아님을 시각적으로 표기.
    const stripeH = Math.min(8, Math.floor(height / 32));
    for (let y = height - stripeH; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const idx = (width * y + x) * 4;
            const bandHue = (x / width + 0.0) % 1;
            const [r, g, b] = hslToRgb(bandHue, 0.8, 0.4);
            data[idx] = Math.round(r * 255);
            data[idx + 1] = Math.round(g * 255);
            data[idx + 2] = Math.round(b * 255);
            data[idx + 3] = 255;
        }
    }
    return PNG.sync.write(png, { colorType: 6, deflateLevel: 6 });
}
//# sourceMappingURL=mock-generator.js.map