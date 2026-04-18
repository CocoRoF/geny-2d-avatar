# Session 19 — Foundation Exit #1 드라이버 (`apps/web-preview/`)

- 날짜: 2026-04-18
- 스트림: Frontend + Pipeline
- 관련 docs: `docs/11 §4` (Web Avatar 런타임 사양), `docs/14 §3.3` (Foundation Exit #1 — 단일 아바타 생성→프리뷰→export 수동 테스트)
- 전제: 세션 18 (`<geny-avatar>` 런타임 스켈레톤 + stage 2 번들) 완료.

## 0. 목표

Foundation Exit 체크리스트 #1 의 "수동 테스트 성공" 을 누구나 재현 가능하게 만든다.
번들 조립기와 Custom Element 는 이미 있으므로, 본 세션은 **드라이버 + 체크리스트** 를 제공.

## 1. `apps/web-preview/` 신설

### 1.1 구조
```
apps/web-preview/
├── .gitignore              # public/ 전부 gitignore
├── README.md
├── package.json            # @geny/web-preview v0.1.0 private
├── index.html              # <geny-avatar> + metadata 패널 3종
├── scripts/
│   ├── prepare.mjs         # 빌드 + 번들 2종 생성 → public/
│   └── serve.mjs           # Node 내장 http 정적 서버 (port 4173)
└── public/                 # 생성물 (gitignored)
    ├── vendor/             # @geny/web-avatar dist 복사본
    ├── sample/             # halfbody v1.2.0 web-avatar 번들 (로드 대상)
    ├── cubism/             # aria Cubism 번들 (동반 export)
    └── INDEX.json          # 아티팩트 manifest
```

### 1.2 `scripts/prepare.mjs`
1. `rmSync(public/)` + `mkdirSync`.
2. `pnpm --filter @geny/exporter-core run build`.
3. `pnpm --filter @geny/web-avatar run build`.
4. `cpSync(packages/web-avatar/dist, public/vendor)`.
5. `loadTemplate("rig-templates/base/halfbody/v1.2.0")` → `assembleWebAvatarBundle(tpl, public/sample, { avatarId: "avt.preview.halfbody.demo" })` — **4 files · 12854 bytes** (bundle/web-avatar/atlas + base.png).
6. `assembleAvatarBundle(samples/avatars/sample-01-aria.export.json, rig-templates, public/cubism)` — **15 files · 36122 bytes**.
7. `public/INDEX.json` emit (생성 시각 + 경로 3종).

### 1.3 `scripts/serve.mjs`
- `node:http` 만 사용 — 추가 deps 없음.
- 정적 서빙, MIME 매핑 7종(html/js/mjs/map/json/css/png/webp/svg/txt).
- SIGINT/SIGTERM 핸들러로 깔끔하게 종료.
- `PORT` env override.

### 1.4 `index.html`
- `<geny-avatar id="avatar" src="./public/sample/bundle.json" hidden>` (hidden 은 시각 공간 제거 — 렌더링 없음).
- 3 section: Bundle Manifest / Web Avatar Meta / Atlas. 각각 `<dl class="kv">` 로 key-value 렌더.
- `ready` 리스너: manifest.files[] / meta.parameters·parts·motions·expressions·textures / atlas.textures 를 DOM 에 주입.
- `error` 리스너: 상태 박스 빨강 + console.error.
- 최소 CSS 인라인 — 가독성 중심, 배경/컬러 스킴 `light dark` 자동.
- `<script type="module" src="./public/vendor/index.js">` 로 Custom Element 자동 등록.

### 1.5 package.json scripts
- `build:public`: `node scripts/prepare.mjs`
- `serve`: `node scripts/serve.mjs`
- `dev`: `build:public && serve`

> 초기 `prepare` 라는 이름을 썼는데 pnpm 의 lifecycle hook (`npm install` 시 자동 실행) 과 충돌 → `pnpm install` 이 앱 초기화 시점마다 prepare.mjs 를 실행해서 `public/` 을 재생성 + 빌드를 재실행. **D1 이름을 `build:public` 으로 변경.**

## 2. Exit #1 체크리스트

`progress/exit-gates/01-single-avatar-e2e.md` 신설. 5 단계 (A~E):

- **A. 템플릿 무결성**: `pnpm run validate:schemas` (checked 133) + `test:golden` (5 step).
- **B. 아바타 생성**: CLI `exporter-core avatar` → 15 files · 36122 bytes · snapshot 일치.
- **C. Cubism export 검증**: `model3.json` FileReferences + `physics3.json` Meta 수치 확인.
- **D. 웹 프리뷰**: `build:public` + `serve` + 브라우저 방문 + ready 이벤트 수신 + DOM 패널 확인.
- **E. 회귀 안전장치**: 재생성 결정론 + CI 골든 테스트 green 유지.

**합격 기준**: A~D 모두 ✅. E 는 CI 지속 감시.

## 3. Foundation Exit 상태 변화

INDEX.md §2:
- **#1 (단일 아바타 생성→프리뷰→export)**: 〔드라이버 완〕 실제 수동 pass 는 다음 스프린트(=본 문서 체크리스트 수행)에서 체크.
- 다른 3 게이트 변동 없음.

## 4. 변경 파일

### 신규
```
apps/web-preview/.gitignore
apps/web-preview/README.md
apps/web-preview/package.json
apps/web-preview/index.html
apps/web-preview/scripts/prepare.mjs
apps/web-preview/scripts/serve.mjs
progress/exit-gates/01-single-avatar-e2e.md
progress/sessions/2026-04-18-session-19-web-preview.md (이 문서)
```

### 수정
```
pnpm-lock.yaml              # @geny/web-preview workspace 등록
progress/INDEX.md           # session 19 row, Exit #1 drive status, Frontend 스트림 업데이트, 다음 세션 shift
```

## 5. 설계 결정 (D1 ~ D5)

### D1 — 스크립트명 `prepare` → `build:public`
- **이유**: pnpm/npm 은 `prepare` 를 lifecycle hook 으로 예약. `pnpm install` 시 package 루트의 prepare 가 자동 실행되어 설치 중 `public/` 을 재생성 + 빌드를 재실행 → 상황 재현에서 실패.
- **영향**: README/INDEX/체크리스트 모두 `build:public` 으로 표기.

### D2 — `public/` 는 gitignore
- **이유**: 아티팩트는 결정론적이며 재생성 가능. 커밋하면 매 번 diff 노이즈.
- **영향**: 사용자는 `pnpm run build:public` 을 명시 실행해야 함. README 첫 줄에 안내.

### D3 — 서버는 Node 내장 http 만 사용 (npm 의존성 zero)
- **이유**: Foundation 단계는 dep 수 최소화가 보안/온보딩 이점. `express`/`http-server` 등은 과잉.
- **영향**: 약 50 lines. MIME 매핑 인라인. SPA fallback 없음 (정적 파일만).

### D4 — 프리뷰 대상은 halfbody v1.2.0 템플릿, Cubism 은 aria 아바타
- **이유**: 세션 18 에서 halfbody 에 `textures/base.png` 를 추가한 유일한 템플릿 → web-avatar stage 2 데모에 맞음. Cubism 은 이미 aria 번들이 골든으로 존재.
- **영향**: `<geny-avatar>` 는 halfbody 템플릿 직결 (avatar-export 경유 X). Cubism 번들은 다운로드/검증용 — 프리뷰 DOM 에는 노출하지 않음 (지금은).

### D5 — 프리뷰 DOM 은 메타데이터만 (렌더링 X)
- **이유**: Stage 2 범위 준수 + Foundation Exit #1 는 "프리뷰 = 정보 표시" 로도 의미가 성립. WebGL 렌더는 Stage 3.
- **영향**: `<geny-avatar>` 는 `hidden` 속성 — 공간 차지 없음. metadata 는 `<dl>` 3 섹션으로 시각화.

## 6. 검증 로그

### 6.1 prepare.mjs
```
[web-preview/prepare] clean public/… done (1ms)
[web-preview/prepare] build @geny/exporter-core… done
[web-preview/prepare] build @geny/web-avatar… done
[web-preview/prepare] copy @geny/web-avatar dist → public/vendor… done
[web-preview/prepare] assemble halfbody web-avatar bundle → public/sample/…
  files=4 bytes=12854 done
[web-preview/prepare] assemble aria Cubism bundle → public/cubism/…
  files=15 bytes=36122 done
[web-preview/prepare] write public/INDEX.json manifest of artifacts… done
[web-preview/prepare] ✅ ready — run `pnpm run serve`
```

### 6.2 serve.mjs 스모크 (curl)
```
html 200
bundle 200
meta 200
atlas 200
texture 200
vendor-index 200
vendor-loader 200
```

bundle.json 첫 엔트리 예시:
```json
{
  "avatar_id": "avt.preview.halfbody.demo",
  "files": [
    { "bytes": 222, "path": "atlas.json", "sha256": "1bc0cff1...ed3465" },
    { "bytes": 69, "path": "...
```

### 6.3 기존 회귀
- `pnpm run validate:schemas` → checked=133 failed=0 (변동 없음).
- `pnpm run test:golden` → 5 step all pass (세션 18 대비 변동 없음).

## 7. 다음 3세션

- **세션 20**: Playwright 기반 web-preview 자동 E2E — 체크리스트 D 단계 CI 자동화. 혹은 Observability Helm chart 실배포 (Exit #3 완결).
- **세션 21**: 발급자 공개키 레지스트리 + `license.verify` (세션 14 blocker) 혹은 AI 생성 어댑터 (nano-banana) skeleton.
- **세션 22**: rig v1.3 body 파츠 확장 혹은 Post-Processing Stage 1 (alpha cleanup) skeleton.
