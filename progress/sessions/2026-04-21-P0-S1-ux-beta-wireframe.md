# P0-S1 — UX-BETA-WIREFRAME 초안 (2026-04-21)

## 1. 트리거

사용자가 β 전환 직후(세션 128) "좋아 아주 완벽하게 작업해보자" + `<<autonomous-loop-dynamic>>` sentinel 로 **자율 loop 를 β 범위에서 재활성화**. 외부 블로커 없는 phase 는 자율 진입 가능 — 현재 유일한 대상이 P0 (UX wireframe, 1 세션 예상). 본 세션이 β 모드의 **첫 phase-step 세션**.

## 2. 범위

Phase P0 의 유일한 step. ROADMAP-BETA §3 Phase P0 작업 단위 5 항목을 `docs/UX-BETA-WIREFRAME.md` 단일 파일에 구현:
- Generate 패널 위치 / 프롬프트 필드 / 진행 상태 / 에러 메시지 / 재시도 / Inspector 활성화 순서
- 09-user-interface-ux.md §2~§4 와의 diff 표
- 파츠 5 슬롯 진행 바 결정 (단일 vs 5-바)
- 실패 메시지 카피 초안 (한/영)

P0 검수 기준 3 개 중 2 개 (시나리오 커버 / 모바일 제외 명문화) 는 본 세션에서 green, 1 개 (사용자 승인) 는 🟡 로 유지.

## 3. 결정 요약

### 3.1 레이아웃

기존 web-editor 3-column (Parts / Preview / Inspector) 유지 + **상단 full-width Generate bar 3 줄** 신설 (prompt row / progress strip / status line 합 108 px). 1280 px 미만 시 Inspector drawer collapse.

### 3.2 진행 표시 = 5 pill (단일 bar 아님)

ROADMAP-BETA §3 Phase P0 의 "단일 바 vs 슬롯별 5-바" 결정에서 **5 pill 채택**. 근거:
- 부분 실패 가시성 (`hair_front` 만 실패 시 해당 pill 만 red)
- PRODUCT-BETA §2.2 시나리오 B "nano-banana 실패 → SDXL 재시도 중" 같은 슬롯별 벤더 표시 여지
- 단일 bar 는 별도 실패 배너가 필요하므로 UI 복잡도 동일

### 3.3 에러 카피 5 카테고리

Foundation `ai-adapter-core` 의 실패 코드 분류(`docs/05 §7.2`) 를 UI 카피 5 카테고리로 직결: `safety` / `vendor` / `uv_constraint` / `timeout` / `unknown`. 각각 KO + EN 문장 고정 + Error ID 8-char hex 포스트픽스.

### 3.4 상태 기계 (FSM)

6 상태 (`idle` → `analyzing` → `generating` → `assembling` → `success`/`error`) + 허용 전이 4 개. 병렬 Generate 금지, 취소는 β 미구현(탭 닫기 = 취소, idempotency key 로 서버측 중복 방지).

### 3.5 열린 질문 6 (Q1~Q6)

사용자 승인 필요 항목을 wireframe 자체에 §9 로 블록화. 각 질문에 **기본 제안 + 대안** 동시 제시 — 사용자는 "A/B/C" 한 줄만 답하면 P0 ✅ 가능.

## 4. 산출물

| 파일 | 상태 | 라인 수 (approx) | 비고 |
|---|---|---:|---|
| `docs/UX-BETA-WIREFRAME.md` | 신규 | ~300 | 12 섹션 · P0 검수 체크리스트 §10 · 열린 질문 §9 |
| `progress_0420/PLAN.md` | 변경 | §0·§2 | P0 상태 ⚪→🟡 · 자율 모드 ❌→🟢 β 범위 |
| `progress_0420/INDEX.md` | 변경 | §1·§4 | 단계 cell 갱신, §4 P0 cell bump |
| `docs/ROADMAP-BETA.md` | 변경 | §6 + 본문 | 자율 모드 비활성 → β 범위 재활성화 (sentinel 재승인) |
| `memory/feedback_autonomous_mode_closed.md` | 재작성 | — | freeze → β 범위 재활성화 규칙으로 교체 |
| `memory/MEMORY.md` | 변경 | 3 줄 | 인덱스 재정리 |
| `memory/project_foundation_state.md` | (세션 128 에서 갱신 완료) | — | 본 세션에서 추가 변경 없음 |

