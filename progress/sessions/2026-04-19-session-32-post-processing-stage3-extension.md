# 세션 32 — Post-Processing Stage 3 확장 (Lab* + fit-to-palette + atlas-hook)

- 날짜: 2026-04-19
- 브랜치/커밋: main · 세션 32
- 워크스트림: **Post-Processing & Fitting** (`docs/14 §9`) — Stage 3 확장
- 로드맵: docs/06 §6 Stage 3 (Lab* + palette) + §4 atlas emit · `progress/INDEX.md §8` 세션 32 예고

## 1. 목표

세션 29 는 docs/06 §6 의 "결정론적 RGB Reinhard" 경로만 박제했다. 그러나 RGB 공간의
평행/스케일 이동은 채도/명도가 뒤섞이는 색상에서 감마적으로 왜곡된다. docs/06 §6.3 은
CIE 1976 L\*a\*b\* (D65) 공간에서 같은 선형 변환을 수행할 것을 지정한다 — 채널
독립성이 더 높아 피부/머리/옷 슬롯 간 간섭이 적다.

또한 docs/06 §6.4 "팔레트 락" 은 AI 어댑터가 흔들리는 팔레트를 한 번 더 묶는 후처리
단계를 정의한다: k-means 로 지배색 k 개를 뽑고, 각 클러스터를 팔레트 카탈로그의 최근접
색(ΔE76)으로 **`move_cap_delta_e` 이내** 에서만 이동시킨다. 초과는 원본 보존 + 경고.

이 두 경로를 이어, atlas emit 직전 훅 `applyPreAtlasNormalization` 로 묶는다.
exporter-core 는 아직 결합하지 않는다 — Stage 1 close/feather/uv-clip 과 함께 세션 35
에서 한 번에 통합한다 (후속 예고 추가).

```
[AI adapter RGBA8 (Stage 1 이후)]
       ↓
applyPreAtlasNormalization({target?, palette?})
  1) normalizeColor(img, target)        ← RGB or Lab* Reinhard
  2) fitToPalette(img, palette)         ← Lab* k-means + ΔE76 cap
       ↓
[exporter-core · assembleWebAvatarBundle · atlas emit]
```

## 2. 산출물 체크리스트

