---
session: 65
date: 2026-04-19
scope: worker-generate consumer 역할 분리 + `geny_queue_{enqueued,failed,duration}` 3 메트릭 (ADR 0006 §D3 X+2 완결)
---

# Session 65 — Worker consumer 별 프로세스 분리 + queue 3 메트릭

## 1. 스코프

ADR 0006 §D3 의 X+2 단계 완결. 세션 64 에서 `geny_queue_depth` gauge sampler 가 landed 되었으므로, 남은 3 메트릭 (`geny_queue_enqueued_total`, `geny_queue_failed_total{reason}`, `geny_queue_duration_seconds{outcome}`) 과 consumer 프로세스 분리 구조를 도입한다.

요구 사항:

- `createBullMQJobStore` 에 `mode?: "inline" | "producer-only"` 옵션. `producer-only` 에서는 세션 63 의 `setImmediate(orchestrate)` 훅 생략.
- `createBullMQJobStore.onEnqueued?` 콜백 — `geny_queue_enqueued_total` 카운터 배선점. dedupe 재제출은 미호출.
- `@geny/job-queue-bullmq` 에 `processWithMetrics()` 순수 함수 + `createBullMQConsumer()` 실 `Worker` 래퍼.
- `apps/worker-generate` 에 `--role producer|consumer|both` 플래그. consumer 역할 분리 시 `/jobs` 없이 `/metrics` + `/healthz` + BullMQ `Worker`.

## 2. 성과물

### 2.1 `packages/job-queue-bullmq/src/job-store.ts` — mode + onEnqueued

- `BullMQJobStoreMode = "inline" | "producer-only"` 타입 신설.
- `CreateBullMQJobStoreOptions` 에 `mode?` + `onEnqueued?(task)` 추가. `orchestrate` 는 `mode="producer-only"` 시 선택적. `mode="inline"` 에서 누락 시 생성 시점 throw.
- `submit()` 플로우:
  - 재제출 dedupe 를 먼저 판단 → 기존 레코드 반환 시 `onEnqueued` 미호출.
  - 새 enqueue 일 때만 `opts.onEnqueued?.(task)` 호출. 재제출 counter 오염 방지.
  - `mode === "inline" && rec.status === "queued"` 분기에만 `setImmediate(execute)` 훅 등록. `producer-only` 는 consumer 가 Redis 큐에서 소비할 때까지 미처리.
- `execute()` 내부 `orchestrate!` non-null assertion — `mode="inline"` 검증이 생성 시점에 통과했다는 사실 근거.

### 2.2 `packages/job-queue-bullmq/src/processor-metrics.ts` (신규)

순수 함수 헬퍼 — Redis 없이 단위 테스트 가능.

- `QueueFailureReason` enum (`ai_timeout|ai_5xx|schema_violation|post_processing|export|other`) — catalog §2.1 + `geny_job_failed_reason_total` 과 공통 vocabulary.
- `QueueProcessOutcome = "succeeded" | "failed"`.
- `ConsumerMetricsSink`:
  - `onFailed({ queue_name, reason })` — 실패 시 1회.
  - `onDuration({ queue_name, outcome }, seconds)` — 성공/실패 양쪽.
- `defaultClassifyQueueError(err)` — `err.code` 대문자 정규화 후 substring 매치(`TIMEOUT|5XX|VENDOR_ERROR|SCHEMA|POST_PROCESS|EXPORT`). 미매치는 `other`.
- `processWithMetrics(processor, { queueName, sink?, classifyError?, clock? })` — processor 실행을 `Date.now` 구간으로 감싸 성공 시 `onDuration("succeeded")`, 실패 시 `onFailed + onDuration("failed")` 후 **rethrow**. `clock` 주입자로 테스트 결정성.

### 2.3 `packages/job-queue-bullmq/src/consumer-redis.ts` (신규)

실 BullMQ `Worker` 어댑터.