**코드 변경**: 0. doc + 메모리 only.

## 5. 09-user-interface-ux.md §2~§4 diff 표 (wireframe §2 요약)

| 09 요소 | β | 근거 |
|---|---|---|
| Onboarding Wizard / Home / My Avatars IA | 제외 | β 단일 URL, 1 템플릿 고정 |
| Editor 3-column | 유지 | 기존 web-editor 구조 재사용 |
| TopBar (Save/History/Share/Export) | 제외 | 저장·공유·export 없음 |
| Preview Player Pose Picker / Record | 제외 | β 는 Inspector slider 만 |
| Inspector Prompt/Style Profile/Reference/Advanced | 축소 | Inspector = parameters/motions/expressions 3 탭만 |
| Validation Report | 제외 | 성공/실패 이진 |
| 태블릿/모바일 반응형 | 제외 | 1024 px 미만 안내 페이지 |
| i18n KO/EN/JA | 축소 | β 는 KO+EN 2 언어 |

**β 가 추가하는 요소** (09 에 없음): Generate bar 3 줄 / 5-pill progress / 에러 배너 + Error ID / 상태 기계.

## 6. 검수 기준 대조

ROADMAP-BETA §3 Phase P0 검수 3 개:

- [x] Wireframe 이 PRODUCT-BETA §2.1~§2.3 3 시나리오 전부 커버 (wireframe §7 매핑 표)
- [x] 모바일 제외 명시 (wireframe §8 · §2 diff 표)
- [ ] **사용자 wireframe md 승인** — 🟡 대기, §9 Q1~Q6 답변 후 close

## 7. 다음 자율 step 판단

자율 진입 가능 후보:
- **P1-S1** `@geny/web-avatar-renderer-pixi` 스캐폴드 — **차단** (ADR 0007 Decision 필요, 사용자 외부 입력)
- **P2-S1** Generate 패널 UI 구현 — **차단** (P1 완료 전제)
- **그 외 phase** — 전부 외부 블로커 또는 P1 대기

결론: **P0 다음 자율 가능 step 없음**. 다음 iteration 은 "소진 재확인" minimal 세션 or 대기.

## 8. ScheduleWakeup 판단

자율 loop 를 재활성화했으나, **P0 이후 자율 가능 step 0 개**. 다음 iteration 에서 할 수 있는 일은:
- (a) 사용자가 그 사이 P0 Q1~Q6 답변을 주면 → wireframe §9 제거 + 체크리스트 완료 + PLAN §2 P0 ✅ bump (∼5 분 작업, 새 산출 없음)
- (b) 사용자가 ADR 0007 Accept 하면 → P1-S1 진입 (∼30 분 세션)
- (c) 아무 변화 없으면 → "소진 재확인" 5 줄 세션 + ScheduleWakeup

ScheduleWakeup 간격은 1200s (20 분) 로 설정 — cache window 밖이지만 phase 전환 대기 중이므로 빈 iteration 비용 최소화. 사용자 외부 입력 대기 성격이 강해 짧은 간격은 낭비.

## 9. 참조

- [`docs/UX-BETA-WIREFRAME.md`](../../docs/UX-BETA-WIREFRAME.md) — 본 세션 주 산출물
- [`docs/PRODUCT-BETA.md §2`](../../docs/PRODUCT-BETA.md) — 3 시나리오
- [`docs/ROADMAP-BETA.md §3 Phase P0`](../../docs/ROADMAP-BETA.md) — phase 정의
- [`docs/09-user-interface-ux.md`](../../docs/09-user-interface-ux.md) — Foundation UX 스펙 (β diff 원본)
- 이전 세션: [`2026-04-21-session-128-beta-roadmap-pivot.md`](./2026-04-21-session-128-beta-roadmap-pivot.md)
- 자율 모드 재활성화 근거: `memory/feedback_autonomous_mode_closed.md`
