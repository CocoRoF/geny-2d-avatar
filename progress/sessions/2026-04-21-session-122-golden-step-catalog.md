# Session 122 — Golden Step 카탈로그 (대안 a)

- **Date**: 2026-04-21
- **Workstreams**: Platform / Docs (runbook 색인)
- **Linked docs**: `scripts/test-golden.mjs`, `progress/runbooks/README.md`
- **Linked ADRs**: 0005 (rig authoring gate — step 14/18), 0006 (queue persistence — step 21), 0007 (renderer technology — step 25/26/27)

---

## 1. 목표 (Goals)

세션 117~121 누적으로 문서·분석·검증 축 소진. PLAN §7 의 남은 자율 후보 중 **대안 (a) golden step runbook** 선택 — self-contained, 외부 의존 0, Foundation → Runtime 전환 시 step 재배치 기준이 될 참조 문서. 세션 121 (대안 b) 의 자매 — 121 이 "현재 상태 claims 의 정확성" 을 고쳤다면 122 는 "각 step 이 무엇을 보장하는지" 를 명시화.

- [x] `scripts/test-golden.mjs` STEPS 배열 전수 읽기 → 각 step 이 보장하는 불변식 1~2 문장 요약.
- [x] `progress/runbooks/02-golden-step-catalog.md` 신규 (5 분류 × 30 step × 4-라인 고정 구조).
- [x] 인접 드리프트 (INDEX §2 "29 step", scripts/README.md stale 수치) 자연 발견 → 해소.

## 2. 사전 맥락 (Context)

- **이전 세션**: 세션 121 — progress_0420 메타 정합성 점검. 6 건 드리프트 해소 + "현재 상태 claims vs 세션 로그" 역사 보존 정책 확립.
- **PLAN §7 후보 지도 (세션 122 시점)**: (a) golden step runbook / J renderer-observer (ROI 낮음) / I Server Headless ADR (보류). (a) 는 외부 의존 0, 콘텐츠 생성 가능 → 자연 선택.
- **가정**: `scripts/test-golden.mjs` 의 주석이 각 step 의 의도를 가장 정확히 기록 — 본 카탈로그는 그 주석을 **카탈로그 4-라인 구조** 로 투영. 주석과 모순되는 주장 작성 금지.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| Golden step 카탈로그 | `progress/runbooks/02-golden-step-catalog.md` | 30 step 전부 4-라인 고정(보장/실행/의존성/도입) + 5 분류 헤더 + 운영 팁 4 항목 | 🟢 (~240 줄, §0~§7) |
| Runbook README 갱신 | `progress/runbooks/README.md` | 02 entry 추가 | 🟢 |
| scripts/README.md 갱신 | `scripts/README.md` | stale 수치 4 건(checked 131→244, "5-step→30 step"+카탈로그 링크, migrator 세션 111 반영, rig-template-lint entry 신규) 교체 | 🟢 |
| 인접 드리프트 해소 | INDEX §1·§2 | "29 step→30", "11+5→16+2" | 🟢 |

## 4. 결정 (Decisions)

### D1 — 런북 위치 = `progress/runbooks/02-`, scripts/README.md 는 포인터만

세 가지 후보가 있었음:

1. `scripts/README.md` 본문에 30 step 카탈로그 전체 embed
2. `progress/runbooks/02-golden-step-catalog.md` 신규 + scripts/README 는 포인터
3. 별도 `docs/NN-golden-steps.md` 로 공식 문서화

**(2) 선택**. 이유:

- `scripts/README.md` 는 "스크립트 파일 인덱스" 축 — 각 파일이 무엇을 하는지. 카탈로그는 "step 이 무엇을 보장하는지" 축 — 관점이 다르다. embed 하면 README 가 250 줄로 부풀어 인덱스 성격이 약화됨.
- `progress/runbooks/` 에 이미 `01-incident-p1.md` (비상 경로) 가 있음. golden step 카탈로그는 "정상 CI 경로 운영 문서" 로 짝맞춰짐 (README 에서도 이 쌍 구조 명시).
- `docs/` 는 "제품/설계 규격" 축 — step 구현 세부는 진화 빠름 (세션 122 시점 30 step, Runtime 합류 시 50+ 예상). 런북이 더 자연.

### D2 — 4-라인 고정 구조 (보장 / 실행 / 의존성 / 도입)

step 의 설명이 산만해지지 않도록 고정 schema 채택:

- **보장**: 불변식(invariant). 1~2 문장. 테스트 수가 아니라 "무엇이 깨지면 이 step 이 실패하는가". 예: Step 14 의 "CLI shim 과 패키지 dist 의 byte-equal 이 전제".
- **실행**: 실제 명령 (복사해서 수동 실행 가능).
- **의존성**: build 순서 (CI clean runner 에 필요). 없으면 "없음" 명시.
- **도입**: 세션 번호 / ADR 링크. 왜 존재하는지 역사적 근거.

