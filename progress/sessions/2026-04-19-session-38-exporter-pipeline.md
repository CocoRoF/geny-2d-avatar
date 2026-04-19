# 세션 38 — `@geny/exporter-pipeline` v0.1.0 — PNG decode/encode e2e

**날짜**: 2026-04-19
**앞선 세션**: [37 — v1.3.0 migrator auto-patch](./2026-04-19-session-37-v1.3.0-migrator-autopatch.md)
**관련 문서**: `docs/06 §4`, `docs/02 §13 Pipeline`
**관련 커밋**: 세션 35 (textureOverrides 훅 신설), 세션 26/29/32 (post-processing)

---

## 목표

세션 35 가 `assembleWebAvatarBundle` 에 열어 둔 `textureOverrides?: readonly TemplateTextureFile[]`
훅은 "exporter-core 는 PNG 디코딩에 의존하지 않는다" 는 **bytes-only 순수성** 원칙을 지키기
위한 의도적 빈 자리였다. 본 세션은 그 자리를 채우는 첫 참조 구현을 다른 패키지(`@geny/exporter-pipeline`)
에 둔다. 선택지는 두 가지였다: (a) 새 패키지 신설 + `pngjs` dep 허용, (b) `scripts/` 안의
단발 CLI. (a) 로 간다 — 재사용성/타입 export/테스트 러너 표준화 측면에서 이후 세션이 쉬워진다.

## 산출물

### `packages/exporter-pipeline/` 신설 (v0.1.0)

- `package.json` — `@geny/exporter-core` + `@geny/post-processing` (workspace:\*) + `pngjs ^7.0.0`
  런타임 의존성. `@types/pngjs ^6.0.5` devDep.
