# Session 17 — 관측 대시보드 3종 뼈대 (Foundation Exit #3 config)

- **Date**: 2026-04-18
- **Workstreams**: Platform / Infra
- **Linked docs**: `docs/02 §9` (Observability — 삼각 측정 / 3 대시보드 / 3 알람), `docs/13 §7.4` (스택), `docs/14 §3.3` (Foundation Exit)
- **Linked ADRs**: 신규 없음
- **Previous**: 세션 16 — 개발자 온보딩 1일 (commit `31ca994`)

---

## 1. 목표 (Goals)

- [x] `infra/observability/` 디렉터리 신설 — Prometheus/Grafana 선언형 config 의 단일 진실 공급원.
- [x] `metrics-catalog.md` — 9 섹션 메트릭 정의 (Job / Worker / AI / Cost / Cache / Quality / API / Export / Process).
- [x] `prometheus/prometheus.yml` — 7 job scrape 스켈레톤 (self + api + orchestrator + worker-{cpu,gpu,ai} + exporter).
- [x] `prometheus/rules/alerts.yml` — docs/02 §9.3 의 3 알람 (완주율 / AI 5xx / 큐 길이).
- [x] `grafana/dashboards/*.json` — 3종 (01 Job Health · 02 Cost · 03 Quality).
- [x] `infra/README.md` — observability 행 추가.
- [x] `progress/INDEX.md` — 세션 17 row · Platform/Infra 상태 · Foundation Exit #3 상태 갱신.

### 범위 경계 (의도적으로 하지 않은 것)

- **Helm chart (`infra/helm/observability/`)**: 쿠버네티스 배포 manifest 는 Platform 워크스트림 별도 세션. 본 세션은 **선언형 config 만**.
- **서비스 코드에서 실제 메트릭 emit**: 카탈로그가 정의한 메트릭을 코드에서 등록·노출하는 것은 해당 서비스(api/worker/exporter) 구현 시점에 수행. 현재 `apps/services/` 는 스켈레톤 단계.
- **Recording rule**: 알람이 참조하는 PromQL 이 단순하므로 Foundation 단계에서는 불필요. 고비용 쿼리가 축적되면 후속 세션에서 추가.
- **Alertmanager 설정 (PagerDuty/Slack 경로)**: 실제 라우팅은 SaaS 토큰 필요 — 배포 세션으로 연기. 여기서는 `severity: P1|P2` 라벨만 정의.
- **OTel collector / Tempo**: Traces 파이프는 세션 17 범위 밖 (docs/02 §9.1 Traces 항목).
- **Sentry config**: 역시 범위 밖 (SaaS, 프런트 구현 시점).

## 2. 사전 맥락 (Context)

- **Foundation Exit #3 은 docs/14 §3.3 의 "관측 대시보드 3종 기본 동작"**. 본 세션은 **config 를 만드는 것** 까지. "기본 동작" = 실제 Prometheus/Grafana 에 올라가 지표가 쌓일 때 완료 처리 — 따라서 INDEX 의 체크박스는 **현재도 미체크**, 단 "진행 중/config 완" 주석을 단다.
- **docs/02 §9 의 공식 구조가 고정값**. 본 카탈로그·대시보드·알람은 모두 `docs/02 §9.2`·`§9.3` 의 항목과 1:1 대응. 이탈하려면 ADR 가 필요.
- **INDEX §8 의 대안**: "발급자 공개키 레지스트리 + license.verify 엔드포인트" 가 있었으나, Foundation Exit #3 이 1:4 → 2:4 전환의 **직접 경로**이고 공개키 레지스트리는 Exit 게이트에 없는 선택지 — 세션 17 은 observability 로 확정.
- **메트릭 이름 규칙은 세션 13b 의 교훈 연장**: 코드가 먼저면 이름이 표류. 따라서 카탈로그를 먼저 고정하고 코드는 이를 따르도록 한다 (docs/02 §9.1).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 디렉터리 README | `infra/observability/README.md` | 구조 · 배포 · 알람 채널 · docs 링크 4 섹션. | 🟢 |
| 메트릭 카탈로그 | `infra/observability/metrics-catalog.md` | 9 섹션, 메트릭 32개 정의, PromQL 파생 예시 3개, 고카디널리티 금지 규칙. | 🟢 |
| Prometheus scrape | `infra/observability/prometheus/prometheus.yml` | 7 job, global 15s, external_labels(cluster/environment). | 🟢 |
| Prometheus rules | `infra/observability/prometheus/rules/alerts.yml` | docs/02 §9.3 의 3 알람 그룹(geny.job / geny.ai / geny.worker), P1/P2 severity 라벨 + runbook annotation. | 🟢 |
| 대시보드 #1 | `infra/observability/grafana/dashboards/01-job-health.json` | WSAC / 완주율 / inflight / 완주율 추이 / TTFE p50/p90/p99 / 실패 상위10 (6 panel). JSON parse OK. | 🟢 |
| 대시보드 #2 | `infra/observability/grafana/dashboards/02-cost.json` | USD/h / per avatar / 캐시 적중률 / 벤더별 호출·비용 stacked / 예산 사용률 (6 panel). JSON parse OK. | 🟢 |
| 대시보드 #3 | `infra/observability/grafana/dashboards/03-quality.json` | 점수 중앙값 / 재생성율 / 사람 리뷰율 / 점수 분포 heatmap / 재생성 트리거 분해 / LPIPS gauge / 리뷰 원인 topk (7 panel). JSON parse OK. | 🟢 |
| infra README | `infra/README.md` | observability 행 + 세션 17 context 1줄. | 🟢 |
| INDEX | `progress/INDEX.md` | 세션 17 row, Platform/Infra 🟡, Foundation Exit #3 "config 완 / runtime 대기" 주석, 다음 3세션 재배열. | 🟢 |
| 세션 로그 | 본 파일 | 9 섹션. | 🟢 |

