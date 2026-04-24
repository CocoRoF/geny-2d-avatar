# @geny/job-queue-bullmq

`geny-2d-avatar` Runtime 큐 드라이버 — ADR 0006 §D3 **BullMQ 기반 `JobStore`**. `apps/worker-generate` 의 Foundation 인-메모리 FIFO 를 대체하는 팩토리 + 실 `bullmq@^5` / `ioredis@^5` 바인딩 + Worker 래퍼 + 메트릭 샘플러 / 프로세서 메트릭. Foundation CI 는 Redis 를 띄우지 않고 fake driver 로 계약을 고정, 실 Redis 는 `REDIS_URL` 환경 변수가 있어야만 `redis-integration.test.ts` 가 돌아간다.

## 현재 상태 (세션 60 → 68)

- ✅ **`createBullMQJobStore` 팩토리** (세션 60, X 단계) — 드라이버 인터페이스만 사용하는 상위 계약. `BullMQDriver` 선언 + `mapBullMQState()` + idempotency_key → jobId pass-through. 실 `bullmq`/`ioredis` 의존성 없이 단위 테스트 가능.
- ✅ **`createBullMQDriverFromRedis`** (세션 62, X+1 단계) — 실 `bullmq@^5` Queue 래퍼. producer + observer 측만 — Worker 는 별도 파일. 5 상태(waiting/active/delayed/completed/failed) listJobs + getCounts.
- ✅ **`inline` / `producer-only` 실행 모드** (세션 63 → 65, X+1 → X+2) — `"inline"` 은 `setImmediate(orchestrate)` in-process 실행(로컬 dev), `"producer-only"` 는 별 프로세스 consumer 위임(Runtime 운영 형상).
- ✅ **`createBullMQConsumer`** (세션 65, X+2) — 실 BullMQ `Worker` 바인딩. `processWithMetrics` 로 감싸 `geny_queue_failed_total` / `geny_queue_duration_seconds` 배출.
- ✅ **`createQueueMetricsSampler`** — waiting/active/delayed/completed/failed 5 상태 `geny_queue_depth` gauge 주기 샘플링. `setIntervalScheduler` 기본 + 테스트 주입 가능.
- ✅ **`processWithMetrics`** — `QueueFailureReason` (`timeout` / `retryable` / `fatal` / `classification_unknown`) 분류 + duration 히스토그램. `defaultClassifyQueueError` 기본 분류 규칙.
- ✅ **wait+process duration** (세션 68) — `enqueuedAt=job.timestamp` 를 processor 에 전달해 duration 이 enqueue→terminal 전 구간을 측정.

## 사용 예

### Foundation 단위 테스트 (fake driver)

```ts
import { createBullMQJobStore, type BullMQDriver } from "@geny/job-queue-bullmq";

const fakeDriver: BullMQDriver = {
  async add({ jobId, data }) {
    return { id: jobId, state: "waiting", data, timestamp: Date.now() };
  },
  async getJob(id) { /* ... */ return null; },
  async listJobs() { return []; },
  async getCounts() { return { waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }; },
  async close() {},
};

const store = createBullMQJobStore({
  driver: fakeDriver,
  orchestrate: async (task) => ({ /* OrchestrateOutcome */ }),
});

const rec = await store.submit(task);
await store.waitFor(rec.job_id, 30_000);
```

### Runtime producer (실 Redis)

```ts
import Redis from "ioredis";
import {
  createBullMQDriverFromRedis,
  createBullMQJobStore,
} from "@geny/job-queue-bullmq";

const client = new Redis(process.env.REDIS_URL!);
const driver = createBullMQDriverFromRedis(client, { queueName: "geny-generate" });
const store = createBullMQJobStore({ driver, mode: "producer-only" });  // inline 훅 불요
```

### Runtime consumer (별 프로세스)

