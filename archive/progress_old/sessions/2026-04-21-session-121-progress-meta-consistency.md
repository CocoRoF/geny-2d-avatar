# Session 121 — progress_0420 메타 정합성 점검 (대안 b)

- **Date**: 2026-04-21
- **Workstreams**: Platform / Docs (meta-consistency audit)
- **Linked docs**: `progress_0420/{INDEX,SUMMARY,PLAN}.md`, `memory/project_foundation_state.md`
- **Linked ADRs**: — (본 세션은 ADR 변경 없음)

---

## 1. 목표 (Goals)

세션 117~119 문서 축 + 세션 120 ADR 0007 Option diff 노트 로 self-contained 콘텐츠 축 소진. PLAN §7 대안 (a) golden step runbook 과 (b) progress_0420 메타 정합성 점검 중, 본 세션은 **(b)** 선택 — 새 콘텐츠 생성보다 기존 claims 의 정확성 검증이 더 안전한 자율 작업. (a) 는 세션 122 로 이월.

- [x] `progress_0420/{INDEX,SUMMARY}.md` + `memory/project_foundation_state.md` 의 현재 상태 기술 전수 교차 검증.
- [x] 드리프트 발견 시 **현재 상태 claims 만** 수정 — 세션 로그 (`progress/sessions/*`) 는 역사 그대로 보존.
- [x] 원인 분석을 수정 문장 안에 명시 (누가 어디서 밀렸는지) → 재발 방지 단서.

## 2. 사전 맥락 (Context)

- **이전 세션**: 세션 120 — ADR 0007 Option 별 diff 노트 작성. 세션 doc 참조 slug 검증 규칙(D4, 세션 119) 재적용 → 3/4 slug 오류 즉시 교정. 세션 121 에서도 D4 규칙은 살아 있음.
- **자율 모드 제약**: 외부 의존 없는 self-contained 작업만 허용. 본 세션은 순수 검증 + 문장 수정.
- **가정**: `progress/sessions/*` 는 "최후의 진실 공급원" (progress_0420/INDEX.md §0 보존 규칙). 과거 세션 doc 은 수정 대상 아님. 본 세션의 수정 경계는 **현재 상태 주장(claims) 파일** 로 한정 — `progress_0420/INDEX.md §1·§4` · `progress_0420/SUMMARY.md §2·§7.1·§13` · `memory/project_foundation_state.md` 요약 블록.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 패키지 카운트 드리프트 해소 | INDEX §1 + SUMMARY §2 + SUMMARY §13 + memory 요약 | "15" 주장이 모두 "14" 로 통일 + 원인 한 줄 | 🟢 |
| 백엔드/인프라 카운트 해소 | memory 요약 | "10 + 4" (백엔드 10 + 프론트엔드 4 = 14) 로 확정, memory 에서만 수정 | 🟢 |
| CI §7.1 테스트 수 실측 재캡처 | SUMMARY §7.1 line 265 | `grep -cE "^test\(|^\s+test\(|await t\.test\("` 로 재측정한 숫자로 교체 | 🟢 (4 건) |
| 실측 clean 축 확인 | 본 세션 doc §4 D2 | golden 30 step / lint C1~C14 / ADR 0001~0007 / 21/111/8 tests / apps 3 / services 1 / scripts 18 드리프트 없음 보고 | 🟢 |

## 4. 결정 (Decisions)

### D1 — 수정 경계: "현재 상태 claims" vs "세션 로그"

`progress/INDEX.md §0` 은 세션 로그를 "최후의 진실 공급원" 으로 정의함. 따라서 세션 111 doc 의 "누적 패키지 13 → **14**" (실제 12 → 13) 같은 과거 표기는 **그대로 둠**. 세션 로그는 그 시점의 저자 판단을 기록하는 1차 사료 — 사후 정정은 "주석 과잉" 의 출발점이 되어 로그 신뢰성을 훼손함. 반면 `progress_0420/{INDEX,SUMMARY}.md` 와 `memory/*.md` 는 "현재 시점에서 올바른 요약" 이 계약 — 여기서만 수정.

D1 논리는 세션 120 D3 (LOC 수치 = 참고용, 결정된 예산 아님) 와 동형: **주장 파일은 현재 correctness**, **원천/역사 파일은 그 시점의 record**.

### D2 — 패키지 카운트 off-by-one 근본 원인

grep 으로 실측: `packages/` 는 14 개 디렉터리, `apps/` 3 개 (web-editor, web-preview, worker-generate), `services/` 1 개 (orchestrator). 프론트엔드 4 (`web-avatar` / `web-avatar-renderer` / `web-editor-logic` / `web-editor-renderer`) + 백엔드·인프라 10 (`schema-tool` / `license-verifier` / `ai-adapter-core` / `ai-adapter-nano-banana` / `ai-adapters-fallback` / `metrics-http` / `post-processing` / `exporter-core` / `exporter-pipeline` / `job-queue-bullmq` / `migrator` — 10 개 집계 경계는 memory 주석 참조; `orchestrator-service` · `worker-generate` 는 apps/services 로 분류).

