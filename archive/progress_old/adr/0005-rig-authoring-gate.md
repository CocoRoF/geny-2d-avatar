# ADR 0005 — 리그 저작 게이트: 기계적 검증 vs 저자 판단의 경계

- **Status**: Accepted
- **Date**: 2026-04-19
- **Deciders**: geny-core
- **관련 문서**: `docs/03-rig-template-spec.md` §6.2, §11, `docs/04-parts-specification.md`, `docs/06-post-processing-pipeline.md` §4
- **관련 ADR**: [0002](./0002-schema-first-contract.md), [0003](./0003-rig-template-versioning.md)
- **관련 세션**: 27 (v1.3.0 migrator skeleton) · 31 (v1.3.0 authored physics 9→12) · 35 (exporter `textureOverrides` path 보존) · 37 (migrator auto-patch 확장) · 40 (physics-lint) · 42 (orchestrator HTTP 팩토리)

---

## Context

halfbody v1.0.0 → v1.3.0 로 이어지는 저작 과정에서, "리그 템플릿의 어느 부분을 기계가 검증/자동화하고 어느 부분을 사람이 판단하는가" 에 대한 암묵적 규칙이 코드와 스크립트에 흩어져 있었다. 세션별로 다음이 쌓였다.

- **세션 27**: v1.0.0→v1.3.0 migrator 가 `manifest.version` bump + `cubism_mapping` / `parameters.json` 는 자동으로 패치하지만 `physics.json` 은 TODO 로 남김.
- **세션 35**: `assembleWebAvatarBundle({ textureOverrides })` 훅이 호출자가 주입한 텍스처 배열의 `path` 가 원본과 다르면 throw — exporter-core 는 픽셀은 바꿀 수 있지만 번들 구조(경로 ≒ 파일 identity) 는 바꾸지 않음.
- **세션 37**: migrator 가 `parts/ahoge.spec.json` 생성, accessory parent 이동, deformers.json 3 warp 삽입, mao_pro §6 appendix 추가까지 자동 패치로 확장. 유일하게 `physics.json` 의 9→12 setting 재구성만 저자에게 남김.
- **세션 40**: `physics-lint.mjs` 가 `physics.json` 의 10 규칙(C1~C10) 을 CI fatal 게이트로 도입 — 저자 판단이 남은 영역도 "저자가 만든 저작물이 내부 정합성을 지키는가" 는 기계가 검증.

이 결정들을 관통하는 원칙이 한 곳에 정리되어 있지 않다. 새 base(`fullbody` 등) 또는 rig v2 가 들어올 때 "무엇을 자동화하고 무엇을 남기는지" 를 그때그때 재발견하게 되면 규약이 부식된다.

구체적인 질문들:

- migrator 가 **어디까지** 카테고리 있는 자동 변환을 해도 되는가? 네이밍 규약 교정도 해도 되는가? 새 파츠 default 저작은?
- `physics-lint` 의 10 규칙은 언제 추가되고 삭제되는가? warning 등급은 허용되는가?
- exporter-core 가 "입력 번들 구조 불변성(path, slot id, z_order)" 을 지키는 건 단순 구현 디테일인가 아니면 계약인가?
- rig template repo 밖(사용자 커스텀 리그) 에서 같은 규칙을 강제할 수 있는가?

---

## Decision

리그 템플릿 저작물에 대한 변경은 세 계층으로 분류된다. 각 계층은 **누가** 변경을 만들고 **무엇이** 그 변경을 검증하는지 고정된다.

### L1. 자동 변환 (Migrator auto-patch)

- **주체**: `scripts/rig-template/migrate.mjs`.
- **적용 대상**: 구조 변경이 **기계적으로 유도 가능** 하고 **저작 판단이 불필요** 한 항목.
- **허용되는 변경 카테고리**:
  1. `template.manifest.version` SemVer bump.
  2. `template.manifest.cubism_mapping` 에 신규 파라미터 추가 (docs/03 §12 기준 vendor-neutral 이름 → mao_pro 이름).
  3. `parameters.json` 에 신규 파라미터 append (`physics_input`/`physics_output` 표식 포함).
  4. `parts/*.spec.json` 의 **새 파일 생성** (신규 슬롯 기본값 저작 — canvas/uv_box/z_order/parent 를 템플릿 규약에서 유도).
  5. `parts/*.spec.json` 의 `deformation_parent` **이동** (부모 deformer 신설에 따른 재배치).
  6. `deformers.json` 에 신규 warp **삽입** (parent 참조만 추가, vertex data 는 생성 X).
  7. `physics/mao_pro_mapping.md` 같은 **문서 appendix 자동 추가**.
- **허용되지 않는 변경**:
  - `physics.json` 의 `weight`/`delay`/`mobility`/`acceleration`/`radius` 등 **튜닝 값**.
  - 기존 파츠의 geometry (vertex/triangle data).
  - `parameters.json` 의 기존 파라미터 `range`/`default` 변경 (ADR 0004 `파라미터 범위 오버라이드 금지` 와 연장선).
  - `cubism_mapping` 의 **제거** (제거는 저자가 명시적으로 승인).
