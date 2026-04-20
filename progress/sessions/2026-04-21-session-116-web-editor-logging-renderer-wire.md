# 세션 116 — `apps/web-editor` 에 `createLoggingRenderer` debug 스위치 wire-through

- **날짜**: 2026-04-21
- **선행**: 세션 115 (`createNullRenderer` / `createLoggingRenderer` 구현체 착지).
- **상태**: ✅ completed.
- **변경 범위**: `apps/web-editor/{index.html,scripts/prepare.mjs,scripts/e2e-check.mjs}`, `progress_0420/{INDEX,PLAN,SUMMARY}.md`, 세션 문서.
- **워크스트림**: Frontend / Platform.

## 1. 동기

세션 114 (계약) + 세션 115 (테스트 더블) 로 `@geny/web-avatar-renderer` 는 "정의 + 두 no-op 구현체" 까지 완결됐지만, **실 consumer 경로가 0개** 였다. 계약 패키지만 있고 소비자가 없으면 (a) 인터페이스가 살아있다는 증거가 테스트 내부에만 존재, (b) ADR 0007 의 Option A/D/E 중 어느 경로가 붙어도 실제 attach 가 어떤 모습일지 감이 안 섬, (c) e2e 가 "consumer 가 이 계약을 먹었을 때 어떤 이벤트 시퀀스가 나온다" 를 고정하지 못함.

세션 116 은 `apps/web-editor` (Foundation 에디터 스캐폴드) 를 **첫 consumer** 로 붙인다. 다만 실 렌더러가 아직 없으므로 `createLoggingRenderer` 를 선택 — (i) DOM/canvas 조작 없음, (ii) 기존 `<geny-avatar>` 계약 (ready/parameterchange) 을 단순히 구독, (iii) dev/debug 용이라 기본 경로에 부담 없음. 붙는 방식은 URL 쿼리 스위치 (`?debug=logger`) 로 gating — 기본 경로에선 dynamic import 자체가 발생하지 않아 네트워크/바이트 무영향.

## 2. 변경

### 2.1 `apps/web-editor/scripts/prepare.mjs`

두 step 추가:

```js
step("build @geny/web-avatar-renderer", () => {
  runPnpm(["--filter", "@geny/web-avatar-renderer", "run", "build"]);
});
// ... (기존 build step 들 사이 자연스러운 위치)
step("copy @geny/web-avatar-renderer dist → public/vendor/web-avatar-renderer", () => {
  const src = resolve(repoRoot, "packages/web-avatar-renderer/dist");
  const dst = join(vendorDir, "web-avatar-renderer");
  cpSync(src, dst, { recursive: true });
});
```

복사 위치 `public/vendor/web-avatar-renderer/` 는 web-editor-renderer / web-editor-logic 과 동일한 이웃 패턴. 브라우저에서 `import("./public/vendor/web-avatar-renderer/index.js")` 로 fetch 가능하고, vendor dist 가 없으면 dynamic import 가 조용히 fail (catch 로 swallow) — 에디터 본연은 영향 없음.

### 2.2 `apps/web-editor/index.html`

스크립트 상단에 URL 파라미터 감지 + 세션 91 StructureRenderer 생성 직후 dynamic import 블록:

```js
const debugFlag = new URLSearchParams(location.search).get("debug") ?? "";
const debugLoggerEnabled = debugFlag.split(",").map((s) => s.trim()).includes("logger");
let debugLoggingRenderer = null;

// ... (createStructureRenderer 호출 이후)
if (debugLoggerEnabled) {
  import("./public/vendor/web-avatar-renderer/index.js")
    .then(({ createLoggingRenderer }) => {
      debugLoggingRenderer = createLoggingRenderer({
        element: el,
        logger: (event) => {
          console.debug("[geny-avatar/logger]", event);
        },
      });
      console.info("[geny-avatar/logger] attached via ?debug=logger");
    })
    .catch((err) => {
      console.warn("[geny-avatar/logger] dynamic import failed", err);
    });
}
```

`debug=logger,other` 처럼 쉼표 조합도 지원 (여러 스위치 동시 사용 대비). `[geny-avatar/logger]` prefix 로 엔진 로그 / 다른 console 메시지와 구분. setParameter write-through / motion / expression 기존 경로는 바뀐 게 없음 — logger 는 순수 side-channel.

### 2.3 `apps/web-editor/scripts/e2e-check.mjs`

`runLoggingRendererDebug(bundleUrl, expect)` 신규 스텝. `runRendererMount` 직후 각 템플릿마다 호출. happy-dom + `@geny/web-avatar-renderer` dist 를 `pathToFileURL` 로 import:

- `createLoggingRenderer` 를 `<geny-avatar>` 에 attach (logger 는 events 배열에 push).
- `src` 세팅 → ready → `readyCount=1`, `partCount=expect.partsTotal`, `events.length=1`, `events[0].kind="ready"`, `events[0].meta.parts.length=expect.partsTotal`.
- `setParameter(firstParam, mid)` → parameterchange → `events.length=2`, `events[1].kind="parameterchange"`, `events[1].detail.value=mid`, `parameterChangeCount=1`.
- `loggingRenderer.destroy()` → `events.length=3`, `events[2].kind="destroy"`.
- 추가 setParameter → `<geny-avatar>` 는 여전히 발화하지만 logger 리스너는 제거됨 → `events.length` 3 유지 (post-destroy silence 증명).

e2e 출력:
```
[e2e] LoggingRenderer debug stream (happy-dom + HTTP)
  ✓ logger captured: ready(parts=30) → parameterchange(face_overall_x=0) → destroy (events=3)
```
halfbody + fullbody 양쪽 green.

### 2.4 `progress_0420/{INDEX,PLAN,SUMMARY}.md`

- INDEX §1 "세션 115 직후" → "세션 116 직후". 패키지 행에 "`apps/web-editor` 가 `createLoggingRenderer` 를 `?debug=logger` URL 스위치로 소비 (첫 소비 경로)" 한 줄. CI 게이트 행에 "세션 116 — `web-editor e2e` 에 LoggingRenderer assertion 추가 (3-event 스트림 고정)" 반영. Frontend 워크스트림 행 확장.
- PLAN 헤더 "116+" → "117+". §3 완료 표에 세션 116 ✅. §7 "다음 즉시 행동" 을 세션 117 로 전진 — 후보 J(renderer-observer 가칭, 신중 판단) / 후보 K(ready payload attachment 문서화) / 후보 I(Server Headless Renderer ADR, 보류).
- SUMMARY 헤더 115 → 116. 타임라인 항목 17 로 세션 116 append. §13 pending 표에 web-editor wire-through 행 ✅ 추가.

## 3. 결정

### D1 — **dynamic import vs static import**

후보 1(static): `index.html` 최상단에 `import { createLoggingRenderer } from "./public/vendor/web-avatar-renderer/index.js"` 를 무조건 추가. URL 파라미터에 따라 attach 만 분기.
후보 2(**채택**): 동적 import — URL 파라미터가 켜졌을 때만 fetch.

채택 이유:
- **바이트 무영향**: 기본 경로 사용자는 `web-avatar-renderer` 를 fetch 하지 않는다. `prepare.mjs` 는 여전히 dist 를 copy 하지만, runtime fetch 는 스위치 켜졌을 때만.
- **계약 패키지 불변 증거**: dynamic import 는 import graph 에 web-avatar-renderer 를 "옵션" 으로 표현. 추후 ADR 0007 Decision 이 Option A(PixiJS) 로 나와도 LoggingRenderer 는 debug side-channel 로 남는 구조가 자연스러움.
- **dev-only 스위치** 는 "기본 경로에 없는 것이 디폴트" 인 쪽이 발자국 축소.

### D2 — **URL 쿼리 (?debug=logger) vs HTML 속성 (`<geny-avatar debug="logger">`)**

후보 1(**채택**, URL 쿼리): `?debug=logger` 하나를 쉼표로 여러 스위치 묶을 수 있게 (`?debug=logger,perf`).
후보 2(HTML 속성): `<geny-avatar debug="logger">` 로 마크업에 박음. 속성 변경 감지로 hot-swap 가능.

채택 이유:
- **URL 쿼리는 **에디터 전체 상태** 에 속한다** — StructureRenderer / 파츠 사이드바 등 다른 곳도 함께 영향 받을 수 있는 dev 스위치. `<geny-avatar>` 는 계약 패키지(`@geny/web-avatar`) 이므로 debug 속성을 추가하려면 계약을 건드려야 함 → 진입 비용 큰 데 비해 소비자 1 곳뿐.
- **QA/세션 공유 시 편리**: "`?debug=logger` 붙여서 새로고침" 이 링크 하나로 재현 가능. HTML 속성은 페이지 내 스크립팅 필요.
- **후보 K 와의 관계**: ready payload 에 attachment point 를 추가하게 되더라도 URL 쿼리 감지 로직은 그대로 유지 가능.

### D3 — **console.debug prefix vs 에디터 오버레이 DOM**

후보 1(**채택**, console.debug + prefix): `console.debug("[geny-avatar/logger]", event)` 로 브라우저 devtools 에 흘림. 필터링은 devtools 의 text search 로.
후보 2(오버레이 DOM): 에디터 좌하단에 고정 오버레이 div 를 만들고 이벤트 스트림을 DOM 에 쏟아 부음.

채택 이유:
- **최소 발자국**: DOM 오버레이는 CSS / 위치 / 스크롤 처리 / overflow 추적 등 에디터 UI 와 얽힘. dev 스위치 한 번에 그 비용 지불은 비례 안 맞음.
- **console.debug** 는 브라우저 기본값에서 감춰져 있음 — 의도치 않게 스위치 켠 사용자가 console 폭발로 놀라지 않음. 필터 on 해야만 보임.
- **Prometheus 연결 잠재력**: LoggingRenderer 의 `logger` 는 임의 sink 주입 가능 (세션 115 D3). 추후 오버레이가 필요해지면 같은 스위치로 logger 만 교체.