- [x] `packages/post-processing/src/color-space.ts` — `rgbToLab`/`labToRgb`/`deltaE76` (CIE 1976 L\*a\*b\*, D65 백색점, sRGB 감마 2.4 inverse / forward, Kappa=24389/27).
- [x] `packages/post-processing/src/color-stats.ts` — `ColorSpace = "rgb"|"lab"` 도입. `ColorStats.colorSpace` **optional** (미지정 → "rgb", backward-compat). `computeColorStats(img, {colorSpace, alphaThreshold})` 에 Lab 분기 추가 — 각 픽셀을 straight 복원 후 `rgbToLab` 으로 이동해 2-pass mean/std.
- [x] `packages/post-processing/src/color-remap.ts` — `source.colorSpace` 와 `target.colorSpace` 일치 가드(불일치 → throw). Lab 경로는 `rgbToLab → scale+offset per L/a/b → labToRgb → clamp 0..255`.
- [x] `packages/post-processing/src/color-normalize.ts` — `target.colorSpace ?? "rgb"` 로 경로 분기 + `opts.colorSpace` 와 충돌 시 throw. `ColorNormalizeResult.colorSpace` 필드 추가.
- [x] `packages/post-processing/src/palette.ts` — `PaletteColor`/`PaletteEntry` 타입 + `fitToPalette(img, palette, {k=4, maxIter=12, convergence=1e-3, alphaThreshold=1, moveCapDeltaE?})` + `parsePaletteCatalog(raw)` 런타임 가드. α-gate 샘플만 Lab 로 이동해 farthest-first 시드(결정론, RNG 미사용) + Lloyd → 각 클러스터 중심 ΔE76 최근접 팔레트색 매핑 → cap 이내면 offset 만큼 해당 클러스터 픽셀 전체를 Lab 에서 이동 후 sRGB 환원. 초과는 moved=false + 원본 보존.
- [x] `packages/post-processing/src/atlas-hook.ts` — `applyPreAtlasNormalization(parts, {target?, palette?, alphaThreshold?})`. target/palette 둘 다 없으면 identity. 입력 순서/길이 엄격 보존 (atlas 인덱스 안정성). `{parts[], report{total, normalized, paletteApplied, paletteSkipped}}`.
- [x] `packages/post-processing/src/index.ts` — 위 심볼 + 타입 재노출 (`LabColor`/`FitToPaletteOptions`/`FitToPaletteResult`/`ClusterDecision`/`PaletteEntry`/`PaletteColor`/`PreAtlas*`/`ColorSpace`).
- [x] `schema/v1/palette.schema.json` — 신설. `schema_version=v1` 상수 + `palettes[]{id, description?, scope:avatar|slot|color_context, slot_id?, color_context?, move_cap_delta_e (0..50, 기본 12), colors[]{name, rgb[3]∈[0,255], weight?}}`. scope 에 따라 `slot_id`/`color_context` 가 **conditional required** (`allOf`+`if/then` + `properties` 동반 선언으로 Ajv strictRequired 회피).
- [x] `infra/palettes/halfbody-pastel.json` — 2 카탈로그. (1) `halfbody-pastel` (scope=avatar, 8 pastel, cap=12) (2) `halfbody-pastel-hair` (scope=color_context, context=hair_primary, 3색, cap=10).
- [x] `scripts/validate-schemas.mjs` — palette 등록 + section 9 `validatePaletteCatalogs()` 가 `infra/palettes/*.json` 을 walk 하며 검증. **checked 137→184** (아바타 저작 183 + palette 카탈로그 1).
- [x] `scripts/test-golden.mjs` — step 13 헤더만 "Stage 3 Lab\*/palette/atlas-hook, 85 tests" 로 bump. 패키지 테스트 자동 확장이라 별도 step 추가 불필요.
- [x] `tests/color-space.test.ts` — 10 tests (rgbToLab 레퍼런스 흑/백/중간 회색 / 순원색 3 / 라운드트립 ΔE≤1 / deltaE76 대칭/양성 등).
- [x] `tests/color-lab.test.ts` — 8 tests (Lab stats 단색 / 기본 rgb 유지 / invalid colorSpace / remap identity / remap colorSpace 불일치 throw / normalize 단색 회색 → target L 수렴 / opts↔target 충돌 throw / 다채로운 입력에서 RGB vs Lab 결과 상이).
- [x] `tests/palette.test.ts` — 10 tests (팔레트 근접색 moved=true / 팔레트 먼색 cap 초과 moved=false 원본 보존 / α-gate 샘플 제외 / k=2 두 지배색 각자 다른 팔레트 매핑 / premultiplied throw / 결정론 / 이동 후 클러스터가 팔레트에 더 가까움 / parsePaletteCatalog happy + 3 error).
- [x] `tests/atlas-hook.test.ts` — 9 tests 설계 (identity / target-only / palette-only / target+palette chain / 입력 순서·길이 불변 / cap 초과 skipped 집계 / 결정론 + Stage 1/3 기존 unchanged).
- [x] `docs/06-post-processing-pipeline.md` — §16 "Lab vs OKLab" 공개 질문 항목을 Lab 채택으로 종결 (broader Cubism/Grafana 공용 툴 에코). §17 Runtime 산출물 표 추가 (Stage 1 세션 26 / RGB Reinhard 세션 29 / Lab + palette + atlas-hook 세션 32).

## 3. Done 정의 / 검증

| 지표 | 값 |
|---|---|
| post-processing 테스트 | **85 pass / 0 fail** (Stage1 27 + Stage3 RGB 21 + color-space 10 + Lab 경로 8 + palette 10 + atlas-hook 9) |
| validate-schemas | **checked=184 / failed=0** |
| `pnpm run test:golden` | **14 step 전부 pass** (step 13 post-processing 만 증강, 기타 불변) |
| 기존 회귀 | halfbody v1.2.0 Cubism/web-avatar/bundle-manifest golden · aria 번들 · license-verifier · ai-adapter-core 52 · ai-adapters-fallback 53 등 전부 불변 |

```
$ pnpm --filter @geny/post-processing run test | tail
ℹ tests 85  ℹ pass 85  ℹ fail 0

$ node scripts/validate-schemas.mjs | tail
[validate] checked=184 failed=0
[validate] ✅ all schemas + rig templates valid

$ pnpm run test:golden | tail
[golden] ✅ all steps pass
```

## 4. 설계 결정 (D1–D5)

### D1. Lab* (CIE 1976) 채택, OKLab 보류
docs/06 §16 오래된 질문. OKLab 은 **지각 균일성 지표**(CIEDE2000 대비 ΔE\_OK 효율)에서
우세하지만 팔레트 카탈로그/디자인 툴/Cubism/Photoshop 에코가 대부분 Lab (CIE 1976) 기반
이다. 팔레트 인터체인지에서 왕복 시 오차를 최소화하려면 **동일 색공간** 이 핵심이고, 당장
의 품질 차이보다 중요하다. 또한 ΔE76 은 닫힌 해(sqrt(ΔL²+Δa²+Δb²))라 결정론적 거리
구현이 즉시 맞아 떨어지는 반면 ΔE2000 은 floating-point 수치 불안정 우려가 있다.

> 바꿀 여지: 팔레트 카탈로그의 루트 `color_space` 필드를 도입하면 나중에 파일 단위로
> OKLab 전환 가능. 지금은 전역 Lab (D65) 로 고정.

