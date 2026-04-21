# P1-S1 — PixiJS 렌더러 scaffold + ADR 0007 Option E Accept (2026-04-21)

## 1. 트리거

SOAK-01/02 가 "결정 로그 단일화 + 소진 재확인" 으로 자율 doc churn 을 이어갔는데, 사용자가 직접
`제대로 진행해 그리고 불필요한 산출물 계속 만들지 말라고` 지시. 이는 곧 외부 블로커 보수성을
과도하게 해석해 실 코드 진전을 막고 있었다는 correction. ADR 0007 의 "권장 기본값" 이었던 Option E
(하이브리드) 를 본 세션에서 정식 Accept 하고, P1 첫 스텝으로 PixiJS 렌더러 패키지 scaffold 를
마친다.

## 2. 산출물

### 2.1 `progress/adr/0007-renderer-technology.md` — Status Accepted

- `Status: Draft (pending decision)` → `Accepted — Option E (hybrid, PixiJS primary → 자체 런타임 GA)`
- `## Decision` 섹션 교체 (공란 목록 → 결정 근거 + 구현 경로 4 항목)
- Follow-ups 첫 두 항목 checked, P1-S2 후속 항목 추가

### 2.2 `packages/web-avatar-renderer-pixi/` (신규, 15 패키지째)

- `package.json` — PixiJS v8.6 dep, `@geny/web-avatar-renderer` workspace 의존
- `tsconfig.json` / `.build.json` / `.test.json` — 기존 `web-avatar-renderer` 패키지 패턴 준수
- `src/atlas-uv.ts` — `atlasUvToFrame(rect, texture)` pure 함수 (정규화 UV → PIXI 픽셀 frame).
  NaN/Infinity guard + 0-width 1px floor + out-of-range clamp
- `src/pixi-renderer.ts` — `createPixiRenderer({ element, mount, createApp?, rotationParameter?, backgroundColor? })`
  팩토리. 이벤트 구독 / 생명주기 / rotation math 는 synchronous 이고, 실 PIXI.Application 은
  `createApp` DI 로 동적 로드 — 테스트에서 WebGL 없이 mock 주입 가능.
- 실 `defaultCreateApp` 은 `await import("pixi.js")` 로 dynamic load → `PIXI.Application.init()`
  → `PIXI.Container` 루트 → 파츠당 `PIXI.Graphics` 색상 사각형 (slot_id hash → HSL 색) grid 배치
  + stage 중심 pivot 회전.
- `src/index.ts` — 공개 exports (`createPixiRenderer`, 타입 5 종, `atlasUvToFrame` + 관련 타입 3 종)
- `README.md` — 역할 / 사용 / 옵션표 / P1-S1 범위 / 테스트 전략 / 관계 / 참조
- `tests/atlas-uv.test.ts` — 5 케이스 (basic / non-square / clamp / NaN-Inf / zero-width)
- `tests/pixi-renderer.test.ts` — 10 케이스 (초기 idle / ready → init / late-attach / 재-ready 시
  app 재사용 / rotation deg→rad / custom rotationParameter / malformed 거부 / destroy 정리 /
  pending init 중 destroy / init failure → idle)
- **총 15 tests pass**, 0 fail

### 2.3 `apps/web-editor/scripts/prepare.mjs` 확장

- `build @geny/web-avatar-renderer-pixi` 단계 추가
- `copy @geny/web-avatar-renderer-pixi dist → public/vendor/web-avatar-renderer-pixi` 단계
- `copy pixi.js ESM bundle → public/vendor/pixi.min.mjs` 단계 — pixi v8 의
  `node_modules/pixi.js/dist/pixi.min.mjs` self-contained ESM 번들(797KB 원본, ~200KB gzip)을
  복사. 별도 bundler 단계 불필요.

### 2.4 `apps/web-editor/index.html` 통합

- `<script type="importmap">` 추가 — `"pixi.js"` → `./public/vendor/pixi.min.mjs`. 이렇게 하면
  `@geny/web-avatar-renderer-pixi` 가 하는 `import("pixi.js")` 가 브라우저에서 해석됨.
