# 세션 45 — Foundation Exit #1 D-시각 자동화 (`<geny-avatar>` HTTP 라이프사이클)

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Frontend · Platform (docs/14 §9, §3.3 Foundation Exit #1)
- **관련 세션**: 19 (web-preview 드라이버), 20 (web-preview HTTP e2e), 23 (`<geny-avatar>` file:// DOM 라이프사이클)
- **관련 체크리스트**: [`progress/exit-gates/01-single-avatar-e2e.md`](../exit-gates/01-single-avatar-e2e.md) D 단계
- **산출물**: `apps/web-preview/scripts/e2e-check.mjs` 확장 (`runDomLifecycle`), `apps/web-preview/package.json` devDep happy-dom, Exit 게이트 문서 D 단계 재편, INDEX §2 Exit #1 체크박스 ✅

---

## 배경

Foundation Exit #1 의 "D. Web 프리뷰" 축은 세션 20 에서 HTTP+loader 축(`loadWebAvatarBundle` 을 서버 URL 에 대해 실행) 까지 자동화되었고, 세션 23 에서 `<geny-avatar>` Custom Element 의 DOM 라이프사이클을 **file:// 픽스처** 로 회귀 테스트했다. 그러나 **"실 브라우저가 실 서빙 중인 bundle.json 에 커스텀 엘리먼트를 붙였을 때 ready 페이로드가 기대값을 담는지"** 는 여전히 체크리스트의 "D-시각 (수동, 선택)" 항목이었다 — Exit #1 이 실질 블록되어 있었던 유일한 잔여 사유.

이 세션은 그 한 항목을 `pnpm --filter @geny/web-preview run test` 의 마지막 단계로 승격해 Exit #1 을 닫는다.

## 설계 결정

### D1. happy-dom + Node native fetch (fs-fetch override 거부)

세션 23 의 `dom-lifecycle.test.ts` 는 happy-dom 의 기본 fetch 가 `file://` 를 지원하지 않아 globalThis.fetch 를 fs 기반으로 override 했다. 이번에는 URL 이 `http://localhost:{port}/...` 이므로 **Node 22 native fetch** (globalThis.fetch) 가 그대로 작동한다. happy-dom 의 내장 fetch 가 아니라 Node 런타임의 것을 쓰는 이유:

- 이미 서버가 올라 있으므로 HTTP 경로는 Node native fetch 의 standard path.
- happy-dom fetch 는 Web Platform 준수에 목표를 두지만 다양한 버전에서 edge case (content-type parse/timeout) 가 달라진다. 우리는 loader 가 보는 `globalThis.fetch` 시맨틱만 안정이면 족함.
- 오버라이드 없음 = 복구해야 할 글로벌 한 개 감소 (테스트 finally 에서 DOM 5개 + window 만 복원).

### D2. D-시각 4항 체크 → ready payload 단일 어서션으로 환원

index.html 인라인 스크립트는 `ev.detail.bundle` 의 필드를 DOM 로 포맷하는 trivial 변환자. 따라서 **payload 자체를 어서션하면 DOM 렌더는 함의된다** — 렌더 로직 버그는 별건 (수동 체크로 남김). 체크리스트 4항과 어서션의 1:1 매핑:

| D-시각 수동 체크 | 자동 어서션 |
|---|---|
| 상태 = `ready — tpl.base.v1.halfbody@1.2.0` | `manifest.template_id === "tpl.base.v1.halfbody"` && `template_version === "1.2.0"` |
| Manifest kind/avatar_id/files(count=3) | `manifest.kind/avatar_id/files.length === 3` |
| Meta parameters/parts/motions/expressions ≥ 1, physics_summary, atlas ref | `meta.*.length > 0` + `meta.physics_summary` + `meta.atlas` |
| Atlas textures = `textures/base.png · 4×4 · png` | `atlas.textures[0].path/width/height/format` |

### D3. `e2e-check.mjs` 확장 (별도 테스트 파일 거부)

별도 Node `--test` 파일로 옮기면 (a) serve.mjs 를 중복 기동하거나 (b) 서버 라이프사이클을 공유하는 테스트 하네스를 새로 써야 함. 이미 `e2e-check.mjs` 가 prepare/serve/HTTP-check/loader-chain 를 시퀀셜로 수행하므로 **동일 서버에 붙여 DOM 라이프사이클만 덧붙이는** 것이 가장 저비용. `runDomLifecycle(bundleUrl)` 함수 1개 추가.

### D4. Exit #1 체크리스트 D 단계 문구 재편

"D-자동 (세션 20 도입)" / "D-시각 (수동, 선택)" 분할 → "D-자동 (세션 20/23/45)" / "D-수동 (선택, Exit 게이트 무관)" 재편. "D-자동 어서션이 D-시각 4항과 1:1 대응" 을 명시해 향후 D-자동이 drift 되면 D-수동 체크리스트도 함께 갱신하라는 신호로 남김.

§2 Exit #1 체크박스 **[x]** 로 전환. **E 단계(Cubism Viewer 실 로딩)** 는 "moc3 placeholder 이므로 구조 검증만 가능" 이라 체크리스트 본문에 이미 선택 항목으로 기술되어 있음 — Foundation Exit 기준에서는 제외한 것이 원래 docs/14 §3.3 의 의도였음을 재확인.

## 실제 변경

- `apps/web-preview/scripts/e2e-check.mjs`
  - 파일 헤더에 세션 45 단계 (5번) 추가.
  - `await runDomLifecycle(`${base}/public/sample/bundle.json`);` 를 loader 체인 뒤에 추가.
  - `runDomLifecycle(bundleUrl)` 함수 신규:
    - `import("happy-dom")` 에서 `Window` 가져옴.
    - `import(pathToFileURL("packages/web-avatar/dist/element.js"))` → `registerGenyAvatar`.
    - window 에서 `HTMLElement/customElements/CustomEvent/Event/document` 를 globalThis 로 복사 (저장/복구 가드).
    - `doc.createElement("geny-avatar")` → appendChild → `setAttribute("src", bundleUrl)` → `waitForEvent(el, "ready", 5000)`.
    - ev.detail.bundle 의 manifest/meta/atlas 필드를 D-시각 체크리스트 4항에 대응해 어서션.
    - finally 에서 `window.happyDOM.close()` + 글로벌 복원.
  - `waitForEvent(target, name, timeoutMs)` 헬퍼 추가.
- `apps/web-preview/package.json` — devDependencies 에 `happy-dom ^15.11.7` 추가 (packages/web-avatar 와 동일 버전).
- `progress/exit-gates/01-single-avatar-e2e.md`
  - D 단계 "D-자동" 항목 문구 업데이트 (세션 45 DOM 라이프사이클 포함) + 1:1 대응 명시 + "D-수동" 선택 항목으로 강등.
  - "알려진 한계" 에서 "Custom Element DOM lifecycle 자동 검증 미구현" 을 ~~취소선~~ + 세션 45 참조로 갱신.
  - "다음 단계 1." 항목을 완료 (세션 23 + 45) 로 표시, 남은 과제를 "실제 렌더링 표면" 으로 한정.
- `progress/INDEX.md`
  - §2 Exit #1 체크박스 **[ ] → [x]**. E 단계를 "선택 항목, Foundation Exit 기준에서 제외" 로 명시.
  - §3 Frontend 행에 세션 45 반영 — web-preview e2e step 6 이 DOM 라이프사이클까지 실행.
  - §4 세션 45 로그 행 추가 (세션 44 뒤, 오름차순 유지).
  - §8 다음 3세션 예고 rotate — 45 제거, 46/47 유지, 48 추가 (Foundation Exit #2 릴리스 게이트 정리).
- `progress/sessions/2026-04-19-session-45-web-preview-dom-lifecycle-http.md` — 본 로그.

## 검증

- `pnpm --filter @geny/web-preview run test` →
  - prepare → serve → HTTP 6종 → loader 체인 → **`<geny-avatar> DOM lifecycle (happy-dom + HTTP)` → ✅** → `✅ web-preview e2e pass`.
  - 로그: `ready payload: tpl.base.v1.halfbody@1.2.0, files=3, motions=7, expressions=3, atlas=textures/base.png`.
- `pnpm run test:golden` → **19/19 step pass** (step 6 `web-preview e2e` 가 DOM 라이프사이클까지 실행). validate-schemas `checked=186` 불변.

## Follow-ups

- 세션 46: ADR 0005 L3 / L4 교차 참조 문서화 (원래 예정대로).
- 세션 47: worker-generate 큐 영속성 검토 (원래 예정대로).
- (신규) 세션 48: Foundation Exit #2 의 비-회귀 4축(성능 SLO / 보안 스캔 / 문서 / 롤백) 중 하나를 CI step 으로 승격 — Gitleaks/Trivy 가 가장 싼 후보.
- 실 브라우저 시각 확인은 여전히 `pnpm --filter @geny/web-preview run dev` 로 가능 — D-수동 체크리스트로 유지. happy-dom 이 CE 라이프사이클만 커버하고 CSS/layout 은 커버하지 않는 경계.

## 커밋

- `apps/web-preview/package.json` (happy-dom devDep)
- `apps/web-preview/scripts/e2e-check.mjs` (runDomLifecycle)
- `progress/exit-gates/01-single-avatar-e2e.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-45-web-preview-dom-lifecycle-http.md`
- `pnpm-lock.yaml` (happy-dom 추가)
