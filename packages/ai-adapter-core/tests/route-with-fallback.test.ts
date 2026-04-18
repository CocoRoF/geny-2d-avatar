/**
 * routeWithFallback() 회귀 — docs/05 §8.1.
 *
 * 세 축의 조합을 stub 어댑터로 증명:
 *  - 1순위 성공 → primary 결과
 *  - 1순위 5xx → 2순위로 내려가 성공
 *  - 1순위 4xx (VENDOR_ERROR_4XX / CAPABILITY_MISMATCH) → 즉시 throw (폴백 금지)
 *  - safety.check(allowed=false) → 다음 후보로 내려감 + UNSAFE_CONTENT 기록
 *  - 캐시 hit → 어댑터 호출 없이 즉시 반환
 *  - maxAttempts 제한 → 폴백 후보 제한
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AdapterError,
  AdapterRegistry,
  InMemoryAdapterCache,
  NoopSafetyFilter,
  buildCacheKey,
  deterministicSeed,
  routeWithFallback,
} from "../src/index.js";
import type {
  AIAdapter,
  AdapterErrorCode,
  AdapterMeta,
  GenerationResult,
  GenerationTask,
  ProbeReport,
  SafetyFilter,
  SafetyVerdict,
} from "../src/index.js";

type InvokeFn = (task: GenerationTask) => Promise<GenerationResult>;

function stubAdapter(
  meta: AdapterMeta,
  opts: { cost?: number; invoke?: InvokeFn } = {},
): AIAdapter {
  return {
    meta,
    estimateCost: () => opts.cost ?? 0.01,
    async probe(): Promise<ProbeReport> {
      return { ok: true, latency_ms: 1, checked_at: new Date().toISOString() };
    },
    async generate(task) {
      if (opts.invoke) return opts.invoke(task);
      return {
        schema_version: "v1",
        task_id: task.task_id,
        slot_id: task.slot_id,
        image_sha256: "a".repeat(64),
        alpha_sha256: null,
        bbox: [0, 0, task.size[0], task.size[1]],
        vendor: meta.name,
        model_version: meta.version,
        seed: task.seed ?? 0,
        prompt_sha256: "b".repeat(64),
        cost_usd: opts.cost ?? 0.01,
        latency_ms: 5,
        completed_at: new Date().toISOString(),
      };
    },
  };
}

function makeTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "task.rf.001",
    slot_id: "hair_front",
    prompt: "pink clean hair",
    negative_prompt: "",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: "idem-rf-001",
    capability_required: ["edit"],
    ...overrides,
  };
}

function meta(name: string, weight: number): AdapterMeta {
  return {
    name,
    version: `${name}-1`,
    capability: ["edit"],
    cost_per_call_usd: 0.01,
    max_parallel: 4,
    routing_weight: weight,
  };
}

test("routeWithFallback: 1순위 성공 → primary 결과 + attempts=[1 ok]", async () => {
  const r = new AdapterRegistry();
  r.register(stubAdapter(meta("primary", 100)));
  r.register(stubAdapter(meta("secondary", 80)));
  const out = await routeWithFallback(r, makeTask());
  assert.equal(out.primary, "primary");
  assert.equal(out.used, "primary");
  assert.equal(out.result.vendor, "primary");
  assert.equal(out.attempts.length, 1);
  assert.equal(out.attempts[0]?.ok, true);
  assert.equal(out.cached, false);
});

test("routeWithFallback: 5xx 폴백 — primary 실패 시 secondary 성공", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new AdapterError("503", "VENDOR_ERROR_5XX");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  const out = await routeWithFallback(r, makeTask());
  assert.equal(out.used, "secondary");
  assert.equal(out.result.vendor, "secondary");
  assert.equal(out.attempts.length, 2);
  assert.equal(out.attempts[0]?.ok, false);
  assert.equal(out.attempts[0]?.errorCode, "VENDOR_ERROR_5XX");
  assert.equal(out.attempts[1]?.ok, true);
});

test("routeWithFallback: 4xx 는 폴백 금지 — 즉시 throw", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new AdapterError("400", "VENDOR_ERROR_4XX");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  await assert.rejects(
    () => routeWithFallback(r, makeTask()),
    (e: unknown) =>
      e instanceof AdapterError && e.code === "VENDOR_ERROR_4XX",
  );
});

test("routeWithFallback: CAPABILITY_MISMATCH 는 폴백 금지 — 즉시 throw", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new AdapterError("bad cap", "CAPABILITY_MISMATCH");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  await assert.rejects(
    () => routeWithFallback(r, makeTask()),
    (e: unknown) =>
      e instanceof AdapterError && e.code === "CAPABILITY_MISMATCH",
  );
});

test("routeWithFallback: DEADLINE_EXCEEDED 폴백 허용", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new AdapterError("slow", "DEADLINE_EXCEEDED");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  const out = await routeWithFallback(r, makeTask());
  assert.equal(out.used, "secondary");
});

test("routeWithFallback: 비-AdapterError (네트워크) 는 5xx 로 간주 폴백", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new Error("ECONNRESET");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  const out = await routeWithFallback(r, makeTask());
  assert.equal(out.used, "secondary");
  assert.equal(out.attempts[0]?.errorCode, "VENDOR_ERROR_5XX");
});

test("routeWithFallback: 모든 후보 5xx → 마지막 에러 rethrow", async () => {
  const r = new AdapterRegistry();
  const boom = (code: AdapterErrorCode) => ({
    invoke: async () => {
      throw new AdapterError(code, code);
    },
  });
  r.register(stubAdapter(meta("primary", 100), boom("VENDOR_ERROR_5XX")));
  r.register(stubAdapter(meta("secondary", 80), boom("DEADLINE_EXCEEDED")));
  await assert.rejects(
    () => routeWithFallback(r, makeTask()),
    (e: unknown) =>
      e instanceof AdapterError &&
      (e.code === "DEADLINE_EXCEEDED" || e.code === "VENDOR_ERROR_5XX"),
  );
});

test("routeWithFallback: safety filter allow-all (Noop) → 결과 그대로", async () => {
  const r = new AdapterRegistry();
  r.register(stubAdapter(meta("primary", 100)));
  const out = await routeWithFallback(r, makeTask(), {
    safety: new NoopSafetyFilter(),
  });
  assert.equal(out.used, "primary");
});

test("routeWithFallback: safety block → 다음 후보로 폴백", async () => {
  const r = new AdapterRegistry();
  r.register(stubAdapter(meta("primary", 100)));
  r.register(stubAdapter(meta("secondary", 80)));
  const blockFirst: SafetyFilter = {
    async check(result): Promise<SafetyVerdict> {
      if (result.vendor === "primary") {
        return { allowed: false, reason: "test-block", categories: ["mock"] };
      }
      return { allowed: true };
    },
  };
  const out = await routeWithFallback(r, makeTask(), { safety: blockFirst });
  assert.equal(out.used, "secondary");
  assert.equal(out.attempts[0]?.ok, false);
  assert.equal(out.attempts[0]?.errorCode, "UNSAFE_CONTENT");
});

test("routeWithFallback: 모든 후보 safety block → UNSAFE_CONTENT throw", async () => {
  const r = new AdapterRegistry();
  r.register(stubAdapter(meta("primary", 100)));
  r.register(stubAdapter(meta("secondary", 80)));
  const blockAll: SafetyFilter = {
    async check() {
      return { allowed: false, reason: "always-block" };
    },
  };
  await assert.rejects(
    () => routeWithFallback(r, makeTask(), { safety: blockAll }),
    (e: unknown) => e instanceof AdapterError && e.code === "UNSAFE_CONTENT",
  );
});

test("routeWithFallback: 캐시 hit — 어댑터 호출 없이 cached=true", async () => {
  const r = new AdapterRegistry();
  let called = 0;
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async (task) => {
        called++;
        return {
          schema_version: "v1",
          task_id: task.task_id,
          slot_id: task.slot_id,
          image_sha256: "c".repeat(64),
          alpha_sha256: null,
          bbox: [0, 0, 1, 1],
          vendor: "primary",
          model_version: "primary-1",
          seed: 0,
          prompt_sha256: "0".repeat(64),
          cost_usd: 0.01,
          latency_ms: 1,
          completed_at: new Date().toISOString(),
        };
      },
    }),
  );
  const cache = new InMemoryAdapterCache();
  const task = makeTask();
  const first = await routeWithFallback(r, task, { cache });
  assert.equal(first.cached, false);
  assert.equal(called, 1);
  const second = await routeWithFallback(r, task, { cache });
  assert.equal(second.cached, true);
  assert.equal(called, 1, "캐시 hit 시 어댑터 재호출 금지");
  assert.equal(second.result.image_sha256, first.result.image_sha256);
});

test("routeWithFallback: 캐시 key 는 primary adapter 기준", async () => {
  const r = new AdapterRegistry();
  r.register(stubAdapter(meta("primary", 100)));
  r.register(stubAdapter(meta("secondary", 80)));
  const task = makeTask();
  const seed = deterministicSeed(task.idempotency_key);
  const expectedKey = buildCacheKey({
    adapterName: "primary",
    modelVersion: "primary-1",
    task,
    seed,
  });
  const cache = new InMemoryAdapterCache();
  await routeWithFallback(r, task, { cache });
  assert.ok(await cache.get(expectedKey), "primary 기반 key 로 저장되어야 함");
});

test("routeWithFallback: maxAttempts=1 → 1순위 실패 시 폴백 금지", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter(meta("primary", 100), {
      invoke: async () => {
        throw new AdapterError("503", "VENDOR_ERROR_5XX");
      },
    }),
  );
  r.register(stubAdapter(meta("secondary", 80)));
  await assert.rejects(
    () => routeWithFallback(r, makeTask(), { maxAttempts: 1 }),
    (e: unknown) =>
      e instanceof AdapterError && e.code === "VENDOR_ERROR_5XX",
  );
});

test("routeWithFallback: NO_ELIGIBLE_ADAPTER 전파 (route() 단계)", async () => {
  const r = new AdapterRegistry();
  r.register(
    stubAdapter({
      name: "only",
      version: "1",
      capability: ["upscale"],
      cost_per_call_usd: 0.01,
      max_parallel: 1,
      routing_weight: 100,
    }),
  );
  await assert.rejects(
    () => routeWithFallback(r, makeTask()),
    (e: unknown) =>
      e instanceof AdapterError && e.code === "NO_ELIGIBLE_ADAPTER",
  );
});
