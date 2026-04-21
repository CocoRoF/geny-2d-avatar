# @geny/post-processing

`geny-2d-avatar` 의 **텍스처 전처리 파이프라인** — docs/06 §4 Stage 1 Alpha Sanitation + §6 Stage 3 Color Normalize + §6.4 Palette Lock + §6.5 Atlas Hook. AI 어댑터가 생성한 RGBA8 픽셀 버퍼를 web-avatar/Cubism 번들에 넣기 전에 "깔끔한 경계 + 일관된 색 + 팔레트 안착" 상태로 만든다.

## 현재 상태 (세션 26 → 35)

**Stage 1 — Alpha sanitation** (docs/06 §4, 세션 26 초판 + 세션 35 확장)

- [x] `premultipliedToStraight` / `straightToPremultiplied` — α=255 bit-exact 라운드트립.
- [x] `cleanAlphaNoise` — threshold 기본 8. premultiplied 입력이면 RGB 도 함께 0.
- [x] `morphCloseAlpha` — 슬롯별 `max_hole_px`, 알파 디스크 SE (세션 35).
- [x] `featherAlpha` — `alpha_edge_policy` 연결. 박스 블러 기반 edge softening (세션 35).
- [x] `clipToUvBox` — 파츠 메타 `uv_bbox` 바깥 픽셀 α=0 (세션 35).
- [x] `computeAlphaBbox` — tight bbox, 전부 투명이면 `null`.
- [x] `applyAlphaSanitation` — 6 단계 파이프라인 + 결정론적 golden sha256.

**Stage 3 — Color normalize** (docs/06 §6, 세션 29 초판)

- [x] `computeColorStats` — per-channel 평균/std, α-gate, RGB 또는 **Lab** 공간 선택 가능.
- [x] `remapColorLinear` — Reinhard 선형 재매핑 `newC = (C-src.mean)*(dst.std/src.std) + dst.mean`, std=0 평행 이동, 0..255 clamp, α 보존.
- [x] `normalizeColor` — 두 단계 합성 + `{ source, applied }` stats (QA 근접도 재검증).
- [x] `rgbToLab` / `labToRgb` / `deltaE76` — CIE 공간 전환 + ΔE76 거리. Lab* 기반 정규화 및 팔레트 fit 에 재사용 (세션 32).

**§6.4 Palette Lock** (세션 32)

- [x] `fitToPalette` — α-gate 통과 픽셀을 **Lab k-means k=4** 로 클러스터링, 각 지배색 → 팔레트 최근접색. ΔE ≤ `move_cap_delta_e` 만 Lab 평행 이동, 초과 클러스터는 warning 남기고 skip.
- [x] `parsePaletteCatalog` — `schema/v1/palette.schema.json` 카탈로그 파서. 결정론적 seed / RNG 미사용.

**§6.5 Atlas Hook** (세션 32)

- [x] `applyPreAtlasNormalization` — exporter-core `assembleWebAvatarBundle()` stage 2 atlas emit 직전 순수 함수 훅. `target?` → normalize, `palette?` → fitToPalette 체인. parts 순서/길이 불변(atlas 인덱스 안정성).

## 사용 예

### Stage 1 + 3 (per-part)

```ts
import {
  applyAlphaSanitation,
  normalizeColor,
  createImageBuffer,
} from "@geny/post-processing";

const raw = createImageBuffer(1024, 1024, pixelBuffer, /* premultiplied */ false);
const { image: cleaned, bbox } = applyAlphaSanitation(raw, {
  threshold: { threshold: 8 },
  morphClose: { maxHolePx: 4 },
  feather: { radius: 2 },
  uvClip: { uvBbox: [0.1, 0.1, 0.9, 0.9] },
  bbox: { minAlpha: 8 },
});

const target = { mean: [200, 180, 170], std: [25, 25, 25], sampleCount: 0 } as const;
const { image: normalized, source, applied } = normalizeColor(cleaned, target, {
  alphaThreshold: 8,
});
```

### 파이프라인 훅 (atlas emit 직전)

```ts
import {
  applyPreAtlasNormalization,
  parsePaletteCatalog,
} from "@geny/post-processing";

const palette = parsePaletteCatalog(paletteJson, "halfbody-default");
const { parts, report } = applyPreAtlasNormalization(
  partInputs,          // [{ slotId, image }]
  { target: avatarTarget, palette, alphaThreshold: 8 },
);
// report.normalized / paletteApplied / paletteSkipped — exporter 로그에 그대로 전달.
```

## API

### 함수 (index.ts export)

