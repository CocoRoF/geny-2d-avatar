/**
 * `createBullMQJobStore` 계약 테스트. fake in-process `BullMQDriver` 를 주입 — 실 BullMQ/Redis
 * 없이 ADR 0006 §D3 (§2.4) 테스트 포인트 3종을 계약 수준에서 고정.
 *
 * 다루는 5종 중:
 *  - (1) 동일 jobId 재제출 → 기존 snapshot 반환, 잡 생성 없음  ✓
 *  - (2) 특수문자 포함 idempotency_key (`abc:123.def_456-789`) Redis 저장 + 조회  ✓
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

  const key = "abc:123.def_456-789";
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
      await new Promise((ok) => setTimeout(ok, 20).unref?.());
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
