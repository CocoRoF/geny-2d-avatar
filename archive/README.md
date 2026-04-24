# Archive

2026-04-24 스코프 리셋 이전의 자료. 현 스코프 (프리셋 카탈로그 + 텍스처 생성 + Web UI) 에 직접 해당하지 않지만, 설계 판단·데이터 계약·역사적 맥락을 보려면 여기를 참고.

**현 유효 문서**: 리포 루트의 [`docs/`](../docs/) — `docs/00-GOAL.md` 부터 `05-EXECUTION-PLAN.md` 까지가 권위. 이 아카이브는 참고 자료일 뿐.

**스코프 차이 요약**:

| 항목 | 이전 스코프 | 현 스코프 |
|---|---|---|
| 뼈대 | AI 가 파츠를 그리고 자동 피팅 | 프리셋으로 제공 (고정). mao_pro 포함 여러 개 |
| 생성 단위 | 파츠별 (hair_front, eye_iris, ...) | 텍스처 (아틀라스 PNG) |
| 제품 형태 | 플랫폼 / 서비스 | Web UI |
| 핵심 등식 | 프롬프트 → 파츠들 → 자동 조립 → 아바타 | 텍스처 + 프리셋 = Live2D 모델 |

---

## `docs/` — 이전 플랫폼 스코프 설계 문서 (18건)

| 파일 | 주제 | 현 스코프에서의 가치 |
|---|---|---|
| `02-system-architecture.md` | 전체 플랫폼 아키텍처 | 레이어 분할·결정론 규약 참고 |
| `03-rig-template-spec.md` | rig-template 디렉토리 스펙 | 여전히 유효 — `docs/01` 에서 요약 |
| `04-parts-specification.md` | 파츠 분해 규약 | 슬롯 설계 참고 |
| `05-ai-generation-pipeline.md` | AI 파츠 생성 파이프라인 | **텍스처 생성에 벤더 라우팅·폴백 설계 그대로 재활용** |
| `06-post-processing-pipeline.md` | 파츠 후처리 | 텍스처 슬롯 간 블렌딩에 참고 (Phase 3) |
| `07-auto-fitting-system.md` | 파츠 자동 피팅 | 대부분 OFF-GOAL — 프리셋 고정이므로 피팅 불필요 |
| `08-validation-and-rendering.md` | 검증·렌더 규약 | test_poses·golden 회귀 여전히 유효 |
| `10-customization-workflow.md` | 사용자 커스터마이징 UX | Phase 5 UI 설계에 참고 |
| `11-export-and-deployment.md` | Cubism / Web 번들 export | **그대로 유효** — `@geny/exporter-core` 동작 근거 |
| `12-data-schema-and-api.md` | 데이터 스키마·API | 여전히 유효 — `schema/v1/` 이 권위 |
| `13-tech-stack.md` | 기술 스택 | 여전히 유효 |
| `15-quality-assurance.md` | QA 전략 | 회귀·스모크 테스트 접근 참고 |
| `01` / `09` / `14` / `16` / `17` / `18` | 비전·UX·로드맵·수익화·리스크·용어 | 이전 스코프 전제라 구식. 역사적 레퍼런스용 |

## `scripts/` — OFF-GOAL 개발·CI 스크립트 (2026-04-24 P0.3.1)

β 관측 스택 + 마이그레이터 + mock-vendor. 현 스코프 밖.

| 파일 | 이전 용도 | 복귀 조건 |
|---|---|---|
| `observability-e2e.mjs`, `observability-smoke.mjs` (+ .test.mjs) | Prometheus exposition e2e + 파서 회귀 | Phase 6 배포 + 실 관측 연결 시 |
| `observability-fallback-validate.mjs` (+ .test.mjs) | fallback 경로 관측 검증 (1-hop/2-hop/terminal/unsafe) | 자동 폴백 복귀 시 |
| `observability-snapshot-diff.mjs` (+ .test.mjs) | 관측 exposition structural drift 검사 | 동일 |
| `perf-harness.mjs` (+ .test.mjs), `perf-sweep-concurrency.mjs` | 성능 SLO 하네스 — worker-generate in-process 기동 | 비동기 워커 복귀 시 |
| `mock-vendor-server.mjs` (+ .test.mjs) | nano-banana/sdxl/flux-fill HTTP 재현 서버 | 다중 벤더 통합 테스트 재활성화 시 |
| `sync-observability-chart.mjs`, `verify-observability-chart.mjs` | Helm chart ↔ 선언형 config 동기화 | observability Helm 복귀 시 |
| `rig-template/migrate.mjs` (+ .test.mjs) | rig 템플릿 버전 마이그레이션 체인 | 프리셋 코드 레벨 마이그레이션 필요 시 |

