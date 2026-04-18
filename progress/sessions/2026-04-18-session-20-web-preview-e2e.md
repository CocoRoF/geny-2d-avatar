# Session 20 — web-preview 자동 E2E + `test:golden` step 6

- 날짜: 2026-04-18
- 스트림: Platform/Infra + Frontend
- 관련 docs: `docs/14 §3.3` (Foundation Exit #1), `progress/exit-gates/01-single-avatar-e2e.md`
- 전제: 세션 19 (`apps/web-preview/` 드라이버 + 수동 체크리스트) 완료.

## 0. 목표

Foundation Exit #1 체크리스트 D 단계(웹 프리뷰)를 **CI 에서 자동 회귀**하도록 만든다.
세션 19 는 "재현 가능한 수동" 까지였다 — 브라우저를 켜야 D 가 성립. 본 세션은 D 를
무인 실행 가능한 최소 경로로 분해하고 `test:golden` 에 붙인다.

## 1. 설계 선택

### D1 — Playwright 대신 Node `http` + `fetch` + dynamic import

- **고려한 옵션**:
  - (A) Playwright headless Chromium 으로 `<geny-avatar>` 의 `ready` 이벤트까지 훅.
  - (B) happy-dom/jsdom 을 Node 에 주입하고 Custom Element 직접 호출.
  - (C) Node 내장만으로 HTTP 서빙 축 + loader 체인 축만 검증, Custom Element 실 DOM 은 뒤로.
- **선택**: (C).
- **이유**:
  - Foundation 은 "의존성 zero" 가 원칙. Playwright 설치 시 ~300MB Chromium 다운로드
    + CI 캐시 풋프린트. 온보딩 시간과 PR 체크아웃 비용이 늘어남.
  - happy-dom/jsdom 도 추가 deps. Custom Element lifecycle 중 실제로 위험한 부분
    (WebGL/paint) 은 현 Stage 2 범위에 없음 → 지금 happy-dom 을 까는 것은 과투자.
  - 실 위험 소스는 (1) 서버가 파일을 올바른 MIME 으로 내보내는가 · (2) loader 가
    bundle.json → web-avatar.json → atlas.json 체인을 끝까지 타는가. 이 둘 모두
    Node runtime 만으로 검증 가능.
- **영향**: 자동화 대상은 HTTP + loader 축. Custom Element DOM 은 수동 D-시각 단계로
  유지 + 세션 23 후보로 예약.

### D2 — `e2e-check.mjs` 는 임시 포트 + 서버 수명 관리

- `PORT=0` 대신 `net.createServer(0)` 으로 free port 얻고 즉시 close → `serve.mjs` 에
  그 포트를 `PORT` env 로 전달. 두 병렬 CI job 이 충돌하지 않음.
- `spawn("node", ["scripts/serve.mjs"], { stdio: ["ignore", "pipe", "inherit"] })` 로
  stdout 만 파이프 → `readline.once("line")` 으로 "listening" 로그를 기다림.
  5 초 타임아웃. 그 외 stderr 는 그대로 부모로 흘려 디버깅 친화.
- 검증 후 `serveProc.kill("SIGTERM")` + `once(child, "exit")` 로 깔끔히 종료.

### D3 — loader 는 **컴파일된 dist/loader.js** 를 dynamic import

- `apps/web-preview` 에 타입스크립트 변환을 끌어들이지 않도록 `repoRoot/packages/web-avatar/dist/loader.js` 를
  `pathToFileURL` 로 import.
- 이미 `prepare.mjs` 가 `@geny/web-avatar` 를 빌드함 → 해당 스크립트 이후이므로 dist
  존재 보장. 별도 `ensureBuilt` 헬퍼 불요.
- Loader 자체가 "실제 런타임 코드" 이므로 loader 코드 변경은 e2e 가 자동 감지.

### D4 — 체크리스트 D 를 **D-자동 + D-시각** 으로 분할

- D-자동: `pnpm --filter @geny/web-preview run test` 1 커맨드. CI 필수.
- D-시각: `pnpm --filter @geny/web-preview run dev` + 브라우저 확인. 선택적 (PR 리뷰
  시 UI 회귀가 의심되면).
- 의미: Foundation Exit #1 합격 판단에서 "D ✅" 를 CI 만으로도 충족 가능.

### D5 — `test:golden` 에 step 6 으로 합병

- 별도 job 이 아니라 기존 6 step 러너의 마지막 단계로 붙임 (세션 10 패턴 유지).
- 이유: 골든 비교(step 3~5) 가 실패하면 e2e 도 무의미. 순서적 의존성.
- 영향: CI time 은 ~2.3s 증가 (prepare + serve + 6 HTTP + loader 체인).

## 2. 변경 파일

### 신규
```
apps/web-preview/scripts/e2e-check.mjs
progress/sessions/2026-04-18-session-20-web-preview-e2e.md (이 문서)
```

### 수정
```
apps/web-preview/package.json              # scripts.test = node scripts/e2e-check.mjs
scripts/test-golden.mjs                    # STEPS 에 "web-preview e2e" 엔트리 + runWebPreviewE2E
progress/exit-gates/01-single-avatar-e2e.md # D 섹션 자동/시각 분할, E 섹션 6 step 표기, 다음 단계 업데이트
progress/INDEX.md                          # session 20 row, Exit #1 서브태스크 보강, Platform/Frontend 스트림, §6 게이트, §8 다음 3세션
```

## 3. `e2e-check.mjs` 단계별 계약

1. `runPrepare()` — `spawnSync node scripts/prepare.mjs` 실행. exit != 0 이면 throw.
2. `findFreePort()` — `net.createServer()` + `listen(0)` + `.address().port` + 즉시
   close. race 가능하나 테스트 스코프에서 무시 가능 수준.
3. `startServer(port)` — `spawn node scripts/serve.mjs PORT=port`. stdout 첫 줄이
   `http://localhost:<port>/` 를 포함하면 resolve. 5 초 타임아웃.
4. `checkHttp(url, mimePrefix)` — `fetch(url)` → status 200, `content-type`
   startsWith mimePrefix, body drain (`arrayBuffer`) 로 소켓 누수 방지.
   - 6 URL: `/`, `/public/sample/{bundle,web-avatar,atlas}.json`,
     `/public/sample/textures/base.png`, `/public/vendor/index.js`.
5. `runLoaderChain(bundleUrl)` — `loadWebAvatarBundle` dynamic import 후:
   - `manifest.kind == "web-avatar-bundle"`,
     `template_id == "tpl.base.v1.halfbody"`, `template_version == "1.2.0"`,
     `avatar_id == "avt.preview.halfbody.demo"`, `files.length >= 3`.
   - `meta.parameters.length > 0`, `meta.parts.length > 0`,
     `meta.textures[0].path == "textures/base.png"`.
   - `atlas.textures.length == 1`, `atlas.textures[0].path == "textures/base.png"`.
6. finally: `serveProc.kill("SIGTERM")` + await exit. `process.exit(0|1)`.

## 4. 검증 로그

### 4.1 단독 실행 (`pnpm --filter @geny/web-preview run test`)
```
[e2e] prepare public/ (build → copy → assemble)
[web-preview/prepare] ✅ ready — run `pnpm run serve`
[e2e] start serve.mjs on port 53780
[e2e]   ✓ http://localhost:53780/ (text/html; charset=utf-8)
[e2e]   ✓ http://localhost:53780/public/sample/bundle.json (application/json; charset=utf-8)
[e2e]   ✓ http://localhost:53780/public/sample/web-avatar.json (application/json; charset=utf-8)
[e2e]   ✓ http://localhost:53780/public/sample/atlas.json (application/json; charset=utf-8)
[e2e]   ✓ http://localhost:53780/public/sample/textures/base.png (image/png)
[e2e]   ✓ http://localhost:53780/public/vendor/index.js (text/javascript; charset=utf-8)
[e2e] loadWebAvatarBundle chain
[e2e]   ✓ manifest files=3, meta parameters=46, atlas textures=1
[e2e] ✅ web-preview e2e pass
```

### 4.2 `pnpm run test:golden` (6 step)
```
[golden] ▶ validate-schemas
[golden] ✔ validate-schemas
[golden] ▶ exporter-core tests
[golden] ✔ exporter-core tests
[golden] ▶ bundle golden diff
[golden] ✔ bundle golden diff
[golden] ▶ avatar bundle golden diff
[golden] ✔ avatar bundle golden diff
[golden] ▶ web-avatar bundle golden diff
[golden] ✔ web-avatar bundle golden diff
[golden] ▶ web-preview e2e
[golden] ✔ web-preview e2e (2342 ms)
[golden] ✅ all steps pass
```

### 4.3 회귀 (다른 축 변동 없음)
- `pnpm run validate:schemas` → checked=133 failed=0 (세션 18 대비 변동 없음).
- exporter-core tests → 93 tests pass (세션 18 대비 변동 없음).
- golden diff 3종 byte-equal (halfbody/avatar/web-avatar).

## 5. Foundation Exit 상태 변화

`progress/INDEX.md §2`:
- **Exit #1** 서브태스크: "세션 19 드라이버 완" → "세션 19 드라이버 + 세션 20 D 자동화" 로 확장.
  CI 에서 `test:golden` 이 grin 하면 D 는 통과로 인정. 남은 숙제는 A~C 수동 1 사이클
  + D-시각 브라우저 확인.
- **Exit #2**: CI 회귀는 5 step → 6 step 으로 확장.

## 6. 알려진 한계 / 후속

- `<geny-avatar>` Custom Element 의 DOM lifecycle (`ready` 이벤트 페이로드, `src`
  attribute change reload) 은 **여전히 수동 D-시각에서만 검증**. 세션 23 에서
  happy-dom 기반 스냅샷 테스트 고려.
- 서버 포트 race (findFreePort 와 startServer 사이) 는 이론상 존재. 현실적으로
  Node CI 환경에서 재현되지 않아 보류.
- `content-type` 검증은 prefix match — charset 변동에 robust 하지만 MIME 오타는
  놓칠 수 있음 (예: `application/jsan`). Stage 3 에서 엄격 매칭 후보.

## 7. 다음 3세션

- **세션 21**: `license.verify` 엔드포인트 혹은 Observability Helm chart 실배포 (Exit #3
  완결) 혹은 nano-banana AI 어댑터 스켈레톤.
- **세션 22**: rig v1.3 body 확장 혹은 Post-Processing Stage 1 (alpha cleanup) 스켈레톤.
- **세션 23**: happy-dom 기반 `<geny-avatar>` DOM lifecycle 스냅샷 — D-시각 자동화.
