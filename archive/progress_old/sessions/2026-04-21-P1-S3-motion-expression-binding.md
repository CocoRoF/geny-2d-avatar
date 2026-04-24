# P1-S3 — motion/expression → pixi 바인딩 (2026-04-21)

## 1. 트리거

P1-S2+P2-S1 수직 슬라이스 commit (`c7ffc85`) 직후 자율 iteration. 세션 doc
`2026-04-21-P1-S2-P2-S1-prompt-to-avatar-slice.md §6` 가 자율 후보로 꼽은 세 축
중 첫째: **motion/expression 이벤트가 state 만 브로드캐스트되고 pixi 렌더러에
반영되지 않는다**. 본 세션에서 해소.

외부 블로커 없음 — `<geny-avatar>.playMotion` / `.setExpression` 계약 + web-editor
UI 버튼은 이미 세션 94 / 117 에 존재. 단지 pixi 가 구독하지 않았을 뿐.

## 2. 산출물

### 2.1 `@geny/web-avatar-renderer` contract 확장

- `src/contracts.ts` 에 4 타입 신설:
  - `RendererMotion` — `{pack_id, duration_sec, fade_in_sec, fade_out_sec, loop}`
    (WebAvatarMotion 의 렌더러 관점 축소).
  - `RendererExpression` — `{expression_id, name_en, fade_in_sec, fade_out_sec}`.
  - `RendererMotionStartEventDetail` — `{pack_id, motion}`.
  - `RendererExpressionChangeEventDetail` — `{expression_id | null, expression | null}`.
- `src/index.ts` — 4 타입 re-export.
- Null/Logging renderer 는 motion/expression 구독 안 함 (기존 ready/parameterchange
  만 로깅). 본 세션 scope 밖.

### 2.2 `@geny/web-avatar-renderer-pixi` 구독 + Mock 애니메이션

- `src/pixi-renderer.ts` — 5 축 확장:
  - `PixiRenderer` 인터페이스에 `lastMotion`, `lastExpression`, `motionStartCount`,
    `expressionChangeCount` getter 추가.
  - `PixiAppHandle` 인터페이스에 `setMotion(motion | null)`, `setExpression(expression | null)`
    메서드 추가.
  - `onMotionStart(evt)` / `onExpressionChange(evt)` 핸들러 — detail shape 검증 (id 타입,
    motion/expression payload 유효성) 후 state 캐시 + `app.setMotion/setExpression` 호출.
  - `applyMeta` 성공 직후 `lastMotion` / `lastExpression` 이 있으면 `app.setMotion/setExpression`
    를 한 번 재생 — createApp 비동기 완료 전에 발사된 이벤트를 놓치지 않게.
  - `destroy()` 에 `motionstart` / `expressionchange` 리스너 제거 추가.
- `defaultCreateApp` 내부 — Mock 애니메이션 구현:
  - `setMotion(motion)` with `loop=true` → `app.ticker.add(tickerCallback)` 로
    root.scale.y 에 진폭 4% sine (주기 `motion.duration_sec` 초) 를 건다.
    `fade_in_sec` 동안 진폭 0→100% 선형 램프.
  - `setMotion(null)` → `fade_out_sec` 동안 100→0% 램프 후 ticker 제거 + `scale.set(1,1)`
    복귀.
  - `setMotion(motion)` with `loop=false` → 현재는 no-op (one-shot curve 는 실
    motion3 asset 이 있어야 의미, β P3+).
  - `setExpression(expression|null)` → root.alpha 를 `fade_in_sec` 동안 현재값→1
    (또는 0.95 for null) 로 선형 블렌드. 실 parameter delta 합성은 β P3+.

### 2.3 테스트 — 20→25 (+5)

