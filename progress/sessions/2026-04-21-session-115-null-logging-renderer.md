# 세션 115 — `createNullRenderer` / `createLoggingRenderer` 구현체 착지

- **날짜**: 2026-04-21
- **선행**: 세션 114 (`@geny/web-avatar-renderer@0.1.0` 계약 패키지 신규 — 5 인터페이스 + 2 타입 가드).
- **상태**: ✅ completed.
- **변경 범위**: `packages/web-avatar-renderer/src/{contracts,null-renderer,logging-renderer,index}.ts`, `packages/web-avatar-renderer/tests/{null-renderer,logging-renderer}.test.ts` (신규 2), `scripts/test-golden.mjs`, `progress_0420/{INDEX,PLAN,SUMMARY}.md`, 세션 문서.
- **워크스트림**: Frontend / Platform.

## 1. 동기

세션 114 는 `@geny/web-avatar-renderer` 를 "타입 + 가드" 만 담은 정의 홀더로 설계했다. ADR 0007 Decision 이 **아직 공란** 이고 Option A(PixiJS) / D(자체 WebGL2) / E(하이브리드) 어느 경로든 이 계약을 먹는다는 게 출발점이었다. 하지만 정의 홀더만으론 **소비자 관점의 smoke test 가 불가능** — 계약을 주입받는 소비자(테스트 코드 / 에디터 스토리북 / 프리뷰 드라이런)가 "이 계약이 실제로 살아있다" 는 증거를 뽑을 수 없다.

세션 115 는 계약 패키지 안에 **ADR 0007 Decision 불변** 인 두 개의 no-op/debug 구현체를 추가해, 계약 패키지를 "정의 + 테스트 더블" 로 완결한다. 둘 다 DOM 조작/타이머/canvas 없이 이벤트만 구독한다 — 즉 **실 렌더러 합류 전이든 후든, 별개 축으로 계약이 살아있음을 입증** 한다.

## 2. 변경

### 2.1 `packages/web-avatar-renderer/src/contracts.ts`

파일 말미에 공통 베이스 인터페이스 1 개 추가:

```ts
export interface Renderer {
  readonly destroy: () => void;
}
```

NullRenderer / LoggingRenderer 양쪽이 `extends Renderer` 로 상속. 추후 실 렌더러 구현체(`@geny/web-avatar-renderer-pixi` 등)도 같은 베이스를 사용하도록 **런타임 계약의 공통 바닥** 을 고정.

### 2.2 `packages/web-avatar-renderer/src/null-renderer.ts` (신규)

- `NullRendererOptions { element: RendererHost }`.
- `NullRenderer extends Renderer` — `partCount` / `lastMeta` / `lastParameterChange` / `readyCount` / `parameterChangeCount` 5 개의 readonly getter.
- `createNullRenderer({ element })` — host 의 `ready` + `parameterchange` 두 이벤트를 구독해 상태만 추적.
- **late-attach 지원**: 함수 내부에서 `element.bundle` 을 즉시 확인해, 이미 bundle 이 있으면 `readyCount = 1` + `lastMeta` 반영 후 반환. StructureRenderer (세션 91) 와 대칭 — renderer 가 ready 이후 붙어도 drop-in 된다.
- **malformed payload 드롭**: `detail` 이 null / bundle 없음 / meta 없음 이면 `onReady` 는 반환. `parameterchange` 의 `id`/`value` 타입 불일치는 `onParameterChange` 에서 반환. 카운터 증가 없음 — 가드와 동일한 shape-only 기준.
- `destroy()` 는 listener 2 개를 제거. 이후 host 가 이벤트를 쏴도 상태 고정(카운터 frozen).

### 2.3 `packages/web-avatar-renderer/src/logging-renderer.ts` (신규)

- `LoggingRendererEvent` — discriminated union 3 분기:
  ```ts
  | { kind: "ready"; meta: RendererBundleMeta }
  | { kind: "parameterchange"; detail: RendererParameterChangeEventDetail }
  | { kind: "destroy" }
  ```
