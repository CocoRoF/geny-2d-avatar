/**
 * docs/06 §6.4 — Palette Lock (fit-to-palette).
 *
 * 1. α-gate 통과 픽셀을 **Lab 공간 k-means k=4** 로 클러스터링 (결정론적 seed).
 * 2. 각 지배색(클러스터 중심) → 팔레트의 최근접 색으로 **ΔE(CIE76)** 측정.
 * 3. ΔE ≤ `move_cap_delta_e` 인 클러스터만 그 offset 만큼 픽셀을 **Lab 공간에서 평행 이동**.
 *    초과 클러스터는 warning 으로 남기고 skip — 의도치 않은 색 변형 방지.
 * 4. 결과 image + per-cluster decision report 반환.
 *
 * 결정론 키:
 *   - k-means 초기화: α-gate 통과 픽셀을 raster 순회하며 거리 임계 분리(Mini-Farthest-First) —
 *     같은 입력이면 같은 중심을 뽑는다. RNG 미사용.
 *   - 반복: 최대 `maxIter` (기본 12), 중심 이동 < 1e-3 이면 조기 종료.
 *
 * 팔레트 카탈로그(`schema/v1/palette.schema.json`) 의 `colors[].rgb` 는 sRGB 0..255 이며,
 * 이 모듈이 Lab 으로 on-demand 변환.
 */
import { deltaE76, labToRgb, rgbToLab, type LabColor } from "./color-space.js";
import type { ImageBuffer } from "./types.js";

export interface PaletteColor {
  readonly name: string;
  readonly rgb: readonly [number, number, number];
  readonly weight?: number;
}

export interface PaletteEntry {
  readonly id: string;
  readonly description?: string;
  readonly scope?: "avatar" | "slot" | "color_context";
  readonly slot_id?: string;
  readonly color_context?: string;
  readonly move_cap_delta_e?: number;
  readonly colors: readonly PaletteColor[];
}

export interface FitToPaletteOptions {
  /** α 임계 (기본 1 — 완전 투명만 제외). */
  alphaThreshold?: number;
  /** k-means k (기본 4 — docs/06 §6.4). */
  k?: number;
  /** k-means 최대 반복 (기본 12). */
  maxIter?: number;
  /** 수렴 임계 (Lab L 단위, 기본 1e-3). */
  convergence?: number;
  /** 팔레트에서 불러들인 move_cap_delta_e 를 override. */
  moveCapDeltaE?: number;
}

export interface ClusterDecision {
  readonly clusterIndex: number;
  readonly sampleCount: number;
  readonly centerLab: LabColor;
  readonly matchedPaletteName: string;
  readonly matchedPaletteRgb: readonly [number, number, number];
  readonly deltaE: number;
  readonly moved: boolean;
}

export interface FitToPaletteResult {
  readonly image: ImageBuffer;
  readonly decisions: readonly ClusterDecision[];
  readonly moveCapDeltaE: number;
}

interface Sample {
  idx: number;
  lab: LabColor;
}