- **구현 원칙**:
  - `writeIfAbsent` / `appendIfMissing` 계열 idempotent 헬퍼 사용 — re-run 해도 같은 결과.
  - `MIGRATION_REPORT.md` 로 모든 자동 패치 열거 + 남은 TODO 명시.

### L2. 기계적 검증 (Authoring lint)

- **주체**: `scripts/rig-template/physics-lint.mjs` (및 향후 `deformer-lint.mjs`, `parts-lint.mjs` 확장 후보).
- **적용 대상**: 저자가 생산한 저작물의 **내부 정합성**.
- **정책**:
  1. **모든 규칙은 fatal** — warning 등급을 두지 않는다. 규칙이 warning 이면 위반이 쌓여 결국 의미가 희석된다. 규칙을 warning 으로 낮추고 싶은 상황은 "그 규칙을 내리고 싶은 상황" 이므로 아예 제거하는 게 맞다.
  2. 규칙은 `C{n}` 식별자로 번호 매김 — 실패 메시지에 식별자를 포함해 PR 리뷰에서 빠른 참조.
  3. 공식 템플릿 **전 버전** (halfbody v1.0.0~v1.3.0) 이 각 규칙에 대해 clean — lint 도입 시점에 historical template 도 같은 규약을 만족.
  4. 규칙 추가는 ADR 또는 docs/03 업데이트 동반 — "코드는 있는데 문서가 없음" 금지.
- **현행 물리 규칙 (C1~C10, 세션 40)**:
  - C1~C4: `meta.*` 카운트 무결성.
  - C5: `physics_dictionary` ↔ `physics_settings` id 집합 1:1.
  - C6: `input.source_param` → `parameters.json` 존재 + `physics_input:true`.
  - C7: `output.destination_param` → `parameters.json` 존재 + `physics_output:true`.
  - C8: `output.vertex_index` 범위.
  - C9: `output.destination_param` → `cubism_mapping` 커버리지.
  - C10: 출력 네이밍 `_(sway|phys|fuwa)(_[lr])?$` (docs/03 §6.2).

### L3. 저자 판단 (Authored content)

- **주체**: 리그 아티스트/저자 (내부 인원, 추후 커뮤니티).
- **적용 대상**: L1 이 자동화하지 못하고 L2 가 검증만 하는 **본질적으로 창작 판단** 이 필요한 부분.
- **예시**:
  - `physics.json` 의 weight/delay/mobility 값 선정 (시뮬레이션 결과를 보고 결정).
  - 새 파츠의 메쉬 vertex 데이터 (UV mapping).
  - 모션 커브의 감성적 타이밍.
  - 파츠 이미지 자체.
- **가드**: 저자 판단의 결과물도 L2 lint 를 통과해야 커밋된다. 저자 판단이 "규약을 벗어남" 과 동의어가 되지 않도록.

### L4. 파이프라인 불변식 (Pipeline invariants — 저자 관련 없음)

L1/L2/L3 와 별개로, **저자 산출물이 어떻게 변하든 파이프라인이 지키는 구조적 불변식** 이 있다. 이들은 exporter/orchestrator 코드에서 런타임 가드로 강제된다.

- **번들 path 불변성** (세션 35): `assembleWebAvatarBundle` 의 `textureOverrides` 는 픽셀 대체만 허용; `path` 가 원본과 다르면 throw. 근거: path 는 slot identity (atlas/manifest 참조 key) — 후처리 단계가 번들 structure 를 바꾸면 consumer(웹 런타임, Cubism export) 가 깨짐.
- **어댑터 계약 vs 벤더 wire 분리** (세션 42): HTTP 클라이언트의 `modelVersion` 은 어댑터 카탈로그 버전, `apiModel` 은 벤더 API 모델 ID. 이 둘을 혼동하는 구현은 거부.
- **exporter-core 의 image-library 무의존**: PNG/WebP 디코드/인코드는 `@geny/exporter-pipeline` 이 한다. exporter-core 는 bytes-only.

이들은 ADR 수준의 강제라기보다 **회귀 테스트가 지키는 런타임 불변식** — 세션별 테스트에 이미 고정되어 있고, ADR 은 그 이유를 기록만 한다.

---

## Consequences

### 긍정적

- **저자/기계/도구의 책임 분할이 명시적** — 새 rig base 가 추가될 때 "migrator 에 뭘 넣을지, lint 에 뭘 넣을지, 저자에게 뭘 맡길지" 를 카테고리로 결정.
- **warning 금지 원칙이 규약 부식 막음** — 지금은 10 규칙이지만 쌓여도 의미가 흐려지지 않음.
- **Historical template 회귀** — lint 도입 시점에 v1.0.0~v1.3.0 전부 clean 이 보장 요건이므로, 과거 템플릿이 "그때는 규약이 달랐다" 는 변명을 만들지 않는다.
- **커뮤니티 템플릿 게이트 준비** — 추후 외부 기여자가 올리는 리그에 같은 lint 를 돌리면 규약 준수를 기계적으로 강제.

