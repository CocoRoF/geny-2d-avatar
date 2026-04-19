import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import type { AddressInfo } from "node:net";

import type { AdapterCatalog } from "@geny/ai-adapter-core";
import {
  createHttpAdapterFactories,
  createMockAdapterFactories,
} from "@geny/orchestrator-service";

import {
  createBullMQJobStore,
  createQueueMetricsSampler,
} from "@geny/job-queue-bullmq";
import type {
  BullMQDriver,
  BullMQJobSnapshot,
  BullMQQueueCounts,
} from "@geny/job-queue-bullmq";

import { createWorkerGenerate } from "../src/index.js";

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function realCatalog(): AdapterCatalog {
  return {
    schema_version: "v1",
    adapters: [
      {
        name: "nano-banana",
        version: "0.1.0",
        capability: ["edit", "style_ref", "mask"],
        cost_per_call_usd: 0.015,
        max_parallel: 8,
        routing_weight: 100,
        enabled: true,
        config: {
          endpoint: "https://nano-banana.test",
          api_key_env: "NANO_BANANA_API_KEY",
          model: "gemini-2.5-flash-image",
          timeout_ms: 60000,
        },
      },
      {
        name: "sdxl",
        version: "0.1.0",
        capability: ["edit", "style_ref"],
        cost_per_call_usd: 0.022,
        max_parallel: 4,
        routing_weight: 80,
        enabled: true,
        config: {
          endpoint: "https://sdxl.test",
          api_key_env: "SDXL_API_KEY",
          model: "sdxl-inpaint-1.0",
          timeout_ms: 90000,
        },
      },
      {
        name: "flux-fill",
        version: "0.1.0",
        capability: ["edit", "mask"],
        cost_per_call_usd: 0.028,
        max_parallel: 2,
        routing_weight: 70,
        enabled: true,
        config: {
          endpoint: "https://flux-fill.test",
          api_key_env: "FLUX_FILL_API_KEY",
          model: "flux-fill-pro-1.0",
          timeout_ms: 90000,
        },
      },
    ],
  };
}

async function withHttp(
  worker: ReturnType<typeof createWorkerGenerate>,
  body: (port: number) => Promise<void>,
): Promise<void> {
  const server = worker.createServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const port = (server.address() as AddressInfo).port;
    await body(port);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
    await worker.store.stop();
  }
}

function reqJson(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: payload
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => ok({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") }));
      },
    );
    req.on("error", fail);
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

test("wiring: 기본 Mock 어댑터 wire → POST /jobs e2e + /metrics 반영", async () => {
  const worker = createWorkerGenerate();
  await withHttp(worker, async (port) => {
    const post = await reqJson(port, "POST", "/jobs", {
      schema_version: "v1",
      task_id: "t-wire-1",
      slot_id: "hair_front",
      prompt: "pastel soft hair",
      negative_prompt: "",
      size: [512, 512],
      deadline_ms: 5000,
      budget_usd: 0.1,
      idempotency_key: "idem-wire-1",
      capability_required: ["edit"],
    });
    assert.equal(post.status, 202);
    const submit = JSON.parse(post.body);
    await worker.store.waitFor(submit.job_id, 2000);
    const get = await reqJson(port, "GET", `/jobs/${submit.job_id}`);
    assert.equal(get.status, 200);
    const parsed = JSON.parse(get.body);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.result.vendor, "nano-banana");

    const metrics = await reqJson(port, "GET", "/metrics");
    assert.equal(metrics.status, 200);
    assert.match(metrics.body, /geny_ai_call_total\{[^}]*vendor="nano-banana"[^}]*\} 1/);

    const health = await reqJson(port, "GET", "/healthz");
    assert.equal(health.status, 200);
    assert.equal(health.body, "ok\n");
  });
});

