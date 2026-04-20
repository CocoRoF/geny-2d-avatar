# 세션 109 — physics-lint C13 deformer 트리 무결성

**일자**: 2026-04-20
**워크스트림**: Platform / Infra (CI) + Data
**선행 세션**: 세션 108 (C12 deformers↔parameters), 세션 99 (C11 parts↔parameters)

---

## 1. 문제

세션 108 이 `deformers.json.nodes[].params_in` ↔ `parameters.json.parameters[].id` cross-file 무결성을 C12 로 닫았다. 그러나 동일 파일의 **tree self-reference 축** — `root_id` / `nodes[].parent` — 은 schema 의 pattern/oneOf 제약만 걸려 있고 cross-node 참조 무결성은 비어 있다.

예: `overall_warp.parent = "not_a_node_xyz"` 는 schema 를 통과하지만 런타임에서 탐색 실패. 또는 임의 두 노드가 서로를 가리키는 parent 체인 사이클은 exporter 가 트리 순회하는 순간 무한루프 또는 방문 실패. 또는 root 에서 도달 불가능한 "island" 서브트리는 exporter 에서 조용히 누락된다.

세션 108 D5 에서 이미 C13 후보로 지명되어 있었고, self-contained (external 의존 없음) · 1 세션 규모 · C12 와 같은 파일 한 번 더 순회라는 세 조건이 맞아 세션 109 진입.

---

## 2. 변경

### 2.1 `scripts/rig-template/physics-lint.mjs`

- 헤더 코멘트 C12 뒤에 **C13** 섹션 추가. 7 sub-rule 명시:
  - C13-duplicate: nodes[].id 유일성
  - C13-root-missing: root_id 가 nodes 에 존재
  - C13-root-parent: root 의 parent === null
  - C13-parent-missing: 비-root 의 parent 가 실존 id
  - C13-non-root-null-parent: 비-root 는 parent=null 금지 (다중 루트 차단)
  - C13-cycle: parent 체인 사이클 탐지
  - C13-orphan: root 에서 도달 불가능한 노드 탐지
- `lintPhysics(templateDir, options)` 의 C12 블록 직후에 C13 블록 추가:
  - 중복 id 집합 빌드 + error push (duplicate).
  - `rootNode = nodeById.get(root_id)` → 미존재면 root-missing, 존재하지만 parent 가 null 이 아니면 root-parent.
  - 각 비-root 노드 loop: parent 가 null 이면 non-root-null-parent, parent 가 nodeById 에 없으면 parent-missing.
  - **reachability DFS**: rootId 에서 출발 stack, `n.parent === id` 인 자식만 push. visited set 기록.
  - **cycle detection**: 각 비-root 노드에서 parent 체인을 따라 올라가며 `chain` set 에 재방문 발생 시 cycle.
  - **orphan**: reachability DFS 완료 후 visited 에 없는 유효 id 는 orphan.
- `summary.deformer_tree_checked: boolean` 추가 (deformers.json 이 있고 nodes.length > 0 일 때 true).
- CLI stdout header 에 `tree=<ok|skip>` 렌더 추가 (C11 의 `parts=N/Mbind` / C12 의 `deformers=N/Mparams` 와 대칭).

### 2.2 `scripts/rig-template/physics-lint.test.mjs` — 9 신규 케이스 (21 → **30**)