## 4. 결정 (Decisions)

- **D1 (docs/02 §9 를 1:1 로 복제)**: 카탈로그·대시보드·알람 항목은 모두 §9.2/§9.3 에 등장하는 3+3 항목을 **구조적으로** 반영. 임의의 지표·대시보드를 추가로 넣지 않는다. *장점*: 기획 ↔ 구현 정합 유지 — 다음 기획 변경이 그대로 구현에 반영됨. *단점*: 실 운영 초기에 누락이 드러날 수 있으나, 그때는 docs 와 함께 업데이트.
- **D2 (저카디널리티 라벨 엄수 — `job_id/user_id/avatar_id` 는 메트릭 라벨 금지)**: 카디널리티 폭발은 Prometheus 의 가장 흔한 장애 원인. 해당 식별자는 logs/traces 로만 이동 — 카탈로그 §0 · §READ me 에 명시. PR 리뷰 시 강제 규칙.
- **D3 (메트릭 이름 `geny_<category>_<name>_<unit>`)**: `geny_` 프리픽스는 Cortex/Thanos 다테넌시 대비 필수. unit suffix (`_seconds`, `_bytes`, `_total`, `_ratio`) 는 Prometheus 관행. 위반 시 PR 에서 리젝트.
- **D4 (알람은 `for: 10m` 필수)**: docs/02 §9.3 의 모든 알람이 "10분 지속" 조건. 스파이크 false-positive 방지 — `for` 를 생략하면 flap 발생. 규칙 작성 규칙으로 고정.
- **D5 (완주율 하락 알람은 `offset 10m` 기반)**: 절대치가 아닌 "직전 대비 -15%p" 이므로 동일 쿼리의 offset 비교로 구현. 베이스라인이 낮은 시간대(야간) 에서도 올바르게 동작.
- **D6 (Grafana schemaVersion=39, Grafana 10+)**: 제품 최신 LTS 대응. 구버전(Grafana 8/9) 호환은 제공하지 않음 — 내부 배포 전제.
- **D7 (대시보드 각각이 "질문 하나"에 답)**: #1 "완주율이 떨어지고 있나?", #2 "돈이 얼마나 새고 있나?", #3 "품질 시스템이 일하고 있나?" — 3개의 질문을 README.md 설계 원칙에 명시. 추가 대시보드는 새 질문이 있을 때만.
- **D8 (datasource UID 는 `"prometheus"` 하드코딩)**: Helm provisioning 시 `datasources.yaml` 에 동일 UID 로 선언한다는 전제. 변수화(`${DS_PROMETHEUS}`) 는 import 워크플로 시 필요하지만 파일 기반 provisioning 에서는 고정이 단순.
- **D9 (runtime 동작은 이번 세션에 포함하지 않음)**: Foundation Exit #3 의 "기본 동작" 정의를 엄격히 하면 실 배포가 필요. 단일 개발자 autonomous 흐름에서 K8s 클러스터 없이 평가할 수 없으므로 본 세션은 **config 완료 → INDEX 에 부분 진행 주석** 으로 남기고, 실 배포는 Helm 세션에서.

