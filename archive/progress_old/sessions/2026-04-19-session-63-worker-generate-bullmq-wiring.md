# Session 63 — `apps/worker-generate` `--driver bullmq` bootstrap wiring (ADR 0006 §D3 X+1 완결)

**날짜**: 2026-04-19
**워크스트림**: Pipeline · Platform / Infra (docs/14 §9)
**참조**: `progress/plans/bullmq-driver-prework.md` §4 — **X+1 단계 bootstrap** · `progress/adr/0006-queue-persistence.md` §D3 · 세션 60 (`createBullMQJobStore` 계약) · 세션 61 (idempotency pass-through) · 세션 62 (`createBullMQDriverFromRedis` 어댑터)

---

## 1. 범위

`apps/worker-generate` 가 런타임에 `--driver bullmq`(+`REDIS_URL` env) 플래그 하나로 인-메모리 FIFO JobStore 대신 `@geny/job-queue-bullmq` 의 실 `BullMQDriver` 기반 JobStore 를 쓰도록 **bootstrap wiring** 도입.

핵심 설계 축 **= `JobStore` 인터페이스 async 통일**: 세션 60 `BullMQJobStore.submit` 은 `Promise<JobRecord>` 지만 세션 61 까지 worker-generate 의 in-memory `JobStore.submit` 은 **sync** 였다. 세션 63 에서 양쪽을 `async submit` 으로 맞춰 router·tests·perf-harness 가 드라이버 교체에 **투명**하도록 만든다.

**비-범위**: 별 프로세스 `Worker` 로 consumer 분리 + `geny_queue_*` 메트릭 sampler (QueueEvents 구독 + `Queue.getJobCounts()` 폴링) 는 **세션 64**. Helm chart 확장도 세션 64. 이번 세션은 **단일 프로세스 내 BullMQ 경로 수직 배선만**.

---

## 2. 산출물

### 2.1 `apps/worker-generate/src/job-store.ts` — async JobStore

- `submit(task)` → `Promise<JobRecord>` (기존 sync → async)
- `get(id)` → `Promise<JobRecord | undefined>`
- `list()` → `Promise<readonly JobRecord[]>`
- 내부 로직은 그대로 (FIFO `order` 배열 + `pending` 큐 + `waiters` Map). 구현체는 `async submit` 이라 `return rec` 이 `Promise.resolve(rec)` 로 자동 포장.
- **백그라운드 루프 kick-off 를 `queueMicrotask` → `setImmediate` 로 변경**. 이유: `async submit(task)` 의 호출자는 `await store.submit(...)` 로 소비 → 그 `await` 의 마이크로태스크 체인이 먼저 완료되고 `status === "queued"` 를 관측할 수 있어야 한다. `queueMicrotask` 는 같은 틱에 돌아서 loop 가 `submit.await` 보다 먼저 진입하면 record 가 이미 `running` 상태. `setImmediate` (매크로태스크) 로 한 틱 늦춰 **세션 60 `createBullMQJobStore` 와 동일한 설계** 로 수렴.

### 2.2 `apps/worker-generate/src/router.ts`

- `/jobs` GET → 별 `handleList(res, store, headOnly)` 함수로 분리해 `await store.list()`.
- `/jobs/{id}` GET → `handleGet(res, store, id, headOnly)` 함수 — `await store.get(id)`.
- `/jobs` POST → `handleSubmit` 의 `store.submit(task.task)` 를 `await` 하고 **try/catch 503** 추가. BullMQ 경로에서 Redis 연결 실패 시 라우터가 503 을 돌려주는 계약 고정 (기존 in-memory 는 throw 케이스가 `stopped` 후 재제출 밖에 없어 암묵적으로 500 이었음).
- **URL path regex**: `/^\/jobs\/([A-Za-z0-9_.:-]+)$/` 로 확장 (기존 `[A-Za-z0-9_-]+`). 이유: `idempotency_key` spec `^[A-Za-z0-9._:-]{8,128}$` 가 `.` 와 `:` 를 허용 — 이제 job_id 가 원문 패스스루(세션 61) 라서 그대로 URL 에 실려 들어옴. BullMQ integration 포인트 2 (`abc:123.def_456-789`) 와 정합.

