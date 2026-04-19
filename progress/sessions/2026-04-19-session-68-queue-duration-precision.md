# 세션 68 — `geny_queue_duration_seconds` enqueue→terminal 정밀화 (ADR 0006 §D3 X+2 잔여)

**일자**: 2026-04-19
**워크스트림**: Pipeline / Observability
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3
**선행 세션**: 세션 65 (processor-구간 근사로 X+2 실장), 세션 67 (`--concurrency` loop closer)

---

## 1. 문제

세션 65 가 `geny_queue_duration_seconds{queue_name, outcome}` 히스토그램을 `processWithMetrics` 로 방출했으나, 측정 구간이 **processor start → resolve/reject** 에 한정돼 있었다. `docs/02 §12.4` SLO `queue_duration_p95 < 45s` 의 정의는 enqueue→terminal 전체 (wait + process) 인데, 관측은 wait 시간을 포함하지 않아 **실제보다 낮게** 나왔다. Foundation 단계에서는 백로그가 없어 bias 가 작지만, Runtime 부하 시 SLO 대조가 가짜 녹색이 될 위험.

세션 65 주석에도 이 한계가 명시돼 있었고 "Runtime 세션에서 QueueEvents `added/completed` 차분으로 확장" 으로 미룬 상태. 세션 68 는 이 잔여를 닫는다.

---

## 2. 변경

### 2.1 `packages/job-queue-bullmq/src/processor-metrics.ts`

- `ProcessWithMetricsOptions.enqueuedAt?: number` 추가.
- `processWithMetrics` 내부 duration 계산:
  ```ts
  const processorStart = now();
  const start = opts.enqueuedAt ?? processorStart;
  const durationSeconds = () => Math.max(0, (now() - start) / 1000);
  ```
- `enqueuedAt` 미주입 시 기존 processor-구간 측정 그대로 → 세션 65 호환.
- 음수 clamp — clock skew / 시계 역행 방어.
- 문서 주석: "Runtime 확장 예정" 을 "세션 68 부터 `enqueuedAt=job.timestamp` 전달" 로 갱신, QueueEvents 는 별도 실시간 대시보드 needs 가 있을 때만 추가할 옵션으로 주석 분리.

### 2.2 `packages/job-queue-bullmq/src/consumer-redis.ts`

- `createBullMQConsumer` 내부 Worker processor 콜백이 BullMQ `Job.timestamp` 를 `enqueuedAt` 으로 전달:
  ```ts
  ...(typeof job.timestamp === "number" ? { enqueuedAt: job.timestamp } : {}),
  ```
- `Job.timestamp` 는 `Queue.add` 시점의 ms epoch 라 pub/sub (QueueEvents) 연결 없이 enqueue→terminal 정밀 측정 가능. 추가 Redis 커넥션 0.
- 파일 헤더 주석의 "비-목표 (X+2 범위 밖) — QueueEvents 차분" 항목 삭제. DLQ 라우팅만 잔여로 유지.

### 2.3 `packages/job-queue-bullmq/tests/processor-metrics.test.ts`

3 test case 추가 (+22→25 pass):

1. **enqueuedAt 주입 시 wait+process 정확성**: `enqueuedAt = clock.now() - 1200; processor advance 300ms` → duration 1.5s. (1200 + 300) / 1000.
2. **clock skew clamp**: `enqueuedAt = clock.now() + 5000` (미래) → duration 0s (음수 대신 clamp).
3. **미주입 시 fallback**: 기존 processor-구간 측정 유지 (세션 65 호환 회귀).

---

## 3. 결정축

### D1. `Job.timestamp` vs `QueueEvents` pub/sub

후자는 외부 프로세스가 Redis pub/sub 로 `added`/`completed` 이벤트를 받아 타임스탬프 차분을 계산하는 방식. 장점: Worker 와 독립적으로 실시간 스트림을 다른 프로세스에 흘릴 수 있음. 단점:

- 추가 Redis connection + `QueueEvents.close()` lifecycle 관리.
- Cross-pod 상황에서 이벤트 수신 지연 = 부정확한 차분으로 이어질 수 있음.
- BullMQ `Job.timestamp` 는 이미 Worker processor 에 도달한 `Job` 객체에 직렬화돼 있음 — 동일 값을 재수신하는 간접 경로.

