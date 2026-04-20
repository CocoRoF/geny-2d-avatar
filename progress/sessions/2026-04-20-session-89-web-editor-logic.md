# 세션 89 — `@geny/web-editor-logic` 단일 소스 추출

**날짜**: 2026-04-20
**주제**: web-editor Stage 3 선행 — `categoryOf` / `categorize` / `CATEGORY_ORDER` 28줄 복붙을 신규 workspace 패키지 `@geny/web-editor-logic@0.1.0` 으로 승격, index.html + e2e-check.mjs 가 동일 dist 를 공유하도록 전환.

---

## 문제

세션 81 에서 도입된 `categoryOf(role)` + `categorize(parts)` + `CATEGORY_ORDER` UX 규칙 (docs/09 §4.3.1) 은 두 곳에 **바이트 단위로 같은 28줄** 이 복붙돼 있었다:

1. `apps/web-editor/index.html` 인라인 `<script type="module">` — 브라우저에서 사이드바 그룹 + 카테고리 라벨 렌더.
2. `apps/web-editor/scripts/e2e-check.mjs` — Node happy-dom 테스트에서 Face/Hair/Body/Accessory 카디널리티 스냅샷 어서션.

세션 81 D4 에서 이 중복은 "런타임/모듈 시스템 차이로 공유 어려움, 28 라인 복붙 + e2e drift 탐지" 로 **명시적 수용** 되었지만 세션 87 의 fullbody 확장에서 3줄 업데이트를 양쪽에 2번 반영해야 했고 (`role === "limb"` / `clothing` / `accessory` exact-match) — Stage 3 렌더러 합류 이후에 `PartLike` 타입·렌더링 메타데이터 계산 등 공유 로직이 증가할 예정이라 **지금 추출하지 않으면 drift 비용이 누적**.

원래 세션 90 후보였지만 세션 87~88 의 관측 축 완결 후 cluster access 도 여전히 미확보라 Stage 3 kick-off 선행 step 으로 조기 실행.

---

## 변경

### `packages/web-editor-logic/` (신규)
- `package.json` — `@geny/web-editor-logic@0.1.0`, `type: module`, `exports` `.` + `./category`, workspace-private, devDep `typescript@^5.6.3 + @types/node@^20.11.30`, zero runtime dep.
- `tsconfig.json` — `packages/web-avatar` 레이아웃 1:1 복제 (`ES2022` + `NodeNext` + strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + `DOM` lib 포함 — 브라우저에서도 로드하기 위함).
- `tsconfig.build.json` / `tsconfig.test.json` — `rootDir=src` / `rootDir=./` 분리 (exclude 규칙 동일).
- `src/category.ts` — `type Category = "Face"|"Hair"|"Body"|"Accessory"|"Other"`, `CATEGORY_ORDER: readonly Category[]` ("Other" 제외 4 값, UX 순서 불변식), `PartLike {role, slot_id}` 최소 인터페이스, `categoryOf(role): Category` (세션 81/87 prefix + exact-match 규칙 원문 보존), `categorize(parts): Map<Category, P[]>` (slot_id 정렬 포함).
- `src/index.ts` — `export { categoryOf, categorize, CATEGORY_ORDER } from "./category.js"` + type re-export.
- `tests/category.test.ts` — **37 tests / 7 suites** (상세는 §검증).

### `apps/web-editor/scripts/prepare.mjs`
- `build @geny/web-editor-logic` step 추가 (세션 81 의 web-avatar 빌드와 동일 spawnSync 패턴).
- `copy @geny/web-editor-logic dist → public/vendor/web-editor-logic` 복사 step 추가. 정적 서버로 서빙되는 ESM 을 브라우저가 `import` 할 수 있도록 dist 를 `public/vendor/web-editor-logic/index.js` 로 배치.

### `apps/web-editor/index.html`
- 인라인 스크립트의 `CATEGORY_ORDER` 상수 + `categoryOf(role)` 22줄 + `categorize(parts)` 12줄 = 37줄 삭제.
- `<script type="module">` 최상단에 한 줄 import 추가: `import { CATEGORY_ORDER, categorize } from "./public/vendor/web-editor-logic/index.js"`.
- 전체 변경 체감: +1줄 import / -37줄 로직 / 기존 `renderParts(groups)` 호출부는 무변경.

