# Session 124 — rig-template-lint C1~C14 규칙 카탈로그 runbook 03

- **Date**: 2026-04-21
- **Workstreams**: Platform / Rig & Parts (문서 축)
- **Linked docs**: `docs/03 §3·§4·§6.2·§13.1` · `docs/04 §3`
- **Linked ADRs**: `progress/adr/0005-rig-authoring-gate.md`

---

## 1. 목표 (Goals)

- [x] `scripts/rig-template/rig-template-lint.mjs` 의 14 규칙 × 34 테스트 케이스를 **운영/검수 색인** 으로 고정한다.
- [x] 세션 122 (golden step) + 세션 123 (schema/README) 에서 확립한 **4-라인 고정 구조** (보장/실행/의존성/도입) 를 lint 규칙에도 적용.
- [x] runbook 3번째 항목으로 등록 — 01(P1 비상) / 02(golden 정상 CI) / 03(저자 개입 게이트) 3 축 완성.

## 2. 사전 맥락 (Context)

- 세션 122 PLAN §7 γ 후보 (극저 ROI) — 당시엔 "자율로 더 얇게 짜내는 게 의미 있는가" 의문. 세션 123 §7 에서 **사실상 유일하게 자기완결적** 으로 남은 후보로 재평가.
- 세션 117~123 에서 문서 · 분석 · 검증 · 색인 · 스키마 카탈로그 축을 소진. 남은 것 중 ADR 0007 대기 없이 진입 가능한 후보 = γ 1 개.
- 실측 근거:
  - 14 규칙의 정의는 `rig-template-lint.mjs` 파일 상단 주석(L17-57) 에 있으나 소스 코드에만 존재 — **운영 시 빠른 조회가 어려움**.
  - 34 테스트 케이스는 `rig-template-lint.test.mjs` 의 `console.log("  ✓ ...")` 문에 분산 — regex 로만 집계 가능.
  - `FAMILY_OUTPUT_RULES` (6 family) 는 export 되어 있지만 테이블 형태의 문서 부재.
  - C13 의 7 sub-rule 은 주석에만 있고 에러 prefix 매핑이 문서화되지 않음.
- 차단 요소: 없음. 자기완결적.
- 가정: 세션 40/49/99/108/109/110/112 의 도입 정보는 git log + `progress/sessions/` slug 실측으로 권위 확보. 세션 119 D4 slug 검증 규칙 재적용.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| runbook 03 신규 | `progress/runbooks/03-rig-template-lint-rules.md` | §0 분류 + §1~§6 각 규칙 4-라인 + §7 FAMILY_OUTPUT_RULES 테이블 + §8 CLI 옵션 + §9 테스트 34 케이스 매핑 + §10 참고 | 🟢 |
| runbook README 갱신 | `progress/runbooks/README.md` | 03 entry 추가 (이전 02 line 바로 아래) | 🟢 |
| 세션 doc | `progress/sessions/2026-04-21-session-124-lint-rule-catalog.md` | 템플릿 9 섹션 + 결정 3~4 건 | 🟢 |
| INDEX/PLAN/SUMMARY 갱신 | `progress_0420/{INDEX,PLAN,SUMMARY}.md` | 세션 124 entry + runbook 3 종 반영 + 세션 125 후보 재평가 | 🟢 |
| auto-memory 갱신 | `memory/project_foundation_state.md` | 세션 124 스냅샷 + runbook 3 축 완성 | 🟢 |

## 4. 결정 (Decisions)

### D1. runbook 03 vs `scripts/rig-template/README.md` — 런북 택일

**선택**: `progress/runbooks/03-*` (새 runbook).

**근거**:
- 세션 122 D1 (runbook vs scripts/README 선택) 과 같은 축. `scripts/rig-template/` 에 README 를 두면 CLI 사용법만 담고 규칙 색인과 섞이며 **scripts/README.md 처럼 stale 화 위험**.
- 세션 122 에서 `progress/runbooks/` 를 "운영/검수 경로 색인" 으로 정의 — 01(비상) / 02(정상 CI) / 03(저자 개입) 으로 3 경로가 자연스럽게 묶인다.
- lint 규칙은 L2 저자 개입 게이트 — runbook 축과 정확히 일치.