| 이름 | 설명 |
|---|---|
| `createImageBuffer(w, h, data, premultiplied)` | ImageBuffer 생성 헬퍼. |
| `straightToPremultiplied` / `premultipliedToStraight` | α 라운드트립. α=255 bit-exact. |
| `cleanAlphaNoise` | threshold 이하 α 픽셀 클리어. |
| `morphCloseAlpha` | 디스크 SE 기반 alpha 닫힘. |
| `featherAlpha` | 박스 블러 기반 edge softening. |
| `clipToUvBox` | uv_bbox 바깥 α=0. |
| `computeAlphaBbox` | tight bbox 계산. |
| `applyAlphaSanitation` | Stage 1 6 단계 파이프라인 + golden sha256. |
| `computeColorStats` | per-channel 평균/std (RGB 또는 Lab). |
| `remapColorLinear` | Reinhard 선형 재매핑. |
| `normalizeColor` | computeColorStats + remapColorLinear 합성. |
| `rgbToLab` / `labToRgb` / `deltaE76` | CIE Lab 전환 + ΔE76 거리. |
| `fitToPalette` | Lab k-means k=4 + ΔE-gated 평행 이동. |
| `parsePaletteCatalog` | `palette.schema.json` → `PaletteEntry`. |
| `applyPreAtlasNormalization` | normalize → palette 체인 훅 (exporter-core 소비). |

### 타입

`ImageBuffer` / `BBox` / `AlphaThresholdOptions` / `MorphCloseOptions` / `FeatherOptions` / `AlphaBBoxOptions` / `AlphaSanitationOptions` / `AlphaSanitationResult` / `ColorStats` / `ColorStatsOptions` / `ColorSpace` / `RemapColorOptions` / `ColorNormalizeOptions` / `ColorNormalizeResult` / `LabColor` / `FitToPaletteOptions` / `FitToPaletteResult` / `ClusterDecision` / `PaletteEntry` / `PaletteColor` / `PreAtlasOptions` / `PreAtlasPartInput` / `PreAtlasPartOutput` / `PreAtlasReport` / `PreAtlasResult`.

## 소비자

- **`@geny/exporter-core`** — `assembleWebAvatarBundle()` stage 2 (atlas emit 전) 가 `applyPreAtlasNormalization` 훅을 얕게 import.
- **AI 어댑터 후단** (`@geny/ai-adapter-*` 의 raw pixel output) — Stage 1 이 첫 소비자.

## 검증

```bash
pnpm -F @geny/post-processing test   # 111 tests
```

- Stage 1: α 라운드트립 (α=255 bit-exact / α=0 lossy) / threshold / morph-close 홀 채움 / feather 대칭성 / uv-clip / bbox tight / 파이프라인 결과 **sha256 고정** (`f2341b59…` — 알파 수학 변경 시 픽셀 단위 리뷰 후 golden 갱신).
- Stage 3: source=target 항등 / std=0 평행 이동 / clamp / α=0 보존 / alphaThreshold gate / premultiplied 차단 / LCG 픽셀 sha256 결정론 / applied≈target 수렴.
- Palette: Lab k-means 결정론 / ΔE76 / move-cap 준수 / 초과 클러스터 skip.
- Atlas hook: parts 순서/길이 보존 / identity(target 및 palette 모두 미지정) / normalize-only / palette-only / 연쇄.

## 결정론 규칙

모든 함수는 **RNG 를 쓰지 않으며**, Lab k-means 초기화는 raster 순회 Mini-Farthest-First (세션 52) — 같은 입력이면 같은 중심을 뽑는다. `applyAlphaSanitation` 의 golden sha256 이 CI 에서 드리프트 감시 1 차 방어선.

## 참고 문서

- [docs/06 §4](../../docs/06-texture-postprocessing.md) — Stage 1 Alpha Sanitation 6 단계 정의.
- [docs/06 §6](../../docs/06-texture-postprocessing.md) — Stage 3 Color Normalize + §6.4 Palette Lock + §6.5 Atlas Hook 계약.
- [progress/sessions/2026-04-18-session-26-post-processing-stage1.md](../../progress/sessions/2026-04-18-session-26-post-processing-stage1.md) — Stage 1 alpha sanitation skeleton.
- [progress/sessions/2026-04-18-session-29-post-processing-stage3.md](../../progress/sessions/2026-04-18-session-29-post-processing-stage3.md) — Stage 3 color normalize skeleton.
- [progress/sessions/2026-04-19-session-32-post-processing-stage3-extension.md](../../progress/sessions/2026-04-19-session-32-post-processing-stage3-extension.md) — Lab* + fit-to-palette + atlas-hook.
- [progress/sessions/2026-04-19-session-35-post-processing-stage1-extension.md](../../progress/sessions/2026-04-19-session-35-post-processing-stage1-extension.md) — morph-close + feather + uv-clip.
