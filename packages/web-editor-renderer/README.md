# @geny/web-editor-renderer

`geny-2d-avatar` Foundation 에디터의 **구조 프리뷰 렌더러** — `<geny-avatar>` 의 `ready` +
`parameterchange` 이벤트를 구독해 파츠 메타를 SVG 레이아웃으로 투영한다. Cubism/WebGL
실 렌더러가 합류하기 전의 수직 슬라이스 층으로, `setParameter` (세션 90) 와
파츠↔Preview 선택 양방향 바인딩 (세션 92) plumbing 이 end-to-end 로 작동함을 증명한다.

## 현재 상태 (세션 91 → 세션 114)

- ✅ **`createStructureRenderer`** — SVG `<rect>` 그리드로 파츠를 배치 (5 열 × N 행),
  `role` 텍스트 라벨 포함 (세션 91).
- ✅ **파라미터 기반 회전** — `id` 에 `"angle"` 포함된 첫 파라미터 (명시 안 할 시) 를
  root `<g>` 의 `rotate(° cx cy)` 로 적용.
- ✅ **양방향 선택 바인딩** — Preview 클릭 → `onSelectPart` 콜백 → 사이드바 동기.
  사이드바 선택 → `setSelectedSlot(slotId)` → 하이라이트. echo 루프 방지 (세션 92).
- ✅ **late-attach 지원** — `element.bundle` 이 이미 세팅된 host 에 attach 되면 즉시
  build. NullRenderer/LoggingRenderer 와 동일 대칭 (세션 91 D2).
- ✅ **`@geny/web-avatar-renderer` 계약 소비** (세션 114) — 본 패키지 내부에 있던
  duck-typed 인터페이스(`Renderer*`) 를 승격 분리. 본 패키지는 그 **첫 구현체** 로
  계약을 소비하며, ADR 0007 의 어떤 렌더러 경로(A PixiJS / D 자체 WebGL2 / E 하이브리드)
  가 확정되어도 인터페이스는 불변.

## 사용 예

```ts
import { createStructureRenderer } from "@geny/web-editor-renderer";

const el = document.querySelector("geny-avatar")!;
const mount = document.querySelector(".stage-inner")!;

const renderer = createStructureRenderer({
  element: el,
  mount,
  onSelectPart: (part) => {
    if (!part) {
      // 선택 해제.
    } else {
      // 사이드바 선택 동기 — 에디터 스크립트가 사이드바 li 에 aria-selected="true".
    }
  },
});

// 프로그래매틱 선택 (사이드바 → Preview 방향). onSelectPart 는 호출되지 않아 루프 없음.
renderer.setSelectedSlot("halfbody.eye_left.v1");

// 상태 getter
renderer.partCount;       // build 후 meta.parts.length
renderer.rotationDeg;      // 마지막 rotate(°) 값
renderer.selectedSlotId;   // 현재 선택된 slot_id 또는 null

renderer.destroy();  // 리스너 해제 + SVG DOM 제거.
```

## API

### `createStructureRenderer(opts): StructureRenderer`

| 옵션 | 타입 | 설명 |
|---|---|---|
| `element` | `RendererHost` | `<geny-avatar>` 또는 duck-typed EventTarget (`ready` + `parameterchange` 구독원). |
| `mount` | `Element` | SVG 를 주입할 컨테이너. `.stage-inner` 가 관례. |
| `rotationParameter?` | `string` | rotation 을 연결할 파라미터 id. 미지정 시 `id` 에 `"angle"` 포함된 첫 파라미터 자동 선택. |
| `onSelectPart?` | `(part: RendererPart \| null) => void` | Preview `<rect>` 클릭 시 호출. 같은 slot 재클릭 → `null`. |

### `StructureRenderer` 인터페이스

| 필드 | 타입 | 설명 |
|---|---|---|
| `destroy()` | `() => void` | 리스너 해제 + SVG DOM 제거. 재사용 불가. |
| `partCount` | `readonly number` | 마지막 build 의 `meta.parts.length`. |
| `rotationDeg` | `readonly number` | 마지막 rotation 적용값 (degrees). |
| `selectedSlotId` | `readonly string \| null` | 현재 선택된 파츠의 `slot_id` 또는 `null`. |
| `setSelectedSlot(slotId)` | `(string \| null) => void` | 프로그래매틱 선택. `onSelectPart` 미호출 (echo-back 방지). 존재하지 않는 slotId 는 무시. |

