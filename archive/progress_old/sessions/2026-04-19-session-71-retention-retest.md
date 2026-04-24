# 세션 71 — `removeOnComplete` TTL 후 재제출 real-Redis 검증 (ADR 0006 §2.4 포인트 4)

**일자**: 2026-04-19
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4, §2.4 테스트 포인트 4
**선행 세션**: 세션 69 (bullmq-integration CI lane 신설), 세션 70 (schema narrow 로 passthrough 계약 확정)

---

## 1. 문제

ADR 0006 §2.4 테스트 포인트 5종 중:

- 포인트 1 (동일 jobId 재제출 → waiting 1) ✅ 세션 62
- 포인트 2 (특수문자 jobId round-trip) ✅ 세션 62
- 포인트 3 (128-char boundary) ✅ 세션 62
- **포인트 4** (`removeOnComplete` TTL 경과 후 동일 jobId 재제출 → **새 job**) ❌ 미검증
- 포인트 5 (HTTP `POST /jobs` e2e 멱등) ✅ 세션 61

포인트 4 는 fake in-process driver 로는 의미 없고 — BullMQ `queue.add({ jobId })` 의 dedupe 는 "Redis 에 해당 jobId 의 실체가 존재" 할 때만 작동. `removeOnComplete: true` 로 completed 직후 job 이 purge 되면 그 이후의 동일 jobId add 는 **새 entry** 로 가야 한다. 이 retention 경계가 코드로 고정돼 있지 않으면 Runtime 에서 TTL 정책을 바꿨을 때 "재제출이 dedupe 되어 사용자에게 stale 결과가 가거나, 반대로 purge 후 늦게 도착한 재시도가 중복 과금" 같은 silent 회귀가 가능.

세션 69 에서 `bullmq-integration` CI lane 이 real Redis 를 붙여줬고, 세션 70 이 passthrough 계약을 schema narrow 로 단단히 했다. 이제 포인트 4 를 자동 회귀에 넣을 기반이 갖춰짐.

---

## 2. 변경

`packages/job-queue-bullmq/tests/redis-integration.test.ts` — `maybeTest` 1 case 추가:

```ts
maybeTest("redis integration — removeOnComplete=true 후 재제출 → 새 job (포인트 4)", async () => {
  const { Worker } = await import("bullmq");
  const client = await makeClient();
  const queueName = `geny-test-${Date.now() + 4}`;
  const driver = createBullMQDriverFromRedis(client, {
    queueName,
    defaultJobOptions: { removeOnComplete: true },
  });

  const workerConn = client.duplicate();
  const worker = new Worker(queueName, async () => ({ ok: true }), { connection: workerConn });
  await worker.waitUntilReady();

  try {
    const id = uniqKey("ttl");
    const data = sampleData(id);

    const firstCompleted = new Promise<void>((r) => worker.once("completed", () => r()));
    const s1 = await driver.add({ jobId: id, data });
    const ts1 = s1.timestamp;
    await firstCompleted;

    const got = await driver.getJob(id);
    assert.equal(got, null);

    await new Promise((ok) => setTimeout(ok, 5));

    const secondCompleted = new Promise<void>((r) => worker.once("completed", () => r()));
    const s2 = await driver.add({ jobId: id, data });
    assert.ok(s2.timestamp > ts1);
    await secondCompleted;
  } finally {
    await worker.close();
    await workerConn.quit();
    await driver.close();
    await client.quit();
  }
});
```

검증 poc :

1. Worker 를 먼저 띄우고 `waitUntilReady`. Worker connection 은 Queue 와 분리(BullMQ 권장 — blocking commands 격리).
2. 1차 `driver.add` → Worker 가 즉시 소비 → `completed` 이벤트 + `removeOnComplete: true` 로 Redis 에서 제거.
3. `driver.getJob(id)` → `null` 어서션 (retention 정책 실증).
4. ms 해상도 확보용 5ms 대기 후 2차 `driver.add` — 같은 jobId 지만 기존 entry 가 없으므로 BullMQ 는 새 job 생성. `Job.timestamp` 는 enqueue 시각이라 `ts2 > ts1` 로 "서로 다른 실체" 가 증명됨.
5. 2차 completed 까지 대기 후 graceful close — hanging pending job 으로 `worker.close()` 가 block 되지 않도록.