### D4 — **e2e 에 신규 step vs `runDomLifecycle` 확장**

후보 1(**채택**): `runLoggingRendererDebug` 를 **별도 step** 으로 추가. `runRendererMount` 다음 위치. happy-dom window / globalThis 저장·복원 루프 자체 포함.
후보 2: `runDomLifecycle` 안에 LoggingRenderer assertion 을 끼움.

채택 이유:
- **lifecycle 독립성**: LoggingRenderer 의 `destroy()` 후 post-destroy silence 검증은 세션 90 의 setParameter write-through 검증과 독립한 path. 한 스텝에 섞으면 destroy 타이밍과 currentMotion/currentExpression 검증이 겹쳐 읽기 어려움.
- **실패 시 진단 용이**: 별도 step 이라 실패 로그에서 `[e2e] LoggingRenderer debug stream` 한 줄로 지점 특정 가능.
- **재사용 잠재**: 향후 `runNullRendererDebug` 가 추가될 때 같은 패턴 재활용.

### D5 — **prepare.mjs 의 copy 위치**

`public/vendor/web-avatar-renderer/` 로 copy. 형제 `web-editor-renderer`, `web-editor-logic` 과 동일한 패턴이며 HTML 의 import path 도 대응:
- prepare step 순서: clean → build exporter-core/web-avatar/logic/renderer/**web-avatar-renderer** → copy web-avatar / web-editor-logic / web-editor-renderer / **web-avatar-renderer** → assemble templates → write INDEX.

copy 는 `web-editor-renderer` 와 인접하게 두어 "두 렌더러 패키지는 dist 이웃" 인 구조를 유지. 향후 ADR 0007 Accept 시 `@geny/web-avatar-renderer-pixi` 가 등장하면 같은 디렉터리 패턴으로 증가하게 자연스럽다.

## 4. 테스트 결과

- `apps/web-editor e2e` — halfbody + fullbody 양쪽에서 `runLoggingRendererDebug` pass. ready(parts=30/38) → parameterchange → destroy (events=3) 고정.
- **골든**: `node scripts/test-golden.mjs` → **30 step all pass**. 세션 115 에서 수정한 `web-avatar-renderer` build 선행 패턴이 그대로 작동 (downstream dist 참조 idempotent).
- **회귀**:
  - `@geny/web-avatar-renderer` unit tests 21 green (세션 115 결과 불변).
  - `@geny/web-editor-renderer` 기존 tests green.
  - `<geny-avatar>` happy-dom lifecycle + renderer mount 기존 어서션 전부 green.
- **빌드 바이트**: `public/vendor/web-avatar-renderer/` 가 신규 생성 (`index.js` + 4 모듈 dist). 기본 `index.html` 은 import 하지 않으므로 네트워크 fetch 0.

## 5. 영향 · 후속

- **계약 패키지 첫 consumer 확보**: `@geny/web-avatar-renderer` 가 "테스트 내부에서만" 살아있던 단계 → apps/web-editor 가 `?debug=logger` 로 debug 소비하는 단계로. ADR 0007 Decision 이 나오기 전에 "계약이 UI 경로에 꽂혔을 때 어떤 stream 이 흐르는가" 를 고정.
- **e2e 레이어**: 3-event 스트림 (ready → parameterchange → destroy) 이 halfbody/fullbody 양쪽에서 assertion 으로 프리즈됨. 추후 실 렌더러 합류 시 같은 assertion 을 NullRenderer 대신 PixiRenderer 로 돌려도 pass 해야 한다는 **계약의 구체적 표현**.
- **Prometheus 연결 여지**: LoggingRenderer 의 logger 는 임의 sink 주입 가능 — 세션 117 후보 J(`renderer-observer` 가칭) 가 logger 를 감싸 이벤트 집계(ready 회수, parameterchange intra-delay 히스토그램)를 `observability-*` exposition 포맷으로 뽑을 수 있음.
- **docs 업데이트 없음**: ADR 0007 Draft 상태 유지. `docs/14 §9` UX 행 영향 없음 (debug 스위치는 Foundation 목표 범위 밖).
- **세션 117 후보** (자율 모드 내에서 안전):
  - (J, **후보** 신중 판단) `renderer-observer` — `createLoggingRenderer` 위에 얇은 집계 층. 실 렌더러 없이 시그널 노이즈 위험 있음 — 의견 필요.
  - (K, 후보) `<geny-avatar>` ready payload 의 renderer-observer attachment point README 추가. 계약 수정 없음.
  - (I, 보류) Server Headless Renderer ADR — ADR 0007 Open Question #3 사용자 답변 선행.

## 6. 커밋

- 단일 커밋: `feat(web-editor): createLoggingRenderer debug 스위치 wire-through (세션 116)`.