### D2. k-means farthest-first seed (RNG 미사용)
결정론이 최우선. 난수 시드 없이도 안정적으로 k 개 시드를 뽑으려면 farthest-first
heuristic (Gonzalez 알고리즘) 이 간단하다: 샘플 평균에서 가장 먼 점 1 → 그 점에서 가장
먼 점 2 → … → k. 입력이 같으면 시드가 같고 Lloyd 수렴도 같다. 결과의 "완벽한
클러스터링" 은 포기하지만, post-processing 은 대부분 4 개 지배색 정도면 충분 — docs/06
§6.4 도 "k≤6" 권고.

### D3. JSON 팔레트 카탈로그 + scope enum
ADR 0002 "스키마 우선". YAML/TOML 대신 **JSON Schema 로 검증 가능한 JSON** 이
단일 진실 공급원. `scope` 를 `avatar`/`slot`/`color_context` 로 나눈 이유: (a) 전체
아바타 공통 팔레트 (halfbody-pastel) (b) 특정 슬롯(모자/안경) (c) color_context 공유
(머리 앞/뒤/ahoge 가 같은 hair_primary context 를 공유) — 세 케이스가 모두 현실에
있고 선택을 강제하면 저작이 반복된다. Ajv strict 모드에서 conditional required 는
`allOf`+`if/then` 내부에 `properties`+`required` 둘 다 선언해야 통과.

### D4. `ColorStats.colorSpace` 를 optional 로 — backward compat
세션 29 의 기존 48 tests 가 `ColorStats` 를 `{mean,std,sampleCount}` 로 생성한다. 이
필드를 required 로 추가하면 48 tests 가 전부 깨지고 의미상 redundant (RGB 가 default).
따라서 `readonly colorSpace?: ColorSpace` 로 두고 runtime default "rgb". Lab 로
쓰는 쪽만 명시하면 된다. 결과적으로 기존 공개 API 불변.

### D5. atlas-hook 을 exporter-core 가 아닌 post-processing 안에 둔다
`applyPreAtlasNormalization` 은 순수 함수다. exporter-core 가 이걸 알고 호출하면
**두 패키지가 양방향 결합** 된다. 대신 post-processing 이 단독으로 인터페이스를 고정
(`PreAtlasPartInput`/`PreAtlasResult`) 하고 exporter-core 는 나중에 import 만 하도록
한다 (세션 35 계획). 이로써 post-processing 의 테스트 표면이 atlas emit 과 독립이고,
exporter-core 는 기존 13 번 fixture 불변 상태에서 이번 세션을 합류 가능.

## 5. 테스트 보강 노트 (합리화)

- **palette 테스트 "팔레트 근접색"** : 처음 `decisions.length === 1` 로 예상했으나 k
  기본값 4 라 동일 픽셀 집합도 4 클러스터 중심이 모두 같은 팔레트로 수렴한다 → `length
  >= 1` + 모든 결정의 matched 이름 확인으로 수정.
- **color-lab "RGB vs Lab 경로 상이"**: 단색 입력은 std=0 → 두 경로 모두 target
  mean 으로 붕괴 (동일 결과). 두 색 (붉은색 + 푸른색) 섞어 std>0 을 만들어야 두 경로가
  비교 가능하다 — 픽셀 단위 diff 발생 확인.
- **Ajv strictRequired**: `if/then` 안에서 `required: ["slot_id"]` 만 쓰면 strict
  mode 가 거부한다. `properties: { slot_id: { type: "string" } }` 를 동반 선언.

## 6. 여파 — 나머지 세션

세션 33: 영향 없음 — AI 어댑터 metric hook 은 post-processing 과 독립.

세션 34: 영향 없음 — halfbody v1.3.0 파생 모션은 Cubism 전용.

**세션 35 (신규 예고)**: Stage 1 close/feather/uv-clip 완성 + exporter-core 의
`assembleWebAvatarBundle` 이 (선택) `applyPreAtlasNormalization` 을 texture emit 직전
훅으로 채택. 그때 비로소 파이프라인 전체가 "α 정제 → 색 정규화 → 팔레트 락 → atlas" 순서로
고정된다.

## 7. 완료 조건

| 항목 | 상태 |
|---|---|
| Lab 변환 + ΔE76 레퍼런스 테스트 | ✅ 10 tests |
| RGB/Lab 경로 both preserved | ✅ 기본값 rgb 유지 + Lab 옵션 |
| fit-to-palette k-means + ΔE 캡 | ✅ 결정론 + 원본 보존 |
| pre-atlas hook 함수 + report | ✅ target-only / palette-only / chain / identity / order-stability |
| 팔레트 카탈로그 스키마 + CI 검증 | ✅ checked=184 |
| docs/06 Lab vs OKLab 공개 질문 종결 | ✅ §16 closed → §17 runtime 표 |

세션 32 완료. 다음은 세션 33 (AI 어댑터 5차 — metric hook).
