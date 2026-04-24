# P2-S3 — pill timing 측정: prompt → canvas swap latency (2026-04-21)

## 1. 트리거

P2-S2 commit (`f46c3d3`) 직후 β 제품 정의 `docs/PRODUCT-BETA.md §7` 의 핵심
검수 지표 "**프롬프트 입력 → 프리뷰 완결 ≤ 5000ms**" 를 실 제품 경로에서
직접 관측할 수 있어야 β 오픈 가능. P2-S1 의 Generate bar 는 총 시간만 `✓ Xms`
로 찍었지만:

1. **phase 단위 분해가 없음** — 어느 단계가 병목인지 (프롬프트 해석? 텍스처 합성?
   atlas 재구성? 스왑? 실 페인트?) 가늠 불가.
2. **pill 5 (paint) 는 거짓** — `pixiRenderer.regenerate()` 가 fire-and-forget 인데
   그 직후 `Promise.resolve()` 1 회 양보로 pill 5 를 done 마킹. 실 텍스처 디코드
   (비동기) + buildSpriteScene 은 그 뒤에 일어남. 체크박스가 켜진 후에도 화면은
   여전히 구 이미지.
3. **β 예산 시각화 없음** — 5000ms 기준을 어긴 건지 아닌지 표시 없음.

β "실제 비즈니스적 측면" 의 핵심은 **프롬프트 한 줄 → 5초 내 캐릭터가 바뀐다**
라는 체감이 측정 가능해야 한다는 것. 세 결함 전부 P2 범위에서 해결 가능하므로
즉시 진입.

## 2. 산출물

### 2.1 `regenerate()` Promise 반환 (계약 확장)

`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`:

- `PixiAppHandle.rebuild`: `(scene) => void` → `(scene) => Promise<void>`.
- `PixiRendererInstance.regenerate`: `(input) => void` → `(input) => Promise<void>`.
- `applyMeta()`: `void` → `Promise<void>`, `createApp.then` 체인의 rebuild 호출
  프로미스를 그대로 반환 (미재생 motion/expression replay 는 fire-and-forget 유지).
- 내부 `rebuild(scene)` 구현 (returned handle):
  - `loadTexture(url).then(...)` 를 **return** 으로 바꿔서 buildSpriteScene (또는
    fallback) 완료 시점에 resolve.
  - atlas/texture 없는 경로 (fallback grid) 는 동기 완료이므로 `Promise.resolve()`.

호출측이 await 하지 않으면 **기존 fire-and-forget 과 동일** — 하위 호환.

### 2.2 테스트 2 건 추가 (P2-S3)

`packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts`:

- **Promise 반환 검증** — `r.regenerate({ atlas, textureUrl })` 이 thenable 이고,
  await 후 app.rebuildCalls 가 +1, 마지막 호출에 새 textureUrl + atlas 가 반영됨.
- **destroy 후 안전** — `r.destroy()` 직후 regenerate 해도 throw 없이 resolve.

MockApp 의 `rebuild(scene)` 에 `return Promise.resolve()` 추가 (테스트 헬퍼
전체 영향).

결과: **33 pass / 0 fail** (기존 31 + P2-S3 2).

### 2.3 Web-editor per-phase timing + β 예산 시각화

`apps/web-editor/index.html`:

- 새 DOM: `<div id="gen-timing" class="gen-timing" hidden>` — Generate bar 우측
  append. phase 단위 `ingest/synth/atlas/swap/paint Xms` 칩 + `총 Yms` 합계.
- CSS: `.gen-timing .total[data-budget="ok"]` 녹색 배경, `[data-budget="over"]`
  붉은 배경. 5000ms 넘으면 붉은색.
- JS:
  - `PHASE_LABELS = ["ingest", "synth", "atlas", "swap", "paint"]`.
  - `BETA_BUDGET_MS = 5000` 상수 — β §7 명세와 1:1.
  - `markPhaseDone(idx)` 헬퍼가 pill done 전환 + phase 시작-종료 ms 기록.
  - `pixiRenderer.regenerate(...)` 의 반환 Promise 를 await — pill 5 "paint" 는
    실제 loadTexture + buildSpriteScene 완료 시점에 마킹.
  - 상태 문구: 예산 내 `✓ Xms`, 초과 `⚠ Xms (>5000)`.
  - 에러 경로도 phase timing 보존 + 붉은 ✗ Xms.

### 2.4 Cross-test 영향

`pnpm -r test` (17 패키지):