- `tsconfig.{,build,test}.json` — `metrics-http` 와 동일 패턴 (NodeNext, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`).
- `src/index.ts` — 세 공개 API:
  - `decodePng(buffer: Buffer): ImageBuffer` — `PNG.sync.read` 으로 8-bit RGBA 로 정규화된
    픽셀을 `Uint8ClampedArray` 로 **안전 복사** (pngjs 가 쥔 Node Buffer 공유 메모리와 분리).
    `premultiplied=false` (PNG 표준이 straight α).
  - `encodePng(image: ImageBuffer): Buffer` — `PNG.sync.write` (color type=6, bit depth=8).
    Deflate 블록이 결정론적이므로 동일 픽셀 입력 → 동일 바이트 (테스트로 확인).
  - `buildTextureOverride(src, transform)` — 한 `TemplateTextureFile` 을 decode → transform →
    encode → sha256/bytes 재계산. **`path` 는 원본 유지** — `assembleWebAvatarBundle` 의 경로
    보존 가드 (세션 35 D1) 를 통과시키기 위해 반드시 지켜야 함.
  - `runWebAvatarPipeline(template, outDir, { transform?, sanitation?, bundle? })` — 편의 진입점.
    `transform` 기본값은 `(img) => applyAlphaSanitation(img, opts.sanitation ?? {}).image` (Stage 1
    기본). `bundle` 로 `AssembleWebAvatarBundleOptions` 를 전달할 수 있되, `textureOverrides` 는
    본 pipeline 이 덮어쓴다.
- `tests/pipeline.test.ts` — 8 tests:
  1. decode/encode 라운드트립 (checker 픽스처, 픽셀 deep-equal).
  2. encode 결정론 (동일 픽셀 → Buffer.equals).
  3. 실 `halfbody/v1.2.0/textures/base.png` 디코드 — width/height>0, length 일치, premultiplied=false.
  4. `buildTextureOverride` identity transform — path 보존 + sha256 hex 64자 + 결정론.
  5. default pipeline e2e — `bundle.json` / `web-avatar.json` / `atlas.json` emit + 원본 텍스처
     path 가 번들 files 에 등록.
  6. 사용자 transform 이 각 텍스처마다 호출됨 (count 검증).
  7. pipeline 결정론 — 동일 입력 2회 실행 후 files[] 의 path/sha256/bytes 전부 일치.
  8. 파괴적 transform (α=0) 에서도 path 보존 가드 통과 — 가드는 path 만 보며 픽셀은 자유.
- `README.md` — 1-screen 사용 예 + API 표 + 설계 결정 3줄.

### `@geny/exporter-core` index 보강

`TemplateTextureFile`/`TemplateAtlasDoc`/`TemplateAtlasTextureEntry`/`TemplateAtlasSlotEntry` 타입을
패키지 export 에 추가. 기존에는 `loader.ts` 내부 타입이었는데, 소비 패키지(`exporter-pipeline`)
가 훅의 파라미터 타입을 정확히 재생성하려면 export 가 필요하다. 기능 변경 없음 (타입 re-export 만).

### `scripts/test-golden.mjs` step 16

`{ name: "exporter-pipeline tests", run: runExporterPipelineTests }` 추가. runner 는
exporter-core + post-processing 선빌드 후 `pnpm -F @geny/exporter-pipeline test`. 헤더 주석의
15 step 소개에 step 16 줄 추가 (15→**16 step**).

### `progress/INDEX.md`

- §3 Pipeline 행: `@geny/exporter-pipeline v0.1.0` 신설 포함 (decodePng/encodePng/
  buildTextureOverride/runWebAvatarPipeline + 8 tests).
- §3 Platform/Infra 행: 세션 번호 38 포함, **16 step**, step 16 = exporter-pipeline 8.
- §4: 세션 38 행 추가.
- §6: 릴리스 게이트 갱신 (16 step, step 16 등록).
- §8: 세션 38 제거, 세션 41 (pipeline 기반 e2e 골든) 신규.

---

## 결정 (D1~D4)

### D1 — 왜 `@geny/exporter-core` 에 pngjs 를 넣지 않고 새 패키지를 만들었는가
세션 35 는 의도적으로 훅만 냈다 — exporter-core 자체는 "템플릿을 읽어 결정론적 JSON + 원본
바이트 복사" 만 하고, PNG/WebP 파싱은 호출자 몫. 이 경계가 지켜져야 브라우저/worker 배포에서
Node 전용 이미지 라이브러리를 끌고 들어가지 않을 수 있다 (web-avatar 가 exporter-core 를
트리-쉐이킹으로 끌어다 쓸 수도 있음). 따라서 `@geny/exporter-pipeline` 은 **Node 전용 서비스
계층** 으로 따로 두고, core 는 순수성을 유지한다.

**Why:** 브라우저 번들과의 분리 + 미래 `sharp`/`canvas` 기반 대체 pipeline 의 가능성.
**How to apply:** 이미지/폰트/오디오 같은 바이너리 디코딩이 필요한 변환은 별도 `pipeline` 류
패키지에 격리. exporter-core 에 `pngjs`/`sharp` 류는 절대 dependency 로 들어가지 않는다.

### D2 — `pngjs` 를 선택한 이유
`pngjs@7` 는 0-dep pure-JS PNG codec 으로 Node 22 에 그대로 붙는다. native 의존성(sharp 의
libvips) 이 없어 CI/Docker 가 단순. API 가 단순(`PNG.sync.read`/`write`). Deflate 스트림이
결정론적 — 같은 픽셀 입력에 같은 바이트를 낸다 (테스트 case "encode 결정론" 이 확인). 장래
압축률/성능 요구가 생기면 `sharp` 기반 pipeline 을 **같은 훅으로** 병행 구현 가능.

### D3 — `Buffer` → `Uint8ClampedArray` 복사 이유
`pngjs` 는 `png.data` 를 Node Buffer 로 채운다. 이를 `new Uint8ClampedArray(buffer)` 으로
감싸기만 하면 underlying 메모리를 공유해 이후 post-processing 이 제자리 변형 시 pngjs 내부
상태/원본 PNG 메모리까지 건드릴 위험이 있다. 본 모듈은 `new Uint8ClampedArray(byteLength)` +
`.set(png.data)` 으로 **바이트 복사** 를 강제한다. post-processing 의 `cleanAlphaNoise` 등이
in-place 인지 out-of-place 인지 알 필요 없게 경계에서 안전판을 친다.

**Why:** 알 수 없는 downstream 의 in-place 변형으로부터 pngjs 내부/원본 바이트를 보호.
**How to apply:** 외부 라이브러리에서 받은 바이트를 내부 타입으로 포장할 때는 기본은 **복사**.
성능이 문제될 만큼 큰 이미지는 Foundation 범위 밖.

### D4 — `path` 보존은 `buildTextureOverride` 가 책임진다
세션 35 의 `textureOverrides` 가드는 `path` 가 `template.textures` 에 없으면 throw. pipeline
헬퍼가 원본 `TemplateTextureFile.path` 를 그대로 복사해 새 override 를 만들어 주면 호출자는
가드를 의식할 필요가 없다. `transform` 은 픽셀만 다루고 경로는 건드리지 않는다. 테스트 8
(파괴적 transform) 가 이 경계를 고정한다.

---

## 메트릭 / 카운트 요약

| 항목 | 이전 | 이후 | 비고 |
|---|---|---|---|
| test-golden 단계 수 | 15 | **16** | step 16 = exporter-pipeline |
| 워크스페이스 패키지 | 10 | **11** | `@geny/exporter-pipeline` 추가 |
| exporter-pipeline tests | 0 | **8** | pipeline.test.ts |
| exporter-core src/index.ts export | — | +4 types | TemplateTextureFile/TemplateAtlasDoc/… |
| validate-schemas checked | 186 | 186 | — |
| post-processing tests | 111 | 111 | — |
| exporter-core tests | 95 | 95 | — |

---

## 다음

세션 38 완료. 다음은 §8 예고:
- 세션 39: `@geny/metrics-http` + `@geny/exporter-pipeline` 소비 최초 서비스 bootstrap —
  `services/orchestrator/` 또는 `apps/worker-*/` 에 `orchestrate(...)` + `createMetricsServer`
  + `runWebAvatarPipeline` 이 합쳐진 얇은 엔트리포인트.
- 세션 40: `scripts/rig-template/physics-lint.mjs` 또는 docs/03 §6.2 physics.json 저자 체크리스트.
- 세션 41: pipeline 기반 halfbody v1.2.0 번들 실 텍스처 골든 (Stage 1 e2e 현실화).
