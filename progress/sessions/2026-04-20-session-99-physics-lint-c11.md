# 세션 99 — physics-lint C11 `parts↔parameters` 교차 검증

**일자**: 2026-04-20
**워크스트림**: Platform / Infra (CI) + Data
**선행 세션**: 세션 98 (part-spec schema `parameter_ids` optional + `parametersForPart` 3-branch), 세션 49 (physics-lint C10 family split), 세션 40 (physics-lint C1~C10 초판)

---

## 1. 문제

세션 98 이 `schema/v1/part-spec.schema.json` 에 optional `parameter_ids: string[]` 을 도입해 저자가 파츠별로 바인딩되는 파라미터 id 목록을 명시할 수 있게 했다. 그러나 JSON Schema 단계에서는 id 문자열 집합이 **형식적 타당성**만 검증되고(비어 있지 않음 + 중복 없음) 해당 id 가 `parameters.json` 에 실제로 존재하는지는 **확인 불가능** — cross-file reference 는 schema draft 2020-12 범위 밖.

세션 98 런타임 정책은 "missing id 는 silent 하게 무시하고 overall 만 노출" (degrade-gracefully, 세션 98 D3). 이 선택은 `parameters.json` minor-bump 로 id rename/삭제 시 에디터 전체가 단절되는 것을 막지만, **author intent drift 가 조용히 쌓이는 함정** — 저자가 파츠 spec 에 쓴 id 가 어느 순간 parameters.json 에서 사라져도 CI 는 녹색, 에디터는 "overall 만 보이는 파츠" 로 조용히 퇴행.

세션 98 §5 후속에서 이미 지명됐다: **physics-lint 확장 C11 — `parts/*.spec.json.parameter_ids[i]` 가 `parameters.json.parameters[].id` 에 존재하는지 교차 검증.** 세션 99 가 그 안전망을 CI 수준에서 닫는다.

---

## 2. 변경

### 2.1 `scripts/rig-template/physics-lint.mjs`

- `readFile` import 옆에 `readdir` 추가 (`node:fs/promises`).
- 헤더 코멘트 블록 C1~C10 뒤에 **C11** 섹션 추가 — "parts/*.spec.json 의 parameter_ids 가 parameters.json 에 실제 존재 + parts 디렉토리 없거나 필드 사용 spec 0 건이면 no-op" 명시.
- `lintPhysics(templateDir, options)` 의 기존 settings 루프 이후, `return` 전에 C11 블록 추가:
  - `partsDir = join(templateDir, "parts")` 가 없으면 skip.
  - `readdir(partsDir)` → `*.spec.json` 필터 → `JSON.parse` → `partsChecked++`.
  - `Array.isArray(spec.parameter_ids)` 이면 `partsWithBindings++` + 각 id 에 대해 `paramById.has(id)` 검사 → 미존재 시 `C11 parts/<name>.parameter_ids[i]=<id> 이 parameters.json 에 없음 (slot_id=<sid>)` error.
- `summary` 에 `parts_checked`/`parts_with_bindings` 추가. CLI stdout header 에 `parts=<checked>/<bindings>bind` 렌더.

### 2.2 `scripts/rig-template/physics-lint.test.mjs` — 4 신규 케이스 (13 → **17**)

- **2l. C11 — parameter_ids 가 parameters.json 에 없을 때**: v1.3.0 copy 의 `ahoge.spec.json` 에 `["ahoge_sway", "not_a_param_xyz"]` 주입 → exactly 1 C11 error (`not_a_param_xyz`) + 메시지에 `ahoge.spec.json` 포함 + `parts_with_bindings===1`.
- **2m. C11 — 유효 parameter_ids 통과**: `["ahoge_sway"]` (실존) 만 주입 → 0 C11 errors + `parts_with_bindings===1`.
- **2n. C11 — 빈 배열 no-op**: `[]` 는 세션 98 "overall-only" 의미, id 루프가 돌지 않아 error 0 + `parts_with_bindings===1` (빈 배열도 "bindings 존재" 로 계수 — 선언적 의도 구분).
- **2o. C11 — 필드 미지정 backward-compat**: 공식 v1.3.0 그대로 lint → `parts_checked===30` (halfbody 파츠 수) + `parts_with_bindings===0` + C11 error 0.

### 2.3 회귀

- `node scripts/rig-template/physics-lint.test.mjs` — **17/17 pass** (13 기존 + 4 신규 C11).
- `node scripts/test-golden.mjs` — **29/29 all steps pass** (validate-schemas checked=244 불변, 기존 halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 C11 no-op 경로, 오류 0).

---

## 3. 결정 축 (D1–D5)

### D1. lint 위치 — physics-lint vs 별도 `part-spec-lint`
- **결정**: physics-lint 에 C11 로 합류.
- **이유**: `scripts/rig-template/physics-lint.mjs` 는 이미 `parameters.json` 을 읽어 `paramById` Map 을 빌드하고 (C6/C7), `template.manifest.json` 을 읽어 cross-reference 검사(C9) 를 수행한다. C11 이 요구하는 축 — "parts/*.spec.json 의 id 가 parameters.json 에 존재" — 은 파일 로딩·Map 재사용이 90% 겹쳐 별도 script 분리는 코드 중복 + golden step 1개 추가 비용. 이름은 과거 "physics" 에서 "rig-template lint" 로 외연이 이미 확장 중 (C9 cubism_mapping 시점부터). 향후 C12+ 로 deformers↔parameters 교차 같은 축이 추가되어 physics 색채가 더 옅어지면 `rig-template-lint` 로 리브랜딩 후보지만, 세션 99 범위에서 파일 rename + golden step 재배선은 YAGNI.