- web-avatar-renderer-pixi: 33/33 (+2)
- web-editor e2e: halfbody + fullbody 전부 green (happy-dom 환경은 pixiRenderer
  없이 `?debug=logger` 경로만 태우므로 Generate bar 미실행 — 회귀 없음)
- 나머지 15 패키지: 변경 없음, 전부 green

## 3. 판단 근거

- **왜 Promise 반환인가?** 이벤트 (`rendergenerated` CustomEvent) 도 대안이었지만
  (1) 호출측이 이미 promise-chain 안에서 await 하기 쉽고 (2) 이벤트는 순서
  (regenerate A + regenerate B → 어느 complete?) 가 모호하다. Promise 는 1:1 매핑.
- **왜 5000ms 를 하드코드?** β §7 이 유일한 권위 기준이고 상수는 거기서 옴. 설정
  가능한 환경 변수로 만들 이유 없음 (β 제품 오픈 기준이지 dev 토글이 아님).
- **왜 phase 단위 breakdown 을 표시하나?** 병목 식별이 목적. β P3 에 실 nano-banana
  통합 시 synth phase 가 벤더 HTTP 라운드트립으로 바뀌는데, 현재 Mock 기준으로
  각 phase 가 몇 ms 인지 기준선 (baseline) 을 남겨두어야 P3 후퇴 감지 가능.
- **왜 DOM node 를 인라인 HTML 로 조립?** genTimingEl 은 trusted 영역 (phase label
  + 정수 ms 만 삽입). 사용자 입력 반영 없음. sanitize 불필요.
- **왜 error 경로도 timing 남김?** "어디서 실패했나" 는 phase 별 완료 시간이
  있으면 stack 없이도 추측 가능 (synth 직후 0ms swap = regenerate 실패 등).

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer-pixi build` → OK.
- `pnpm --filter @geny/web-avatar-renderer-pixi test` → 33 pass / 0 fail.
- `pnpm --filter @geny/web-editor test` → halfbody + fullbody e2e 전부 green.
- `pnpm -r test` → 17 패키지 전수 green.
- 수동 검증 (브라우저 수동 검증은 세션 외 — renderer=pixi 로 띄웠을 때 gen-timing
  노드가 pill 5 까지 올바른 값을 찍는지는 로컬 visual 확인 필요).

## 5. 알려진 한계

- **browser-side 수동 timing 화면 검증 미실행**: 본 세션은 코드 + 유닛 테스트만.
  happy-dom e2e 는 pixiRenderer 를 초기화하지 않으므로 gen-timing 자체 렌더링을
  테스트로 박기 어렵다. β P5 에 실 staging 에서 텔레메트리로 포획 예정.
- **Mock 벤더 특성상 synth phase 가 실 벤더보다 짧다**: 실 nano-banana 합류하면
  synth 가 1~3 초 범위로 늘어남 — 예산 5000ms 안에서 다른 phase 예산이 크게 줄어듦.
  P3 진입 시 phase 별 목표 ms 를 별도 세션 doc 에 고정해야.
- **performance.now() 해상도**: happy-dom 환경은 ms 이하 정확도가 떨어질 수 있으나
  실 브라우저는 µs 단위. 문제 없음.
- **multiple concurrent Generate 미보호**: disabled 버튼으로만 막음. 빠른 double
  click 을 피하는 용도로 충분 — 실제 race 는 발생 안 함.

## 6. 다음 후보

1. **P1-S6 sample atlas.textures[0] PNG 교체** — 현재 4×4 placeholder. Mock
   Generate 전 초기 화면이 "모자이크" 로 보이는 문제.
2. **atlas pivot_uv 확장** — hair/ahoge 실 피벗을 atlas 에서 옴겨 sprite.anchor
   를 UV 기반으로.
3. **P2-S4 텔레메트리 훅** — 각 phase ms 를 `console.info("geny.metrics", ...)` 로
   찍어 P5 에서 Prometheus pushgateway 로 쉽게 집계 가능하게.
4. **P3 대기** — BL-VENDOR-KEY 해제 시 실 HTTPS POST + 분포 캡처.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P2-S2-mock-shape-rendering.md`
- 소스: `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` (regenerate +
  applyMeta + rebuild), `apps/web-editor/index.html` (gen-timing DOM + runGenerate)
- 테스트: `packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts` (2 건 추가)
- β 기준: `docs/PRODUCT-BETA.md §7` (≤5000ms prompt → preview)
- β 로드맵: `docs/ROADMAP-BETA.md` P2 phase
