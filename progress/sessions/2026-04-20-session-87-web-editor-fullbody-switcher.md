# 세션 87 — web-editor fullbody 템플릿 스위처

**날짜**: 2026-04-20
**주제**: Stage 3 선행 — `apps/web-editor/` 에 fullbody v1.0.0 템플릿 스위처 추가, `categoryOf` 확장으로 fullbody generic role 커버, e2e 가 양 템플릿 스냅샷 카디널리티 고정.

---

## 문제

세션 81 에서 스캐폴드된 `apps/web-editor/` 는 halfbody v1.2.0 단일 번들만 렌더 가능한 상태. 세션 55~59 에서 저작이 완결된 fullbody v1.0.0 (38 파츠) 는 에디터에서 미리볼 수 없어, docs/09 §4.3 파츠 카테고리 매핑이 실제로 양쪽 family 를 커버하는지 증명되지 않음.

원래 세션 87 후보였던 실 staging 배포는 cluster access 부재로 지연(세션 88 로 슬라이드) — 대체로 Stage 3 블록드롭 전에 완료해야 하는 "에디터가 양 템플릿을 지원하는지" 축을 먼저 닫는다.

세션 86 에서 터미널 실패 e2e 를 CI 에 고정하며 Foundation 관측 4 축(HTTP / 1-hop / 2-hop / terminal) 이 닫혔으므로, 본 세션은 UX 측 증명에 집중.

---

## 변경

### `apps/web-editor/scripts/prepare.mjs` (재작성)
- `TEMPLATES` 배열(`{id, label, templateDir, avatarId}` × 2) 기반으로 halfbody v1.2.0 + fullbody v1.0.0 2 번들을 **각각 별도 서브디렉토리** (`public/sample/halfbody/`, `public/sample/fullbody/`) 로 assemble.
- `public/INDEX.json` 을 단일 bundle 참조 → `templates: [{id, label, bundle, avatar_id}]` 배열 계약으로 변경. 스위처 UI 가 manifest 를 진실 소스로 읽어 `<option>` 을 동적으로 생성하게 함.
- `web_avatar_bundle` flat field 제거(단일 템플릿 가정) — 호출자가 `templates[].bundle` 로 진입.

### `apps/web-editor/index.html` (부분 수정)
- TopBar 에 `<select id="template-picker" class="template-picker">` 삽입 (brand → avatar-name → picker → actions 순, `actions: margin-left: auto` 규칙 유지).
- `<geny-avatar>` 의 `src` 속성 하드코딩 제거 — 부트스트랩에서 `INDEX.json.templates[0].bundle` 을 동적 주입.
- `categoryOf()` 확장 3 줄:
  - `role === "limb"` → Body (leg_l/r, foot_l/r)
  - `role === "clothing"` → Body (cloth_skirt, cloth_cape)
  - `role === "accessory"` → Accessory (acc_belt)
  - 기존 `role === "torso"` 가 hip 도 커버 (fullbody hip.spec.json 이 torso role 사용).
- `bootstrap()` IIFE: INDEX.json fetch → templates 배열 → `pickerEl` 옵션 채움 → 첫 템플릿 swap. `swapTemplate(bundleUrl)` 가 status/groups/inspector 클리어 + `el.setAttribute("src", ...)` → `<geny-avatar>` 의 stale-src cancel(세션 18)이 자동으로 이전 번들 로드를 취소하고 새 ready 이벤트만 내보냄.

### `apps/web-editor/scripts/e2e-check.mjs` (재작성)
- `INDEX.json` 을 진실 소스로 읽어 `templates = ["fullbody", "halfbody"]` sorted 어서션 → 각 템플릿마다 4 HTTP + loader + categorize + DOM lifecycle 을 반복 실행.
- `TEMPLATE_EXPECTATIONS` 맵에 per-template 스냅샷 고정:
  - halfbody: `Face=16 / Hair=4 / Body=7 / Accessory=2` (total=29)
  - fullbody: `Face=16 / Hair=5 / Body=14 / Accessory=3` (total=38)
  - 양쪽 `Other=0` 불변식 + `total === partsTotal` assert.
- DOM lifecycle 은 **템플릿마다 별도 happy-dom Window 인스턴스** 로 실행 (customElements 레지스트리 오염 방지).

### `progress/INDEX.md`
- §3 Frontend row + §3 UX row 에 세션 87 블록 추가.
- §4 세션 로그에 `| 87 | 2026-04-20 | ...` 행 삽입(세션 86 위).
- §8 로드맵에서 세션 87 candidate(staging) 제거, 87→88 로 슬라이드, 88→89(UNSAFE), 89→90(Runtime prep) 재배열.

---

## 검증

- 로컬 `node apps/web-editor/scripts/prepare.mjs`: halfbody bundle (files=4 / 12852 bytes) + fullbody bundle (files=4 / 16187 bytes) + INDEX.json 생성 확인.
- 로컬 `node apps/web-editor/scripts/e2e-check.mjs`: `INDEX.json templates: fullbody, halfbody` + halfbody Face=16/Hair=4/Body=7/Accessory=2 + fullbody Face=16/Hair=5/Body=14/Accessory=3 모두 pass, DOM ready payload 2 템플릿 확인.
- `node scripts/test-golden.mjs`: 27/27 step all pass (step 8 `web-editor e2e` 재녹색).
- fullbody 파츠 38개 role 분포 확인 → categoryOf 확장 3 줄로 Other=0 달성.

---

## 주요 결정축

