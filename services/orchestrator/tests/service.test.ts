import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

import type { GenerationTask, MetricsHook } from "@geny/ai-adapter-core";

import { createOrchestratorService } from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const templateDir = resolve(
  repoRoot,
  "rig-templates",
  "base",
  "halfbody",
  "v1.2.0",
);

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-orch-"));
}

function sampleTask(overrides: Partial<GenerationTask> = {}): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "t1",
    slot_id: "hair_front",
    prompt: "soft fluffy hair",
    negative_prompt: "blurry",
    size: [512, 512],
    deadline_ms: 5000,
    budget_usd: 0.1,
    idempotency_key: "k1",
    capability_required: ["edit"],
    ...overrides,
  };
}

test("createOrchestratorService: 기본 Mock 카탈로그를 로드하고 3개 어댑터 등록", () => {
  const svc = createOrchestratorService();
  const names = svc.adapters.map((a) => a.meta.name).sort();
  assert.deepEqual(names, ["flux-fill", "nano-banana", "sdxl"]);
  assert.equal(svc.catalog.schema_version, "v1");
});

test("orchestrate: Mock 어댑터 성공 → /metrics 에 geny_ai_call_total{status=\"success\"} 증가", async () => {
  const svc = createOrchestratorService();
  const outcome = await svc.orchestrate(sampleTask());
  assert.equal(outcome.result.vendor, "nano-banana");
  assert.equal(outcome.attempts.length >= 1, true);
  const metrics = svc.renderMetrics();
  assert.match(metrics, /geny_ai_call_total\{[^}]*status="success"[^}]*vendor="nano-banana"[^}]*\} 1/);
  assert.match(metrics, /geny_ai_call_duration_seconds_bucket/);
  assert.match(metrics, /geny_ai_call_cost_usd\{[^}]*vendor="nano-banana"[^}]*\}/);
});

test("extraMetricsHook: 사용자 훅이 registry 훅 뒤에 chain 으로 호출됨", async () => {
  const seen: string[] = [];
  const userHook: MetricsHook = {
    onCall(ev) {
      seen.push(`call:${ev.vendor}:${ev.status}`);
    },
    onFallback(ev) {
      seen.push(`fallback:${ev.fromVendor}->${ev.toVendor}`);
    },
  };
  const svc = createOrchestratorService({ extraMetricsHook: userHook });
  await svc.orchestrate(sampleTask());
  assert.ok(seen.some((s) => s.startsWith("call:nano-banana:success")), `seen=${seen.join(", ")}`);
  // registry 에도 동일 이벤트가 반영됨.
  assert.match(
    svc.renderMetrics(),
    /geny_ai_call_total\{[^}]*status="success"[^}]*vendor="nano-banana"[^}]*\} 1/,
  );
});

test("createMetricsServer: 바인딩 → GET /metrics → orchestrate 결과가 실제 HTTP body 에 반영", async () => {
  const svc = createOrchestratorService();
  await svc.orchestrate(sampleTask());
  const server = svc.createMetricsServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const port = (server.address() as AddressInfo).port;
    const body = await new Promise<string>((ok, fail) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: "/metrics", method: "GET" },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
        },
      );
      req.on("error", fail);
      req.end();
    });
    assert.match(body, /geny_ai_call_total\{[^}]*vendor="nano-banana"[^}]*\}/);
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

test("createMetricsServer: fallback 옵션이 /metrics 외 경로에 적용됨", async () => {
  const svc = createOrchestratorService({
    metricsServerFallback: (_req, res) => {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/json");
      res.end('{"hello":"world"}');
    },
  });
  const server = svc.createMetricsServer();
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  try {
    const port = (server.address() as AddressInfo).port;
    const body = await new Promise<string>((ok, fail) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: "/api/ping", method: "GET" },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
        },
      );
      req.on("error", fail);
      req.end();
    });
    assert.equal(body, '{"hello":"world"}');
  } finally {
    await new Promise<void>((ok) => server.close(() => ok()));
  }
});

test("runWebAvatarPipeline 위임: 실 halfbody/v1.2.0 번들 생성", () => {
  const svc = createOrchestratorService();
  const tpl = svc.loadTemplate(templateDir);
  const outDir = scratch();
  try {
    const res = svc.runWebAvatarPipeline(tpl, outDir);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("bundle.json"));
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("atlas.json"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("catalog 와 catalogPath 를 동시에 주면 throw", () => {
  assert.throws(
    () =>
      createOrchestratorService({
        catalog: { schema_version: "v1", adapters: [] },
        catalogPath: "/tmp/foo.json",
      }),
    /동시에 지정할 수 없음/,
  );
});
