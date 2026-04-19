# ADR 0006 — 잡 큐 영속성 전략 (worker-generate)

- **Status**: Accepted
- **Date**: 2026-04-19
- **Deciders**: geny-core
- **관련 문서**: `docs/02-system-architecture.md` §3 (Containers), §4.3 (실행 모드 Batch 우선순위), §8.2 (인프라 기본선 — Redis 이미 계획), §9.3 (큐 길이 알람), §10.2 (재시도 정책), §10.3 (멱등성)
- **관련 ADR**: [0002](./0002-schema-first-contract.md), [0005](./0005-rig-authoring-gate.md)
- **관련 세션**: 36 (`@geny/metrics-http`), 39 (`@geny/orchestrator-service` bootstrap), 42 (HTTP 팩토리 주입), 44 (`apps/worker-generate` 인-메모리 FIFO)

---

## Context

세션 44 에서 `apps/worker-generate/` 를 도입하며 `JobStore` 인터페이스 + 인-메모리 FIFO 드라이버를 만들었다. Foundation 범위 결정은 **큐 백엔드 = 인-메모리 / 동시성 = 1 / 영속성 없음** — Runtime 단계에서 교체 예정.

그런데 "무엇으로 교체할지" 가 지금 의사결정되지 않으면 두 가지 위험:

1. 세션 44 의 `JobStore` 인터페이스가 Runtime 드라이버와 시맨틱이 안 맞아 **다시 쓰게** 된다.
2. `waitFor`/`drain` 같은 테스트 헬퍼가 호출자 코드(HTTP 라우터) 에 누수되어 있다면 드라이버 교체 시 API 변형이 필요해진다.

본 ADR 은 (a) Runtime 드라이버 선택 (b) 현재 `JobStore` 인터페이스의 gap 감사 (c) 무엇을 지금 당장 고치고 무엇을 교체 시점에 처리할지 를 결정한다.

### 현재 `JobStore` 인터페이스 요약 (세션 44)

```
submit(task): JobRecord                    // sync, 202 반환용
get(id): JobRecord | undefined
list(): readonly JobRecord[]
waitFor(id, timeoutMs?): Promise<JobRecord>
drain(timeoutMs?): Promise<void>           // 테스트 헬퍼
stop(): Promise<void>                      // graceful shutdown
```

상태 전이: `queued → running → (succeeded | failed)`.

---

## Decision

### D1. Runtime 드라이버 = **Redis + BullMQ**

`docs/02 §8.2` 인프라 기본선에 "Redis (세션, 토큰, 파생 썸네일)" 이 이미 있다. 잡 큐 전용으로 새 클러스터를 띄우지 않고 **같은 Redis 에 BullMQ namespace** 추가로 한다 — 운영 부담 최소 증가.

**기각된 대안**:

- **SQLite**: 단일 프로세스에 묶임. 멀티-워커 확장 시 파일락 경합 → 결국 Postgres 행락 패턴으로 재설계해야 함. Foundation 이후 즉시 병목.
- **Postgres SKIP LOCKED 큐**: Postgres 만으로 충분히 가능하지만, 재시도/delayed job/priority 를 직접 구현해야 함. BullMQ 는 이미 그 기능들이 성숙.
- **NATS JetStream / Kafka**: 과대 사양. MVP 규모(큐 길이 < 10k 상정, `docs/02 §9.3` 알람 임계) 에서 NATS/Kafka 운영 복잡도 대비 이득 없음.
- **자체 Redis Lua 스크립트**: BullMQ 가 검증된 같은 역할. 재발명 거부.

### D2. 현재 `JobStore` 인터페이스는 **대체로 충분**, 3개 gap 은 드라이버 교체 시점에 닫는다

gap 감사 결과:

