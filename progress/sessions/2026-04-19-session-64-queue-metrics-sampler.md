# Session 64 — `geny_queue_depth` gauge sampler (catalog §2.1 결선)

**날짜**: 2026-04-19
**워크스트림**: Pipeline · Platform / Infra (docs/14 §9)
**참조**: `infra/observability/metrics-catalog.md` §2.1 · `progress/adr/0006-queue-persistence.md` §D3 · 세션 50 (metrics-catalog) · 세션 60/62/63 (BullMQ driver + bootstrap)

---

## 1. 범위

세션 50 에서 예약한 `geny_queue_*` 4 메트릭 중 **`geny_queue_depth` gauge** 를 실제 실측 경로 (worker-generate `--driver bullmq`) 에서 publish 하도록 배선. 폴링 기반(`Queue.getJobCounts()` 주기) 으로 5 상태(`waiting`/`active`/`delayed`/`completed`/`failed`) gauge 를 `InMemoryMetricsRegistry` 에 set → 기존 `/metrics` 엔드포인트에 자동 노출.

**비-범위**:
- `geny_queue_enqueued_total` / `geny_queue_failed_total{reason}` counter — `QueueEvents` completed/failed 구독이 필요한데 그건 Worker consumer 분리(세션 65+) 범위.
- `geny_queue_duration_seconds` histogram — 동일 이유. Worker consumer 에서 `Job.finishedOn - processedOn` observe.
- Worker consumer 별 프로세스 분리 (`new Worker(queueName, processor)`) — 세션 65.
- Helm chart — 세션 66.

이번 세션은 **producer-side 관측 gauge 만**, 드라이버 API 가 이미 제공하는 `getCounts()` 를 스케줄러로 연결하는 최소 슬라이스.

---

## 2. 산출물

### 2.1 `packages/ai-adapter-core/src/metrics.ts` — `GaugeHandle` 확장

- 기존 `CounterMetric | HistogramMetric` 유니온에 `GaugeMetric`/`GaugeSeries` 추가.
- `InMemoryMetricsRegistry.gauge(name, help): GaugeHandle` 메서드 + 이름-타입 충돌 검사 (`counter`/`histogram` 와 중복 이름 등록 거부).
- `GaugeHandle.set(labels, value)` — 덮어쓰기 시맨틱 (counter 의 `inc` 누적과 구분). `NaN`/`Infinity` 거부.
- `renderPrometheusText()` 에 gauge 분기 추가: `# TYPE <name> gauge` + series line (label + value).
- `getGauge(name, labels)` 테스트 헬퍼 추가.
- `GaugeHandle` 를 `packages/ai-adapter-core/src/index.ts` 에서 export.

### 2.2 `packages/job-queue-bullmq/src/metrics-sampler.ts` — 신규

**`createQueueMetricsSampler({ driver, sink, queueName, intervalMs?, scheduler?, onError? })`** 팩토리.

- **`sink: QueueDepthSink`**: `setDepth(labels, value)` callback 인터페이스. 레지스트리 타입에 직접 의존하지 않음 → `@geny/job-queue-bullmq` 가 `@geny/ai-adapter-core` 를 dep 으로 끌어오지 않아도 됨 (uni-directional 의존성 유지).
- **`Scheduler`** 추상화: `schedule(fn, intervalMs) → { cancel() }`. 기본 구현 `setIntervalScheduler` 는 `setInterval` + `unref()`. 테스트는 `manualScheduler` 를 주입해 tick 을 결정적으로 제어.
- **API**:
    - `start()` — scheduler 에 sample tick 등록. 이미 start 된 경우 no-op (idempotent).
    - `stop()` — scheduler cancel + inflight sample 대기.
    - `tickOnce()` — 한 번 즉시 샘플링, 에러는 `onError` 로 전달.
- **5 상태 gauge**: `waiting` / `active` / `delayed` / `completed` / `failed` (catalog §2.1 + driver.ts `BullMQQueueCounts`). 상수 `QUEUE_STATES` 로 고정.
- **에러 격리**: `driver.getCounts()` throw → `onError(err)` 호출 후 sample 종료. 다음 tick 에 자동 재시도 — sampler 가 한 번 실패해서 죽으면 관측 공백이 영속화되므로.

### 2.3 `packages/job-queue-bullmq/tests/metrics-sampler.test.ts` — 신규

4 신규 테스트:
1. `tickOnce()` 이 `getCounts` → 5 상태 sink.setDepth 정확 반영.
2. `start()/stop()` 이 scheduler 에 등록/취소 — `manualScheduler.fire()` 로 tick 시점 제어.
3. `getCounts()` 실패 → `onError` 호출 + `setDepth` 미호출, 다음 tick 에 복구.
4. `start()` 두 번 호출 → 두 번째 no-op (scheduler.schedule 1회만).

