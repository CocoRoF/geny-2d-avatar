# PLAN — β 로드맵 모드 (2026-04-21 이후)

**Foundation 종료**. 세션 127 에서 자율 후보 소진 선언 + 사용자 지시로 **β 로드맵 모드 전환**. 본 문서는 이제 "β 릴리스까지 무엇을 어떤 순서로 만들지" 의 세션 단위 트래커다. 카탈로그 축은 끝났다.

권위 문서는 이제 **`docs/PRODUCT-BETA.md`** (제품 정의) + **`docs/ROADMAP-BETA.md`** (phase 별 실행 로드맵) 두 개다. 본 PLAN 은 그 두 문서의 **세션 운영 뷰**다.

---

## 0. 현재 상태 (2026-04-21)

- **Foundation**: ✅ 종료 (Exit 4/4 + 릴리스 게이트 3/3 + lint C1~C14 + migrator + 렌더러 계약 + 15 패키지 + 125+ 세션 문서)
- **β 로드맵**: 🟢 **P1 S1~S10 완료 + P2 🟢 S1~S6 완료** (2026-04-22) — P1-S10 에서 pixi motion ticker 의 breath fade ramp 를 `motion-ticker.ts` 순수 함수 (`advanceBreathFrame` / `startBreath` / `stopBreath` / `initialBreathState`) 로 분리. BreathState immutable 단일 레퍼런스로 기존 6 mutable 변수 통합 + 22 node:test 회귀 (fade 선형성 · scaleY = 1+sin(phase)·AMP·rampFactor · 500ms period floor · dt NaN/negative 방어 · start/sustain/stop 라이프사이클). 렌더러 ticker callback 30줄→8줄, 기존 44 pixi-renderer 테스트 불변(거동 zero change). P2-S6 `?debug=metrics` dev 패널 + `summarizeMetricHistory` 순수 함수 (9 node:test). P1-S9 `?debug=pivots` dev 오버레이. P1-S8 halfbody/fullbody 68 파츠 pivot_uv 자동 주입 + P1-S7 uv 포맷 회귀 수정. P2-S5 metrics emit 스키마 14 node:test 회귀 고정. P1-S7 atlas `pivot_uv` 계약. P2-S4 텔레메트리 훅. P1-S6 auto-preview. P2-S3 pill timing + 5000ms 예산 시각화. P2-S2 mock 품질. P1-S5 시각 정확성. P1-S4 per-part parameter binding. P0 Q1~Q6 사용자 승인 대기 (비차단).
- **자율 모드**: 🟢 β 범위 활성. SOAK/speculative doc 는 금지 (사용자 2026-04-21 correction).
- **다음 step**: expression blink 순수 함수화, pivot 레이블 + 슬롯 ID 오버레이, metrics 패널 접기/clear UX. P3 은 `BL-VENDOR-KEY` 블로커 대기.

## 1. β 까지의 외부 의존 3 축

| # | 블로커 | 해제 조건 | 차단 phase |
|---|---|---|---|
| 1 | **ADR 0007 Decision** | `progress/adr/0007-renderer-technology.md` Decision 섹션에 Option A/C/D/E 중 하나 Accepted | P1 진입 |
| 2 | **BL-VENDOR-KEY** | GCP 프로젝트 + Gemini API 키 + quota ≥ 1000 req/month | P3 진입 |
| 3 | **BL-STAGING** | K8s cluster + kubeconfig + DNS(`beta.geny.ai`) + TLS | P5 진입 |

이 3 개를 사용자/운영 측이 풀 때마다 다음 phase 가 열린다. P0~P2 는 외부 블로커 없이 진입 가능.

## 2. Phase 진행 트래커

| Phase | 상태 | 예상 세션 | 시작 조건 | 검수 (전부 green 이어야 종료) |
|---|---|---:|---|---|
| **P0** UX wireframe | 🟡 산출물 완료 · 사용자 Q1~Q6 승인 대기 | 1 | ✅ 자율 세션 P0-S1 (2026-04-21) | 사용자 `docs/UX-BETA-WIREFRAME.md §9` Q1~Q6 승인 |
| **P1** 실 픽셀 렌더 | 🟢 **S1~S10 완료** (sprite + atlas slot + slider + motion/expression + per-part binding + sprite pivot/axis split + mount-time auto-preview + atlas pivot_uv optional contract + halfbody/fullbody 전 파츠 pivot_uv 자동 주입 + uv 포맷 회귀 수정 + `?debug=pivots` dev 오버레이 + motion ticker breath ramp 순수 함수 추출(22 node:test 회귀)) | 3~5 | ✅ ADR 0007 Option E Accepted (2026-04-21 P1-S1) | 브라우저에서 aria 실제 픽셀 + slider 변형 실반영 |
| **P2** 프롬프트 UI + Mock e2e | 🟢 **S1+S2+S3+S4+S5+S6 완료** (Generate UI + Mock 생성기 + live swap + 역할별 shape 렌더링 + per-phase timing + β §7 5000ms 예산 시각화 + 구조화 텔레메트리 emit + metric 스키마 14 단위테스트 고정 + `?debug=metrics` dev 패널 (runs·rate·p95·phase 평균 실시간 집계, 순수 집계 함수 9 테스트)) | 2~3 | P1 완료 | Mock 벤더로 프롬프트→프리뷰 5초 내 완결 **— 측정 기반 완결 + P5 log scraper 대비** |
| **P3** 실 nano-banana 통합 | ⚪ 대기 | 3~5 | P2 완료 + BL-VENDOR-KEY | 실 HTTP 호출 10회 중 7회 이상 성공 |
| **P4** 5 슬롯 자동 조립 | ⚪ 대기 | 3~5 | P3 완료 | 프롬프트 1 줄 → 30초 내 5 슬롯 생성 + atlas |
| **P5** staging 배포 | ⚪ 대기 | 2~3 | P4 완료 + BL-STAGING | 외부 네트워크에서 `beta.geny.ai` 시나리오 A 완주 |
| **P6** β 오픈 | ⚪ 대기 | open | P5 완료 | `docs/PRODUCT-BETA.md §7` 6 지표 모두 목표치 |

