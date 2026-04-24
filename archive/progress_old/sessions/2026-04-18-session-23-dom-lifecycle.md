# 세션 23 — `<geny-avatar>` DOM lifecycle 회귀 (happy-dom)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 23
- 워크스트림: **Frontend** (`docs/14 §9`) — `<geny-avatar>` 런타임의 브라우저 계약 고정
- 로드맵: Foundation Exit #1 ("실 DOM" 공백) — `progress/exit-gates/01-single-avatar-e2e.md` D 단계의 마지막 무인 축

## 1. 목표

세션 18 에서 구현한 `<geny-avatar>` 커스텀 엘리먼트가 **실제 DOM 이 있는 환경에서도** `src` 속성 → bundle 해석 → `ready`/`error` 이벤트 라이프사이클을 정확히 따르는지 보장한다.

세션 20 의 `apps/web-preview/scripts/e2e-check.mjs` 는 HTTP + `loadWebAvatarBundle()` 체인까지는 자동화했지만, **엘리먼트의 커스텀 엘리먼트 훅(`connectedCallback`/`attributeChangedCallback`/이벤트 디스패치) 자체는 브라우저 수동 검증** 으로 남아 있었다. 이 세션이 그 공백을 CI 안으로 끌어들인다.

```
happy-dom Window → globalThis.{HTMLElement, customElements, CustomEvent, document}
    ↓ registerGenyAvatar()
    ↓ doc.createElement("geny-avatar")
    ↓ el.setAttribute("src", file:///tmp/.../bundle.json)
    ↓ loader.ts (globalThis.fetch → fs fetch override)
    ↓ CustomEvent("ready") / CustomEvent("error")
```

## 2. 산출물 체크리스트

- [x] `packages/web-avatar/package.json` — devDependency `happy-dom: ^15.11.7`
- [x] `packages/web-avatar/tests/dom-lifecycle.test.ts` — 3 신규 테스트
  1. 골든 번들 `setAttribute("src")` → `ready` 이벤트 payload 구조 + `el.bundle` getter 노출 검증
  2. `kind=cubism-bundle` manifest → `error` 이벤트 `WebAvatarBundleError.code="INVALID_KIND"`
  3. 두 번 `setAttribute("src")` — 첫 src 는 깨진 JSON, 두 번째 src 는 골든. stale load 가 `error` 를 쏘지 않고 두 번째만 `ready` 로 정리되는지
- [x] `scripts/test-golden.mjs` — step 10 `web-avatar dom lifecycle` (총 10 step)
- [x] `progress/INDEX.md` — Frontend 스트림 진도 + Exit #1 라인 + Gate 섹션 10 step + 세션 23 row + §8 다음 세션 재정렬

## 3. 설계 결정 (D1–D5)

### D1. happy-dom 채택 이유 — jsdom 아닌

- **속도**: happy-dom 은 jsdom 대비 테스트 스위트에서 수 배 빠름. CI 매 커밋 회귀 대상이므로 가벼움이 가중된다.
- **customElements 완결성**: 15.x 에서 `CustomElementRegistry`/`HTMLElement` 서브클래싱/`attributeChangedCallback` 전부 표준 동작. 기본 케이스에는 jsdom 과 의미상 동일.
- **의존성 트리**: jsdom 은 `canvas`/native 바인딩 체인을 끌어오지만 happy-dom 은 pure JS. Foundation 의 "가볍게 가자" 원칙과 맞물림.

### D2. DOM 전역을 `globalThis` 에 주입한다 — `createGenyAvatarElementClass()` 는 **호출 시점** 의 `HTMLElement` 를 상속

컴파일된 `element.ts` 는 `extends HTMLElement` 를 런타임에 평가한다. 따라서 `registerGenyAvatar()` 를 호출하기 **전에** happy-dom 의 `HTMLElement`/`customElements`/`CustomEvent`/`document` 를 `globalThis` 로 복사해 둔다. `before()` 훅에서 원본을 백업하고 `after()` 훅에서 복원 — 동일 프로세스에서 다른 테스트 파일이 DOM 을 가정하지 않는다는 계약을 유지.

### D3. `globalThis.fetch` 를 fs fetch 로 덮어쓴다