- **2t. C13-duplicate**: `ahoge_warp` 노드 복제 push → 정확히 1 C13-duplicate error + 메시지에 노드 id 포함.
- **2u. C13-root-missing**: `root_id = "ghost_root"` 로 치환 → 1 C13-root-missing + 메시지에 바뀐 id 포함.
- **2v. C13-root-parent**: root 노드의 parent 를 `overall_warp` 로 → 1 C13-root-parent + 메시지에 `"root"` 포함.
- **2w. C13-parent-missing**: `ahoge_warp.parent = "not_a_node_xyz"` → 1 C13-parent-missing + ahoge_warp 가 orphan 으로도 잡힘(자연 부수 효과, 두 축 동시 보고의 정상 사례).
- **2x. C13-non-root-null-parent**: `ahoge_warp.parent = null` → 1 C13-non-root-null-parent (다중 루트 차단).
- **2y. C13-cycle**: `overall_warp.parent = "ahoge_warp"` 로 설정 — `ahoge→head_pose_rot→...→overall→ahoge` 사이클. >=1 C13-cycle error.
- **2z. C13-orphan + island cycle**: 독립 서브트리 `island_a↔island_b` 쌍 추가 → 두 노드 다 orphan + 자체 사이클 동시 보고.
- **2aa. C13 공식 템플릿 통과**: halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 C13 0 error + `deformer_tree_checked === true`.
- **2ab. deformers.json 누락**: 삭제 후 lint → C13 0 + `deformer_tree_checked === false` (tree=skip 표시).

### 2.3 회귀

- `node scripts/rig-template/physics-lint.test.mjs` — **30/30 pass** (21 기존 + 9 신규 C13).
- `node scripts/test-golden.mjs` — **all steps pass**. 공식 5 템플릿 전부 `tree=ok` 출력:
  - halfbody v1.0.0 — `deformers=14/30params tree=ok`
  - halfbody v1.1.0 — `deformers=16/32params tree=ok`
  - halfbody v1.2.0 — `deformers=18/40params tree=ok`
  - halfbody v1.3.0 — `deformers=21/43params tree=ok`
  - fullbody v1.0.0 — `deformers=29/53params tree=ok`

---

## 3. 결정 축 (D1–D5)

### D1. reachability DFS 와 cycle detection 분리
- **결정**: root 에서 내려가는 BFS-like stack (reachability) 과 각 노드의 parent chain 을 타고 올라가는 별도 pass (cycle) 를 **따로 돌린다**.
- **이유**: 단일 pass 로 둘 다 잡으려면 "active stack" 표시가 필요한데, root 와 분리된 "island" 서브트리(세션 109 테스트 2z) 는 root DFS 로 절대 진입하지 않아 cycle 이 감지되지 않는다. 두 pass 로 나누면 island-내부 사이클도 parent-chain 상승 시점에 걸린다. 추가 cost 는 O(N·depth) — N=29 최대, depth < 10 인 현 트리 규모에서 경량.

### D2. C13-parent-missing 과 C13-orphan 의 동시 보고 허용
- **결정**: parent 가 미존재 id 를 가리키는 노드는 parent-missing + orphan 둘 다 보고(테스트 2w 에서 명시적 검증).
- **이유**: 두 축은 독립 정보 — "parent 가 이상하다(C13-parent-missing)" vs "이 노드가 트리에서 끊어졌다(C13-orphan)". C11 에서 여러 규칙이 한 파츠의 한 필드에 동시 걸리는 정신(예: C7 + C10-suffix, 테스트 2e) 과 동일. 저자가 에러 라인을 보고 "parent id 를 고치면 orphan 도 자동 해소" 라는 인과를 읽도록 의도.

### D3. 빈 trees — `deformers.json` 누락 시 tree_checked=false
- **결정**: 파일 없으면 C13 전체 skip + `summary.deformer_tree_checked = false` (C12 의 `deformer_nodes_checked = 0` 과 대칭).
- **이유**: deformers.json 은 optional 파일이 아니지만(공식 템플릿은 전부 필수) lint 는 디폴트로 관용적이어야 정교한 subset 테스트(세션 99 D2 stripping 패턴) 가 가능하다. tree_checked=false 를 summary 에 명시해 **상위 CI 가 필요하면 별도 가드** 로 "이 패스에서 트리 검사가 실제 일어났는지" 를 assert 할 수 있음.

