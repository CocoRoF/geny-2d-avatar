# BullMQ 드라이버 실장 선행 (ADR 0006 체크리스트)

- **관련 ADR**: [0006 — 잡 큐 영속성 전략](../adr/0006-queue-persistence.md)
- **관련 세션**: 44 (worker-generate skeleton), 47 (ADR), 50 (queue metrics), **53 (본 문서)**
- **목적**: Runtime 단계에서 인-메모리 `JobStore` 를 BullMQ 로 교체하기 전에 필요한 **2가지 선행 결정**을 고정한다. 3번째 선행(`geny_queue_*` 메트릭) 은 세션 50 에서 이미 완료.

---

## 1. Redis 배포 토폴로지 결정

### 1.1 Foundation — dev/CI 로컬

- **형태**: 단일 컨테이너 `redis:7.2-alpine` (in-tree docker-compose 는 아직 도입하지 않음 — Foundation 범위에선 인-메모리 JobStore 가 유지됨).
- **접속**: `REDIS_URL=redis://127.0.0.1:6379/0`.
- **영속성**: dev 에선 RDB off (`--save ""`) + AOF off — 프로세스 재시작이 곧 상태 초기화라 잡 재실행 없음.
- **네임스페이스**: `DB 0` — 세션 캐시와 공유하지 않고, 향후 BullMQ prefix 로 분리 (`bull` default). 캐시 DB 와의 충돌 예방은 BullMQ 가 key prefix 로 해결.

### 1.2 Production — Runtime 단계 (β 이전)

- **형태**: **managed Redis** (AWS ElastiCache 7.x / GCP Memorystore 7.x / Upstash Redis) — 자체 운영 회피 (ADR 0006 Context 와 일치).
- **HA 모드**:
  - MVP 규모(`docs/02 §9.3` 큐 길이 < 1k 10분 임계) 에선 **단일 write-primary + 1 read-replica** 로 충분. BullMQ 는 read-replica 를 사용하지 않으므로 replica 는 관측/백업 용도.
  - `replication: true` Cluster 모드 는 **거부** — BullMQ 5.x 는 Cluster 모드에서 `{}` hash tag 로 모든 키를 같은 슬롯에 묶어야 하는 제약이 있고, MVP 에서 얻는 이득이 설정 복잡도를 상쇄하지 못함. β 단계에서 재평가.
