# 세션 98 — `parameter_ids` 명시 계약 (parametersForPart 우선 소비)

**일자**: 2026-04-20
**워크스트림**: Data (schema) + Frontend / UX
**선행 세션**: 세션 89 (`@geny/web-editor-logic`), 세션 95 (2-stage parametersForPart 규칙)

---

## 1. 문제

세션 95 의 `parametersForPart` 는 role substring 매치 → category-group 화이트리스트 fallback → overall 상수의 **규칙 기반 휴리스틱**. 현재 halfbody/fullbody 양쪽 실 번들에서 자연스럽게 작동하지만, 휴리스틱은 구조적으로 다음 경계에서 부서진다:

1. role 이름이 파라미터 id 와 substring 매칭되지 않으면서 카테고리-그룹 화이트리스트도 넘는 특수 케이스 (예: 미래 `eyelid_fx` 류 특수 파츠).
2. 같은 카테고리 안에서 파츠마다 다른 파라미터를 편집해야 하는 경우 (현 휴리스틱은 모든 Face 파츠에 `face/eyes/brows/mouth` 그룹 전체 노출).
3. 저자가 명시적으로 "이 파츠는 이 파라미터만 건드린다" 고 선언하고 싶을 때 경로 부재.

세션 95 후속 D3 / 후속 세션 98 후보에서 이미 명시됐다: **rig-template meta 에 `parts[i].parameter_ids?: string[]` 이 도입되면 해당 필드를 우선 소비하도록 확장, 규칙 휴리스틱은 backward-compat fallback 으로 유지.** 세션 98 이 그 계약을 Foundation 수준에서 고정 — schema 확장 + 로직 분기 + 테스트. 기존 rig-templates 의 parts 는 **수정하지 않는다** (L4 골든 불변 유지 · 모든 파츠가 optional 필드를 생략해도 기존 규칙 fallback 으로 식별 동일).

---

## 2. 변경

### 2.1 `schema/v1/part-spec.schema.json` — `parameter_ids` optional 필드 추가

- 위치: `dependencies` 뒤 (필드 순서는 schema 저자 관례 — semantic grouping).
- 타입: `{ type: "array", items: { type: "string", minLength: 1 }, uniqueItems: true }`.
- 필수 아님 (`required` 배열에 불포함) — 기존 67 파츠 spec 모두 이 필드를 생략한 채로 검증 통과.
- description 에 "누락 시 web-editor-logic 의 role/group 휴리스틱으로 자동 추론(세션 95). 빈 배열은 overall-only 를 의미." 명시 — consumer 가 의도를 코드에서 파악하지 않아도 schema 에서 계약 읽힘.

### 2.2 `packages/web-editor-logic/src/category.ts` — `PartLike` 확장 + `parametersForPart` 3-branch

- `PartLike.parameter_ids?: readonly string[]` 추가 — schema 와 구조적으로 동형.
- `parametersForPart(part, parameters)` 우선순위 변경:
  - **Rule 0 (신규)**: `part.parameter_ids !== undefined` → 명시 목록을 id 집합 set 으로 사용, 매칭되는 parameters + overall 상수(중복 제거). 빈 배열이면 overall-only.
  - **Rule 1 (기존 유지)**: 명시 없음 + substring match → substring 결과 + overall.
  - **Rule 2 (기존 유지)**: substring miss → `GROUPS_FOR_CATEGORY[categoryOf(role)]` 화이트리스트.
- `null` 파츠 → 전체 pass-through (기존 계약 유지).

### 2.3 `packages/web-editor-logic/tests/category.test.ts` — 7 tests 추가 (50 → **57**)