### 부정적

- **L3 저자 판단의 자동화 한계** — physics 튜닝처럼 "시뮬 보고 결정" 이 필요한 부분은 영원히 자동화되지 않는다. 저자 도구(Cubism Editor) 를 통한 UX 개선이 장기 과제.
- **규칙 번호의 불가역성** — C1~C10 을 쓰고 있는데 C5 를 제거하면 번호 rename 이 PR 리뷰어를 혼란스럽게 함. 규칙 제거 시 번호 재사용 금지 — 빈 번호로 남김.
- **migrator 의 자동화 욕구에 제동** — "이 정도는 자동화할 수 있지 않나" 는 제안이 올 때 L1 허용 카테고리 목록에 안 들어가면 기각해야 한다 (예: physics weight 튜닝을 prev 값 기준으로 scale 하는 자동화).

### 중립

- L4 는 ADR 이 기록만 하고 런타임 코드가 강제 — ADR 과 회귀 테스트 사이의 중복이 의도적(문서 + 테스트가 서로의 백업).

---

## Alternatives Considered

### A1. Lint 규칙에 warning 등급 도입

"초반에는 warning 으로 두고 점진적으로 fatal 로 승격" 이 흔한 패턴. 기각 이유:

- 승격 시점이 명시적으로 정해지지 않으면 영원히 warning 으로 남는다.
- CI 가 빨간색을 내지 않으면 PR 리뷰어가 눈으로 훑고 지나가는 비율이 실무에서 높다.
- 규약이 처음부터 fatal 이면 저자는 규약에 맞게 저작한다 — "나중에 고치면 되겠지" 가 없다.

### A2. physics.json 튜닝까지 migrator 에 자동화

세션 31 의 v1.3.0 physics 3 setting 추가(`ahoge_sway_phys`/`accessory_sway_phys`/`body_breath_phys`) 를 보면 input 파라미터 weight 조합이 정해진 패턴을 따른다(head_angle_x:70, head_angle_y:30 등). 이 패턴을 migrator 에 코드화하는 선택지.

기각 이유:
- weight 값은 시뮬 결과에 따라 저자가 조정한다 — 처음부터 "맞는 값" 이 아니라 반복 튜닝의 산물.
- migrator 가 "그럴듯한 기본값" 을 넣으면 저자가 "어차피 자동으로 들어가니 그대로 두자" 로 튜닝 인센티브가 사라짐.
- 저자 판단을 기계가 대체하려는 흐름은 L3 영역 침범 — 도구는 저자를 돕되 대체하지 않는다.

### A3. L4 불변식을 ADR 에 상세 정의

path 불변성 / `apiModel` 분리 / bytes-only exporter-core 각각을 별도 ADR 로 올리는 안. 기각: 이들은 **코드 계약** 이지 정책 결정이 아니다. 런타임 테스트가 존재 이유이고, ADR 은 "왜 그 테스트가 있는지" 를 간단히 기록만. 별도 ADR 로 부풀리면 문서가 현실과 어긋날 때 찾아 고칠 부담이 커짐.

---

## Follow-ups

- **docs/03 §6.2 물리 파일 규약** 에 L2 C10 네이밍 regex 를 명시 (이미 세션 27 에서 본문에 기술됨 — 이 ADR 에서 교차 참조만).
- **docs/03 §13 템플릿 작성 가이드** 에 "lint 통과" 를 커밋 조건으로 추가 (follow-up 세션).
- **신규 base(fullbody) 도입 시점**: 현재 C10 네이밍 regex 와 C9 cubism_mapping 커버리지는 halfbody 기준. fullbody 에서 파라미터 축이 바뀌면 네이밍 규약을 base-specific 으로 분리할지 재검토.
- **외부 기여 게이트**: 템플릿 마켓플레이스 오픈(docs/16) 시점에 physics-lint + migrate(dry-run) 를 CI 요건으로 강제.
- **세션 44+**: worker skeleton — L4 `apiModel` 분리 계약을 worker 쪽 HTTP 실호출에서 재검증.

---

## Addendum (2026-04-20, 세션 110)

`physics-lint.mjs` 가 C11 (parts↔parameters, 세션 99) / C12 (deformers↔parameters, 세션 108) / C13 (deformer 트리, 세션 109) 누적으로 physics 색채가 옅어져 **세션 110 에서 `rig-template-lint.mjs` 로 리브랜딩**. 본문 이전 참조의 `physics-lint` 는 현재 `scripts/rig-template/rig-template-lint.mjs` 를 가리킴. 에러 prefix `C1~C13` 및 rule 번호는 역사 식별자로 보존 — 이 ADR 본문의 "C1~C10" 지시는 세션 40 도입 시점 기준(정합).