### D2. `parameter_ids` 미지정 파츠 처리 — 스킵 vs 카운트
- **결정**: `parts_checked` 에 카운트(디렉토리 전체 스캔은 수행) 하고 `parameter_ids` 필드 없으면 **id 루프만 skip**.
- **이유**: "N 개 파츠를 검사했고 그 중 M 개가 명시 바인딩을 갖는다" 가 CI 요약 라인에서 유용한 시그널. Summary 의 `parts_checked/parts_with_bindings` 가 양쪽을 분리해 세션 98 이후 점진 opt-in 진행률을 lint 출력에서 바로 읽을 수 있다 — 현재 halfbody v1.3.0 은 `30/0`, 앞으로 Face 카테고리 8 파츠에 opt-in 추가되면 `30/8` 로 자연스럽게 바뀐다. "검사 0 건" 은 parts 디렉토리가 없는 템플릿 쪽 시그널로 보존.

### D3. 빈 배열 `parameter_ids: []` 의 C11 판정
- **결정**: C11 error 0 + `parts_with_bindings` 에 카운트.
- **이유**: 빈 배열은 세션 98 D2 에서 **명시적 선언** (overall-only) 로 결정됐다. 내부에 id 가 없으니 cross-reference 할 대상이 없어 C11 은 자연스럽게 vacuous-true. `parts_with_bindings` 로 카운트하는 이유는 "저자가 의도를 명시했다" 사실이 `undefined` 와 구분되어야 하기 때문 — lint summary 가 저자의 opt-in 진행률을 정확히 반영하려면 빈 배열도 "설정된 상태" 로 간주. 세션 98 schema 와 의미 정합.

### D4. Error 메시지 포맷 — `slot_id` 포함 여부
- **결정**: 포함. 포맷 `C11 parts/<name>.parameter_ids[<i>]=<id> 이 parameters.json 에 없음 (slot_id=<sid>)`.
- **이유**: 저자가 에러 라인만 보고 수정 지점을 찾을 수 있어야 한다. 파일 경로(`parts/accessory_back.spec.json`) 와 배열 인덱스 + id 만 있으면 충분해 보이지만, slot_id 는 에디터/Inspector/bundle 에서 참조하는 1차 키라서 "이 에러가 어떤 슬롯 UX 에 영향" 을 즉시 연결. 세션 99 는 단일 rig-template 내부 drift 지만 세션 100+ 에서 multi-template lint report 로 확장될 때도 slot_id 가 안정적 키. 포맷에 `(slot_id=...)` suffix 로 분리해 C11 의 인식성 유지.

### D5. CI 에서 실패 vs 경고
- **결정**: 기존 C1~C10 와 동일하게 **fatal** — `errors[]` 에 push → `exit 1`.
- **이유**: physics-lint 의 모든 check 가 fatal 이라는 단일 원칙을 유지해야 lint 출력 해석이 단순하다("한 줄이라도 `✗` 나오면 CI red"). C11 만 warning 급으로 분리하면 "경고는 나와도 녹색" 이라는 애매한 상태를 만들어 drift 가 다시 silent 로 쌓임 — 세션 98 runtime silent 정책을 CI 로 감싸는 목적 자체가 무력화. 미래에 lint 전체를 severity 분리가 필요해지면(예: C-warning prefix) 별도 세션에서 통째로 재설계 — 세션 99 는 기존 규약에 편승.

---

## 4. 후속 (세션 100+)

- **C12 deformers↔parameters 교차 검증 후보** — `deformers.json` 의 warp/rotation 노드가 가리키는 parameter id 가 `parameters.json` 에 존재하는지. 현재는 Cubism SDK 단계에서야 드러남. physics-lint C11 의 파일 스캔/Map 재사용 패턴 그대로.
- **Opt-in 파츠 확대** — 세션 98 §5 의 "휴리스틱이 과도하게 광범위한 Face 카테고리" 부터. 각 opt-in 은 L4 골든 재생성 커밋 1건씩 분리 (sha256 변경 여부는 `parameter_ids` 만 추가일 경우 bundle 에 영향 없음 — 에디터 logic 만 consume, bundle 메타에는 parts spec 이 포함되지 않음 → 실 실험 필요).
- **`rig-template-lint` 리브랜딩** — C11 이후 physics 비중이 절반 이하가 되면 script/step 이름 재정비 고민. 현 시점은 YAGNI.
- **세션 96 (staging)** — cluster access 확보 대기 유지. 세션 99 는 CI-only 변경이라 배포 경로 0 영향.
- **세션 97 (Runtime)** — 실 Cubism/WebGL 렌더러 합류 시 `parameter_ids` 가 에디터/렌더러의 "파츠-선택 편집 모드" 권위 소스로 승격되는데, C11 이 바로 그 소스의 **무결성 CI 게이트**. Runtime 도입 시 C11 이 regression guard 로 즉시 가치 발현.

---

## 5. 인덱스 갱신

- `progress/INDEX.md` §4 세션 로그에 세션 99 행 추가 (newest-first, 세션 98 위).
- §3 Platform / Infra 축에 "physics-lint C11 parts↔parameters 교차 검증" 추가 (check 수 10→11).
- §8 다음 3세션 후보에서 세션 99 제거, 세션 100 후보(opt-in 파츠 확대 또는 C12 deformers↔parameters) 롤.