- `LoggingRendererOptions { element; logger: (event) => void }` — logger 는 **필수**. 기본값 console 을 두지 않는 이유: "임의 sink(메모리 버퍼/Prometheus counter/에디터 디버그 패널) 로 redirect 가능" + "의도하지 않은 console 오염 차단".
- `LoggingRenderer extends NullRenderer` — 상태 뷰는 그대로 상속.
- 구현체는 **내부에 NullRenderer 를 두고 상태 추적을 위임** + **같은 host 에 logger-only 리스너 한 쌍을 추가** 한다. 순서: null-renderer 먼저 등록 → logger 나중 등록. `addEventListener` 호출 순 발화가 보장되므로, logger 가 발화할 시점엔 null-renderer 쪽이 이미 상태를 반영한 상태.
- late-attach 경로에서도 logger 가 ready 를 한 번 emit — drop-in 대칭.
- `destroy()` 는 (a) logger-only 리스너 제거 → (b) inner.destroy() → (c) `logger({kind:"destroy"})` emit. 이후 host 가 이벤트를 쏴도 log 무변.

### 2.4 `packages/web-avatar-renderer/src/index.ts`

`Renderer` 베이스 타입 + `createNullRenderer` + `NullRenderer` + `NullRendererOptions` + `createLoggingRenderer` + `LoggingRenderer` + `LoggingRendererEvent` + `LoggingRendererOptions` 재수출. 세션 114 의 5 인터페이스 + 2 가드는 그대로 유지.

### 2.5 `packages/web-avatar-renderer/tests/null-renderer.test.ts` (신규, 6 tests)

- 초기 상태 (partCount=0 / lastMeta=null / 모든 카운터=0).
- late-attach 한 host.bundle 을 1-ready 로 계산.
- ready 이벤트 2 회 → partCount 덮어씌움 + readyCount=2.
- parameterchange 2 회 → lastParameterChange 갱신 + parameterChangeCount=2.
- malformed detail (null / bundle null / bundle 빈 객체 / id:number / value:string) 전부 무반영.
- destroy 이후 후속 이벤트 무반영 (카운터 frozen) — `lastMeta` 는 read-only snapshot 유지.

### 2.6 `packages/web-avatar-renderer/tests/logging-renderer.test.ts` (신규, 5 tests)

- ready dispatch → logger 1 회 emit + kind="ready" + meta 페이로드 일치 + partCount=3.
- parameterchange → logger 1 회 emit + detail 일치 + lastParameterChange 반영.
- late-attach host.bundle → logger 1 회 emit (drop-in 대칭) + readyCount=1.
- malformed payload → logger 0 회 + readyCount/parameterChangeCount=0.
- destroy → logger 에 `{kind:"destroy"}` 추가 emit + 이후 이벤트는 log 무반영.

### 2.7 `scripts/test-golden.mjs`

`runWebAvatarRendererTests` 에 `pnpm build` 선행 호출 추가:

```js
async function runWebAvatarRendererTests() {
  // 세션 115 — downstream `@geny/web-editor-renderer` 가 dist/*.d.ts type import
  // 이므로 test 전에 build 로 dist/ 를 채워야 한다. 기존엔 `pnpm test` 가 build:test 만
  // 트리거하여 dist-test/ 만 생기고 dist/ 는 stale/없음 → web-editor-renderer TS2307.
  await run("pnpm", ["-F", "@geny/web-avatar-renderer", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/web-avatar-renderer", "test"], { cwd: repoRoot });
}
```

코멘트에 세션 115 `createNullRenderer` + `createLoggingRenderer` 추가 + 21 tests 언급도 반영. STEPS 배열은 불변 — 단계 수 30 유지.

### 2.8 `progress_0420/{INDEX,PLAN,SUMMARY}.md`

- INDEX §1 "세션 114 직후" → "세션 115 직후". 패키지 행에 Null/Logging 구현체 착지 한 줄. CI 게이트 행에 "세션 115 `web-avatar-renderer` step build 선행 추가" 기술.
- PLAN 헤더 "115+" → "116+". §3 완료 표에 세션 115 ✅. §7 "다음 즉시 행동" 을 세션 116 로 전진(후보 H = web-editor wire-through 권장, 후보 I = Server Headless Renderer ADR 보류).
- SUMMARY 헤더 114 → 115. 타임라인 항목 16 로 세션 115 append. §7.1 web-avatar-renderer 테스트 수 10 → 21. §13 pending 표에 Null/Logging 행 ✅ 추가.

## 3. 결정

### D1 — **공통 `Renderer` 베이스 인터페이스 위치: `contracts.ts`**

