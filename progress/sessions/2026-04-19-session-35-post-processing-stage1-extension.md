# 세션 35 — Post-Processing Stage 1 확장 (close / feather / uv-clip + exporter 훅)

- 날짜: 2026-04-19
- 브랜치/커밋: main · 세션 35
- 워크스트림: **Post-Processing & Fitting** (`docs/14 §9`) + **Pipeline** (exporter-core 훅)
- 로드맵: docs/06 §4.2 step 3/4/5 · `progress/INDEX.md §8` 세션 35 예고

## 1. 목표

세션 26 가 Stage 1 skeleton (premult 라운드트립 + threshold + bbox) 을 세웠고,
세션 32 는 Stage 3 Lab\* + palette + atlas-hook 을 완성했다. 그러나 docs/06 §4.2 의
**step 3 morphological close / step 4 alpha feather / step 5 UV clip** 은 라이브러리 미구현
이었고, `assembleWebAvatarBundle()` 은 텍스처 바이트를 그대로 복사할 뿐 post-processing
훅이 없었다. AI 생성 파츠의 "유령 픽셀 / 소구멍 / UV 박스 초과" 를 자동 정리하는
기초 도구가 빠져 있는 상태.

이번 세션은 세 primitive (`morphCloseAlpha`/`featherAlpha`/`clipToUvBox`) 를 추가하고,
`applyAlphaSanitation` 파이프라인에 opt-in 옵션으로 통합한다. 그리고 exporter-core 의
`assembleWebAvatarBundle` 에 **`textureOverrides?`** 옵션을 추가해 호출자가 디코드→
post-processing→재인코드한 `TemplateTextureFile[]` 을 텍스처 emit 직전에 주입할 수 있게 한다.
이 구조는 exporter-core 의 "bytes-only" 순수성 (PNG 디코드 의존성 0) 을 유지하면서
post-processing 라이브러리 층과 서비스 층 (worker/api) 의 경계를 깔끔히 나눈다.

```
호출자 (worker/api)                               exporter-core (pure bytes)
  ┌─────────────────────────────────────┐
  │ tpl.textures[] = 원본 PNG/WebP bytes  │
  │     ↓ decode (PNG → RGBA8)          │
  │ ImageBuffer[]                        │
  │     ↓ applyAlphaSanitation(...,      │
  │         { close, feather, uvClip })  │
  │     ↓ applyPreAtlasNormalization(...)│
  │     ↓ encode (RGBA8 → PNG)          │
  │ TemplateTextureFile[] (동일 path)    │──→ assembleWebAvatarBundle(tpl, dir, {
  └─────────────────────────────────────┘        textureOverrides: [...]
                                                })
```

## 2. 산출물 체크리스트

- [x] `packages/post-processing/src/morph-close.ts` — `morphCloseAlpha(img, { radius? })`. Binary dilate(α>0, r) → erode(r) → 새로 solid 가 된 픽셀에 α=255 + α-가중 이웃 RGB 평균. radius 0~4 가드. `premultiplied=true` 입력 throw.
- [x] `packages/post-processing/src/feather.ts` — `featherAlpha(img, { radius? })`. 2-pass separable box blur 알파 전용 (kernel size = 2r+1). RGB 불변. radius 0~4 가드. `premultiplied=true` 입력 throw. docs/06 §4.2 step 4 `feather_2px` 대응 (default radius=2).
- [x] `packages/post-processing/src/uv-clip.ts` — `clipToUvBox(img, bbox)`. 박스 밖 α=0. premult 면 RGB=0. 정수 좌표 / 음수 크기 가드. 이미지 완전 밖 박스 → 전부 투명. 영교집합 (`width=0` 등) 지원.
- [x] `packages/post-processing/src/pipeline.ts` — `AlphaSanitationOptions` 에 `close?`/`feather?`/`uvClip?` 추가. 순서: **straight→threshold→close→feather→uvClip→bbox**. 옵션 opt-in (키가 없으면 해당 단계 skip).
- [x] `packages/post-processing/src/index.ts` — 심볼 재노출 (`morphCloseAlpha`/`featherAlpha`/`clipToUvBox` + `MorphCloseOptions`/`FeatherOptions`).
- [x] `tests/morph-close.test.ts` — 8 tests (단일 픽셀 구멍 radius=1 / 3×3 구멍 radius=1 미충전·radius=2 충전 / 완전 투명·완전 solid / radius=0 no-op / premult throw / radius 가드 / 결정론).
- [x] `tests/feather.test.ts` — 7 tests (radius=0 no-op / 내부 α 보존 / 에지 블렌딩 / RGB 불변 / premult throw / radius 가드 / 결정론).
- [x] `tests/uv-clip.test.ts` — 9 tests (안/밖 분리 / RGB 보존 / premult RGB=0 / 완전 밖 박스 / 이미지 외부로 튀어나옴 / width=0 / 소수점 throw / 음수 throw / 결정론).
- [x] `tests/pipeline-golden.test.ts` — +2 tests (close+feather+uvClip 조합 순서 회귀 / 옵션 없이 세션 26 기존 동작 유지).
- [x] `packages/exporter-core/src/web-avatar-bundle.ts` — `AssembleWebAvatarBundleOptions.textureOverrides?: readonly TemplateTextureFile[]`. 주입 시 `template.textures` 대신 사용. path 가 원본에 없으면 throw (경로 보존 가드).
- [x] `packages/exporter-core/tests/web-avatar-bundle.test.ts` — +2 tests (overrides 로 sha256 교체 검증 / path mismatch throw).
- [x] `scripts/test-golden.mjs` — step 13 헤더 갱신 (85 → 111 tests + close/feather/uv-clip 언급).

