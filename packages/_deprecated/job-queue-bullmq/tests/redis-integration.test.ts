/**
 * 실 Redis + bullmq 통합 테스트 — `REDIS_URL` env 변수가 설정돼 있어야만 실행.
 * 미설정 시 **전체 suite skip** (Foundation CI 는 env 미설정 → skip 경로).
 *
 * 커버:
 *  - ADR 0006 §2.4 테스트 포인트 1 (동일 jobId 재호출 → 동일 snapshot · waiting count 불변).
 *  - 포인트 2 (특수문자 jobId Redis 저장 + 조회).
 *  - 포인트 3 (128-char boundary jobId 처리).
 *  - 포인트 4 는 `removeOnComplete` TTL 가 필요 — scale out 은 X+4 staging.
 *
 * 호출 방법 (로컬):
 *   docker run -d --rm -p 6379:6379 redis:7.2-alpine
 *   REDIS_URL=redis://127.0.0.1:6379 pnpm -F @geny/job-queue-bullmq test
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { createBullMQDriverFromRedis } from "../src/driver-redis.js";
import { mapBullMQState } from "../src/driver.js";

const REDIS_URL = process.env["REDIS_URL"];
const SKIP = !REDIS_URL;

function maybeTest(name: string, fn: () => Promise<void>): void {
  if (SKIP) {
    test(name, { skip: "REDIS_URL not set" }, () => {});
    return;
  }
  test(name, fn);
}

// ioredis 는 REDIS_URL 이 있을 때만 import — 없으면 import 자체는 해도 connection 은 열지 않음.
// 그러나 node test runner 는 파일 전체를 import 하므로 상위에 두면 안전.
async function makeClient() {
  const IORedis = (await import("ioredis")).default;
  return new IORedis(REDIS_URL!, { maxRetriesPerRequest: null });
}

function uniqKey(prefix: string): string {
  // test 간 격리 — idempotency_key 재사용 방지.
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

function sampleData(key: string) {
  return {
    payload: { task_id: "t1", slot_id: "hair_front", idempotency_key: key },
    idempotency_key: key,
    submitted_at: new Date().toISOString(),
  };
}

maybeTest("redis integration — add 동일 jobId 2회 → 동일 id, waiting count 1 (포인트 1)", async () => {
  const client = await makeClient();
  const queueName = `geny-test-${Date.now()}`;
  const driver = createBullMQDriverFromRedis(client, { queueName });
  try {
    const id = uniqKey("idem");
    const data = sampleData(id);
    const s1 = await driver.add({ jobId: id, data });
    const s2 = await driver.add({ jobId: id, data });
    assert.equal(s1.id, id);
    assert.equal(s2.id, id);
    const counts = await driver.getCounts();
    assert.equal(counts.waiting + counts.active + counts.delayed, 1);
    assert.equal(mapBullMQState(s1.state), "queued");
  } finally {
    await driver.close();
    await client.quit();
  }
});

maybeTest("redis integration — 특수문자 jobId `abc.123.def_456-789` 저장/조회 (포인트 2)", async () => {
  const client = await makeClient();
  const queueName = `geny-test-${Date.now() + 1}`;
  const driver = createBullMQDriverFromRedis(client, { queueName });
  try {
    // 세션 70: BullMQ 는 custom jobId 에 `:` 허용 않음 → 스키마 regex 에서 `:` 제거.
    // 전 허용 특수문자 (`.`/`_`/`-`) 로 round-trip 검증.
    const id = `abc.123.def_456-789-${Date.now()}`;
    const data = sampleData(id);
    const add = await driver.add({ jobId: id, data });
    assert.equal(add.id, id);
    const got = await driver.getJob(id);
    assert.ok(got);
    assert.equal(got.id, id);
    assert.equal(got.data.idempotency_key, id);
  } finally {
    await driver.close();
    await client.quit();
  }
});

maybeTest("redis integration — 128-char boundary jobId 정상 처리 (포인트 3)", async () => {
  const client = await makeClient();
  const queueName = `geny-test-${Date.now() + 2}`;
  const driver = createBullMQDriverFromRedis(client, { queueName });
  try {
    const id = ("z" + String(Date.now())).padEnd(128, "x"); // 정확히 128 chars, unique prefix
    assert.equal(id.length, 128);
    const data = sampleData(id);
    const add = await driver.add({ jobId: id, data });
    assert.equal(add.id, id);
    const counts = await driver.getCounts();
    assert.ok(counts.waiting >= 1 || counts.active >= 1);
  } finally {
    await driver.close();
    await client.quit();
  }
});

maybeTest("redis integration — getJob(nonexistent) → null; close 멱등", async () => {
  const client = await makeClient();
  const queueName = `geny-test-${Date.now() + 3}`;
  const driver = createBullMQDriverFromRedis(client, { queueName });
  try {
    const got = await driver.getJob(uniqKey("missing"));
    assert.equal(got, null);
    await driver.close();
    await driver.close(); // 멱등
  } finally {
    await client.quit();
  }
});

// 세션 71 — ADR 0006 §2.4 테스트 포인트 4.
// `removeOnComplete: true` 로 completed 직후 job 이 Redis 에서 purge 되면, 동일 `jobId`
// 재제출은 dedupe 되지 않고 새 job 으로 enqueue 되어야 한다. 세션 60/62 에서는 fake
// driver + queue-add 레벨의 dedupe 만 검증했기 때문에 이 retention 경계는 real-Redis
// 에서만 의미 있음. BullMQ `Job.timestamp` 는 enqueue 시각이라 두 번의 add 가 서로
// 다른 timestamp 를 내놓으면 "같은 jobId" 의 서로 다른 실체임이 증명된다.
maybeTest("redis integration — removeOnComplete=true 후 재제출 → 새 job (포인트 4)", async () => {
  const { Worker } = await import("bullmq");
  const client = await makeClient();
  const queueName = `geny-test-${Date.now() + 4}`;
  const driver = createBullMQDriverFromRedis(client, {
    queueName,
    defaultJobOptions: { removeOnComplete: true },
  });

  // Worker connection 은 Queue 와 분리 (BullMQ 권장 — blocking commands 충돌 방지).
  const workerConn = client.duplicate();
  const worker = new Worker(queueName, async () => ({ ok: true }), { connection: workerConn });
  await worker.waitUntilReady();

  try {
    const id = uniqKey("ttl");
    const data = sampleData(id);

    // 1차 add + 즉시 완료 대기 (removeOnComplete=true → Redis 에서 제거).
    const firstCompleted = new Promise<void>((resolve) => {
      worker.once("completed", () => resolve());
    });
    const s1 = await driver.add({ jobId: id, data });
    assert.equal(s1.id, id);
    const ts1 = s1.timestamp;
    await firstCompleted;

    // purge 확인.
    const got = await driver.getJob(id);
    assert.equal(got, null, "completed job 은 removeOnComplete=true 로 즉시 purge 되어야 함");

    // 두 enqueue timestamp 의 ms 해상도 구분을 확보.
    await new Promise((ok) => setTimeout(ok, 5));

    // 2차 add — 기존 entry 가 없으므로 새 job 이 enqueue 된다. timestamp 는 새 시각.
    const secondCompleted = new Promise<void>((resolve) => {
      worker.once("completed", () => resolve());
    });
    const s2 = await driver.add({ jobId: id, data });
    assert.equal(s2.id, id);
    assert.ok(
      s2.timestamp > ts1,
      `재제출된 job 은 새 timestamp 여야 함: ts1=${ts1} ts2=${s2.timestamp}`,
    );

    // 2차 완료 대기 — worker.close() 이 pending job 때문에 hang 하지 않도록.
    await secondCompleted;
  } finally {
    await worker.close();
    await workerConn.quit();
    await driver.close();
    await client.quit();
  }
});
