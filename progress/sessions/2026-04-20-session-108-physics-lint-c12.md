# 세션 108 — physics-lint C12 `deformers↔parameters` 교차 검증

**일자**: 2026-04-20
**워크스트림**: Platform / Infra (CI) + Data
**선행 세션**: 세션 99 (C11 parts↔parameters), 세션 49 (C10 family split), 세션 107 (parameter_ids opt-in 완결 선언)

---

## 1. 문제

세션 99 가 `parts/*.spec.json.parameter_ids` ↔ `parameters.json.parameters[].id` cross-file 무결성을 C11 로 닫았다. 그러나 동일한 `parameters.json` 을 권위 소스로 참조하는 **별도 축** — `deformers.json.nodes[].params_in[]` — 은 여전히 schema 단계에서만 형식 검증되고 cross-reference 가 비어 있다.

`deformers.json` 은 warp/rotation 트리의 각 노드가 어떤 파라미터에 반응하는지를 선언한다. 예: `head_pose_rot.params_in = ["head_angle_x", "head_angle_y", "head_angle_z"]`. parameters.json minor-bump 로 id 가 rename / 삭제되면 deformer 트리가 조용히 끊어지고, 런타임에서야 (혹은 Cubism Viewer 에서야) 드러난다. C11 패턴을 그대로 deformer 축으로 복제하는 것이 **세션 99 §4 후속**에서 이미 지명된 C12 후보였다.

세션 105 D1 의 3 legacy 블로커(docs/03 §7.3 충돌 / migrator 부재 / 소비자 없음) 는 외부 의존이 풀려야 진전 가능 — 세션 108 은 그동안 self-contained 한 lint 안전망을 한 단계 더 닫는다.

---

## 2. 변경

### 2.1 `scripts/rig-template/physics-lint.mjs`

- 헤더 코멘트 C11 뒤에 **C12** 섹션 추가 — "deformers.json nodes[].params_in 가 parameters.json 에 존재 + deformers.json 없거나 nodes 0 건이면 no-op + 빈 params_in (root, body_visual 같은 컨테이너) 은 정상" 명시.
- `lintPhysics(templateDir, options)` 의 C11 블록 직후에 C12 블록 추가:
  - `deformersPath = join(templateDir, "deformers.json")` 가 없으면 skip.
  - `JSON.parse` → `for (const node of deformers.nodes ?? [])` → `deformerNodesChecked++`.
  - `Array.isArray(node.params_in)` 이면 각 id 에 대해 `paramById.has(id)` 검사 + `deformerParamsInChecked++`.
  - 미존재 시 `C12 deformers.nodes[<id>].params_in[<i>]=<id> 이 parameters.json 에 없음 (type=<type>)` error.
- `summary` 에 `deformer_nodes_checked`/`deformer_params_in_checked` 추가. CLI stdout header 에 `deformers=<nodes>/<params>params` 렌더 (C11 의 `parts=N/Mbind` 와 대칭).

### 2.2 `scripts/rig-template/physics-lint.test.mjs` — 4 신규 케이스 (17 → **21**)

- **2p. C12 — 미존재 id**: v1.3.0 copy 의 `head_pose_rot.params_in` 에 `not_a_param_xyz` 추가 → exactly 1 C12 error + 메시지에 `head_pose_rot` 노드 id 포함.
- **2q. C12 — 빈 params_in 컨테이너 노드는 no-op**: clean v1.3.0 lint → C12 error 0 + `deformer_nodes_checked > 0` + `deformer_params_in_checked > 0` (root/body_visual 등 빈 노드 + head_pose_rot 등 비어있지 않은 노드 혼재).
- **2r. C12 — deformers.json 누락 시 no-op**: `deformers.json` 삭제 후 lint → C12 error 0 + `deformer_nodes_checked === 0`.
- **2s. C12 — 모든 공식 템플릿이 통과**: halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 모두 C12 0 error + 노드/params 카운트 > 0 sanity 검증.

### 2.3 회귀

- `node scripts/rig-template/physics-lint.test.mjs` — **21/21 pass** (17 기존 + 4 신규 C12).
- `node scripts/test-golden.mjs` — **all steps pass** (validate-schemas 불변, halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 C12 통과 카운트:
  - halfbody v1.0.0 — `deformers=14/30params`
  - halfbody v1.1.0 — `deformers=16/32params`
  - halfbody v1.2.0 — `deformers=18/40params`
  - halfbody v1.3.0 — `deformers=21/43params`
  - fullbody v1.0.0 — `deformers=29/53params`).

---

## 3. 결정 축 (D1–D5)

### D1. C12 위치 — physics-lint vs 신규 lint
- **결정**: physics-lint 에 C12 로 합류 (C11 와 동일 판단).
- **이유**: `lintPhysics()` 는 이미 `parameters.json` 을 읽어 `paramById` Map 을 빌드해 C6/C7/C11 에서 재사용한다. C12 가 요구하는 cross-reference 도 동일 Map 만 있으면 충족 — 별도 script 분리는 파일 IO + Map 재구축 + golden step 추가 비용이 새 가치 0. 세션 99 D1 의 "rig-template-lint 리브랜딩은 YAGNI" 판단 그대로. C12 가 들어가도 physics 색채 하락분은 미세 — 리브랜딩 임계점 도달 시점은 여전히 미래.