---

## 3. 주요 결정축

- **D1** — **Worker 를 여기서 띄운다**: 세션 62 의 기존 integration 테스트들은 Worker 없이 Queue-only — 이 테스트는 "completed 후 제거" 가 조건이라 반드시 Worker 가 필요. driver 패키지의 의존성에 이미 `bullmq` 전체가 있으므로 `import("bullmq")` 로 `Worker` 만 즉석 사용. worker-generate 의 `createBullMQConsumer` 를 끌어오지 않은 이유는 이 테스트의 목적이 retention 경계 확인이지 consumer wiring 회귀가 아님 — minimum viable worker 가 낫다.
- **D2** — **`removeOnComplete: true` vs `{ age: N }`**: TTL age 테스트는 `age: 1` 해도 1초 대기가 필요하고 BullMQ 의 lazy cleanup 이 "새 job 의 completion 을 트리거" 로 움직여 테스트 determinism 이 약함. `true` (즉시 제거) 는 같은 retention 계약을 더 짧고 결정적으로 검증. 실 Runtime 의 TTL 값은 별개 concern.
- **D3** — **timestamp 비교로 "새 job" 증명**: jobId 가 같으므로 id 비교는 소용 없음. BullMQ `Job.timestamp` 는 `queue.add` 시점이라 `ts2 > ts1` 이면 서로 다른 enqueue event 임을 확정. 이건 dedupe 가 꺼진 fail-closed 검증.
- **D4** — **2차 completed 대기 후 close**: `worker.close()` 는 활성 잡이 남아있으면 기본적으로 기다림. 2차 job 을 버리고 close 하면 CI 에서 간헐적 타임아웃 위험 — 적은 추가 지연으로 안정성 확보.
- **D5** — **`ts2 > ts1` 로 Redis 해상도 전제 수용**: BullMQ `Job.timestamp` 는 ms epoch. 매우 빠른 노드에서는 ts2 === ts1 가능성 존재 → `setTimeout(5ms)` 로 해상도 경계 확보. 5ms 는 CI 빌드에 무시 가능 수준.

---

## 4. 검증

로컬 (Redis 없음):

```
pnpm -F @geny/job-queue-bullmq test
# tests 30 / pass 25 / skipped 5 (포인트 1~4 + null getJob + 신규 포인트 4)
```

CI 의 bullmq-integration lane 이 `REDIS_URL=redis://localhost:6379` 를 설정하므로 본 lane 에서 실제 실행. Foundation `golden` lane 은 REDIS_URL 미설정 → skip 유지 (독립).

`node scripts/test-golden.mjs` 21/21 step 불변 (golden 은 Redis 없이 단위 테스트만 돌리므로 포인트 4 는 skip 영향만 받음).

---

## 5. 남긴 숙제

- **`removeOnComplete: { age: N }` TTL 테스트**: `true` 와 `{ age: 0 }` 는 즉시 제거지만 `{ age: 60 }` 같은 시간 기반 cleanup 은 "새 job 의 completion 트리거" 로만 움직이는 lazy 동작이라 deterministic 하게 검증하기 어렵다. Runtime 튜닝 시점에 별도 세션에서 `queue.clean()` 명시 호출 기반 테스트로 보강.
- **`scripts/perf-harness.mjs --driver bullmq` p95 regression**: 세션 68 wait+process 정밀 duration 을 재료로 `docs/02 §12.4` SLO 표 확장. 세션 72 후보.
- **`--target-url` 모드**: 세션 66 chart 배포 producer Service 에 외부 하네스가 HTTP 만 날리는 경로 — consumer 프로세스 분리 실측. 세션 72 후보.

---

## 6. 결과

- `packages/job-queue-bullmq` 테스트 25 pass + 4 skip → 25 pass + 5 skip (신규 포인트 4 는 Foundation CI 에서 skip, bullmq-integration lane 에서 실행).
- ADR 0006 §2.4 테스트 포인트 4종 → **5종 전부 자동 회귀 대상** (포인트 1/2/3/5 기존 + 4 신규).
- golden 21/21 step 불변, validate-schemas `checked=244` 불변.