4-라인이 아닌 다른 고정 구조 후보 (예: Purpose / Command / Prereq / Owner / Last-changed) 도 고려했으나 **Owner / Last-changed 는 git blame + log 가 더 정확** (D1 "현재 상태 claims vs 로그 축 분리" 원칙과 동형 — 메모리에 불필요한 stale 위험).

### D3 — 5 분류 (schema 1 + CLI 번들 3 + 패키지 16 + 스크립트·infra 8 + 앱 e2e 2)

30 step 을 자연스러운 그룹으로 묶어야 탐색 효율이 살아남. 분류 기준:

- **Schema**: 1 step. ADR 0002 축.
- **CLI 번들 골든 diff**: 3 step (byte-equal). "의도치 않은 번들 변경" 을 잡는 축.
- **패키지 단위 테스트**: 16 step. 가장 많고 교체·성장 빈도 높음 — 한 범주로 묶어 "어느 패키지가 빠져있나" 점검 용이.
- **스크립트·infra 회귀**: 8 step. infra chart / lint / snapshot drift / fallback validator / mock-vendor-server — test-golden.mjs 가 `node scripts/...` 로 직접 호출하는 축.
- **앱 e2e**: 2 step. 시간이 길고 환경 의존성 있음 → 격리된 분류.

이 분류는 **INDEX §1 CI 게이트 셀** 에도 그대로 투영됨 (세션 122 에서 "11+5→16+2" 로 교체). 카탈로그 §0 분류 표 = INDEX 셀 의 공식 소스.

### D4 — 인접 드리프트 해소 범위

카탈로그 작성 중 추가로 발견된 드리프트:

1. **INDEX §2 Platform 워크스트림** "CI 29 step" → 30 (세션 114 에서 step 30 추가됐으나 워크스트림 셀만 갱신 누락).
2. **INDEX §1 CI 게이트 셀** "11 패키지 테스트 + 5 e2e" → "16 패키지 + 2 e2e" (초기 표기가 남아있던 것 — 실제 e2e 는 web-preview + web-editor 2 개, 패키지 테스트는 16).
3. **scripts/README.md** — `checked=131 failed=0` (실제 244), "5-step 골든 러너" (실제 30 step), `rig-template/migrate.mjs` 가 v1.2.0 까지만 기록 (실제 v1.3.0 까지 + 세션 111 `@geny/migrator` 로 이전), `rig-template-lint.mjs` entry 자체 누락 (세션 110 리브랜딩 시 추가 안 됨).

세션 121 D1 원칙 (현재 상태 claims 만 수정) 은 **본 세션에서도 그대로 유지** — 수정 대상은 INDEX/README 같은 claims 파일만, 세션 로그 원문 보존.

D4 스코프는 "카탈로그 작성 중 자연 발견된 드리프트만" — 광범위 재감사는 별 세션(예: 세션 121 재실행) 로 분리. 카탈로그 본연 + 그 근처 1-hop 드리프트에 국한해 세션 스코프 유지.

### D5 — `scripts/rig-template/rig-template-lint.mjs` 신규 entry in scripts/README.md

세션 110 에서 `physics-lint` → `rig-template-lint` 리브랜딩 됐지만 `scripts/README.md` 테이블엔 어느 이름도 없었음 (처음부터 누락). D4 맥락에서 자연 발견 → 추가. `rig-template/migrate.mjs` 바로 아래 row 에 배치.

## 5. 변경 요약 (Changes)

- `progress/runbooks/02-golden-step-catalog.md` (신규) — §0 분류 / §1 schema / §2 CLI 번들 / §3 패키지 16 / §4 스크립트·infra 8 / §5 앱 e2e 2 / §6 운영 팁 / §7 참고 문서.
- `progress/runbooks/README.md` — "런북 목록" 표에 02 entry 추가, "정상 CI 경로" 범위 설명 부여.
- `scripts/README.md` — 4 row 갱신 (validate-schemas `checked=244`, test-golden "30 단계" + 카탈로그 포인터, migrate v1.3.0 + 세션 111 반영, rig-template-lint entry 신규).
- `progress_0420/INDEX.md` — (1) 헤더 "세션 1~121" → "세션 1~122" / (2) §1 헤더 "세션 121 직후" → "세션 122 직후" + "단계" 셀에 "golden step 카탈로그" 추가 / (3) §1 "누적 세션" 121 → 122 / (4) §1 CI 게이트 셀 "11+5→16+2" + 세션 122 카탈로그 경로 포인터 / (5) §2 Platform "CI 29 step → 30 step" + "온콜 런북" → "온콜 런북 2 종" / (6) §4 헤더 "세션 122 후보" → "세션 123 후보" + 자율 후보 소진 명시.
- `progress_0420/PLAN.md` — (1) 헤더 "세션 122+" → "세션 123+" / (2) §3 [완료] 블록에 세션 122 ✅ entry 추가 / (3) §7 "다음 즉시 행동" 헤더 122 → 123 + 본문 재작성 (세션 122 결과 요약 + 세션 123 후보 = J / I 만 남음, 자율 여지 거의 없음 명시).
- `progress_0420/SUMMARY.md` — (1) 헤더 "세션 1~121" → "세션 1~122" + 런북 축 + claims/log 분리 범위에 세션 122 포함 / (2) §13 세션 122 row 신규 append.
- `progress/sessions/2026-04-21-session-122-golden-step-catalog.md` (신규, 본 파일) — 9 섹션 + 5 Decisions.
- `progress/sessions/*` — **수정 없음** (D4 원칙 재확인).
- `memory/project_foundation_state.md` — 요약 블록 세션 122 반영 (본 세션 종료 직전 갱신).

