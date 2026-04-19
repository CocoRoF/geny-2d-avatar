# Session 62 — `createBullMQDriverFromRedis()` 실 bullmq + ioredis 어댑터 (X+1)

**날짜**: 2026-04-19
**워크스트림**: Platform / Infra · Pipeline (docs/14 §9)
**참조**: `progress/plans/bullmq-driver-prework.md` §4 — **X+1 단계** · `progress/adr/0006-queue-persistence.md` §D3 · 세션 60 (계약) · 세션 61 (idempotency pass-through)

---

## 1. 범위

`@geny/job-queue-bullmq` 패키지에 실 `bullmq@^5` + `ioredis@^5` 를 도입하고 `BullMQDriver` 인터페이스 를 실 `Queue` 로 구현하는 어댑터 `createBullMQDriverFromRedis(client, { queueName })` 를 추가. ADR 0006 §2.4 테스트 포인트 1·2·3 을 **실 Redis 바이너리 위에서 재검증**할 수 있는 통합 테스트 (`tests/redis-integration.test.ts`) 를 `REDIS_URL` env-gated 형태로 탑재.

**비-범위**: `apps/worker-generate` bootstrap wiring (`--driver bullmq` 플래그, `REDIS_URL` env 소비, `Worker` 프로세스 bootstrap) 은 **세션 63** 에서 도착. 본 세션은 어댑터만.

---

## 2. 산출물

### 2.1 `packages/job-queue-bullmq/package.json`

- `dependencies` 에 `bullmq: ^5` + `ioredis: ^5` 추가. `pnpm add -F @geny/job-queue-bullmq bullmq ioredis` 로 설치 → pnpm-lock 업데이트.
- 기존 `@geny/ai-adapter-core` workspace dep 는 유지 (현재 실제로 import 하진 않지만 공개 API 에 `JobRecord`/`JobStatus` 가 존재 — 세션 60 설계 그대로).

### 2.2 `packages/job-queue-bullmq/src/driver-redis.ts` (신규)

`createBullMQDriverFromRedis(client: Redis, opts: { queueName, jobName?, defaultJobOptions?, extraQueueOptions? }): BullMQDriver`.

- 내부: `new Queue(queueName, { connection: client, ...defaultJobOptions?, ...extraQueueOptions })`.
- `add({ jobId, data })` → `queue.add(jobName, data, { jobId })` → `jobToSnapshot(job)`.
- `getJob(id)` → `queue.getJob(id)` (null 패스스루).
- `listJobs()` → `queue.getJobs(["waiting", "active", "delayed", "completed", "failed"], 0, 999, true)` → `Promise.all(map(jobToSnapshot))`.
- `getCounts()` → `queue.getJobCounts("waiting", ..., "delayed")` 5 상태.
- `close()` → `queue.close()` (idempotent via `closed` flag).

`jobToSnapshot(job)` 헬퍼: `await job.getState()` + `job.data` + optional fields (`processedOn`/`finishedOn`/`returnvalue`/`failedReason`) 를 `exactOptionalPropertyTypes` 대응 조건부 spread.

### 2.3 `packages/job-queue-bullmq/src/index.ts`

- 기존 exports 하단에 `createBullMQDriverFromRedis` 와 `CreateBullMQDriverFromRedisOptions` 타입 re-export.

### 2.4 `packages/job-queue-bullmq/tests/redis-integration.test.ts` (신규)

4 테스트. 모두 `maybeTest(name, fn)` 래퍼로 선언 — `REDIS_URL` env 가 설정돼 있지 않으면 `node:test` 의 `{ skip: "REDIS_URL not set" }` 경로로 **스킵**.

- **포인트 1** (동일 jobId 재호출) — `driver.add({ jobId })` 2회 → 같은 id 반환 + `waiting+active+delayed === 1`. BullMQ 공식 멱등 보장의 실 Redis 재현.
- **포인트 2** (특수문자 jobId) — `abc:123.def_456-789-<now>` id 로 저장·조회 round-trip.
- **포인트 3** (128-char boundary) — `padEnd(128, "x")` 로 정확히 128 글자 id 저장 + `counts.waiting>=1` 관찰.
- **null getJob + close 멱등** — 존재하지 않는 id 조회 null, `close()` 2회 no-op.

테스트 간 격리: 각 테스트가 `queueName = geny-test-${Date.now() + N}` 로 **서로 다른 큐** 에서 돌도록 분리. `idempotency_key` 는 `Date.now() + random` 접미사로 재실행 간에도 고유.

### 2.5 `scripts/test-golden.mjs` step 21 (변경 없음)

step 21 (`runJobQueueBullMQTests`) 이 `pnpm -F @geny/job-queue-bullmq test` 를 호출 → integration test 는 Foundation 로컬/CI 에 `REDIS_URL` 이 없으므로 자동 skip, 기존 9 테스트는 그대로 pass. 골든 불변.

---

## 3. 설계 결정

### D1. **env-gated integration test** (Testcontainers 의존 도입 없음)

Foundation CI 는 Redis 없이 돌아야 하므로 `REDIS_URL` 미설정 → **전 suite skip** 경로 채택. Testcontainers 를 devDep 으로 추가하면 CI 에 Docker daemon 의존이 붙어 저렴한 unit test 레인이 무거워짐. 대신 개발자 로컬 / staging CI 에서는 환경변수만 주면 같은 테스트가 그대로 실행됨:

```sh
docker run -d --rm -p 6379:6379 redis:7.2-alpine
REDIS_URL=redis://127.0.0.1:6379 pnpm -F @geny/job-queue-bullmq test
```