test("wiring: --http 주입된 fetch 로 실 벤더 HTTP 경로 e2e (ADR 0005 L4 apiModel 분리 재검증)", async () => {
  const imageSha = sha("worker-http-flow");
  const calls: Array<{ url: string; model: string }> = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const body = init?.body ? JSON.parse(init.body as string) : {};
    calls.push({ url, model: body.model });
    return new Response(
      JSON.stringify({
        image_sha256: imageSha,
        alpha_sha256: null,
        bbox: [0, 0, 512, 512],
        latency_ms: 42,
        vendor_metadata: { tier: "http" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };

  const catalog = realCatalog();
  const worker = createWorkerGenerate({
    orchestratorOptions: {
      catalog,
      factories: {
        ...createMockAdapterFactories(),
        ...createHttpAdapterFactories(catalog, {
          apiKeys: { "nano-banana": "nb-key-for-test" },
          fetch: fakeFetch,
        }),
      },
    },
  });

  await withHttp(worker, async (port) => {
    const post = await reqJson(port, "POST", "/jobs", {
      schema_version: "v1",
      task_id: "t-http",
      slot_id: "hair_front",
      prompt: "pastel soft hair",
      negative_prompt: "",
      size: [512, 512],
      deadline_ms: 5000,
      budget_usd: 0.1,
      idempotency_key: "idem-http",
      capability_required: ["edit"],
    });
    assert.equal(post.status, 202);
    const submit = JSON.parse(post.body);
    await worker.store.waitFor(submit.job_id, 2000);
    const get = await reqJson(port, "GET", `/jobs/${submit.job_id}`);
    const parsed = JSON.parse(get.body);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.result.vendor, "nano-banana");
    assert.equal(parsed.result.image_sha256, imageSha);
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, "https://nano-banana.test/v1/generate");
  // ADR 0005 L4: 카탈로그 version "0.1.0" 이 벤더 request `model` 로 누출되면 안 됨 →
  // config.model ("gemini-2.5-flash-image") 이 전달되어야 함.
  assert.equal(calls[0]!.model, "gemini-2.5-flash-image");
});

/**
 * 세션 63 storeFactory 주입 경로 — fake BullMQDriver 를 `createBullMQJobStore` 에 물려
 * `createWorkerGenerate({ storeFactory })` 로 넘겼을 때 in-memory store 대신 BullMQ 경로
 * 로 `submit` 이 라우팅되고, BullMQ jobId 가 idempotency_key 와 동일한지 확인.
 *
 * 실 Redis 없이 어댑터 계약 수준으로 `--driver bullmq` 배선을 회귀한다. 실 ioredis+Queue
 * e2e 는 `REDIS_URL` 세팅된 환경에서 `@geny/job-queue-bullmq` integration suite 가 커버.
 */
function makeFakeBullMQDriver(): {
  driver: BullMQDriver;
  jobs: Map<string, BullMQJobSnapshot>;
} {
  const jobs = new Map<string, BullMQJobSnapshot>();
  const driver: BullMQDriver = {
    async add({ jobId, data }) {
      const cached = jobs.get(jobId);
      if (cached) return cached;
      const snap: BullMQJobSnapshot = {
        id: jobId,
        state: "waiting",
        data,
        timestamp: Date.now(),
      };
      jobs.set(jobId, snap);
      return snap;
    },
    async getJob(id) {
      return jobs.get(id) ?? null;
    },
    async listJobs() {
      return Array.from(jobs.values());
    },
    async getCounts(): Promise<BullMQQueueCounts> {
      return {
        waiting: jobs.size,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    },
    async close() {},
  };
  return { driver, jobs };
}

test("wiring: storeFactory 주입 → BullMQ 경로로 submit 라우팅 (세션 63)", async () => {
  const { driver, jobs: driverJobs } = makeFakeBullMQDriver();
  const worker = createWorkerGenerate({
    storeFactory: (orchestrate) => createBullMQJobStore({ driver, orchestrate }),
  });
  await withHttp(worker, async (port) => {
    const idem = "idem-bullmq-wire-1";
    const post = await reqJson(port, "POST", "/jobs", {
      schema_version: "v1",
      task_id: "t-bullmq",
      slot_id: "hair_front",
      prompt: "pastel soft hair",
      negative_prompt: "",
      size: [512, 512],
      deadline_ms: 5000,
      budget_usd: 0.1,
      idempotency_key: idem,
      capability_required: ["edit"],
    });
    assert.equal(post.status, 202);
    const submit = JSON.parse(post.body);
    assert.equal(submit.job_id, idem);
    // fake driver 에 해당 jobId 가 기록돼야 함 → BullMQ 경로 활성 증명.
    assert.ok(driverJobs.has(idem), "fake BullMQ driver 에 jobId 가 기록되지 않음");

    await worker.store.waitFor(submit.job_id, 2000);
    const get = await reqJson(port, "GET", `/jobs/${submit.job_id}`);
    const parsed = JSON.parse(get.body);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.result.vendor, "nano-banana");
  });
});

/**
 * 세션 64 — `geny_queue_depth` gauge sampler 가 worker 의 `InMemoryMetricsRegistry` 에
 * 바인딩되면 `/metrics` text exposition 에 5 상태 gauge 값이 그대로 실려야 한다. BullMQ
 * Worker/Redis 없이 fake driver 가 반환하는 counts 만으로 배선 경로를 회귀한다.
 */
test("wiring: geny_queue_depth sampler → /metrics exposition (세션 64)", async () => {
  const { driver } = makeFakeBullMQDriver();
  // fake driver 의 기본 getCounts 는 jobs.size 를 waiting 에 싣는다 — 이번 테스트는 고정값으로
  // 덮어써 assertion 을 결정적으로 만든다.
  const fixedCounts: BullMQQueueCounts = {
    waiting: 7,
    active: 2,
    delayed: 1,
    completed: 42,
    failed: 3,
  };
  const overriddenDriver: BullMQDriver = {
    ...driver,
    async getCounts() {
      return fixedCounts;
    },
  };

  const worker = createWorkerGenerate({
    storeFactory: (orchestrate) => createBullMQJobStore({ driver: overriddenDriver, orchestrate }),
  });

  const gauge = worker.service.registry.gauge(
    "geny_queue_depth",
    "BullMQ queue depth by state (catalog §2.1)",
  );
  const sampler = createQueueMetricsSampler({
    driver: overriddenDriver,
    sink: {
      setDepth(labels, value) {
        gauge.set(labels, value);
      },
    },
    queueName: "geny-test",
  });
  await sampler.tickOnce();

  try {
    await withHttp(worker, async (port) => {
      const metrics = await reqJson(port, "GET", "/metrics");
      assert.equal(metrics.status, 200);
      assert.match(metrics.body, /# TYPE geny_queue_depth gauge/);
      assert.match(
        metrics.body,
        /geny_queue_depth\{queue_name="geny-test",state="waiting"\} 7/,
      );
      assert.match(
        metrics.body,
        /geny_queue_depth\{queue_name="geny-test",state="active"\} 2/,
      );
      assert.match(
        metrics.body,
        /geny_queue_depth\{queue_name="geny-test",state="completed"\} 42/,
      );
    });
  } finally {
    await sampler.stop();
  }
});

/**
 * 세션 65 — producer 역할(mode="producer-only") 로 잡 submit 시 `onEnqueued` 훅이 registry
 * counter 를 증가시키는 경로를 회귀한다. 재제출 dedupe 는 counter 미증가. fake driver 기반
 * (BullMQ Worker/Redis 없이) — producer 쪽 enqueue counter 배선만 검증.
 *
 * consumer 측 (failed_total + duration_seconds) 은 processor-metrics 단위 테스트에서 커버,
 * 실 Worker 결선은 `REDIS_URL` integration 세션에서 perf-harness 로 검증.
 */
test("wiring: producer-only store.onEnqueued → geny_queue_enqueued_total 증가 (세션 65)", async () => {
  const { driver, jobs } = makeFakeBullMQDriver();
  const queueName = "geny-prod-only";

  let counterInc: ((labels: { queue_name: string }) => void) | undefined;
  const onEnqueued = (): void => {
    counterInc?.({ queue_name: queueName });
  };

  const worker = createWorkerGenerate({
    storeFactory: (_orchestrate) =>
      createBullMQJobStore({
        driver,
        mode: "producer-only",
        onEnqueued,
      }),
  });
  const counter = worker.service.registry.counter(
    "geny_queue_enqueued_total",
    "큐에 투입된 누적 잡 수 (catalog §2.1)",
  );
  counterInc = (labels) => counter.inc(labels);

  try {
    await withHttp(worker, async (port) => {
      const body = {
        schema_version: "v1",
        task_id: "t-prod-1",
        slot_id: "hair_front",
        prompt: "p",
        negative_prompt: "",
        size: [512, 512],
        deadline_ms: 5000,
        budget_usd: 0.1,
        idempotency_key: "idem-prod-001",
        capability_required: ["edit"],
      };
      const r1 = await reqJson(port, "POST", "/jobs", body);
      assert.equal(r1.status, 202);
      const r2 = await reqJson(port, "POST", "/jobs", body); // dedupe — counter 미증가
      assert.equal(r2.status, 202);
      const body2 = { ...body, idempotency_key: "idem-prod-002", task_id: "t-prod-2" };
      const r3 = await reqJson(port, "POST", "/jobs", body2);
      assert.equal(r3.status, 202);

      // producer-only 라 jobs 는 fake driver 에 남아 있고 orchestrate 는 미실행.
      assert.ok(jobs.has("idem-prod-001"));
      assert.ok(jobs.has("idem-prod-002"));

      const metrics = await reqJson(port, "GET", "/metrics");
      assert.equal(metrics.status, 200);
      assert.match(metrics.body, /# TYPE geny_queue_enqueued_total counter/);
      assert.match(
        metrics.body,
        /geny_queue_enqueued_total\{queue_name="geny-prod-only"\} 2/,
      );
    });
  } finally {
    await worker.store.stop();
  }
});