후보 1: `null-renderer.ts` 안에 inline 선언 후 `LoggingRenderer` 가 reuse. 후보 2: `contracts.ts` 에 두고 양쪽 구현체가 `extends Renderer`. 채택: **후보 2** — 추후 실 렌더러 구현체(`@geny/web-avatar-renderer-pixi` 등) 도 같은 베이스에 기댄다. 계약 패키지의 공식 공개면은 `contracts.ts` 이어야 하며, Null/Logging 은 그 위에 쌓는 테스트 더블이지 베이스의 출처가 아니다.

`destroy()` 한 필드뿐이지만 명시적인 이름으로 고정해두면 추후 필드 추가(예: `readonly id: string` / `readonly lastFrameAt: number`) 가 계약 파일 한 곳에서 이루어진다.

### D2 — **LoggingRenderer 는 NullRenderer 를 상속 vs 독립 구현**

후보 1(독립 구현): logging-renderer 가 자체로 이벤트 리스너 + 상태 추적 + logger emit 을 다 한다. NullRenderer 와 로직이 80% 중복.
후보 2(**채택**): logging-renderer 가 **내부에 NullRenderer 를 인스턴스화** 하고 상태 추적을 완전히 위임. 자신은 logger-only 리스너 한 쌍만 따로 등록.

채택 이유:
- **중복 제거**: shape-guard / 카운터 / late-attach 루프가 NullRenderer 한 곳에만 존재. 회귀 시 수정 지점 1 개.
- **상태 뷰 일관성**: `partCount` / `readyCount` 등 getter 는 NullRenderer 의 그것과 **bit-identical** 임이 구조적으로 보장. 별도 테스트로 동등성을 재증명할 필요 없음.
- **리스너 순서**: `addEventListener` 호출 순 발화 덕에 NullRenderer 쪽 상태가 먼저 반영된 뒤 logger 가 실행 → logger 가 `inner.lastMeta` 를 읽어야 한다면(향후) 안전.

독립 구현이 더 유리해질 미래 시나리오(예: logger 가 상태 추적 없이 순수 side-channel 으로만 쓰이고 싶을 때)가 있을 수 있지만, 지금은 "debug 용" 이라는 원 목적이 상태 + 이벤트 둘 다 보는 쪽이 자연. `LoggingRenderer extends NullRenderer` 는 타입 계약 측면에서도 대체 가능성(substitutability) 을 명시한다.

### D3 — **logger 의 기본값(console) 제공하지 않음**

`logger` 를 필수(non-optional) 로 둔다. 기본값 console 을 넣는 선택은 기각:
- "의도치 않게 LoggingRenderer 가 쓰이면 브라우저 콘솔이 터진다" 시나리오 차단. 테스트 실행 중 누군가 NullRenderer 대신 LoggingRenderer 를 건드리면 CI 로그에 노이즈가 축적되는 걸 구조적으로 막는다.
- dev/debug 외에 Prometheus counter / 메모리 버퍼 / 에디터 디버그 패널로 redirect 하고 싶을 때 명시적 주입이 자연.
- 타입 시스템 측에서 `logger` 미지정 시 컴파일 에러로 빠르게 드러남.

### D4 — **malformed payload 는 상태·log 양쪽에서 드롭**

양쪽 구현체 모두 `detail` 이 null 이거나 형이 안 맞으면 카운터 증가 없음 + logger emit 없음. 계약 패키지의 두 가드(`isRendererBundleMeta` / `isRendererParameterChangeEventDetail`) 와 **완전히 동일한 shape-only 기준**. semantic(range tuple 순서 / default ∈ range / id 중복) 는 여전히 JSON Schema 소관 — ADR 0002 와 경계 유지.

테스트에서 `{ detail: null }` / `{ bundle: {} }` / `{ id: 1, value: 0 }` / `{ id: "x", value: "nope" }` 4 변종 모두 reject 확인.

### D5 — **late-attach 경로에서 logger 가 ready 를 1 회 emit**

NullRenderer 는 late-attach 시 `readyCount = 1` + `lastMeta` 반영을 이미 한다. LoggingRenderer 가 그 위에 또 logger 를 쏘는 게 맞는지 고민:
- **쏜다**: LoggingRenderer 의 "각 ready 이벤트를 로그로 보고한다" 라는 계약을 late-attach 경로에서도 유지. 소비자가 "host.bundle 이 이미 세팅된 host 에 LoggingRenderer 를 붙였을 때 ready 로그를 못 받는다" 면 혼란.
- **안 쏜다**: EventTarget 으로 dispatch 된 이벤트가 아니므로 "이벤트 로그" 개념과 맞지 않는다고 볼 여지.

