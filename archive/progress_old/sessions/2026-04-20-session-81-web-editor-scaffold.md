# 세션 81 — apps/web-editor 스캐폴드 (Foundation Exit #1 Editor 실측 + golden step 24)

**일자**: 2026-04-20
**워크스트림**: UX / Frontend
**선행 세션**: 세션 20 (`apps/web-preview` 3-panel 메타 뷰어 + e2e), 세션 23 (`<geny-avatar>` Custom Element happy-dom DOM lifecycle), 세션 38 (assembleWebAvatarBundle textureOverrides), docs/09 §4.3 (Editor UX 레이아웃)

---

## 1. 문제

Foundation Exit #1 체크리스트 중 **에디터 스캐폴드** 만 ⚪ 미착수 상태였다. `apps/web-preview` 는 단일 `<dl>` 메타 뷰어라 "아바타 뷰어" 수준이고, docs/09 §4.3 이 정의한 **3-column 에디터 UX** (TopBar / Parts 사이드바 / Preview Stage / Inspector) 의 골격이 저장소에 존재하지 않았다. 저장/재생성/Export 같은 Runtime 액션은 세션 82+ 이후라도, **레이아웃 + 파츠 카테고리 사이드바 + 선택→Inspector 바인딩** 까지는 Foundation 범위로 잡고 CI 승격해야 Exit #1 이 완결된다.

Stage 2 범위이므로 실 렌더링은 불필요 — `<geny-avatar>` ready 이벤트의 meta.parts 를 UX 카테고리(Face/Hair/Body/Accessory)로 분류해 좌측 사이드바에 렌더, 클릭 시 우측 Inspector 에 `slot_id/role/category` read-only 표시. Save/History/Share/Export 버튼은 disabled 로 가시화만.

---

## 2. 변경

### 2.1 `apps/web-editor/` 신규 — web-preview 쌍둥이 앱

- `package.json` — `@geny/web-editor@0.1.0`, `workspace:*` 로 `@geny/exporter-core` + `@geny/web-avatar` 참조, 스크립트 4종 (`build:public` / `serve` / `dev` / `test`).
- `index.html` — CSS Grid 기반 3-column (`260px 1fr 320px`) + prefers-color-scheme 라이트/다크.
  - TopBar: brand "Geny Editor" + avatar-name (ready 이벤트 후 채움) + Save/History/Share/Export disabled 버튼.
  - 좌측 Parts 사이드바: `categoryOf(role)` prefix 규칙으로 Face/Hair/Body/Accessory 4 그룹 + Other fallback. 선택 시 `aria-selected`.
  - 중앙 Preview Stage: dashed-border stage-inner + `<geny-avatar src="./public/sample/bundle.json" style="display:none">` (이벤트만 구독).
  - 우측 Inspector: `<dl class="kv">` 로 slot_id/role/category 표시 + "Runtime 이후" 힌트.
  - 상태 박스: ready/error 색상 분기 + `tpl.base.v1.halfbody@1.2.0 · 29 parts` 요약.
- `scripts/prepare.mjs` — web-preview 와 동일 패턴: exporter-core + web-avatar 빌드 → `public/vendor/` 복사 → `assembleWebAvatarBundle(halfbody v1.2.0, public/sample, { avatarId: "avt.editor.halfbody.demo" })` → `public/INDEX.json` 매니페스트.
- `scripts/serve.mjs` — Node 내장 http 정적 서버, default port **4174** (web-preview 4173 과 분리).
- `scripts/e2e-check.mjs` — prepare → serve → HTTP 200×6 → loader 체인 (avatar_id=avt.editor.halfbody.demo 검증) → **`categorize()` 어서션** (4 카테고리 모두 ≥1, Other=0, 총합=parts.length) → `<geny-avatar>` happy-dom ready lifecycle 페이로드 검증.
- `README.md` + `.gitignore` (`public/`, `node_modules/`).

### 2.2 `categoryOf(role)` 규칙 — prefix 기반

