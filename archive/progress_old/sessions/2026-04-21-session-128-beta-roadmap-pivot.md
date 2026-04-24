# 세션 128 — β 로드맵 모드 전환 (2026-04-21)

## 1. 트리거

사용자 지시 (2026-04-21, 세션 127 자율 종료 + 마무리 리포트 직후):

> "좋아 그러면 이제 완전히 새롭게 docs를 다시 작성해서 향후 계획을 완벽하게 플랜을 만들어야만 해. 특히 우리는 google의 nano-banana와 같은 실제 이미지 생성 모델을 통해서, 현재 뼈대에 실제 텍스처를 생성하는 기능을 웹의 형태로 완벽하게 제공해야만 해 (사용자는 프롬프트를 넣고, 올바른 뼈대의 텍스처를 만드는 것). 이런 기능이 현재 제대로 작동하는지 전혀 프로덕션 레벨에서 볼 수 없다는 치명적인 문제가 있는거잖아. 저런 불필요한 이상한 문서 정리는 그만하고 정확하게 프로덕션의 퀄리티 및 기능적 성숙도를 향상시키기 위해 노력해야만 해. 그것에 집중한 새로운 플랜을 만들고 볼 수 있게 만들어 놔."

## 2. 결정 요약

Foundation 단계(세션 1~127) 가 닫힌 상태에서 **β 로드맵 모드로 완전 전환**. 카탈로그/색인 축의 Foundation 적법성은 인정하되, 추가 문서 정리는 실 제품 가시성을 진전시키지 못한다는 사용자 판단에 따라 **중단**. 다음 축은 일관되게 "프롬프트 → 텍스처 → 실 픽셀 프리뷰 → staging URL" 흐름만 추적한다.

## 3. 산출물

### 3.1 `docs/PRODUCT-BETA.md` (신설, 약 124 줄)

β 제품 정의 문서. 9 개 섹션:
- §1 한 줄 정의: "프롬프트 → 텍스처 → 아바타 프리뷰 (30초 내)"
- §2 3 시나리오 (Creator / 실패 경로 / 파라미터만 조작)
- §3 **9 릴리스 검수 기준** — 실 픽셀 / 프롬프트 UI / 실 벤더 호출 / UV 매핑 / 파라미터 반영 / staging URL / 관측 실 동작 / 성공률 70% / p95 30초
- §4 MVP 포함 (halfbody v1.3.0 / nano-banana+sdxl / 5 슬롯 / staging 1 URL)
- §5 MVP 제외 (fullbody / 저장 / 계정 / 3D / 모바일 / 커스텀 어댑터)
- §6 의존성 (ADR 0007 Decision / BL-VENDOR-KEY / BL-STAGING / 예산 / legal)
- §7 6 지표 (p95 / 성공률 / fallback / 동시 접속 / 비용 / 실패율)
- §8 Foundation↔β 경계 표
- §9 참조

### 3.2 `docs/ROADMAP-BETA.md` (신설, 약 240 줄)

Phase P0~P6 실행 로드맵. phase 별 step 단위 분해:
- **P0** UX wireframe — 1 세션, 사용자 승인
- **P1** 실 픽셀 렌더 — P1-S1 (패키지 scaffold) / S2 (단일 파츠) / S3 (전 파츠) / S4 (setParameter 변형) / S5 (web-editor wire-through)
- **P2** 프롬프트 UI + Mock e2e — Generate 패널 / orchestrator HTTP / Mock 통합 / state machine
- **P3** 실 nano-banana — vendor key / 프롬프트 템플릿 / 첫 실 호출 / 비용·지연 캡처 / 1-hop fallback
- **P4** 5 슬롯 자동 조립 — texture-orchestrator / 파츠별 템플릿 / style consistency / atlas 자동화 / 품질 체크
- **P5** staging 배포 — kubeconfig / Helm / DNS+TLS / Prometheus scrape / Grafana
- **P6** β 오픈 (open-ended) — §7 6 지표 달성
- §4 cross-phase 축 (관측/성능/보안/비용)
- §5 blocker map
- §6 세션 운영 규칙

### 3.3 `progress_0420/PLAN.md` (재작성)

Foundation 버전 폐기 후 β 세션 운영 뷰로 재작성:
- §0 현재 상태 (Foundation ✅, β Phase P0 대기)
- §1 외부 블로커 3 축
- §2 Phase 진행 트래커 표 (P0~P6, 상태 / 예상 세션 / 시작 조건 / 검수)
- §3 즉시 다음 액션 (3 옵션 — A 권장 ADR 0007 Accept / B 범위 수정 / C Runtime Spike 만)
- §4 Foundation 후보 → β 매핑 표 (흡수 / 폐기 / 연기)
- §5 β 세션 운영 규칙 (자율 OFF / phase+step ID / feature branch)
- §6 권위 관계 다이어그램
- §7 참조

### 3.4 색인 문서

- **`progress_0420/INDEX.md` §1·§2·§4·§5 재작성** — 단계 cell "β 로드맵 모드 진입 대기", 누적 세션 127→128, §4 는 phase 진입 조건 표로 교체, §5 β 세션 운영 규칙.

