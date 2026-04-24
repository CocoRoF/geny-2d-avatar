/**
 * `createBullMQJobStore` 계약 테스트. fake in-process `BullMQDriver` 를 주입 — 실 BullMQ/Redis
 * 없이 ADR 0006 §D3 (§2.4) 테스트 포인트 3종을 계약 수준에서 고정.
 *
 * 다루는 5종 중:
 *  - (1) 동일 jobId 재제출 → 기존 snapshot 반환, 잡 생성 없음  ✓
 *  - (2) 특수문자 포함 idempotency_key (`abc.123.def_456-789`) Redis 저장 + 조회  ✓
 *  - (3) 128-char boundary idempotency_key 처리                                   ✓
 *  - (4) removeOnComplete 후 재제출 — retention window 정책. 실 Redis 세만 검증 가능. X+4 perf.
 *  - (5) HTTP POST /jobs e2e 는 worker-generate 세션 X+1.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  GenerationResult,
  GenerationTask,
  OrchestrateOutcome,
  ProvenancePartEntry,
} from "@geny/ai-adapter-core";

import { createBullMQJobStore } from "../src/job-store.js";
import {
  mapBullMQState,
  type BullMQDriver,
  type BullMQJobData,
  type BullMQJobSnapshot,
  type BullMQJobState,
} from "../src/driver.js";

// ─── Fake BullMQDriver ──────────────────────────────────────────────────────

interface FakeEntry {
  id: string;
  state: BullMQJobState;
  data: BullMQJobData;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
  returnvalue?: unknown;
  failedReason?: string;
}

function createFakeDriver(): BullMQDriver & { __store: Map<string, FakeEntry> } {
  const store = new Map<string, FakeEntry>();

  function snap(e: FakeEntry): BullMQJobSnapshot {
    const s: {
      id: string;
      state: BullMQJobState;
      data: BullMQJobData;
      timestamp: number;
      processedOn?: number | undefined;
      finishedOn?: number | undefined;
      returnvalue?: unknown;
      failedReason?: string | undefined;
    } = {
      id: e.id,
      state: e.state,
      data: e.data,
      timestamp: e.timestamp,
    };
    if (e.processedOn !== undefined) s.processedOn = e.processedOn;
    if (e.finishedOn !== undefined) s.finishedOn = e.finishedOn;
    if (e.returnvalue !== undefined) s.returnvalue = e.returnvalue;
    if (e.failedReason !== undefined) s.failedReason = e.failedReason;
    return s as BullMQJobSnapshot;
  }

  const driver: BullMQDriver & { __store: Map<string, FakeEntry> } = {
    __store: store,
    async add({ jobId, data }) {
      const existing = store.get(jobId);
      if (existing) return snap(existing);
      const entry: FakeEntry = {
        id: jobId,
        state: "waiting",
        data,
        timestamp: Date.parse(data.submitted_at),
      };
      store.set(jobId, entry);
      return snap(entry);
    },
    async getJob(id) {
      const e = store.get(id);
      return e ? snap(e) : null;
    },
    async listJobs() {
      return Array.from(store.values()).map(snap);
    },
    async getCounts() {
      let waiting = 0, active = 0, completed = 0, failed = 0, delayed = 0;
      for (const e of store.values()) {
        switch (e.state) {
          case "waiting":
          case "waiting-children":
          case "prioritized":
            waiting++;
            break;
          case "delayed":
            delayed++;
            break;
          case "active":
            active++;
            break;
          case "completed":
            completed++;
            break;
          case "failed":
          case "unknown":
            failed++;
            break;
        }
      }
      return { waiting, active, completed, failed, delayed };
    },
    async close() {
      // 멱등.
    },
  };
  return driver;
}

// ─── Fixture helpers ────────────────────────────────────────────────────────

function sampleTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "t1",
    slot_id: "hair_front",
    prompt: "p",
    negative_prompt: "",
    size: [512, 512],
    deadline_ms: 5000,
    budget_usd: 0.1,
    idempotency_key: "abcdefgh",
    capability_required: ["edit"],
    ...overrides,
  };
}

function sampleOutcome(task: GenerationTask, vendor = "nano-banana"): OrchestrateOutcome {
  const result: GenerationResult = {
    schema_version: "v1",
    task_id: task.task_id,
    slot_id: task.slot_id,
    image_sha256: "a".repeat(64),
    vendor,
    model_version: "0.1.0",
    seed: 1,
    prompt_sha256: "b".repeat(64),
    cost_usd: 0.015,
    latency_ms: 42,
    completed_at: "2026-04-19T00:00:00.000Z",
  };
  const provenance: ProvenancePartEntry = {
    slot_id: task.slot_id,
    source_type: "ai_generated",
    vendor,
    model_version: "0.1.0",
    seed: 1,
    prompt_sha256: "b".repeat(64),
    source_asset_sha256: null,
  };
  return { result, primary: vendor, used: vendor, attempts: [], cached: false, provenance };
}

// ─── State-mapping contract ─────────────────────────────────────────────────

test("mapBullMQState: covers all 8 BullMQ states + collapses to 4 JobStatus", () => {
  assert.equal(mapBullMQState("waiting"), "queued");
  assert.equal(mapBullMQState("delayed"), "queued");
  assert.equal(mapBullMQState("waiting-children"), "queued");
  assert.equal(mapBullMQState("prioritized"), "queued");
  assert.equal(mapBullMQState("active"), "running");
  assert.equal(mapBullMQState("completed"), "succeeded");
  assert.equal(mapBullMQState("failed"), "failed");
  assert.equal(mapBullMQState("unknown"), "failed");
});

// ─── Submit + orchestrate happy path ────────────────────────────────────────

test("createBullMQJobStore: submit → queued → running → succeeded (orchestrate wired)", async () => {
  let calls = 0;
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => {
      calls++;
      return sampleOutcome(task);
    },
  });

  const rec = await store.submit(sampleTask());
  assert.equal(rec.status, "queued");
  assert.equal(rec.job_id, "abcdefgh"); // idempotency_key 원문 패스스루

  const done = await store.waitFor(rec.job_id, 2000);
  assert.equal(done.status, "succeeded");
  assert.equal(done.outcome?.result.vendor, "nano-banana");
  assert.equal(calls, 1);
  await store.stop();
});

// ─── (1) idempotency: same key → same jobId, no new queue entry ─────────────

test("createBullMQJobStore: 동일 idempotency_key 재제출 → 같은 record, orchestrate 1회만 실행 (테스트 포인트 1)", async () => {
  let calls = 0;
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => {
      calls++;
      return sampleOutcome(task);
    },
  });

  const task = sampleTask({ idempotency_key: "dup-key-001" });
  const first = await store.submit(task);
  const second = await store.submit(task);

  assert.equal(first.job_id, second.job_id);
  assert.equal(driver.__store.size, 1, "driver queue 에 잡 하나만 존재");

  const done = await store.waitFor(first.job_id, 2000);
  assert.equal(done.status, "succeeded");
  assert.equal(calls, 1, "orchestrate 는 단 1회");
  await store.stop();
});

// ─── (2) Special-char idempotency_key — full allowed charset ────────────────

test("createBullMQJobStore: 특수문자 포함 idempotency_key 저장/조회 (테스트 포인트 2)", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => sampleOutcome(task),
  });

  // BullMQ 는 `:` 를 custom jobId 에 허용하지 않음 (Redis key 구분자). 세션 70 에서 스키마
  // regex 에서 `:` 제거 → 테스트도 `.`/`-`/`_` 전 특수문자로 정합.
  const key = "abc.123.def_456-789";
  const rec = await store.submit(sampleTask({ idempotency_key: key }));
  assert.equal(rec.job_id, key);

  const fetched = await store.get(key);
  assert.ok(fetched);
  assert.equal(fetched.job_id, key);

  await store.waitFor(key, 2000);
  await store.stop();
});

// ─── (3) 128-char boundary ──────────────────────────────────────────────────

test("createBullMQJobStore: idempotency_key 128-char boundary (테스트 포인트 3)", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => sampleOutcome(task),
  });

  const key = "a".repeat(128);
  const rec = await store.submit(sampleTask({ idempotency_key: key }));
  assert.equal(rec.job_id.length, 128);
  assert.equal(rec.job_id, key);
  await store.waitFor(rec.job_id, 2000);
  await store.stop();
});

// ─── orchestrate failure → failed + error payload ────────────────────────────

test("createBullMQJobStore: orchestrate throw → failed + error payload 저장", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async () => {
      const err = new Error("vendor unavailable") as Error & { code?: string };
      err.code = "VENDOR_ERROR_5XX";
      throw err;
    },
  });

  const rec = await store.submit(sampleTask({ idempotency_key: "fail-key-001" }));
  const done = await store.waitFor(rec.job_id, 2000);
  assert.equal(done.status, "failed");
  assert.equal(done.error?.code, "VENDOR_ERROR_5XX");
  assert.match(done.error?.message ?? "", /vendor unavailable/);
  await store.stop();
});

// ─── get(unknown) → undefined; driver hit on cache miss ─────────────────────

test("createBullMQJobStore: get(id) — 캐시 없으면 driver.getJob 폴백; 없는 id → undefined", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => sampleOutcome(task),
  });
  assert.equal(await store.get("nonexistent"), undefined);

  // driver 에 직접 잡을 주입 (out-of-band — BullMQ 바깥에서 잡이 만들어진 상황 시뮬)
  const oobKey = "oob-key-001";
  await driver.add({
    jobId: oobKey,
    data: {
      payload: sampleTask({ idempotency_key: oobKey }),
      idempotency_key: oobKey,
      submitted_at: "2026-04-19T00:00:00.000Z",
    },
  });
  const fetched = await store.get(oobKey);
  assert.ok(fetched);
  assert.equal(fetched.job_id, oobKey);
  assert.equal(fetched.status, "queued");
  await store.stop();
});

// ─── drain waits for in-flight work ─────────────────────────────────────────

test("createBullMQJobStore: drain() — 대기/실행 중 잡이 모두 최종 상태가 될 때까지 대기", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => {
      // `.unref()` 금지: 이 timer 가 유일한 pending work 라 unref 시 CI lean runner 에서
      // 프로세스가 조기 종료되어 이후 테스트까지 "Promise still pending" 로 연쇄 실패.
      await new Promise((ok) => setTimeout(ok, 20));
      return sampleOutcome(task);
    },
  });

  await store.submit(sampleTask({ idempotency_key: "drain-key-01" }));
  await store.submit(sampleTask({ idempotency_key: "drain-key-02", task_id: "t2" }));
  await store.drain(5000);
  const list = await store.list();
  assert.equal(list.length, 2);
  for (const rec of list) assert.equal(rec.status, "succeeded");
  await store.stop();
});

// ─── mode="producer-only": submit 만 큐에 넣고 in-process orchestrate 훅 skip ─

test("createBullMQJobStore: mode='producer-only' 은 setImmediate(orchestrate) 훅 skip (세션 65)", async () => {
  let calls = 0;
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    mode: "producer-only",
    orchestrate: async (task) => {
      calls++;
      return sampleOutcome(task);
    },
  });
  const rec = await store.submit(sampleTask({ idempotency_key: "po-key-001" }));
  assert.equal(rec.status, "queued");
  // setImmediate 이 실행될 수 있게 매크로태스크 한 번 양보.
  await new Promise((ok) => setImmediate(ok));
  assert.equal(calls, 0, "producer-only 에서는 in-process orchestrate 미호출");

  // 잡은 driver 에 남아 있음 — consumer 프로세스가 읽을 수 있는 상태.
  const entry = driver.__store.get("po-key-001");
  assert.ok(entry, "driver 에 잡이 enqueue 되어 있어야 함");
  assert.equal(entry.state, "waiting");
  await store.stop();
});

test("createBullMQJobStore: mode='producer-only' 은 orchestrate 생략 허용 (세션 65)", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({ driver, mode: "producer-only" });
  const rec = await store.submit(sampleTask({ idempotency_key: "po-key-002" }));
  assert.equal(rec.status, "queued");
  await store.stop();
});

test("createBullMQJobStore: mode='inline' (기본) 에서 orchestrate 누락 시 throw (세션 65)", () => {
  const driver = createFakeDriver();
  assert.throws(
    () => createBullMQJobStore({ driver }),
    /mode="inline" 은 orchestrate 콜백이 필수/,
  );
});

// ─── onEnqueued: 새 enqueue 시에만 호출, 재제출 dedupe 에서는 미호출 ─────────

test("createBullMQJobStore: onEnqueued 는 새 enqueue 시에만 1회 — 재제출 dedupe 시 미호출 (세션 65)", async () => {
  const events: string[] = [];
  const driver = createFakeDriver();
  const store = createBullMQJobStore({
    driver,
    mode: "producer-only",
    onEnqueued: (task) => events.push(task.idempotency_key),
  });
  await store.submit(sampleTask({ idempotency_key: "enq-001" }));
  await store.submit(sampleTask({ idempotency_key: "enq-001" })); // dedupe
  await store.submit(sampleTask({ idempotency_key: "enq-002" }));
  assert.deepEqual(events, ["enq-001", "enq-002"]);
  await store.stop();
});

// ─── producer-only: get(id) 는 별 프로세스 consumer 의 터미널 전환을 driver 에서 재조회 ─

test("createBullMQJobStore: mode='producer-only' 은 get(id) 에서 driver refresh (세션 73)", async () => {
  const driver = createFakeDriver();
  const store = createBullMQJobStore({ driver, mode: "producer-only" });

  const rec = await store.submit(sampleTask({ idempotency_key: "po-refresh-001" }));
  assert.equal(rec.status, "queued");

  // 별 프로세스 consumer 가 BullMQ state 를 completed 로 바꾼 상황을 시뮬.
  const entry = driver.__store.get("po-refresh-001");
  assert.ok(entry);
  entry.state = "completed";
  entry.processedOn = Date.parse("2026-04-20T00:00:00.000Z");
  entry.finishedOn = Date.parse("2026-04-20T00:00:00.500Z");

  const fresh = await store.get("po-refresh-001");
  assert.ok(fresh);
  assert.equal(fresh.status, "succeeded", "producer-only 에선 cached 'queued' 대신 driver 에서 재조회");
  assert.equal(fresh.started_at, "2026-04-20T00:00:00.000Z");
  assert.equal(fresh.finished_at, "2026-04-20T00:00:00.500Z");

  // 터미널 캐시는 권위 — driver 가 removeOnComplete 로 스냅을 지워도 같은 rec 반환.
  driver.__store.delete("po-refresh-001");
  const stillCached = await store.get("po-refresh-001");
  assert.ok(stillCached);
  assert.equal(stillCached.status, "succeeded");
  await store.stop();
});

// ─── stop() idempotent + closes driver ──────────────────────────────────────

test("createBullMQJobStore: stop() — 드라이버 close 멱등 호출", async () => {
  let closes = 0;
  const baseDriver = createFakeDriver();
  const driver: BullMQDriver = {
    ...baseDriver,
    close: async () => {
      closes++;
    },
  };
  const store = createBullMQJobStore({
    driver,
    orchestrate: async (task) => sampleOutcome(task),
  });
  await store.stop();
  await store.stop();
  assert.equal(closes, 2, "stop 2회 호출 모두 driver.close 에 위임 (드라이버가 내부에서 멱등 처리)");
});