### 2.4 `packages/job-queue-bullmq/src/index.ts` — exports 추가

`createQueueMetricsSampler` · `setIntervalScheduler` · `QUEUE_STATES` 상수 · 타입 4종 (`QueueMetricsSampler` · `CreateQueueMetricsSamplerOptions` · `QueueDepthSink` · `QueueState` · `Scheduler`).

### 2.5 `apps/worker-generate/src/main.ts` — 배선

- `buildBullMQStoreFactory()` 반환값 확장: `{ factory, driver, closeConnection }` — sampler 가 동일 driver 인스턴스에 붙을 수 있도록 외부 노출.
- `main()` 내부, `worker = createWorkerGenerate(...)` 이후 bullmq 드라이버가 있으면:
    ```typescript
    const gauge = worker.service.registry.gauge("geny_queue_depth", "...");
    const sampler = createQueueMetricsSampler({
      driver: bullmqDriver,
      sink: { setDepth(labels, v) { gauge.set(labels, v); } },
      queueName,
      intervalMs: 30_000,
      onError: (e) => process.stderr.write(...),
    });
    sampler.start();
    void sampler.tickOnce(); // 초기 1회 즉시
    ```
- SIGTERM/SIGINT handler 의 초반에 `await sampler.stop()` 삽입 — drain 전에 gauge 샘플러를 먼저 끊어 rate 측정 꼬임 방지.

### 2.6 `apps/worker-generate/tests/wiring.test.ts` — e2e gauge scrape

신규 테스트 `wiring: geny_queue_depth sampler → /metrics exposition (세션 64)`: fake BullMQDriver 의 `getCounts()` 를 고정값 `{waiting:7, active:2, delayed:1, completed:42, failed:3}` 으로 오버라이드 → sampler.tickOnce() → HTTP `GET /metrics` 응답 본문이 `# TYPE geny_queue_depth gauge` + 5 상태 라인을 포함하는지 검증. 배선 경로 (sampler → gauge.set → registry → Prometheus text → HTTP response) 전체 회귀.

---

## 3. 설계 결정

### D1. `QueueDepthSink` **callback 추상화** (레지스트리 직접 의존 회피)

`@geny/job-queue-bullmq` 가 `@geny/ai-adapter-core` 의 `GaugeHandle` 을 직접 import 하면, 향후 OpenTelemetry/StatsD 등 다른 백엔드로 교체할 때 job-queue 레이어를 수정해야 함. `sink.setDepth(labels, value)` 인터페이스로 추상화해 driver 는 "값을 전달한다" 는 역할만 수행. worker-generate 의 main.ts 가 어댑터(`setDepth = (l, v) => gauge.set(l, v)`) 를 직접 작성.

### D2. **5 상태 gauge** (waiting/active/delayed/completed/failed)

catalog §2.1 에서 `state=waiting|active|delayed|completed|failed` 로 선언. `BullMQDriver.getCounts()` 도 같은 5 상태. 누락된 `prioritized`/`waiting-children` 는 `mapBullMQState()` 에서 `queued` 로 collapse — gauge level 에서는 BullMQ raw state 를 노출해 운영자가 튜닝 가능한 정보로 두고, 논리 JobStatus 와 분리.

`completed`/`failed` 를 gauge 에 포함하는 이유: `removeOnComplete`/`removeOnFail` TTL 이 없을 때(Foundation 기본) 과거 terminal 잡이 큐에 남아 depth 로 관측됨 — retention policy 튜닝 지표.

### D3. **폴링 주기 30s** 기본

catalog §2.1 에서 "30s polling" 권고. 근거: Prometheus scrape 주기 15s 의 정수배, 너무 짧으면 Redis `getJobCounts()` (`MULTI` 5 key SCARD/LLEN) 비용 누적. `--driver bullmq` 의 CLI override 는 세션 66 (staging perf) 에서 필요 시 추가.

### D4. **초기 1회 즉시 tick** (`sampler.tickOnce()` after `start()`)

`setInterval(fn, 30_000)` 은 첫 실행이 30s 후 — 그 사이 `/metrics` scrape 가 들어오면 gauge 가 0 (또는 stale) 로 보고됨. 초기 1회 즉시 tick 해 워커 기동 직후부터 실값이 노출되도록.

### D5. **에러 격리** (sampler 는 죽지 않음)

`driver.getCounts()` 가 Redis timeout/ECONNRESET 으로 throw 해도 sampler 를 내려버리면 관측 공백이 영속화(재시작 전까지 gauge 갱신 없음). `try/catch` + `onError` 콜백만 호출 후 다음 tick 에서 자동 재시도. 운영자는 stderr 로 실패 원인 추적, 메트릭은 이전 값이 유지되다가 Redis 회복 시 자동 갱신.