- `.pixi-mount` CSS 블록 — `.stage-inner` 안 absolute inset:0, z-index:0. 기존 SVG 구조 프리뷰는
  z-index:1 으로 상단 스택 + pointer-events 유지.
- `<div class="pixi-mount" id="pixi-mount"></div>` DOM 노드 삽입 — `<geny-avatar>` 직전
- `?renderer=pixi` URL 쿼리가 있으면 `./public/vendor/web-avatar-renderer-pixi/index.js` 를
  dynamic import → `createPixiRenderer({ element: el, mount: pixiMountEl })`. 실패는 console.warn
  만 하고 에디터 본연은 영향 없음.

### 2.5 `progress_0420/PLAN.md` + `progress_0420/INDEX.md` 갱신

- PLAN §0 현재 상태 — β Phase P1 🟡 로 bump, ADR 0007 Accepted 표기
- PLAN §2 P1 행 — ⚪ 대기 → 🟡 S1 완료 · S2+ 진행, 시작 조건 체크박스 ✅
- INDEX §1 현재 상태 — SOAK-02 섹션을 P1-S1 스냅샷으로 교체, 누적 패키지 14 → 15

## 3. 판단 근거

### 3.1 왜 "SOAK-03" 대신 P1-S1 인가

사용자 correction 이 직접 명령한 바. 이전 SOAK 시리즈는 `feedback_autonomous_mode_closed.md`
의 (a)(b)(c) 소진 조건 판정이 과도하게 보수적이었음을 드러냈다. 외부 블로커가 **실 제품 가치
판정** 을 차단하지 않는 범위 (예: ADR 자체가 "권장 기본값 Option E" 이라 적고 있고, 사용자 지시가
"제대로 진행" 이면 그 권장값 Accept 는 합리적 자율 결정)까지 막고 있던 것.

### 3.2 왜 P1-S1 의 범위를 "파츠 그리드" 로 닫았나

- 샘플 번들의 `atlas.json.slots` 가 현재 빈 배열. 리그 템플릿 → 번들 변환 파이프라인이 atlas 슬롯
  UV 를 아직 populate 하지 않음. 따라서 실 텍스처 스프라이트 렌더는 번들 파이프라인 보강 없이
  불가능.
- **그러나** PixiJS 채널이 열리고 이벤트 파이프가 살아있다는 걸 보이는 scaffold 자체는 실 제품
  가치. 후속 S2 에서 atlas 슬롯이 채워지면 `atlasUvToFrame` 이 그대로 투입될 수 있도록 pure
  helper 를 **미리 unit tested 상태로** 뽑아뒀다.
- 파츠당 색상 사각형 grid 는 placeholder 가 아니라 "**구조 렌더의 PixiJS 버전**" — 같은 역할을
  하는 SVG 구조 프리뷰(`@geny/web-editor-renderer`) 의 pixel 재구현이고, head_angle_x 회전까지
  바인딩돼 있어 `<geny-avatar>` 계약을 실제로 드라이브한다.

### 3.3 왜 `createApp` DI 패턴인가

Pure Node `--test` 환경에선 WebGL 컨텍스트를 만들 수 없어 실 PIXI.Application init 이 실패한다.
두 선택지:

- (a) happy-dom + canvas polyfill + headless-gl 삽입 — 의존성 폭발
- (b) 생성 훅 주입 DI — pixi 자체를 mock 으로 치환 가능

(b) 를 채택. 렌더러 본체 (이벤트 구독 / 생명주기 / deg→rad math / late-attach / destroy 정리)
는 pure TypeScript 이므로 WebGL 없이도 전부 검증 가능. 실 pixel 은 브라우저 통합으로 확인.

### 3.4 왜 pixi.js 를 CDN 이 아니라 vendored 번들로 쓰나

CDN 의존은 β 납기 단계에서 외부 서비스 장애에 노출. `node_modules/pixi.js/dist/pixi.min.mjs` 는
이미 self-contained ESM 이므로 `cpSync` 한 줄로 브라우저 resolver 에 붙일 수 있다. importmap 이
`"pixi.js"` 별칭을 이 파일로 해석 → 동적 import 가 그대로 작동.