- **버전 고정**: **Redis 7+** (BullMQ 5.x 공식 요구 사항 — `FCALL`/`LMPOP`/`XAUTOCLAIM` 등 활용). ElastiCache 6.x 호환 모드는 불가.
- **maxmemory 정책**: `noeviction` — 큐 키는 절대 축출되면 안 됨. 캐시 키는 별도 DB(DB 1) 로 분리하고 거기선 `allkeys-lru` 허용.
- **네트워크**: VPC 내 private endpoint, TLS(rediss://) 필수.

### 1.3 Helm 차트 배치 (Runtime 세션 밑그림)

```
infra/helm/
├── observability/      # 세션 17/24 완료
├── redis/              # Runtime 세션에서 신규 — values.yaml 에 URL 만 선언, 본체는 managed
└── worker-generate/    # Runtime 세션에서 신규 — Deployment + BullMQ 환경변수 주입
```

- `infra/helm/redis/` 는 **차트 본체가 아닌 wrapping chart** 로 시작: `values.yaml` 이 external managed endpoint URL 과 secret ref 만 보관. 자체 운영이 필요해지면 bitnami/redis subchart 를 `dependencies` 에 pin.
- 본 세션(53) 에선 Helm 파일을 추가하지 **않음** — 결정만 고정하고 디렉터리는 Runtime 세션 1커밋에서 생성.

### 1.4 개발자 CLI 진입점

Runtime 세션에서 `Taskfile.yml` 에 다음 task 추가 예정 (본 세션 범위 **밖**):

```yaml
redis:dev:
  desc: Start local Redis 7 container for BullMQ dev
  cmds:
    - docker run -d --rm --name geny-redis -p 6379:6379 redis:7.2-alpine --save "" --appendonly no

redis:dev:stop:
  cmds:
    - docker stop geny-redis
```

개발자 온보딩(`README.md`) 에도 "BullMQ 드라이버 사용 시 `task redis:dev` 선행" 문구 추가.

---

## 2. `idempotency_key` → BullMQ `job.id` 매핑 전략

### 2.1 현재 계약 요약

- `schema/v1/ai-adapter-task.schema.json` `idempotency_key`: `^[A-Za-z0-9._:-]{8,128}$` — 8~128 chars, 제한 문자셋.
- `apps/worker-generate/src/router.ts` `POST /jobs`: `idempotency_key` 를 required string 으로 검증, 하지만 **현재는 사용되지 않음** — `createJobStore` 가 `crypto.randomUUID()` 로 job_id 를 자체 발급.

### 2.2 결정 — `idempotency_key` **원문 그대로** BullMQ `job.id` 로 사용

- **근거**:
  - BullMQ 5.x `queue.add(name, data, { jobId })` 는 jobId 중복 시 **기존 job 반환** — 같은 `idempotency_key` 로 재요청 → 동일 `job_id` 반환 → 진정한 end-to-end 멱등.
  - BullMQ Redis key 는 `bull:{queueName}:{jobId}` 형태 — `:` 가 내부 구분자지만, jobId 내부의 `:` 는 그대로 허용(Redis key parsing 은 prefix 만 관여). 실측: BullMQ 5.x 테스트 스위트에 `:` 포함 jobId 케이스 존재.
  - 해시(sha256) 로 변환 시 **traceability 손실** — 로그 grep 으로 `idempotency_key` 원문 → job 추적이 끊어짐. 디버깅 비용이 편의 이득을 초과.
  - 길이 128 제한 은 BullMQ/Redis key 길이 한도(512 MB) 대비 무한정 안전.
- **기각 대안**:
  - `sha256(idempotency_key)` 해시 사용 — 길이 통일성만 얻고 그 외 이득 없음. 해시 충돌은 비현실적이지만 그에 비해 디버깅 불편이 큼.
  - UUID 재발급 + 별도 `idempotency:{key} → job.id` lookup 인덱스 — 저장 2배 + 원자성 보장 위해 Lua 필요. BullMQ 의 jobId 중복 반환 기능을 재발명하는 꼴.

### 2.3 edge case 명세

| 시나리오 | 기대 동작 |
|---|---|
| 동일 `idempotency_key` 2회 연속 submit (이전 잡 진행 중) | 두 번째 호출은 기존 job 의 state 그대로 반환, 새 잡 생성 없음 |
| 동일 key 재시도, 이전 잡 `completed` + `removeOnComplete: true` 로 purged | **새 잡 생성** — idempotency window = retention window. `removeOnComplete: { age: 3600 }` 로 1시간 창 확보 (Runtime 튜닝 대상) |
| 동일 key 재시도, 이전 잡 `failed` + `removeOnFail: false` | 기존 failed job 반환 — 재시도하려면 명시적 `queue.retryJobs()` 호출 필요. API 설계상 `POST /jobs/{id}/retry` 도입은 Runtime 이후 세션(DLQ 함께). |
| `idempotency_key` 길이 7 이하 or 금지 문자 포함 | router.ts 스키마 검증에서 400 거절 (현재 동작 유지) — BullMQ 에 도달하기 전 차단 |

### 2.4 테스트 포인트 (Runtime 교체 세션 check list)

Runtime 드라이버 교체 PR 이 반드시 포함해야 할 회귀:

- [ ] `queue.add` 에 동일 jobId 2회 호출 → 동일 `job.id` 반환, `queue.getJobCounts()` 의 `waiting` 증가 없음.
- [ ] `idempotency_key = "abc:123.def_456-789"` (모든 허용 특수문자) → Redis 키 정상 저장 + `queue.getJob(id)` 로 읽기 가능.
- [ ] `idempotency_key` 128 chars boundary → 정상 처리.
- [ ] completed job `removeOnComplete` 후 동일 key 재제출 → 새 job 생성되고 이전 outcome 은 조회 불가 (retention 만료 의도).
- [ ] `HTTP POST /jobs` 레벨 e2e: 같은 body 2회 → HTTP 응답 `job_id` 동일.

### 2.5 router.ts 변경 예고

Runtime 드라이버 교체 세션에서 `apps/worker-generate/src/router.ts` `handleSubmit()` 이 `crypto.randomUUID()` 대신 `task.idempotency_key` 를 `createJobStore.submit()` 에 전달하도록 한 줄 변경. 본 세션은 **그 변경을 만들지 않음** — 결정과 테스트 포인트만 고정.

---

## 3. 영향 없음 (명시)

- `@geny/ai-adapter-core` orchestrate 경로 — 변경 없음 (세션 44 wiring 그대로).
- `@geny/metrics-http` — 변경 없음 (세션 50 에서 queue 메트릭 계약 이미 고정).
- `scripts/perf-harness.mjs` — 변경 없음 (세션 51 Mock 경로, BullMQ 무관).
- golden 20 step / validate-schemas checked=186 — 전부 불변.

---

## 4. Runtime 드라이버 교체 세션 (N+1, **본 세션 범위 밖**) 분해 제안

| 세션 | 범위 |
|---|---|
| X | `packages/job-queue-bullmq/` 신설 — `createBullMQJobStore(redisConn, opts)` 팩토리, `JobRecord`/`JobStatus` 매핑 어댑터, BullMQ state → `queued/running/succeeded/failed` 변환. 단위 테스트는 `ioredis-mock` or Testcontainers Redis. |
| X+1 | `apps/worker-generate` 에 `createWorkerGenerate({ store: createBullMQJobStore(...) })` override 훅 배선, `idempotency_key` → `job.id` 매핑 스위칭. In-memory store 는 기본으로 유지(dev 편의). |
| X+2 | `geny_queue_*` 메트릭 연결 — BullMQ `queue.getJobCounts()` 를 주기적으로 sampling 해 `InMemoryMetricsRegistry` 에 gauge 주입. `QueueEvents` 로 completed/failed 시 counter 증가. |
| X+3 | Helm `infra/helm/worker-generate/` + `infra/helm/redis/` wrapping chart. K8s manifest rollout, secret ref (Vault/KMS). |
| X+4 | `scripts/perf-harness.mjs --driver bullmq` 경로 — Redis 붙은 staging 환경에서 p95 regression. |

각 세션 독립 커밋 + 각자의 lint gate 통과.

---

## 5. 결정 요약 표

| 항목 | 결정 | 근거 섹션 |
|---|---|---|
| Foundation Redis | 옵션, 인-메모리 JobStore 유지 | §1.1 |
| Production Redis | managed, 7.2+, primary+1 replica, TLS, `noeviction` | §1.2 |
| Redis Cluster 모드 | β 이전까진 **거부** | §1.2 |
| `idempotency_key` → `job.id` | **원문 그대로** 패스스루 | §2.2 |
| 해시/UUID 변환 | **거부** | §2.2 |
| retention window | `removeOnComplete: { age: 3600 }` (1h) — Runtime 튜닝 | §2.3 |
| Helm 차트 신설 시점 | Runtime 교체 세션 (본 세션은 **추가하지 않음**) | §1.3 |
| 회귀 테스트 5종 | Runtime PR 필수 포함 | §2.4 |
