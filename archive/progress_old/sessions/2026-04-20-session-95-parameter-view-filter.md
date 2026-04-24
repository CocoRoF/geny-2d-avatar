# 세션 95 — Inspector 파츠-파라미터 뷰 필터

**일자**: 2026-04-20
**워크스트림**: Frontend / UX
**선행 세션**: 세션 89 (`@geny/web-editor-logic`), 세션 90 (parameter write-through), 세션 91 (구조 프리뷰), 세션 92 (파츠 선택 양방향 바인딩), 세션 94 (motion/expression state)

---

## 1. 문제

세션 90 이 Inspector 파라미터 슬라이더를 닫고, 세션 92 가 파츠 선택 양방향 바인딩을 닫았지만, 둘의 상호작용은 비어 있었다. 현재 Inspector 는 선택된 파츠와 무관하게 번들의 **전체 파라미터** (halfbody 38 / fullbody 60) 를 스크롤 가능한 단일 목록으로 노출한다. 사용자가 `hair_front` 를 선택해도 `eye_open_l` · `mouth_form` · `accessory_back_sway` 슬라이더가 모두 섞여 나오므로, "이 파츠에 묶인 파라미터가 무엇인지" 가 UX 에서 사라진다. Runtime phase 에서 파츠 파라미터를 조정해 실 Live2D 렌더 결과를 반복적으로 조정하려면 이 필터가 **먼저** 필요. Foundation 범위 — rig-template meta 로부터 순수 규칙으로 추출.

세션 94 후속 결정 축에서 "선택된 파츠에 바인딩된 parameter 만 Inspector 에 필터 노출" 로 명시됐다. 세션 93 (실 staging) 은 cluster access 확보 전이라 계속 보류.

---

## 2. 변경

### 2.1 `packages/web-editor-logic/src/category.ts` — `parametersForPart` 규칙

새 export 3 종:
- `ParameterLike` — `{id: string, group: string}` duck-type (브라우저/Node 공용).
- `GROUPS_FOR_CATEGORY: Readonly<Record<Category, readonly string[]>>` — 카테고리별 허용 그룹 화이트리스트 (`Face→[face,eyes,brows,mouth]`, `Hair→[hair]`, `Body→[body]`, `Accessory→[body]`, `Other→[]`).
- `OVERALL_GROUP = "overall"` — 파츠-무관 공용 그룹 (Foundation 번들에 별도 `overall` 그룹은 없지만, 규칙은 존재 시 자동 포함되도록).
- `parametersForPart<P extends ParameterLike>(part: PartLike | null, params: readonly P[]): P[]`:
  - `part === null` → 전체 복사본 (초기 ready / 선택 해제).
  - **1단계 substring match**: `params.filter(p => p.id.includes(part.role))` — `hair_front_sway` 가 role `hair_front` 로 선택될 때 정확히 물림. 매칭 존재 시 → substring 결과 + `overall` 그룹 (중복 제거).
  - **2단계 카테고리-그룹 폴백**: 매칭이 없으면 `GROUPS_FOR_CATEGORY[categoryOf(role)] ∪ {OVERALL_GROUP}` 화이트리스트로 필터. `eye_iris_l` (Face, id substring 히트 없음) → face/eyes/brows/mouth 그룹 전체.

### 2.2 `packages/web-editor-logic/src/index.ts` — 배럴 확장

`parametersForPart` / `GROUPS_FOR_CATEGORY` / `OVERALL_GROUP` / `ParameterLike` 추가 export. 기존 `categoryOf/categorize/CATEGORY_ORDER/Category/PartLike` 유지.

### 2.3 `packages/web-editor-logic/tests/category.test.ts` — 13 tests 추가 (37 → 50)

신규 suite `parametersForPart (세션 95)`:
- null pass-through — reference 분리 (input 변이 차단).
- substring match 3종 — `hair_front` / `accessory_back` / `arm_l`.
- category-group fallback 5종 — `eye_iris_l` (Face) / `torso` (Body) / `face_base` (Face) / `clothing` / `limb` (fullbody generic Body roles).
- overall inclusion 2종 — substring path 에서도 overall 자동 포함 + 중복 제거 회귀.
- Other 카테고리 — overall-only 화이트리스트.
- `GROUPS_FOR_CATEGORY` enum coverage — 5개 카테고리 모두 키 존재 + 값 타입 고정.

24 entry 테스트 픽스처 `PARAMS` 가 halfbody 모든 그룹 (face/eyes/brows/mouth/hair/body + overall stub) 을 포괄.

