/**
 * docs/06 §6 — Stage 3 Lab* 색공간 변환.
 *
 * sRGB ↔ CIE 1976 L*a*b* (D65 illuminant). `normalizeColor({ colorSpace: "lab" })`
 * 경로와 `fitToPalette` 가 공유. 변환은 결정론적이며 JS `Math.*` 기본 연산만 사용.
 *
 * 라운드트립 정밀도:
 *   - sRGB(int 0..255) → Lab → sRGB(int 0..255) 의 오차는 ≤ 1 (int 반올림 탓의 off-by-one).
 *   - 순수 float sRGB ↔ Lab 은 ≤ 1e-9 수준에서 identity.
 *
 * ΔE(CIE76) 는 `sqrt(ΔL² + Δa² + Δb²)` — 간단·결정론. OKLab 이나 CIEDE2000 은 후속 세션에서
 * 필요해질 때 추가(docs/06 §14 Open questions).
 */

/** D65 white point, 2° observer. */
const XN = 95.047;
const YN = 100.0;
const ZN = 108.883;

const KAPPA = 24389 / 27; // 903.2962962...
const EPSILON = 216 / 24389; // 0.008856451...

export interface LabColor {
  readonly L: number; // 0..100
  readonly a: number; // approximately -86..98
  readonly b: number; // approximately -107..94
}

/** sRGB [0..255] integer → linear 0..1. */
function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** linear 0..1 → sRGB [0..255] integer (rounded, clamped). */
function linearToSrgb(v: number): number {
  const s = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  const b = Math.round(s * 255);
  if (b < 0) return 0;
  if (b > 255) return 255;
  return b;
}

/** sRGB 0..255 → CIE 1931 XYZ (D65, scaled so Y=100 at white). */
function srgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbToLinear(r);
  const gl = srgbToLinear(g);
  const bl = srgbToLinear(b);
  const X = (rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375) * 100;
  const Y = (rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175) * 100;
  const Z = (rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041) * 100;
  return [X, Y, Z];
}

/** XYZ (D65, Y=100 scale) → sRGB 0..255. */
function xyzToSrgb(X: number, Y: number, Z: number): [number, number, number] {
  const x = X / 100;
  const y = Y / 100;
  const z = Z / 100;
  const rl = x * 3.2404542 + y * -1.5371385 + z * -0.4985314;
  const gl = x * -0.969266 + y * 1.8760108 + z * 0.041556;
  const bl = x * 0.0556434 + y * -0.2040259 + z * 1.0572252;
  return [linearToSrgb(rl), linearToSrgb(gl), linearToSrgb(bl)];
}

function f(t: number): number {
  return t > EPSILON ? Math.cbrt(t) : (KAPPA * t + 16) / 116;
}

function fInv(t: number): number {
  const t3 = t * t * t;
  return t3 > EPSILON ? t3 : (116 * t - 16) / KAPPA;
}

export function rgbToLab(r: number, g: number, b: number): LabColor {
  const [X, Y, Z] = srgbToXyz(r, g, b);
  const fx = f(X / XN);
  const fy = f(Y / YN);
  const fz = f(Z / ZN);
  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

export function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = a / 500 + fy;
  const fz = fy - b / 200;
  const X = XN * fInv(fx);
  const Y = YN * fInv(fy);
  const Z = ZN * fInv(fz);
  return xyzToSrgb(X, Y, Z);
}

/** ΔE*ab (CIE76) — sqrt(ΔL²+Δa²+Δb²). 결정론·단순. */
export function deltaE76(p: LabColor, q: LabColor): number {
  const dL = p.L - q.L;
  const da = p.a - q.a;
  const db = p.b - q.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}