### D2. 빈 `params_in: []` 의 C12 판정
- **결정**: error 0, id 루프만 skip, `deformer_nodes_checked` 에는 카운트.
- **이유**: 빈 params_in 은 deformer 트리에서 **컨테이너 노드** 의 정상 형태다. `root.params_in = []` (트리 정점), `body_visual.params_in = []` (상반신 묶음 컨테이너 — 자식 파츠는 묶고 직접 받는 입력은 없음). 빈 배열을 error 로 간주하면 deformer 모델링 자체가 망가진다. C11 의 빈 배열 (overall-only 명시 선언) 과는 의미가 다르므로 C12 에서는 `deformer_params_in_checked` 카운트만 빠지고 `deformer_nodes_checked` 는 증가 — "노드 N 개 검사, 그 중 합계 M 개 params_in id 검사" 로 lint 출력이 자연스럽게 분리.

### D3. Error 메시지 포맷 — `node.id` + `node.type` 포함
- **결정**: 포맷 `C12 deformers.nodes[<id>].params_in[<i>]=<param-id> 이 parameters.json 에 없음 (type=<warp|rotation|...>)`.
- **이유**: deformer 노드는 `id` 가 1차 키이고(`head_pose_rot` 같은 의미 식별자), `type` 이 보조 컨텍스트 (warp 인지 rotation 인지에 따라 수정 위치가 다름 — Cubism Editor 에서는 별도 패널). C11 의 `slot_id` suffix 와 대칭 패턴 유지 — 저자가 에러 라인만 보고 `deformers.json` 의 어느 노드를 열어 어디를 고칠지 즉시 결정.

### D4. CI 에서 실패 vs 경고
- **결정**: 기존 C1~C11 와 동일하게 **fatal** — `errors[]` push → `exit 1`.
- **이유**: 세션 99 D5 와 동일 원칙 — physics-lint 는 single-severity 모델("✗ 한 줄이면 red") 을 유지해야 출력 해석이 단순. C12 만 warning 으로 분리하면 deformer drift 가 다시 silent 로 쌓이고 런타임에서야 드러난다 — C12 도입 목적 자체 무력화.

### D5. 검사 범위 — `nodes[].params_in` 만 vs `root_id` / `parent` 도 cross-check
- **결정**: `params_in` 만. `root_id` 와 `parent` 의 noun-id 무결성은 schema (또는 별도 D-체크) 영역.
- **이유**: 세션 108 의 단일 축은 "deformer ↔ parameter cross-file id 무결성". `root_id` / `parent` 는 deformer 트리 내부의 self-reference 라서 검사 데이터 소스가 다르다(deformers.json 자체). 두 축을 한 번에 끌어들이면 C12 의 단일 책임이 흐려진다 — 트리 무결성 (orphan node, cycle, 미존재 parent) 은 별도 C13 후보로 분리하는 것이 lint catalog 의 stratified 구조에 맞다.

---

## 4. 후속 (세션 109+)

- **C13 deformer 트리 무결성 후보** — `nodes[].parent` 가 다른 노드 id 를 가리키는지 + `root_id` 가 nodes 에 존재 + 사이클 없음. 세션 108 의 C12 와 같은 파일을 한 번 더 순회하므로 cost 는 O(N) 추가일 뿐. 우선순위는 deformer drift 사고 경험이 쌓일 때.
- **`rig-template-lint` 리브랜딩** — C11 + C12 추가로 physics 색채가 더 옅어졌지만 file rename + golden step 재배선 부담은 여전. C13 까지 들어가면 임계점 — 세션 110+ 후보.
- **legacy v1.0.0~v1.2.0 opt-in** — 세션 105 D1 의 3 블로커(§7.3 충돌 / migrator 부재 / 소비자 없음) 그대로. C12 도입은 legacy 판단에 무영향 (모든 legacy 가 이미 C12 통과 — deformers.json 이 안정).
- **migrator 인프라 선행** — 세션 105 D1 (b) 해소 후보 위치 유지. C12 는 migrator 가 v1.3.0 → v1.4.0 같은 업그레이드를 만들어낼 때 deformer params_in id 변경분을 자동으로 검증하는 안전망으로도 작동.
- **세션 96 (staging)** — cluster access 확보 대기 유지. 세션 108 은 CI-only.

---

## 5. 인덱스 갱신

- `progress/INDEX.md` §4 세션 로그에 세션 108 행 추가 (newest-first, 세션 107 위).
- §3 Platform / Infra 축에 "physics-lint C12 deformers↔parameters 교차 검증" 추가 (check 수 11→12).
- §8 다음 3세션 후보에서 세션 108 제거, 세션 109 후보 (legacy opt-in / migrator skeleton / C13 deformer 트리 무결성) 롤.

---

## 6. 산출물 요약

| 영역 | 변경 |
|---|---|
| `scripts/rig-template/physics-lint.mjs` | C12 블록 추가 (deformer cross-ref) + summary 2 필드 + CLI header `deformers=N/Mparams` |
| `scripts/rig-template/physics-lint.test.mjs` | 4 신규 케이스 (2p~2s) — 미존재 id / 빈 params_in / deformers.json 누락 / 공식 5 템플릿 통과 |
| 공식 lint 통과 | halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 C12 0 error |
| 새 fatal check | C11 (parts) + **C12 (deformers)** 자매 쌍 — parameters.json 권위 보호 양면화 |