`index.html` 과 `e2e-check.mjs` 가 동형으로 구현:
- `eye_*` / `brow_*` / `mouth_*` / `face_*` / `nose` / `cheek_blush` → **Face**
- `hair_*` / `ahoge` → **Hair**
- `arm_*` / `cloth_*` / `torso` / `neck` / `body` → **Body**
- `accessory_*` → **Accessory**
- 그 외 → Other (CI 에서 = 0 강제)

halfbody v1.2.0 실제 role 셋 (27 고유): **Face=16, Hair=4, Body=7, Accessory=2 = 총 29 parts** (e2e 로그 확인). fullbody/chibi 의 role 이 추가되면 Other 에 떨어져 CI 가 먼저 깨진다.

### 2.3 `scripts/test-golden.mjs` — step 23 → **24**

`web-editor e2e` 추가. 실행 시간 ~2초 (prepare 1.5초 + lifecycle 0.5초). web-preview e2e 와 중복처럼 보이지만, avatar_id 파라미터가 다르고(`avt.editor.halfbody.demo` vs `avt.preview.halfbody.demo`) categorize 어서션이 추가되어 있어 **역할이 분리**됨.

### 2.4 Workspace 루트

`pnpm-workspace.yaml` 은 이미 `apps/*` glob 이라 별도 수정 없이 `pnpm install` 에서 15 → 15 projects (세션 81 기준 +1, 세션 80 14 기준으로는 +1) 로 포함.

---

## 3. 검증

```
$ pnpm --filter @geny/web-editor run test
[e2e]   ✓ http://localhost:63968/ (text/html)
[e2e]   ✓ http://localhost:63968/public/sample/bundle.json (application/json)
[e2e]   ✓ http://localhost:63968/public/sample/web-avatar.json (application/json)
[e2e]   ✓ http://localhost:63968/public/sample/atlas.json (application/json)
[e2e]   ✓ http://localhost:63968/public/sample/textures/base.png (image/png)
[e2e]   ✓ http://localhost:63968/public/vendor/index.js (text/javascript)
[e2e]   ✓ manifest files=3, meta parts=29, atlas textures=1
[e2e]   ✓ categories: Face=16, Hair=4, Body=7, Accessory=2 (total=29)
[e2e]   ✓ ready payload: avt.editor.halfbody.demo @ tpl.base.v1.halfbody@1.2.0, parts=29, motions=7
[e2e] ✅ web-editor e2e pass

$ node scripts/test-golden.mjs
... (24 steps, 全部 ✔) ...
[golden] ✔ web-editor e2e (1986 ms)
[golden] ✅ all steps pass
```

**수동 육안 체크 (로컬 Chrome)** — `pnpm --filter @geny/web-editor dev` → `http://localhost:4174` →
- 상태 박스 녹색 `ready — tpl.base.v1.halfbody@1.2.0 · 29 parts`
- 좌측 사이드바 4 그룹 (`Face · 16`, `Hair · 4`, `Body · 7`, `Accessory · 2`)
- `eye_iris_l` 클릭 → 우측 Inspector `slot_id=eye_iris_l / role=eye_iris_l / category=Face`
- Save/History/Share/Export 버튼 비활성 + hover 시 "Runtime (세션 82+)" tooltip

---

## 4. 주요 결정축