```ts
import Redis from "ioredis";
import { createBullMQConsumer } from "@geny/job-queue-bullmq";

const consumer = createBullMQConsumer(new Redis(process.env.REDIS_URL!), {
  queueName: "geny-generate",
  processor: async ({ payload }) => { /* orchestrate payload */ },
  sink: metricsSink,
  concurrency: 4,
});
await consumer.ready();
// SIGTERM → consumer.close() (in-flight 대기 후 반환)
```

## API

### 공개 함수 / 팩토리

| 이름 | 설명 | 도입 |
|---|---|---|
| `createBullMQJobStore(opts)` | `BullMQDriver` + `orchestrate` 로 `JobStore` 팩토리. `submit` / `get` / `list` / `waitFor` / `drain` / `stop`. | 세션 60 |
| `createBullMQDriverFromRedis(client, { queueName, ... })` | `bullmq@^5` Queue 어댑터. `close()` 는 Queue 만 닫고 ioredis connection 은 호출자 책임. | 세션 62 |
| `createBullMQConsumer(client, { queueName, processor, ... })` | `bullmq@^5` Worker 어댑터. `ready()` / `close()` 멱등. | 세션 65 |
| `createQueueMetricsSampler(opts)` | 5 상태 depth gauge 주기 샘플러. `start()` / `stop()`. | 세션 50 카탈로그 기반 |
| `processWithMetrics(opts)` | 잡 실행 duration + failure-reason 메트릭 래퍼. `classifyError` 주입 가능. | 세션 68 (wait+process) |
| `mapBullMQState(state)` | BullMQ 8 상태 → `JobStatus` 4 상태 매핑 (ADR 0006 §D2). | 세션 60 |

### 타입

| 타입 | 설명 |
|---|---|
| `JobStatus` | `"queued" \| "running" \| "succeeded" \| "failed"` — `JobStore` 외부 상태. |
| `JobRecord` | `job_id` / `task` / `submitted_at` / `status` / `outcome?` / `error?`. |
| `BullMQJobStoreMode` | `"inline" \| "producer-only"` (세션 65). `"inline"` 은 `orchestrate` 필수. |
| `BullMQDriver` | `add` / `getJob` / `listJobs` / `getCounts` / `close` 5 메서드 계약. |
| `BullMQJobSnapshot` | driver 가 반환하는 스냅샷 — `id` / `state` / `data` / `processedOn?` / `finishedOn?`. |
| `BullMQJobState` | BullMQ 5.x `Job.getState()` 반환 8 값. |
| `QueueState` | `"waiting" \| "active" \| "delayed" \| "completed" \| "failed"` — 메트릭 gauge 5 축. |
| `QueueFailureReason` | `"timeout" \| "retryable" \| "fatal" \| "classification_unknown"` — 실패 메트릭 라벨. |
| `ConsumerMetricsSink` | `{ observeDuration(labels, seconds), incFailed(labels) }` — `metrics-http` 배출 지점. |

### BullMQ ↔ `JobStatus` 매핑 (ADR 0006 §D2)

| BullMQ state | `JobStatus` |
|---|---|
| `waiting` / `delayed` / `waiting-children` / `prioritized` | `queued` |
| `active` | `running` |
| `completed` | `succeeded` |
| `failed` / `unknown` | `failed` |

## 계약 경계 (`bullmq` / `ioredis` 의존성)

본 패키지의 **계약 파일** (`driver.ts` / `job-store.ts` / `metrics-sampler.ts` / `processor-metrics.ts`) 은 `bullmq`/`ioredis` 를 import 하지 않는다 — Foundation CI 가 Redis 없이 단위 테스트로 상태 머신 / idempotency / error payload 매핑을 검증할 수 있도록 분리. 실 바인딩은 2 파일에 몰려 있다:

| 파일 | `bullmq` import | `ioredis` import |
|---|---|---|
| `src/driver-redis.ts` | `Queue`, `Job`, `JobsOptions`, `QueueOptions` | `Redis` (type-only) |
| `src/consumer-redis.ts` | `Worker`, `WorkerOptions`, `Job` | `Redis` (type-only) |
| 그 외 (job-store / driver 계약 / metrics) | ✗ | ✗ |