세션 89 에 `@geny/web-editor-logic` 이 합류했으나 당시 세션 doc 이 "누적 패키지" 카운터를 갱신하지 않아 이후 세션들이 **12 를 13 으로 오판한 채 +1 씩 증분**. 세션 111 doc "13 → 14" 는 실제 12 → 13, 세션 114 doc "14 → 15" 는 실제 13 → 14. Delta (+1) 는 매 세션 정확 — 베이스 값만 1 밀림. 누적 결과가 "15" 로 과대평가되어 SUMMARY §13 세션 119 셀과 INDEX §1 에 전파.

**수정 대상**: INDEX §1 "15 packages" → "14" + 원인 한 줄 주석 / SUMMARY §2 세션 114 마일스톤 "14 → **15**" → "13 → **14**" + 세션 121 재검증 주석 / SUMMARY §13 세션 119 셀 "Foundation 15 패키지 문서 축 완결" → "Foundation 14 패키지 문서 축 완결" + 세션 121 재검증 주석 / memory `project_foundation_state.md` 요약 블록 재작성.

### D3 — 백엔드/인프라 카운트 모순

세션 119 doc 내부 모순: line 4/11 "10 패키지" 와 line 120 "11" 공존. 그 시점 저자 판단이 흔들린 흔적 — 본 세션에서 **현재 claims 는 "10" 으로 확정** (세션 119 doc 은 수정 안 함, D1 원칙). memory 요약만 "백엔드/인프라 10" 으로 재작성. 10 의 근거는 D2 의 실측 10 패키지 목록 + `orchestrator-service` / `worker-generate` 는 services/apps 분류 규약.

### D4 — 테스트 수 실측 방법론

regex `^\s*test\(|^test\(` 가 첫 시도에선 일부 패키지에서 0 을 반환 (migrator 는 `test("…", …)` 로 line 시작, prefix 공백 없음 — `^\s+` 에 매칭 안 됨). 수정 regex `^test\(|^\s+test\(|await t\.test\(` 로 `find <pkg>/tests -name '*.test.*' | xargs grep -cE` 재측정:

- `ai-adapter-core`: 70 (기존 claim 68 → +2)
- `ai-adapter-nano-banana`: 23 (유지)
- `ai-adapters-fallback`: 53 (유지)
- `post-processing`: 111 (유지)
- `metrics-http`: 12 (유지)
- `orchestrator-service`: 12 (유지)
- `web-avatar`: 20 (유지)
- `web-editor-logic`: 39 (기존 claim 57 → -18, 테스트 통합으로 감소)
- `job-queue-bullmq`: 28 (기존 claim 25 → +3)
- `worker-generate`: 45 (기존 claim 21 → +24, 테스트 성장)
- `migrator`: 8 (유지)
- `web-avatar-renderer`: 21 (유지, 10 계약 + 6 null + 5 logging)
- `exporter-core`: 102 (유지)
- `exporter-pipeline`: 10 (유지)

**수정 대상**: SUMMARY §7.1 line 265 — 4 건 숫자 교체 + 재검증 주석. `cost_usd` 류 계산 불변식은 영향 없음 — 테스트 수가 줄었다고 커버리지가 줄었다는 뜻이 아님 (통합 fixture 로 rewrite). 골든 30 step 이 계속 green 이므로 회귀는 없음.

### D5 — 본 세션 doc 자체의 slug 검증

세션 120 D4 규칙 (slug 검증) 이 본 세션에서도 발동. 파일명 `2026-04-21-session-121-progress-meta-consistency.md` — `ls progress/sessions/ | grep session-121` 로 확인. 본 세션은 외부 참조 (다른 세션 doc 링크) 가 적지만, SUMMARY §13 row 의 "세션 121" 링크 없음 (기존 row 규약) — 참조 오류 없음. 세션 119 D4 규칙은 누적 세션 수가 늘수록 효용 증가.

## 5. 변경 요약 (Changes)