## `rig-templates/halfbody/` — halfbody 구버전 (2026-04-24 P0.3.3)

| 버전 | 상태 |
|---|---|
| `v1.0.0`, `v1.1.0`, `v1.2.0` | 이전 iteration. 현 스코프에서는 **v1.3.0 만 활성**. 구버전은 레퍼런스로 보존 (설계 진화 추적용). |

v1.3.0 이 12/16 PhysicsSetting 을 mao_pro 기준으로 달성한 최종 버전. 신규 derived preset 저작 시에는 mao_pro 레퍼런스 + v1.3.0 구조를 참고 (→ `docs/01-RIG-PRESET.md §6`).

## `infra/` — OFF-GOAL 배포 인프라 (2026-04-24 P0.3.1)

| 디렉토리 | 이전 용도 | 복귀 조건 |
|---|---|---|
| `helm/worker-generate/` | 큐 기반 생성 워커 Helm chart | 비동기 워커 복귀 시 |
| `helm/observability/` | Prometheus/Grafana Helm chart | 관측 스택 복귀 시 |
| `helm/redis/` | Redis Helm chart | 큐/캐시 용도 복귀 시 |
| `observability/` | Prometheus scrape config + Grafana 대시보드 + smoke snapshot 6종 | 관측 스택 복귀 시 |
| `docker-compose.staging.yml` | staging dev 용 compose | staging 재시작 시 |

Phase 6 배포 착수 시 그대로 복귀 금지 — 새 스코프 (프리셋+텍스처+Web UI) 에 맞춰 재설계.

---

## `progress_old/` — 세션 로그 · ADR · 런북

| 디렉토리 | 내용 |
|---|---|
| `adr/` | 0001 monorepo-layout · 0002 schema-first · 0003 rig-template-versioning · 0004 avatar-as-data · 0005 rig-authoring-gate · 0006 queue-persistence · 0007 renderer-technology |
| `sessions/` | 2026-04-17 ~ 2026-04-24 의 구현 세션 로그 (150+ 건). Foundation/β Platform 단계 기록 |
| `runbooks/` | CI·스키마 검증·Rig template lint 절차 |
| `plans/` | 사전 계획 (fullbody authoring, bullmq driver prework) |
| `notes/` | ADR 0007 옵션 비교, β pending decisions |
| `exit-gates/` | Foundation single-avatar E2E 게이트 |
| `INDEX.md` | 세션 마스터 인덱스 + 누적 산출물 맵 |
| `snapshot-0420/SUMMARY.md` | 2026-04-20 시점 프로젝트 상태 스냅샷 |

## 현 스코프에서 여전히 참고할 만한 것 (요약)

- **ADR 0001–0002, 0004**: 모노레포 / 스키마-퍼스트 / 아바타-as-데이터 원칙 — 그대로 유효
- **ADR 0005**: 리그 authoring gate L1~L4 — 프리셋 저작 검증 절차 재활용
- **ADR 0007**: 렌더러 기술 선정 (PixiJS) — 그대로 유효
- **docs/05 AI 생성 파이프라인**: 어댑터 라우팅·폴백·캐시·provenance — **텍스처 생성기 설계에 재활용**
- **docs/11 Export**: Cubism / Web 번들 포맷 — `exporter-core` 의 기준
- **docs/12 Schema**: 스키마 목록과 의도

---

## 삭제된 파일 (참고)

리셋 시 "확실한 노이즈"로 판단되어 삭제:

- `docs/index.md` — 단순 목차
- `docs/PRODUCT-BETA.md`, `ROADMAP-BETA.md`, `UX-BETA-WIREFRAME.md` — β Platform 제품 기획 (전혀 다른 스코프)
- `progress/SESSION_TEMPLATE.md` — 빈 템플릿
- `progress_0420/INDEX.md`, `PLAN.md` — 구식 인덱스·계획