이 분리 덕에 `apps/worker-generate` 의 Foundation 테스트는 fake driver 로 `createBullMQJobStore` 를 돌리고, Runtime 엔트리는 `createBullMQDriverFromRedis` + `createBullMQConsumer` 를 주입한다.

## 소비자

- **`apps/worker-generate`** (세션 63 / 65) — producer 쪽은 `createBullMQDriverFromRedis` + `createBullMQJobStore({ mode: "producer-only" })`. consumer 쪽은 별 프로세스에서 `createBullMQConsumer` bootstrap.
- **`services/orchestrator`** — orchestrate 콜백 주입 (jobStore.submit → orchestrator → outcome).
- **`scripts/perf-harness/*`** (세션 X+4 계획) — Runtime staging 에서 Redis 엔드포인트로 가서 실 duration / depth / failure-reason 분포 캡처.

## 빌드 / 테스트

```bash
pnpm -F @geny/job-queue-bullmq build       # tsconfig.build.json → dist/
pnpm -F @geny/job-queue-bullmq test        # dist-test/ + node --test
```

- **단위 테스트** — `tests/{job-store,metrics-sampler,processor-metrics}.test.ts`. fake driver 주입으로 Redis 없이 실행.
- **통합 테스트** — `tests/redis-integration.test.ts` 는 `REDIS_URL` 환경변수가 있을 때만 실행(미설정 시 skip). Foundation CI 는 env 미설정이라 skip 경로로 빠져 외부 의존 0.
- **CI lane** — `bullmq-integration` lane (`.github/workflows/bullmq-integration.yml`) 이 별도 Redis service container 를 띄워 integration 테스트를 돌림. Foundation lane 은 여전히 Redis-less.

## 향후 계획 (Runtime 단계)

- **DLQ 라우팅** — `attemptsMade >= max_retries` 분기로 별 큐 전환 (세션 X+5 자리).
- **QueueEvents 실시간 스트림** — 외부 대시보드용, 히스토그램 정확성에는 불필요.
- **removeOnComplete / removeOnFail TTL 튜닝** — `prework §2.3` — 기본 `{ age: 3600, count: 1000 }` on complete, `false` on fail. 운영 데이터 도착 후 재평가.
- **페이징 `listJobs`** — Foundation MVP 는 0~1000 범위. Runtime 에서 페이징 파라미터 열기.

## 참고 문서

- [ADR 0006 §D3](../../progress/adr/0006-queue-persistence.md) — BullMQ 드라이버 X 단계 분해.
- [progress/plans/bullmq-driver-prework.md](../../progress/plans/bullmq-driver-prework.md) — 사전 설계 문서 (retention / TTL / DLQ).
- [progress/sessions/2026-04-19-session-60-bullmq-driver-x.md](../../progress/sessions/2026-04-19-session-60-bullmq-driver-x.md) — 세션 60 드라이버 계약 + 팩토리 착지.
- [progress/sessions/2026-04-19-session-62-bullmq-redis-adapter.md](../../progress/sessions/2026-04-19-session-62-bullmq-redis-adapter.md) — 세션 62 실 Queue 어댑터.
- [progress/sessions/2026-04-19-session-63-worker-generate-bullmq-wiring.md](../../progress/sessions/2026-04-19-session-63-worker-generate-bullmq-wiring.md) — 세션 63 worker-generate wiring.
- [progress/sessions/2026-04-19-session-65-consumer-queue-metrics.md](../../progress/sessions/2026-04-19-session-65-consumer-queue-metrics.md) — 세션 65 Worker 래퍼 + 모드 2종 + consumer 메트릭.
- [progress/sessions/2026-04-19-session-68-queue-duration-precision.md](../../progress/sessions/2026-04-19-session-68-queue-duration-precision.md) — 세션 68 wait+process duration 정밀화.