## 3. Done 정의 / 검증

| 지표 | 값 |
|---|---|
| post-processing 테스트 | **111 pass / 0 fail** (85 → 111, +26) |
| exporter-core 테스트 | **95 pass / 0 fail** (93 → 95, +2) |
| `validate-schemas` | **checked=186 / failed=0** (스키마 변경 없음) |
| `pnpm run test:golden` | **14 step 전부 pass** (step 13 확장 포함) |
| 기존 회귀 | halfbody v1.2.0 Cubism/web-avatar/bundle-manifest golden · aria 번들 · license-verifier · ai-adapter-core 68 · ai-adapters-fallback 53 전부 불변 |

```
$ pnpm --filter @geny/post-processing run test | tail
ℹ tests 111  ℹ pass 111  ℹ fail 0

$ pnpm --filter @geny/exporter-core run test | tail
ℹ tests 95   ℹ pass 95   ℹ fail 0

$ node scripts/validate-schemas.mjs | tail
[validate] checked=186 failed=0

$ pnpm run test:golden | tail
[golden] ✅ all steps pass
```

## 4. 설계 결정 (D1–D5)

### D1. morph close 는 **binary** — α 그라데이션 보존이 목적이 아님
세션 26 의 `cleanAlphaNoise` 가 이미 작은 α 값을 0 으로 떨어뜨린 후 호출되는 경로이므로,
close 시점에는 대부분의 "소구멍" 이 이미 완전 투명(α=0) 으로 표현되어 있다. 이진 마스크
`solid = (α>0)` 로 dilate+erode 하고, 새로 solid 가 된 픽셀의 α 는 255 로 세팅한다.
RGB 는 반경 r 이내의 solid 이웃들의 α-가중 평균으로 보간. 이것이 "AI 가 중간에 파놓은
고스트 구멍을 채우는" 의도를 가장 단순하게 구현.

> 바꿀 여지: 반투명 그라데이션을 보존하는 grayscale close 가 필요하면 별도 primitive
> (`morphCloseAlphaGray`) 로 추가. 현재는 YAGNI.

### D2. `maxHolePx` 는 **radius 로 간접 제어** — flood-fill 미구현
docs/06 §4.2 step 3 은 "의도된 구멍은 보존해야 하므로 슬롯별로 `max_hole_px` 한도" 라고
명시. 제대로 구현하려면 close 후 새로 solid 가 된 픽셀들의 연결 컴포넌트를 flood-fill 로
찾아 크기 초과 컴포넌트는 되돌려야 한다. 하지만 radius=1 SE (3×3) 자체가 이미 1–4 픽셀
구멍만 닫기 때문에, radius 를 작게 유지하는 것만으로 "작은 구멍만 메우고 큰 구멍은 보존"
을 달성할 수 있다. radius 4 까지 제한하는 것도 이 맥락.

> 바꿀 여지: 더 공격적인 close 가 필요하거나 슬롯별 정밀 제어가 요구되면 flood-fill 기반
> `maxHolePx` 를 후속 세션에서 추가. ~30 줄 BFS 로 가능.

