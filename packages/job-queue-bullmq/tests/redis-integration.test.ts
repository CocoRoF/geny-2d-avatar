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