### 2.4 `apps/web-editor/index.html` — Inspector 필터 와이어링

- Import 확장: `parametersForPart` 추가 (`web-editor-logic/index.js`).
- 모듈 상태: `allParameters = []`, `allParameterGroups = []` — 원본 보관 (필터 대상).
- `renderParameters(parameters, parameterGroups, opts)` refactor:
  - `opts.totalCount` 받으면 label 을 `Parameters · X / Y` 로 표시 (필터 가시화).
  - `opts.initialValuesById` 로 슬라이더 **현재 값 시드** (el.getParameters() 스냅샷) → 선택 변경 시 `p.default` 로 리셋되는 UX 퇴화 차단.
  - 함수 내 `inspectorEl.appendChild(section)` 제거 — 섹션 build 책임만, DOM 장착은 바깥.
- `renderParametersFor(part)` 신규 — `parametersForPart(part, allParameters)` → `renderParameters(subset, allParameterGroups, {totalCount, initialValuesById})`.
- `renderInspectorEmpty()` 신규 — 초기 ready / 선택 해제 시 `[empty-hint, paramSectionEl, motionSectionEl, expressionSectionEl]` 순서 고정 재장착.
- `renderMotions` / `renderExpressions` 에서도 self-append 제거 — `motionSectionEl` / `expressionSectionEl` 만 할당, 장착은 `renderInspector` 또는 `renderInspectorEmpty` 에서.
- `selectSidebarEntry(node, part, cat, {fromRenderer})` — `renderInspector` 이전에 `renderParametersFor(part)` 호출 (파라미터 서브셋을 먼저 재빌드).
- `onSelectPart(null)` 콜백 (Preview 재클릭 → deselect) — `clearSidebarSelection()` + `renderParametersFor(null)` + `renderInspectorEmpty()`.
- `ready` 이벤트 — `allParameters = meta.parameters`, `allParameterGroups = meta.parameter_groups` 보관 후 `renderParametersFor(null)` 로 전체 표시 + `renderInspectorEmpty()` 로 초기 배치.
- `swapTemplate` — `allParameters = []`, `allParameterGroups = []` 포함 전체 ref clear (stale filter 차단).

### 2.5 `apps/web-editor/scripts/e2e-check.mjs` — `runRendererMount` 확장

선택 round-trip 검증 블록 뒤에 `parametersForPart` 실 번들 회귀 추가:
- dynamic import `@geny/web-editor-logic/dist/index.js` 에서 `parametersForPart` 획득.
- `parametersForPart(null, meta.parameters).length === meta.parameters.length` — pass-through 확인.
- 실 probe part (role 이 `hair_*`/`eye_*`/`accessory_*` 중 첫 매칭) 로 필터 적용 → `subset.length < total` + `subset.length > 0` + 모든 subset id 가 원본에 존재.
- 로그 1줄: `"parametersForPart(<role>) narrowed <total> → <subset>"` (fullbody 에서 `accessory_back` → 60→4 검증).

---

## 3. 검증

- `pnpm -F @geny/web-editor-logic test` — **50/50 pass** (37 기존 + 13 신규 `parametersForPart` suite).
- `apps/web-editor` e2e — halfbody + fullbody 양쪽에서 필터 narrow 성공 (`accessory_back` → 60→4 fullbody 기준).
- `node scripts/test-golden.mjs` — **29/29 all steps pass** (step 수 불변, 내부 회귀 13 unit + 1 e2e assertion 추가).

---

## 4. 결정 축 (D1–D6)

### D1. 필터 규칙: 순수 substring vs 순수 카테고리-그룹 vs 2단계 결합
- **결정**: 2단계 결합 (primary substring + fallback category-group) + overall 상수 포함.
- **이유**: 순수 substring 은 물리 파라미터 (`hair_front_sway`, `accessory_back_sway`) 엔 정확하지만 `eye_iris_l` 같은 role 에는 `head_angle_*`/`eye_open_*` 같은 실제 Face-그룹 파라미터가 전혀 안 걸림. 순수 카테고리-그룹 은 역으로 너무 넓어져 `hair_front` 와 `hair_back` 이 모두 hair 그룹 전부를 똑같이 보여준다. 2단계 는 role-level 정밀성과 카테고리-level 포괄성을 모두 확보 — rig-template meta 의 현 규약과 자연스럽게 맞음.