### D6. **Scheduler 추상화** (테스트 결정성)

`setInterval` 직접 쓰면 단위 테스트에서 `await delay(30_000)` 해야 함. `Scheduler.schedule(fn, ms)` 인터페이스로 감싸서 테스트는 `manualScheduler.fire()` 로 tick 시점을 제어. 기본 구현은 실 `setInterval` + `unref()` (Node 프로세스 keep-alive 방지).

### D7. **Worker consumer 분리는 세션 65**

세션 63 end state = 단일 프로세스 내 BullMQ (producer + in-process orchestrate via `setImmediate`). 세션 64 는 이 구조 **그대로** 관측만 추가 — 계약 변경 없음. consumer 별 프로세스 분리 + `QueueEvents` 구독(completed/failed counter + histogram) 은 별도 세션으로, 이번 세션의 gauge 를 회귀 안전망으로 삼아 점진 도입.

---

## 4. 테스트 카운트 변화

| 패키지 | before | after |
|---|---|---|
| `@geny/ai-adapter-core` | 68 | **70** (+2 gauge: set/render/충돌, NaN/Infinity 거부) |
| `@geny/job-queue-bullmq` | 9+4 skip | **13**+4 skip (+4 sampler: tickOnce, start/stop, onError, idempotent start) |
| `@geny/worker-generate` | 19 | **20** (+1 e2e gauge → `/metrics` scrape) |
| golden step | 21 | 21 (불변 — 기존 step 8/7/19 가 각각 +2/+4/+1 흡수) |

validate-schemas `checked=244` 불변.

---

## 5. 영향 · 불변식

- **`pnpm -F @geny/ai-adapter-core test` — 70/70 pass**.
- **`pnpm -F @geny/job-queue-bullmq test` — 13/13 pass (4 redis skip)**.
- **`pnpm -F @geny/worker-generate test` — 20/20 pass**.
- **`node scripts/test-golden.mjs` — 21 step 전수 pass**.
- **`node scripts/perf-harness.mjs --smoke` — 0 err, 전 SLO pass**.
- `apps/worker-generate` 의 `--driver bullmq` 경로가 실행되면 `/metrics` 에 `geny_queue_depth{queue_name,state}` 5 라인이 자동 추가 (REDIS_URL 연결 전제).
- in-memory 드라이버 경로 + 관측 페이로드 불변 (sampler 는 `bullmqDriver` 가 있을 때만 생성).

---

## 6. 다음 세션 예고

- **세션 65**: Worker consumer 별 프로세스 분리 — `apps/worker-generate/src/consumer.ts` (또는 `apps/worker-generate-consumer/` 별 앱) entry 로 `new Worker(queueName, processor, { connection })` 실행. `createBullMQJobStore` 에 `mode?: "producer-only" | "inline"` 옵션 추가 — `producer-only` 는 in-process `setImmediate(orchestrate)` 훅 생략, consumer 가 BullMQ 로부터 잡 수신 시 processor 내에서 `svc.orchestrate(task)` 실행. `QueueEvents` `completed`/`failed` 리스너 → `geny_queue_enqueued_total` + `geny_queue_failed_total{reason}` counter + `geny_queue_duration_seconds` histogram 등록.
- **세션 66 후보**: Helm chart 확장 — `infra/helm/redis/` 7.2-alpine subchart + `infra/helm/worker-generate/` producer/consumer 2 deployment + `--driver bullmq` 기본값 매니페스트.
- **세션 67 후보**: staging Redis integration — `REDIS_URL` 주입된 CI 레인 + `perf-harness.mjs --driver bullmq` 옵션 (BullMQ 대비 in-memory p95 regression 측정).

---

## 7. 참조 파일

- `packages/ai-adapter-core/src/metrics.ts` (gauge 확장)
- `packages/ai-adapter-core/src/index.ts` (GaugeHandle export)
- `packages/ai-adapter-core/tests/metrics.test.ts` (gauge 2 tests)
- `packages/job-queue-bullmq/src/metrics-sampler.ts` (신규)
- `packages/job-queue-bullmq/src/index.ts` (sampler exports)
- `packages/job-queue-bullmq/tests/metrics-sampler.test.ts` (신규)
- `apps/worker-generate/src/main.ts` (sampler 배선)
- `apps/worker-generate/tests/wiring.test.ts` (e2e gauge scrape)
- `infra/observability/metrics-catalog.md` §2.1
- `progress/sessions/2026-04-19-session-50-geny-queue-metrics.md` (카탈로그 결선)
- `progress/sessions/2026-04-19-session-63-worker-generate-bullmq-wiring.md` (bootstrap 선행)
