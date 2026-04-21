# progress_0420 — 진척 정리 (2026-04-20 스냅샷)

이 폴더는 세션 1~120 누적 결과를 **읽을 수 있는 크기로** 재정리한 스냅샷이다. 기존 `progress/` 는 한 줄당 수천 토큰까지 부풀어 작업 진입에 부담이 됐다 — 본 폴더는 정밀도를 유지하면서 항해 가능성을 회복한다.

---

## 0. 폴더 맵

| 파일 | 목적 | 갱신 정책 |
|---|---|---|
| `INDEX.md` (이 파일) | 한눈에 보는 현재 상태 + 어디서 무엇을 찾는지 | 매 세션 끝 한 줄 갱신 가능 |
| [`SUMMARY.md`](./SUMMARY.md) | 1~108 세션의 워크스트림별 심층 요약 — "지금까지 무엇을 어떻게 했는가" | 큰 마일스톤 도달 시 append |
| [`PLAN.md`](./PLAN.md) | 앞으로 할 일 — 우선순위·의존성·진입 조건 | 매 세션 시작 전 재평가 |

**보존된 기존 파일** (그대로 활용 — `progress/` 에 남아 있음):
- `progress/sessions/*.md` — 108 세션 원문 로그 (최후의 진실 공급원)
- `progress/adr/*.md` — 0001~0006 의사결정 기록
- `progress/exit-gates/01-single-avatar-e2e.md` — Foundation Exit #1 체크리스트
- `progress/runbooks/01-incident-p1.md` — P1 인시던트 5단계 런북
- `progress/plans/{bullmq-driver-prework,fullbody-v1-authoring}.md` — 사전 설계 문서
- `progress/SESSION_TEMPLATE.md` — 새 세션 작성 템플릿
- `progress/INDEX.md` — **레거시** (참조만, 더 이상 갱신하지 않음 — 본 폴더가 권위)

---

## 1. 현재 상태 (2026-04-21, 세션 120 직후)

| 축 | 상태 | 비고 |
|---|---|---|
| **단계** | Foundation (2026 Q2 초) | docs/14 §3. ADR 0007 Draft 리뷰 대기 + 렌더러 계약 패키지 + Null/Logging 구현체 + web-editor wire-through + Foundation 15 패키지 README 축 완결 + ADR 0007 Option 별 diff 노트 |
| **Foundation Exit 게이트** | **4/4 ✅** | E2E / CI 골든 / 관측 / 온보딩 — 모두 자동 회귀 |
| **릴리스 게이트 (보안/성능/온콜)** | **3/3 ✅** | docs/14 §10 |
| **누적 세션** | 120 (2026-04-17~04-21, 5일) | 자율 모드 |
| **누적 패키지** | **15** packages + 3 apps + 1 service | TypeScript ESM, pnpm workspace. 세션 119 에서 15 패키지 README 문서 축 완결. 세션 120 은 코드 변경 없음 (ADR 0007 Option 별 diff 노트 — `progress/notes/adr-0007-option-diffs.md`) |
| **누적 스크립트** | scripts/ 18 개 + scripts/rig-template/ 4 개 | golden 30 step + bullmq-integration CI lane |
| **CI 게이트** | golden 30 step (validate-schemas checked=244 + 11 패키지 테스트 + 5 e2e) | Foundation lane + bullmq-integration lane. 세션 116 — `web-editor e2e` 에 LoggingRenderer assertion 추가 (halfbody+fullbody 각각 ready→parameterchange→destroy 3-event 스트림 고정) |
| **rig-template-lint rules** | **C1~C14** (meta/dict/params/vertex/cubism-map/family/parts↔params/deformers↔params/tree/parts↔deformers) | 34 테스트 케이스. 세션 112 C14 로 `parts↔parameters↔deformers` 사각형 완결 |
| **migrator 인프라** | `@geny/migrator` (v1.0.0→v1.1.0→v1.2.0→v1.3.0 체인) | 세션 111 — BL-MIGRATOR 해소. 8 단위 테스트 + CLI shim |

---

## 2. 워크스트림 한 줄 상태 (`docs/14 §9` 매핑)