### 2.3 `apps/worker-generate/src/index.ts`

- `JobStoreFactory = (orchestrate) => JobStore` 타입 신규 export.
- `CreateWorkerGenerateOptions.storeFactory?: JobStoreFactory` 추가.
- `createWorkerGenerate` 내부: `opts.storeFactory` 가 있으면 `opts.storeFactory(orchestrate)` 로 외부 store 주입, 없으면 기존 `createJobStore({ orchestrate })`.
- 순환 초기화 해소: `orchestrate` 는 `ref.current` 를 참조하는 closure 함수라 storeFactory 가 불릴 시점엔 `ref.current` 가 아직 null — 하지만 JobStore 구현체는 `orchestrate` 를 submit/consumer 시점에 부르므로, 그 시점엔 이미 `ref.current = service` 가 완료됨 (파일 끝 줄에서 할당).

### 2.4 `apps/worker-generate/src/main.ts` — CLI 확장

- `--driver in-memory|bullmq` (기본 `in-memory`).
- `--queue-name NAME` (기본 `geny-generate`).
- `--driver bullmq` 시 `buildBullMQStoreFactory(queueName)` 호출:
    - `REDIS_URL` env 가 **반드시 있어야** 함. 미설정 시 explicit throw — 묵시적 in-memory fallback 금지 (ops 혼란 방지).
    - `(await import("ioredis")).Redis` named import (default export 는 TS NodeNext 에서 생성자 추론 실패 — `.Redis` 네임드 사용이 정답).
    - `new Redis(REDIS_URL, { maxRetriesPerRequest: null })` (BullMQ 필수 옵션).
    - `createBullMQDriverFromRedis(client, { queueName })` + `createBullMQJobStore({ driver, orchestrate })`.
    - `closeConnection = async () => { try { await client.quit(); } catch { client.disconnect(); } }` 를 SIGTERM handler 에 연결 — 드레인 후 ioredis quit.
- 로그 라인 끝에 driver/queue/redis 표시 (`driver=bullmq queue=geny-generate redis=redis://...`).

### 2.5 `apps/worker-generate/package.json`

- `dependencies` 에 `@geny/job-queue-bullmq: workspace:*` + `ioredis: ^5` 추가.

### 2.6 `apps/worker-generate/tests/*.test.ts` — async 미러링

- `job-store.test.ts` 6 테스트 전수 `await store.submit(...)` / `(await store.list()).length` / `await assert.rejects(...)` 로 변환. 어서션 의미는 불변.
- `router.test.ts` — `(await store.list()).length` 한 곳만 변경 (HTTP 계약은 이미 async 였음).
- **신규 `wiring.test.ts` #3**: `wiring: storeFactory 주입 → BullMQ 경로로 submit 라우팅 (세션 63)`. fake `BullMQDriver` (in-process Map 기반) 를 `createBullMQJobStore` 에 물려 `storeFactory` 로 주입 → POST /jobs → fake driver 의 `jobs` Map 에 jobId 기록 확인 → `waitFor → succeeded → GET /jobs/{id}` end-to-end. **실 Redis 없이** `--driver bullmq` 배선 경로가 계약 수준 작동함을 회귀. 실 Redis e2e 는 `@geny/job-queue-bullmq` integration suite (세션 62, `REDIS_URL` gated).

### 2.7 `scripts/perf-harness.mjs`

- `worker.store.get(jobId)` → `await worker.store.get(jobId)` (line 111). JobStore.get 이 async 로 바뀌었기 때문에 `rec?.status` 가 Promise 객체의 `.status` 를 읽어 항상 `undefined` 였고, 20/20 잡 모두 "non-succeeded" 로 집계돼 `error_rate_ratio_max` SLO 위반 → golden step 20 실패. 단일 라인 `await` 추가로 해결.

---

## 3. 설계 결정

### D1. `JobStore.submit` **async 통일** (`BullMQJobStore` 와 결선)