- `createBullMQConsumer(client, { queueName, processor, sink?, classifyError?, concurrency?, extraWorkerOptions? })`.
- 내부에서 `new Worker<BullMQJobData, TResult>(queueName, wrapper, { connection: client, concurrency, ...extraWorkerOptions })` 생성. wrapper 는 `processWithMetrics` 로 processor 감쌈.
- `BullMQConsumer.ready()` = `worker.waitUntilReady()` / `close()` = `worker.close()` (멱등 가드).
- ioredis 클라이언트 lifecycle 은 호출자 책임 (`driver-redis.ts` 와 동일 규약). consumer 가 close 되어도 client 는 그대로.
- **비-목표** (범위 밖): `QueueEvents` 로 정확한 enqueue→terminal 구간 측정; DLQ 라우팅; `attemptsMade >= max_retries` 분기.

### 2.4 `packages/job-queue-bullmq/src/index.ts` — export 추가

- `BullMQJobStoreMode`, `processWithMetrics`, `defaultClassifyQueueError`, `ConsumerMetricsSink`, `QueueFailureReason`, `QueueProcessOutcome`, `createBullMQConsumer`, `BullMQConsumer`, `CreateBullMQConsumerOptions`.

### 2.5 `apps/worker-generate/src/main.ts` — `--role` 분기

- `CliArgs.role: "producer" | "consumer" | "both"` + `--role` 플래그 파싱. `producer`/`consumer` 는 `--driver bullmq` 필수 — 검증 실패 시 parseArgs throw.
- `main()` 은 `role === "consumer"` 시 `runConsumer()`, 나머지는 `runProducerOrBoth()` 로 분기.
- `runProducerOrBoth()`:
  - `role === "producer"` → `createBullMQJobStore({ mode: "producer-only" })` (`setImmediate` 훅 생략).
  - `role === "both"` → `mode: "inline"` (세션 63 호환).
  - `enqueueInc` closure ref — `onEnqueued` 는 store 생성 전에 설정돼야 하지만 counter 는 worker 빌드 후 registry 에 등록 가능. ref 로 늦 바인딩.
  - `--driver bullmq` 시 `geny_queue_enqueued_total` counter + `geny_queue_depth` gauge (세션 64 sampler) 동시 배선.
- `runConsumer()`:
  - `createOrchestratorService({ catalog, factories })` 직접 생성 — `/jobs` 라우터 미사용.
  - `geny_queue_failed_total` counter + `geny_queue_duration_seconds` histogram 등록.
  - `createBullMQConsumer(client, { queueName, processor, sink })` → `processor = (data) => svc.orchestrate(data.payload)`, sink 는 registry handle 직접 어댑트.
  - `svc.createMetricsServer()` 으로 `/metrics` + `/healthz` 만 노출 (`/jobs` 없음).
- `openRedis()` 헬퍼 — 두 경로 공통 `REDIS_URL` 검증 + `ioredis.Redis` 생성 + `quit`/`disconnect` close 함수.
- SIGTERM 두 경로 모두: `consumer.close()` / `sampler.stop()` → `worker.store.drain/stop` → `closeRedis()` → `server.close()` → `exit(0)`.

### 2.6 테스트

**`packages/job-queue-bullmq/tests/processor-metrics.test.ts` (신규, 5 tests)**
- 성공 → `onDuration(succeeded)` 1회, 반환값 그대로.
- 실패 → `onFailed + onDuration(failed)` + rethrow. `VENDOR_ERROR_5XX` → `reason="ai_5xx"`.
- sink 미주입 silent (throw 전파 유지).
- `classifyError` 커스텀 훅 우선.
- `defaultClassifyQueueError` 6 vocabulary + 4 edge (null/undefined/string/empty) 커버리지.

**`packages/job-queue-bullmq/tests/job-store.test.ts` (+4 tests)**
- `mode="producer-only"` — `setImmediate` 로 양보한 뒤에도 orchestrate 미호출. driver 에 `state="waiting"` 로 남음.
- `mode="producer-only"` 는 orchestrate 생략 허용.
- `mode="inline"` 기본 + orchestrate 누락 시 생성 시점 throw.
- `onEnqueued` 재제출 dedupe 시 미호출 (`enq-001` dup → 1회만 기록).

