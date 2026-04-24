# Runbook 03 — rig-template-lint C1~C14 규칙 카탈로그

`scripts/rig-template/rig-template-lint.mjs` (ADR 0005 L2 — 저자 개입 게이트) 의 14 규칙 × 부분 sub-rule 전수 색인.
**4-라인 고정 구조** (보장 / 실행 / 의존성 / 도입) — 세션 122 runbook 02 + 세션 123 schema/README 패턴 재활용.
CLI 에러 메시지 prefix 는 `C1~C14` 그대로 — 세션 110 리브랜딩(physics-lint → rig-template-lint) 시에도 역사 식별자 보존.

> **본 runbook 의 최후 권위는 `scripts/rig-template/rig-template-lint.mjs` 소스와 `...test.mjs` 의 34 케이스**. 본 문서는 운영/검수 관점 색인 — 드리프트 발견 시 소스 우선.

---

## 0. 분류

14 규칙 × 34 테스트 케이스. 세션별 축적:

| 구간 | 규칙 | 축 | 도입 |
|---|---|---|---|
| §1 meta 카운트 | C1~C5 | physics.json ↔ 자기 자신 | 세션 40~41 |
| §2 input/output 계약 | C6~C9 | physics.json ↔ parameters.json + manifest | 세션 40~43 |
| §3 네이밍 규약 | C10 (2 sub) | physics.output ↔ FAMILY_OUTPUT_RULES | 세션 49 (family 분리) |
| §4 cross-file 파라미터 | C11 · C12 | parts/deformers ↔ parameters.json | 세션 99 · 108 |
| §5 deformer 트리 무결성 | C13 (7 sub) | deformers.json 자기 자신 | 세션 109 |
| §6 parts ↔ deformers | C14 | parts ↔ deformers.json | 세션 112 |

L2 사각형 완결: C11(parts↔params) + C12(deformers↔params) + C13(deformers 내부) + C14(parts↔deformers) = parameter 축과 deformer 축이 교차 검증되는 4 변. 세션 112 D5 기록 — 이후 self-contained lint 확장 여지 소진.

CLI 호출:
```bash
node scripts/rig-template/rig-template-lint.mjs <templateDir> [--baseline <dir>] [--family <name>]
```

golden step `rig-template-lint halfbody v1.0.0..v1.3.0 + fullbody v1.0.0` 로 매 PR 실측 (runbook 02 §4 참조).

---

## §1. meta 카운트 (C1~C5)

### C1 — `meta.physics_setting_count === physics_settings.length`
- **보장**: physics.json 의 `meta.physics_setting_count` 가 실제 `physics_settings` 배열 길이와 동일.
- **실행**: 불일치 시 `[C1] meta.physics_setting_count mismatch (meta=<X> actual=<Y>)` fatal.
- **의존성**: `physics.json` 만.
- **도입**: 세션 40 (physics-lint 초판).

### C2 — `meta.total_input_count === Σ setting.input.length`
- **보장**: 전체 input 총 개수 = 각 setting.input 길이 합.
- **실행**: 불일치 시 `[C2] meta.total_input_count mismatch` fatal.
- **의존성**: `physics.json` 만.
- **도입**: 세션 40.

### C3 — `meta.total_output_count === Σ setting.output.length`
- **보장**: 전체 output 총 개수 = 각 setting.output 길이 합.
- **실행**: 불일치 시 `[C3] meta.total_output_count mismatch` fatal.
- **의존성**: `physics.json` 만.
- **도입**: 세션 40.

### C4 — `meta.vertex_count === Σ setting.vertices.length`
- **보장**: 전체 vertex 총 개수 = 각 setting.vertices 길이 합.
- **실행**: 불일치 시 `[C4] meta.vertex_count mismatch` fatal.
- **의존성**: `physics.json` 만.
- **도입**: 세션 40.

### C5 — `physics_dictionary` ↔ `physics_settings` id 집합 동일 (중복 없음)
- **보장**: dictionary 의 id 집합 = settings 의 id 집합 + 각 집합 내 중복 없음.
- **실행**: `[C5] dictionary/settings id mismatch` fatal (missing / extra / duplicate 세부 정보 포함).
- **의존성**: `physics.json` 만.
- **도입**: 세션 40.

---

## §2. input / output 계약 (C6~C9)

### C6 — 모든 `input.source_param` 이 parameters 에 존재 + `physics_input: true`
- **보장**: physics setting 의 입력 소스가 실제 parameters.json 의 파라미터여야 하고, 해당 파라미터에 `physics_input: true` opt-in 이 있어야 함.
- **실행**: 미존재 시 `[C6] missing input source_param`, opt-in 누락 시 `[C6] input source_param not physics_input` fatal.
- **의존성**: `physics.json` + `parameters.json`.
- **도입**: 세션 40.