### `apps/web-editor/scripts/e2e-check.mjs`
- 모듈 레벨 `CATEGORY_ORDER` 상수 삭제.
- `runCategorize` 내부의 인라인 `categoryOf` 28줄 삭제.
- 대신 `pathToFileURL(resolve(repoRoot, "packages/web-editor-logic/dist/index.js"))` 로 dynamic import → `{categoryOf, CATEGORY_ORDER}` 구조 분해.
- `runCategorize` 시그니처를 `async` 로 전환, caller 를 `await runCategorize(...)` 로 수정 (1 줄 변경).

### `scripts/test-golden.mjs`
- STEPS 배열 27→**28** 로 확장.
- 새 step `web-editor-logic tests` 를 `observability-snapshot-diff parser tests` 와 `web-editor e2e` 사이에 삽입 — e2e 는 logic dist 에 의존하므로 logic unit tests 를 먼저 실행해 실패 시 원인 특정 시간을 단축.
- `runWebEditorLogicTests()` 구현: `pnpm -F @geny/web-editor-logic test`.

### `progress/INDEX.md`
- §3 Frontend 행 말미에 세션 89 블록 추가.
- §4 세션 로그 테이블에 `| 89 | 2026-04-20 | ... |` 행 삽입 (세션 88 위).
- §8 로드맵 재배열: 세션 90 후보(Stage 3) 가 이제 바로 실행 가능, 세션 91=staging(cluster 대기), 세션 92=Runtime prep.

---

## 검증

- `pnpm install`: 16 workspace projects detected, no missing deps.
- `pnpm -F @geny/web-editor-logic build`: `tsc -p tsconfig.build.json` clean.
- `pnpm -F @geny/web-editor-logic test`: **37 tests / 7 suites / 0 fail / 80ms**.
  - suite 1 — halfbody v1.2.0/v1.3.0 roles: 19 개 role → Category 매핑 직접 검증.
  - suite 2 — fullbody generic roles: `limb`/`clothing`/`accessory` exact-match 3종.
  - suite 3 — Other fallback: 미지 role + empty string.
  - suite 4 — prefix boundaries: `eye`/`hair`/`mouth`/`cloth`/`arm` (접미사 `_` 없으면) → Other + `accessory` (exact) → Accessory.
  - suite 5 — categorize: 그룹 분리 / slot_id 정렬 / 빈 입력 → 빈 map / Other 유지.
  - suite 6 — CATEGORY_ORDER: Face→Hair→Body→Accessory 순서 + Other 제외 불변식.
  - suite 7 — 실 halfbody 29 parts 카디널리티 회귀 (Face=16/Hair=4/Body=7/Accessory=2).
- `pnpm -F @geny/web-editor test`: e2e 가 동일 dist 를 import 해 halfbody + fullbody 양쪽 카테고리 어서션 pass, DOM ready payload 2 템플릿 확인.
- `pnpm run test:golden`: **28/28 step all pass** (신규 step 은 ~580ms, 기존 step 27 web-editor e2e 는 ~2초 불변).
- validate-schemas `checked=244` 불변 (스키마 무변).

---

## 주요 결정축

### D1. 별도 패키지 vs `packages/web-avatar/src/editor/`
`@geny/web-avatar` 는 docs/01 §8 계약상 "렌더러 의존성 없음 + 순수 런타임 Custom Element" 이므로 에디터 UX 로직(카테고리 규칙)을 이 패키지에 혼입하면 계약 위반. 별도 `@geny/web-editor-logic` 패키지로 격리해 미래 `@geny/web-editor-renderer` / `@geny/web-editor-inspector` 도 동일 경계 위에 쌓음.

### D2. 브라우저 + Node 동시 소비
빌드 산출물은 표준 ESM `.js` (NodeNext + ES2022) 이라 브라우저 `<script type="module">` 과 Node `import()` 양쪽에서 **동일 바이트** 를 로드. bundler(vite/webpack) 도입 불필요 — Foundation zero-runtime-dependency 규칙 준수. `lib: ["ES2022", "DOM"]` 로 브라우저 타입 API 도 type-check 에 포함.

### D3. 정적 서버 서빙 경로
`apps/web-editor/public/vendor/web-editor-logic/index.js` 에 복사해 `./public/vendor/web-editor-logic/index.js` 상대 경로로 import. 대안 (pnpm workspace symlink `node_modules/@geny/web-editor-logic/dist/...` 를 serve.mjs 가 서빙) 은 `appRoot` 기반 path escape 가드 (`full.startsWith(appRoot)`) 를 망가뜨림 — 복사가 안전하고 prepare.mjs 단독으로 완결.

