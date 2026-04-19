# Session 41 — `@geny/exporter-pipeline` Stage 1 e2e 골든

- 날짜: 2026-04-19
- 스트림: Pipeline · Post-Processing · Platform/Infra
- 선행: 세션 26 (post-processing Stage 1 skeleton) · 35 (Stage 1 확장 `morphCloseAlpha`/`featherAlpha`/`clipToUvBox` + exporter-core `textureOverrides` 훅) · 38 (`@geny/exporter-pipeline` PNG decode/encode + `runWebAvatarPipeline`)
- 후속: 세션 42 (HTTP 팩토리 주입 또는 worker skeleton) · 43 (ADR 0005+)

## 1. 왜 이번 세션을 열었는가

세션 38 이 `@geny/exporter-pipeline` 을 도입하며 단위 수준의 결정론 회귀를 걸었다: "같은 템플릿 + 같은 기본 transform → 같은 sha256". 그러나 그 테스트는 **값을 고정하지 않았다** — `ra.files[i].sha256 === rb.files[i].sha256` 만 비교했기 때문에, pngjs 버전이 바뀌거나 `applyAlphaSanitation` 알고리즘이 조용히 드리프트하거나 exporter-core 의 bundle emit 형태가 바뀌거나 halfbody v1.2.0 의 `textures/base.png` 가 손상돼도 **양쪽 실행이 똑같이 잘못된 결과를 내기 때문에 통과**한다.

→ Foundation Exit 게이트 #2 (CI 회귀) 는 "어제와 오늘이 같다" 가 아니라 "알려진 양품과 같다" 여야 한다. Stage 1 파이프라인 전체의 byte-equal 을 테스트에 상수로 박고, 드리프트가 나면 테스트 rewriter 가 **의도적으로** 상수를 갱신하도록 강제한다.

## 2. 산출물

### 2.1 `packages/exporter-pipeline/tests/pipeline.test.ts`

기존 8 tests 뒤에 2 개 신규 test 추가 → **10 tests**.

#### Test 9 — 4 산출물 sha256 + bytes 고정

```ts
const GOLDEN_V1_2_0_PIPELINE: Readonly<Record<string, { sha256: string; bytes: number }>> = {
  "atlas.json":        { sha256: "1bc0cff15f87a7e226c502c9323fc2593b4d7576e83979be5015bf8ed0ed3465", bytes: 222   },
  "bundle.json":       { sha256: "13deaace6e9b22b9eaabd6b62192582dd9ed70b9623650df7420af73b68cae05", bytes: 630   },
  "textures/base.png": { sha256: "667a99bf67db740cd737bf58a2d05afb77ec0460cd541bafd45c48eb23edad58", bytes: 68    },
  "web-avatar.json":   { sha256: "035d12a2897c893580a624f5f9723c4d8635ecdf3c612f1136f6c606e4455810", bytes: 11887 },
};
```

- 각 산출물에 대해 `got.sha256 === expected.sha256` + `got.bytes === expected.bytes` 두 가지를 단언.
- 실패 시 메시지는 "pngjs/applyAlphaSanitation/exporter-core 중 어느 곳의 변경인지 확인 후 GOLDEN 상수 업데이트" — 4 개 축 중 어느 축이 움직였는지를 저자가 식별하고 의도했다면 상수를 갱신.
- `res.files.length === 4` 도 단언해, 파이프라인이 새로운 emit 을 추가한 경우에도 테스트가 fail → 저자가 명시적으로 golden map 에 새 엔트리를 추가하지 않으면 통과할 수 없음.

#### Test 10 — 원본 ≠ sanitation 증거

```ts
assert.notEqual(
  sanitized!.sha256,
  rawSrc.sha256,
  "파이프라인이 원본 PNG 를 그대로 통과시킴 — sanitation 이 무효",
);
```

세션 38 의 기본 경로는 `applyAlphaSanitation` (straight → α-threshold(8) → bbox) 을 적용하는데, 4×4 체커 픽스처가 아닌 실제 halfbody v1.2.0 `textures/base.png` 에서 이 sanitation 이 **실제 바이트를 건드려야 한다**. 원본과 sanitized 가 byte-equal 이 되는 순간(예: sanitation 함수가 no-op 이 되도록 버그가 생기면) 이 단언이 fail.

실측 sha256:
- 원본 `base.png` — 85 bytes, `f164334dc3985e3b8d95b71e59462c9c4f6d80c7ede23238c8759d9c4495a6db`
- 재인코딩된 sanitized — 68 bytes, `667a99bf67db740cd737bf58a2d05afb77ec0460cd541bafd45c48eb23edad58`

(17 bytes 차이는 pngjs 의 chunk 최소화 + sanitation 으로 완전 투명이 된 픽셀의 RGB=0 수렴으로 Deflate 가 더 압축된 결과.)

### 2.2 `progress/INDEX.md`

