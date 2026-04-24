# 세션 75 — Observability metrics smoke validation (`geny_queue_*` + `geny_ai_*` 실 exposition)

**일자**: 2026-04-20
**워크스트림**: Platform / Observability
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+2 (queue metrics) / `infra/observability/metrics-catalog.md` §2.1 + §3
**선행 세션**: 세션 50 (`geny_queue_*` 메트릭 카탈로그 초안), 세션 64 (`geny_queue_depth` sampler 배선), 세션 65 (`geny_queue_enqueued_total`/`failed_total`/`duration_seconds` 실 배선), 세션 68 (duration 정밀화), 세션 72 (perf-harness `/metrics` scrape + label filter)

---

## 1. 문제

`infra/observability/metrics-catalog.md` §2.1 (Queue state) + §3 (AI vendor calls) 가 **8 메트릭 이름 + 레이블 vocabulary** 를 계약으로 선언해두었지만, 실제로 `/metrics` 엔드포인트에서 전부 exposition 되는지 **union 기준** 으로 확인한 적 없음. 세션 64/65/68 이 개별 메트릭 배선 단위로만 검증했고, 세션 72 의 `parseMetrics` 는 2개(`enqueued_total` + `depth`) label-filter 만 다룸.

`docs/14 §10` Foundation 릴리스 게이트 3축 중 "관측 대시보드" 가 Prometheus 스크레이퍼 스냅샷 증거를 요구하지만, Runtime 에서 실 `kube-prometheus-stack` 을 붙이기 전에 **exposition 계약 자체는 Foundation 에서 고정** 해두는 게 합리적 — Runtime 세션이 실 Prometheus 수집 결과를 Foundation 스냅샷과 diff 할 수 있어야 한다.

---

## 2. 변경

### 2.1 `scripts/observability-smoke.mjs` 신규

**목적**: Foundation 단계에서 exposition 계약을 CLI 1커맨드로 검증 + 스냅샷.

**동작**:
1. `--producer-url` + `--consumer-url` 두 엔드포인트를 `fetch` 로 병렬 스크랩.
2. Prometheus exposition 파서 (`extractMetricNames`):
   - `# TYPE <name> <kind>` 라인 + 샘플 라인(`<name>{...} <value>` 또는 `<name> <value>`) 둘 다 수집.
   - 히스토그램 `_bucket`/`_sum`/`_count` 접미사 제거 → base name 으로 축약 (카탈로그가 base name 으로만 선언하므로).
   - `# HELP` 라인은 스킵 (같은 name 이 TYPE/샘플에서 중복 등록).
3. producer/consumer/union 3 집합 구성, 카탈로그 필수 8종 (§2.1 4종 + §3 4종) 이 **union** 에 전부 있는지 assert.
4. 샘플 값 4종 확인:
   - producer `geny_queue_enqueued_total ≥ --expect-enqueued`
   - consumer `geny_ai_call_total{status=success} ≥ --expect-ai-calls`
   - consumer `geny_ai_call_duration_seconds_count ≥ --expect-ai-calls`
   - consumer `geny_queue_duration_seconds_count{outcome=succeeded} ≥ --expect-enqueued`
5. `--snapshot <path>` 지정 시 원본 exposition 을 timestamp + URL 헤더와 함께 파일로 저장.
6. violations 배열 + 종료 코드 1 (CI 가드 가능).

**주요 CLI 플래그**:
- `--producer-url` (기본 `http://127.0.0.1:9091`)
- `--consumer-url` (기본 `http://127.0.0.1:9092`)
- `--expect-enqueued N` (기본 0 = 검증 스킵)
- `--expect-ai-calls N` (기본 0 = 검증 스킵)
- `--snapshot <path>` (선택)

### 2.2 `docs/02 §9.1.1`

"Metrics exposition 스모크 (세션 75)" 서브섹션 추가 — 8 메트릭 × 2 role 표 (producer/consumer 소유권) + 실측 요약 + 해석 (분할 소유권 정당성, Runtime 실 Prometheus 비교 기준).

### 2.3 `infra/observability/smoke-snapshot-session-75.txt`

원본 exposition 스냅샷 (producer + consumer, 4585B). Runtime 축에서 실 Prometheus 스크레이퍼 스냅샷과 diff 할 고정 기준.

---

## 3. 실측 결과

**조건**: darwin 25.3.0, Node 22.x, Redis 7.2-alpine docker (`geny-obs-redis`, port 6381), queue=`geny-obs-75`, producer `--role producer` (port 9091), consumer `--role consumer --concurrency 4` (port 9092), N=20 smoke load via `scripts/perf-harness.mjs --target-url`.