### D1. `prepare.mjs` 2 템플릿 + 서브디렉토리 분리
단일 flat `public/sample/` 에 덮어쓰면 INDEX.json 의 `bundle` 필드에 하나만 남아 스위칭 불가. `public/sample/{id}/bundle.json` 구조로 각 번들이 독립된 URL 을 가지고, 텍스처 `base.png` 도 템플릿별 격리.

### D2. INDEX.json.templates[] 배열 계약
스위처 UI 가 manifest 를 진실 소스로 fetch → `<option>` 생성. 하드코딩한 `<option>` 은 템플릿 추가 시 HTML 을 반드시 편집하게 만들어 `prepare.mjs` 단독 확장이 불가능하게 함 → 배열로 **단방향 데이터 흐름** 유지 (prepare → INDEX.json → UI).

### D3. `<select>` + setAttribute("src") 스왑
`<geny-avatar>` 는 세션 18 에서 stale-src cancel 로직을 이미 갖추고 있어, src 재설정만으로 이전 번들 로드를 자동 취소하고 새 ready 이벤트 한 번만 내보낸다. destroy/recreate 불필요 — groups/inspector UI 만 클리어하면 카테고리 재랜더는 기존 ready 핸들러가 그대로 처리.

### D4. `categoryOf` 확장 3 줄(정확 매치)
Fullbody v1.0.0 의 8 신규 파츠는 generic role 로 저작됨:
- `hip` → `role: "torso"` (기존 규칙에서 이미 Body 로 매칭됨, 추가 불필요)
- `leg_l/r`, `foot_l/r` → `role: "limb"` → Body
- `cloth_skirt`, `cloth_cape` → `role: "clothing"` → Body
- `acc_belt` → `role: "accessory"` → Accessory

대안 (generic role 을 `leg_`, `skirt_`, `belt_` prefix 로 재저작) 은 v1.0.0 스냅샷을 깨뜨리므로 기각. Halfbody 기존 27 role 은 이 3 정확 매치에 걸리지 않아 무영향 — halfbody categorization 완전 호환.

### D5. e2e-check 가 INDEX.json 을 루프
`TEMPLATE_EXPECTATIONS` 맵만 확장하면 새 템플릿 e2e 커버리지가 자동 추가됨. `templates.map(t=>t.id).sort()` 어서션으로 id 오타 즉시 탐지 → prepare.mjs 에서 `TEMPLATES[].id` 를 바꾸면 e2e 가 먼저 깨짐.

### D6. per-template cardinality 스냅샷 고정
`rig-templates/base/**/parts/*.spec.json` 편집 시 e2e 가 먼저 깨져 **categoryOf 재검토를 강제**. halfbody=29, fullbody=38 의 total assert 는 파츠 누락/중복도 동시 탐지. 세션 59 fullbody 저작물의 `hip.spec.json` 이 role="torso" 로 저작된 인식 차이를 (Face=16 으로 유지됨을) e2e 가 증명.

### D7. 템플릿마다 별도 happy-dom Window
happy-dom Window 를 재사용하면 `customElements.define("geny-avatar", …)` 가 두 번째 호출에서 duplicate registration 으로 throw 또는 silent skip — 세션 85 parseArgv `!next` regression 과 동형 silent failure 리스크. 각 loop 이터레이션에서 fresh Window + fresh `registerGenyAvatar()` + globals restore 를 수행.

### D8. TopBar slot 배치 (brand → name → picker → actions)
`actions: margin-left: auto` 규칙을 세션 81 에서 유지. picker 는 name 바로 오른쪽에 clustered, Save/Share/Export actions 는 우측 정렬 — 공간 조정 없이 session 81 레이아웃을 그대로 보존.

---

## 남긴 숙제

- **Stage 3 Preview 렌더러**: 현재는 여전히 "번들 메타만 로드 + 파츠 사이드바 랜더". 실 WebGL/Canvas2D 렌더러는 세션 89+ 후보.
- **chibi / masc_halfbody family**: 스키마 enum 에는 등록돼 있으나 실 저작물 없음 — 템플릿 스위처는 저작 완료 시점에 `TEMPLATES[]` + `TEMPLATE_EXPECTATIONS` 추가만으로 즉시 확장 가능.
- **Inspector 편집 모드**: read-only kv 유지, 편집/되돌리기는 Runtime.
- **`packages/web-editor-logic` 추출**: `categoryOf` / 파츠 정렬 / kv 렌더러를 index.html 인라인 ↔ e2e-check 양쪽에서 중복 실행 중. Stage 3 kick-off 와 묶어 모듈 추출 검토.
- **세션 88 candidate**: 실 staging 배포 (cluster access 확보 시).
- **세션 89 candidate**: UNSAFE_CONTENT fallback e2e — `SafetyFilter` 를 `orchestrator-service`/`worker-generate` 주입 경로에 wiring + mock-vendor-server 에 UNSAFE 플래그 테스트 훅.

---

## 결과

- `apps/web-editor/` 가 halfbody + fullbody 2 템플릿을 TopBar `<select>` 로 스위치 가능.
- e2e golden 27/27 불변 (step 8 `web-editor e2e` 이 2 템플릿 matrix 로 확장 — 4 HTTP + loader + categorize + DOM = 8-step).
- docs/09 §4.3 파츠 카테고리 매핑이 실 저작물 양쪽(halfbody v1.2.0 29 파츠 + fullbody v1.0.0 38 파츠)에 대해 **Other=0** 증명.
- Foundation Stage 3 블록드롭 선행 조건 — "에디터가 양 family 를 커버" 축 확정.
