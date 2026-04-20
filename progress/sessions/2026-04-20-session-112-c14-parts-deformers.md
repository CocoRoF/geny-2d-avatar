# 세션 112 — C14 parts↔deformers 사각형 완결

- **날짜**: 2026-04-20
- **선행**: 세션 111 (`@geny/migrator@0.1.0` skeleton + v1.0.0~v1.3.0 체인). BL-MIGRATOR 해소.
- **상태**: ✅ completed.
- **변경 범위**: `scripts/rig-template/rig-template-lint.mjs`, `scripts/rig-template/rig-template-lint.test.mjs`, `docs/03-rig-template-spec.md §13.1`, `progress_0420/*`.

## 1. 동기

rig-template-lint 는 세션 99 이후 `parts↔parameters` (C11) / `deformers↔parameters` (C12) / `deformers` 내부 트리 (C13) 3 축을 검증한다. 남은 cross-ref 는 단 하나 — `parts/*.spec.json.deformation_parent` 가 `deformers.json.nodes[].id` 집합을 가리키는지다. `deformation_parent` 는 docs/03 §4 에서 파츠 스펙의 필수 필드로 지정돼 있지만, 실제 id 존재성은 스키마 단계에서 검증 불가능(cross-file).

C14 로 이 마지막 사각형을 닫으면, Author 가 deformer 트리를 리네임·삭제하거나 파츠 spec 을 수동 편집했을 때 파이프라인 L4 전에 CI 수준에서 차단된다. 세션 99·108·109 와 같은 자매 체크.

## 2. 변경

### 2.1 `scripts/rig-template/rig-template-lint.mjs`

- **deformers.json 선로드**: 기존엔 parts 루프가 끝난 뒤에 열었으나, C14 는 parts 루프에서 node id 집합이 필요하므로 앞당겼다. 파싱 결과는 동일 블록에서 `deformerJson` 으로 저장·재사용 — I/O 1 회 유지.
- **parts 루프 재구성**: C11 조건 (`parameter_ids` array) 과 C14 조건 (`deformation_parent` string) 을 같은 파츠 순회 안에 병렬 배치. `partsChecked` 는 여전히 파츠 총수이고, `parts_with_bindings` 는 C11 호환 카운트, 신규 `parts_deformation_parents_checked` 가 C14 카운트.
- **C14 규칙 본체**:
  - `deformerNodeIds` Set 이 null (= `deformers.json` 없음) 이면 skip — C12/C13 과 동일 no-op 베이스라인.
  - `spec.deformation_parent` 가 string 이 아니면 skip — 누락·null 은 스키마 책임이지 cross-ref 문제가 아니다.
  - string 이지만 set 에 없으면 error: `C14 parts/<name>.deformation_parent=<value> 이 deformers.nodes[].id 에 없음 (slot_id=<slot>)`.
- **summary 확장**: `parts_deformation_parents_checked` 키 추가. stdout 요약에도 `parts=N/Mbind/Kdefparent` 로 3-way 카운트 표기.
- **주석 블록**: 규칙 카탈로그 주석(상단)에 C14 항목 추가. 세션 109 이후 첫 사각형 완결 이벤트 — `C11+C12+C13 의 마지막 사각형` 문구 명시.

### 2.2 `scripts/rig-template/rig-template-lint.test.mjs`

4 신규 케이스 (2ac~2af), 기존 30 tests → **34 tests**:

| # | 케이스 | 기대 |
|---|---|---|
| 2ac | `ahoge.spec.json.deformation_parent = "ghost_warp_xyz"` | C14 1 건, 메시지에 ghost_warp_xyz + ahoge.spec.json + slot_id=ahoge 포함 |
| 2ad | `deformers.json` rm | C14 0 건, `parts_deformation_parents_checked=0` |
| 2ae | `delete spec.deformation_parent` (ahoge 만) | C14 0 건, `parts_deformation_parents_checked=29` (30-1) |
| 2af | 4 공식 halfbody + 1 fullbody 템플릿 | C14 0 건, `parts_checked` + `parts_deformation_parents_checked` 가 `{v1.0.0: 27/27, v1.1.0: 29/29, v1.2.0: 29/29, v1.3.0: 30/30, fullbody: 38/38}` 로 일치 |

2af 의 카운트 하드코딩은 C11 테스트에서 `parts_with_bindings` 를 `>= 0 && <= parts_checked` 범위로 완화한 것과 대조적이다. 이유: `deformation_parent` 는 파츠 **전원** 이 가져야 하는 필수 필드 → "진화 여지" 가 없다. 카운트가 어긋나면 곧 스펙 드리프트이므로 엄격 매치가 맞다.

### 2.3 공식 템플릿 회귀

- halfbody v1.0.0 (27 parts) / v1.1.0 (29) / v1.2.0 (29) / v1.3.0 (30) / fullbody v1.0.0 (38) 모두 C14 0 건.
- 즉 **전원 일치** — 파츠 파일 1 개당 `deformation_parent` 1 개가 반드시 deformer 트리에 연결. 역으로 deformer 트리에는 파츠 없는 warp (예: `overall_warp`, `breath_warp`) 도 존재하는 게 정상 (one-to-many).

### 2.4 문서

`docs/03 §13.1` 에 C14 항목 추가 (세션 109 의 C13 문구 패턴 준수).

## 3. 결정

### D1 — I/O 1 회 vs 2 회