### 3.5 Memory

- **`project_foundation_state.md` 재작성** — "Foundation 진척" → "β 로드맵 모드 진입" 으로 프레임 전환. Foundation 재사용 자원 + β 신설 범위 + phase 구조 + 외부 블로커 + Foundation 후보 매핑 표 전체 기록.

## 4. 제외된 것 (Foundation 흡수 매핑)

| Foundation 후보 | β 처분 |
|---|---|
| 후보 F (Runtime 전환) | **P1+P2+P3+P4 로 분해** |
| 후보 I (Server Headless Renderer ADR) | P6 이후 연기 |
| 후보 J (renderer-observer) | **폐기** |
| legacy v1.0.0~v1.2.0 opt-in 복제 | **폐기** (β 는 halfbody v1.3.0 1 종) |
| v1.3.0→v1.4.0 migrator | P4 이후 판단 |
| Stage 6 pivot | **폐기** (β 는 Stage 1·3 까지) |
| 실 staging 배포 (세션 96) | **P5 맵핑** |
| 실 벤더 분포 캡처 (세션 88 D 후속) | **P3-S4 맵핑** |
| BullMQ attempts>1 실 베이스라인 | P5 이후 |

## 5. 불변 / 보존 항목

- Foundation 세션 로그 `progress/sessions/2026-04-17-session-001-*` ~ `-session-127-*` 전부 보존 (역사).
- `progress_0420/SUMMARY.md` 는 Foundation 역사 불변 기록. β 완료 후 append-only 블록 추가.
- `progress/adr/0001~0006` Accepted 상태 유지. ADR 0007 은 사용자 Decision 대기.
- `rig-templates/*` 5 템플릿 JSON + 스키마 22 + lint C1~C14 전부 재사용.
- `CLAUDE.md` 없음 (이 저장소는 사용자 auto-memory 로 운영).

## 6. 세션 번호 / 네이밍

- 이 세션은 Foundation 연대기 **128** 번. Foundation 시리즈는 이 번호에서 동결.
- 다음 세션부터 phase+step ID: `P0-S1`, `P1-S1`, ... . 파일명도 `progress/sessions/YYYY-MM-DD-P<phase>-S<step>-<slug>.md`.
- 브랜치 네이밍: `feat/p1-renderer-pixi` 같이 phase 단위 feature branch 권장.
- 커밋 prefix: `feat(P<phase>-S<step>): <deliverable>` / `fix(P<phase>): <issue>` / `docs(P<phase>):` 등.

## 7. 자율 모드 상태

- 자율 loop **OFF** (세션 127 직후 사용자 지시로 종료, `memory/feedback_autonomous_mode_closed.md` 참조).
- 본 세션 128 은 사용자 명시 지시 (β 플랜 재작성) 로 수행 — 자율 재진입 아님.
- 다음 세션도 사용자가 구체 phase+step 지시해야 착수.

## 8. 검증

- 신규/변경 파일 4 종 모두 Markdown 규약 준수 확인 (heading 계층 / 표 pipe 정렬).
- `docs/PRODUCT-BETA.md` 9 검수 기준이 `docs/ROADMAP-BETA.md` phase 검수 기준에 전부 매핑됨을 확인.
- `progress_0420/PLAN.md §2` 표의 "시작 조건" / "검수" 두 열이 ROADMAP-BETA 의 해당 phase 와 일치.
- Foundation 자원 claim (`14 packages + 3 apps + 1 service / golden 30 step / schema 22 / rig-template-lint C1~C14 / rig templates 5`) 은 `INDEX.md §1` 와 일관.
- 코드 변경 0. doc-only 세션.

## 9. 다음 액션 (사용자 선택)

**옵션 A (권장)** — β 플랜 리뷰 후 ADR 0007 Accept:
1. `docs/PRODUCT-BETA.md` + `docs/ROADMAP-BETA.md` 리뷰
2. 수정 요청이 있으면 다음 세션에서 반영
3. 승인 후 ADR 0007 Option E (하이브리드, 권장) Accept
4. P0-S1 (UX wireframe) 세션 착수 지시

**옵션 B** — β 범위 조정:
- MVP 축소 (예: "파라미터 조작만, 텍스처 생성 제외")
- 또는 확대 (fullbody 포함 등)

**옵션 C** — Foundation 유지 + Runtime Spike 만:
- β 대신 내부 Runtime 검증만

## 10. 참조

- [`docs/PRODUCT-BETA.md`](../../docs/PRODUCT-BETA.md)
- [`docs/ROADMAP-BETA.md`](../../docs/ROADMAP-BETA.md)
- [`progress_0420/PLAN.md`](../../progress_0420/PLAN.md)
- [`progress_0420/INDEX.md`](../../progress_0420/INDEX.md)
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — Decision 대기
- [`progress/notes/adr-0007-option-diffs.md`](../notes/adr-0007-option-diffs.md)
- 이전 세션: [`2026-04-21-session-127-exhaustion-reconfirmation.md`](./2026-04-21-session-127-exhaustion-reconfirmation.md)
