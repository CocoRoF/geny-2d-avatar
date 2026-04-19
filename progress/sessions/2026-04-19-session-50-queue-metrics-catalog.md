# 세션 50 — `geny_queue_*` 메트릭 카탈로그 + Job Health 대시보드 확장 (ADR 0006 follow-up)

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Platform / Infra (docs/14 §9), Pipeline
- **관련 세션**: 17 (observability 초판), 24 (Helm chart), 33 (AI 메트릭 panel), 36 (metrics-http), 44 (worker-generate JobStore), 47 (ADR 0006)
- **관련 ADR**: [0006](../adr/0006-queue-persistence.md) Runtime 드라이버 = Redis + BullMQ
- **산출물**: `infra/observability/metrics-catalog.md §2.1`, `infra/observability/grafana/dashboards/01-job-health.json` panel id=7/8/9, `infra/helm/observability/configs/dashboards/01-job-health.json` (sync), INDEX §3/§4/§8

---

## 배경

세션 47 의 ADR 0006 가 Runtime 드라이버로 Redis + BullMQ 를 확정하며 **선행 조건 3개** 를 체크리스트로 고정했다:

1. Redis 배포 결정 (K8s/Elasticache/self-host)
2. `idempotency_key` → BullMQ `job.id` 매핑 규약
3. **`geny_queue_*` 메트릭 카탈로그 정의** ← 이 세션의 범위

드라이버 교체 세션이 "메트릭 이름을 새로 짜는 일" 과 "실제 BullMQ API 배선" 두 가지를 한꺼번에 지게 되면 커밋이 부풀어오른다. 계약(메트릭 이름/레이블/타입) 을 먼저 고정해 두면 드라이버 구현 PR 은 `Queue.getJobCounts()` · `QueueEvents.on("completed"|"failed")` 배선만 남아 작아진다. 세션 44 의 `apps/worker-generate` 는 이미 `@geny/metrics-http` 를 끼워 `/metrics` 를 노출하고 있으므로 메트릭 키가 확정되면 in-memory store 도 같은 키로 기록을 시작할 수 있다 — 드라이버 교체 시 시계열 **연속성 유지**.

Pipeline 축의 기존 `geny_worker_queue_depth` gauge (label=`worker_kind`) 는 의도적으로 **큐 상태(waiting/active/delayed)** 를 구분하지 않았다. BullMQ 는 `getJobCounts()` 로 state 별 수를 공짜로 준다 — 그걸 버릴 이유가 없다.

## 설계 결정

### D1. 카탈로그 §2 "Worker health" 안에 §2.1 서브섹션으로 붙임

대안:

- **별도 §10 "Queue"**: 상위 섹션이 기존 9개에서 10개로 늘어남. Worker health(§2) 와 개념적으로 겹침(queue depth 는 이미 §2 에 있음).
- ✅ **§2.1 Queue state (BullMQ, Runtime N+1)**: 하위 섹션으로 붙이면 `geny_worker_queue_depth` (기존) ↔ `geny_queue_depth` (신규) 가 같은 섹션에서 보여 혼동 방지. 헤더에 "Runtime N+1" 을 명시해 **드라이버 구현 전** 이라는 상태를 전달.

### D2. 메트릭 4종 선정 근거

docs/02 §8·§10 의 관찰 요구사항:

- "지금 큐에 얼마나 쌓여 있나" → `geny_queue_depth` gauge
- "처리량은?" → `geny_queue_enqueued_total` counter rate
- "터미널 실패율은?" → `geny_queue_failed_total` counter rate
- "체감 SLO 는?" → `geny_queue_duration_seconds` histogram

**세션 50 에서 의도적으로 제외**:

- `active_total` / `completed_total`: `enqueued_total - active_count = waiting+delayed+completed+failed` 로 파생 가능. 거의 쓰지 않는 메트릭 미리 만들지 않음 (YAGNI).
- `stalled_total`: BullMQ `QueueEvents.stalled` 존재하나 운영 의미가 모호(lock 재획득으로 복구되는 경우 vs 진짜 stuck). 실 운영에서 한 번 경험한 후 추가.
- `retried_total`: 이미 `geny_job_retries_total` 존재 (job 축). 큐 축 중복 방지.

**이름이 `waiting_total` 이 아니라 `enqueued_total` 인 이유**: `waiting` 은 BullMQ **state 이름** 이다 (job 이 pickup 을 기다리는 상태). `enqueued_total` 은 **누적 투입량** (`Queue.add()` 호출 횟수). 둘이 충돌하면 안 됨 — 세션 50 의 이름은 "누적 투입" 이고, state="waiting" 은 `geny_queue_depth{state="waiting"}` 로 구분.

### D3. `reason` 라벨 vocabulary 를 `geny_job_failed_reason_total` 과 공유

큐 terminal failure 는 job 실패와 사실상 동일한 원인 enum 이다. **별도 vocabulary 를 만들 이유가 없다** — `ai_timeout`/`ai_5xx`/`schema_violation`/`post_processing`/`export`/`other` 를 그대로 재사용. 공유의 이점:

- 대시보드에서 `sum by (reason) (rate(geny_queue_failed_total[5m])) + sum by (reason) (rate(geny_job_failed_reason_total[5m]))` 같은 교차 확인 가능.
- 알람 규칙 작성 시 "어느 원인이 job 실패인지 큐 실패인지" 고민 없이 같은 라벨 값으로 매칭.
- 운영자 인지 부하 감소 (enum 한 벌만 기억).

### D4. `outcome` 라벨 (histogram)

`geny_queue_duration_seconds` 는 enqueue → terminal 까지의 **총 지연**. 성공/실패가 섞이면 p95 가 왜곡(실패 경로는 retry 대기로 길어지기 쉬움). `outcome=succeeded|failed` 로 분리하면:

- SLO 는 `outcome="succeeded"` 만 집계 (사용자가 본 "정상 경로").
- `outcome="failed"` 는 "얼마나 오래 실패를 붙들고 있었나" 분석용.

**label 폭발 걱정 없음**: `queue_name` (≤ 8) × `outcome` (2) = 16 시계열 × 히스토그램 버킷 — 감당 가능.

### D5. 카디널리티 상한 명시

`queue_name` 을 자유 문자열로 두면 UUID/tenant id 가 새어들어올 위험. 카탈로그에 **"ADR 0006 기준 Foundation ≤ 8"** 을 못박아 리뷰 근거 제공. 예시: `render`/`export`/`ai_call`/`postprocess` 등 pipeline stage 단위.

`state`/`outcome`/`reason` 은 전부 **enum** — 자동으로 저카디널리티 보장.

### D6. Job Health 대시보드 확장 위치

세션 17 이 Job Health 를 **"완주율이 떨어지고 있나?"** 질문에 답하는 대시보드로 정의했다. 큐 메트릭도 같은 질문의 일부 — 큐가 막히면 완주율 떨어진다. 따라서:

- ✅ **Job Health(#1) 에 panel 3종 추가 (y=20 이후)**
- 별도 Queue 대시보드 신설 ❌ — 4번째 대시보드는 Foundation 의 "대시보드 3종" 원칙을 깸 (docs/02 §9.2).

Panel 설계:

- panel id=7: **stacked timeseries** (queue_name × state). "waiting 이 쌓이고 있나" 한눈에.
- panel id=8: enqueue rate vs failed rate 동일 패널. `failed` 계열만 빨강 override (시선 끌기).
- panel id=9: p50/p95 — **24w 전폭** (시간 해상도 중요), outcome="succeeded" 만.

### D7. 드라이버 구현 전 "빈 메트릭" 정당화

Foundation 현재 코드는 `geny_queue_*` 를 **방출하지 않는다** (in-memory JobStore 는 이 카탈로그의 존재를 모름). 그래도 카탈로그에 미리 넣는 이유:

- 실 드라이버 PR 에서 **이름 논쟁 제거** — 계약은 세션 50 에 리뷰·승인 완료.
- 대시보드 panel 은 쿼리가 비어있더라도 렌더됨 (Grafana 관용). 빈 타임시리즈 = "아직 트래픽 없음" 으로 자연스러운 상태.
- 세션 44 worker-generate 의 in-memory store 도 카탈로그 이름으로 기록을 **지금 시작** 할 여지를 남김 (드라이버 교체 전후 시계열 연속성).

## 실제 변경

### `infra/observability/metrics-catalog.md`

- §2 Worker health 말미에 **§2.1 Queue state (BullMQ, Runtime N+1)** 추가 — ADR 0006 링크 + Runtime 축 방출 예고.
- 4 메트릭 row:
  - `geny_queue_depth` — gauge, labels=`queue_name, state`, alert: `waiting > 1000` 10분 → P2
  - `geny_queue_enqueued_total` — counter, labels=`queue_name`
  - `geny_queue_failed_total` — counter, labels=`queue_name, reason` (reason vocabulary share with job-failed)
  - `geny_queue_duration_seconds` — histogram, labels=`queue_name, outcome`
- 파생 PromQL 3종: 대기 버퍼 / terminal 실패율 / p95 queue latency
- 카디널리티 상한 주석 (queue_name ≤ 8 Foundation 기준)

### `infra/observability/grafana/dashboards/01-job-health.json`

- panel id=7: "Queue depth by state (BullMQ)" — stacked timeseries, `state=~"waiting|active|delayed"` (완료/실패는 누적이라 제외), gridPos 12w y=20
- panel id=8: "Enqueue vs terminal failure rate" — enqueued `rate(5m)` + failed `rate(5m)` 병치, `.*failed$` legend regex override 로 빨강 고정, 12w y=20
- panel id=9: "Queue duration (p50 / p95) — succeeded" — histogram_quantile p50/p95, outcome="succeeded" 필터, 24w y=28

총 panel 6→9. 기존 panel 건드리지 않음 (gridPos 불변).

### Helm chart 동기

- `node scripts/sync-observability-chart.mjs` → `infra/helm/observability/configs/dashboards/01-job-health.json` 재작성 (canonical 변경 5 파일 중 1 파일 drift).
- `scripts/test-golden.mjs` step 11 `observability chart verify` 가 canonical ↔ chart drift 를 검증 — pass 확인.

## 검증

- `pnpm run test:golden` → **19/19 step pass**.
- step 11 (observability chart verify) — canonical ↔ helm configs 1:1 바이트 일치.
- step 18 (physics-lint) — 13 checks pass (세션 49 확장 유지).
- step 19 (worker-generate) — 16 tests pass (JobStore + HTTP 라우터).
- validate-schemas `checked=186` 불변 (schema 무변).

## Follow-ups

- **세션 51**: 성능 SLO 측정 하네스 — `geny_queue_duration_seconds` 를 **수요 측** 에서 소비하는 최초 사례. 드라이버 구현 전이라도 Mock 어댑터 파이프라인 오버헤드 기준선을 잡아 둠.
- **세션 52**: fullbody family 실 저작 검토 (세션 49 rule 테이블의 첫 소비자).
- **세션 53**: BullMQ 드라이버 실장 — 이 세션의 메트릭 카탈로그가 **방출 지점** 을 갖게 됨.
- 장기: `queue_name` 별 budget/quota (큐 단위 rate-limit) 도입 시 `geny_queue_depth{state="waiting"}` 를 입력으로 사용하는 alert rule 을 `alerts.yml` 에 추가.

## 커밋

- `infra/observability/metrics-catalog.md`
- `infra/observability/grafana/dashboards/01-job-health.json`
- `infra/helm/observability/configs/dashboards/01-job-health.json` (sync)
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-50-queue-metrics-catalog.md`