ADR 0006 §2.4 포인트 4 (`removeOnComplete` TTL 후 재제출) 는 perf-harness + staging Redis 환경에서 검증할 계획 (X+4 staging). 여기선 Foundation 이 커버할 수 있는 3 포인트만.

### D2. 어댑터가 **ioredis connection 을 소유하지 않음**

`createBullMQDriverFromRedis(client, ...)` 는 호출자가 만든 `Redis` 인스턴스를 **받아쓰기만** 함. `close()` 는 `queue.close()` 만 호출하고 `client.quit()` 은 하지 않음. 이유:

1. 테스트/애플리케이션이 **같은 Redis connection 을 다른 용도** (별도 pub/sub, bookkeeping) 로 공유할 수 있음. connection 멀티유즈는 ioredis 의 표준 패턴.
2. `QueueEvents` 를 나중에 합칠 때도 같은 connection 을 재사용할 수 있어 fd 절약.
3. 통합 테스트는 `try { ... } finally { await driver.close(); await client.quit(); }` 로 lifecycle 을 명시적으로 구분 — "어댑터가 client 까지 닫는" 블랙박스는 예상 밖 동작.

### D3. `listJobs()` 를 페이지 0~999 전수 조회 (페이징 API 미노출)

Foundation MVP 는 `GET /jobs` 가 전체 목록을 리턴한다고 이미 계약돼 있음 (router.test). 실 Redis 에서 1000 건을 넘어서는 시점은 perf staging 이므로 현재는 `getJobs(states, 0, 999, true)` 고정. 페이징 API (`listJobs({ cursor, limit })`) 노출은 **X+2 (세션 64 후보) scale-out** 이후.

### D4. `setImmediate` 백그라운드 실행 훅은 **Redis 어댑터에는 없음**

세션 60 `createBullMQJobStore` 의 `setImmediate(() => execute(...))` 은 fake driver 로는 Worker 가 없으니 직접 `orchestrate` 를 실행하기 위한 훅. 실 Redis 환경에서는 `Worker` 프로세스가 consumer 를 돌리므로 이 훅이 **필요 없고**, 본 어댑터는 그 훅을 끄지 않음 — 세션 63 bootstrap 에서 `createBullMQJobStore({ driver: createBullMQDriverFromRedis(...), orchestrate: ?? })` 의 `orchestrate` 를 no-op 또는 폴링 loop 로 바꿀 예정. 어댑터 자체는 그 결정과 무관.

### D5. `readonly as const` 배열 → 인라인 리터럴로 교체 (TS 타입 workaround)

`queue.getJobs(states, ...)` 의 시그니처는 `JobType | JobType[]` 을 받음 — `readonly JobType[]` 은 불가. `const JOB_STATES = ["waiting", ...] as const` 로 뽑으면 `readonly` 가 붙어 TS 2345. 해결: `queue.getJobs(["waiting", "active", "delayed", "completed", "failed"], 0, 999, true)` 인라인 리터럴로 mutable 추론.

대안 `Array.from([...] as const)` 는 불필요한 copy + 의미 모호. 현재는 5 상태 고정이라 인라인 OK.

---

## 4. 테스트 카운트 변화

| 패키지 | before | after (REDIS_URL 미설정) |
|---|---|---|
| `@geny/job-queue-bullmq` | 9 pass | 9 pass + 4 skip (total 13) |
| golden step | 21 | 21 (불변) |
| 모든 다른 패키지 | 불변 | 불변 |

`REDIS_URL` 설정 시: 9 + 4 = 13 pass (로컬 verified 필요 — 이 세션엔 Redis 없이 skip 경로만 확인).

---

## 5. 영향 · 불변식

- **`pnpm -F @geny/job-queue-bullmq build` 성공** — `dist/driver-redis.js` + `.d.ts` 생성.
- **`pnpm -F @geny/job-queue-bullmq test` — 9 pass + 4 skip** (env 미설정 기본).
- **`node scripts/test-golden.mjs` — 21 step 전수 pass**.
- `apps/worker-generate/*` — 변경 없음. bootstrap wiring 은 세션 63.
- `@geny/orchestrator-service`, `@geny/metrics-http` — 변경 없음.
- `pnpm-lock.yaml` — bullmq + ioredis 의존성 그래프 추가.

---

## 6. 다음 세션 예고

- **세션 63**: `apps/worker-generate/src/bootstrap.ts` 에 `--driver bullmq` flag + `REDIS_URL` env 소비. `createBullMQDriverFromRedis(new IORedis(REDIS_URL))` 배선. 별 프로세스 `Worker` 로 consumer 분리 (`orchestrate` 는 worker 쪽에서 실행). `geny_queue_*` 메트릭 sampler (세션 50 카탈로그 결선) 도 같이.
- **세션 64 후보**: Helm chart 확장 — `infra/helm/redis/` 7.2-alpine + `infra/helm/worker-generate/` 에 `--driver bullmq` 매니페스트.
- **세션 65 후보**: `perf-harness --driver bullmq` staging 대조 — ADR 0006 §2.4 포인트 4 (TTL 후 재제출) 실 Redis 검증.

---

## 7. 참조 파일

- `packages/job-queue-bullmq/src/driver-redis.ts` (NEW)
- `packages/job-queue-bullmq/src/index.ts`
- `packages/job-queue-bullmq/tests/redis-integration.test.ts` (NEW)
- `packages/job-queue-bullmq/package.json`
- `progress/plans/bullmq-driver-prework.md` §4 (X+1 단계)
- `progress/adr/0006-queue-persistence.md` §D3 · §2.4
- `progress/sessions/2026-04-19-session-60-bullmq-driver-x.md` (계약)
- `progress/sessions/2026-04-19-session-61-idempotency-passthrough.md` (idempotency pass-through)
