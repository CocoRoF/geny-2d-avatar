# Session 120 — ADR 0007 Option 별 코드 영향 범위 예상 diff 노트

- **Date**: 2026-04-21
- **Workstreams**: Frontend / Platform (ADR prep)
- **Linked docs**: `docs/13-tech-stack.md §2.2`
- **Linked ADRs**: [0007](../adr/0007-renderer-technology.md) (Draft — 사용자 리뷰 대기)

---

## 1. 목표 (Goals)

세션 117~119 로 문서 축(README 15 패키지) 이 소진됐고, `renderer-observer` 후보 J (ROI 낮음) 와 Server Headless ADR 후보 I (사용자 입력 대기) 는 자율 모드에서 진입 불가. PLAN §7 대안 후보 중 **(c) ADR 0007 Option 별 코드 영향 범위 예상 diff** 를 선점 — 사용자 pick 후 즉시 Spike 진입하도록.

- [x] `progress/notes/adr-0007-option-diffs.md` 작성 — 5 옵션(A/B/C/D/E) 각각 (1) 신규 패키지, (2) touch list, (3) golden step 변경, (4) 계약 BC, (5) 리스크, (6) Critical path 기록.
- [x] 공통 기반 (§1) · 옵션 간 공통 touch (§7) · Open Questions 영향 (§8) 분리 — pick 시 재사용 구간 명시.
- [x] 세션 doc 참조 slug 검증 (세션 119 D4 규칙) — `ls progress/sessions/ | grep session-NN` 확인 후 삽입.

## 2. 사전 맥락 (Context)

- **이전 세션**: 세션 119 — Foundation 15 패키지 README 축 완결 (8 FRESH / job-queue-bullmq 신규 / post-processing 재작성). 문서 축 소진.
- **자율 모드 제약**: 외부 의존 없는 self-contained 작업만 허용. ADR 0007 Decision 은 사용자 권한 — 본 세션은 **pre-decision prep** 에 국한, Decision 에 손대지 않음.
- **가정**: ADR 0007 Draft 의 옵션 구조 (A~E) 가 안정적이라는 전제. 본 노트는 그 구조 위에 실 코드 영향 지도를 겹침.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| Option diff 노트 | `progress/notes/adr-0007-option-diffs.md` | 5 옵션 각각 4 질문(신규/touch/golden/계약) 즉답 + Critical path sequence | 🟢 (278 줄, §0~§11 구조) |
| 공통 기반 분리 | §1 (노트 내) | 세션 114~116 산출물 재사용 축 확립 + 불변 원칙 4 항목 | 🟢 |
| 옵션 간 공통 touch list | §7 (노트 내) | ADR 승격 / docs/13 재작성 / README 업데이트 / memory 갱신 일괄 편집 목록 | 🟢 (8 항목) |
| Open Questions 영향 매핑 | §8 (노트 내) | 4 질문 × 5 옵션 교차 영향 | 🟢 |

## 4. 결정 (Decisions)

### D1 — 노트를 ADR 본문 안이 아닌 `progress/notes/` 에 둠

ADR 0007 본문에 Option 별 상세 diff 를 이식하면 Draft → Accepted 승격 시 한 옵션에 대한 섹션만 남기고 나머지를 삭제해야 함 (ADR 은 결정물, 탐색 산출물이 아님). 외부 파일로 두면 pick 이후에도 "왜 다른 옵션을 탈락시켰나" 의 사후 근거로 남음 + ADR 본문 비대화 방지.

### D2 — `progress/notes/` 디렉터리 신설

