# P1-S11 — pixi expression ticker: alpha fade ramp 순수 함수 분리 + 회귀 고정 (2026-04-22)

## 1. 트리거

P1-S10 (motion-ticker) 의 명백한 twin. `defaultCreateApp.setExpression` 은 호출
될 때마다 closure 안에서 `blinkCallback` 을 새로 만들어 `app.ticker.add` 해
왔다. 구조상 세 가지 취약점:

1. **callback 누적 경합** — 빠른 연속 `setExpression` (예: `smile` → `frown` 을
   100ms 간격으로) 시 여러 callback 이 동시에 `root.alpha` 를 덮어써 최종 값이
   마지막 완료 순서에 의존. 프레임 단위 경합이라 디버깅 어렵다.
2. **jump-cut 가능성** — 각 callback 의 `startAlpha = root.alpha` 는 *다른*
   callback 이 중간값으로 써둔 alpha 를 그대로 출발점으로 잡아 시각적으로
   불연속 점프가 생길 수 있다.
3. **공식 자체의 회귀 방지 부재** — `alpha = start + (target - start) * t` 의
   선형성이나 `Math.max(60, fadeIn*1000)` 의 floor 같은 invariant 는 DOM/pixi
   없이 단위 테스트가 불가. 누군가 선형을 ease-out 으로 바꿔도 즉시 감지 못함.

β 제품 정의 §3 #3 (motion/expression) 의 "표정이 부드럽게 전환된다" 는 시각
인상이 직접 걸린 코드라, motion-ticker 와 동일 패턴으로 순수 함수화 +
node:test 고정이 명백히 필요.

## 2. 산출물

### 2.1 순수 함수 모듈 — `expression-ticker.ts`

`packages/web-avatar-renderer-pixi/src/expression-ticker.ts` 신설:

```ts
export interface ExpressionState {
  readonly expression: RendererExpression | null;
  readonly alpha: number;        // 현재 표시 alpha
  readonly startAlpha: number;   // 현재 램프 출발점
  readonly targetAlpha: number;  // 현재 램프 목표
  readonly rampMs: number;
  readonly durationMs: number;   // 0 → settled (램프 없음)
}

export interface ExpressionFrame {
  readonly state: ExpressionState;
  readonly alpha: number;
  readonly ended: boolean;
}

export function initialExpressionState(): ExpressionState;
export function setExpressionTarget(
  prev: ExpressionState,
  expression: RendererExpression | null,
): ExpressionState;
export function advanceExpressionFrame(
  prev: ExpressionState,
  dtMs: number,
): ExpressionFrame;

export const EXPRESSION_MIN_DURATION_MS = 60;
export const EXPRESSION_ACTIVE_ALPHA = 1;
export const EXPRESSION_NEUTRAL_ALPHA = 0.95;
export const EXPRESSION_NEUTRAL_FADE_SEC = 0.15;
```

설계 포인트:

- **단일 state** — 렌더러는 `expressionState` 변수 하나만 보유. 램프 중간에
  `setExpressionTarget` 이 다시 와도 **현재 alpha 에서 새 target 으로** 인수
  인계 (jump-cut 방지). 기존 구현은 새 callback 이 start 를 재포착해 점프
  가능성이 있었다.
- **duration 클램프** — `fade_in_sec<=0` 이어도 `EXPRESSION_MIN_DURATION_MS`
  (60ms) 로 바닥 — 번쩍임(딱 한 프레임 점프) 방지. 음수 fade 도 방어.
- **settled 수렴** — 램프 완료 시 `state.durationMs=0` 으로 고정돼 이후
  `advanceExpressionFrame` 은 state 객체를 그대로 반환 (무한 no-op). 렌더러는
  `ended=true` 프레임에서 `ticker.remove` 수행.
- **`ended` 일회성** — 완료 프레임에만 true. 이후 호출은 false 반환 (ticker
  해제 중복 시도 방지).
- **dt 방어** — `Number.isFinite(dt) && dt > 0` 체크로 NaN/음수를 0 취급. 역진
  불가.
- **상수 공개** — 4 개 모두 export 해 테스트와 UI 가 공유. 특히
  `EXPRESSION_NEUTRAL_ALPHA = 0.95` 는 "표정 해제 시 살짝 dim" 이라는 시각
  규칙의 단일 원천.

### 2.2 회귀 테스트 — `tests/expression-ticker.test.ts`

17 개 `node:test` 케이스, 7 describe 블록:

| describe | 케이스 수 | invariant |
|---|---:|---|
| initialExpressionState | 2 | settled 기본값 · advance 그대로 반환 |
| setExpressionTarget | 4 | expression/null/fade_in=0/음수 각 duration · targetAlpha 공식 |
| 선형 ramp 진행 | 2 | t=0.5 중간 alpha · 단계적 dt 누적 선형 정확성 |
| ramp 완료 + ended | 3 | 완료 시 alpha=target + settled · 한 번만 신호 · dt 오버슛 |
| 중간 재타겟 | 2 | startAlpha=현재 alpha (점프 없음) · 동일 target 도 램프 리셋 |
| dt 방어 | 3 | NaN / 음수 / 0 전부 dt=0 취급 |
| 연속 전환 lifecycle | 1 | null→smile→frown→null 단조감소 (중간 튐 없음) |