### C7 — 모든 `output.destination_param` 이 parameters 에 존재 + `physics_output: true`
- **보장**: physics setting 의 출력 대상이 parameters.json 의 파라미터여야 하고 `physics_output: true` opt-in 필요.
- **실행**: `[C7] missing output destination_param` / `[C7] output destination_param not physics_output` fatal.
- **의존성**: `physics.json` + `parameters.json`.
- **도입**: 세션 40.

### C8 — `output.vertex_index` 가 `0..vertices.length-1` 범위
- **보장**: 각 output 의 vertex_index 가 해당 setting 의 vertices 배열 인덱스 유효 범위 내.
- **실행**: 범위 밖 시 `[C8] vertex_index out of range (setting=<id> idx=<N> max=<M>)` fatal.
- **의존성**: `physics.json` 만.
- **도입**: 세션 41.

### C9 — 모든 `output.destination_param` 이 manifest 의 `cubism_mapping` 에 등록
- **보장**: physics 가 쓰는 출력 파라미터는 cubism export 시 매핑 규칙이 반드시 존재.
- **실행**: 누락 시 `[C9] cubism_mapping missing for destination_param` fatal.
- **의존성**: `physics.json` + `template.manifest.json`.
- **도입**: 세션 43.

---

## §3. 네이밍 규약 (C10 — 2 sub-rule)

C10 은 **family 별 분리** (세션 49 D). `template.manifest.json.family` 기반으로 `FAMILY_OUTPUT_RULES` 테이블을 조회, `--family <name>` override 허용.

### C10-suffix — 출력 파라미터 접미사 정규식
- **보장**: 각 family 의 허용 접미사 regex 에 match (좌우 분리는 `(_[lr])?`).
- **실행**: 미매치 시 `[C10-suffix] <id> 가 family=<name> 의 허용 접미사에 맞지 않음` fatal.
- **의존성**: `physics.json` + `template.manifest.json.family` + `FAMILY_OUTPUT_RULES`.
- **도입**: 세션 40 (C10 통합) → 세션 49 (family 분리로 suffix 서브 규칙화).

### C10-forbidden — 해당 family 에 있을 수 없는 prefix 차단
- **보장**: 예: `halfbody` 에 `leg_` / `foot_` / `skirt_` / `tail_` 물리 출력이 들어오면 타이포 또는 잘못된 base 선택으로 간주하고 차단.
- **실행**: 매치 시 `[C10-forbidden] <id> 는 family=<name> 에서 금지된 prefix` fatal.
- **의존성**: `physics.json` + `FAMILY_OUTPUT_RULES`.
- **도입**: 세션 49.

---

## §4. cross-file 파라미터 (C11 · C12)

### C11 — `parts/*.spec.json.parameter_ids` ↔ `parameters.json`
- **보장**: 세션 98 도입된 `parameter_ids` opt-in 의 각 id 가 parameters.json 의 `parameters[].id` 에 실존. `parts/` 없거나 `parameter_ids` 사용 spec 0 건이면 no-op. 빈 배열 `[]` 은 "overall-only 명시" (세션 95 D2 / 98 D2 시맨틱) — 허용.
- **실행**: `[C11] <slot>.parameter_ids 의 '<id>' 가 parameters.json 에 없음` fatal.
- **의존성**: `parameters.json` + `parts/*.spec.json`.
- **도입**: 세션 99 (C11 최초) → 세션 100~107 (opt-in 대상 확장 — Face 14 / Hair·Body 선별 / 잔여).

### C12 — `deformers.json.nodes[].params_in` ↔ `parameters.json`
- **보장**: deformer 트리 노드의 `params_in` 배열에 나열된 파라미터 id 가 parameters.json 에 실존. 빈 `params_in` (컨테이너 노드: root, body_visual 등) 은 정상 — 자식만 묶고 자기 자신은 파라미터를 안 가짐. `deformers.json` 없거나 nodes 0 건이면 no-op.
- **실행**: `[C12] deformer node '<id>' 의 params_in '<param>' 이 parameters.json 에 없음` fatal.
- **의존성**: `parameters.json` + `deformers.json`.
- **도입**: 세션 108.

---

## §5. deformer 트리 무결성 (C13 — 7 sub-rule)

C12 가 parameter id 축을 보는 반면 C13 은 tree 내부 self-reference 축. `deformers.json` 없거나 nodes 0 건이면 no-op (`tree_checked=false` 로 summary 에 노출).

### C13-duplicate — `nodes[].id` 유일성
- **보장**: 중복 선언 시 parent 해석 모호성 발생.
- **실행**: `[C13-duplicate] 중복 노드 id: <ids>` fatal.
- **의존성**: `deformers.json` 만.
- **도입**: 세션 109.