## `@geny/web-avatar-renderer` 계약과의 관계

세션 114 이전 본 패키지에 인라인됐던 `RendererPart` / `RendererBundleMeta` /
`RendererHost` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` 5
인터페이스는 `@geny/web-avatar-renderer` 로 승격 분리 후 본 패키지가 **workspace 의존**
으로 재수출한다 (아래 표).

| 타입 | 정의 위치 | 본 패키지에서의 역할 |
|---|---|---|
| `RendererPart` | `@geny/web-avatar-renderer` | meta 의 파츠 표현 — SVG `<rect>` + `<text>` 드로우 소스. |
| `RendererBundleMeta` | 동상 | `ready` 이벤트에서 build() 가 받는 입력. |
| `RendererHost` | 동상 | `element` 옵션 타입. |
| `RendererReadyEventDetail` | 동상 | `ready` 이벤트 detail 캐스팅. |
| `RendererParameterChangeEventDetail` | 동상 | `parameterchange` 이벤트 detail 캐스팅. |

본 패키지는 **type-only import** 로 위 5 인터페이스를 가져오므로 런타임 JS dist 에
`@geny/web-avatar-renderer` 참조가 남지 않는다 (확인: `grep @geny/web-avatar-renderer packages/web-editor-renderer/dist/*.js` → 0 건).
이 원칙은 ADR 0007 Accept 이후에도 유지된다 — 실 구현체(`-pixi` / `-webgl2`) 가
합류해도 본 패키지는 상위 계약에만 묶이고, 구현체 선택은 소비자(에디터 / 런타임) 의
책임.

## 소비자

- **`apps/web-editor`** — `<geny-avatar>` + `.stage-inner` 에 mount 해 에디터 Preview
  중앙 컬럼에 표시 (세션 91).
- **`apps/web-editor/scripts/e2e-check.mjs::runRendererMount`** — happy-dom + 실 HTTP
  로 rect 카운트 / rotation transform / 파츠 클릭 선택 round-trip 검증.

## 빌드 / 테스트

```bash
pnpm -F @geny/web-editor-renderer build       # tsconfig.build.json → dist/
pnpm -F @geny/web-editor-renderer test        # dist-test/ + node --test
```

- **단위 테스트** — happy-dom EventTarget 모의로 `ready` → build → partCount / rotation
  transform / 선택 round-trip / late-attach / destroy 정리.
- **dist 바이트 검증** — `dist/renderer.js` 에 `@geny/web-avatar-renderer` runtime
  import 없음 (세션 114 D4, 재확인은 e2e 스냅샷).

## ADR 0007 이후 진화 경로

| Option | 본 패키지 행로 |
|---|---|
| A (PixiJS) | `@geny/web-avatar-renderer-pixi` 신규 + 본 패키지는 **구조 프리뷰 전용** 로 유지. 에디터가 둘 다 mount. |
| D (자체 WebGL2) | `-webgl2` 신규 + 동상. |
| E (하이브리드) | facade 에 본 패키지가 계속 살아있거나, pixel 렌더 합류 시 본 구조 프리뷰가 dev-debug 모드 전용으로 강등. |

어느 경우든 `createStructureRenderer` 의 공개 계약(`StructureRenderer` / 옵션 5) 은
불변이며, `Renderer` 베이스 상속 여부는 세션 115 D1 의 `Renderer { destroy }` 최소
계약에 이미 부합하므로 추가 작업 없음.

## 참고 문서

- [docs/09 §5](../../docs/09-ui-flow.md) — 에디터 Preview Stage 설계.
- [progress/adr/0007-renderer-technology.md](../../progress/adr/0007-renderer-technology.md) — ADR 0007 Draft (렌더러 기술 선택).
- [progress/sessions/2026-04-20-session-91-web-editor-renderer.md](../../progress/sessions/2026-04-20-session-91-web-editor-renderer.md) — 패키지 착지.
- [progress/sessions/2026-04-20-session-92-part-selection-highlight.md](../../progress/sessions/2026-04-20-session-92-part-selection-highlight.md) — 양방향 선택 바인딩.
- [progress/sessions/2026-04-21-session-114-web-avatar-renderer-package.md](../../progress/sessions/2026-04-21-session-114-web-avatar-renderer-package.md) — 계약 승격 분리.