실행:

```
▶ tests/expression-ticker.test.ts
  17 pass, 0 fail
```

전체 pixi 패키지 테스트: 83 pass, 0 fail (기존 44 + motion-ticker 22 + expression-ticker 17).

### 2.3 렌더러 통합 — `pixi-renderer.ts`

`defaultCreateApp` 내부:

```ts
let expressionState: ExpressionState = initialExpressionState();
let expressionTickerAttached = false;
const expressionTickerCallback = (opts: { deltaMS?: number }): void => {
  const dt = typeof opts.deltaMS === "number" ? opts.deltaMS : 16.6667;
  const frame = advanceExpressionFrame(expressionState, dt);
  expressionState = frame.state;
  root.alpha = frame.alpha;
  if (frame.ended) {
    app.ticker.remove(expressionTickerCallback);
    expressionTickerAttached = false;
  }
};
```

`setExpression` 메서드:

```ts
setExpression(expression) {
  expressionState = setExpressionTarget(expressionState, expression);
  if (!expressionTickerAttached) {
    app.ticker.add(expressionTickerCallback);
    expressionTickerAttached = true;
  }
},
```

이전 18 줄 closure (`elapsed`, `duration`, `startAlpha`, `blinkCallback`,
inline ramp 공식 등) → 6 줄 통합. 순수 함수 호출 + ticker 생명 주기 관리만.
경합 구조 제거.

## 3. 영향 범위

- **변경 파일** 3 개 + **신설** 2 개:
  - `packages/web-avatar-renderer-pixi/src/expression-ticker.ts` (신규)
  - `packages/web-avatar-renderer-pixi/tests/expression-ticker.test.ts` (신규)
  - `packages/web-avatar-renderer-pixi/src/index.ts` (export 추가)
  - `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` (import + setExpression 단순화)
- **기존 테스트 불변** — pixi-renderer 44 개 모두 그대로 통과. mock 의
  `setExpression` 은 단순히 호출 기록만 하므로 본 변경에 영향 없음.
- **P1-S3 대비 거동 차이**:
  - (+) 연속 `setExpression` 경합 제거 — 시각적으로 더 일관됨.
  - (=) 완료 시 alpha 값은 동일 (neutral=0.95, active=1).
  - (=) 램프 시간 및 min 60ms 클램프 동일.
- **web-editor e2e** — halfbody + fullbody 2 템플릿 모두 green (`pnpm --filter
  @geny/web-editor test`).

## 4. 시각 검증 (dev)

`?debug=logger` 로 `expressionchange` 이벤트 타임라인 관찰. 기존 구현에서는
빠른 연속 전환 시 `root.alpha` 가 최종 target 으로 수렴은 하되 중간 프레임이
jittery 할 수 있었으나, 본 변경 후엔 단일 램프가 선형으로만 진행. pixi-renderer
mock 은 `setExpression` 을 그대로 호출 기록하므로 계약 레벨 e2e 는 변함 없음.

## 5. 게이트

- **회귀 테스트**: pixi-renderer 83/83 (motion-ticker 22 + expression-ticker 17 + 기존 44).
- **타입 체크**: `pnpm --filter @geny/web-avatar-renderer-pixi build` green.
- **vendor 전파**: `pnpm --filter @geny/web-editor run build:public` 로 새
  `expression-ticker.js` 가 `public/vendor/web-avatar-renderer-pixi/` 에
  복제됨 (git 추적 대상 아님 — 빌드 산출물).
- **e2e**: web-editor e2e halfbody + fullbody 양쪽 green.
- **워크스페이스 baseline 유지** — exporter-core 107 · post-processing 111 ·
  ai-adapter-core 70 · web-editor-logic 80 · worker-generate 45 fail 0.

## 6. 다음 후보

1. **metrics 패널 UX** (P2-S6 enhancement) — minimize 버튼 + clear 버튼 +
   접기 상태 localStorage. dev 편의.
2. **pivot 오버레이 레이블** (P1-S9 enhancement) — slot_id 텍스트를 마커 옆에
   표시. 밀집 영역 가독성. pixi.Text 사용.
3. **per-part parameter binding 시각화** (P1-S4 enhancement) — 현재 선택된
   슬롯의 binding parameters 를 UI 패널에 표시.
4. **P2-S7** — Prompt 재시도 로직 (실패 시 자동 재생성 1 회). 5000ms 예산
   안에서 timeout 되면 한 번만 재시도.
5. **P3 실 nano-banana** — BL-VENDOR-KEY 블로커 대기.

P1-S10/S11 두 ticker 가 동일 패턴으로 정비돼 P1 생명주기 코드의 회귀 방어선이
완성. 다음은 dev 측 UX (1~3) 또는 P2 다음 step (4) 중 상황에 따라 선택.

## 7. 참조

- `packages/web-avatar-renderer-pixi/src/expression-ticker.ts` (신규 순수 모듈)
- `packages/web-avatar-renderer-pixi/tests/expression-ticker.test.ts` (17 tests)
- `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts:135-146, 817-824`
- `progress/sessions/2026-04-22-P1-S10-motion-ticker-breath-ramp.md` (직전 twin)
- `docs/PRODUCT-BETA.md §3 #3` (motion/expression 검수 기준)