### C13-root-missing — `manifest.root_id` 가 nodes 에 존재
- **보장**: manifest 가 가리키는 루트가 deformers 노드 중 하나여야 함.
- **실행**: `[C13-root-missing] manifest.root_id '<id>' 가 nodes 에 없음` fatal.
- **의존성**: `deformers.json` + `template.manifest.json`.
- **도입**: 세션 109.

### C13-root-parent — root 의 `parent === null`
- **보장**: 트리 정점 불변식.
- **실행**: `[C13-root-parent] root '<id>' 의 parent 가 null 이 아님 (<parent>)` fatal.
- **의존성**: `deformers.json` + manifest.
- **도입**: 세션 109.

### C13-parent-missing — 비-root 노드의 parent 가 실존 id
- **보장**: parent 포인터가 nodes 중 하나를 가리켜야 함.
- **실행**: `[C13-parent-missing] '<id>' 의 parent '<parent>' 가 nodes 에 없음` fatal.
- **의존성**: `deformers.json` 만.
- **도입**: 세션 109.

### C13-non-root-null-parent — 비-root 노드는 parent≠null
- **보장**: 다중 루트 금지 (암묵적 서브트리 차단).
- **실행**: `[C13-non-root-null-parent] 비-root '<id>' 가 parent=null` fatal.
- **의존성**: `deformers.json` + manifest (root_id 로 비-root 판정).
- **도입**: 세션 109.

### C13-cycle — parent 포인터 사이클 금지
- **보장**: root 에서 DFS 하며 재방문 발생 시 사이클.
- **실행**: `[C13-cycle] 사이클 감지: <id> → ... → <id>` fatal.
- **의존성**: `deformers.json` + manifest.
- **도입**: 세션 109.

### C13-orphan — root 에서 도달 가능한 노드만 허용
- **보장**: root 에서 닿지 않는 노드 = 고아 = 숨은 서브트리, 차단.
- **실행**: `[C13-orphan] root 에서 도달 불가능: <ids>` fatal.
- **의존성**: `deformers.json` + manifest.
- **도입**: 세션 109.

---

## §6. parts ↔ deformers (C14)

### C14 — `parts/*.spec.json.deformation_parent` ↔ `deformers.json.nodes[].id`
- **보장**: 파츠 spec 의 `deformation_parent` (docs/03 §4 필수 필드) 가 deformers 노드 중 하나여야 함. `deformers.json` 없으면 no-op (스키마 이전 템플릿). 파츠 spec 에 `deformation_parent` 가 string 이 아니면 skip (스키마 책임 축).
- **실행**: `[C14] parts/<slot>.deformation_parent '<parent>' 가 deformers.nodes 에 없음` fatal.
- **의존성**: `deformers.json` + `parts/*.spec.json`.
- **도입**: 세션 112 — L2 사각형 완결 (C11 + C12 + C13 + C14 = parts/deformers ↔ parameter/자기참조 교차 완성).

---

## §7. FAMILY_OUTPUT_RULES 테이블 (C10 근거)

`rig-template-lint.mjs` line 81-110 의 export — schema enum 6 종 전부 매핑 (테스트 `FAMILY_OUTPUT_RULES 가 schema enum 6종 커버` 보장).

| family | pattern | forbiddenPrefixes | 비고 |
|---|---|---|---|
| `halfbody` | `/_(sway\|phys\|fuwa)(_[lr])?$/` | `leg_`, `foot_`, `skirt_`, `tail_` | 상반신 전용 — 하반신 파츠 물리 출력 차단 |
| `masc_halfbody` | 동일 | 동일 | 상반신 남성형 — halfbody 와 동일 rule |
| `chibi` | 동일 | `[]` | 전신 비율이나 lowerbody 최소 — halfbody 와 동일 suffix, forbidden 은 향후 실측 시 추가 |
| `fullbody` | 동일 | `[]` | 전신 — 하반신 파츠 허용 |
| `feline` | 동일 | `[]` | 수인형 — forbidden 없음 |
| `custom` | 동일 | `[]` | 파생 fork — 템플릿 작성자 책임, 기본 규약 유지 |

**확장 원칙** (ADR 0005 L2 정신): 과잉 명세 금지. 새 family 접미사 확장(`_wave` 등)은 실 저작 세션 PR 에서 명시적으로 추가. 미등록 family 는 `[C10] 알 수 없는 family '<name>'` 으로 **explicit throw** — 저자가 반드시 rule 을 등록하도록 강제 (테스트 `미등록 family 는 explicit throw` 보장).

---

## §8. CLI 옵션

### `<templateDir>` (필수 positional)
예: `rig-templates/base/halfbody/v1.3.0`. 정확히 1 개. 누락 / 2개 이상 시 `rig-template-lint: 정확히 1 개의 templateDir 이 필요` 후 exit 1.

