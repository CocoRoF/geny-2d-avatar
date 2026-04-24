# P1-S10 — pixi motion ticker: breath fade ramp 순수 함수 분리 + 회귀 고정 (2026-04-22)

## 1. 트리거

P1-S3 에서 도입한 breath (loop=true) 의 "sine scale.y × fade_in/out 선형 램프"
로직이 `defaultCreateApp` closure 내부에 mutable 변수 (`breathMotion`,
`breathElapsedMs`, `breathRampMs`, `breathRampDurationMs`, `breathRampFactor`,
`breathRampDirection`) 로 파묻혀 있어 **DOM/pixi 없이 단위 테스트가 불가능**
했다. 이 공식이 한 픽셀이라도 바뀌면 "아바타가 숨쉬듯 살아있다" 는 β 제품
정의 §3 #3 (파라미터 반영 + motion/expression) 의 시각 인상이 즉각 깨진다.
특히 fade_in/out 의 선형성이나 period floor (500ms) 같은 invariant 는 육안
검증이 어려워 회귀가 은닉되기 쉬운 구조.

`regenerate` (P2-S3) 이나 `setPartTransform` (P1-S4) 처럼 최근 세션들이 동일한
"순수 함수로 추출 → node:test 22+ 개로 고정" 패턴을 일관되게 써온 것과 달리
breath ticker 만 black box 로 남아 있어 구조상 취약점이었다.

## 2. 산출물

### 2.1 순수 함수 모듈 — `motion-ticker.ts`

`packages/web-avatar-renderer-pixi/src/motion-ticker.ts` 신설:

```ts
export interface BreathState {
  readonly motion: RendererMotion | null;
  readonly elapsedMs: number;
  readonly rampMs: number;
  readonly rampDurationMs: number;
  readonly rampDirection: "in" | "out";
  readonly rampFactor: number;
}

export interface BreathFrame {
  readonly state: BreathState;
  readonly scaleY: number;
  readonly ended: boolean;
}

export function initialBreathState(): BreathState;
export function startBreath(prev: BreathState, motion: RendererMotion): BreathState;
export function stopBreath(prev: BreathState): BreathState;
export function advanceBreathFrame(prev: BreathState, dtMs: number): BreathFrame;

export const BREATH_AMPLITUDE = 0.04;
export const BREATH_MIN_PERIOD_MS = 500;
```

- **모두 순수 함수** — 입력 state 를 mutate 하지 않고 새 state 반환. renderer
  는 프레임마다 `breathState = advanceBreathFrame(breathState, dt).state` 로
  교체만.
- **`startBreath`**: loop=true motion 만 채택. fade_in_sec=0 은 즉시 amplitude
  최대 (rampFactor=1, rampDurationMs=0).
- **`stopBreath`**: fade_out 방향으로 전환. fade_out_sec=0 은 motion=null 로
  즉시 해제 (renderer 는 ticker.remove + scale.set(1,1) 를 자체 처리).
- **`advanceBreathFrame`**: 1) ramp 진행 → rampFactor 업데이트 2) ramp_out
  완료 시 `ended=true` + state.motion=null 3) sine phase 는 elapsedMs 로 계속
  진행 (fade_out 중에도 호흡 주기 유지).
- **상수 공개**: `BREATH_AMPLITUDE` (±4 %), `BREATH_MIN_PERIOD_MS` (500ms
  floor — 짧은 duration 이 주파수 폭발을 유발하지 않게).

### 2.2 renderer 리팩터 — `pixi-renderer.ts`

기존 mutable 6 변수를 `breathState: BreathState` 단일 레퍼런스로 통합. ticker
callback 은 ~30 줄 → 8 줄로 축소:

```ts
let breathState: BreathState = initialBreathState();
let tickerAttached = false;
const tickerCallback = (opts: { deltaMS?: number }): void => {
  const dt = typeof opts.deltaMS === "number" ? opts.deltaMS : 16.6667;
  const frame = advanceBreathFrame(breathState, dt);
  breathState = frame.state;
  root.scale.set(1, frame.scaleY);
  if (frame.ended) {
    app.ticker.remove(tickerCallback);
    tickerAttached = false;
  }
};
```

`setMotion` 도 `startBreath` / `stopBreath` 두 헬퍼로 대체:

```ts
setMotion(motion) {
  if (motion === null) {
    const prevMotion = breathState.motion;
    breathState = stopBreath(breathState);
    if (!prevMotion) return;
    if (breathState.motion === null) {
      if (tickerAttached) { app.ticker.remove(tickerCallback); tickerAttached = false; }
      root.scale.set(1, 1);
    }
    return;
  }
  if (!motion.loop) return;
  breathState = startBreath(breathState, motion);
  if (!tickerAttached) { app.ticker.add(tickerCallback); tickerAttached = true; }
}
```

### 2.3 package export — `index.ts`