세션 61 가 in-memory 를 async 로 안 바꾼 이유는 "드라이버 분기를 bootstrap 레벨에서 처리" 였음. 세션 63 에서 그 분기점이 도착 — `createWorkerGenerate({ storeFactory? })` 가 분기 포인트. 여기서 두 store 타입이 **구조적으로 같아야** 외부 팩토리 교체가 투명. 따라서 async 통일이 필연.

**대안**: `JobStore` 를 `Sync | Async` 유니온으로 두고 router 가 `Promise.resolve(store.submit(task))` 래핑 → `await store.submit(task) instanceof Promise` 분기 → ceremony 폭증. 기각.

### D2. `setImmediate` 백그라운드 루프 kick-off

in-memory store 의 `queueMicrotask` 는 `submit` 이 sync 였기 때문에 "같은 틱에 큐 깨우기 + return rec" 을 원자적으로 할 수 있었다. async 전환 후에는 `await store.submit(...)` 소비자의 마이크로태스크 체인이 loop 와 경쟁 → 테스트 `rec.status === "queued"` 가 반드시 실패. 세션 60 bullmq 팩토리가 이미 `setImmediate` 를 쓰는 이유와 동일 (마이크로태스크 → 매크로태스크 경계로 이동). docs/02 §4 JobRunner 계약에서 "submit 은 queued 상태로 리턴" 이라는 **관찰 가능한 불변식** 을 지키려면 setImmediate 가 정답.

### D3. `--driver bullmq` + `REDIS_URL` 미설정 → **명시적 throw** (묵시적 fallback 금지)

운영 실수 방지 — "bullmq 를 원했는데 env 빠져서 in-memory 로 돌아갔는데 아무도 모름" 상황을 차단. 메시지: `"--driver bullmq 는 REDIS_URL 환경변수를 요구한다 (예: redis://127.0.0.1:6379)"`.

### D4. **단일 프로세스 내 BullMQ** (Worker 프로세스 분리는 세션 64)

prework §4 X+1 범위를 최소로 잡아 `createBullMQJobStore` 의 `setImmediate(orchestrate)` 인-프로세스 훅을 그대로 활용. 별 `Worker` 프로세스로 consumer 분리하면:
- producer (`POST /jobs` HTTP) 프로세스
- consumer (`new Worker(queueName, async (job) => orchestrate(job.data.payload))`) 프로세스
두 프로세스가 생기고, 배포 토폴로지 + Helm + 관측 sampler 가 함께 와야 함. 세션 64 bundle.

본 세션의 `--driver bullmq` 는 **producer + observer 만** 구현 — 큐에 enqueue 하고 같은 프로세스가 `orchestrate` 돌림. 상용 환경에는 부적합(single point of failure), Foundation + 로컬 dev 에서는 drive-in 바디.

### D5. URL path regex 확장 `[A-Za-z0-9_.:-]`

`idempotency_key` spec `^[A-Za-z0-9._:-]{8,128}$` — 세션 61 에서 job_id = idempotency_key 원문 패스스루가 확정. `.` 와 `:` 이 URL path 에 그대로 들어오므로 router regex 가 이를 거부하면 404. BullMQ integration 테스트 포인트 2 (`abc:123.def_456-789`) 와 정합하려면 필수.

### D6. router.ts `POST /jobs` 에 **try/catch → 503**

기존 in-memory 는 `submit` 이 sync 라 throw → Node uncaughtException. BullMQ 경로에서는 `queue.add` 가 Redis 연결 끊기면 `Promise<never>` throw → 라우터가 500 을 돌려주게 두면 ops 대시보드의 `geny_job_*` 카운터와 HTTP 계약 둘 다 noisy. 503 (서비스 일시 불가) + error body 로 명시.

### D7. ioredis `Redis` **named import** (`.default` 아닌)

TypeScript `NodeNext` + `strict` 에서 `(await import("ioredis")).default` 는 `"This expression is not constructable"` (TS 2351). ioredis 의 `built/index.d.ts` 는 `export { default } from "./Redis"; export { default as Redis } from "./Redis";` 이므로 `.default` 와 `.Redis` 가 같은 클래스지만 TS 추론이 후자를 constructable 로 인식. `(await import("ioredis")).Redis` 를 정규로.

