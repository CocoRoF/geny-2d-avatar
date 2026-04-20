# @geny/web-avatar-renderer

`geny-2d-avatar` 의 **브라우저 런타임 렌더러 공통 계약** — `<geny-avatar>` 가 방출하는
`ready` / `parameterchange` 이벤트와 `bundle.meta` 의 duck-typed 인터페이스를 모아둔다.
ADR 0007 의 어떤 렌더러 경로(**A** PixiJS / **D** 자체 WebGL2 / **E** 하이브리드)로
확정되어도 실 구현체가 의존할 **상위 계약 패키지**.

## 현재 상태 (세션 114~116)

- ✅ **5 인터페이스 + 2 타입 가드** (세션 114) — `RendererPart` / `RendererBundleMeta`
  / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` / `RendererHost` +
  `isRendererBundleMeta` / `isRendererParameterChangeEventDetail`.
- ✅ **공통 `Renderer` 베이스** (세션 115) — 모든 구현체가 상속할 최소 계약
  (`destroy: () => void`). Option E 하이브리드의 facade 라우터가 이것만 알면 하위
  구현체를 switch 할 수 있도록 의도적으로 작게 유지.
- ✅ **테스트 더블 구현체 2** (세션 115) — `createNullRenderer` (no-op + 상태 getter)
  + `createLoggingRenderer` (NullRenderer 위에 logger 주입 경로 추가).
- ✅ **첫 UI consumer** (세션 116) — `apps/web-editor` 가 `?debug=logger` URL 쿼리
  스위치로 `createLoggingRenderer` dynamic import.
- ⏳ **실 구현체는 ADR 0007 Decision 이후** — PixiJS / 자체 WebGL2 / 하이브리드 중
  택일 후 `@geny/web-avatar-renderer-{pixi,webgl2}` 형태로 합류 예정. 본 패키지 계약은
  Decision 불변.

본 패키지는 **런타임 코드 최소** 원칙 — 런타임 JS 는 두 개의 타입 가드와 Null/Logging
구현체뿐이며, 5 인터페이스는 타입-only 로 내보낸다. 소비자는 `import type { ... }` 로만
계약을 참조하고, 런타임 JS 에 본 패키지 참조가 남지 않도록 `tsc --outDir` 빌드 기준
**type-only import 는 elide** 된다 (확인: `grep @geny/web-avatar-renderer packages/*/dist/*.js`
→ 0 건).

## 사용 예

### 계약만 참조 (타입-only)

```ts
import type {
  RendererBundleMeta,
  RendererHost,
  RendererReadyEventDetail,
  Renderer,
} from "@geny/web-avatar-renderer";

// 소비자 구현체가 위 타입만 알면 `<geny-avatar>` 에 attach 가능.
```

### `createNullRenderer` — 테스트 / 드라이런 / 에디터 스토리북

```ts
import { createNullRenderer } from "@geny/web-avatar-renderer";

const el = document.querySelector("geny-avatar")!;
const renderer = createNullRenderer({ element: el });

// 상태 readout (읽기 전용 getter)
console.log(renderer.partCount);            // 0 → ready 후 meta.parts.length
console.log(renderer.readyCount);            // template 스왑 감지
console.log(renderer.parameterChangeCount);  // setParameter 호출 수

el.setAttribute("src", "/avatars/avt.demo/bundle.json");
// ready 후:  renderer.partCount === meta.parts.length, renderer.lastMeta !== null.

renderer.destroy();  // 리스너 해제, 이후 이벤트는 상태에 무반영.
```

`NullRenderer` 는 DOM 조작 / canvas / timer 를 만들지 않으므로 **이벤트 처리 오버헤드만
남긴 bare baseline** 으로 쓰기에도 적합 — 실 렌더러 합류 후 perf harness 의 상한
기준선 용도.

### `createLoggingRenderer` — dev/debug

```ts
import { createLoggingRenderer } from "@geny/web-avatar-renderer";

const renderer = createLoggingRenderer({
  element: el,
  logger: (event) => {
    // event: { kind: "ready"; meta } | { kind: "parameterchange"; detail } | { kind: "destroy" }
    console.debug("[geny-avatar/logger]", event);
  },
});
```

`logger` 는 **필수** — 기본값 console 을 제공하지 않는 것은 "의도치 않게 LoggingRenderer
가 쓰였을 때 콘솔이 터지는" 시나리오 차단 목적 (세션 115 D3). 임의 sink (메모리 버퍼,
Prometheus counter, 에디터 디버그 패널) 로 redirect 가능.

`LoggingRenderer` 는 내부에 `NullRenderer` 를 두고 상태 추적을 위임 + logger-only
리스너만 추가한다. 즉 `partCount` / `readyCount` 등 getter 는 `NullRenderer` 와
**bit-identical** (세션 115 D2).

### `apps/web-editor` 의 wire-through (세션 116)

```
http://localhost:xxxx/?debug=logger
```

URL 쿼리에 `debug=logger` 가 포함되면 `index.html` 이 `createLoggingRenderer` 를
dynamic import → `<geny-avatar>` 에 attach → `console.debug` 로 3 이벤트
(`ready` → `parameterchange` → `destroy`) 를 흘린다. 기본 경로에선 dynamic import
자체가 발생하지 않아 네트워크/바이트 무영향. e2e (`apps/web-editor/scripts/e2e-check.mjs::runLoggingRendererDebug`)
가 halfbody(parts=30) / fullbody(parts=38) 양쪽에서 이 3-event 스트림을 assertion
으로 고정한다.

## API

### 타입 (5)

| 타입 | 역할 |
|---|---|
| `RendererPart` | `role` + `slot_id` 두 축 — 렌더러는 번들의 나머지 detail 에 구속되지 않는다 (duck-typed 원칙). |
| `RendererBundleMeta` | `parts[]` + `parameters[]` (id / range / default). rotation slider 자동 선택과 미래 clamp 용. |
| `RendererReadyEventDetail` | `<geny-avatar>` `ready` CustomEvent 의 `detail.bundle.meta` 경로. |
| `RendererParameterChangeEventDetail` | `parameterchange` CustomEvent 의 `detail.{id,value}`. |
| `RendererHost` | 렌더러가 구독하는 EventTarget 호스트. `bundle?` 은 late-attach 경로용 optional. |

### 베이스 계약

| 인터페이스 | 필드 | 용도 |
|---|---|---|
| `Renderer` | `destroy: () => void` | 모든 실 구현체가 상속할 최소 계약. 호출 후 재사용 불가. |

### 타입 가드 (2)

| 가드 | 검사 범위 |
|---|---|
| `isRendererBundleMeta(value)` | 존재성 + 타입 (`role`/`slot_id`/`id` 는 string, `default` 는 number, `range` 는 2-tuple). |
| `isRendererParameterChangeEventDetail(value)` | `id: string` + `value: number`. |

가드는 **shape-only** — range tuple 순서(lo ≤ hi) / default ∈ range / id 중복 등 semantic
검사는 하지 않는다. 그 책임은 schema validator 에 귀속 (ADR 0002). NullRenderer /
LoggingRenderer 의 malformed payload drop 도 동일 shape-only 기준.

### 팩토리 (2)

| 함수 | 반환 타입 | 용도 |
|---|---|---|
| `createNullRenderer({ element })` | `NullRenderer extends Renderer` | 계약 드라이브만 하는 no-op 렌더러. 5 readonly getter (`partCount` / `lastMeta` / `lastParameterChange` / `readyCount` / `parameterChangeCount`). |
| `createLoggingRenderer({ element, logger })` | `LoggingRenderer extends NullRenderer` | NullRenderer + logger-only 리스너. `logger` 는 필수. |

### 이벤트 (LoggingRenderer)

```ts
type LoggingRendererEvent =
  | { readonly kind: "ready"; readonly meta: RendererBundleMeta }
  | { readonly kind: "parameterchange"; readonly detail: RendererParameterChangeEventDetail }
  | { readonly kind: "destroy" };
```

- **late-attach** 시: `element.bundle` 이 이미 있는 상태에서 `createLoggingRenderer` 를
  호출하면 `logger({ kind: "ready", meta })` 를 즉시 1 회 emit (drop-in 대칭, 세션 115 D5).
- **destroy** 시: logger-only 리스너 제거 → inner NullRenderer destroy → `logger({ kind: "destroy" })`
  emit. 이후 이벤트는 log 무반영.

## Consumer Attachment Pattern

실 구현체 및 consumer 가 이 계약을 먹을 때 따르는 패턴:

1. **소비자는 `RendererHost` 를 주입받는다** — `<geny-avatar>` 인스턴스 (프로덕션) 또는
   `new EventTarget` 래퍼 (테스트). 계약은 DOM 을 가정하지 않는다.
2. **`ready` 이벤트 → build**, **`parameterchange` → apply** — 두 축이 최소 집합.
   확장 이벤트(예: `motionstart` / `expressionchange`) 는 각 consumer 가 자체 계약으로
   처리 (세션 94 `<geny-avatar>` element.ts).
3. **late-attach 지원 의무** — consumer 는 `element.bundle` 이 이미 세팅된 상태에서도
   drop-in 동작해야 한다. NullRenderer / LoggingRenderer 모두 late-attach 경로에서
   `readyCount = 1` + (LoggingRenderer 의 경우) `logger` 1 회 emit 으로 대칭을 유지.
4. **destroy 후 상태 동결** — `destroy()` 이후 들어오는 이벤트는 상태/log 에 무반영.
   post-destroy silence 는 e2e assertion 으로 고정 (세션 116).

### ADR 0007 경로별 예상 귀결

| Option | 예상 패키지 분포 | 본 패키지와의 관계 |
|---|---|---|
| A (PixiJS) | `@geny/web-avatar-renderer-pixi` 신규 | `Renderer` 베이스 상속. 본 패키지는 변경 없음. |
| D (자체 WebGL2) | `@geny/web-avatar-renderer-webgl2` 신규 | 동상. |
| E (하이브리드) | 본 패키지를 facade 로 확장 + 하위 구현체 2 개 (pixi + webgl2). | `Renderer` 베이스 유지 + 라우터 함수 추가 검토. |

## 빌드 / 테스트

```bash
pnpm -F @geny/web-avatar-renderer build       # tsconfig.build.json → dist/
pnpm -F @geny/web-avatar-renderer test        # tsconfig.test.json → dist-test/ + node --test
```

- **21 테스트** — `contracts.test.ts` 10 (가드 4 + 타입 export 검증 6) + `null-renderer.test.ts` 6 (초기 상태 / late-attach / ready 2 회 / parameterchange 2 회 / malformed drop / destroy frozen) + `logging-renderer.test.ts` 5 (ready emit / parameterchange emit / late-attach drop-in / malformed drop / destroy emit + post-destroy silence).
- **골든 스텝 (scripts/test-golden.mjs)** — `web-avatar-renderer` step 은 `build → test`
  2 단. downstream `@geny/web-editor-renderer` 가 `dist/*.d.ts` 를 type import 하므로
  `build:test` (→ `dist-test/`) 만으로는 부족 (세션 115 D6).

## 참고 문서

- [docs/13-tech-stack.md §2.2](../../docs/13-tech-stack.md) — 렌더러 기술 후보 상태 (ADR 0007 pending).
- [progress/adr/0007-renderer-technology.md](../../progress/adr/0007-renderer-technology.md) — ADR 0007 Draft.
- [progress/sessions/2026-04-21-session-114-web-avatar-renderer-package.md](../../progress/sessions/2026-04-21-session-114-web-avatar-renderer-package.md) — 계약 패키지 선행 분리.
- [progress/sessions/2026-04-21-session-115-null-logging-renderer.md](../../progress/sessions/2026-04-21-session-115-null-logging-renderer.md) — Null/Logging 구현체 착지.
- [progress/sessions/2026-04-21-session-116-web-editor-logging-renderer-wire.md](../../progress/sessions/2026-04-21-session-116-web-editor-logging-renderer-wire.md) — apps/web-editor 첫 consumer 경로.