신규 suite `parametersForPart — explicit part.parameter_ids (세션 98)`:
- `explicit bindings win over role/group heuristic` — `eye_iris_l` (휴리스틱 땐 Face 그룹 전부) 에 `["eye_open_l", "head_angle_x"]` 만 명시 → 2 id + overall 로 narrow.
- `explicit bindings auto-include overall` — `hair_front` 에 `["hair_front_sway"]` 명시해도 `overall_x/y` 는 여전히 포함(세션 95 D2 일관성).
- `empty parameter_ids array → overall-only` — 빈 배열은 명시적 "파츠-특화 파라미터 없음" 선언, overall 만.
- `explicit ids that miss all parameters → overall-only` — 저자 오타/stale id 는 throw 하지 않고 조용히 비어 있음 + overall (author's sync responsibility). 런타임 안정성 우선.
- `explicit bindings preserve param order` — UI 리스팅 순서는 원본 `parameters` 배열 순서 유지(`filter` 가 원본 순서 보존 → UI 재정렬 없이 author intent 가 그대로 노출).
- `undefined parameter_ids falls back to 2-stage rule` — backward-compat 회귀.
- `explicit ids that overlap overall group are not duplicated` — set-기반 중복 제거 규칙이 overall 교차 경우에도 작동.

---

## 3. 검증

- `pnpm -F @geny/web-editor-logic test` — **57/57 pass** (50 기존 + 7 신규 explicit-path suite).
- `node scripts/test-golden.mjs` — **29/29 all steps pass** (step 수 불변, validate-schemas checked=244 불변 — optional 필드 추가는 기존 파일 통과).
- 기존 rig-templates 파츠 spec 전부 무수정 → ADR 0005 L4 `samples/avatars/*.bundle.snapshot.json` sha256 golden 불변.

---

## 4. 결정 축 (D1–D5)

### D1. `parameter_ids` 를 optional vs required
- **결정**: optional — `required` 배열에 불포함.
- **이유**: 현재 halfbody v1.3.0 30 파츠 + fullbody v1.0.0 38 파츠 전부 필드 없이 존재. required 로 올리면 migrator hop 1회 + 67 파츠 파일 전부 수정 + L4 골든 전부 재생성이 묶이는데, 세션 98 의 범위를 훨씬 넘는다. 저자는 필요한 파츠만 opt-in 해 필드 추가, 나머지는 세션 95 규칙이 자동 커버 — 점진 마이그레이션이 가능.

### D2. 빈 배열 `parameter_ids: []` 의 의미
- **결정**: 명시적 "이 파츠는 overall 외 파라미터를 가지지 않는다" — overall-only 결과. `undefined` 와 semantically 구분.
- **이유**: 저자가 "이 파츠는 실제로 아무 파라미터도 안 건드린다" 를 선언할 수 있어야 UI 에서 슬라이더 없이 read-only 성격을 만든다(예: 미래 FX-only 파츠). `undefined` 와 동일하게 취급하면 이 선언을 할 길이 없고, 휴리스틱이 과도하게 광범위한 파라미터를 노출한다. 둘을 구분해야 schema 의 표현력이 보존된다.

### D3. 존재하지 않는 id 가 명시됐을 때 — throw vs silent empty
- **결정**: silent — 매칭 없는 id 는 무시, overall 만 표시. 런타임 throw 하지 않는다.
- **이유**: `parameter_ids` 는 author intent 선언. 파라미터 정의가 minor-bump (parameters.json 에서 id 삭제/리네임) 로 바뀌는 상황에서 에디터가 throw 하면 템플릿 전체가 로드 불가 상태로 단절된다. "슬라이더 안 보임 + overall 만" 은 degrade-gracefully 패턴 — 저자가 주기적으로 physics-lint/validate-schemas 재실행으로 sync 를 유지할 책임. 세션 98 범위에서 validate 추가 규칙(parameters.json 과 교차 검증)은 미포함 — schema 단계에서 id 존재 여부를 알 수 없기 때문(교차 참조는 별도 physics-lint 류 lint tool 범위). 추가 lint 규칙은 세션 99+ 후보.

### D4. 명시 ids 가 overall 을 자동 포함 vs 저자가 수동 포함
- **결정**: 자동 포함 — 세션 95 의 2-stage 규칙과 일관.
- **이유**: 저자 입장에서 "overall 은 항상 포함" 은 불변식이므로 매번 수동 리스트에 넣는 것은 보일러플레이트. 세션 95 D2 에서 이미 결정된 원칙("overall 은 파츠-무관 글로벌 파라미터") 을 explicit 경로에도 동일하게 적용. 중복 제거는 set-based로 안전하게 처리. 미래에 "overall 까지 수동 제어" 니즈가 생기면 `strict: true` 류 옵션으로 확장 가능하지만 현재는 YAGNI.

### D5. 파라미터 listing 순서 — 명시 배열 순서 vs 원본 parameters 순서
- **결정**: 원본 `parameters` 배열 순서 유지 (`filter` 가 보존).
- **이유**: `parameters.json` 의 순서는 rig 저자가 이미 의미적으로 정렬해 둔 UI contract (face 관련 → eyes → body 순 등). `part.parameter_ids` 의 배열 순서는 저자의 parameter lookup 편의에 가까워 UI 일관성이 떨어질 수 있다. 또한 같은 id 를 여러 파츠가 공유할 때 같은 파라미터가 파츠마다 다른 순서로 노출되면 사용자 학습 비용 증가. 원본 순서를 보존하는 편이 에디터 UX 규격 안정성에 유리. 명시 배열은 "어떤 id 를 포함할지" 만 결정.

---

## 5. 후속 (세션 99+)

- **physics-lint 확장** — `parts/*.spec.json` 의 `parameter_ids` 에 나열된 id 가 `parameters.json` 에 실제 존재하는지 교차 검증 규칙(C11). 현 physics-lint 의 C1~C10 이 물리 저작물 내부 일관성만 검사하는데, C11 은 parts↔parameters 경계를 cover. 세션 98 의 silent-empty 정책이 런타임 안정성을 위한 것이라면, C11 은 CI 수준에서 author intent drift 를 조기 차단.
- **기존 파츠에 `parameter_ids` 선택적 부여** — 저자 판단 기반. 휴리스틱이 과도하게 광범위한 파츠(예: Face 카테고리 전체가 모든 얼굴 파라미터 노출) 에서 먼저 opt-in. 각 적용은 L4 골든 재생성 커밋 1건씩 분리.
- **세션 96 (staging)** — cluster access 확보 대기 중. 세션 98 은 Foundation 범위 안에 머물러 배포 경로 영향 없음.
- **세션 97 (Runtime)** — 실 Cubism/WebGL 렌더러 합류 시 `parameter_ids` 계약이 "선택된 파츠 편집 모드" 의 권위 있는 단일 소스로 직접 승격. 세션 98 은 그 소스의 schema 단 기반을 선인입.

---

## 6. 인덱스 갱신

- `progress/INDEX.md` §4 세션 로그에 세션 98 행 추가 (newest-first).
- `progress/INDEX.md` §3 Frontend 축에 "explicit parameter_ids 우선 소비" 업데이트.
- §3 Data 축에 "part-spec schema 에 optional parameter_ids 추가" 언급.
- §8 "다음 3세션 후보" — 98 제거, 99 로 roll.