### D2. 4-라인 구조의 축 선택 — "실행" = CLI 에러 prefix

**선택**: `보장 / 실행 / 의존성 / 도입`. 세션 122 는 `보장 / 실행 / 의존성 / 도입` (실행 = CLI 커맨드), 세션 123 은 `보장 / 소비자 / Docs / 도입`.

**근거**:
- lint 규칙은 CLI 실행되면 **에러 메시지 prefix** 가 유일한 외부 식별자. 운영자가 CI 실패 로그에서 `[C13-cycle]` 을 보고 이 문서로 찾아올 때 직접 매칭 가능해야 함.
- 의존성 = "어떤 파일을 읽는가" — 에러 원인을 어디서 찾아야 하는지 즉시 판단 가능 (physics.json vs parameters.json vs deformers.json vs manifest).
- 도입 세션은 드리프트 발견 시 "언제부터의 불변식이지?" 를 찾을 수 있는 앵커.

### D3. C10 / C13 의 sub-rule 전개

**선택**: C10 (2 sub) 과 C13 (7 sub) 을 각각 별도 4-라인 블록으로 전개.

**근거**:
- **에러 prefix 가 sub-rule 단위** 로 나오기 때문 — `[C10-suffix]` / `[C10-forbidden]` / `[C13-cycle]` 등. 한 블록에 뭉치면 운영자가 prefix 를 못 찾음.
- sub-rule 간 **의존성이 다름** — C13-root-missing 은 manifest 를 읽지만 C13-duplicate 는 deformers.json 만. 4-라인의 "의존성" 축이 달라지면 구분이 필요.
- 도입 세션은 같지만(C10 전체 세션 49 분리, C13 전체 세션 109 신설), 부각 포인트가 다른 불변식이므로 각각 1 블록.

### D4. 테스트 34 케이스 매핑 — 개별 열거 vs 카테고리 집계

**선택**: §9 테이블에 카테고리별 케이스 수 + 라벨 키워드 요약만. 각 케이스의 상세 내용은 `test.mjs` 에 위임.

**근거**:
- 34 케이스 각각을 블록 전개하면 문서가 3배로 비대해진다 — **색인 목적** 을 벗어남. 세션 122 D4 (인접 드리프트 스코프) 와 같은 축 — 이 runbook 의 목적은 14 규칙 × 4-라인, 테스트는 매핑만.
- 실측 검증 방법을 §9 끝에 명시 (`grep -cE '✓' <test file>`) — 카운트 드리프트 발생 시 독자가 스스로 재검증 가능.
- 운영자가 "어떤 rule 의 테스트를 강화해야 하지?" 를 물을 때 카테고리만 알면 test.mjs 진입점이 명확해진다.

## 5. 변경 요약 (Changes)

- `progress/runbooks/03-rig-template-lint-rules.md` — **신규 (~240 줄)**. 0 분류 + 1~6 rule 블록 (C1~C14 + sub-rules) + 7 FAMILY_OUTPUT_RULES 테이블 + 8 CLI 옵션 + 9 테스트 매핑 + 10 참고.
- `progress/runbooks/README.md` — §런북 목록 표에 03 entry 추가.
- `progress_0420/INDEX.md` — 헤더 123→124, §1 "단계" 셀 append "+ rig-template-lint 규칙 카탈로그", §1 "누적 세션" 123→124, §2 Platform 워크스트림 "런북 2 종 (01 P1 인시던트 + golden step 카탈로그)" → "**런북 3 종** (01 P1 인시던트 + 02 golden step 카탈로그 + 03 rig-template-lint 규칙)", §4 헤더 "124 후보" → "125 후보".
- `progress_0420/PLAN.md` — 헤더 124+→125+, §3 세션 124 ✅ entry, §7 재작성 (세션 125 진입점 = ADR 0007 대기 권장).
- `progress_0420/SUMMARY.md` — 헤더 "1~123" → "1~124", §13 세션 124 row append, 헤더 paragraph 의 claims/log 범위에 124 포함.
- `memory/project_foundation_state.md` — name 필드 123→124, 요약 paragraph 재작성 (runbook 3 종 + lint 색인).

