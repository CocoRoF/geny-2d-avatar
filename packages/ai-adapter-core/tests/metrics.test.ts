/**
 * metrics.ts — docs/02 §9 / docs/05 §7.3 metric hook 회귀.
 *
 * (1) InMemoryMetricsRegistry unit (counter/histogram/text format)
 * (2) createRegistryMetricsHook 이 catalog §3 레이블로 방출
 * (3) routeWithFallback 에 hook 주입 — 시도별 onCall + 폴백 시 onFallback
 * (4) orchestrate → 메트릭 + provenance attempts[] parity
 * (5) mapErrorToStatus 매핑 매트릭스
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AdapterError,
  AdapterRegistry,
  InMemoryMetricsRegistry,
  NoopMetricsHook,
  createRegistryMetricsHook,
  mapErrorToStatus,
  orchestrate,
  parseAdapterCatalog,
  routeWithFallback,
} from "../src/index.js";
import type {
  AIAdapter,
  AdapterCallEvent,
  AdapterFallbackEvent,
  AdapterMeta,
  GenerationResult,
  GenerationTask,
  MetricsHook,
  ProbeReport,
} from "../src/index.js";

function meta(name: string, weight = 100): AdapterMeta {
  return {
    name,
    version: `${name}-1`,
    capability: ["edit"],
    cost_per_call_usd: 0.01,
    max_parallel: 4,
    routing_weight: weight,
  };
}

function stub(
  m: AdapterMeta,
  opts: {
    cost?: number;
    invoke?: (task: GenerationTask) => Promise<GenerationResult>;
  } = {},
): AIAdapter {
  return {
    meta: m,
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
        vendor: m.name,
        model_version: m.version,
        seed: task.seed ?? 0,
        prompt_sha256: "b".repeat(64),
        cost_usd: opts.cost ?? 0.01,
        latency_ms: 5,
        completed_at: new Date().toISOString(),
      };
    },
  };
}

function task(): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "task.m.001",
    slot_id: "hair_front",
    prompt: "metric test",
    negative_prompt: "",
    size: [512, 512],
    deadline_ms: 30000,
    budget_usd: 0.05,
    idempotency_key: "idem-m-001",
    capability_required: ["edit"],
  };
}

/**
 * 결정론적 clock — 호출 순서대로 증가. routeWithFallback 은 시도당 start/end 두 번
 * 호출하므로 duration = (end-start)/1000 = 0.1 로 유지하려면 매 호출 10ms 증가.
 */
function fakeClock(stepMs = 10) {
  let t = 0;
  return () => {
    const v = t;
    t += stepMs;
    return v;
  };
}

// ---------------------------------------------------------------------------
// (1) InMemoryMetricsRegistry unit
// ---------------------------------------------------------------------------

test("InMemoryMetricsRegistry: counter inc + getCounter", () => {
  const r = new InMemoryMetricsRegistry();
  const c = r.counter("geny_test_total", "help");
  c.inc({ a: "1" }, 2);
  c.inc({ a: "1" }, 3);
  c.inc({ a: "2" }, 1);
  assert.equal(r.getCounter("geny_test_total", { a: "1" }), 5);
  assert.equal(r.getCounter("geny_test_total", { a: "2" }), 1);
  assert.equal(r.getCounter("geny_test_total", { a: "3" }), 0);
});

test("InMemoryMetricsRegistry: histogram bucket/sum/count", () => {
  const r = new InMemoryMetricsRegistry();
  const h = r.histogram("geny_test_seconds", "help", [0.1, 1, 10]);
  h.observe({ stage: "x" }, 0.05); // bucket 0
  h.observe({ stage: "x" }, 0.5); // bucket 1
  h.observe({ stage: "x" }, 5); // bucket 2
  h.observe({ stage: "x" }, 20); // +Inf only
  assert.equal(r.getHistogramCount("geny_test_seconds", { stage: "x" }), 4);
  assert.ok(
    Math.abs(r.getHistogramSum("geny_test_seconds", { stage: "x" }) - 25.55) <
      1e-6,
  );
});

