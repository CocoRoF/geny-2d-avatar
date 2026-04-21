# P1-S6 — 초기 로드 avatar 자동 프리뷰 (2026-04-21)

## 1. 트리거

P2-S3 commit (`db9e0ef`) 직후. β 데모 경로를 실 사용자 시선으로 다시 걸어보면:

1. 에디터 로드 → `<geny-avatar>` 가 번들을 읽는다.
2. pixi 렌더러가 atlas.textures[0] (sample PNG) 를 그대로 로드해 sprite 를 띄운다.
3. 그런데 `apps/web-editor/public/sample/halfbody/textures/base.png` 은 **4×4 placeholder**.
   sprite 마다 UV 로 잘라 확대하면 각 slot 이 **단색 블러**로 나타남.
4. 사용자는 이 "네모난 색칠판" 을 먼저 보고, Generate 를 눌러야 비로소 P2-S2 에서
   만든 mock avatar 를 본다.

첫 인상이 **β 제품 정의 §2 "프롬프트 한 줄로 캐릭터가 태어난다"** 와 정반대의
느낌 — "일단 모자이크부터". 자동 프리뷰를 기본값으로 한 번 돌려주면 이 간극
해소. Generate 버튼은 그대로 "프롬프트 입력 → 변형" 의미로 남고, 초기 상태는
avatar 가 **이미 있는** 것처럼 보인다.

## 2. 산출물

### 2.1 `runAutoPreview()` 헬퍼 (apps/web-editor/index.html)

- 선결 조건: `pixiEnabled && pixiRenderer && pixiRenderer.lastAtlas`. 어느 하나라도
  없으면 no-op (silent skip).
- `autoPreviewDone` 플래그로 단일 실행 보장. 템플릿 스왑 시 `swapTemplate()` 이
  false 로 리셋 → 템플릿 바꿀 때마다 새 디폴트 프리뷰.
- prompt 는 `default · <template>` (예: `default · halfbody`) — 해시 기반이라
  템플릿별로 결정적 테마.
- 기존 `mockGenerateTexture` + `pixiRenderer.regenerate` 파이프라인 그대로 재사용
  (P2-S1+S2+S3 인프라가 이미 갖춰져 있음). Pill animation 은 스킵 — 이건 조용한
  부트스트랩이지 사용자 액션이 아님.
- gen-status 는 "준비" 유지 → Generate 버튼 결과와 구분.
- 실패 시 autoPreviewDone 을 false 로 되돌려 재시도 가능하게.

### 2.2 ready + late-attach 두 경로 모두 훅

pixi 렌더러는 `<geny-avatar>` 의 `ready` 이벤트에서 `captureBundle` 해
`lastAtlas` 를 채운다. 두 이벤트 순서 레이스가 두 갈래:

1. **pixi 가 먼저 attach**: 그 뒤에 bundle ready → 동일 이벤트의 여러 listener 중
   에디터의 listener 가 먼저 실행될 수 있음 → lastAtlas 가 아직 비어있을 때 실행.
   해결: `queueMicrotask` 2 단 중첩으로 동일 dispatch 의 모든 sibling listener
   실행 이후로 연기.
2. **bundle 이 먼저 ready**: pixi 가 dynamic import 로 나중에 attach → late-attach
   경로에서 이미 있는 bundle 을 읽어 captureBundle → lastAtlas 채움. 이 경우 ready
   이벤트는 이미 지나간 뒤. 해결: pixi 활성이면 `setInterval(50ms, 30회)` 로 최대
   1.5s 동안 lastAtlas 출현 대기 → 가장 먼저 만족한 쪽에서 실행 + clearInterval.

두 경로는 idempotent (autoPreviewDone 플래그로 중복 방어).

### 2.3 `swapTemplate` 에서 리셋

```js
function swapTemplate(bundleUrl) {
  autoPreviewDone = false; // β P1-S6 — 템플릿 전환 시 재실행.
  ...
}
```

halfbody ↔ fullbody 토글하면 새 템플릿의 디폴트 프리뷰가 자동 생성.

### 2.4 TDZ 회피

모듈 스크립트(`type="module"`) 는 strict mode + `let` TDZ. `swapTemplate` 이
`autoPreviewDone` 을 참조하는데 원래 P1-S6 코드 블록 안에 `let` 이 있었음. 함수
호출 시점엔 초기화가 끝나있지만 **선언 순서상 TDZ 가 문제**가 됐을 수 있어
`let autoPreviewDone = false` 를 파일 상단 (pixiRenderer 선언 근처) 로 올림.

## 3. 판단 근거