- `tests/pixi-renderer.test.ts` — `MockApp` 에 `setMotionCalls`, `setExpressionCalls`
  stub. 5 새 테스트:
  - `motionstart 이벤트 → app.setMotion 호출` — 기본 idle.default motion, loop=true,
    `motionStartCount=1`, `lastMotion.pack_id="idle.default"`.
  - `expressionchange 이벤트 → app.setExpression 호출 (id + null 양쪽)` — 순차 smile→null,
    `expressionChangeCount=2`, setExpressionCalls=[smile, null].
  - `createApp 완료 전 motion/expression 이 오면 app ready 후 replay` — `defer:true`
    MockFactory 로 초기 상태에서 이벤트 2개 발사 → `flushCreate()` 후 setMotion/setExpression
    각 1회 호출 검증 (late-app catch-up).
  - `malformed motion/expression ignored` — null detail, pack_id 만 있는 payload,
    expression payload 누락 → count 증가 없음.
  - `destroy 후 motion/expression 이벤트 no-op` — removeEventListener 확인.
- 총 25/25 pass (pixi-renderer 패키지).
- 그 외 workspace (exporter-core 106, web-avatar-renderer 21, web-avatar 20,
  web-editor e2e halfbody+fullbody) 회귀 없음.

## 3. 판단 근거

### 3.1 왜 contract 에 motion/expression 축을 추가했나

Null/Logging 은 구독 안 하지만, pixi (그리고 미래 자체 런타임) 는 필요. 기존
`RendererReadyEventDetail` 확장 (P1-S2) 과 같은 원칙: 렌더러 계약 패키지가
**single source of truth**, 각 구현체는 optional 구독. `<geny-avatar>.setMotion` /
`.setExpression` 스키마 전체를 노출하는 대신 렌더러가 실제로 쓰는 필드만 추려낸
축소 타입을 선언 — ADR 0007 Option E "렌더러가 native 타입을 앱에 누수시키지 않는다"
원칙 유지.

### 3.2 왜 loop=true motion 만 breath 에 바인딩했나

β 샘플 번들의 motion 중 실제로 "바로 보여야 의미 있는" 것은 `idle.default` 같은
loop 뿐. one-shot (`greet.*`, `surprise.*`) 은 curve 데이터가 있어야 자연스럽고,
curve 없이 duration_sec 만 재생하면 의미 없는 freeze 가 된다. β P3+ 에서 실
motion3 asset 합류 시 loop=false 경로를 붙이면 충분.

### 3.3 왜 scale.y sine 으로 breath 을 구현했나

"motion 이 살아있다" 를 시각적으로 증명하는 가장 저렴한 단서. 실 Cubism 이라면
각 파라미터별 curve 를 평가해 파츠 단위 변형을 주지만, β 는 Mock 이므로 root
container 에 단일 변환만 걸면 충분. 진폭 4% 는 "숨쉬는 느낌" 과 "파츠가 떨어지는
느낌" 의 경계. `scale.x` 는 건드리지 않아 얼굴이 가로로 뭉그러지지 않도록.

### 3.4 왜 expression 은 alpha 블렌드로?

표정 전환은 파츠 교체 (눈/입 모양) 로 표현해야 실감나지만 파츠 교체는 (i) 실
expression asset 의 parameter delta 가 필요하고 (ii) 현 번들의 slot_id ↔ expression
맵핑이 없다. alpha 1→0.95 순간적 dimming 은 **"지금 expression 이 바뀌었다"** 라는
상태 전환을 시각적으로 암시하는 최소 구현. web-editor 의 expression 버튼 클릭 시
캔버스에서 잠깐 어두워졌다 돌아오면 이벤트 루프가 살아있음을 확인 가능.

### 3.5 왜 app ready 전 이벤트를 replay 했나

`createApp` 은 async (실 PIXI 는 WebGL init) 이고, 사용자가 그 사이에 playMotion 을
호출하면 이벤트가 발사되지만 app=null 이라 setMotion 호출이 스킵된다. `lastMotion`
state 는 업데이트되지만 화면엔 반영 안 됨 — **silent bug**. `applyMeta` 성공 콜백
에서 lastMotion/lastExpression 을 한 번 flush 하면 순서 무관하게 catch-up 가능.

## 4. 검증

