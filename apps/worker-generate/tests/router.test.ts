import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

import type {
  GenerationResult,
  GenerationTask,
  OrchestrateOutcome,
  ProvenancePartEntry,
} from "@geny/ai-adapter-core";

import { createJobRouter, validateTask } from "../src/router.js";
import { createJobStore } from "../src/job-store.js";

function sampleTaskBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
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

function okOutcome(task: GenerationTask): OrchestrateOutcome {
  const result: GenerationResult = {
    schema_version: "v1",
    task_id: task.task_id,
    slot_id: task.slot_id,
    image_sha256: "a".repeat(64),
    vendor: "nano-banana",
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
    vendor: "nano-banana",
    model_version: "0.1.0",
    seed: 1,
    prompt_sha256: "b".repeat(64),
    source_asset_sha256: null,
  };
  return { result, primary: "nano-banana", used: "nano-banana", attempts: [], cached: false, provenance };
}

async function doReq(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; body: string }> {
  return new Promise((ok, fail) => {
    const payload = body === undefined ? undefined : JSON.stringify(body);
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method,
        path,
        headers: {
          ...(payload !== undefined
            ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) }
            : {}),
          ...(headers ?? {}),
        },
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

async function withServer(
  handler: (req: IncomingMessage, res: ServerResponse) => void,
  body: (port: number) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const port = (server.address() as AddressInfo).port;
    await body(port);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
}

test("validateTask: 최소 필드 통과 · 누락/형 오류 거부", () => {
  assert.equal(validateTask(sampleTaskBody()).ok, true);
  assert.match(
    (validateTask({ ...sampleTaskBody(), schema_version: "v2" }) as { error: string }).error,
    /schema_version/,
  );
  assert.match(
    (validateTask({ ...sampleTaskBody(), prompt: "" }) as { error: string }).error,
    /prompt/,
  );
  assert.match(
    (validateTask({ ...sampleTaskBody(), size: [512] }) as { error: string }).error,
    /size/,
  );
  assert.match(
    (validateTask({ ...sampleTaskBody(), deadline_ms: -1 }) as { error: string }).error,
    /deadline_ms/,
  );
  assert.match((validateTask(null) as { error: string }).error, /object/);
});

test("router: POST /jobs → 202 + GET /jobs/{id} → succeeded", async () => {
  let n = 0;
  const store = createJobStore({
    orchestrate: async (task) => okOutcome(task),
    jobIdFn: () => `job-${++n}`,
  });
  const handler = createJobRouter({ store });
  await withServer(handler, async (port) => {
    const post = await doReq(port, "POST", "/jobs", sampleTaskBody());
    assert.equal(post.status, 202);
    const submit = JSON.parse(post.body);
    assert.equal(submit.status, "queued");
    assert.equal(submit.job_id, "job-1");
    // 최종 상태 기다림.
    await store.waitFor("job-1", 2000);
    const get = await doReq(port, "GET", "/jobs/job-1");
    assert.equal(get.status, 200);
    const parsed = JSON.parse(get.body);
    assert.equal(parsed.status, "succeeded");
    assert.equal(parsed.result.vendor, "nano-banana");
    assert.equal(parsed.result.attempts, 0);
  });
  await store.stop();
});

test("router: POST /jobs 잘못된 JSON → 400", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    // 원시 body "not json" 을 application/json 으로 보냄 → parse 실패 → 400.
    const payload = "not json";
    const bad = await new Promise<{ status: number }>((ok, fail) => {
      const req = httpRequest(
        {
          host: "127.0.0.1",
          port,
          method: "POST",
          path: "/jobs",
          headers: {
            "content-type": "application/json",
            "content-length": Buffer.byteLength(payload),
          },
        },
        (res) => {
          res.on("data", () => undefined);
          res.on("end", () => ok({ status: res.statusCode ?? 0 }));
        },
      );
      req.on("error", fail);
      req.write(payload);
      req.end();
    });
    assert.equal(bad.status, 400);
  });
  await store.stop();
});

test("router: POST /jobs 잘못된 Content-Type → 415", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    const ct = await doReq(port, "POST", "/jobs", undefined, { "content-type": "text/plain" });
    assert.equal(ct.status, 415);
  });
  await store.stop();
});

test("router: POST /jobs body 검증 실패 → 400 + error 메시지", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    const r = await doReq(port, "POST", "/jobs", { ...sampleTaskBody(), prompt: "" });
    assert.equal(r.status, 400);
    const body = JSON.parse(r.body);
    assert.match(body.error, /prompt/);
  });
  await store.stop();
});

test("router: GET /jobs/{unknown} → 404", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    const r = await doReq(port, "GET", "/jobs/nope");
    assert.equal(r.status, 404);
  });
  await store.stop();
});

test("router: GET /jobs 전체 목록 반환", async () => {
  let n = 0;
  const store = createJobStore({
    orchestrate: async (t) => okOutcome(t),
    jobIdFn: () => `j-${++n}`,
  });
  store.submit(sampleTaskBody() as unknown as GenerationTask);
  store.submit({ ...sampleTaskBody(), task_id: "t2", idempotency_key: "k2" } as unknown as GenerationTask);
  await store.drain(2000);
  await withServer(createJobRouter({ store }), async (port) => {
    const r = await doReq(port, "GET", "/jobs");
    assert.equal(r.status, 200);
    const body = JSON.parse(r.body);
    assert.equal(body.jobs.length, 2);
    assert.equal(body.jobs[0].task_id, "t1");
    assert.equal(body.jobs[1].task_id, "t2");
  });
  await store.stop();
});

test("router: 알 수 없는 path → 404", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    const r = await doReq(port, "GET", "/nope");
    assert.equal(r.status, 404);
  });
  await store.stop();
});

test("router: /jobs 에 PUT 등 잘못된 method → 405 + Allow 헤더", async () => {
  const store = createJobStore({ orchestrate: async (t) => okOutcome(t) });
  await withServer(createJobRouter({ store }), async (port) => {
    const r = await new Promise<{ status: number; allow: string }>((ok, fail) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, method: "PUT", path: "/jobs" },
        (res) =>
          res.on("data", () => undefined).on("end", () =>
            ok({ status: res.statusCode ?? 0, allow: String(res.headers["allow"] ?? "") }),
          ),
      );
      req.on("error", fail);
      req.end();
    });
    assert.equal(r.status, 405);
    assert.match(r.allow, /POST/);
  });
  await store.stop();
});