```
[obs-smoke] producer metric names: 6
[obs-smoke] consumer metric names: 6
[obs-smoke] union: 8
[obs-smoke] samples: enqueued=20 ai_calls=20 ai_dur_count=20 q_dur_count=20
[obs-smoke] ✅ all catalog §2.1 + §3 metrics present on union, samples above threshold
```

### 3.1 분할 소유권 실측 표

| 메트릭 | producer | consumer | 비고 |
|---|---|---|---|
| `geny_queue_depth{state}` | ✅ sample | — | `getJobCounts()` sampler (세션 64) — producer 쪽만 배선 |
| `geny_queue_enqueued_total` | ✅ sample(20) | — | `onEnqueued` counter (세션 65) — producer 쪽만 |
| `geny_queue_duration_seconds` | — | ✅ sample(count=20) | `processWithMetrics` histogram (세션 65/68) |
| `geny_queue_failed_total` | — | ✅ TYPE (0건) | terminal failure — Mock 에선 0, 선언만 노출 |
| `geny_ai_call_total` | TYPE 만 | ✅ sample(success=20) | producer 는 AI 어댑터 미호출 |
| `geny_ai_call_duration_seconds` | TYPE 만 | ✅ sample(count=20) | 〃 |
| `geny_ai_call_cost_usd` | TYPE 만 | ✅ sample(0.30) | Mock 어댑터 기본 비용 |
| `geny_ai_fallback_total` | TYPE 만 | ✅ TYPE (0건) | Mock 은 폴백 없음 |

### 3.2 해석

- **producer = 큐 수용 측 관찰자**, **consumer = 처리 측 관찰자**. 두 역할이 서로 다른 메트릭 서브셋을 노출하는 것이 BullMQ 분할 토폴로지 (ADR 0006 §D3 split) 에서 자연스럽다.
- 카탈로그 §2.1 는 "하나의 서비스가 모두 노출" 을 요구하지 않는다 — Prometheus 수집기가 두 target 을 따로 스크랩하고, Grafana 에서 `sum without(instance)` 로 합치면 됨.
- `geny_ai_*` 4종이 producer 쪽에도 TYPE 만 선언된 이유: `@geny/metrics-http` 의 registry 가 팩토리 시점에 메트릭을 전부 등록(세션 33 `createRegistryMetricsHook`), producer-only 모드에선 `onCall()` 이 한 번도 호출되지 않아 sample row 가 없을 뿐 metric name 은 등록된 상태. Prometheus 관점에서 "미발생 counter" 도 유효 exposition.
- `geny_queue_failed_total` · `geny_ai_fallback_total` 이 0 건인 것은 Mock 파이프라인 특성 — 실 벤더 투입 시 재스크레이프 필요 (세션 78 후보).

---

## 4. 주요 결정축

- **D1** — **합집합 검증**: producer-only 모드에선 AI 어댑터 호출이 없고, consumer-only 에선 `Queue.add` 가 없으므로 단일 서비스에 전 메트릭을 요구하면 구조적으로 불가능. 따라서 검증 기준은 **producer ∪ consumer**. 대시보드 집계 시맨틱 (`sum without(instance)`) 과 정렬됨.
- **D2** — **검증 전용 스크립트**: `observability-smoke.mjs` 는 producer/consumer/Redis 기동 기능을 가지지 않는다. `scripts/perf-harness.mjs --target-url` 가 이미 스모크 부하 투하를 담당하므로 SoC — 본 스크립트는 `/metrics` 만 읽는다. 향후 CI 승격 시 부하+검증 2단계 명시 가능.
- **D3** — **TYPE 라인도 "노출됨" 으로 간주**: `geny_queue_failed_total` 처럼 0 건인 counter 도 선언만 있으면 pass. Prometheus exposition 규약상 TYPE 만 있어도 수집기는 metric 을 인식해 대시보드 패널이 "No Data" 가 아닌 "0" 을 렌더. 카탈로그 계약 역시 name 선언 기준.
- **D4** — **Snapshot commit**: Runtime 실 Prometheus 스냅샷과 diff 할 고정 기준이 필요. Foundation Mock 파이프라인 스냅샷은 vendor 이름/비용/job_id 같은 운영 데이터를 포함하지 않으므로 git-tracked 해도 안전 (실 프로덕션 exposition 은 commit 금지, 이건 고정 fixture 성격).
- **D5** — **`--expect-enqueued` vs `--expect-ai-calls` 분리**: producer-only 토폴로지의 "producer 측은 AI 호출을 발생시키지 않는다" 를 CLI 입력으로 강제. 향후 producer 쪽 AI 배선이 생겨도(예: 잡 제출 전 prompt 검증 LLM 호출) 값만 조정하면 동일 검증 재사용.
- **D6** — **`_bucket/_sum/_count` 접미사 축약**: 카탈로그가 histogram 을 base name (`geny_queue_duration_seconds`) 으로만 선언 — 검증도 base name 기준이어야 한다. Prometheus exposition 관행과 정렬.
- **D7** — **CI 승격 유보**: 본 스크립트를 `scripts/test-golden.mjs` step 22 로 승격하려면 (a) Redis 컨테이너 기동 (b) producer/consumer spawn 오케스트레이션 (c) perf-harness smoke 투입 — 오케스트레이션 복잡도가 세션 74 `perf-sweep-concurrency.mjs` 와 유사. 별도 세션에서 `scripts/observability-e2e.mjs` 같은 상위 스크립트로 통합 예정.