### D3. feather 는 **알파 전용** box blur — RGB 는 건드리지 않음
"edge feather" 의 목적은 *외곽 α 램프* 를 부드럽게 만드는 것이지 "색이 경계 밖으로
번지는" 효과가 아니다. RGB 를 블러하면 straight-alpha 공간에서는 경계 밖 RGB (원래
의미 없는 값) 가 경계 안쪽으로 오염될 수 있다. 렌더 타임에 premultiplied 공간에서
섞이는 것이 올바른 처리.

추가로 **2-pass separable box blur** 로 구현: 수평 pass → 수직 pass. 단일 2D 컨볼루션
대비 복잡도 O(n·r) → O(n·r/r) = O(n) 이지만 여기선 픽셀 수가 작아 의미 없다. 오히려
"1-pass 가우시안 근사" 의 시각 품질을 얻기 위해 2-pass 를 택했다 (박스 블러를 두 번 돌리면
삼각 분포에 가까워진다 — 중심극한 정리).

### D4. UV clip 은 **정수 pixel 좌표** — 서브픽셀 보간 없음
`parts/<slot>.meta.json` 의 `uv_box` 는 정수 픽셀 좌표로 기록된다 (docs/04 §5). clipToUvBox
도 정수만 허용 (소수점 입력 시 throw). 서브픽셀 경계가 필요하면 해당 경계는 feather 에게
맡기는 것이 역할 분리상 옳다.

### D5. exporter-core 는 **PNG 디코드 의존성 0** — `textureOverrides` 가 경계
`assembleWebAvatarBundle` 에 `applyPreAtlasNormalization` 을 **직접** 결합하면 exporter-core
가 PNG 디코더 (`pngjs` 등) 에 의존하게 된다. 이는 (1) 번들 크기 증가, (2) 서버 외 환경
(Lambda, edge worker) 에서의 제약, (3) 테스트 표면적 증가를 의미한다.

대안: **`textureOverrides?: readonly TemplateTextureFile[]`** 옵션을 노출. 호출자 (worker/api)
가 decode → post-processing → encode 체인을 책임지고, 결과를 같은 타입으로 다시 주입.
exporter-core 는 주입 받은 bytes 를 그대로 파일로 쓰고 sha256/size 를 감사할 뿐이다.
경로가 원본과 달라지면 번들 매니페스트의 슬롯 참조가 깨지므로 **path 일치 가드** 를 추가.

이 패턴은 "pure core + impure shell" 아키텍처의 교과서적 적용: exporter-core 는 순수하게
유지되고, 실제 이미지 처리 파이프라인은 세션 38 에서 별도 패키지 `@geny/exporter-pipeline`
또는 scripts 데모로 구성할 수 있다.

> 바꿀 여지: (a) `preAtlasTransform?: (decoded: ImageBuffer[]) → ImageBuffer[]` 형태로
> 함수형 훅을 노출하고 내부에서 decode/encode — 하지만 PNG dep 도입 비용이 크다. (b)
> `@geny/exporter-pipeline` 별도 패키지 — 추천 (세션 38).

## 5. 여파 — 나머지 세션

- **세션 36 (worker/api `/metrics` HTTP)**: 영향 없음. 관측 HTTP 층은 별개.
- **세션 37 (rig v1.3.0 migrator TODO 소진)**: 영향 없음.
- **세션 38 (신규 예고)**: `textureOverrides` 훅의 실제 e2e 시연 — `@geny/exporter-pipeline`
  패키지 신설 또는 `scripts/` 에 PNG decode → post-processing → encode 데모를 두어
  세션 35 의 계약이 실제 파이프라인에서 작동함을 증명.

## 6. 완료 조건

| 항목 | 상태 |
|---|---|
| morphCloseAlpha (docs/06 §4.2 step 3) | ✅ binary dilate+erode + 이웃 RGB 보간 |
| featherAlpha (docs/06 §4.2 step 4) | ✅ 2-pass separable box blur 알파 전용 |
| clipToUvBox (docs/06 §4.2 step 5) | ✅ 박스 밖 α=0 + premult RGB=0 |
| applyAlphaSanitation 옵션 통합 | ✅ `close?`/`feather?`/`uvClip?` opt-in |
| assembleWebAvatarBundle `textureOverrides?` | ✅ path 보존 가드 포함 |
| post-processing 85 → 111 tests | ✅ +26 |
| exporter-core 93 → 95 tests | ✅ +2 |
| golden 14 step 전부 pass | ✅ |

세션 35 완료. 다음은 세션 36 (worker/api `/metrics` HTTP 노출).
