# progress_0420 — 진척 정리 (2026-04-20 스냅샷)

이 폴더는 세션 1~122 누적 결과를 **읽을 수 있는 크기로** 재정리한 스냅샷이다. 기존 `progress/` 는 한 줄당 수천 토큰까지 부풀어 작업 진입에 부담이 됐다 — 본 폴더는 정밀도를 유지하면서 항해 가능성을 회복한다.

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

## 1. 현재 상태 (2026-04-21, P1-S5 직후 — **β Phase P1 🟢 실질 완료 · P2 🟡 S1 완료**)

| 축 | 상태 | 비고 |
|---|---|---|
| **단계** | **β Phase P1 🟢 (S1+S2+S3+S4+S5 완료) + P2 🟡 (S1 완료)** (Foundation ✅ 종료, P0 UX wireframe 산출물 완료 · Q1~Q6 사용자 승인은 비차단 대기) | P1-S5 (2026-04-21) — **시각 정확성 보강**. (1) sprite.anchor=0.5 로 rotation 피벗이 sprite 중심 (이전 top-left → Mock 체감 깨짐 해소). (2) `transformFromParameter` Cubism 3 축 분리 — angle_x→offsetY (pitch Mock, 30deg→12px), angle_y→offsetX (yaw Mock, 30deg→12px), angle_z→rotation (roll 실 2D 회전). P1-S4 에서 모든 angle 이 rotation 으로 collapse 되던 문제 해소. 31/31 pixi test pass (+1 축 분리 명시 검증). 데이터 배선 검증: rig-templates/halfbody-v1.3.0 parts 에 parameter_ids 이미 기입 (face_base: head_angle_x/y/z, ahoge: ahoge_sway, hair_side_l: hair_side_sway_l/fuwa_l 등). P1-S4 (2026-04-21) — parts 별 parameter 바인딩 개통 + paramToSlots 역색인 + partEntries baseline. P1-S3 — motion/expression 바인딩. P1-S2+P2-S1 — atlas UV 파생 + 실 sprite + Generate bar. P1-S1 — ADR 0007 Option E Accepted + pixi 패키지 scaffold. |
| **Foundation Exit 게이트** | **4/4 ✅** | E2E / CI 골든 / 관측 / 온보딩 — 모두 자동 회귀 |
| **릴리스 게이트 (보안/성능/온콜)** | **3/3 ✅** | docs/14 §10 |
| **누적 세션** | 128 Foundation + P0-S1 + P1-S1 + P1-S2+P2-S1 + P1-S3 + P1-S4 + P1-S5 (2026-04-17~04-21, 5일) | Foundation 연대기 1~127 동결. 128 β 모드 전환 이후는 phase+step ID (`P0-S1` / `P1-S1` / `P1-S2+P2-S1` / `P1-S3` / `P1-S4` / `P1-S5`...). |
| **누적 패키지** | **15** packages + 3 apps + 1 service | TypeScript ESM, pnpm workspace. P1-S1 에서 `@geny/web-avatar-renderer-pixi` 합류 (14 → 15). P1-S2~S4 에선 기존 2 패키지 확장만 (renderer contract atlas+motion+expression+parameter_ids 필드 + renderer-pixi sprite/regenerate/motion/expression/per-part binding). |
| **누적 스크립트** | scripts/ 18 개 + scripts/rig-template/ 4 개 | golden 30 step + bullmq-integration CI lane |
| **CI 게이트** | golden 30 step (schema 1 + CLI 번들 3 + 패키지 16 + 스크립트·infra 8 + 앱 e2e 2) | Foundation lane + bullmq-integration lane. 세션 116 — `web-editor e2e` 에 LoggingRenderer assertion 추가. 세션 122 `progress/runbooks/02-golden-step-catalog.md` 로 30 step 의 보장·의존성·도입 색인 고정 |
| **스키마 카탈로그** | **22 계약** (v1 21 + common/ids 1) | `schema/README.md` — 7 그룹 × 4-라인 (보장/소비자/Docs/도입). 세션 123 재작성 — placeholder 2 제거 + examples/ 언급 제거 + 누락 8 추가. `validate-schemas.mjs checked=244 failed=0` |
| **rig-template-lint rules** | **C1~C14** (meta/dict/params/vertex/cubism-map/family/parts↔params/deformers↔params/tree/parts↔deformers) | 34 테스트 케이스. 세션 112 C14 로 `parts↔parameters↔deformers` 사각형 완결 |
| **migrator 인프라** | `@geny/migrator` (v1.0.0→v1.1.0→v1.2.0→v1.3.0 체인) | 세션 111 — BL-MIGRATOR 해소. 8 단위 테스트 + CLI shim |

---

## 2. 워크스트림 한 줄 상태 (`docs/14 §9` 매핑)