## 5. 변경 요약 (Changes)

- `infra/observability/README.md` — 신규 (디렉터리 맵 + 배포 계획 + 알람 채널 + 설계 원칙).
- `infra/observability/metrics-catalog.md` — 신규 (§0 이름 규칙 + §1–§9 32개 메트릭 + PromQL 파생 3종 + 추가 기준 4항).
- `infra/observability/prometheus/prometheus.yml` — 신규 (7 job scrape, global 15s, external_labels).
- `infra/observability/prometheus/rules/alerts.yml` — 신규 (3 group · 3 알람 rule, P1/P2 severity 라벨).
- `infra/observability/grafana/dashboards/01-job-health.json` — 신규 (6 panel, docs/02 §9.2 #1).
- `infra/observability/grafana/dashboards/02-cost.json` — 신규 (6 panel, docs/02 §9.2 #2).
- `infra/observability/grafana/dashboards/03-quality.json` — 신규 (7 panel, docs/02 §9.2 #3).
- `infra/README.md` — observability 행 + 세션 17 주석 1줄.
- `progress/INDEX.md` — 세션 17 row, Platform/Infra 🟡 승격, Foundation Exit #3 주석, 다음 3세션 재배열.
- `progress/sessions/2026-04-18-session-17-observability.md` — 본 파일.

## 6. 블록 (Blockers / Open Questions)

- **Prometheus/Grafana 실 배포 부재**: Foundation Exit #3 의 체크박스를 ✅ 로 전환하려면 K8s 클러스터 + Helm chart 필요. Platform 세션에서 수행.
- **Recording rule 의 필요성**: 현재 PromQL 은 단순하지만 대시보드 부하가 쌓이면 recording rule 로 이동 필요. 측정 후 결정.
- **벤더 상태 라벨 일관성**: `status=success|4xx|5xx|timeout` 이 어댑터별로 다르게 분류될 수 있음. 어댑터 구현 시 정규화 규칙 수립 필요.
- **budget_scope 스키마**: `daily|monthly|per_tenant` 외 확장 예약 — 실 운영 시 재조정.

## 7. 다음 세션 제안 (Next)

- **세션 18**: Web Avatar stage 2 — 텍스처 PNG/WebP 번들 + atlas 메타. `<geny-avatar>` 런타임 스켈레톤 시작.
- **세션 19**: Foundation Exit #1 (단일 아바타 생성→프리뷰→export 수동 테스트) — 최소 web UI 스켈레톤 or CLI-only 워크플로 문서화.
- **세션 20**: 발급자 공개키 레지스트리 + `license.verify` 엔드포인트 (세션 14 blocker 해소) **또는** Observability Helm chart 실배포 (Exit #3 완결).

## 8. 지표 (Metrics)

- **Foundation Exit 체크리스트**: 2/4 유지 (세션 17 은 #3 "config" 완 — "기본 동작" 은 배포 시 체크).
- **신규 디렉터리**: `infra/observability/` 1개, 하위 파일 7개 (README, catalog, prometheus.yml, alerts.yml, dashboards × 3).
- **메트릭 32개**: Job 7 · Worker 4 · AI 4 · Cost 2 · Cache 2 · Quality 4 · API 3 · Export 4 · Process 2 (참조).
- **알람 3개**: docs/02 §9.3 와 1:1.
- **대시보드 패널 19개**: 6 + 6 + 7.
- **CI 변경 없음**: 관측 config 는 런타임과 독립. `pnpm run test:golden` 88 tests / 5 steps green 유지.

## 9. 인용 (Doc Anchors)

- [docs/02 §9 관측성](../../docs/02-system-architecture.md#9-관측성-observability)
- [docs/13 §7.4 관측성 스택](../../docs/13-tech-stack.md)
- [docs/14 §3.3 Foundation Exit 체크리스트](../../docs/14-roadmap-and-milestones.md)
- [docs/15 §7 시각 회귀 LPIPS](../../docs/15-quality-assurance.md)