두 번 `readFile(deformersPath)` 하는 대신 parts 루프 전에 한 번 파싱해 `deformerJson` / `deformerNodeIds` 를 저장하고, 기존 C12/C13 블록이 그 객체를 재사용하도록 수정했다. 
- **Why**: deformers.json 은 v1.3.0 에서도 ~21 노드에 불과하지만, 같은 파일을 두 번 여는 건 의미 없는 중복. `deformerNodeIds` Set 도 C14 전용이 아니라 향후 규칙 추가 시 재사용 가능한 재료.
- **Trade-off**: `if (existsSync) { json = parse(); }` → `if (json) { ... }` 로 flow control 이 두 단계로 나뉘지만, 이 분리는 의도적 — 파일 부재는 "cross-ref skip" 을 의미하고, 선로드 블록은 그 결정을 명시화한다.

### D2 — `deformation_parent` 누락 시 skip vs error

C14 는 **cross-ref 검증** 규칙이다. 필드 누락·null 은 JSON Schema 단계(`parts.spec.json.schema.json`)가 이미 required 로 잡는다. lint 에서 한 번 더 잡으면:
- (a) 같은 오류를 두 곳에서 감지 — 메시지가 겹치고 fix 위치가 모호해진다.
- (b) lint 전용 에러 prefix (C14) 가 스키마 에러를 덮어 원 규칙의 출처가 흐려진다.

그래서 `typeof spec.deformation_parent === "string"` 필터로 skip. schema-layer responsibility 는 schema-layer 에 둔다 (C11 도 같은 디자인: `Array.isArray(spec.parameter_ids)` 통과 후에만 검사).

### D3 — 에러 prefix 카탈로그 확장 정책

C1~C13 은 역사 식별자 (세션 110 에서 리브랜딩하면서도 유지). C14 추가는 세션 109 이후 첫 번째 신규 rule — **prefix 는 단순 숫자 증가** (C15 가 아닌 C14). 디버깅·검색 시 세션 로그와 코드 간 매핑을 단순하게 유지하기 위해 특수 접미사 (예: C14-xref) 는 쓰지 않는다. C10 (suffix/forbidden) / C13 (duplicate/root-missing/...) 처럼 **하나의 축** 에서 여러 변형이 필요할 때만 서브-suffix 를 쓴다 — C14 는 단일 축 (id 존재성) 이므로 suffix 불필요.

### D4 — `parts_deformation_parents_checked` 를 summary 에 노출

세션 99·108·109 의 C11/C12/C13 카운터처럼 명시 카운터를 summary 에 포함시켰다.
- **Why**: 테스트 2af 가 카운트를 엄격 매치하려면 노출 필요. 또한 stdout 요약에 등장하면 CI log 에서 "이 PR 이 deformer 매핑을 얼마나 건드렸는지" 를 한눈에 본다.
- **Why 엄격 매치**: 2.2 에서 설명한 대로 `deformation_parent` 는 필수 필드 → 카운트 진화 여지가 없다.

## 4. 테스트 결과

### 4.1 lint 단위 테스트

```
$ node scripts/rig-template/rig-template-lint.test.mjs
  ✓ halfbody v1.0.0..v1.3.0 전부 clean
  ... (29 기존 통과)
  ✓ C14 deformation_parent 가 deformers.nodes 에 없을 때 차단
  ✓ C14 deformers.json 누락 시 no-op
  ✓ C14 deformation_parent 누락 spec 은 skip (스키마 책임)
  ✓ C14 공식 halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 통과
[rig-template-lint] ✅ all checks pass
```

34 tests — passed 34 / failed 0.

### 4.2 공식 템플릿 회귀

```
rig-template-lint halfbody/v1.0.0: ... parts=27/0bind/27defparent ...
rig-template-lint halfbody/v1.1.0: ... parts=29/0bind/29defparent ...
rig-template-lint halfbody/v1.2.0: ... parts=29/0bind/29defparent ...
rig-template-lint halfbody/v1.3.0: ... parts=30/19bind/30defparent ...
rig-template-lint fullbody/v1.0.0: ... parts=38/27bind/38defparent ...
  ✓ all checks pass  (×5)
```

- `parts_checked == parts_deformation_parents_checked` 모든 버전에서 성립 → **파츠 전원 deformer 트리에 연결된 상태** 가 불변식으로 확정.

### 4.3 전체 골든

```
$ node scripts/test-golden.mjs
... 29 steps ...
[golden] ✅ all steps pass
```

## 5. 영향 · 후속

- **사각형 완결**: C11 + C12 + C13 + C14 로 `parts ↔ parameters ↔ deformers` 3-node 그래프의 모든 엣지가 CI 차단. 세션 99 이후 진행된 "schema + lint + migrator 3 중 방어" 디자인의 한 라운드 마감.
- **Runtime 관점**: `parts.deformation_parent` 는 web-avatar 번들 단계(`exporter-pipeline`) 에서 `deformers.nodes[].id` 와 실제 joinable 해야 한다. L4 (파이프라인 불변식) 에서 한 번 더 검증되지만, CI 차단은 그 전에 일어난다 → 잘못된 리그가 L4 까지 가는 경로를 짧게 만든다.
- **다음 후보** (`progress_0420/PLAN.md §7`):
  - Runtime 착수 (세션 97) — Foundation Exit 4/4 + 릴리스 게이트 3/3 + lint 14 rules + migrator 인프라가 모두 들어선 지금이 시점. 외부 의존(ADR 0007 렌더러) 수반.
  - v1.3.0→v1.4.0 migrator — 세션 111 skeleton 의 첫 external 확장. 리그 변경 범위 사전 합의 후.
  - legacy v1.0.0~v1.2.0 opt-in 복제 (docs/03 §7.3 deprecation 정책 외부 + Runtime 소비자 합류 후).

## 6. 커밋

- 단일 커밋: `feat(rig-template-lint): C14 parts↔deformers 사각형 완결 (세션 112)`.
