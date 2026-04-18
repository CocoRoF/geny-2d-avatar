import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  InMemoryAdapterCache,
  buildCacheKey,
} from "../src/index.js";
import type { GenerationResult, GenerationTask } from "../src/index.js";

function makeTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "t-1",
    slot_id: "hair_front",
    prompt: "aria hair front",
    negative_prompt: "",
    size: [1024, 1024],
    deadline_ms: 30_000,
    budget_usd: 0.02,
    idempotency_key: "idem-1",
    ...overrides,
  };
}

function makeResult(task: GenerationTask, seed = 42): GenerationResult {
  return {
    schema_version: "v1",
    task_id: task.task_id,
    slot_id: task.slot_id,
    image_sha256: "a".repeat(64),
    alpha_sha256: null,
    bbox: [0, 0, task.size[0], task.size[1]],
    vendor: "nano-banana",
    model_version: "mock-x",
    seed,
    prompt_sha256: "b".repeat(64),
    cost_usd: 0.015,
    latency_ms: 120,
    completed_at: "2026-04-18T12:00:00Z",
  };
}

test("buildCacheKey: 동일 입력 → 동일 key (결정론)", () => {
  const task = makeTask();
  const k1 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  const k2 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  assert.equal(k1, k2);
  assert.match(k1, /^[0-9a-f]{64}$/);
});

test("buildCacheKey: seed 가 다르면 key 가 달라진다", () => {
  const task = makeTask();
  const k1 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  const k2 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 43 });
  assert.notEqual(k1, k2);
});

test("buildCacheKey: prompt 변경 시 key 변경", () => {
  const task1 = makeTask();
  const task2 = makeTask({ prompt: "different prompt" });
  const k1 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task: task1, seed: 42 });
  const k2 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task: task2, seed: 42 });
  assert.notEqual(k1, k2);
});

test("buildCacheKey: model_version 이 다르면 key 달라짐 (캐시 무효)", () => {
  const task = makeTask();
  const k1 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  const k2 = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v2", task, seed: 42 });
  assert.notEqual(k1, k2);
});

test("buildCacheKey: style_reference_sha256 순서 독립 (정렬된 뒤 해시)", () => {
  const a = makeTask({ style_reference_sha256: ["aa", "bb", "cc"] });
  const b = makeTask({ style_reference_sha256: ["cc", "bb", "aa"] });
  const ka = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task: a, seed: 42 });
  const kb = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task: b, seed: 42 });
  assert.equal(ka, kb);
});

test("InMemoryAdapterCache: set 후 get 으로 조회", async () => {
  const cache = new InMemoryAdapterCache();
  const task = makeTask();
  const result = makeResult(task);
  const key = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  await cache.set(key, result);
  const got = await cache.get(key);
  assert.deepEqual(got, result);
  assert.equal(cache.size(), 1);
});

test("InMemoryAdapterCache: miss 는 null", async () => {
  const cache = new InMemoryAdapterCache();
  const got = await cache.get("nonexistent".repeat(8));
  assert.equal(got, null);
});

test("InMemoryAdapterCache: TTL 만료 후 null + 엔트리 자동 삭제", async () => {
  const cache = new InMemoryAdapterCache(10);
  const task = makeTask();
  const result = makeResult(task);
  const key = buildCacheKey({ adapterName: "nano-banana", modelVersion: "v1", task, seed: 42 });
  await cache.set(key, result);
  await new Promise((resolve) => setTimeout(resolve, 30));
  const got = await cache.get(key);
  assert.equal(got, null);
  assert.equal(cache.size(), 0);
});

test("InMemoryAdapterCache: clear() 는 모든 엔트리 제거", async () => {
  const cache = new InMemoryAdapterCache();
  const task = makeTask();
  await cache.set("k1", makeResult(task));
  await cache.set("k2", makeResult(task));
  assert.equal(cache.size(), 2);
  cache.clear();
  assert.equal(cache.size(), 0);
});