- **왜 PNG 파일을 실제로 교체하지 않나?** 가능한 대안이었지만:
  1. PNG 를 Node.js 에서 만들려면 node-canvas 등 네이티브 의존 도입 → 저장소 부담.
  2. 클라이언트 측 Mock 은 이미 100% 구현됨 (P2-S2). 굳이 중복 베이크할 이유 없음.
  3. 실 벤더 (β P3+) 가 들어오면 초기 이미지는 어차피 서버-생성 방향으로 바뀐다.
     PNG 바이너리를 git 에 고정해두면 그때 다시 정리해야 함.
  4. 클라이언트 생성은 프롬프트-의존 → 테마가 달라져도 자연스럽게 따라감.
- **왜 "default · halfbody" 같은 prompt?** 템플릿 이름이 섞여있으면 halfbody/fullbody
  해시가 달라져 다른 색감이 뜬다. "사용자가 바꾼 게 없으면 템플릿 고유의 기본색"
  이라는 느낌. "default" 만 쓰면 두 템플릿이 같은 색이 되어 "바뀌긴 한 건가?"
  혼동 유발.
- **왜 pill animation 없이?** 사용자 액션이 아닌 부트스트랩이므로 "로딩 중 UI"
  수준의 조용한 작업. pill 이 빠르게 깜빡이면 오히려 어수선.
- **왜 interval 30 회(1.5s) 만?** pixi 가 attach 안 되면(예: importmap 실패)
  무한 폴링 안 됨. 1.5s 도 초과하면 dev 환경 문제라 판단해 포기.
- **왜 queueMicrotask 2 단?** 1 단이면 sibling listener 도 microtask 일 경우
  (실제 그렇진 않지만 방어) 순서 뒤집힐 수 있음. 2 단이면 현재 dispatch 에서
  등록된 모든 handler 가 확실히 끝난 후 실행. 비용은 microtask 1 개 더.

## 4. 검증

- `pnpm --filter @geny/web-editor test` → halfbody + fullbody e2e pass.
- `pnpm -r test` → 17 패키지 전수 green (33 pixi + 57 editor-logic + ... 변경 없음).
- 수동 검증: brower 에서 `?renderer=pixi` 로 열었을 때 초기 화면이 4×4 모자이크가
  아니라 avatar shape 으로 보여야 — 세션 외 수동 검증 필요.

## 5. 알려진 한계

- **브라우저 수동 검증 미실행**: happy-dom e2e 는 pixi 를 초기화하지 않아 auto-preview
  루틴이 자동 테스트로 잡히지 않음. 실 브라우저 수동 확인이 필요.
- **프롬프트 입력 무시**: 부트 시점에 사용자가 이미 prompt 를 입력해뒀다면 (예:
  페이지 리로드 + 브라우저 자동완성), auto-preview 는 여전히 "default" 로 돈다.
  사용자가 Generate 를 눌러야 진짜 프롬프트가 반영됨. prompt 가 비어있지 않으면
  부트 시 그 값으로 호출하는 옵션이 대안이지만 오히려 혼란 — β 기본 경험은
  "아무것도 입력 안 해도 avatar 가 있다" 쪽이 자연스럽다.
- **Late attach polling 은 clock-based**: 느린 환경에서 1.5s 넘게 걸리면 porridge.
  실 배포 환경에선 importmap 이 번들 CDN 에 붙으므로 50ms~200ms 이내 완료가 상식.
- **flash of unstyled (4×4 sprite) 는 여전히 존재**: placeholder PNG 렌더링 ~
  auto-preview 완료 사이 수백 ms. 완전 제거하려면 pixi rebuild 시점부터
  textureUrl 을 non-placeholder 로 유도해야 하는데, 그건 번들 제작 레이어까지
  건드려야 해서 β 범위 밖. 짧게 스쳐지나가는 저글 정도로 수용.

## 6. 다음 후보

1. **atlas pivot_uv 확장** — hair/ahoge 등 상단 파츠의 실 피벗을 atlas 에서 (β P3+).
2. **P2-S4 텔레메트리 훅** — auto-preview + runGenerate 의 phase ms 를
   `console.info("geny.metrics", ...)` 로 로깅 (Prometheus pushgateway 대비).
3. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.
4. **P4 5 슬롯 자동 조립** — P3 이후.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P2-S3-pill-timing-measurement.md`
- 소스: `apps/web-editor/index.html` (`runAutoPreview` + ready hook + late-attach polling)
- 이전 P2-S2 shape 인프라: `apps/web-editor/index.html#mockCategoryOf` 이하
- 이전 P2-S3 Promise 계약: `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`
- β 제품 정의: `docs/PRODUCT-BETA.md §2` (첫 인상 약속)