### `--baseline <dir>` (선택)
주어지면 타겟과 baseline `physics.json` 사이의 structural diff 리포트 (stdout human-readable). purpose: `v1.2.0 → v1.3.0` 저자 개입 지점에서 "이전 버전 대비 어디가 새로 설정됐는지" 판단. golden 테스트 `diff v1.2.0→v1.3.0 = +3 settings` 로 회귀 고정 (PhysicsSetting10/11/12 신규).

### `--family <name>` (선택)
`manifest.family` 대신 override. 미래 family 대응 테스트 / 마이그레이션 리허설용. 테스트 `--family fullbody override 가 하반신 파츠 허용` 으로 회귀 고정.

### `--help` / `-h`
Usage 출력 후 exit 0.

### Summary 출력 (stdout 1 줄)
```
rig-template-lint <dir>: family=<f> settings=<N> in=<I> out=<O> verts=<V>
  parts=<checked>/<with_bindings>bind/<deformation_parents_checked>defparent
  deformers=<nodes_checked>/<params_in_checked>params
  tree=<ok|skip>
```

에러 있으면 stderr 각 줄 `  ✗ <msg>`, 전수 통과 시 stdout `  ✓ all checks pass`. exit code = errors.length > 0 ? 1 : 0.

---

## §9. 테스트 매핑 (34 케이스)

`scripts/rig-template/rig-template-lint.test.mjs` — 표준 CLI 엔트리 (`node --test` 미사용, `test:golden` step 18 로 호출). 각 `console.log("  ✓ <label>")` = 1 케이스.

| 구간 | 케이스 수 | 라벨 키워드 |
|---|---|---|
| 공식 버전 sweep | 1 | `halfbody v1.0.0..v1.3.0 전부 clean` |
| C1 · C2 · C8 · C6 · C7+C10-suffix · C9 · C5 | 7 | meta mismatch · vertex_index · missing source_param · output 규약 · cubism_mapping · dictionary mismatch |
| C10-forbidden + family override | 4 | `leg_sway` 차단 · `--family fullbody` override · 미등록 family throw · schema enum 6 커버 |
| C11 | 4 | 미존재 id 차단 · 유효 통과 · 빈 배열 no-op · v1.3.0 공식 통과 |
| C12 | 4 | 미존재 id 차단 · 빈 params_in no-op · deformers.json 누락 no-op · 공식 halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 통과 |
| C13 | 9 | 7 sub-rule 각 1 + 공식 sweep + `tree_checked=false` no-op |
| C14 | 4 | 미존재 parent 차단 · deformers 누락 no-op · spec 스킵 · 공식 sweep |
| --baseline diff | 1 | `v1.2.0→v1.3.0 = +3 settings` |

**도입 세션별 누적**: 세션 40 (C1~C10 최초 11 케이스) → 세션 49 (C10 family 분리 +4) → 세션 99 (C11 +4, 20) → 세션 108 (C12 +4, 24) → 세션 109 (C13 +9, 33) → 세션 112 (C14 +4, 세션 101 등에서 기존 C11 공식 통과 라벨 병합으로 34). 숫자의 최후 권위는 `grep -cE '✓' scripts/rig-template/rig-template-lint.test.mjs` 실측.

---

## §10. 참고

- [`scripts/rig-template/rig-template-lint.mjs`](../../scripts/rig-template/rig-template-lint.mjs) — 소스 (550 줄).
- [`scripts/rig-template/rig-template-lint.test.mjs`](../../scripts/rig-template/rig-template-lint.test.mjs) — 테스트 (643 줄, 34 케이스).
- [`progress/adr/0005-rig-authoring-gate.md`](../adr/0005-rig-authoring-gate.md) — L1~L4 저작 게이트 중 L2 의 권위.
- [`progress/runbooks/02-golden-step-catalog.md §4`](./02-golden-step-catalog.md) — golden step 18 (rig-template-lint) 색인.
- [`docs/03-rig-template-spec.md §3·§4·§6.2·§13.1`](../../docs/03-rig-template-spec.md) — parameter / deformer / physics / 저작 정책.
- [`docs/04-part-slot-spec.md §3`](../../docs/04-part-slot-spec.md) — `deformation_parent` / `parameter_ids` 필드 계약.
- 세션 doc: [40 C1~C10](../sessions/2026-04-19-session-40-physics-lint.md) · [49 C10 family 분리](../sessions/2026-04-19-session-49-physics-lint-family.md) · [99 C11](../sessions/2026-04-20-session-99-physics-lint-c11.md) · [108 C12](../sessions/2026-04-20-session-108-physics-lint-c12.md) · [109 C13](../sessions/2026-04-20-session-109-physics-lint-c13.md) · [110 리브랜딩](../sessions/2026-04-20-session-110-rig-template-lint-rebrand.md) · [112 C14](../sessions/2026-04-20-session-112-c14-parts-deformers.md). slug 실측 (세션 119 D4 규칙).
