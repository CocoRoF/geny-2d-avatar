# Session 60 — BullMQ 드라이버 실장 (ADR 0006 §D3 X 단계)

**날짜**: 2026-04-19
**워크스트림**: Platform / Infra · Pipeline (docs/14 §9)
**계획 참조**: `progress/plans/bullmq-driver-prework.md` §4 — Runtime 드라이버 교체 세션 5단계 중 **X 단계**
**ADR 참조**: `progress/adr/0006-queue-persistence.md` §D3 (세션 53 에서 3 선행조건 완결 → 본 세션이 X 실장)

---

## 1. 범위

`@geny/job-queue-bullmq` **v0.1.0** 패키지 신설. `apps/worker-generate/src/job-store.ts` 의 인-메모리 FIFO `JobStore` 와 동일한 인터페이스를 유지하면서 **실행/저장 경로를 `BullMQDriver` 추상으로 위임**하는 팩토리 `createBullMQJobStore()` 제공.

실 `bullmq` / `ioredis` 의존성은 이번 세션에 **도입하지 않음** — 인터페이스 + fake in-process driver 로 ADR 0006 §D3.2 테스트 포인트 3종을 계약 수준에 고정. 실 BullMQ 결선은 **세션 61 (X+1)** 에서 worker-generate wiring 과 함께 도착.

---

## 2. 산출물

### 2.1 새 패키지 `packages/job-queue-bullmq/`