- §3 Post-Processing row: "Stage 1 (전체 + e2e 골든)" + 세션 41 인용.
- §3 Pipeline row: `@geny/exporter-pipeline` 8→10 tests, golden 언급.
- §3 Platform/Infra row: step 16 = exporter-pipeline **10** tests + 세션 41 인용.
- §4: 세션 41 row (chronological 순서).
- §6: step 16 헤더 "10 tests + halfbody v1.2.0 4 산출물 sha256 golden + 원본 vs sanitized 증거".
- §8: 세션 41 제거, 42/43 유지, 세션 44 신규 (Exit #1 브라우저 경로 자동화 candidate).

## 3. 설계 결정

### D1. sha256 을 테스트에 하드코딩 — 별도 골든 디렉토리 두지 않음

세션 09 의 exporter-core 번들 golden 은 `rig-templates/.../.golden/` 아래 실제 바이트 파일을 두고 비교한다. pipeline 산출물도 같은 패턴을 쓸 수 있지만:

- **산출물이 4 개뿐**이며 sha256 + bytes 숫자만 있으면 의미가 닫힌다. 실제 바이너리를 커밋할 필요가 없다.
- 파이프라인 출력은 halfbody v1.2.0 + 기본 sanitation 의 **derived artifact** — 원본 템플릿이 있고 파이프라인이 고정되어 있으면 재현 가능. 별도 bytes 를 저장하면 "원본 + 알고리즘" 과 "스냅샷" 두 군데를 동시에 갱신해야 해서 drift 위험만 생김.
- 테스트 파일 내 상수는 PR diff 에 100% 드러나 리뷰어가 "이 sha256 이 바뀌면 뭐가 바뀌는가" 를 코드 리뷰 흐름에서 바로 확인.

→ 4-artifact 규모에서는 in-tree 상수가 최선. 나중에 halfbody v1.3.0, fullbody, 여러 transform 프리셋으로 조합이 늘어나면 그때 디렉토리로 승격.

### D2. 원본 vs sanitized 불일치 증거를 별도 test 로

Test 9 만 있으면 "pipeline 이 이 sha256 을 생산한다" 는 증명되지만 "pipeline 이 실제로 원본 대비 뭔가를 했다" 는 증명되지 않는다. 가령 `applyAlphaSanitation` 이 실수로 identity 가 되어도 재인코딩된 PNG 가 원본과 byte-equal 이면 Test 9 의 상수도 원본과 일치하도록 "자동 고정" 됐을 것이다.

Test 10 은 이 함정을 닫는다: 둘이 같으면 실패. 상수 값에 의존하지 않고 **불변식**(sanitation 은 실제 픽셀을 건드려야 한다) 에 의존. 미래에 base.png 가 바뀌어 원본이 우연히 sanitized 와 같아지면(확률 미미하지만) fail — 그 자체가 "base.png 가 이미 깨끗해서 sanitation 이 할 일이 없다" 는 의도치 않은 상태 변화를 알려주는 신호.

### D3. 산출물 개수 고정 (`res.files.length === 4`)

미래 세션에서 `assembleWebAvatarBundle` 이 새로운 파일을 emit 하기 시작하면(예: thumbnail, audit log) 기존 sha256 검증은 여전히 pass 하지만 사용자는 그 추가 emit 을 인지해야 한다. 개수 단언이 있으면 새로운 emit 이 테스트 fail 을 일으켜 저자가 golden map 에 항목을 추가하도록 강제.

단순히 "len >= 4" 로 두지 않은 이유: "파이프라인이 의도치 않게 파일을 추가" 도 드리프트다.

### D4. 골든 drift 업데이트 절차를 주석으로 명시

```ts
/**
 * 값이 변해야 한다면 — 의도한 변경이라는 전제로 — 캡처 후 아래 상수를 업데이트.
 * (방법: `node --experimental-vm-modules` 로 runWebAvatarPipeline 돌린 뒤 files sha256).
 */
```

- 후속 저자가 테스트가 빨간색으로 바뀌었을 때 "그냥 값을 복붙하면 된다" 가 아니라 "**의도한 변경** 이라는 전제로" 갱신하라고 명시. drift 감지 장치를 drift 자동 승인 장치로 쓰지 못하게.
- 캡처 방법 한 줄 제공 — 절차를 저자 기억에 의존시키지 않음.

## 4. 검증

- `pnpm --filter @geny/exporter-pipeline run test` — 10 tests 전부 pass (~3s).
- `pnpm run test:golden` — **18 step 전부 pass**. step 16 이 8→10 tests 로 확장된 것만 차이.
- 테스트 골든 캡처: 레포 루트에서 임시 스크립트로 `runWebAvatarPipeline(loadTemplate("rig-templates/base/halfbody/v1.2.0"), outDir)` 돌린 뒤 `res.files.map({path, sha256, bytes})` 를 읽어 상수에 박음. 이후 스크립트는 커밋하지 않음(일회성).
- 원본 `textures/base.png` 의 raw sha256 은 `@geny/exporter-core` 의 `loadTemplate` 가 이미 계산해 `tpl.textures[0].sha256` 에 넣어줘서, 테스트는 외부 해시 계산 없이 `rawSrc.sha256` 을 그대로 사용.

## 5. 남은 항목

- halfbody v1.3.0 파이프라인은 세션 31 이후 실 base.png 가 아직 재저작되지 않아 v1.2.0 과 공유. v1.3.0 전용 base.png 가 추가되면 golden map 에 v1.3.0 블록을 병렬로 추가할 것.
- `applyAlphaSanitation` 의 옵션(close/feather/uvClip)을 켠 프리셋 각각에 대한 골든은 별도 세션에서 추가. 현재 4 개 기본 경로 숫자로 전체 회귀가 성립.
- pngjs 의 Deflate 는 결정론적이지만, zlib 구현이 Node 메이저 버전에 따라 사소한 바이트 차이를 낼 수 있다. 현재 레포는 `.nvmrc` 22.11 로 pin 됨 — CI 가 동일 Node 인 한 안전.

## 6. 다음 단계

§8 roadmap:
- **세션 42**: `@geny/orchestrator-service` 의 HTTP 팩토리 주입 실사용 또는 `apps/worker-*/` skeleton.
- **세션 43**: ADR 0005+ — physics-lint + migrator auto-patch 경계 명문화.
- **세션 44**: Foundation Exit #1 E 단계(브라우저 + Cubism Viewer) 를 happy-dom 스냅샷 또는 Playwright 최소 경로로 자동화.