- [x] `@geny/web-avatar-renderer` build pass (TS clean)
- [x] `@geny/web-avatar-renderer-pixi` build pass (TS clean)
- [x] `@geny/web-avatar-renderer-pixi` test — 25/25 pass (+5 P1-S3)
- [x] `apps/web-editor` e2e — halfbody + fullbody (motion/expression round-trip 포함)
      회귀 없음
- [x] `pnpm -r test` — workspace 전체 fail 0
- [ ] **브라우저 실 motion 확인** — 헤드풀 자동화 없음. 사용자가
      `pnpm --filter @geny/web-editor run dev` → `?renderer=pixi` 접속 → motion
      버튼 (`idle.default` 등) 클릭 → **캔버스가 숨쉬듯 미세하게 y scale 이 변동**
      하는 것을 눈으로 확인 필요.

## 5. 제약 / 알려진 한계

- **Mock 애니메이션** — 실 motion3 curve 재생 아님. root container 전체가 같이
  움직인다 (파츠별 curve 분리는 β P3+ 에서 실 asset 합류 시). 표정 역시 파츠 교체
  없이 stage alpha 만 건드림.
- `setMotion(loop=false)` 는 현재 no-op. one-shot motion 은 curve 없이 의미가 없음.
- `app.ticker` 의존 — 실 PIXI.Application 에만 있는 API. MockApp 은 `setMotion` /
  `setExpression` 호출만 기록하고 ticker 는 돌리지 않음 (Node 테스트에선 ticker
  타이밍 검증 비결정론).
- Null/Logging 렌더러는 motion/expression 이벤트를 구독하지 않음. `?debug=logger`
  경로로 motion 호출을 확인하려면 logging-renderer 를 확장하거나 web-editor 가
  별도 로깅 훅을 붙여야 함 (본 세션 scope 밖).
- expression alpha blink 은 순간 0.95→1 복귀 — 미묘한 깜빡임. 누적 alpha 계산은
  현재 startAlpha 에서 targetAlpha 로 직접 선형 보간하므로, 여러 expression 이 빠르게
  연속 호출되면 마지막만 적용 (겹침 처리 없음). β 스코프 수용.

## 6. 다음 step

자율 후보 (외부 블로커 없음):

- **P2-S2**: Mock 생성기 품질 개선 — 눈/입 기본 도형을 그려 "아바타" 같게 (실
  벤더 이미지 이전 UX 품질 증명).
- **P2-S3**: Generate 5-pill 진행을 실 측정 timing 으로 — P2 종료 기준 "5 초 내
  완결" 을 정량화.
- **P1-S4**: parameter → 파츠별 변환 (현재 root 전체 rotation 만). parts[].parameter_ids
  를 참조해 해당 슬롯 sprite 만 회전/스케일. 실 Cubism 의 "파라미터 → 디포머 →
  파츠" 체인의 최소 버전.
- **P2-S4**: motion/expression 을 Generate pill 에 녹이기 — 프롬프트에서 감정
  추출 → 자동 expression 전환 (Mock 기반).

외부 블로커 대기 (자율 진입 금지):

- P3 — BL-VENDOR-KEY (GCP + Gemini API 키)
- P5 — BL-STAGING (K8s + DNS + TLS)

## 7. 참조

- [`progress/sessions/2026-04-21-P1-S2-P2-S1-prompt-to-avatar-slice.md`](./2026-04-21-P1-S2-P2-S1-prompt-to-avatar-slice.md) — 직전 세션 (프롬프트→픽셀 파이프라인)
- [`packages/web-avatar-renderer/src/contracts.ts`](../../packages/web-avatar-renderer/src/contracts.ts) — `RendererMotion` / `RendererExpression`
- [`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`](../../packages/web-avatar-renderer-pixi/src/pixi-renderer.ts) — `onMotionStart` / `onExpressionChange` + breath ticker
- [`packages/web-avatar/src/element.ts`](../../packages/web-avatar/src/element.ts) — `playMotion` / `setExpression` (세션 94 원본)
- [`apps/web-editor/index.html`](../../apps/web-editor/index.html) — motion/expression 버튼 UI (이미 존재)
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — Option E Accepted
- `memory/feedback_autonomous_mode_closed.md` — 자율 β 범위 근거