- **D1** — **web-preview 를 지우지 않고 분리 앱**: preview 는 "번들 구조 뷰어 (3-`<dl>`)", editor 는 "UX 레이아웃 프리뷰". 두 축을 합치면 preview 를 쓰는 docs/테스트 경로가 깨짐 + editor 의 3-column 이 preview 에 과함. 둘 다 halfbody v1.2.0 을 먹지만 `avatar_id` 를 다르게 해 CI 에서 prepare 파라미터 전달 자체를 검증.
- **D2** — **렌더링 없음 (Stage 2 유지)**: 중앙 stage 는 플레이스홀더 박스 + "Stage 3+ 렌더러 합류 예정". Foundation Exit #1 은 "에디터 레이아웃이 존재하고 파츠 메타가 실 DOM 에 흐른다" 를 요구하고, 실 렌더는 Cubism/WebGL 레이어가 필요해 Foundation 이후.
- **D3** — **categoryOf 는 prefix 규칙**: halfbody v1.2.0 실 role 은 `eye_iris_l / brow_l / arm_l / ...` 로 fine-grained. Map entry 방식은 role 하나 추가될 때마다 매핑 누락 → Other bucket 누수. prefix 는 네이밍 컨벤션(`<category>_<slot>`) 을 그대로 반영하고 미등록 role 은 Other 에서 잡힌 뒤 CI (`Other=0` 어서션) 가 즉시 탐지.
- **D4** — **index.html 의 categoryOf 를 e2e-check 가 동형 재현**: 두 곳에 중복 선언한 듯 보이지만 (a) 브라우저는 HTML 인라인 스크립트 (b) Node e2e 는 require-free 모듈 — 런타임/모듈 시스템이 달라 공유가 어렵다. Stage 3 에서 `packages/web-editor-logic` 으로 추출할 후보. Foundation 에선 "28 라인 함수 복붙 + drift 는 e2e 가 탐지" 가 단순하고 안전.
- **D5** — **Save/History/Share/Export disabled**: docs/09 §4.3 의 버튼 4개를 가시화해 UX 완결성을 전달. `title` attribute 로 "Runtime (세션 82+)" 명시 — 사용자/리뷰어가 "왜 죽어있냐" 묻는 시간을 0 으로.
- **D6** — **golden step 승격**: web-preview e2e 와 동일 패턴이라 cost ~2초. CI 에선 Foundation Exit #1 의 에디터 축도 red/green 으로 보이게.
- **D7** — **serve.mjs 포트 4174**: web-preview 4173 과 분리. 둘을 동시에 띄워도 충돌 없음 (dev ergonomics).

---

## 5. 남긴 숙제

- **Save/History/Share/Export 배선** (세션 82+ Runtime): 번들 저장(@geny/worker-generate 호출) + 버전 히스토리 + 공유 URL + Cubism 번들 export (assembleAvatarBundle).
- **Prompt / Style Profile / Regenerate** (Runtime 이후): docs/09 §4.3.2 의 AI 결속. 어댑터 라우팅은 이미 `@geny/ai-adapter-core` + worker-generate 에 있음 — Editor UI 만 합류.
- **중앙 Stage 실 렌더러** (Stage 3 이후): WebGL/Canvas2D 렌더러 선택 + Cubism runtime wiring.
- **fullbody/chibi 템플릿 스위처** (Stage 3+): 세션 81 은 halfbody 하드코딩. `categoryOf` 가 Other=0 을 강제하므로 새 role 추가 시 CI 가 먼저 깨져 매핑 갱신을 강제.
- **Inspector 편집 모드** (Runtime): 현재는 read-only. Prompt 필드 + Regenerate 버튼 + 슬라이더(AX/AY/AZ) 는 Runtime 이후.
- **`packages/web-editor-logic` 추출** (리팩터 후보): `categoryOf` + 파츠 정렬 규칙 + Inspector kv 렌더러. HTML 과 e2e 양쪽이 같은 모듈을 import 하도록. 필요가 생기는 시점(세션 3+ role 추가) 까지 유지.

---

## 6. 결과

- `apps/web-editor/` 신규 — docs/09 §4.3 3-column 에디터 스캐폴드 (`index.html`, `prepare.mjs`, `serve.mjs`, `e2e-check.mjs`, `README.md`).
- `categoryOf` prefix 규칙 — halfbody v1.2.0 의 27 고유 role 전부 4 카테고리에 분류 (Face=16, Hair=4, Body=7, Accessory=2).
- `scripts/test-golden.mjs` 23 → **24 step** (`web-editor e2e`, ~2초) — Foundation Exit #1 의 에디터 축을 CI 로 승격.
- Foundation Exit #1 체크리스트의 "Editor 실측" ⚪ → ✅. Foundation 마감은 세션 82 (실 벤더 HTTP 어댑터 + snapshot 분포) 와 세션 83 (실 staging 배포 + drift 0) 으로 이어짐.