**`apps/worker-generate/tests/wiring.test.ts` (+1 e2e)**
- `producer-only` store + `onEnqueued` → `geny_queue_enqueued_total{queue_name="geny-prod-only"} 2` 만 노출 (3회 POST 중 1회는 dedupe).

### 2.7 INDEX.md 갱신

- Pipeline row: `20 → 21 tests (+세션 65 consumer 분리 + queue 3 metric 배선)`.
- §3 trailing: Worker consumer 분리 관련 문구 세션 65 결선으로 rewrite.
- §4: row 65 신설 (detail), row 64/63 은 그대로 유지.
- §6: step 10 (job-queue-bullmq) `13+4 → 22+4 skip` + step 20 (worker-generate) `20 → 21`.
- §8: 세션 65 → 세션 66/67/68 rotate.

## 3. 설계 결정 (D1–D7)

### D1 — `processWithMetrics` 는 순수 함수, `createBullMQConsumer` 는 얇은 어댑터

**선택**: 메트릭 래퍼는 Redis 비의존 순수 함수. `Worker` 바인딩은 별도 파일.

**근거**: BullMQ `Worker` 는 실 Redis 없이 단위 테스트 불가 (`waitUntilReady` 에서 connection retry loop). 메트릭 배선 로직을 `processWithMetrics` 로 떼면 로직 전체를 fake clock + sink 로 결정적으로 테스트 가능. consumer-redis 자체는 wrapper 한 줄 + lifecycle (`ready`/`close`) — 실 Redis integration 세션(`perf-harness --driver bullmq`, 세션 67) 에서 검증.

**반박 고려**: `createBullMQConsumer` 안에서 메트릭까지 처리하는 "한 지붕" 설계도 가능했으나, 래퍼 로직이 non-trivial (에러 분류 + rethrow 순서 + duration 계측) — 순수 함수 고정하는 편이 회귀 방지에 강함.

### D2 — `onEnqueued` 훅은 새 enqueue 만 발화 (dedupe 는 미호출)

**선택**: 재제출 dedupe 시 counter 미증가.

**근거**: catalog §2.1 정의 — "producer 쪽에서 `Queue.add()` 직후 증가". BullMQ `add({ jobId })` 는 동일 id 재호출 시 새 job 을 만들지 않는다 → 의미상 enqueue 아님. terminal 실패율 = `failed / enqueued` 파생 PromQL 의 denominator 가 dedupe 재제출로 부풀면 실제 실패율이 희석됨.

**구현 위치**: store.submit() 의 기존 레코드 체크 뒤, 새 records.set 직후. 재제출 경로에서는 `return existing` 으로 단락.

### D3 — `mode` 기본값 `"inline"` (세션 63 호환)

**선택**: `createBullMQJobStore({ driver, orchestrate })` 호출은 기본 `"inline"` — 기존 테스트/배포 무변경.

**근거**: 세션 63 의 `--driver bullmq` 는 inline 모드로 동작했고 이미 production-ish Helm 매니페스트 예고도 된 상태. 기본값을 `"producer-only"` 로 뒤집으면 consumer 없는 배포는 잡이 영원히 미처리 상태로 남음 — 조용한 고장. 명시적으로 `--role producer` 선택 시에만 producer-only 모드.

### D4 — `--role both` 은 여전히 같은 프로세스 inline 실행

**선택**: `both` = 세션 63 동작 그대로. BullMQ Worker 는 spawn 하지 않음.

**근거**: 로컬 개발 편의. in-memory driver 도 `both` 로 동작. 같은 프로세스에서 producer+consumer 를 돌리려고 in-process Worker + Redis Queue 를 합치면 BullMQ `Worker` 커넥션 부담이 로컬 dev 에 과함. 세션 63 의 inline 경로는 Redis 를 쓰더라도 Queue 쓰기 + 같은 프로세스의 setImmediate(orchestrate) 로 "queue-through" 근사. 실 Runtime 은 producer/consumer 분리가 기본이지만 그건 Helm 레벨 (세션 66) 에서 명시.

