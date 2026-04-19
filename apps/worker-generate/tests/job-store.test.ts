import { test } from "node:test";
import assert from "node:assert/strict";

import type {
  GenerationResult,
  GenerationTask,
  OrchestrateOutcome,
  ProvenancePartEntry,
} from "@geny/ai-adapter-core";

import { createJobStore } from "../src/job-store.js";

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
    idempotency_key: "k1",
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

test("createJobStore: submit → queued → running → succeeded (job_id = idempotency_key)", async () => {
  let calls = 0;
  const store = createJobStore({
    orchestrate: async (task) => {
      calls++;
      return sampleOutcome(task);
    },
  });
  const rec = await store.submit(sampleTask({ idempotency_key: "happy-001" }));
  assert.equal(rec.job_id, "happy-001");
  assert.equal(rec.status, "queued");
  const done = await store.waitFor(rec.job_id, 2000);
  assert.equal(done.status, "succeeded");
  assert.equal(done.outcome?.result.vendor, "nano-banana");
  assert.ok(done.started_at);
  assert.ok(done.finished_at);
  assert.equal(calls, 1);
  await store.stop();
});

test("createJobStore: 동일 idempotency_key 재제출 → 같은 record, orchestrate 1회만 실행", async () => {
  let calls = 0;
  const store = createJobStore({
    orchestrate: async (task) => {
      calls++;
      return sampleOutcome(task);
    },
  });
  const task = sampleTask({ idempotency_key: "dup-inmem-01" });
  const first = await store.submit(task);
  const second = await store.submit(task);
  assert.equal(first.job_id, second.job_id);
  assert.strictEqual(first, second);
  await store.waitFor(first.job_id, 2000);
  assert.equal(calls, 1);
  assert.equal((await store.list()).length, 1);
  await store.stop();
});

test("createJobStore: orchestrate throw → failed + error payload", async () => {
  const store = createJobStore({
    orchestrate: async () => {
      const err = new Error("vendor unavailable") as Error & { code?: string };
      err.code = "VENDOR_ERROR_5XX";
      throw err;
    },
  });
  const rec = await store.submit(sampleTask());
  const done = await store.waitFor(rec.job_id, 2000);
  assert.equal(done.status, "failed");
  assert.equal(done.error?.code, "VENDOR_ERROR_5XX");
  assert.match(done.error?.message ?? "", /vendor unavailable/);
  await store.stop();
});

test("createJobStore: 2 잡 FIFO 직렬 처리", async () => {
  const seen: string[] = [];
  const store = createJobStore({
    orchestrate: async (task) => {
      seen.push(`start:${task.task_id}`);
      await new Promise((ok) => setTimeout(ok, 5));
      seen.push(`end:${task.task_id}`);
      return sampleOutcome(task);
    },
  });
  const a = await store.submit(sampleTask({ task_id: "A", idempotency_key: "kA" }));
  const b = await store.submit(sampleTask({ task_id: "B", idempotency_key: "kB" }));
  await Promise.all([store.waitFor(a.job_id, 2000), store.waitFor(b.job_id, 2000)]);
  // B 는 A 가 끝나야 시작.
  assert.deepEqual(seen, ["start:A", "end:A", "start:B", "end:B"]);
  await store.stop();
});

test("createJobStore: stop 후 submit throw", async () => {
  const store = createJobStore({ orchestrate: async (t) => sampleOutcome(t) });
  await store.stop();
  await assert.rejects(() => store.submit(sampleTask()), /이미 정지됨/);
});

test("createJobStore: list 는 제출 순서 보존", async () => {
  const store = createJobStore({
    orchestrate: async (t) => sampleOutcome(t),
  });
  await store.submit(sampleTask({ task_id: "A", idempotency_key: "kA" }));
  await store.submit(sampleTask({ task_id: "B", idempotency_key: "kB" }));
  await store.submit(sampleTask({ task_id: "C", idempotency_key: "kC" }));
  await store.drain(2000);
  const ids = (await store.list()).map((r) => r.task.task_id);
  assert.deepEqual(ids, ["A", "B", "C"]);
  await store.stop();
});
