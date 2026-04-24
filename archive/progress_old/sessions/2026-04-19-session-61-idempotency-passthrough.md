# Session 61 — 인-메모리 JobStore idempotency_key pass-through + dedupe

**날짜**: 2026-04-19
**워크스트림**: Pipeline (docs/14 §9)
**참조**: `progress/plans/bullmq-driver-prework.md` §2.5 (예고된 한 줄 변경) · `progress/adr/0006-queue-persistence.md` §D3.2 · 세션 60 (`createBullMQJobStore` 계약)

---

## 1. 범위

`apps/worker-generate/src/job-store.ts` 의 in-memory FIFO `JobStore` 를 **세션 60 `createBullMQJobStore` 와 동일한 `idempotency_key` 계약**으로 정렬:

1. `job_id = task.idempotency_key` **원문 패스스루** — `jobIdFn` 옵션 제거, `crypto.randomUUID()` 호출 삭제.
2. 동일 `idempotency_key` 재제출 시 **기존 `JobRecord` 를 그대로 반환** (새 엔트리 생성 없음, `orchestrate` 중복 실행 없음). BullMQ `queue.add({ jobId })` 멱등과 같은 계약.

이로써 Runtime 드라이버 교체(세션 62+) 가 인-메모리 → BullMQ 로 전환될 때 **HTTP 응답 `job_id` 포맷이 불변** — 클라이언트 관점에서 드라이버 교체가 투명.

---

## 2. 변경

### 2.1 `apps/worker-generate/src/job-store.ts`

- `CreateJobStoreOptions.jobIdFn?` 필드 제거 (테스트 결정성을 위한 옵션이었으나 `idempotency_key` 자체가 이미 결정론적 식별자).
- `cryptoRandomUUID()` 헬퍼 제거.
- `submit(task)` 내부:
    - `const id = task.idempotency_key`
    - `const existing = jobs.get(id); if (existing) return existing;`
- 파일 헤더 주석 — 새 계약 2항목 명시 + `@geny/job-queue-bullmq` cross-ref.

### 2.2 `apps/worker-generate/tests/job-store.test.ts`

- `submit → queued → running → succeeded` 테스트 — `jobIdFn` 제거, `idempotency_key="happy-001"` 로 `job_id==="happy-001"` 어서션 추가.
- **신규**: `동일 idempotency_key 재제출 → 같은 record, orchestrate 1회만 실행` — same-object 참조(`strictEqual(first, second)`) + `calls===1` + `list().length===1`.
- FIFO / list 테스트 — `jobIdFn` 제거, 테스트들이 이미 각기 다른 `idempotency_key` 를 쓰고 있어 로직 변경 불필요.

### 2.3 `apps/worker-generate/tests/router.test.ts`

- `POST /jobs → 202 + GET /jobs/{id}` — `idempotency_key="req-aaaa-0001"` 고정, 응답 `job_id` 가 그대로 되돌아오는지 확인.
- **신규**: `POST /jobs 같은 body 2회 → 같은 job_id (prework §2.4 포인트 5)` — HTTP 레벨 e2e 멱등 검증. 두 응답의 `job_id` 동일 + `orchestrate` 1회 + `list().length===1`.
- `GET /jobs 전체 목록 반환` — 각 잡에 distinct `idempotency_key` 명시.

---

## 3. 설계 결정

### D1. `jobIdFn` 옵션 **완전 제거** (테스트 결정성은 `idempotency_key` 자체가 제공)

기존 옵션의 쓰임은 테스트에서 `"job-1"`, `"id-1"` 같이 결정론적 id 를 주입하는 용도였음. `idempotency_key` 가 이미 태스크별 고정 식별자 역할을 하므로 테스트 주입 훅은 불필요. 옵션 제거로 **계약 축소** — "in-memory store 는 언제나 idempotency_key 를 job_id 로 쓴다" 만 유지.

### D2. 재제출 시 **같은 object 참조**(not copy) 반환

