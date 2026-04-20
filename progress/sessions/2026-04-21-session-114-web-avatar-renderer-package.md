# 세션 114 — `@geny/web-avatar-renderer` 신규 패키지 (렌더러 인터페이스 선행 분리)

- **날짜**: 2026-04-21
- **선행**: 세션 113 (ADR 0007 Draft — 렌더러 기술 선택. Decision 공란으로 사용자 리뷰 대기).
- **상태**: ✅ completed.
- **변경 범위**: `packages/web-avatar-renderer/` (신규), `packages/web-editor-renderer/{package.json,src/renderer.ts}`, `scripts/test-golden.mjs`, `progress_0420/{INDEX,PLAN,SUMMARY}.md`, 세션 문서.
- **워크스트림**: Frontend / Platform.

## 1. 동기

ADR 0007 (세션 113) 는 4 가지 확정 경로를 열어놓은 Draft — Decision 은 사용자/PM 대기 상태다. 자율 모드에서는 그 안에서 **경로 A/D/E 어디로 확정되어도 버려지지 않는 작업** 만 골라 전진할 수 있다.

후보는 "렌더러 인터페이스 패키지 선행 분리" — `packages/web-editor-renderer/src/renderer.ts:15-54` 에 이미 잘 정의된 duck-typed 계약(`RendererPart` / `RendererBundleMeta` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` / `RendererHost`) 을 상위 패키지 `@geny/web-avatar-renderer` 로 승격 분리한다. 세션 91 시점에는 renderer 구현체 하나뿐이라 정의가 구현체 옆에 있어도 OK 였지만, Option E(하이브리드 PixiJS→자체 WebGL2) / Option A(PixiJS 고정) / Option D(자체 WebGL2) 어디로 가도 **두 개 이상의 구현체 패키지가 동일 계약을 의존**할 가능성이 열렸다. 지금 빼내면 미래 옵션 확정 시 renderer-impl 간 타입 참조 방향이 깨끗하게 `web-avatar-renderer → 각 impl` 로 흐른다.

## 2. 변경

### 2.1 `packages/web-avatar-renderer/` (신규 — 15 파일)

- **`package.json`** — `@geny/web-avatar-renderer@0.1.0`, `workspace:*` 스타일 TS ESM. exports `.` + `./contracts`. 의존 없음(pure deps), devDep 는 `@types/node` + `typescript` 만.
- **`tsconfig.{build,test}.json`** — 기존 `web-editor-renderer` 와 동일 형식(strict + noUnchecked + exactOptional).
- **`src/contracts.ts`** — 5 인터페이스 + 2 타입 가드:
  - `RendererPart` / `RendererBundleMeta` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` / `RendererHost` — `renderer.ts` 에서 bit-by-bit 이식 (필드 이름/타입 동일, readonly 강화 — `parameters[].{id,range,default}` 를 모두 readonly 로 승격).
  - `isRendererBundleMeta(value: unknown): value is RendererBundleMeta` — 존재성/타입 검사. range tuple 길이 2 + numeric.
  - `isRendererParameterChangeEventDetail(value: unknown): value is RendererParameterChangeEventDetail` — id:string + value:number.
- **`src/index.ts`** — 7 이름 (5 타입 + 2 가드) 재수출.
- **`tests/contracts.test.ts`** — 10 tests. 타입 구조 3 + `isRendererBundleMeta` 5 + `isRendererParameterChangeEventDetail` 2.

### 2.2 `packages/web-editor-renderer/package.json`

- `dependencies: { "@geny/web-avatar-renderer": "workspace:*" }` 추가 (기존 devDependencies 위). 첫 내부 워크스페이스 의존.

### 2.3 `packages/web-editor-renderer/src/renderer.ts`

- 5 `export interface` 블록(Renderer*) 제거 → `import type { ... } from "@geny/web-avatar-renderer"` + `export type { ... }` 로 대체.
- 파일 헤더 주석에 "세션 114 — duck-typed 인터페이스는 `@geny/web-avatar-renderer` 로 승격" 한 줄 추가. `StructureRendererOptions` / `StructureRenderer` / `createStructureRenderer` 본체 및 SVG 렌더 로직은 **완전히 무변경**.
- 컴파일 결과 검증: `dist/renderer.js` 에는 `@geny/web-avatar-renderer` 런타임 참조 **없음** (`import type` 는 TS 에 의해 erased). `dist/renderer.d.ts` 에는 type-only import 로 유지. 런타임 바이트 불변 — `createStructureRenderer` 계약은 그대로.

### 2.4 `packages/web-editor-renderer/src/index.ts`

- 변경 없음. 기존대로 `./renderer.js` 에서 5 type + `createStructureRenderer` + `StructureRenderer` + `StructureRendererOptions` 재수출.

### 2.5 `scripts/test-golden.mjs`

- `STEPS` 배열에 `"web-avatar-renderer contracts tests"` 단계 추가 (`web-editor-logic tests` 와 `web-editor-renderer tests` 사이). 테스트 순서: 계약 패키지 먼저 → 구현체 나중 (위상 정합).
- `runWebAvatarRendererTests()` 함수 신설. `runWebEditorRendererTests()` 주석에 "세션 114 — 계약 타입은 `@geny/web-avatar-renderer` 에서 import" 한 줄 추가.
- 총 단계 수 29 → **30**.

### 2.6 `progress_0420/{INDEX,PLAN,SUMMARY}.md`

- INDEX §1 "세션 113 직후" → "세션 114 직후". 누적 세션 113 → 114. 누적 패키지 14 → **15**. CI golden 29 step → **30 step**.
- PLAN §3 "완료" 블록에 세션 114 ✅ 추가. §7 "다음 즉시 행동" 을 세션 115 로 전진.
- SUMMARY 타임라인 항목 15 로 세션 114 추가. §13 pending 테이블에서 "렌더러 인터페이스 패키지 선행 분리" ⚪→✅.

## 3. 결정

### D1 — **인터페이스 패키지 위치: `packages/web-avatar-renderer/`**

후보 1: `packages/web-avatar-renderer-contracts/` (명시 suffix). 후보 2: `packages/web-avatar-contracts/` (짧음). 채택: **`web-avatar-renderer/`** — 미래 "이 패키지 자체가 렌더러 entrypoint 가 될 수도 있음" 을 열어두기 위해. Option E 하이브리드가 "facade 패키지로 `@geny/web-avatar-renderer` + 내부에 `web-avatar-renderer-pixi` / `web-avatar-renderer-webgl2`" 구조로 확정되면, facade 입장에선 계약 + 라우팅 로직을 같은 패키지에 둘 수 있다. `-contracts` suffix 를 붙이면 facade 가 다른 이름이 되어야 하는 제약이 생긴다.

### D2 — **런타임 가드 2 개 포함 vs pure types-only**

가드 함수 `isRendererBundleMeta` / `isRendererParameterChangeEventDetail` 를 추가해 패키지에 실 런타임 코드를 둔다. pure types-only 도 가능(더 minimal)했지만 제외:
- 실 렌더러 구현체(A/D/E 아무거나)는 `fetch().then(r => r.json())` 결과를 `unknown` 으로 받아서 build 전에 분기해야 한다. 가드가 없으면 각 impl 이 자기 버전으로 중복 구현 → 타입은 한 곳인데 런타임 검사 규칙은 여러 곳. 가드를 계약 패키지에 두면 스키마 validator(ADR 0002) 와 스키마 범위 바깥 fast-path 의 **경계** 를 명시적으로 한 곳에 그린다.
- 가드 검사 범위는 의도적으로 **shape-only** — range tuple 순서(min ≤ max), id 중복, default ∈ range 같은 semantic 은 JSON Schema 에 맡긴다. 가드와 schema 의 책임을 겹치게 두지 않아야 미래 변경 비용이 작다.

### D3 — **readonly 범위 강화**

`RendererBundleMeta.parameters[]` 원본은 `{ id: string; range: readonly [number, number]; default: number }` 였다. 이식 시 `id` / `default` 에도 `readonly` 를 붙였다. `RendererPart` 의 `role` / `slot_id` 와 대칭. 렌더러는 번들 메타를 **읽기만** 하므로 타입상 immutable 로 맞춰 실수 변이를 컴파일 단계에서 차단.

호환성: `readonly` 추가는 consumer 에게 **더 약한** 요구(구조적으로 `readonly` 가 빠진 객체도 할당 가능) → 기존 테스트 10 + 에디터 사용처 전원 green. 깨지는 경로 0.

### D4 — **import type + re-export type 전파**

`renderer.ts` 는 `import type` 로 받고 같은 이름을 `export type` 로 재수출한다. 결과: 컴파일된 **`renderer.js` 에 `@geny/web-avatar-renderer` runtime import 없음** (확인: `grep '@geny/web-avatar-renderer' dist/*.js` 는 헤더 주석 한 줄만 매칭). `dist/renderer.d.ts` 에는 type-only import 유지. `apps/web-editor/public/vendor/web-editor-renderer/renderer.{js,d.ts}` 로 복사 시 **runtime path 불변** — 브라우저 bundler 가 `@geny/web-avatar-renderer` 를 resolve 시도하는 경로 없음.

대안(재수출 없이 쓰는 쪽에서 직접 import)은 기각 — 세션 91 이후 `web-editor-renderer` 의 외부 계약에 `RendererPart` 등이 공개돼 있었고(`index.ts` 에서 `export type`), 소비자(예: `apps/web-editor` 의 `e2e-check.mjs`) 가 이 이름들을 의존할 수 있다. 재수출 유지로 **outer contract bit-identical**.

### D5 — **구현체 `web-editor-renderer` 는 첫 consumer 로 남김**

패키지 이름 자체를 `web-avatar-renderer-structure` 같은 impl-specific 로 바꾸는 옵션은 기각 — 계약 분리 세션에서 구현체 이름까지 동시에 바꾸면 진단/rollback 이 섞인다. 이름 변경은 ADR 0007 Decision 확정 후 별도 세션으로 분리.

### D6 — **골든 step 수 증가**

29 → 30 으로 늘어나면서 `progress_0420/INDEX.md §1` 과 `SUMMARY.md` 의 "golden 29 step" 표기가 모두 30 으로 갱신됐다. CI 스크립트(`scripts/test-golden.mjs`) 는 step count 를 하드코딩하지 않으므로 드리프트 없음. docs/14 / docs/13 본문에는 "29 step" 이 박혀있지 않아 추가 업데이트 불필요(검색으로 확인).

## 4. 테스트 결과

- **신규**: `@geny/web-avatar-renderer` — **10 tests pass** (`pnpm --filter @geny/web-avatar-renderer test`).
- **회귀**: `@geny/web-editor-renderer` — **10 tests pass** (기존 건수 그대로, import 경로만 변경).
- **골든**: `node scripts/test-golden.mjs` **30 step all pass**.
- **dist 바이트 검증**: `packages/web-editor-renderer/dist/renderer.js` 내 `@geny/web-avatar-renderer` 런타임 import 0 개(헤더 주석 제외). `dist/renderer.d.ts` 에만 type-only import 유지.

## 5. 영향 · 후속

- **ADR 0007 Accept 가 오기 전에도 안전한 기반 마련**:
  - Option A 확정 → `packages/web-avatar-renderer-pixi/` 를 본 패키지 의존으로 바로 열 수 있음.
  - Option D 확정 → `packages/web-avatar-renderer-webgl2/` 동일.
  - Option E 확정 → `web-avatar-renderer` 자체가 라우팅 facade 가 되고 하위 구현체 2 개가 공존.
  - Option B(Three.js) 반환 시에도 인터페이스는 재사용. Option C(Cubism SDK 전체) 는 moc3 변환이 선행이라 현 계약 범위 밖 — 별도 레인.
- **세션 115 후보**: 여전히 사용자 리뷰 대기. 자율 모드에서 열 수 있는 self-contained 여지는 작다. 후보:
  - (a) `packages/web-avatar-renderer` 에 `createNullRenderer()` / `createLoggingRenderer()` 추가 — Option 독립 동작 가능한 null-impl. 렌더러 합류 전 테스트 도구로 사용 가능. **권장**.
  - (b) `web-editor-renderer` 의 SVG 구조 렌더러를 신규 패키지로 한 번 더 분리(`web-avatar-renderer-structure`) — 단 이는 ADR 0007 Decision 에 선행해도 무방하지만 실질 가치가 낮음. **보류**.
  - (c) ADR 0007 "Scope/Out" 영역에 들어간 `Server Headless Renderer` 의 별도 ADR 초안. **보류 — 사용자 의사 확인 필요**.
- **docs 업데이트 없음**: 본 변경은 패키지 조직 재배치이며 `docs/01 §8` / `docs/11 §4` / `docs/13 §2` 의 계약 문장은 모두 불변. ADR 0007 "Follow-ups" 목록은 Accept 시점에 업데이트.

## 6. 커밋

- 단일 커밋: `feat(web-avatar-renderer): 렌더러 인터페이스 패키지 선행 분리 (세션 114)`.