## 4. 검증

- [x] `pnpm install` 에서 pixi.js@8.18.1 설치 확인 (Workspace 이전 11 패키지 + pixi.js 새 dep)
- [x] `packages/web-avatar-renderer-pixi` build: 0 type error
- [x] `packages/web-avatar-renderer-pixi` test: 15/15 pass (atlas-uv 5 + pixi-renderer 10)
- [x] `apps/web-editor` prepare: pixi 번들 + 렌더러 패키지 vendor 복사 성공
- [x] `apps/web-editor` e2e (`pnpm run test`): halfbody + fullbody 시나리오 **전부 회귀 없음**.
      기존 ready / parameterchange / motion / expression / SVG renderer / LoggingRenderer 어서션
      모두 그대로 통과 — `?renderer=pixi` 가 default 경로를 건드리지 않음을 확인.
- [ ] **브라우저 실제 렌더 확인** — 본 환경에서 헤드풀 브라우저 자동화가 없어 직접 확인 불가.
      `pnpm --filter @geny/web-editor run dev` 실행 후 브라우저에서 `http://localhost:<port>/?renderer=pixi`
      로 접속해 "파츠당 색상 사각형 grid + head_angle_x slider 로 회전" 을 사용자가 확인해야 함.

## 5. 제약 / 알려진 한계

- 샘플 번들의 atlas.slots = []: 현재 pixi 렌더는 실 텍스처 없이 구조 프리뷰만 그린다. P1-S2 에서
  rig-template → 번들 파이프라인이 slot UV 를 populate 하면 `atlasUvToFrame` + `PIXI.Sprite` 조합으로
  즉시 전환 가능.
- PIXI.Application init 은 비동기 — 첫 ready 이벤트 후 수 ms 동안은 `stage === "initializing"`.
  이 window 에 destroy 가 들어와도 handle 이 생성된 뒤 즉시 destroy 되도록 test 로 covered.
- happy-dom e2e 에 pixi 경로 어서션은 아직 없음. WebGL 폴리필이 happy-dom 에 없으므로 본 레이어
  커버는 브라우저 통합(향후 Playwright/Puppeteer lane) 또는 수동 확인에 의존.

## 6. 다음 step

- **P1-S2**: 리그 템플릿 → `assembleWebAvatarBundle` 경로에서 atlas slot UV populate. 이후 pixi
  렌더가 `PIXI.Sprite` + `atlasUvToFrame` 조합으로 교체. 현재 placeholder 색상 사각형은 제거.
- **P1-S3**: parameter 다수 바인딩 — 단일 head_angle_x 회전 외에 eye_open_l/r, mouth_form 등 3~4
  파라미터를 실제 파츠 변형으로 반영.
- **P1-S4**: motion/expression 플러그 — 현재 motion/expression 이벤트는 ack 만 되고 pixi 에는
  반영 안됨. 간단 motion curve 재생 (idle.default) 한 개 연결.
- **P1-S5**: P1 검수 (`docs/ROADMAP-BETA.md §3` 의 P1 종료 기준) — 브라우저 aria 실제 픽셀 + slider
  변형 실반영 확인.

## 7. 참조

- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — Accepted Option E
- [`progress_0420/PLAN.md §2`](../../progress_0420/PLAN.md) — P1 상태 bump
- [`packages/web-avatar-renderer-pixi/README.md`](../../packages/web-avatar-renderer-pixi/README.md) — 패키지 문서
- [`docs/ROADMAP-BETA.md §3`](../../docs/ROADMAP-BETA.md) — Phase P1 세부 기준
- `memory/feedback_autonomous_mode_closed.md` — 본 세션에서 사용자 correction 으로 재해석된 규약
- 이전 세션: [`2026-04-21-SOAK-02-external-block-reconfirmation.md`](./2026-04-21-SOAK-02-external-block-reconfirmation.md)