## 6. 블록 (Blockers / Open Questions)

- **BL-CONTENT-AXIS** (세션 121 에서 확인, 122 후 상태 심화): 세션 117~122 누적으로 자율 모드 self-contained 콘텐츠 축 **거의 완전 소진**. 세션 123 이후 자율 가능 후보는 사실상 후보 J (renderer-observer, 낮은 ROI) 뿐 — 사용자 pick (ADR 0007 Accept / Runtime Spike / v1.3.0→v1.4.0 리그 변경 범위) 을 기다려야 할 상황.
- **BL-CATALOG-SYNC**: 본 카탈로그는 `scripts/test-golden.mjs` STEPS 배열의 "현재 상태" 를 투영. STEPS 가 변경될 때마다 카탈로그 §1~§5 도 동시 갱신 필요. 본 카탈로그 §6.4 "step 추가 규약" 5 항목에 이를 명시 — 드리프트 재발 방지의 1차 방어선.

## 7. 다음 세션 제안 (Next)

자율 후보 **거의 소진**. 세션 123 가능 경로:

- **후보 J (renderer-observer)** (세션 117~122 이월, ROI 낮음): 렌더러 이벤트를 관측하는 작은 유틸. 실 렌더러 합류 전엔 시그널 노이즈 — 사용자 의견 필요. 진입 시 본 카탈로그 §3 에 step 추가.
- **후보 I (Server Headless ADR)**: ADR 0007 Open Question #3 사용자 답변 선행. 자율 진입 불가.
- **(잔여 저 ROI 후보)**: `docs/` 14 챕터 상호 참조 색인 / ADR 요약 카탈로그 — 기존 문서 대비 중복 위험. 사용자 요청 시에만 진입.

**사용자 pick 후 즉시 가능 경로**:

- ADR 0007 A/D/E pick → Decision 채우고 Accepted 커밋 + 노트 §7 공통 touch 8 항목 일괄 편집 + 선택 옵션 Critical path 진입 (세션 120 노트 §2/§5/§6).
- v1.3.0→v1.4.0 migrator → `packages/migrator/src/migrations/v1-3-0-to-v1-4-0.ts` append, 골든 step 14 자동 확장 (본 카탈로그 §3 Step 14 는 불변).

## 8. 지표 (Metrics)

- 코드/문서 라인 수 추가: 카탈로그 ~240 줄 (신규) + 세션 doc ~120 줄 (신규) + INDEX/SUMMARY/PLAN ~40 줄 수정 + scripts/runbooks README ~5 줄 수정. 코드 변경 0.
- 테스트: 본 세션은 코드 변경 없음 — golden 30 step **불변** (카탈로그는 step 을 기술할 뿐 실행 경로에 개입 안 함).
- 커버리지: 본 세션 범위 없음.
- 빌드: 본 세션 코드 변경 없음 — CI 불변.

## 9. 인용 (Doc Anchors)

- [scripts/test-golden.mjs](../../scripts/test-golden.mjs) — STEPS 배열 + 각 step 구현체(30 개). 본 카탈로그의 1차 소스.
- [progress/runbooks/02-golden-step-catalog.md](../runbooks/02-golden-step-catalog.md) — 본 세션 산출물.
- [progress/runbooks/01-incident-p1.md](../runbooks/01-incident-p1.md) — 자매 런북 (비상 경로, 본 카탈로그는 정상 경로).
- [progress/sessions/2026-04-21-session-121-progress-meta-consistency.md](./2026-04-21-session-121-progress-meta-consistency.md) — "claims vs 로그 축 분리" 원칙(D1) 이 D4 로 재적용.
- [progress/adr/0005-rig-authoring-gate.md](../adr/0005-rig-authoring-gate.md) — L1(step 14) / L2(step 18) / L4(step 3/4/5) 매핑.
- [progress/adr/0006-queue-persistence.md](../adr/0006-queue-persistence.md) — BullMQ mock 축(step 21) + integration lane.
- [progress/adr/0007-renderer-technology.md](../adr/0007-renderer-technology.md) — renderer 계약 축(step 25·26·27).
