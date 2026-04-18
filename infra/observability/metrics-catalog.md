# Metrics Catalog

Geny 2D Avatar 플랫폼이 방출하는 Prometheus 메트릭의 **단일 진실 공급원**.
코드에서 새 메트릭을 도입할 때는 본 문서를 먼저 갱신한 뒤 구현한다 (docs/02 §9.1).

## 0. 명명 규칙

- 프리픽스: `geny_`.
- 이름: `geny_<category>_<name>_<unit>`. unit 은 Prometheus 관행 (`_seconds`, `_bytes`, `_total`, `_ratio`).
- 카운터는 `_total` 접미사, 게이지는 단위만.
- 히스토그램은 `_seconds` (duration) 또는 `_bytes` (size). `_count`/`_sum`/`_bucket` 은 Prometheus 가 자동 파생.
- 레이블은 **저카디널리티 only** — `job_id`·`user_id`·`avatar_id` 는 **메트릭 라벨에 넣지 않는다** (logs/traces 용).

## 1. Job lifecycle

파이프라인 Job 의 생명주기. 대시보드 #1 (Job Health) 공급원.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_job_started_total` | counter | `template_family`, `tenant_tier` | 전체 job 시작 수. |
| `geny_job_completed_total` | counter | `template_family`, `tenant_tier`, `status` | `status`=`success|failed|cancelled`. 완주율 = success/started. |
| `geny_job_duration_seconds` | histogram | `template_family`, `tenant_tier` | 시작→완료 지연. p50/p90/p99 파생. |
| `geny_job_ttfe_seconds` | histogram | `tenant_tier` | **TTFE** — 신규 사용자 첫 export 까지 (docs/01 §5 속도 지표). 목표: p50 ≤ 1800, p90 ≤ 7200. |
| `geny_job_failed_reason_total` | counter | `reason`, `stage` | `reason`=`validation|ai_timeout|ai_5xx|schema_violation|post_processing|export|other`. 상위 10 대시보드. |
| `geny_job_retries_total` | counter | `reason`, `stage` | 재시도 횟수. `max_retries=3` (docs/02 §10.2). |
| `geny_jobs_inflight` | gauge | `template_family` | 진행 중 job 수. 큐 길이와 함께 봄. |

**파생 PromQL**:
- 완주율: `sum(rate(geny_job_completed_total{status="success"}[5m])) / sum(rate(geny_job_started_total[5m]))`
- p90 TTFE: `histogram_quantile(0.9, sum by (le) (rate(geny_job_ttfe_seconds_bucket[1h])))`
- WSAC (주간 성공 job): `sum(increase(geny_job_completed_total{status="success"}[7d]))`

## 2. Worker health

큐/워커 헬스. 대시보드 #1 보조.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_worker_queue_depth` | gauge | `worker_kind` | `worker_kind`=`cpu|gpu|ai`. > 1000 이 10분 지속 → P2 (§9.3). |
| `geny_worker_task_duration_seconds` | histogram | `worker_kind`, `node_id` | 노드 하나의 처리 지연. `node_id` 는 저카디널리티 (앞자리 hex 4자 + stage) 권장. |
| `geny_worker_gpu_utilization_ratio` | gauge | `worker_kind`, `gpu_model` | 0.0–1.0. GPU 효율 모니터. |
| `geny_worker_memory_bytes` | gauge | `worker_kind`, `pod` | USE 신호. |

## 3. AI vendor calls

외부 AI 어댑터 호출. 대시보드 #2 (Cost) 공급원.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_ai_call_total` | counter | `vendor`, `model`, `stage`, `status` | `vendor`=`nano_banana|gemini|sora|…`, `status`=`success|4xx|5xx|timeout`. 5xx 비율 > 20% 10분 → P2 (§9.3). |
| `geny_ai_call_duration_seconds` | histogram | `vendor`, `model`, `stage` | 지연. p95 가 벤더 health score 재료 (docs/05 §7.3). |
| `geny_ai_call_cost_usd` | counter | `vendor`, `model`, `stage` | 호출 단가(USD). 1아바타당 단가 = `cost_usd / completed_jobs`. |
| `geny_ai_fallback_total` | counter | `from_vendor`, `to_vendor`, `reason` | 벤더 페일오버 발생. |

