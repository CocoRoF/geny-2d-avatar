# 세션 43 — ADR 0005: 리그 저작 게이트 명문화

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Rig & Parts (docs/14 §9), Cross-cutting governance
- **관련 세션**: 27 (v1.3.0 migrator skeleton), 31 (v1.3.0 authored), 35 (exporter textureOverrides), 37 (migrator auto-patch 확장), 40 (physics-lint), 42 (HTTP 팩토리 / apiModel 분리)
- **산출물**: `progress/adr/0005-rig-authoring-gate.md` (신규, ~150 라인), `progress/INDEX.md` §3/§4/§7/§8 갱신

---

## 배경

halfbody v1.0.0 → v1.3.0 의 실저작이 완성되면서 (세션 02~07 초판, 27/31 v1.3.0, 34 파생 모션, 37 migrator auto-patch, 40 physics-lint), "리그 템플릿의 어느 부분을 기계가 자동화/검증하고 어느 부분을 저자가 판단하는가" 에 대한 경계가 코드에 암묵적으로 존재하게 됐다. 문서화되지 않은 규약이 다음 base (`fullbody` 등) 또는 rig v2 도입 시 재발견되어야 하는 비용을 피하려고 ADR 로 명문화.

특히 세션 40 `physics-lint` 가 도입한 "모든 규칙은 fatal, warning 등급 없음" 정책과 세션 37 migrator 가 "physics.json 튜닝 값만은 자동화하지 않는다" 는 선을 그은 것이 구두로만 공유되어 있어, 규칙이 추가될 때마다 "그때 그때 판단" 으로 흘러갈 위험이 있었다.

## 결정 (ADR 0005 요약)

4 계층 분류:

- **L1 Migrator auto-patch** (`scripts/rig-template/migrate.mjs`) — manifest version bump / cubism_mapping 추가 / parameters.json append / 신규 `parts/*.spec.json` 생성 / deformation_parent 이동 / deformers.json warp 삽입 / mao_pro_mapping.md appendix. **금지**: physics weight/delay/mobility 튜닝 / geometry 변경 / cubism_mapping 제거 / parameters.json range 변경.
- **L2 Authoring lint** (`scripts/rig-template/physics-lint.mjs` + 향후 deformer-lint, parts-lint) — fatal only (warning 없음) / `C{n}` 번호 매김 / 공식 템플릿 전 버전 clean 보장 / 규칙 추가는 ADR 또는 docs/03 동반. 현재 물리 C1~C10.
- **L3 Authored content** — physics weight/delay, mesh vertex, motion curves, part images. L2 lint 통과는 필수.
- **L4 Pipeline invariants** — exporter `textureOverrides` path 보존 (세션 35) / `modelVersion` vs `apiModel` 분리 (세션 42) / exporter-core 이미지 라이브러리 무의존. ADR 에서는 기록만, 강제는 런타임 테스트.

## 설계 결정

### D1. Lint warning 등급을 의도적으로 금지
"초기엔 warning 으로, 나중에 fatal 로 승격" 은 흔한 패턴이나, 승격 시점을 명시하지 않으면 영원히 warning 으로 남는다는 경험. CI 가 빨간색을 내지 않으면 PR 리뷰어가 눈으로 훑고 넘어가는 비율이 높다. **처음부터 fatal** 이면 저자는 규약에 맞게 저작한다.

### D2. L4(파이프라인 불변식)를 별도 ADR 로 쪼개지 않음
path 보존 / apiModel 분리 / bytes-only exporter-core 를 각각 ADR 로 올리는 안을 검토했으나 기각. 이들은 **코드 계약**이고 런타임 테스트가 존재 이유이므로 ADR 이 현실과 어긋날 때 유지비가 커진다. 한 ADR 에 이유만 요약 기록하고 나머지는 테스트에 맡김.

### D3. Physics 튜닝의 migrator 자동화 거부
세션 31 의 v1.3.0 physics 3 setting 추가가 패턴을 따르는 듯 보여도 (head_angle_x:70 / head_angle_y:30 등) 이 값들은 시뮬 결과에 따른 저자 판단. migrator 가 "그럴듯한 기본값" 을 넣으면 저자의 튜닝 인센티브가 사라진다. L3 영역 침범으로 기각.

### D4. 규칙 번호의 재사용 금지
C1~C10 을 쓰다가 C5 를 제거하면 번호 rename 은 PR 리뷰어를 혼란스럽게 함. 제거 시 빈 번호로 남기고 새 규칙은 C11 부터. 부정적 귀결로 수용 — 규칙 추가/제거는 드문 사건이므로 번호가 비는 비용 < rename 비용.

### D5. Historical template 회귀 요건
lint 도입 시점에 v1.0.0~v1.3.0 전부 clean 이어야 함. "그때는 규약이 달랐다" 는 변명을 구조적으로 봉쇄 — 세션 40 에서 이미 만족됨을 확인.

## 실제 변경

- `progress/adr/0005-rig-authoring-gate.md` 신규 작성 (Context / Decision (L1~L4) / Consequences / 3 Alternatives 기각 / Follow-ups).
- `progress/INDEX.md`:
  - §3 Rig & Parts 행에 "43 ADR 0005 저작 게이트 명문화" 추가.
  - §4 세션 로그 43 행 추가 (42 뒤 오름차순 유지).
  - §7 ADR 인덱스에 0005 행 추가.
  - §8 다음 3세션 — 43 제거, 44 worker skeleton / 45 Exit #1 자동화 유지, 46 ADR 0005 follow-up 신설 (docs/03 §13 lint 커밋 조건 명시 또는 fullbody base C10 regex 분리).
- 코드/테스트 변화 0 — docs 전용 세션.

## 검증

- validate-schemas: `checked=186` 불변.
- `pnpm run test:golden` 18 step 불변 — ADR 파일은 스키마/번들 경로에 걸리지 않음.
- 실행 생략 가능 영역(docs-only); 세션 44 시작 전 안전 확인용으로 추후 spot check.

## 연결

- 세션 44 예고: `apps/worker-generate/` skeleton. L4 `apiModel` 분리 계약이 worker 실호출에서 재검증되는지 확인 (ADR 0005 L4 follow-up 항목).
- 세션 45 예고: Foundation Exit #1 자동화 (E 단계 happy-dom/Playwright).
- 세션 46 예고: docs/03 §13 "lint 통과 = 커밋 조건" 명시, fullbody 도입 전 C10 regex base-specific 분리 설계.

## 커밋

- `progress/adr/0005-rig-authoring-gate.md` (신규)
- `progress/INDEX.md` 갱신
- `progress/sessions/2026-04-19-session-43-adr-0005-authoring-gate.md` (신규)