test("InMemoryMetricsRegistry: renderPrometheusText — HELP/TYPE/line format", () => {
  const r = new InMemoryMetricsRegistry();
  const c = r.counter("geny_a_total", "my counter");
  c.inc({ x: "y" }, 3);
  const h = r.histogram("geny_b_seconds", "my hist", [1]);
  h.observe({ s: "a" }, 0.5);
  h.observe({ s: "a" }, 2);
  const txt = r.renderPrometheusText();
  assert.match(txt, /# HELP geny_a_total my counter/);
  assert.match(txt, /# TYPE geny_a_total counter/);
  assert.match(txt, /geny_a_total\{x="y"\} 3/);
  assert.match(txt, /# TYPE geny_b_seconds histogram/);
  assert.match(txt, /geny_b_seconds_bucket\{le="1",s="a"\} 1/);
  assert.match(txt, /geny_b_seconds_bucket\{le="\+Inf",s="a"\} 2/);
  assert.match(txt, /geny_b_seconds_sum\{s="a"\} 2\.5/);
  assert.match(txt, /geny_b_seconds_count\{s="a"\} 2/);
});

test("InMemoryMetricsRegistry: 같은 이름 다른 타입 등록 → throw", () => {
  const r = new InMemoryMetricsRegistry();
  r.counter("dup", "c");
  assert.throws(() => r.histogram("dup", "h"));
});

test("CounterHandle: 음수 delta → throw", () => {
  const r = new InMemoryMetricsRegistry();
  const c = r.counter("x_total", "h");
  assert.throws(() => c.inc({}, -1));
});

// ---------------------------------------------------------------------------
// (2) mapErrorToStatus
// ---------------------------------------------------------------------------

test("mapErrorToStatus: AdapterError code 매핑 매트릭스", () => {
  assert.equal(mapErrorToStatus(new AdapterError("4", "VENDOR_ERROR_4XX")), "4xx");
  assert.equal(mapErrorToStatus(new AdapterError("5", "VENDOR_ERROR_5XX")), "5xx");
  assert.equal(mapErrorToStatus(new AdapterError("d", "DEADLINE_EXCEEDED")), "timeout");
  assert.equal(mapErrorToStatus(new AdapterError("u", "UNSAFE_CONTENT")), "unsafe");
  assert.equal(mapErrorToStatus(new AdapterError("c", "CAPABILITY_MISMATCH")), "4xx");
  assert.equal(mapErrorToStatus(new AdapterError("b", "BUDGET_EXCEEDED")), "4xx");
  assert.equal(mapErrorToStatus(new AdapterError("i", "INVALID_OUTPUT")), "4xx");
  assert.equal(mapErrorToStatus(new AdapterError("p", "PROBE_FAILED")), "5xx");
  assert.equal(mapErrorToStatus(new Error("network")), "5xx");
});

// ---------------------------------------------------------------------------
// (3) routeWithFallback 에 metrics hook 주입
// ---------------------------------------------------------------------------

test("routeWithFallback + metrics: 1순위 성공 → onCall(success) 1회, fallback 0회", async () => {
  const r = new AdapterRegistry();
  r.register(stub(meta("primary"), { cost: 0.02 }));
  r.register(stub(meta("secondary", 80)));
  const calls: AdapterCallEvent[] = [];
  const fallbacks: AdapterFallbackEvent[] = [];
  const hook: MetricsHook = {
    onCall: (e) => calls.push(e),
    onFallback: (e) => fallbacks.push(e),
  };
  await routeWithFallback(r, task(), { metrics: hook, now: fakeClock() });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.vendor, "primary");
  assert.equal(calls[0]?.status, "success");
  assert.equal(calls[0]?.costUsd, 0.02);
  assert.equal(calls[0]?.stage, "generation");
  assert.equal(calls[0]?.durationSeconds, 0.01);
  assert.equal(fallbacks.length, 0);
});

test("routeWithFallback + metrics: 1순위 5xx → secondary 성공 / onCall 2, onFallback 1(reason=5xx)", async () => {
  const r = new AdapterRegistry();
  r.register(
    stub(meta("primary"), {
      invoke: async () => {
        throw new AdapterError("503", "VENDOR_ERROR_5XX");
      },
    }),
  );
  r.register(stub(meta("secondary", 80)));
  const calls: AdapterCallEvent[] = [];
  const fallbacks: AdapterFallbackEvent[] = [];
  await routeWithFallback(r, task(), {
    metrics: { onCall: (e) => calls.push(e), onFallback: (e) => fallbacks.push(e) },
    now: fakeClock(),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.status, "5xx");
  assert.equal(calls[0]?.costUsd, undefined);
  assert.equal(calls[1]?.status, "success");
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0]?.fromVendor, "primary");
  assert.equal(fallbacks[0]?.toVendor, "secondary");
  assert.equal(fallbacks[0]?.reason, "5xx");
});

test("routeWithFallback + metrics: 4xx 즉시 throw → onCall(4xx) 1회, onFallback 없음", async () => {
  const r = new AdapterRegistry();
  r.register(
    stub(meta("primary"), {
      invoke: async () => {
        throw new AdapterError("400", "VENDOR_ERROR_4XX");
      },
    }),
  );
  r.register(stub(meta("secondary", 80)));
  const calls: AdapterCallEvent[] = [];
  const fallbacks: AdapterFallbackEvent[] = [];
  await assert.rejects(() =>
    routeWithFallback(r, task(), {
      metrics: { onCall: (e) => calls.push(e), onFallback: (e) => fallbacks.push(e) },
      now: fakeClock(),
    }),
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.status, "4xx");
  assert.equal(fallbacks.length, 0);
});

test("routeWithFallback + metrics: safety block → unsafe → 다음 후보 fallback(reason=unsafe)", async () => {
  const r = new AdapterRegistry();
  r.register(stub(meta("primary")));
  r.register(stub(meta("secondary", 80)));
  const calls: AdapterCallEvent[] = [];
  const fallbacks: AdapterFallbackEvent[] = [];
  let first = true;
  await routeWithFallback(r, task(), {
    metrics: { onCall: (e) => calls.push(e), onFallback: (e) => fallbacks.push(e) },
    safety: {
      async check() {
        if (first) {
          first = false;
          return { allowed: false, reason: "test-block" };
        }
        return { allowed: true };
      },
    },
    now: fakeClock(),
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.status, "unsafe");
  assert.equal(calls[1]?.status, "success");
  assert.equal(fallbacks.length, 1);
  assert.equal(fallbacks[0]?.reason, "unsafe");
});

test("routeWithFallback + metrics: 캐시 hit → onCall 0회 (어댑터 호출 없음)", async () => {
  const r = new AdapterRegistry();
  r.register(stub(meta("primary"), { cost: 0.02 }));
  const calls: AdapterCallEvent[] = [];
  // 1st run — 캐시 miss, hook 받음
  const cache = new (await import("../src/cache.js")).InMemoryAdapterCache();
  await routeWithFallback(r, task(), {
    metrics: { onCall: (e) => calls.push(e), onFallback: () => {} },
    cache,
    now: fakeClock(),
  });
  assert.equal(calls.length, 1);
  // 2nd run — 캐시 hit, hook 호출 없음
  const calls2: AdapterCallEvent[] = [];
  const out = await routeWithFallback(r, task(), {
    metrics: { onCall: (e) => calls2.push(e), onFallback: () => {} },
    cache,
    now: fakeClock(),
  });
  assert.equal(out.cached, true);
  assert.equal(calls2.length, 0);
});

test("routeWithFallback + metrics: opts.stage='refine' 전달", async () => {
  const r = new AdapterRegistry();
  r.register(stub(meta("primary")));
  const calls: AdapterCallEvent[] = [];
  await routeWithFallback(r, task(), {
    metrics: { onCall: (e) => calls.push(e), onFallback: () => {} },
    stage: "refine",
    now: fakeClock(),
  });
  assert.equal(calls[0]?.stage, "refine");
});

// ---------------------------------------------------------------------------
// (4) createRegistryMetricsHook — catalog §3 명명 규약 준수
// ---------------------------------------------------------------------------

test("createRegistryMetricsHook: catalog §3 메트릭 이름 + 레이블로 방출", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  const r = new AdapterRegistry();
  r.register(
    stub(meta("primary"), {
      invoke: async () => {
        throw new AdapterError("503", "VENDOR_ERROR_5XX");
      },
    }),
  );
  r.register(stub(meta("secondary", 80), { cost: 0.03 }));
  await routeWithFallback(r, task(), { metrics: hook, now: fakeClock() });

  // 1순위 5xx + 2순위 성공
  assert.equal(
    reg.getCounter("geny_ai_call_total", {
      vendor: "primary",
      model: "primary-1",
      stage: "generation",
      status: "5xx",
    }),
    1,
  );
  assert.equal(
    reg.getCounter("geny_ai_call_total", {
      vendor: "secondary",
      model: "secondary-1",
      stage: "generation",
      status: "success",
    }),
    1,
  );
  // cost_usd 는 success 에서만 누적
  assert.ok(
    Math.abs(
      reg.getCounter("geny_ai_call_cost_usd", {
        vendor: "secondary",
        model: "secondary-1",
        stage: "generation",
      }) - 0.03,
    ) < 1e-9,
  );
  assert.equal(
    reg.getCounter("geny_ai_call_cost_usd", {
      vendor: "primary",
      model: "primary-1",
      stage: "generation",
    }),
    0,
  );
  // fallback 1회
  assert.equal(
    reg.getCounter("geny_ai_fallback_total", {
      from_vendor: "primary",
      to_vendor: "secondary",
      reason: "5xx",
    }),
    1,
  );
  // duration histogram 두 개 레이블 조합
  assert.equal(
    reg.getHistogramCount("geny_ai_call_duration_seconds", {
      vendor: "primary",
      model: "primary-1",
      stage: "generation",
    }),
    1,
  );
  assert.equal(
    reg.getHistogramCount("geny_ai_call_duration_seconds", {
      vendor: "secondary",
      model: "secondary-1",
      stage: "generation",
    }),
    1,
  );
});

test("createRegistryMetricsHook: Prometheus text 출력에 catalog 메트릭 4종 모두", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  const r = new AdapterRegistry();
  r.register(stub(meta("primary"), { cost: 0.04 }));
  await routeWithFallback(r, task(), { metrics: hook, now: fakeClock() });
  const txt = reg.renderPrometheusText();
  assert.match(txt, /# TYPE geny_ai_call_total counter/);
  assert.match(txt, /# TYPE geny_ai_call_duration_seconds histogram/);
  assert.match(txt, /# TYPE geny_ai_call_cost_usd counter/);
  assert.match(txt, /# TYPE geny_ai_fallback_total counter/);
});

// ---------------------------------------------------------------------------
// (5) orchestrate — attempts[] ↔ metrics parity
// ---------------------------------------------------------------------------

test("orchestrate + metrics: attempts[] 와 onCall 이 1:1 대응", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  const catalog = parseAdapterCatalog({
    schema_version: "v1",
    adapters: [
      { name: "primary", version: "1.0.0", capability: ["edit"], cost_per_call_usd: 0.01, max_parallel: 1, routing_weight: 100, enabled: true },
      { name: "secondary", version: "1.0.0", capability: ["edit"], cost_per_call_usd: 0.01, max_parallel: 1, routing_weight: 80, enabled: true },
    ],
  });
  const primaryMeta: AdapterMeta = {
    name: "primary", version: "1.0.0", capability: ["edit"],
    cost_per_call_usd: 0.01, max_parallel: 1, routing_weight: 100,
  };
  const secondaryMeta: AdapterMeta = {
    name: "secondary", version: "1.0.0", capability: ["edit"],
    cost_per_call_usd: 0.01, max_parallel: 1, routing_weight: 80,
  };
  const factories = {
    primary: () =>
      stub(primaryMeta, {
        invoke: async () => {
          throw new AdapterError("503", "VENDOR_ERROR_5XX");
        },
      }),
    secondary: () => stub(secondaryMeta, { cost: 0.02 }),
  };
  const out = await orchestrate(task(), {
    catalog,
    factories,
    metrics: hook,
    now: fakeClock(),
  });
  // attempts[] = [primary fail, secondary ok]
  assert.equal(out.attempts.length, 2);
  assert.equal(out.attempts[0]?.ok, false);
  assert.equal(out.attempts[1]?.ok, true);
  // 메트릭 카운트 총합 = 2 시도
  assert.equal(
    reg.getCounter("geny_ai_call_total", {
      vendor: "primary",
      model: "1.0.0",
      stage: "generation",
      status: "5xx",
    }) +
      reg.getCounter("geny_ai_call_total", {
        vendor: "secondary",
        model: "1.0.0",
        stage: "generation",
        status: "success",
      }),
    2,
  );
});

test("NoopMetricsHook: 아무 것도 안 함 (default)", async () => {
  const r = new AdapterRegistry();
  r.register(stub(meta("p")));
  const out = await routeWithFallback(r, task(), { metrics: NoopMetricsHook });
  assert.equal(out.used, "p");
});

// ---- 세션 64: Gauge 메트릭 (geny_queue_depth 등 큐 상태 노출용) ------------

test("InMemoryMetricsRegistry: gauge set/getGauge + Prometheus text 'gauge' 타입", () => {
  const reg = new InMemoryMetricsRegistry();
  const g = reg.gauge("geny_queue_depth", "BullMQ queue depth by state");
  g.set({ queue_name: "geny-generate", state: "waiting" }, 7);
  g.set({ queue_name: "geny-generate", state: "active" }, 2);
  g.set({ queue_name: "geny-generate", state: "waiting" }, 5); // 덮어쓰기 (counter 와 구분)

  assert.equal(reg.getGauge("geny_queue_depth", { queue_name: "geny-generate", state: "waiting" }), 5);
  assert.equal(reg.getGauge("geny_queue_depth", { queue_name: "geny-generate", state: "active" }), 2);
  assert.equal(reg.getGauge("geny_queue_depth", { queue_name: "geny-generate", state: "failed" }), 0);

  const text = reg.renderPrometheusText();
  assert.match(text, /# HELP geny_queue_depth /);
  assert.match(text, /# TYPE geny_queue_depth gauge/);
  assert.match(text, /geny_queue_depth\{queue_name="geny-generate",state="waiting"\} 5/);
  assert.match(text, /geny_queue_depth\{queue_name="geny-generate",state="active"\} 2/);
});

test("InMemoryMetricsRegistry: gauge 이름 타입 충돌 거부 + NaN/Infinity 거부", () => {
  const reg = new InMemoryMetricsRegistry();
  reg.counter("dual", "help");
  assert.throws(() => reg.gauge("dual", "help"), /already registered as counter/);

  reg.gauge("g1", "help");
  assert.throws(() => reg.counter("g1", "help"), /already registered as gauge/);

  const g = reg.gauge("g2", "help");
  assert.throws(() => g.set({}, Number.NaN), /finite/);
  assert.throws(() => g.set({}, Number.POSITIVE_INFINITY), /finite/);
});