export function fitToPalette(
  img: ImageBuffer,
  palette: PaletteEntry,
  opts: FitToPaletteOptions = {},
): FitToPaletteResult {
  if (img.premultiplied) {
    throw new Error(
      "fitToPalette: input must be straight (non-premultiplied); convert first",
    );
  }
  const alphaThreshold = opts.alphaThreshold ?? 1;
  if (!Number.isInteger(alphaThreshold) || alphaThreshold < 0 || alphaThreshold > 255) {
    throw new RangeError(`alphaThreshold must be integer in [0,255], got ${alphaThreshold}`);
  }
  const k = opts.k ?? 4;
  if (!Number.isInteger(k) || k < 1 || k > 8) {
    throw new RangeError(`k must be integer in [1,8], got ${k}`);
  }
  const maxIter = opts.maxIter ?? 12;
  const convergence = opts.convergence ?? 1e-3;
  const moveCapDeltaE = opts.moveCapDeltaE ?? palette.move_cap_delta_e ?? 12;

  // 1) 샘플 추출 (α-gate)
  const { width, height, data } = img;
  const samples: Sample[] = [];
  for (let i = 0; i < width * height; i++) {
    const base = i * 4;
    const a = data[base + 3] ?? 0;
    if (a < alphaThreshold) continue;
    const r = data[base] ?? 0;
    const g = data[base + 1] ?? 0;
    const b = data[base + 2] ?? 0;
    samples.push({ idx: i, lab: rgbToLab(r, g, b) });
  }

  const out = new Uint8ClampedArray(data);

  if (samples.length === 0) {
    return {
      image: { width, height, data: out, premultiplied: false },
      decisions: [],
      moveCapDeltaE,
    };
  }

  // 2) 초기 중심: farthest-first (결정론적)
  const kEffective = Math.min(k, samples.length);
  const centers: LabColor[] = [samples[0]!.lab];
  while (centers.length < kEffective) {
    let bestIdx = 0;
    let bestDist = -1;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      let d = Infinity;
      for (const c of centers) {
        const dd = deltaE76(s.lab, c);
        if (dd < d) d = dd;
      }
      if (d > bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    centers.push(samples[bestIdx]!.lab);
  }

  // 3) Lloyd iterations
  const assignments = new Int32Array(samples.length);
  for (let iter = 0; iter < maxIter; iter++) {
    // assign
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < centers.length; c++) {
        const d = deltaE76(s.lab, centers[c]!);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      assignments[i] = bestC;
    }
    // update
    const sumL = new Float64Array(centers.length);
    const sumA = new Float64Array(centers.length);
    const sumB = new Float64Array(centers.length);
    const count = new Int32Array(centers.length);
    for (let i = 0; i < samples.length; i++) {
      const c = assignments[i]!;
      const lab = samples[i]!.lab;
      sumL[c]! += lab.L;
      sumA[c]! += lab.a;
      sumB[c]! += lab.b;
      count[c]! += 1;
    }
    let maxMove = 0;
    for (let c = 0; c < centers.length; c++) {
      if (count[c]! === 0) continue;
      const newCenter: LabColor = {
        L: sumL[c]! / count[c]!,
        a: sumA[c]! / count[c]!,
        b: sumB[c]! / count[c]!,
      };
      const move = deltaE76(newCenter, centers[c]!);
      centers[c] = newCenter;
      if (move > maxMove) maxMove = move;
    }
    if (maxMove < convergence) break;
  }

  // 4) 각 중심 → 팔레트 최근접 색
  const paletteLab = palette.colors.map((p) => ({
    name: p.name,
    rgb: [p.rgb[0], p.rgb[1], p.rgb[2]] as [number, number, number],
    lab: rgbToLab(p.rgb[0], p.rgb[1], p.rgb[2]),
  }));
  const clusterCount = new Int32Array(centers.length);
  for (let i = 0; i < samples.length; i++) clusterCount[assignments[i]!]! += 1;

  const decisions: ClusterDecision[] = [];
  const offsetLab: Array<[number, number, number] | null> = [];
  for (let c = 0; c < centers.length; c++) {
    const center = centers[c]!;
    let bestIdx = 0;
    let bestD = Infinity;
    for (let p = 0; p < paletteLab.length; p++) {
      const d = deltaE76(center, paletteLab[p]!.lab);
      if (d < bestD) {
        bestD = d;
        bestIdx = p;
      }
    }
    const match = paletteLab[bestIdx]!;
    const moved = bestD <= moveCapDeltaE;
    decisions.push({
      clusterIndex: c,
      sampleCount: clusterCount[c]!,
      centerLab: center,
      matchedPaletteName: match.name,
      matchedPaletteRgb: match.rgb,
      deltaE: bestD,
      moved,
    });
    offsetLab.push(
      moved
        ? [match.lab.L - center.L, match.lab.a - center.a, match.lab.b - center.b]
        : null,
    );
  }

  // 5) 픽셀별 offset 적용 (Lab 공간에서 평행 이동)
  for (let i = 0; i < samples.length; i++) {
    const c = assignments[i]!;
    const off = offsetLab[c];
    if (!off) continue;
    const s = samples[i]!;
    const newLab: LabColor = { L: s.lab.L + off[0], a: s.lab.a + off[1], b: s.lab.b + off[2] };
    const [nr, ng, nb] = labToRgb(newLab.L, newLab.a, newLab.b);
    const base = s.idx * 4;
    out[base] = nr;
    out[base + 1] = ng;
    out[base + 2] = nb;
    // α 유지
  }

  return {
    image: { width, height, data: out, premultiplied: false },
    decisions,
    moveCapDeltaE,
  };
}

/**
 * 카탈로그 파서 — schema/v1/palette.schema.json 의 JSON 을 받아 최소 런타임 검증 후 반환.
 * `validate-schemas.mjs` 가 Ajv 로 정식 검증을 수행하므로 여기서는 구조 guard 만.
 */
export function parsePaletteCatalog(raw: unknown): PaletteEntry[] {
  if (!raw || typeof raw !== "object") {
    throw new Error("parsePaletteCatalog: root must be an object");
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== "v1") {
    throw new Error(`parsePaletteCatalog: unsupported schema_version=${String(obj.schema_version)}`);
  }
  const palettes = obj.palettes;
  if (!Array.isArray(palettes) || palettes.length === 0) {
    throw new Error("parsePaletteCatalog: palettes must be non-empty array");
  }
  const ids = new Set<string>();
  const out: PaletteEntry[] = [];
  for (const p of palettes) {
    if (!p || typeof p !== "object") throw new Error("parsePaletteCatalog: palette must be object");
    const pe = p as Record<string, unknown>;
    const id = String(pe.id ?? "");
    if (!id) throw new Error("parsePaletteCatalog: palette.id required");
    if (ids.has(id)) throw new Error(`parsePaletteCatalog: duplicate palette id '${id}'`);
    ids.add(id);
    const colors = pe.colors;
    if (!Array.isArray(colors) || colors.length === 0) {
      throw new Error(`parsePaletteCatalog: palette '${id}' colors must be non-empty`);
    }
    out.push(pe as unknown as PaletteEntry);
  }
  return out;
}