`return existing` 으로 `jobs.get(id)` 의 `JobRecord` 를 그대로 반환. 새 제출자가 이전 submit 과 같은 레퍼런스를 받으면, `store.waitFor` 이 이미 완료 상태인 경우 즉시 resolve — 호출자 관점에서 race 없이 동일 결과.

**대안**: 얕은 복사 반환 → 불필요한 메모리 + `status` 돌연 변이의 관찰 불일치 위험. 기각.

### D3. `submit` 시그니처 여전히 **동기** 유지

BullMQ 드라이버의 `createBullMQJobStore.submit` 은 `async Promise<JobRecord>`. in-memory FIFO 의 `createJobStore.submit` 은 **sync `JobRecord` 반환** 으로 남김 — 호출자(`router.ts handleSubmit`) 가 두 드라이버를 동시 지원할 필요 없음 (wiring 세션 62 에서 bootstrap 레벨 driver 분기).

대신 두 드라이버 모두 계약 불변식은 일치:
- `job_id === task.idempotency_key` (원문 패스스루, 해시/UUID 변환 없음)
- 동일 key 재제출 → 같은 `JobRecord`, orchestrate 1회만

### D4. 삭제된 `cryptoRandomUUID()` 를 대체 헬퍼로 남기지 않음

deadcode. 유일하게 `jobIdFn` 디폴트로만 쓰였으므로 옵션 제거와 함께 헬퍼도 제거. `globalThis.crypto.randomUUID()` 가 필요한 미래 호출자는 직접 부르면 됨 (추상화할 가치 없음).

---

## 4. 테스트 카운트 변화

| 패키지 | before | after |
|---|---|---|
| `@geny/worker-generate` | 16 | **18** (+2: in-memory dedupe 1 + HTTP 멱등 1) |
| `@geny/job-queue-bullmq` | 9 | 9 (불변) |
| golden step | 21 | 21 (불변) |

`scripts/test-golden.mjs` 설명 §19 worker-generate row 에는 테스트 수 변화만 반영 (주석만).

---

## 5. 영향 · 불변식

- **`validate-schemas checked=244`** — 스키마 변화 없음.
- **`test:golden` step 21 pass** — 변화 없음.
- `apps/worker-generate/src/router.ts` — **변화 없음** (job_id 를 결정하는 책임은 전부 JobStore 에 위임). prework §2.5 의 "router 한 줄 변경" 은 실제로는 **job-store 한 줄 변경** 이 더 정확한 표현.
- `@geny/orchestrator-service`, `@geny/metrics-http`, `packages/job-queue-bullmq` — 변화 없음.

---

## 6. 다음 세션 예고

- **세션 62**: `@geny/job-queue-bullmq` 에 `createBullMQDriverFromRedis(redisConn)` 어댑터 추가 (실 `bullmq@^5` + `ioredis@^5` dep). `apps/worker-generate/src/bootstrap.ts` 에 `--driver bullmq` flag + `REDIS_URL` env. Testcontainers Redis 기반 integration test 로 ADR 0006 §2.4 포인트 4 (removeOnComplete 후 재제출) + 실 Redis 바인딩의 queue metric sampler (X+2).
- **세션 63 후보**: `orchestrator-service --driver bullmq` flag + `geny_queue_*` 메트릭 sampler 실장 (세션 50 카탈로그 결선).
- **세션 64 후보**: Helm chart 확장 — `infra/helm/redis/` 7.2-alpine + `infra/helm/worker-generate/` 에 `--driver bullmq` 매니페스트 + `perf-harness --driver bullmq` staging 대조.

---

## 7. 참조 파일

- `apps/worker-generate/src/job-store.ts`
- `apps/worker-generate/tests/job-store.test.ts`
- `apps/worker-generate/tests/router.test.ts`
- `progress/plans/bullmq-driver-prework.md` §2.5
- `progress/adr/0006-queue-persistence.md` §D3.2
- `packages/job-queue-bullmq/src/job-store.ts` (계약 짝)