## 4. Cost aggregates

월간/일간 비용 요약. 대시보드 #2.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_cost_per_avatar_usd` | gauge | `template_family` | 직전 1h 평균 1아바타당 비용. 알람 재료는 아니지만 재무 모니터링. |
| `geny_cost_budget_used_ratio` | gauge | `budget_scope` | `budget_scope`=`daily|monthly|per_tenant`. 0.0–1.0+. ≥ 0.9 → P2. |

## 5. Cache

파이프라인 노드 해시 기반 캐시 (`(inputs, version, seed)` — docs/02 §10.3). 대시보드 #2.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_cache_hit_total` | counter | `stage`, `cache_layer` | `cache_layer`=`L1_redis|L2_s3|cdn`. |
| `geny_cache_miss_total` | counter | `stage`, `cache_layer` | 적중률 = hit/(hit+miss). 대시보드 #2 에 표시. |

## 6. Quality

자동 검수·재생성·사람 리뷰. 대시보드 #3.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_quality_score` | histogram | `stage`, `check_type` | `check_type`=`alpha_clean|anchor_fit|occlusion|color_harmony|…` (docs/08). 점수 0.0–1.0. 분포 패널. |
| `geny_quality_regeneration_total` | counter | `trigger`, `stage` | `trigger`=`auto_threshold|user_click`. 재생성율 공급원. |
| `geny_quality_human_review_requested_total` | counter | `reason` | 사람 리뷰 개입. 너무 많으면 자동 검수 부재 신호. |
| `geny_quality_lpips_p95` | gauge | `template_family` | 시각 회귀 LPIPS p95 (docs/15 §7). ≤ 0.08 (QA 기준). |

## 7. API RED signals

`apps/api/` 엣지 + core API. 대시보드 #1 의 "사용자가 느끼는 서비스 상태" 보조.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_api_request_total` | counter | `method`, `route`, `status_class` | `status_class`=`2xx|3xx|4xx|5xx`. `route` 는 템플릿화된 경로 (`/avatars/:id`). |
| `geny_api_request_duration_seconds` | histogram | `method`, `route` | p50/p95/p99. |
| `geny_api_active_connections` | gauge | `pod` | 웹소켓/SSE 세션. |

## 8. Export pipeline

`@geny/exporter-core` 단일호출 메트릭. CLI 만 쓸 때는 방출 X. 파이프라인 내부 호출 시 emit. 대시보드 #1 "export 스테이지" 영역.

| 메트릭 | 타입 | 레이블 | 설명 |
|---|---|---|---|
| `geny_export_bundle_duration_seconds` | histogram | `bundle_kind` | `bundle_kind`=`cubism-bundle|web-avatar-bundle`. 번들 조립 지연. |
| `geny_export_bundle_bytes` | histogram | `bundle_kind`, `template_family` | 번들 크기. halfbody v1.2.0 기준 Cubism ≈ 36KB / Web ≈ 12KB. |
| `geny_export_bundle_files` | histogram | `bundle_kind` | 파일 수. Cubism ≈ 15 / Web ≈ 2. |
| `geny_export_schema_validation_failed_total` | counter | `schema_id`, `path_pattern` | 스키마 위반. Foundation 에서는 0 유지. |

## 9. 프로세스 기본 (자동 수집)

`process_*`, `go_*`, `nodejs_*` 등 런타임 기본 메트릭은 각 client 가 자동 노출 — 본 카탈로그에는 나열하지 않는다. 단, **`process_cpu_seconds_total`** 와 **`process_resident_memory_bytes`** 를 Job Health 대시보드 하단의 워커 패널에서 참조한다.

---

## 추가 기준

새 메트릭을 추가하려면:

1. 본 문서에 row 추가 + 이름·레이블·타입·예상 카디널리티 명시.
2. `geny_` 접두어 + `snake_case` 준수.
3. 고카디널리티 라벨(> 100 고유 값) 제안 시 리뷰에서 거절될 가능성 큼 — traces/logs 로 옮길 것.
4. recording rule (`prometheus/rules/*.yml`) 이 필요한 파생 지표라면 해당 rule 도 함께 제출.