| 스트림 | Foundation 목표 | 한 줄 요약 |
|---|---|---|
| **Rig & Parts** | halfbody v1 손 리깅 | 🟢 halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 저작 완성. 49+10 파라미터, 12+17 PhysicsSetting. 세션 107 에서 `parameter_ids` opt-in 완결 선언 (halfbody 19 파츠 / fullbody 27 파츠). |
| **AI Generation** | nano-banana 어댑터 | 🟡 3 어댑터 (nano-banana 100 / sdxl 80 / flux-fill 70) + Mock + HTTP 클라이언트 + `routeWithFallback` + `MetricsHook` + `SafetyFilter` 계약. 실 벤더 키 분포 캡처는 Runtime. |
| **Post-Processing** | Stage 1·3·6 | 🟡 Stage 1 (alpha 닫힘/feather/UV 클립) + Stage 3 RGB/Lab/palette + atlas-hook. 111 tests. Stage 6 pivot 미착수. |
| **UX (web-editor)** | 에디터 뼈대 | 🟡 3-column 레이아웃 + halfbody/fullbody 템플릿 스위처 + 파츠 사이드바 + Inspector(parameters/motions/expressions 패널) + SVG 구조 렌더러 + 파츠↔하이라이트 양방향 + 파츠-파라미터 뷰 필터. Save/History 는 Runtime. |
| **Platform / Infra** | K8s + CI/CD + 관측 | 🟢 CI 29 step + bullmq-integration lane + Prometheus/Grafana Helm chart + 4단 관측 방어망 (smoke/snapshot/e2e/fallback) + 보안스캔(gitleaks) + 성능 SLO 하네스 + 온콜 런북 + rig-template-lint 14 rules (C14 세션 112 `parts↔deformers`). 실 staging 배포만 외부 의존 대기. |
| **Data** | Postgres/S3/Redis + 스키마 | 🟡 JSON Schema 22종 + Ed25519 license 검증 + adapter/palette 카탈로그. DB/S3 미착수 (Runtime). |
| **Pipeline** | 단일 아바타 DAG | 🟢 exporter-core v0.6.0 + exporter-pipeline + orchestrator-service + worker-generate + job-queue-bullmq + **@geny/migrator (세션 111)**. ADR 0005 L1~L4 게이트 활성. halfbody v1.2.0/v1.3.0 + fullbody v1.0.0 sha256 골든 고정. 세션 119 `job-queue-bullmq` README 신규 + `post-processing` README 재작성 (Stage 1 세션 35 + §6.4/§6.5 세션 32 반영). |
| **Frontend** | 에디터 기본 레이아웃 | 🟢 `<geny-avatar>` 커스텀 엘리먼트 (ready/error/parameterchange/motionstart/expressionchange) + happy-dom 라이프사이클 회귀 + setParameter write-through. 세션 114 `@geny/web-avatar-renderer` 계약 패키지 선행 분리 + 세션 115 Null/Logging 구현체 (테스트 더블, dev/debug) + 세션 116 web-editor `?debug=logger` wire-through (첫 consumer 경로) + 세션 117 계약 패키지 README + 세션 118 인접 3 패키지 README (`@geny/web-editor-logic` · `-editor-renderer` · `web-avatar`). 실 Cubism/WebGL 렌더러는 Runtime. |

🟢 = Foundation 목표 충족 / 🟡 = 진행중·일부만 / 🔴 = 블록 / ⚪ = 미착수

---

## 3. ADR 인덱스

| # | 제목 | 상태 |
|---|---|---|
| [0001](../progress/adr/0001-monorepo-layout.md) | Monorepo + pnpm + Taskfile | Accepted |
| [0002](../progress/adr/0002-schema-first-contract.md) | JSON Schema 2020-12 단일 진실 공급원 | Accepted |
| [0003](../progress/adr/0003-rig-template-versioning.md) | Full-SemVer 디렉터리 (`v1.3.0/`) | Accepted |
| [0004](../progress/adr/0004-avatar-as-data.md) | 참조형 아바타 (메타 + PartInstance) | Accepted |
| [0005](../progress/adr/0005-rig-authoring-gate.md) | 리그 저작 게이트 L1~L4 | Accepted |
| [0006](../progress/adr/0006-queue-persistence.md) | Runtime 큐 = Redis + BullMQ | Accepted |
| [0007](../progress/adr/0007-renderer-technology.md) | 브라우저 런타임 렌더러 기술 선택 (PixiJS / Three / Cubism / 자체 / 하이브리드) | **Draft** — 사용자 리뷰 대기 (세션 113) |

---

## 4. 다음 세션 진입점 (세션 121 후보)

진입 우선순위는 [`PLAN.md §3·§7`](./PLAN.md) 참조. 세션 117~119 문서 축 + 세션 120 ADR 0007 Option diff 노트 로 **문서·분석 축 소진**. 세션 121 자율 후보: (a) golden step runbook / CI step 가독성 정리 / (b) progress_0420 메타 정합성 점검 / (c) 후보 J renderer-observer (ROI 낮음) / 후보 I 보류 (사용자 의사 선행).

**보존 루트 진입점 (ADR 0007 리뷰 대기 중)**:

1. **세션 113 후보 — v1.3.0→v1.4.0 migrator**: 세션 111 skeleton 의 첫 external 확장. `src/migrations/v1-3-0-to-v1-4-0.ts` append + 대상 파츠 결정 필요. 리그 변경 범위가 사전 합의되면 진입. self-contained 폭이 좁고, 저작 스코프 결정(외부) 필요.
2. **세션 97 (Runtime 본격 착수)**: Cubism/WebGL 렌더러 합류 — 큰 세션, 별도 워크스페이스 (`@geny/web-avatar-runtime` 또는 web-editor-renderer 확장). Foundation Exit 4/4 + 릴리스 게이트 3/3 + lint 14 + migrator 인프라가 모두 들어선 지금이 자연 진입점. ADR 0007 (렌더러 기술) 선행.
3. **legacy v1.0.0~v1.2.0 opt-in 복제** — docs/03 §7.3 deprecation 정책(외부) + 세션 111 (b 해소 완료) + Runtime 소비자(세션 97).
4. **세션 96 (staging 배포)**: cluster access 확보 시 — 외부 의존 블록.

자율 모드에선 외부 의존이 없는 범위에서 후보 1 (migrator v1.3.0→v1.4.0) 을 우선 탐색하되, 리그 변경 범위가 미정이면 후보 2 의 ADR 0007 초안을 먼저 쓰는 게 대안.

---

## 5. 자율 운영 규칙

- 사용자 지시: "지시 전까지 세션을 이어 진행하고 매 세션 커밋 후 push" (auto-memory `feedback_autonomous_sessions.md`).
- **세션 종료 절차**: (1) 변경 + 검증 → (2) `progress/sessions/` 에 세션 doc 작성 → (3) 본 `progress_0420/INDEX.md`/`PLAN.md` 갱신 → (4) commit + push → (5) ScheduleWakeup 다음 iteration.
- 세션 번호는 `progress/sessions/YYYY-MM-DD-session-NN-slug.md` 규칙 유지 (현재 109 부터 시작).
- 세션 doc 템플릿: [`progress/SESSION_TEMPLATE.md`](../progress/SESSION_TEMPLATE.md).