### D5 — consumer 는 `/jobs` 라우터 없이 `/metrics` + `/healthz` 만

**선택**: `runConsumer()` 는 `createOrchestratorService` 로 직접 `.createMetricsServer()` 바인딩. worker-generate 의 `createWorkerGenerate` + `createJobRouter` 경로 미사용.

**근거**: consumer 는 HTTP 요청을 받지 않음 — 큐만 소비. 라우터 포함 시 `/jobs` 로 오는 오배치 요청을 producer 에게만 보내야 하는지 consumer 에게도 받는지 혼란. Helm 매니페스트에서 service 분리 (producer Service / consumer Service) 시 명확. `/metrics` 는 Prometheus scrape 에 필요해서 유지, `/healthz` 는 liveness probe 에 필요.

### D6 — `duration_seconds` 는 consumer 처리 구간만 (enqueue→terminal 아님)

**선택**: `processWithMetrics` 가 processor start → resolve 만 측정. enqueue 타임스탬프 차분은 미사용.

**근거**: enqueue→terminal 정확도는 BullMQ `QueueEvents` 의 `added`/`completed` 타임스탬프가 필요 — 본 세션 범위 밖. catalog §2.1 은 이 값을 근사치로 명시(`p95 가 체감 SLO 재료`). Foundation 구간 우선, Runtime 튜닝 (세션 67) 에서 QueueEvents 로 정밀화.

**영향**: queue wait time 이 긴 워크로드에서 `geny_queue_duration_seconds` p95 가 실제 사용자 체감보다 낮게 측정됨. 대시보드 caveat 으로 기록 필요.

### D7 — `default classify` 는 `err.code` substring — 정책이 아닌 hint

**선택**: `err.code` 를 대문자 정규화 후 substring 매치로 reason enum 추정.

**근거**: `ai-adapter-core` 의 AdapterError `code` vocabulary 가 아직 안정화되지 않음. 완전한 switch 로 고정하면 adapter-core 가 새 code 를 내보낼 때마다 job-queue-bullmq 도 동반 변경 — 강결합. substring 매치 + `other` fallback 으로 약결합 유지. 호출자가 엄격한 분류를 원하면 `classifyError` 커스텀 훅 주입.

**트레이드오프**: `AI_TIMEOUT_WITH_5XX` 같이 두 키워드를 품은 code 는 순서상 `ai_timeout` 으로 먼저 매치 — 우선순위는 매칭 순서로 고정. 새 vocabulary 가 충돌을 만들면 순서 조정 (코드 변경) 필요. 현재 catalog §2.1 enum 은 6종, 실제 코드 vocabulary 와 충돌 낮음.

## 4. 테스트 수 변동

| 패키지 | 세션 64 종료 | 세션 65 종료 | Δ |
|---|---|---|---|
| `@geny/ai-adapter-core` | 70 | 70 | — |
| `@geny/job-queue-bullmq` | 13 + 4 skip | 22 + 4 skip | +9 |
| `@geny/worker-generate` | 20 | 21 | +1 |
| golden steps | 20 | 20 | — (재배치 없음) |

`perf-harness smoke` 회귀 없음 (in-process 경로, `--role` 미사용).

## 5. 영향

- `createBullMQJobStore` API 변경은 **호환** (`mode` optional, default `"inline"`; `orchestrate` 는 inline 모드에서 여전히 required).
- `--role` 미지정 시 기존 CLI 동작 무변경.
- Helm 매니페스트 (세션 66 예정) 는 `worker-generate-producer` (role=producer) + `worker-generate-consumer` (role=consumer) 두 Deployment 로 나누면 된다. 둘 다 `--driver bullmq`, 같은 `--queue-name`.

## 6. 다음 세션 예고

세션 66 — Helm chart 확장: `infra/helm/redis/` 7.2-alpine subchart + `infra/helm/worker-generate/` producer/consumer 2 deployment + `perf-harness --driver bullmq` 옵션. 세션 67 — staging Redis 위 integration CI 레인 + `removeOnComplete` TTL 재제출 실 검증.
