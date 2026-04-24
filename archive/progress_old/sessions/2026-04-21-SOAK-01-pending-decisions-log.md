# SOAK-01 — β 대기 결정 로그 단일화 (2026-04-21)

## 1. 트리거

P0-S1 직후 자율 iteration (`<<autonomous-loop-dynamic>>`) 진입. P0 산출물은 완성, P1~P6 는 외부 블로커(ADR 0007 / BL-VENDOR-KEY / BL-STAGING) 전부 차단. 자율 진입 가능 phase step 0.

`feedback_autonomous_mode_closed.md` 의 소진 조건 (a)(b)(c) 모두 충족 → 원칙적으로 "소진 재확인 minimal 세션" 경로. 하지만 **pure 소진 선언** 보다 **결정 로그 단일화** 가 사용자 잠금 해제 비용을 낮추는 실 도구 → 이쪽 채택.

"문서 정리" 금기와의 경계: 카탈로그 / 인덱스 / 요약 재정리는 금지 (사용자가 명시 비판). 단, **사용자 의사결정을 직접 처리하는 양식** 은 제품 진행 잠금 해제 도구이므로 허용. SOAK-01 산출물은 후자.

## 2. 산출물

### 2.1 `progress/notes/beta-pending-decisions.md` (신규, 9 섹션)

β 진입까지 필요한 **모든 외부 결정 항목** 을 한 파일에 집약:

| 섹션 | 내용 | 사용자 답변 포맷 |
|---|---|---|
| §1 | P0 UX wireframe Q1~Q6 (6 질문) | `Q1~Q6: 전부 기본` 한 줄로 처리 가능 |
| §2 | ADR 0007 Decision (A/C/D/E) | `ADR 0007: Option E Accepted` |
| §3 | BL-VENDOR-KEY 8 체크리스트 | YAML blob |
| §4 | BL-STAGING 10 체크리스트 | YAML blob |
| §5 | BL-BUDGET 4 항목 (~$500 합계) | YAML blob |
| §6 | BL-LEGAL 6 항목 | YAML blob |
| §7 | 결정 순서 권장 (최단 β 경로) | — |
| §8 | 생명주기 규약 (완료 스탬프 / 아카이브) | — |
| §9 | 참조 | — |

핵심 발견: 사용자가 **§1 "전부 기본" + §2 "Option E"** 두 줄만 답하면 P0 ✅ + P1-S1~S5 5 세션이 즉시 자율 open. 나머지 BL-* 은 P2~P5 시점에 필요.

### 2.2 PLAN.md §3 보강

단일 창구 링크 추가 — 기존 §3 "옵션 A/B/C" 텍스트 위에 결정 로그 포인터 배치. 사용자가 첫 스크롤에서 바로 결정 로그로 jump 가능.

### 2.3 INDEX.md §1 단계 cell 갱신

"P0-S1 직후" → "SOAK-01 직후" 로 bump. 결정 로그 단일 창구 상태 명시.

## 3. 본 세션의 판단 근거

### 3.1 왜 "pure 소진" 이 아니라 "결정 로그 저작" 인가

- **pure 소진 minimal 세션** (session doc 5 줄 + header bump) 은 제품 진전 0
- **결정 로그** 는 사용자가 다음 접속 시 **스크롤 하나로 모든 결정 처리 가능** → 잠금 해제 시간 최소화 → β 벽시계 시간 단축
- 이는 카탈로그 (정보 재배치) 와 다름: **사용자 액션을 저비용으로 유도하는 양식** 이므로 제품 기능 성숙도 직결

### 3.2 왜 "프롬프트 템플릿 5 종 선제 저작" 이 아니었나

- 프롬프트 템플릿은 슬롯 granularity (face = face_base 단일 vs 8-part 합성) 가 사용자 설계 결정 구역
- 실 nano-banana 응답 없이 템플릿 문구 tuning 은 speculative
- 즉 템플릿 저작은 **템플릿 구조 자체가 결정 대기 상태** — 결정 로그 먼저 작성이 순서상 올바름

### 3.3 왜 "P2-S1 UI 구현 선제" 가 아니었나

- P2-S1 은 UX-BETA-WIREFRAME §9 Q1~Q6 답변에 의존 (특히 Q1 5 pill vs 단일 bar)
- 답변 전 구현은 throwaway risk
- 이 역시 결정 로그가 Q1~Q6 을 closing 해야 자율 진입 가능

## 4. 검증

- [x] `progress/notes/` 기존 구조 (adr-0007-option-diffs.md 1 건) 관례 준수 — "결정물 아닌 산출물" 보관 디렉터리 (세션 120 신설 규칙)
- [x] 결정 로그 §1~§6 가 ROADMAP-BETA §5 블로커 맵 5 행 (ADR 0007 / BL-VENDOR-KEY / BL-STAGING / BL-BUDGET / BL-LEGAL) + P0 Q1~Q6 을 전부 포괄
- [x] 각 블로커에 **해제 시 open 되는 자율 세션** 명시 → 결정 로그가 액션 연결점으로 기능
- [x] 사용자 답변 포맷이 1 줄 ~ YAML blob 로 저비용
- [x] 코드 변경 0. doc + notes only.

## 5. 다음 자율 iteration 판단

이번 세션 후 상태도 변하지 않음 — 여전히 **P0 ~ P6 외부 블로커 차단**. 다음 iteration 에서 추가 실 제품 가치 있는 자율 산출 **거의 없음**. 다음 wakeup 은:

- (case A) 사용자가 그 사이 결정 로그에 답변 → 답변 반영 세션 (대부분 5~15 분 자동 작업)
- (case B) 사용자 반응 없음 → **pure "소진 재확인" minimal 세션** (5 줄 session doc + header bump + ScheduleWakeup 3600s)

이번 SOAK-01 이 결정 로그 단일화로 **사용자 unblock 경로를 최대화** 했으므로, case B 의 계속 반복은 자원 낭비. ScheduleWakeup 을 **3600s (최대)** 로 설정해 cache miss 1 회로 더 긴 대기 window 확보.

## 6. 참조

- [`progress/notes/beta-pending-decisions.md`](../notes/beta-pending-decisions.md) — 본 세션 주 산출물
- [`docs/UX-BETA-WIREFRAME.md §9`](../../docs/UX-BETA-WIREFRAME.md) — Q1~Q6 원본
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — ADR 0007 Draft
- [`docs/ROADMAP-BETA.md §5`](../../docs/ROADMAP-BETA.md) — 블로커 맵 원본
- 이전 세션: [`2026-04-21-P0-S1-ux-beta-wireframe.md`](./2026-04-21-P0-S1-ux-beta-wireframe.md)
- 자율 모드 규약: `memory/feedback_autonomous_mode_closed.md`