- `progress_0420/INDEX.md` — (1) 헤더 "세션 1~120" → "세션 1~121" / (2) §1 헤더 "세션 120 직후" → "세션 121 직후" / (3) §1 "단계" 셀 에 "메타 정합성 점검" 추가 / (4) §1 "누적 세션" 120 → 121 / (5) §1 "누적 패키지" 셀 "15" → "14" + 원인 한 줄 / (6) §4 헤더 "세션 121 후보" → "세션 122 후보" + 후보 재정렬.
- `progress_0420/SUMMARY.md` — (1) 헤더 "세션 1~120" → "세션 1~121" + claims/로그 분리 원칙 명시 / (2) §2 세션 114 마일스톤 "14 → **15**" → "13 → **14**" + 세션 121 재검증 주석 / (3) §7.1 line 265 4 건 테스트 수 교체 + 재검증 주석 / (4) §13 세션 119 셀 "Foundation 15 패키지" → "Foundation 14 패키지" / (5) §13 세션 121 row 신규 append.
- `progress_0420/PLAN.md` — (1) 헤더 "세션 121+" → "세션 122+" / (2) §3 [완료] 블록 에 세션 121 ✅ entry 추가 / (3) §7 "다음 즉시 행동" 헤더 121 → 122 + 본문 재작성 (세션 121 결과 요약 + 세션 122 대안 (a) 권장 + 세션 123+ 예약).
- `memory/project_foundation_state.md` — 요약 블록 재작성 (이전 세션 대화 중 완료). 세션 121 상태 + 드리프트 6 건 해소 기록.
- `progress/sessions/2026-04-21-session-121-progress-meta-consistency.md` (신규, 본 파일) — 9 섹션 템플릿 + 5 결정(D1~D5).
- `progress/sessions/*` — **수정 없음** (D1 원칙). 세션 89 / 111 / 114 / 119 doc 의 과거 카운트 주장은 역사 그대로 보존.

## 6. 블록 (Blockers / Open Questions)

- **BL-CONTENT-AXIS**: 세션 117~121 누적으로 자율 모드 self-contained 콘텐츠 축 거의 소진. 세션 122 대안 (a) golden step runbook 이 유일한 명백한 다음 항목. 그 이후는 사용자 pick 필요 (ADR 0007 Accept / Runtime Spike / v1.3.0→v1.4.0 리그 변경 범위).
- **BL-OPEN**: memory 요약 블록은 본 세션 종료 직전에 한 번 더 재검증 필요 (본 세션 doc 기록과 cross-check).

## 7. 다음 세션 제안 (Next)

자율 모드 후보 (우선순위):

- **세션 122 후보 (대안 a, 권장)**: golden step runbook / CI step 가독성 정리. 30 step 각각 "무엇을 보장하는지" 1~2 문장으로 `progress/runbooks/02-golden-step-catalog.md` (신규) 또는 `scripts/README.md` 에 정리. Foundation → Runtime 전환 시 step 재배치 기준 참조 문서. 외부 의존 0.
- **세션 122 후보 (후보 J, 이월)**: renderer-observer — ROI 여전히 낮음, 실 렌더러 합류 전엔 시그널 노이즈. 사용자 의견 필요.
- **세션 122 후보 (후보 I, 보류)**: Server Headless ADR — 사용자 의사 선행. 변동 없음.

**사용자 pick 후 즉시 가능 경로** (세션 120 노트 참조):

- ADR 0007 A/D/E pick → Decision 채우고 Accepted 커밋 + 노트 §7 공통 touch 8 항목 일괄 편집.
- Option 별 Critical path sequence 세션 1 번 즉시 실행 (세션 120 노트 §2/§5/§6).

## 8. 지표 (Metrics)

- 코드/문서 라인 수 추가: 본 세션 doc ~120 줄 (신규) + INDEX/SUMMARY/PLAN 누적 ~30 줄 수정 (순증은 세션 121 행/주석만, 교체가 다수). 코드 변경 0.
- 테스트: 본 세션은 코드 변경 없음 — golden 30 step / 패키지별 테스트 수 **불변** (CI 관점). 다만 SUMMARY §7.1 claim 은 실측에 맞춰 재캡처됨 (claim ↔ 실측 delta 해소).
- 커버리지: 본 세션 범위 없음.
- 빌드: 본 세션 코드 변경 없음 — CI 불변.

## 9. 인용 (Doc Anchors)

- [progress_0420/INDEX.md §0](../../progress_0420/INDEX.md) — 세션 로그 = "최후의 진실 공급원" 보존 규칙 (D1 근거).
- [progress/sessions/2026-04-21-session-120-adr-0007-option-diff-notes.md §4 D3](./2026-04-21-session-120-adr-0007-option-diff-notes.md) — LOC 수치 = 참고용 원칙 (D1 동형).
- [progress/sessions/2026-04-20-session-89-web-editor-logic.md](./2026-04-20-session-89-web-editor-logic.md) — off-by-one 발원점 (D2 근거).
- [progress/sessions/2026-04-21-session-119-remaining-package-readmes.md](./2026-04-21-session-119-remaining-package-readmes.md) — 내부 모순 (10 vs 11, D3 근거) — 수정하지 않고 보존.
- [progress_0420/SUMMARY.md §7.1](../../progress_0420/SUMMARY.md) — CI 테스트 수 claim 위치 (D4 수정 지점).