`advanceBreathFrame` · `initialBreathState` · `startBreath` · `stopBreath` ·
`BREATH_AMPLITUDE` · `BREATH_MIN_PERIOD_MS` · `BreathState` · `BreathFrame` 전부
named export. 외부 툴 (debug 오버레이 확장 · 렌더러 대체 구현) 이 동일한 ramp
공식을 재사용 가능.

### 2.4 단위 테스트 — 22 신규 (66 total)

`packages/web-avatar-renderer-pixi/tests/motion-ticker.test.ts`:

**initialBreathState** (2)
- motion=null / rampFactor=0 / rampDurationMs=0.
- initial 에서 advance 호출해도 scaleY=1 + ended=false + state 불변.

**startBreath** (4)
- loop=true → motion/elapsed/ramp 초기화, rampDirection="in".
- loop=false → state 불변 (breath 로 잡지 않음).
- fade_in_sec=0 → 즉시 rampFactor=1.
- 기존 breath 위에 재-startBreath 하면 elapsedMs/rampMs 리셋.

**advanceBreathFrame fade_in** (3)
- 500ms/1000ms → rampFactor≈0.5 (선형).
- rampMs ≥ durationMs → rampFactor=1 + rampDurationMs=0.
- rampFactor=0 동안 scaleY 는 [1-AMP, 1+AMP] 범위.

**advanceBreathFrame sine amplitude** (2)
- fade_in 완료 후 풀 사이클 스윕 — min/max 가 ±AMP 범위 내 + 충분한 스윕.
- duration_sec=0.1 같은 극단값에서 period floor 500ms 적용 → 주파수 폭발 방지.

**stopBreath** (3)
- prev.motion=null → no-op.
- fade_out_sec>0 → rampDirection="out" + rampMs=0 + rampFactor 보존
  (jump-cut 방지).
- fade_out_sec=0 → motion 즉시 null + 다음 advance 에서 ended=false
  (이미 종료, 재신호 없음).

**fade_out 완료** (4)
- t=0.5 → rampFactor=0.5.
- 완료 시 ended=true + state.motion=null + scaleY=1.
- ended=true 이후 advance 는 scale=1 + ended=false (한 번만 신호).
- dt 오버슛 (1000ms 램프에 dt=1500) → 한 번에 ended.

**dt 방어** (2)
- dt=NaN → dt=0 취급 (elapsedMs 불변).
- dt<0 → dt=0 취급 (역진 방지).

**라이프사이클 통합** (2)
- fade_in 1s → sustain 4s → fade_out 1s → ended 정확히 마지막 tick.
- sustain 중 새 motion 으로 교체하면 fade_in 재시작 (rampFactor=0 + 새 duration).

### 2.5 zero behavioral change

리팩터 후에도 `pixi-renderer.test.ts` 44 개 기존 테스트 전부 pass — 실 렌더러
경로 (`setMotion` / `setExpression` / `ready` / `parameterchange` / `destroy`)
동작 불변. motion-ticker 22 개는 추가분.

## 3. 판단 근거

- **왜 순수 함수로?** ticker callback closure 는 pixi.Application 인스턴스 +
  `app.ticker.add/remove` + `root.scale.set` 셋 모두에 결합돼 있어 node:test
  에서 관측 불가. 상태 전이를 값으로 분리하면 "fade_in 500ms 지나면 rampFactor
  =0.5 여야 함" 같은 수학적 invariant 를 직접 assert 할 수 있다.
- **왜 `BreathState` 를 single object 로?** 6 mutable 변수는 "어느 하나가
  다음 세션에서 drift 되면 다른 5 개가 잘못 감응" 하는 원인. 단일 immutable
  state 로 통합하면 각 함수의 계약(입력 state → 출력 state)이 명시화.
- **왜 `ended` 플래그가 필요?** advanceBreathFrame 은 순수 함수라 pixi
  ticker 를 `remove` 할 수 없음. 렌더러가 `frame.ended` 를 관찰해 ticker 제거
  + scale 복귀를 책임. `state.motion=null` 로도 구분 가능하지만 **"방금 종료
  됐음"** 과 **"원래부터 꺼져있음"** 을 분리하는 explicit signal 이 호출측
  조건 분기를 간결하게 함.
- **왜 dt 방어 (NaN/음수)?** pixi.js 내부가 deltaMS 를 항상 양수로 주지만,
  테스트에서 mock ticker / 디버거 stepping / WebView tab 백그라운드 복귀
  같은 엣지 케이스가 있음. 입력 가드는 2 줄 비용. drift 원인 차단.
- **왜 `BREATH_MIN_PERIOD_MS = 500`?** motion JSON 저작자가 실수로
  duration_sec=0.01 을 넣어도 주파수 100Hz sine 으로 폭발하지 않게. 500ms 는
  breath 의 생리학적 하한 (분당 120회) 근처. 주파수 clamping 은 실 curve
  합류 (β P3+) 시점에도 그대로 유지 가치 있음.