채택: **쏜다**. NullRenderer 와 대칭 — NullRenderer 는 readyCount 를 1 로 올리므로, LoggingRenderer 도 같은 의미 축에서 logger 를 쏴야 상태↔로그가 1:1.

### D6 — **Golden step 에 build 선행 추가(세션 114 의 누락 수정)**

세션 114 에서 `runWebAvatarRendererTests` 는 `pnpm test` 만 호출했다. `pnpm test` 는 `build:test` 를 선행해 `dist-test/` 를 만들지만 **`dist/`(공개 dist) 는 건드리지 않는다**. downstream `@geny/web-editor-renderer` 는 `import type { ... } from "@geny/web-avatar-renderer"` 로 `dist/*.d.ts` 를 참조 → `clean` 이 한 번이라도 돌면 TS2307 (모듈을 찾을 수 없음) 에 걸린다.

세션 115 구현체 개발 중 실제 이 상황이 발생 — golden 에서 `web-editor-renderer tests` 와 `web-editor e2e` 가 연쇄 실패. 근본 수정: `migrator` (세션 111) 와 같은 "build → test" 2 단 패턴으로 정렬. 이제 web-avatar-renderer/dist/ 가 clean → rebuild 로 idempotent 하게 준비됨.

대안(web-editor-renderer 의 test 가 자기 workspace dep 을 prebuild) 은 기각 — downstream 각각에 prebuild 를 중복 넣기보다 **provider 쪽 골든 step 이 dist/ 를 보장** 하는 쪽이 자연스럽고, orchestrator-service 스텝의 누적 빌드 패턴(step 17) 과도 일관.

## 4. 테스트 결과

- **신규**: `@geny/web-avatar-renderer` — tests 10 → **21 pass** (null 6 + logging 5 추가).
- **회귀**: `@geny/web-editor-renderer` — 기존 tests 그대로 green (계약 바이트 불변).
- **회귀**: `web-editor e2e` — happy-dom 기반 renderer mount + rotation + selection round-trip 그대로 green.
- **골든**: `node scripts/test-golden.mjs` → **30 step all pass**. `web-avatar-renderer contracts tests` 스텝이 build 선행 후 test 실행.
- **dist 바이트 검증 유지**: `packages/web-editor-renderer/dist/renderer.js` 에 `@geny/web-avatar-renderer` runtime import 없음(세션 114 D4 유지).

## 5. 영향 · 후속

- **계약 패키지 완결**: 세션 114(정의) + 세션 115(테스트 더블) 로 `@geny/web-avatar-renderer` 는 ADR 0007 Decision 전이든 후든 소비 가능한 상태. PixiJS / 자체 WebGL2 구현체가 합류하면 같은 `Renderer` 베이스를 상속해 `createNullRenderer` 의 호출 규약을 승계할 뿐.
- **NullRenderer 의 활용 범위**: (a) 드라이런 테스트(실 렌더러 없이 계약이 반응하는지 체크), (b) 에디터 스토리북(`<geny-avatar>` 붙기 전 상태 프레이밍), (c) 성능 상 상한 측정용(이벤트 처리만 남긴 상태의 bare overhead).
- **LoggingRenderer 의 활용 범위**: 세션 116 후보 H — `apps/web-editor` 에 debug 스위치로 wire-through 하면 e2e 가 이벤트 stream 을 검증 가능.
- **docs 업데이트 없음**: ADR 0007 는 Draft 상태 유지. `docs/13 §2.2` 의 잠정안 E 는 본 변경으로 영향 없음 — 구현체가 아니라 테스트 더블일 뿐.
- **세션 116 후보** (자율 모드 내에서 안전):
  - (H, **권장**) `<geny-avatar>` / `apps/web-editor` 에 `createLoggingRenderer` 를 debug 스위치로 wire-through + e2e 에서 로그 스트림 어서션. self-contained. 리스크 저.
  - (I, 보류) Server Headless Renderer 별도 ADR 초안 — ADR 0007 Open Question #3 이 사용자 답변을 기다려야 위임이 안정.

## 6. 커밋

- 단일 커밋: `feat(web-avatar-renderer): null + logging 구현체 추가 (세션 115)`.