기존 `progress/` 하위에 `sessions/` / `adr/` / `exit-gates/` / `runbooks/` / `plans/` 가 있으나 "탐색 노트" 범주는 없었음. `plans/` 에 두면 BL-MIGRATOR · FULLBODY-V1 같은 실행 계획 성격과 혼선. 본 노트는 옵션 비교라 별도 분류가 깔끔. 이후 유사한 사전 분석(예: ADR 0008 Open Question #3 Server Headless)이 추가될 때도 같은 디렉터리 사용 권장.

### D3 — LOC 추정치는 **참고용** 으로 명시

"~300 LOC" 같은 숫자는 Spike 이전엔 **경험 추정** 이라 §9 에 "본 노트가 생략하는 것" 로 따로 박아둠. 수치를 읽는 사람이 "결정된 예산" 으로 오해하지 않게.

### D4 — 세션 doc 참조 slug 검증을 본 세션에서도 재적용

최초 작성 시 4 slug 중 3 개가 틀려 있었음 (113: `-adr-0007-renderer-technology` 아님 → `-adr-0007-renderer` / 114: `-interface-package` 아님 → `-package` / 116: `-debug` 아님 → `-wire`). `ls progress/sessions/ | grep session-11[3-6]` 으로 일괄 확인 후 Edit 1 회로 수정. **세션 119 D4 규칙이 세션 120 에서도 즉시 효력** — 해당 규칙이 memory 에 이미 기록돼 있어 재발 방지 효과 측정됨.

## 5. 변경 요약 (Changes)

- `progress/notes/adr-0007-option-diffs.md` (신규) — ADR 0007 Option 별 diff 노트. §0 목적/사용법 / §1 공통 기반 (세션 114~116 산출물 축) / §2~§6 Option A/B/C/D/E 각각 diff / §7 옵션 간 공통 touch / §8 Open Questions 영향 / §9 생략 범위 / §10 요약 표 / §11 참고 문서.
- `progress/notes/` (신규 디렉터리).
- `progress_0420/INDEX.md` — 세션 120 줄 갱신 (§4).
- `progress_0420/PLAN.md` — §3 세션 120 체크 + §7 다음 세션(121+) 후보 갱신.
- `progress_0420/SUMMARY.md` — §13 에 세션 120 라인 append (작성은 본 세션 종료 직전).
- `memory/project_foundation_state.md` — 세션 120 상태 라인 추가 + PLAN 동기화.

## 6. 블록 (Blockers / Open Questions)

- **BL-ADR-0007-DECISION**: ADR 0007 Decision 공란. 본 노트 § 전제 (5 옵션 구조 고정) 는 사용자가 A/B/C/D/E 중 하나를 pick 하기 전엔 결정 미확정.
- **BL-SPIKE-BUDGET**: Critical path sequence 의 세션 수 추정 (A=5 / B=5 / C=2~3 / D=8 / E=5→5~8) 은 프로덕트 일정 예산과 맞물림. 예산 결정 선행.
- **BL-OPEN-QUESTIONS**: ADR 0007 §Open Questions #1~#4 중 #1 (Cubism Import Viewer 제품 요구) 이 본 노트 §4 의 운명을 결정. 나머지 3 개는 §2/§5/§6 의 세부를 변형.

## 7. 다음 세션 제안 (Next)

자율 모드 후보 우선순위는 **매우 얇아짐** (문서 축 소진 + 옵션 분석 완결). 가능 경로:

- **세션 121 후보 (대안 a)**: golden step runbook / CI step 가독성 정리. 30 step 의 설명·의도를 README 또는 `progress/runbooks/` 에 정리. 자율 가능, 외부 의존 없음.
- **세션 121 후보 (대안 b)**: `progress_0420/` 자체 메타 정합성 점검. 세션 번호 / 테스트 수 / 패키지 수 카운트가 SUMMARY/INDEX/PLAN 사이 어긋나지 않는지 교차 검증. 자율 가능.
- **세션 121 후보 (후보 J, 이월)**: `renderer-observer` — ROI 여전히 낮음, 사용자 의견 없이는 진입 비권장.
- **사용자 pick 대기 경로**: ADR 0007 Accept 순간 본 노트 §7 의 공통 touch 8 항목 일괄 편집 + §6 의 선택 옵션 Critical path 세션 1 번 즉시 실행 가능.

## 8. 지표 (Metrics)

- 코드/문서 라인 수 추가: 노트 본문 ~278 라인, 세션 doc ~80 라인.
- 테스트: 본 세션은 코드 변경 없음 — golden 30 step / 패키지별 테스트 수 **불변** (누적 기준).
- 커버리지: 본 세션 범위 없음.
- 빌드: 본 세션 코드 변경 없음 — CI 불변.

## 9. 인용 (Doc Anchors)

- [progress/adr/0007-renderer-technology.md](../adr/0007-renderer-technology.md) — 원본 Draft
- [docs/13-tech-stack.md §2.2](../../docs/13-tech-stack.md) — 잠정 방향 기록
- [packages/web-avatar-renderer/src/contracts.ts](../../packages/web-avatar-renderer/src/contracts.ts) — `Renderer` 베이스 + 가드 (세션 114~115)
- [apps/web-editor/index.html:310](../../apps/web-editor/index.html) — `?debug=logger` wire-through (세션 116)
- [progress_0420/PLAN.md §7](../../progress_0420/PLAN.md) — 세션 120 대안 후보 (c) 출처