따라서 본 히스토그램 용도에는 `Job.timestamp` 가 최단거리. QueueEvents 가 필요한 use case (실시간 대시보드) 는 분리 가능한 concern 으로 주석에만 남겨 향후 선택지로 유지.

### D2. `enqueuedAt` 은 opt-in

세션 65 호환성 유지 + fake test driver 에서 `job.timestamp` 가 누락된 경우 (테스트에서 partial mock 을 만들 수 있음) 도 graceful 처리. `typeof job.timestamp === "number"` 타입가드로 방어.

### D3. 음수 clamp (`Math.max(0, ...)`)

현실 prod 에서 NTP 보정이 튀거나 처리 노드와 enqueue 노드의 시계가 어긋나면 duration 이 음수가 될 수 있다. 히스토그램에 음수가 들어가면 bucket 분포가 왜곡되므로 관측치는 깎이되 카운트는 보존. 향후 clock-skew 감지는 별도 `geny_clock_skew_ms` gauge 등으로 surface 하는 게 자연 — 이 세션에서는 범위 밖.

---

## 4. 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @geny/job-queue-bullmq test` | 25 pass + 4 skip (REDIS_URL 없음) |
| `pnpm --filter @geny/job-queue-bullmq build` | tsc 0 error |
| `node scripts/test-golden.mjs` | 21/21 step pass |

- 실 Redis 통합 경로는 docker daemon 미가동으로 로컬 검증 불가 — 세션 69 후보로 분리 (docker-compose redis:7.2-alpine + perf-harness `--driver bullmq` p95 regression).
- `consumer-redis.ts` 의 `Job.timestamp` 사용은 BullMQ 5.x 에서 공식 타입으로 노출 — 빌드 성공이 계약 증거. 실 런타임 값은 Redis 통합 세션에서 scrape 로 확인.

---

## 5. 파급 효과

- **SLO 대조의 진위**: `docs/02 §12.4` `queue_duration_p95 < 45s` 가 이제 wait+process 전체 기준으로 검증된다. 이전 측정은 processor 구간만 반영해 backlog 부하 하에서 optimistic bias 가 있었음.
- **Grafana Job Health 패널 (세션 50)**: 동일 메트릭을 p50/p95 로 쿼리하는 패널이 자동으로 정확도 상승. 별도 chart 변경 불필요.
- **alert 임계**: 현재 `alert-rules.yml` 에 `geny_queue_duration_seconds` 기반 alert 가 있었다면 임계 재조정 검토 대상 — 세션 68 는 감지 민감도를 올리는 방향(같은 임계에서 이전보다 더 빨리 경보).

---

## 6. 다음 세션 후보

세션 69 강력 후보 — **실 Redis 통합**:

- `docker-compose.staging.yml` redis:7.2-alpine + `maxmemory-policy=noeviction` (세션 66 D2 정렬).
- CI lane 에 `REDIS_URL` 주입 + `pnpm --filter @geny/job-queue-bullmq test` 4 skip → 실행.
- `perf-harness --driver bullmq --concurrency 8 --jobs 2000` (세션 67 flag 활용) → in-memory baseline 대비 p95 overhead 측정, `docs/02 §12.4` 표 확장.
- ADR 0006 §2.4 포인트 4 (`removeOnComplete` TTL 후 동일 jobId 재제출 → 새 잡) 실 Redis 증거.
- helm CLI (docker container) 기반 `helm lint/template` CI step — 세션 66 부터 이월.

---

## 7. 커밋 메시지 초안

```
feat(queue): geny_queue_duration_seconds enqueue→terminal 정밀화 (세션 68)

- processor-metrics.ts: ProcessWithMetricsOptions.enqueuedAt 추가
- enqueuedAt 주입 시 duration = now - enqueuedAt (wait + process 전체)
- 음수 차분은 Math.max(0, ...) 로 clamp (시계 역행/skew 방어)
- consumer-redis.ts: createBullMQConsumer 가 Job.timestamp 를 enqueuedAt 으로 전달
- 별도 QueueEvents pub/sub 없이 동등 정밀도 — 추가 Redis 커넥션 0
- tests/processor-metrics.test.ts +3 (주입/clamp/fallback) → 22→25 pass
- progress: INDEX.md §3 Pipeline · §4 세션 68 행 · §8 69 rotate

SLO queue_duration_p95 (docs/02 §12.4) 가 이제 wait+process 전체 기준으로 검증됨.
관련 ADR: 0006 §D3 X+2 잔여 마무리.
```
