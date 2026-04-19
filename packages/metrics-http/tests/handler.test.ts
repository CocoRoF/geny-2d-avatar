import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer, request as httpRequest, type Server } from "node:http";
import { AddressInfo } from "node:net";
import {
  InMemoryMetricsRegistry,
  createRegistryMetricsHook,
} from "@geny/ai-adapter-core";

import {
  PROMETHEUS_CONTENT_TYPE,
  createMetricsRequestHandler,
  createMetricsServer,
} from "../src/index.js";

interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
}

function fetchLocal(
  port: number,
  path: string,
  method: "GET" | "HEAD" | "POST" = "GET",
): Promise<FetchResult> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: "127.0.0.1", port, path, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () => {
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (typeof v === "string") headers[k] = v;
          else if (Array.isArray(v)) headers[k] = v.join(",");
        }
        resolve({
          status: res.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function withServer<T>(
  server: Server,
  fn: (port: number) => Promise<T>,
): Promise<T> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as AddressInfo;
  try {
    return await fn(addr.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test("createMetricsRequestHandler: GET /metrics → 200 + prometheus content-type + body", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  hook.onCall({
    vendor: "nano_banana",
    model: "v1",
    stage: "ideation",
    status: "success",
    durationSeconds: 1.2,
    costUsd: 0.002,
  });
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], PROMETHEUS_CONTENT_TYPE);
    assert.equal(r.headers["cache-control"], "no-store");
    assert.ok(r.body.includes("# HELP geny_ai_call_total"));
    assert.ok(r.body.includes("# TYPE geny_ai_call_total counter"));
    assert.ok(r.body.includes('geny_ai_call_total{model="v1",stage="ideation",status="success",vendor="nano_banana"} 1'));
    assert.ok(r.body.includes("geny_ai_call_duration_seconds_bucket"));
    assert.ok(r.body.endsWith("\n"));
  });
});

test("createMetricsRequestHandler: body 는 registry.renderPrometheusText() 와 byte 동일", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  hook.onCall({ vendor: "gemini", model: "2.5", stage: "ink", status: "5xx", durationSeconds: 0.3 });
  hook.onFallback({ fromVendor: "gemini", toVendor: "sora", reason: "5xx" });
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics");
    assert.equal(r.body, reg.renderPrometheusText());
    const bytes = Buffer.byteLength(r.body, "utf8");
    assert.equal(r.headers["content-length"], String(bytes));
  });
});

test("createMetricsRequestHandler: HEAD /metrics → 200 + 빈 body + 정확한 content-length", async () => {
  const reg = new InMemoryMetricsRegistry();
  createRegistryMetricsHook(reg); // 메트릭 등록만
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics", "HEAD");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], PROMETHEUS_CONTENT_TYPE);
    assert.equal(r.body, "");
    const expectedBytes = Buffer.byteLength(reg.renderPrometheusText(), "utf8");
    assert.equal(r.headers["content-length"], String(expectedBytes));
  });
});

test("createMetricsRequestHandler: POST /metrics → 405 + Allow 헤더", async () => {
  const reg = new InMemoryMetricsRegistry();
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics", "POST");
    assert.equal(r.status, 405);
    assert.equal(r.headers["allow"], "GET, HEAD");
  });
});

test("createMetricsRequestHandler: GET /healthz → 200 + 'ok\\n'", async () => {
  const reg = new InMemoryMetricsRegistry();
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/healthz");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], "text/plain; charset=utf-8");
    assert.equal(r.body, "ok\n");
  });
});

test("createMetricsRequestHandler: GET /unknown → 404", async () => {
  const reg = new InMemoryMetricsRegistry();
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/nope");
    assert.equal(r.status, 404);
    assert.equal(r.body, "not found\n");
  });
});

test("createMetricsRequestHandler: /metrics?foo=bar → query string 무시", async () => {
  const reg = new InMemoryMetricsRegistry();
  createRegistryMetricsHook(reg);
  const handler = createMetricsRequestHandler(reg);
  const server = createServer(handler);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics?format=prom");
    assert.equal(r.status, 200);
    assert.equal(r.headers["content-type"], PROMETHEUS_CONTENT_TYPE);
  });
});

test("createMetricsServer: /metrics + /healthz 동작, 그 외 기본 404", async () => {
  const reg = new InMemoryMetricsRegistry();
  const server = createMetricsServer(reg);
  await withServer(server, async (port) => {
    const m = await fetchLocal(port, "/metrics");
    assert.equal(m.status, 200);
    const h = await fetchLocal(port, "/healthz");
    assert.equal(h.body, "ok\n");
    const other = await fetchLocal(port, "/other");
    assert.equal(other.status, 404);
  });
});

test("createMetricsServer: fallback 옵션 — /metrics·/healthz 외 경로 위임", async () => {
  const reg = new InMemoryMetricsRegistry();
  const server = createMetricsServer(reg, {
    fallback(req, res) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(`domain:${req.url}`);
    },
  });
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/api/status");
    assert.equal(r.status, 200);
    assert.equal(r.body, "domain:/api/status");
    const m = await fetchLocal(port, "/metrics");
    assert.equal(m.status, 200);
    assert.equal(m.headers["content-type"], PROMETHEUS_CONTENT_TYPE);
  });
});

test("e2e: orchestrator hook → scrape — onCall/onFallback 이 /metrics 에 반영", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  hook.onCall({ vendor: "nano_banana", model: "v1", stage: "ideation", status: "success", durationSeconds: 0.8, costUsd: 0.001 });
  hook.onCall({ vendor: "nano_banana", model: "v1", stage: "ideation", status: "5xx", durationSeconds: 0.2 });
  hook.onFallback({ fromVendor: "nano_banana", toVendor: "sdxl", reason: "5xx" });
  hook.onCall({ vendor: "sdxl", model: "1.0", stage: "ideation", status: "success", durationSeconds: 1.5, costUsd: 0.003 });

  const server = createMetricsServer(reg);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics");
    assert.equal(r.status, 200);
    const body = r.body;
    assert.ok(body.includes('geny_ai_call_total{model="v1",stage="ideation",status="success",vendor="nano_banana"} 1'));
    assert.ok(body.includes('geny_ai_call_total{model="v1",stage="ideation",status="5xx",vendor="nano_banana"} 1'));
    assert.ok(body.includes('geny_ai_call_total{model="1.0",stage="ideation",status="success",vendor="sdxl"} 1'));
    assert.ok(body.includes('geny_ai_fallback_total{from_vendor="nano_banana",reason="5xx",to_vendor="sdxl"} 1'));
    assert.ok(body.includes("geny_ai_call_cost_usd"));
  });
});

test("e2e: 빈 registry 도 /metrics 는 200 + 빈 exposition (개행 하나)", async () => {
  const reg = new InMemoryMetricsRegistry();
  const server = createMetricsServer(reg);
  await withServer(server, async (port) => {
    const r = await fetchLocal(port, "/metrics");
    assert.equal(r.status, 200);
    assert.equal(r.body, "\n");
  });
});

test("handler 는 멱등 — 동일 registry 에 대해 연속 2번 scrape 결과 동일", async () => {
  const reg = new InMemoryMetricsRegistry();
  const hook = createRegistryMetricsHook(reg);
  hook.onCall({ vendor: "a", model: "b", stage: "c", status: "success", durationSeconds: 0.1, costUsd: 0.01 });
  const server = createMetricsServer(reg);
  await withServer(server, async (port) => {
    const r1 = await fetchLocal(port, "/metrics");
    const r2 = await fetchLocal(port, "/metrics");
    assert.equal(r1.body, r2.body);
  });
});