- **`package.json`** — `@geny/job-queue-bullmq@0.1.0`, `type: module`, Node ≥22.11, `@geny/ai-adapter-core` workspace 의존, TypeScript 5.6 devDep. `main` = `./dist/index.js`.
- **`tsconfig.{json,build.json,test.json}`** — `@geny/metrics-http` 와 동일 3-config 패턴 (strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` + NodeNext).
- **`src/driver.ts`** — `BullMQDriver` 인터페이스 계약. 핵심 타입:
    - `BullMQJobData = { payload, idempotency_key, submitted_at }` (`queue.add` 의 `data` 포장).
    - `BullMQJobState` 8 상태 (`waiting`/`delayed`/`waiting-children`/`prioritized`/`active`/`completed`/`failed`/`unknown`).
    - `BullMQJobSnapshot` — id/state/data/returnvalue/failedReason/timestamp/processedOn/finishedOn (BullMQ 5.x `Job` 형상 미러).
    - `BullMQDriver` — `add({ jobId, data })` (멱등: 동일 jobId 재호출 시 기존 snapshot 그대로) · `getJob(id)` · `listJobs()` · `getCounts()` · `close()`.
    - `BullMQQueueCounts` — waiting/active/completed/failed/delayed 4+1 카운트 (세션 50 `geny_queue_depth` gauge 소스).
    - `mapBullMQState(state)` — 8 BullMQ 상태 → `JobStatus` 4종 매핑 (single source of truth, driver 와 JobStore 양쪽에서 참조).
- **`src/job-store.ts`** — `createBullMQJobStore({ driver, orchestrate, now? })` 팩토리.
    - `submit(task)`: `task.idempotency_key` 를 **원문 그대로** `driver.add({ jobId })` 로 넘김 (ADR 0006 §D3.2). 동일 키 재제출 시 기존 `JobRecord` 즉시 반환 (driver + 로컬 캐시 양쪽에서 dedup).
    - `orchestrate` 호출은 **같은 프로세스 `setImmediate` 로 백그라운드 실행** — X 단계의 의도적 축약. 실 BullMQ 바인딩(X+1) 에서는 별 프로세스 `Worker` 가 consumer 를 돌리므로 이 훅이 사라짐 (D3).
    - 상태 매핑은 `mapBullMQState()` 단일 경로. driver snapshot 이 null 이면 로컬 캐시 폴백 — `removeOnComplete` TTL 이후에도 recent record 조회 가능.
    - `waitFor(id, timeoutMs?)` / `drain(timeoutMs?)` / `stop()` — in-memory FIFO 와 동일한 의미론 (X+1 에서 polling 으로 교체 가능).
- **`src/index.ts`** — public re-exports (`createBullMQJobStore` + 타입 + `mapBullMQState`).
- **`tests/job-store.test.ts`** — 9 테스트. fake in-process `BullMQDriver` 를 주입.

### 2.2 `scripts/test-golden.mjs` step 21 추가

`20→21 step`. `runJobQueueBullMQTests()` — `pnpm -F @geny/job-queue-bullmq test`. `ai-adapter-core` dist 는 step 8 에서 이미 빌드되므로 workspace 참조는 자연 해제.

헤더 주석 §21 명시: ADR 0006 §D3 X 단계 / 인터페이스 계약 + idempotency / 실 BullMQ 바인딩은 X+1 세션.

### 2.3 `progress/INDEX.md` 갱신

- §3 Pipeline row — `@geny/job-queue-bullmq v0.1.0 (세션 60, X 단계)` 명시 + BullMQ 결선은 X+1.
- §3 Platform/Infra row — `test:golden` 20→**21 step**.
- §6 골든셋 회귀 — step 21 = job-queue-bullmq 9 tests 추가.
- §4 세션 로그 row 60.
- §8 rotate — 60 제거, 63/64 후보 추가.

---

## 3. 설계 결정

### D1. 실 `bullmq`/`ioredis` 의존성 **도입 거부** — 인터페이스 + fake driver 만

**이유**: Foundation CI 는 Redis 를 띄우지 않음. `ioredis-mock` 으로는 BullMQ 5.x 의 Lua 스크립트 + Redis 7 streams 동작을 완전히 재현 불가 (실측: `queue.add` 의 jobId dedup 까지는 재현하지만 `QueueEvents` pub/sub 과 `removeOnComplete` TTL 은 차이). Testcontainers 는 CI 부트 시간이 20~40s 증가.

**채택안**: `src/driver.ts` 가 선언하는 `BullMQDriver` 인터페이스 + fake in-process driver 로 계약을 **세션 60 에서 고정** → 세션 61 에서 `createBullMQDriverFromRedis(redisConn)` 어댑터만 추가하면 실 BullMQ 로 스위칭. 단위 테스트는 계약 수준에서 ADR 0006 §D3 테스트 포인트 5종 중 3종 (idempotency / 특수문자 jobId / 128-char boundary) 커버. 나머지 2종 (removeOnComplete retention / HTTP e2e) 은 Redis 가 있어야 검증 가능 → 세션 61 (X+1) + 세션 64 (X+4 staging perf-harness).

**대안 각하**:
- `Testcontainers` 를 바로 쓰는 안 — CI 부트 비용 + docker-in-docker 복잡도. Runtime 스테이징 단계에서 재평가 (X+4 에 귀속).
- `ioredis-mock` — 위에서 재현성 미흡. 계약 수준 테스트보다 신뢰도 낮음.

### D2. `task.idempotency_key` → `jobId` **원문 패스스루**

ADR 0006 §D3.2 (세션 53 §2) 결정 그대로. `submit` 안에서 `driver.add({ jobId: task.idempotency_key, data })`. 해시/UUID 변환 거부 — traceability 유지 (Redis key `bull:{queue}:{key}` 에서 원문 키로 역추적 가능).

스키마 `ai-adapter-task.schema.json` 의 `idempotency_key` 정규식 `^[A-Za-z0-9._:-]{8,128}$` 은 이미 router 의 schema validation 에서 차단 → driver 계약은 "유효 범위 key 를 받는다" 를 전제하고 추가 검증 없음. 테스트에서 128-char boundary 와 `abc:123.def_456-789` (모든 허용 특수문자) 확인.

### D3. `orchestrate` 실행을 **`setImmediate` 로 다음 매크로태스크 연기**

fake driver 의 `queue.add` 는 마이크로태스크로 resolve. submit 이 `await driver.add(...)` 후 즉시 execute() 를 호출하면 `execute` 의 동기 구간(`rec.status = "running"`)이 submit 반환 전에 실행됨 → 호출자는 `rec.status === "queued"` 를 관측 불가.

**채택**: `setImmediate(() => execute())` 로 다음 event loop tick 까지 연기. `await submit(...)` 이 `queued` 상태로 resolve 된 뒤 그 다음 tick 에 execute 가 시작. 테스트 `submit → queued → running → succeeded` 가 결정론적으로 통과.

이 훅은 **X+1 세션에서 사라짐** — 실 BullMQ Worker 는 별 프로세스에서 consumer 를 돌리므로 submit 은 driver.add 반환만 받고 execute 는 워커 process 가 독립 스케줄.

### D4. 로컬 `records` 캐시를 driver snapshot 과 **이중 저장**

`removeOnComplete: { age: 3600 }` 이 Runtime 튜닝 대상(§prework §2.3) — driver 가 TTL 이후 `getJob` 에 null 을 반환해도 JobStore 호출자는 최근 record 를 얻을 수 있어야 `GET /jobs/{id}` 가 404 로 떨어지지 않음. 따라서 `records: Map<jobId, JobRecord>` 로 로컬 캐시 + waiter fulfill 을 driver snapshot 과 **이중 저장**.

`get(id)`: 캐시 hit → 반환, miss 시 `driver.getJob(id)` 로 out-of-band job (worker 가 다른 submitter 로부터 받은 잡) 까지 폴백.

### D5. `stop()` 은 driver.close 위임 + inflight 드레인

in-memory FIFO 는 `stop()` 이 내부 루프를 끔. BullMQ 드라이버는 connection 을 끊어야 할 책임이 있으므로 `driver.close()` 에 위임. 동시에 `setImmediate` 로 띄운 inflight orchestrate 가 끝날 때까지 `Promise.allSettled` — 의도치 않은 중단 금지.

---

## 4. 테스트 커버리지 (9 tests)

| # | 테스트 | 검증 대상 | ADR 0006 §D3 포인트 |
|---|---|---|---|
| 1 | `mapBullMQState: 8 BullMQ states → 4 JobStatus` | 상태 매핑 단일 진실 공급원 | — |
| 2 | `submit → queued → running → succeeded` | orchestrate 배선 happy path | — |
| 3 | **동일 `idempotency_key` 재제출** | driver queue 잡 1개 · orchestrate 1회 · 같은 job_id 반환 | **§2.4 포인트 1** |
| 4 | **특수문자 `abc:123.def_456-789`** | Redis 키 저장 + 조회 | **§2.4 포인트 2** |
| 5 | **128-char boundary** | schema 상한 key 처리 | **§2.4 포인트 3** |
| 6 | `orchestrate throw → failed + error payload` | error code 매핑 (VENDOR_ERROR_5XX 등) | — |
| 7 | `get(id) — 캐시 miss → driver 폴백; 없는 id → undefined` | D4 이중 저장 계약 | — |
| 8 | `drain() — 대기/실행 중 잡 모두 최종 상태` | wait 계약 | — |
| 9 | `stop() — driver.close 멱등` | teardown | — |

X+1 세션에서 추가할 2종:
- **§2.4 포인트 4** — `removeOnComplete` TTL 후 동일 key 재제출 → 새 잡 (Redis 필요).
- **§2.4 포인트 5** — `HTTP POST /jobs` e2e, 같은 body 2회 → 같은 `job_id` (worker-generate wiring 필요).

---

## 5. 영향 · 불변식

| 항목 | 변화 |
|---|---|
| `validate-schemas checked` | 244 → 244 (스키마 변화 없음) |
| `test:golden` step | **20 → 21** (`job-queue-bullmq tests` 추가) |
| `apps/worker-generate` | **변화 없음** (인-메모리 FIFO 기본 유지, wiring 은 X+1) |
| `@geny/orchestrator-service` | 변화 없음 |
| 기존 9 package test count | 불변 — 새 패키지만 추가 |

---

## 6. 다음 세션 예고 (X+1 — 세션 61)

1. **`packages/job-queue-bullmq/src/driver-redis.ts`** 신설 — `createBullMQDriverFromRedis(redisConn)` 어댑터. 실 `bullmq@^5.x` + `ioredis@^5.x` dep 추가. Testcontainers Redis 기반 integration test 1종 (§2.4 포인트 4 + 5 커버).
2. **`apps/worker-generate/src/bootstrap.ts`** — `--driver bullmq` flag 해석 + `process.env.REDIS_URL` 로 connection 구성. 기본값은 여전히 `createJobStore()` 인-메모리 (dev 편의).
3. `apps/worker-generate/src/router.ts` `handleSubmit` 한 줄 변경 — `crypto.randomUUID()` 대신 `task.idempotency_key` 를 `store.submit` 에 pass-through (prework §2.5 예고).
4. `scripts/perf-harness.mjs --driver bullmq` 옵션 — X+4 세션 (staging) 에서 p95 regression.

---

## 7. 참조 파일

- `packages/job-queue-bullmq/src/{driver,job-store,index}.ts`
- `packages/job-queue-bullmq/tests/job-store.test.ts`
- `scripts/test-golden.mjs` step 21
- `progress/plans/bullmq-driver-prework.md` §2, §4
- `progress/adr/0006-queue-persistence.md` §D3
- `apps/worker-generate/src/job-store.ts` (인터페이스 원본)