참고: `packages/job-queue-bullmq/tests/redis-integration.test.ts` 는 `.default` 를 쓰는데 `tsconfig.test.json` 쪽이 더 관대한 모양 — 추후 통일 PR 후보 (세션 63 범위 밖).

---

## 4. 테스트 카운트 변화

| 패키지 | before | after |
|---|---|---|
| `@geny/worker-generate` | 18 | **19** (+1 storeFactory 주입 wiring) |
| `@geny/job-queue-bullmq` | 9+4 skip | 불변 |
| golden step | 21 | 21 (불변) |
| perf-harness | 3 cases | 3 cases (불변, 내부 await 수정) |

validate-schemas `checked=244` 불변 (스키마 무변).

---

## 5. 영향 · 불변식

- **`pnpm -F @geny/worker-generate test` — 19/19 pass**.
- **`node scripts/test-golden.mjs` — 21 step 전수 pass**.
- **`node scripts/perf-harness.mjs --smoke` — 0 err, tput 2000/s, 전 SLO pass**.
- `apps/worker-generate/dist/` 의 CLI 은 `--driver`/`--queue-name` 플래그 추가 외 동작 불변 (default=in-memory).
- `@geny/orchestrator-service` 불변.
- `@geny/job-queue-bullmq` 코드 불변 (세션 62 산출물 그대로 소비).
- `pnpm-lock.yaml` — worker-generate 에 `ioredis` + `@geny/job-queue-bullmq` 직접 의존 추가.

---

## 6. 다음 세션 예고

- **세션 64**: 별 프로세스 Worker 분리 + `geny_queue_*` 메트릭 sampler. 구조: `apps/worker-generate-consumer/` 신설 (또는 `apps/worker-generate/src/consumer.ts` entry) — `new Worker(queueName, processor, { connection })` 로 BullMQ consumer 돌림. producer 는 `POST /jobs` 로 enqueue 만, consumer 가 `orchestrate` 실행 → `geny_queue_duration_seconds` histogram 분리 측정. `InMemoryMetricsRegistry` 에 `geny_queue_depth` gauge 5 상태 + `geny_queue_enqueued_total` + `geny_queue_failed_total{reason}` + histogram 등록. 주기적 sampler (setInterval 30s) 가 `queue.getJobCounts()` → gauge set. `QueueEvents` `completed`/`failed` 리스너 → counter/histogram observe.
- **세션 65 후보**: Helm chart — `infra/helm/redis/` 7.2-alpine subchart + `infra/helm/worker-generate/` deployment/service/configmap/secret + values-{dev,prod}.yaml + `--driver bullmq` 디폴트. perf-harness `--driver bullmq` 옵션으로 staging Redis 대비 p95 regression.
- **세션 66 후보**: staging Redis 실측 — `REDIS_URL` 주입된 CI 레인 또는 docker-compose 로 `@geny/job-queue-bullmq` integration 4 tests 활성화 + perf 대조.

---

## 7. 참조 파일

- `apps/worker-generate/src/job-store.ts` (async 통일)
- `apps/worker-generate/src/router.ts` (async handlers + regex 확장 + 503)
- `apps/worker-generate/src/index.ts` (`storeFactory` 옵션)
- `apps/worker-generate/src/main.ts` (`--driver bullmq` + REDIS_URL)
- `apps/worker-generate/tests/job-store.test.ts` · `tests/router.test.ts` · `tests/wiring.test.ts`
- `apps/worker-generate/package.json` (+ioredis, +@geny/job-queue-bullmq)
- `scripts/perf-harness.mjs` (await fix)
- `progress/plans/bullmq-driver-prework.md` §4 (X+1 bootstrap)
- `progress/adr/0006-queue-persistence.md` §D3
- `progress/sessions/2026-04-19-session-60-bullmq-driver-x.md`
- `progress/sessions/2026-04-19-session-62-bullmq-redis-adapter.md`