- **왜 rampFactor 보존 (stopBreath)?** fade_in 중 (rampFactor=0.3) 에 갑자기
  stop 하면 fade_out 은 0.3 에서 출발해야 연속. `stopBreath` 에서 rampFactor
  를 1 로 덮어쓰면 순간 jump 가 보임 — "숨쉬기를 멈추는데 갑자기 숨이 크게
  들어옴" 같은 부자연스러움.
- **왜 renderer 측의 `tickerAttached` 이중 추적?** pixi.ticker.add 는 동일
  callback 을 중복 등록하면 두 번 실행됨 (pixi 8 문서). 순수 함수는 이를
  모르므로 renderer 가 boolean 플래그로 방지.
- **왜 기존 `breathMotion`/`breathElapsedMs` 등 6 변수를 뗐나?** `BreathState`
  에 모두 흡수됐는데 남겨두면 "레거시 변수가 뭘 하는지" 혼란 + 중복 원인.
  단일 source-of-truth 원칙.

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer-pixi build` — green.
- `pnpm --filter @geny/web-avatar-renderer-pixi test` — **66/66 pass** (44
  기존 pixi-renderer 전부 불변 + 22 신규 motion-ticker).
- `pnpm -r test` — 전 패키지 **fail 0**. exporter-core 107, post-processing
  111, web-editor-logic 80, ai-adapter-core 70 등 불변.
- `pnpm --filter @geny/web-editor run build:public` — vendored
  `public/vendor/web-avatar-renderer-pixi/motion-ticker.js` + 타입 파일
  업데이트.
- `pnpm --filter @geny/web-editor test` — halfbody + fullbody e2e **green**.
  motion/expression round-trip 동작 불변 확인.

## 5. 알려진 한계

- **sine phase 는 fade_out 중에도 계속 진행** — 의도. 호흡 주기 끊기면 "숨이
  갑자기 멈춘" 느낌. 다만 fade_out 끝에서 sin phase 가 비극점 (±AMP) 에 걸려
  있으면 마지막 scaleY 가 1 이 아닌 값에서 ended 로 전환될 수 있음. 현재는
  `ended=true` 프레임에서 강제 scaleY=1 반환으로 해결 — 시각적으로 부드러움.
- **loop=false motion 은 여전히 미지원** — one-shot greet/wave 같은 모션은
  실 curve 데이터 없이는 의미 없음. β P3+ 에서 실 expression/motion asset
  합류 시점까지 보류. 현재는 `setMotion(loop=false)` 가 silent no-op.
- **ramp curve 는 선형만** — 실 Cubism ease-in/ease-out 커브는 미지원.
  β 단계의 "subtle breath" 에서는 선형도 충분히 자연스럽지만, 실 asset 에서
  Cubism3 fade curve (`Beziers`) 를 받게 되면 `advanceBreathFrame` 의
  `t → rampFactor` 매핑을 교체해야 함.
- **expression blink 은 여전히 closure 안** — `blinkCallback` 은 별도 ticker
  로 stage.alpha 를 건드리는데 본 세션에서는 추출하지 않음. 실 expression
  delta blending 합류 (β P3+) 시점에 같은 패턴으로 분리할 후보.
- **multi-motion 동시 재생 미지원** — 여러 loop motion 이 동시에 동작하는
  시나리오 (breath + subtle sway) 는 현재 한 slot 에 상태를 단일로 둠. 실
  Cubism 은 layer 합성이 가능하지만 β 는 1 slot 만.

## 6. 다음 후보

1. **expression blink 순수 함수화** — 본 세션과 동일한 패턴으로
   `stage.alpha` ramp 를 pure 로 추출 (P1-S10 의 twin).
2. **metrics 패널 접기 / clear UX** — P2-S6 의 dev 패널에 minimize 버튼 +
   reset 버튼.
3. **pivot 레이블** — P1-S9 pivot 오버레이에 slot_id 텍스트 부착, 밀집
   영역 가독성.
4. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-22-P2-S6-debug-metrics-panel.md`
  (P2-S6 이 동일한 "logic 패키지 순수 함수 분리 + 단위 테스트" 패턴)
- 선행 세션: P1-S3 breath ticker 도입 (session
  `progress/sessions/2026-04-22-P1-S3-motion-expression-ticker.md`
  — 본 세션이 회귀 테스트 층을 보강)
- 이번 세션 변경:
  - `packages/web-avatar-renderer-pixi/src/motion-ticker.ts` (신규)
  - `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` (ticker
    closure 단순화 + import 추가)
  - `packages/web-avatar-renderer-pixi/src/index.ts` (새 exports)
  - `packages/web-avatar-renderer-pixi/tests/motion-ticker.test.ts` (22 신규)
- β 문서: `docs/PRODUCT-BETA.md §3` #3 (motion/expression — 본 세션이 breath
  공식 invariant 고정)