### D2. `overall` 그룹 항상 포함 vs 카테고리 화이트리스트에만
- **결정**: 항상 포함 (substring path 에서도 중복 제거 후 append).
- **이유**: `overall` 은 정의상 파츠-무관 글로벌 파라미터 (번들에 존재 시 lighting, environment 등). 특정 파츠 선택 시 사라지면 UX 가 갑자기 글로벌 컨트롤을 잃는다. 세션 90 의 "파라미터 슬라이더 = 에디터의 기본 편집 매체" 철학 — 글로벌은 항상 편집 가능해야.

### D3. Accessory 카테고리 → 어떤 그룹으로 매핑
- **결정**: `Accessory → [body]` (Hair 와 별개, Body 와 공유).
- **이유**: rig 현실 — `accessory_back_sway` / `accessory_front_sway` 의 `group` 값이 실제로 "body" (악세서리는 몸 물리를 따름). Accessory 에 전용 그룹을 새로 정의하려면 rig-template meta 계약 확장이 필요하고 Foundation 범위를 벗어난다. 기존 rig meta 를 그대로 소비하되 카테고리→그룹 매핑에서 이 reality 를 반영.

### D4. 슬라이더 값 시드: `p.default` 고정 vs `el.getParameters()` 스냅샷
- **결정**: `el.getParameters()` 스냅샷 + `p.default` fallback.
- **이유**: 선택이 바뀌어 필터 재빌드될 때마다 슬라이더가 기본값으로 리셋되면 사용자가 조절한 값이 보이지 않게 사라진다 — "편집 상태가 화면에서 지워졌다" 로 오인될 위험. `<geny-avatar>` 의 `#parameters` Map 이 단일 진실 공급원 (세션 90 계약) 이므로, 재빌드 시 그 스냅샷을 읽어 DOM 과 일치시킨다. `parameterchange` 이벤트는 기존대로 readout 만 갱신.

### D5. DOM 장착 책임: 각 render fn 내부 self-append vs 바깥 centralize
- **결정**: 바깥 centralize — `renderParameters` / `renderMotions` / `renderExpressions` 는 섹션 element 만 빌드해 module-local 변수에 할당, 장착은 `renderInspector` (파츠 선택) 또는 `renderInspectorEmpty` (초기/해제) 가 전담.
- **이유**: 기존 구조는 `renderParameters(...)` 가 `inspectorEl.appendChild(section)` 를 내부에서 수행해, 선택 변경 시 재빌드하면 중복 append 또는 replace 경로가 꼬임. 빌드/장착 분리로 순서 보장 (hint → params → motions → expressions) + 재빌드 시 idempotent.

### D6. 선택 해제 (null) 처리: 전체 파라미터 복귀 vs Inspector 자체 숨김
- **결정**: 전체 파라미터 복귀 + 빈 empty-hint 로 초기 상태와 동일.
- **이유**: Preview 에서 파츠 재클릭으로 선택을 해제한 사용자는 "다시 전역 편집 모드" 를 기대. Inspector 를 통째로 숨기면 motion/expression 패널까지 사라져 UX 퇴보. `renderParametersFor(null)` + `renderInspectorEmpty()` 조합이 초기 ready 이벤트 경로와 동일한 상태를 재현 — 두 경로가 공유되므로 유지보수 단순.

---

## 5. 후속 (세션 96+)

- **세션 96 후보** — 실 staging 배포 재개 (cluster access 확보 시). 세션 80 prep + 83/84/85/86/88 베이스라인 **5 종** → `helm install worker-generate -f values-staging.yaml` → kps ServiceMonitor → `/metrics` capture → snapshot-diff/fallback-validate 4 모드 실증.
- **세션 97 후보** — Runtime 전환 본격 착수. 실 Cubism/WebGL 렌더러 합류 시, 파츠-파라미터 필터가 그대로 "선택된 파츠 편집 모드" 의 기반 위젯으로 승격. `parametersForPart` 규칙은 기존 계약 유지 (순수 함수 → 렌더러 교체와 무관).
- **세션 98 후보** — `parameter_bindings` 명시 계약. 현재는 role/group 규칙 기반 휴리스틱이지만, rig-template meta 에 `parts[i].parameter_ids?: string[]` 명시 필드가 추가되면 `parametersForPart` 가 그 필드를 우선 소비하도록 확장 가능 (backward compat: 규칙 휴리스틱은 fallback 으로 유지).

---

## 6. 인덱스 갱신

- `progress/INDEX.md` §4 세션 로그에 세션 95 행 추가 (newest-first).
- `progress/INDEX.md` §3 Frontend 축에 "파츠-파라미터 뷰 필터" 업데이트.
- §3 UX 축에 Inspector 파라미터 패널 필터 언급.
- §8 "다음 세션 후보" — 95 제거, 96/97/98 roll forward.