### D4. `runCategorize` async 전환
Dynamic import 는 Promise 반환. caller 한 줄(`await runCategorize(...)`) 수정만으로 완결, e2e 순차 실행 의존성 불변. static import 로 전환 가능하지만 `logicDist` 경로가 build 이후에만 존재하므로 `prepare.mjs` 실행 이전 import 시 ENOENT — dynamic import 로 lazy 로딩.

### D5. 테스트 커버리지 단위 승격
세션 87 e2e 가 이미 halfbody=29 / fullbody=38 카디널리티를 잡고 있었지만 unit test 로도 halfbody 29 parts 재현 → rig-template 편집 시 **e2e 전에 unit tests 가 먼저 깨져** 원인 특정 비용 감소. fullbody 38 는 실 `parts/*.spec.json` 로딩 의존이 커 unit 에는 스킵, e2e 에만 유지.

### D6. `CATEGORY_ORDER` 를 `readonly Category[]` 로 narrow
`as const` 로 narrow 하면 union literal 만 포함 가능 → Other 가 실수로 포함되면 compile-time error. UX 순서에 Other 가 침투하면 Unknown 라벨로 사이드바에 드러나 사용자에게 "파츠 카테고리 규칙에 구멍" 신호를 바로 줄 수 있는데, 현재 Foundation 계약에서는 Other=0 불변식이 강제이므로 타입 레벨에서도 차단.

### D7. `PartLike {role, slot_id}` 최소 필드
실제 `bundle.meta.parts[]` 객체는 `{slot_id, role, z_order, uv_box, deformation_parent, ...}` 로 훨씬 풍부. `categorize` 가 쓰는 2 필드만 interface 로 노출 → 다른 프로젝트 (editor-renderer, inspector) 가 자체 part 타입을 그대로 주입 가능 (structural typing). 소비자 타입을 제약하지 않음.

### D8. `runWebEditorLogicTests` step 배치 (23.5→24 위치)
로직 unit 회귀가 먼저 실패해야 e2e 로그 읽기 전에 원인 특정 가능. e2e 가 실패했을 때 "logic 코드 vs 템플릿 스냅샷 중 어느 쪽?" 이분법 판정에 걸리는 시간을 단축. 실패 시 `[golden] ✖ web-editor-logic tests` 가 먼저 뜨면 prepare/serve 쪽을 뒤질 필요 없음.

---

## 파일 변경 요약

| 상태 | 경로 |
|---|---|
| 신규 | `packages/web-editor-logic/package.json` |
| 신규 | `packages/web-editor-logic/tsconfig.json` |
| 신규 | `packages/web-editor-logic/tsconfig.build.json` |
| 신규 | `packages/web-editor-logic/tsconfig.test.json` |
| 신규 | `packages/web-editor-logic/src/category.ts` |
| 신규 | `packages/web-editor-logic/src/index.ts` |
| 신규 | `packages/web-editor-logic/tests/category.test.ts` |
| 수정 | `apps/web-editor/index.html` (-37줄 / +2줄 import) |
| 수정 | `apps/web-editor/scripts/prepare.mjs` (+2 step) |
| 수정 | `apps/web-editor/scripts/e2e-check.mjs` (dynamic import, async) |
| 수정 | `scripts/test-golden.mjs` (STEPS 27→28, new runner) |
| 수정 | `progress/INDEX.md` (§3 Frontend / §4 세션 로그 / §8 로드맵) |
| 신규 | `progress/sessions/2026-04-20-session-89-web-editor-logic.md` |

---

## 남긴 숙제

- **세션 90**: web-editor Stage 3 kick-off — `@geny/web-editor-renderer` 스캐폴드 + 중앙 Preview Stage 에 첫 draw. `@geny/web-editor-logic` 의 `PartLike` 타입을 확장해 `{z_order, uv_box, deformation_parent}` 등 렌더링 필요 필드를 공유 인터페이스로 승격할 시점.
- **세션 91**: 실 staging 배포 (cluster access 확보 시). 여전히 대기.
- **세션 92**: Runtime 전환 선행.
- **Inspector 편집 모드**: 현재 read-only kv 유지. `packages/web-editor-logic` 에 `renderInspector(part)` 같은 renderer-agnostic helper 를 얹어 복붙 재발 차단.
- **chibi / masc_halfbody family**: 스키마 enum 에만 등록. 저작 완료 시 `TEMPLATES[]` + `TEMPLATE_EXPECTATIONS` 추가만으로 양 소비자 (index.html + e2e-check) 에서 즉시 동작.