| Gap | 현재 | BullMQ 에서 필요한 것 | 조치 |
|---|---|---|---|
| **ack/nack 명시성** | `orchestrate()` throw → 즉시 `failed` | BullMQ 는 lease/ack 모델 — worker 가 `job.moveToCompleted()`/`moveToFailed()` 호출 | 드라이버 교체 시 `JobRecord.status` 를 BullMQ 상태와 매핑하는 어댑터 계층 추가. 지금은 throw→failed 로 충분. |
| **worker identity / lease** | 단일 프로세스 `running` boolean | visibility timeout + heartbeat | BullMQ 가 내부에서 처리. `JobStore` 인터페이스는 노출 불필요. |
| **replay on startup** | 없음 (프로세스 죽으면 대기 잡 유실) | BullMQ 의 delayed/waiting 키셋 복원 | 드라이버 레벨에서 자동, `JobStore` 인터페이스 불변. |
| **priority** | FIFO 만 | `docs/02 §4.3` Batch 는 우선순위 낮음 | BullMQ `add({ priority: N })` 로 해결. `submit()` 에 optional `priority?: "interactive" \| "batch"` 추가 — **Runtime 교체 시** 신설, 지금 추가해도 무시됨. |
| **dead letter / poison job** | 없음 (`failed` 종단) | BullMQ 에 failed 집합 + `retryJobs()` | 드라이버 기능. `JobStore` 에 `retry(id)` / `failedList()` 추가는 Runtime 시점. |
| **waitFor 가 호출자-로컬** | in-process Map + resolve | 멀티-워커 환경에선 pub/sub 또는 폴링 | **이미 HTTP 라우터에서 안 씀** (세션 44 의 `POST /jobs` 는 202 즉시 반환, `GET /jobs/{id}` 가 polling). 테스트 헬퍼로만 남아 있어 드라이버 교체에 영향 없음. |
| **TTL / 보관 정책** | Map 영속 — 메모리 누수 | BullMQ `removeOnComplete`/`removeOnFail` 옵션 | 드라이버 기능. `JobStore` 에는 노출 불필요. |

**즉, 지금 `JobStore` 인터페이스에서 바꿀 것은 없다.** 드라이버 교체 세션에서 `createBullMQJobStore(redisConn, opts)` 팩토리 추가 + `@geny/worker-generate` 의 `createWorkerGenerate({ store: ... })` 오버라이드 훅 한 개로 해결 가능.

### D3. 드라이버 교체 세션(Runtime N+1) 의 **선행 조건 3개**

Runtime 단계에서 큐를 실제로 교체하기 전에 다음을 충족해야 한다:

1. **Redis 배포 결정 확정** — `docs/02 §8.2` 에 Redis 가 있지만 버전/클러스터 토폴로지 미정. 관측 파이프(#3) 이후 인프라 스프린트에서 확정.
2. **멱등성 키 end-to-end 전파** (`docs/02 §10.3`) — `idempotency_key` 가 BullMQ `job.id` 로 쓰일 수 있는지 확인 (길이/문자셋 제약). 현재 `GenerationTask.idempotency_key` 는 자유 문자열 → 해시한 뒤 BullMQ id 로 써야 할 수 있음.
3. **관측 메트릭 확장** — BullMQ 는 자체 Prom exporter 가 있지만 우리는 `geny_ai_*` 네임스페이스 정책. 큐 깊이/실패율 메트릭을 `@geny/metrics-http` 가 노출하도록 metrics-catalog §4 추가. 알람은 이미 `docs/02 §9.3` "큐 길이 > 1k 10분 → P2".

### D4. **Foundation 범위에서는** `JobStore` 인터페이스 확장 **금지**

Priority/retry/DLQ 같은 필드를 지금 미리 추가하면 Foundation 테스트가 YAGNI 로직을 떠안음. 위 gap 표에서 "드라이버 교체 시" 로 표시된 모든 항목은 Runtime 세션에서 한 커밋으로 묶인다. 저자 유혹을 ADR 로 명시해 차단.

---

## Consequences

**긍정**:

- Runtime 드라이버 선택이 공개 — 인프라 스프린트 계획 시 Redis/BullMQ 를 명시적으로 포함.
- 현재 `JobStore` 인터페이스가 "사후 정당화" 가 아닌 "의식적 최소성" 임이 기록됨.
- gap 감사가 한 곳에 있어 Runtime 교체 세션 PR 이 이 문서를 체크리스트로 쓸 수 있음.

**부정 / 비용**:

- BullMQ 는 Redis 7+ 를 가정 — 일부 매니지드 Redis(예: AWS ElastiCache 6.x) 에서 redis-cluster 모드 제약이 있을 수 있음. 배포 결정 시 재검증.
- 본 ADR 이 드라이버 선택을 고정하므로, 향후 Postgres-only 토폴로지로 갈 때는 ADR supersession 필요.

**중립**:

- 멀티-리전 배포 시 (`docs/02 §8.3` β 이후) Redis 단일 write-primary 가 병목이 될 수 있음. Runtime N+1 에 고려 대상 아님.

---

## Follow-ups

- Runtime 단계 진입 시: `packages/job-queue/` (또는 `services/worker-generate/drivers/bullmq/`) 로 BullMQ 드라이버 구현 + 세션 47 의 gap 표 전부 닫기.
- `@geny/metrics-http` 에 `geny_queue_depth_total`/`geny_queue_failed_total` 등 큐 메트릭 추가 — catalog 개정과 함께.
- `docs/02 §4.3` 실행 모드 표에 "우선순위" 컬럼을 BullMQ priority 값으로 매핑(런북).
