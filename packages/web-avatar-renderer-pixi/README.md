# @geny/web-avatar-renderer-pixi

## 역할

`<geny-avatar>` 의 **primary 브라우저 렌더러**. `ready` / `parameterchange` 이벤트를
구독해 **PixiJS v8** 의 `PIXI.Application` 으로 실 픽셀을 그린다.
`@geny/web-avatar-renderer` 의 duck-typed 계약에만 의존 — 구현체 교체에도
`<geny-avatar>` 와 업스트림 패키지는 영향받지 않는다.

## 상태 (2026-04-24)

- ✅ **구조 프리뷰** — 파츠를 grid 로 배치, `head_angle_x` 로 회전 (placeholder 수준)
- ⏳ **실 `.moc3` 렌더** — Phase 1.4 에서 [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) 통합 예정 ([`docs/adr/001-renderer-integration.md`](../../docs/adr/001-renderer-integration.md) 참조)
- ⚠️ **Cubism Core** 런타임 의존은 P1.D 별도 ADR 에서 번들 정책 확정 후 도입

## 사용

```ts
import { createPixiRenderer } from "@geny/web-avatar-renderer-pixi";

const renderer = createPixiRenderer({
  element: document.querySelector("geny-avatar")!,
  mount: document.querySelector("#stage")!,
});

// 이후 <geny-avatar> 가 ready 이벤트를 쏘면 자동으로 PIXI.Application 이 init 되고
// 파츠 그리드가 그려진다. head_angle_x 파라미터가 바뀌면 전체 회전.

// cleanup
renderer.destroy();
```

### 옵션

| 이름 | 타입 | 기본값 | 의미 |
|---|---|---|---|
| `element` | `RendererHost` | — | `<geny-avatar>` 또는 EventTarget 호환 호스트 |
| `mount` | `Element` | — | PIXI canvas 가 붙을 DOM 노드 |
| `rotationParameter` | `string` | `"head_angle_x"` | 회전을 드라이브할 파라미터 id |
| `backgroundColor` | `number` | `0xf7f8fa` | 스테이지 배경색 |
| `createApp` | `CreatePixiApp` | 실 PIXI | PIXI.Application 생성 훅 (테스트 주입용) |

## P1 산출 범위

- **P1-S1 (현재)**: scaffold + 파츠당 색상 사각형 그리드 + head_angle_x 회전
- **P1-S2 (다음)**: atlas 슬롯이 채워지면 실 텍스처 `PIXI.Sprite` 교체 (`atlasUvToFrame` 이
  UV → 픽셀 변환 담당, 이미 unit tested)

## 테스트 전략

실 PIXI.Application 은 WebGL 컨텍스트를 요구하므로 node `--test` 환경에서 init
할 수 없다. 본 패키지는 `createApp` 옵션으로 PIXI 생성을 주입 가능하게 열어둬
`tests/pixi-renderer.test.ts` 에서 결정론적 mock handle 로 구독 / 생명주기 /
rotation math 를 검증한다. 실 픽셀 렌더는 `apps/web-editor/?renderer=pixi`
브라우저 통합으로 확인.

## 관계

- `@geny/web-avatar-renderer` — 계약 원본 (duck-typed `RendererHost` / `Renderer`)
- `@geny/web-editor-renderer` — SVG 구조 프리뷰 (Foundation 기간 기본 렌더러)
- `@geny/web-avatar` — 이벤트 소스 (Custom Element `<geny-avatar>`)

## 참조

- [ADR 0007 — Renderer Technology](../../progress/adr/0007-renderer-technology.md)
- [β Roadmap — Phase P1](../../docs/ROADMAP-BETA.md)
- [PixiJS v8 docs](https://pixijs.com/8.x/guides)