---

## 5. 검증

```
$ node scripts/observability-smoke.mjs \
    --producer-url http://127.0.0.1:9091 \
    --consumer-url http://127.0.0.1:9092 \
    --expect-enqueued 20 --expect-ai-calls 20 \
    --snapshot infra/observability/smoke-snapshot-session-75.txt
[obs-smoke] producer=http://127.0.0.1:9091 consumer=http://127.0.0.1:9092
[obs-smoke] snapshot → infra/observability/smoke-snapshot-session-75.txt
[obs-smoke] producer metric names: 6
[obs-smoke] consumer metric names: 6
[obs-smoke] union: 8
[obs-smoke] samples: enqueued=20 ai_calls=20 ai_dur_count=20 q_dur_count=20
[obs-smoke] ✅ all catalog §2.1 + §3 metrics present on union, samples above threshold

$ node scripts/test-golden.mjs
[golden] ✅ all steps pass

$ node scripts/validate-schemas.mjs
[validate] checked=244 failed=0
[validate] ✅ all schemas + rig templates valid

$ node scripts/perf-harness.test.mjs
[perf-harness] ✅ all checks pass (7/7)
```

---

## 6. 남긴 숙제

- **세션 77 후보 (실 Prometheus 승격)**: staging cluster 에 `kube-prometheus-stack` 배포 + ServiceMonitor 로 producer/consumer `/metrics` 수집 → `infra/helm/observability/grafana/dashboards/01-job-health.json` 의 queue 패널이 실 데이터를 렌더하는지 확인, 본 세션 snapshot 과 diff.
- **세션 78 후보 (실 벤더 분포 캡처)**: nano-banana/sdxl/flux HTTP 어댑터 투입 후 `observability-smoke.mjs` 로 `geny_ai_call_duration_seconds` 실 분포 + `geny_ai_call_cost_usd` 누적값 캡처, Mock 대비 차이 기록.
- **CI 승격**: 로컬 Redis 컨테이너 + producer/consumer spawn + perf-harness + observability-smoke 4단 오케스트레이션을 `scripts/observability-e2e.mjs` 로 묶어 golden step 22 후보.
- **`geny_queue_failed_total` 실 발생 경로**: Mock 파이프라인에선 0 건 — 실 벤더에서 `ai_timeout`/`ai_5xx`/`schema_violation` 등 reason vocabulary 가 실제로 방출되는지는 별도 fault injection 테스트 필요 (classifier 세션 65 `defaultClassifyQueueError` 의 err.code substring 매치 검증).

---

## 7. 결과

- `scripts/observability-smoke.mjs` 신규 — producer+consumer `/metrics` 스크랩 → 카탈로그 §2.1 + §3 8 메트릭 union 검증 + sample count assert + snapshot 저장.
- `docs/02 §9.1.1` — "Metrics exposition 스모크" 서브섹션 (8 × 2 role 표 + 실측 + 해석).
- `infra/observability/smoke-snapshot-session-75.txt` — 원본 exposition 스냅샷 (4585B), Runtime 실 Prometheus 비교 기준선.
- **Foundation Exit #3 증거**: 카탈로그 계약 8 메트릭 이름이 실제 `/metrics` union 에 노출됨을 1 커맨드로 확인 가능.
- `docs/14 §10` 릴리스 게이트 관측 스냅샷 축 ✅ (실 Prometheus 수집 배선은 Runtime 축에 예약).
- golden 21/21, validate-schemas checked=244, perf-harness test 7/7, job-queue-bullmq 26/31 pass (+5 skip) 불변.