세부 작업 단위는 `docs/ROADMAP-BETA.md §3` 참조.

## 3. 즉시 다음 액션 (사용자 선택)

> **📋 외부 대기 결정 단일 창구**: [`progress/notes/beta-pending-decisions.md`](../progress/notes/beta-pending-decisions.md) — Q1~Q6 / ADR 0007 / BL-* 전부 이 한 파일 위에서 답변하면 P0~P6 잠금이 순차 해제된다. **최단 β 경로**: Q1~Q6 "전부 기본" + ADR 0007 "Option E" 두 줄이면 P0 ✅ + P1-S1 ~ S5 5 세션이 즉시 open.

**옵션 A (권장)** — β 플랜 리뷰 후 ADR 0007 Accept:

1. 사용자가 `docs/PRODUCT-BETA.md` + `docs/ROADMAP-BETA.md` 리뷰
2. 수정 요청이 있으면 다음 세션에 반영
3. 승인 시 ADR 0007 Option 선택 (권장: **Option E 하이브리드**)
4. P0-S1 (UX wireframe) 세션 착수

**옵션 B** — β 범위 수정:
- MVP 범위 축소 (예: "파라미터 조작만, 텍스처 생성 제외")
- 또는 확대 (fullbody 포함 등)

**옵션 C** — Foundation 유지 + Runtime Spike 만:
- β 대신 내부 Spike 로 렌더러만 검증

## 4. Foundation 기간의 미완료 항목 (β 에 **흡수**)

기존 `progress_0420/PLAN.md` 의 후보들은 β phase 에 맵핑되거나 폐기된다:

| 구 Foundation 후보 | β 처분 |
|---|---|
| 후보 F (Runtime 전환) | → **P1+P2+P3+P4 로 분해**. Runtime phase 단일 덩어리가 아니라 phase 별 점진 진입 |
| 후보 I (Server Headless Renderer ADR) | → P6 이후로 연기 (β 는 클라이언트 렌더) |
| 후보 J (renderer-observer) | → **폐기**. 실 렌더러 합류 후 필요 시점에 Grafana 축으로 흡수 |
| legacy v1.0.0~v1.2.0 opt-in 복제 | → **폐기** (β 는 halfbody v1.3.0 1 종만) |
| v1.3.0→v1.4.0 migrator | → P4 이후 판단 (β 는 v1.3.0 유지) |
| Stage 6 (pivot) 후처리 | → 폐기 (β 는 Stage 1·3 까지만) |
| 실 staging 배포 (구 세션 96) | → **P5 로 맵핑** |
| 실 벤더 분포 캡처 (구 세션 88 D 후속) | → **P3-S4 로 맵핑** |
| BullMQ attempts>1 실 베이스라인 | → P5 이후 (Runtime 검증 단계) |

## 5. 세션 운영 규칙 (β 모드)

1. **자율 loop 없음**. 모든 세션은 사용자 명시 지시 후 착수.
2. 세션 id 는 phase+step 으로 부여: `P1-S1` / `P1-S2` / ... . 기존 "세션 128" 번호 시리즈는 Foundation 연대기로 동결.
3. 브랜치는 phase 단위 feature branch 권장: `feat/p1-renderer-pixi`.
4. 커밋 메시지: `feat(P<phase>-S<step>): <deliverable>` 또는 `fix(P<phase>): <issue>`.
5. 각 phase 종료 시 본 PLAN §2 표 상태 ⚪→🟡 (진행중) →✅ (완료) 로 업데이트.
6. phase 종료 기준은 `docs/ROADMAP-BETA.md §3` 의 해당 phase 검수 기준 **전부 green**. 부분 green 은 종료 아님.
7. 카탈로그/runbook/색인 문서는 **phase 작업 중 발생한 실 도구 필요성에 한해서만** 추가. 사전 정리는 금지.

## 6. 권위 관계

```
docs/PRODUCT-BETA.md       ← 제품 정의 (불변, β 범위 변경 시만 수정)
docs/ROADMAP-BETA.md       ← 실행 로드맵 (phase 완료 시 상태 bump)
progress_0420/PLAN.md      ← 본 문서 (세션 운영 뷰, 매 phase 종료 시 §2 갱신)
progress_0420/INDEX.md     ← 현재 상태 요약 (매 phase 종료 시 §1 단계 cell 갱신)
progress_0420/SUMMARY.md   ← Foundation 역사 (불변, β 완료 후 append-only 블록 추가)
```

## 7. 참조

- [`docs/PRODUCT-BETA.md`](../docs/PRODUCT-BETA.md) — β 제품 정의 9 검수 항목
- [`docs/ROADMAP-BETA.md`](../docs/ROADMAP-BETA.md) — Phase P0~P6 상세
- [`progress/adr/0007-renderer-technology.md`](../progress/adr/0007-renderer-technology.md) — 렌더러 Draft (Decision 대기)
- [`progress/notes/adr-0007-option-diffs.md`](../progress/notes/adr-0007-option-diffs.md) — Option 별 코드 영향 예상
- [`rig-templates/README.md`](../rig-templates/README.md) — 템플릿 5 종 (β 는 halfbody v1.3.0 고정)