element 는 `loadWebAvatarBundle(url)` 을 `opts.fetch` 없이 호출하므로 loader 는 `globalThis.fetch` 에 폴백한다. happy-dom 의 fetch 는 HTTP 전용(file:// 미지원)이므로, 테스트 전역에서 `fetch` 를 `fsFetch(url)` — `fileURLToPath + readFileSync → Response` — 으로 교체한다. 덕분에 loader 는 "브라우저 fetch 와 동일한 shape" 인터페이스로 호출받으며 내부 경로 분기는 존재하지 않는다.

대안(고려·기각): element 에 `opts.fetch` 를 노출 → 브라우저 API 를 오염시킴. 테스트 전용 경로를 만드는 대신 **런타임 전역을 swap** 하는 쪽이 브라우저-실제 동작과 더 가깝다.

### D4. "stale src" 회귀를 명시적으로 고정

`element.ts` 의 `#loadToken` 증분 로직(세션 18 D2) 은 src 가 빠르게 바뀔 때 이전 결과를 버리도록 설계됐지만, 이 세션 전까지는 테스트가 없었다. 세 번째 테스트는:

1. 첫 src 를 `{not json` (→ `INVALID_JSON` 을 만들 것) 으로 설정
2. 다음 microtask 에서 두 번째 src 를 골든으로 재설정
3. `ready` 를 기다리며 `error` 리스너는 `staleError` 플래그만 세움
4. 끝나고 `staleError === false` 단언

이로써 "마지막 src 만 visible, 이전 src 의 error 는 소거" 계약을 CI 가 지킨다.

### D5. DOM lib 타입 vs happy-dom 런타임 — `globalThis` 주입은 `Record<string, unknown>` 경유

TSC 의 `lib: DOM` 은 `HTMLElement: { new(): HTMLElement }` 를 요구하는데 happy-dom 의 동명 프로퍼티는 별개 클래스 구현체다. 둘은 런타임에 호환되지만 타입이 일치하지 않는다. `globalThis as Record<string, unknown>` 한 번 통과시켜 원본 백업/주입/복원을 하고, 실제 `document`/`el` 참조가 필요한 자리에서만 `as unknown as Document` 로 좁힌다 — "happy-dom 은 DOM 의 호환 구현이다" 라는 전제 자체를 타입 한 줄로 표현.

## 4. 검증 로그

```
$ pnpm run test:golden
[golden] ▶ validate-schemas             ✔  (checked=136)
[golden] ▶ exporter-core tests          ✔
[golden] ▶ bundle golden diff            ✔
[golden] ▶ avatar bundle golden diff     ✔
[golden] ▶ web-avatar bundle golden diff ✔
[golden] ▶ web-preview e2e               ✔
[golden] ▶ license-verifier tests        ✔  (18 tests)
[golden] ▶ ai-adapter-core tests         ✔  (14 tests)
[golden] ▶ ai-adapter-nano-banana tests  ✔  (11 tests)
[golden] ▶ web-avatar dom lifecycle      ✔  (12 tests: 3 신규 + 기존 loader 7 + element 2)
[golden] ✅ all steps pass
```

신규 테스트 3건 개별 실행 시간은 ~3 ms · ~0.6 ms · ~1.7 ms (happy-dom Window 초기화 비용을 제외하면).

## 5. 교차 레퍼런스

- docs/11 §7 Web Avatar 번들 로딩 규약 (kind/schema_version/manifest/files)
- 세션 18 — `<geny-avatar>` + loader 신규 (이 세션 테스트의 피검증자)
- 세션 19/20 — web-preview E2E 드라이버 (외부 HTTP → loader 체인). 세션 23 은 **엘리먼트 내부** lifecycle 을 대신 덮어 서로 상보
- `progress/exit-gates/01-single-avatar-e2e.md` 의 D 단계 — "DOM lifecycle" 축 ✅

## 6. 다음 3세션 재정렬

`progress/INDEX.md §8` 업데이트:

- **세션 24**: Observability Helm chart — Exit #3 완결. `infra/observability/` values.yaml + Prometheus scrape + Grafana provisioning + alertmanager.
- **세션 25**: AI 어댑터 2차 — 실 HTTP nano-banana client + 벤더 에러 매핑 테이블 + SDXL/Flux-Fill 폴백 skeleton + 캐시 키.
- **세션 26**: Post-Processing Stage 1 (alpha cleanup) skeleton 혹은 rig v1.3 body.