## 6. 블록 (Blockers / Open Questions)

- 없음. 자기완결 문서 작업.
- 남은 자율 후보 재평가 결과: **실질 소진**. 세션 125 는 ADR 0007 Accept 또는 사용자 지시 대기 구간으로 판단.

## 7. 다음 세션 제안 (Next)

**세션 125 자율 후보는 사실상 없음**. 문서·색인 축 5 연속(120 옵션 분석 → 121 메타 점검 → 122 golden 색인 → 123 schema 카탈로그 → 124 lint 규칙 카탈로그) 종료 후 남은 후보:

- **(보류) 후보 I Server Headless ADR** — ADR 0007 Open Question #3 사용자 답변 선행. 변동 없음.
- **(보류) 후보 J renderer-observer** — 8 세션 이월. ROI 여전히 낮음.
- **(극저 ROI · 의미 약함)** docs 14 챕터 상호 참조 색인 / ADR 0001~0007 요약 카탈로그 / 세션 로그 인덱스 재정비. 기존 문서 대비 **중복 위험** + 사용자 가치 불명확.

**권장**: **ADR 0007 리뷰 대기 / 사용자 지시 대기**. 자율 모드가 의미 있게 산출을 이어가기 어려운 지점 — 계속 쓰면 노이즈/중복 위험만 커진다.

만약 자율이 한 iteration 더 발동되면: (α) 사용자에게 명시적 "진입 가능한 자율 후보 소진, ADR 0007 리뷰 또는 명시적 지시 요청" 메시지를 세션 doc 에 남기고 **commit/push 만 수행하는 minimal 세션** 도 선택지. (β) 세션 125 에서 진입점이 정해지지 않으면 extending run boot vs pause 선택을 사용자에게 위임.

## 8. 지표 (Metrics)

- 신규: `progress/runbooks/03-rig-template-lint-rules.md` ~240 줄.
- 변경: `progress/runbooks/README.md` +1 줄, `progress_0420/{INDEX,PLAN,SUMMARY}.md` 소폭, `memory/project_foundation_state.md` 요약 paragraph 재작성.
- 테스트: `pnpm run test:golden` 영향 없음 (문서만). `grep -cE '✓' scripts/rig-template/rig-template-lint.test.mjs` → **34** ✓.
- 빌드: 해당 없음.

## 9. 인용 (Doc Anchors)

- [ADR 0005 — rig authoring gate L1~L4](../adr/0005-rig-authoring-gate.md)
- [docs/03 §3·§4·§6.2·§13.1 — parameter / deformer / physics / 저작 정책](../../docs/03-rig-template-spec.md)
- [docs/04 §3 — part spec parameter_ids / deformation_parent](../../docs/04-part-slot-spec.md)
- [Runbook 02 — golden step 카탈로그 step 18](../runbooks/02-golden-step-catalog.md)
- [세션 40 physics-lint 초판](2026-04-19-session-40-physics-lint.md) · [49 family 분리](2026-04-19-session-49-physics-lint-family.md) · [99 C11](2026-04-20-session-99-physics-lint-c11.md) · [108 C12](2026-04-20-session-108-physics-lint-c12.md) · [109 C13](2026-04-20-session-109-physics-lint-c13.md) · [110 리브랜딩](2026-04-20-session-110-rig-template-lint-rebrand.md) · [112 C14](2026-04-20-session-112-c14-parts-deformers.md)
- [세션 122 runbook 02 doc](2026-04-21-session-122-golden-step-catalog.md) — 4-라인 구조 선례.
- [세션 123 schema 카탈로그 doc](2026-04-21-session-123-schema-catalog.md) — 색인 패턴 2 번째 재활용.