| 스트림 | Foundation 목표 | 한 줄 요약 |
|---|---|---|
| **Rig & Parts** | halfbody v1 손 리깅 | 🟢 halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 저작 완성. **50+10 파라미터** (halfbody v1.3.0 50 공유 + fullbody 전용 10, JSON 실측 — 버전 narrative README 는 `overall_*` 제외 -1 표기), **12+17 PhysicsSetting**. 세션 107 에서 `parameter_ids` opt-in 완결 선언 (halfbody 19/30 파츠 / fullbody 27/38 파츠). 세션 125 `rig-templates/README.md` 재작성 — 5 템플릿 JSON 실측 카탈로그. |
| **AI Generation** | nano-banana 어댑터 | 🟡 3 어댑터 (nano-banana 100 / sdxl 80 / flux-fill 70) + Mock + HTTP 클라이언트 + `routeWithFallback` + `MetricsHook` + `SafetyFilter` 계약. 실 벤더 키 분포 캡처는 Runtime. |
| **Post-Processing** | Stage 1·3·6 | 🟡 Stage 1 (alpha 닫힘/feather/UV 클립) + Stage 3 RGB/Lab/palette + atlas-hook. 111 tests. Stage 6 pivot 미착수. |
| **UX (web-editor)** | 에디터 뼈대 | 🟡 3-column 레이아웃 + halfbody/fullbody 템플릿 스위처 + 파츠 사이드바 + Inspector(parameters/motions/expressions 패널) + SVG 구조 렌더러 + 파츠↔하이라이트 양방향 + 파츠-파라미터 뷰 필터. Save/History 는 Runtime. |
| **Platform / Infra** | K8s + CI/CD + 관측 | 🟢 CI 30 step + bullmq-integration lane + Prometheus/Grafana Helm chart + 4단 관측 방어망 (smoke/snapshot/e2e/fallback) + 보안스캔(gitleaks) + 성능 SLO 하네스 + 온콜 런북 **3 종** (01 P1 인시던트 + 02 golden step 카탈로그 + 03 rig-template-lint 규칙) + rig-template-lint 14 rules (C14 세션 112 `parts↔deformers`, 색인 세션 124). 실 staging 배포만 외부 의존 대기. |
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

## 4. 다음 세션 진입점 (β 로드맵 모드)

**권위 문서 이동**: 진입점 우선순위는 이제 [`docs/ROADMAP-BETA.md §3`](../docs/ROADMAP-BETA.md) + [`PLAN.md §2·§3`](./PLAN.md) 이 권위. 본 §4 는 요약만 유지.

**현재 진입 대기**:

| Phase | 착수 조건 | 내용 |
|---|---|---|
| **P0** UX wireframe | ✅ 자율 세션 P0-S1 완료 · 🟡 사용자 Q1~Q6 승인 대기 | `docs/UX-BETA-WIREFRAME.md` 산출. 12 섹션 × Generate bar / 5 pill 진행 / 에러 5 카테고리 KO·EN / 09 UX diff |
| **P1** 실 픽셀 렌더 (3~5 세션) | ADR 0007 Accepted | `@geny/web-avatar-renderer-pixi` + 실제 `<canvas>` 픽셀 |
| **P2** 프롬프트 UI + Mock e2e | P1 완료 | Generate 패널 + orchestrator HTTP + Mock 벤더 end-to-end |
| **P3** 실 nano-banana | P2 + BL-VENDOR-KEY | 실 HTTPS POST + 비용/지연 실측 + 1-hop fallback |
| **P4** 5 슬롯 자동 조립 | P3 완료 | texture-orchestrator 패키지 + atlas 자동화 |
| **P5** staging 배포 | P4 + BL-STAGING | `beta.geny.ai` + 실 관측 스크레이프 |
| **P6** β 오픈 | P5 완료 | `PRODUCT-BETA §7` 6 지표 목표 달성 |

**외부 블로커 3 축** (사용자/운영 해제 대기):
1. **ADR 0007 Decision** — Option E 하이브리드 권장 (PixiJS primary + 자체 미니 Cubism 선택)
2. **BL-VENDOR-KEY** — GCP 프로젝트 + Gemini API 키 + quota
3. **BL-STAGING** — K8s cluster + kubeconfig + DNS (`beta.geny.ai`) + TLS

Foundation 연대기 진입점(migrator v1.4.0 / Stage 6 / legacy opt-in / renderer-observer)은 **β phase 에 흡수 또는 폐기** — 매핑 표는 [`PLAN.md §4`](./PLAN.md) 참조.

---

## 5. 세션 운영 규칙 (β 모드)

- **자율 loop OFF** (세션 127 종료). 모든 세션은 사용자 명시 지시로 착수.
- 세션 id 는 phase+step: `P1-S1` / `P1-S2` / ... . Foundation "세션 NN" 번호(1~128)는 연대기로 동결.
- 브랜치: phase 단위 feature branch 권장 (`feat/p1-renderer-pixi`).
- 커밋 메시지: `feat(P<phase>-S<step>): <deliverable>` 또는 `fix(P<phase>): <issue>`.
- 세션 doc 경로: `progress/sessions/YYYY-MM-DD-P<phase>-S<step>-<slug>.md`.
- Phase 종료 시 본 `INDEX.md §1` + [`PLAN.md §2`](./PLAN.md) 상태 bump (⚪→🟡→✅).
- Foundation 카탈로그/runbook/색인 사전 정리 금지 — 실 도구 필요 발생 시만 추가.
