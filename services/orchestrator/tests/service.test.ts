import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { AddressInfo } from "node:net";

import type {
  AdapterCatalog,
  GenerationTask,
  MetricsHook,
} from "@geny/ai-adapter-core";

import {
  createHttpAdapterFactories,
  createMockAdapterFactories,
  createOrchestratorService,
  loadApiKeysFromCatalogEnv,
} from "../src/index.js";

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

/* ---------- 세션 42: HTTP 팩토리 주입 ---------- */

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function realCatalog(): AdapterCatalog {
  // infra/adapters/adapters.json 과 동일한 구조의 in-memory fixture.
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

test("loadApiKeysFromCatalogEnv: env 에 있는 키만 수집 · 없거나 빈 문자열은 건너뜀", () => {
  const env = {
    NANO_BANANA_API_KEY: "nb-secret",
    SDXL_API_KEY: "",
    // FLUX_FILL_API_KEY 없음
  };
  const keys = loadApiKeysFromCatalogEnv(realCatalog(), env);
  assert.deepEqual(keys, { "nano-banana": "nb-secret" });
});

test("createHttpAdapterFactories: apiKeys 에 있는 어댑터만 HTTP 팩토리로 빌드", () => {
  const factories = createHttpAdapterFactories(realCatalog(), {
    apiKeys: { "nano-banana": "nb", "flux-fill": "ff" },
  });
  assert.deepEqual(Object.keys(factories).sort(), ["flux-fill", "nano-banana"]);
});

test("createHttpAdapterFactories: 주입된 fetch 로 nano-banana HTTP 엔드포인트 호출 (orchestrate e2e)", async () => {
  const calls: { url: string; body: unknown }[] = [];
  const imageSha = sha("nano-banana-result");
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = typeof input === "string" ? input : (input as URL).toString();
    const body = init?.body ? JSON.parse(init.body as string) : null;
    calls.push({ url, body });
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
  const factories = {
    ...createMockAdapterFactories(),
    ...createHttpAdapterFactories(catalog, {
      apiKeys: { "nano-banana": "test-nb-key" },
      fetch: fakeFetch,
    }),
  };
  const svc = createOrchestratorService({ catalog, factories });
  const outcome = await svc.orchestrate({
    schema_version: "v1",
    task_id: "t-http-1",
    slot_id: "hair_front",
    prompt: "soft pastel hair",
    negative_prompt: "",
    size: [512, 512],
    deadline_ms: 5000,
    budget_usd: 0.1,
    idempotency_key: "idem-http-1",
    capability_required: ["edit"],
  });
  assert.equal(outcome.result.vendor, "nano-banana");
  assert.equal(outcome.result.image_sha256, imageSha);
  assert.equal(calls.length, 1, "HTTP 팩토리가 실제로 주입된 fetch 를 호출");
  assert.equal(calls[0]!.url, "https://nano-banana.test/v1/generate");
  // 벤더 request body 의 `model` 은 카탈로그 config.model (gemini-2.5-flash-image) —
  // 카탈로그 version "0.1.0" 이 누출되지 않아야 함 (apiModel 분리 검증).
  assert.equal((calls[0]!.body as { model: string }).model, "gemini-2.5-flash-image");
});

test("createHttpAdapterFactories: 미등록 name 은 Mock 팩토리가 그대로 채움 (partial override)", async () => {
  const catalog = realCatalog();
  // SDXL 만 HTTP 로, 나머지는 Mock 으로 떨어짐.
  const factories = {
    ...createMockAdapterFactories(),
    ...createHttpAdapterFactories(catalog, {
      apiKeys: { sdxl: "sdxl-key" },
      fetch: async () => new Response("{}", { status: 200 }),
    }),
  };
  const svc = createOrchestratorService({ catalog, factories });
  // 레지스트리에 3개 다 등록됨 — SDXL 은 HTTP, 나머지는 Mock.
  assert.equal(svc.adapters.length, 3);
});

test("createHttpAdapterFactories: apiKey 없는 엔트리는 skip (빈 object 반환 가능)", () => {
  const factories = createHttpAdapterFactories(realCatalog(), { apiKeys: {} });
  assert.deepEqual(factories, {});
});