### D4. CLI header 에 `tree=<ok|skip>` 렌더
- **결정**: `parts=N/Mbind deformers=N/Mparams tree=<ok|skip>` 형태로 한 줄에 3 축 상태를 시각화.
- **이유**: C11/C12 는 각각 parts 와 params 카운트로 "얼마나 검사됐는지" 가 드러나지만, C13 은 7 sub-rule 이라 개수로 표현이 어색하다. `ok/skip` 2진 표기로 "검사가 수행됐는가?" 만 압축 — 저자가 `tree=skip` 를 보면 "deformers.json 이 빠졌다 / subset 이다" 를 즉시 인식.

### D5. C13 실패 = fatal (C1~C12 와 동일)
- **결정**: 기존 single-severity 유지. C13 error 1 개라도 발생 시 `exit 1`.
- **이유**: 세션 99 D5 / 108 D4 와 동일 원칙. trees 가 끊어지면 exporter 가 런타임에서 silent-drop 하거나 무한루프 — warning 으로 눌러두면 런타임 사고를 부른다. physics-lint 가 "✗ 한 줄이면 red" 모델을 유지해야 출력 해석이 단순.

---

## 4. 후속 (세션 110+)

- **`rig-template-lint` 리브랜딩** — C11+C12+C13 누적으로 physics 색채가 상당히 옅어짐. file rename + golden step 재배선은 mechanical 이지만 세션 108 D1 의 "임계점 미도달" 판단은 이제 뒤집어도 무방. 세션 110 후보로 승격.
- **migrator 인프라 선행** — 세션 105 D1 (b) 해소 위치 유지. C13 은 migrator 가 v1.3.0 → v1.4.0 같은 업그레이드에서 deformer 트리 재배치(예: ahoge 를 `head_pose_rot` 에서 `overall_warp` 로 이동) 를 수행할 때 **트리 무결성을 자동 검증**하는 안전망으로 작동.
- **legacy v1.0.0~v1.2.0 opt-in** — 세션 105 D1 의 3 블로커 그대로. C13 도입 무영향 (모든 legacy 가 이미 C13 통과).
- **세션 96 (staging)** — cluster access 대기 유지.
- **C13 확장 — `deformation_parent` part 참조 축** (후보): `parts/*.spec.json.deformation_parent` 가 deformers.nodes[].id 중 하나를 가리키는지 교차 검증. C11(parts↔parameters) + C12(deformers↔parameters) + C13(deformers 내부) + **C14(parts↔deformers)** 사각형 완성 가능. 현재 세션 109 범위 밖.

---

## 5. 인덱스 갱신

- `progress/sessions/` 에 본 파일 추가 (세션 109).
- `progress_0420/INDEX.md`:
  - §1 누적 세션 108 → **109**.
  - §1 CI 게이트 — physics-lint 12 → **13 (C13 포함)**.
  - §2 Platform/Infra 축 — "physics-lint 12 rules" → "13 rules (C13 deformer 트리 무결성)".
  - §4 세션 109 후보 제거, **세션 110 후보** (rig-template-lint 리브랜딩 / migrator skeleton / legacy opt-in) 롤.
- `progress_0420/PLAN.md`:
  - §2 후보 A (C13) 상태 ✅ 완료 표시 / §3 우선순위에서 후보 A 제거.
  - 후보 D (리브랜딩) 를 즉시 실행 후보로 승격.

---

## 6. 산출물 요약

| 영역 | 변경 |
|---|---|
| `scripts/rig-template/physics-lint.mjs` | C13 블록 추가 (7 sub-rule) + `deformer_tree_checked` summary 필드 + CLI header `tree=<ok|skip>` |
| `scripts/rig-template/physics-lint.test.mjs` | 9 신규 케이스 (2t~2ab) — duplicate / root-missing / root-parent / parent-missing / non-root-null-parent / cycle / orphan+island / 공식 5 템플릿 / deformers.json 누락 |
| 공식 lint 통과 | halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 C13 0 error + tree=ok |
| 새 fatal check | C11 (parts) + C12 (deformers params) + **C13 (deformers tree)** — parameters.json & deformer 구조 양면 방어망 완결 |
