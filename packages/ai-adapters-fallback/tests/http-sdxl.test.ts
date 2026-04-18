/**
 * HttpSDXLClient 회귀 — HttpNanoBananaClient 와 대칭 규약.
 *
 *  - 200 → 파싱된 SDXLResponse
 *  - 5xx → VENDOR_ERROR_5XX (retryable)
 *  - 4xx → VENDOR_ERROR_4XX (non-retryable)
 *  - 네트워크 throw → VENDOR_ERROR_5XX
 *  - AbortError → DEADLINE_EXCEEDED
 *  - 비 JSON / 잘못된 sha / 잘못된 bbox → INVALID_OUTPUT
 *  - Authorization Bearer 주입
 *  - endpoint 말미 슬래시 제거
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { AdapterError } from "@geny/ai-adapter-core";

import { HttpSDXLClient } from "../src/http-sdxl-client.js";
import type { SDXLRequest } from "../src/sdxl-adapter.js";

function makeReq(overrides: Partial<SDXLRequest> = {}): SDXLRequest {
  return {
    task_id: "t-sdxl-1",
    slot_id: "hair_front",
    prompt: "sdxl hair",
    negative_prompt: "",
    size: [1024, 1024],
    seed: 7,
    reference_image_sha256: null,
    style_reference_sha256: [],
    guidance_scale: null,
    strength: null,
    ...overrides,
  };
}

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

test("HttpSDXLClient: 200 → 파싱된 SDXLResponse", async () => {
  const imageSha = sha("img1");
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        image_sha256: imageSha,
        bbox: [10, 20, 900, 900],
        latency_ms: 200,
        vendor_metadata: { backend: "sdxl-test" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test/",
    apiKey: "k",
    fetch: fakeFetch,
  });
  const res = await client.invoke(makeReq());
  assert.equal(res.image_sha256, imageSha);
  assert.deepEqual(res.bbox, [10, 20, 900, 900]);
  assert.equal(res.latency_ms, 200);
});

test("HttpSDXLClient: HTTP 503 → VENDOR_ERROR_5XX", async () => {
  const fakeFetch: typeof fetch = async () => new Response("down", { status: 503 });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "VENDOR_ERROR_5XX");
    assert.equal((err as AdapterError).retryable, true);
    return true;
  });
});

test("HttpSDXLClient: HTTP 400 → VENDOR_ERROR_4XX", async () => {
  const fakeFetch: typeof fetch = async () => new Response("bad", { status: 400 });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "VENDOR_ERROR_4XX");
    assert.equal((err as AdapterError).retryable, false);
    return true;
  });
});

test("HttpSDXLClient: 네트워크 throw → VENDOR_ERROR_5XX", async () => {
  const fakeFetch: typeof fetch = async () => {
    throw new Error("ECONNREFUSED");
  };
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "VENDOR_ERROR_5XX");
    return true;
  });
});

test("HttpSDXLClient: AbortError → DEADLINE_EXCEEDED", async () => {
  const fakeFetch: typeof fetch = async () => {
    const e = new Error("aborted");
    (e as Error & { name: string }).name = "AbortError";
    throw e;
  };
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
    defaultTimeoutMs: 10,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "DEADLINE_EXCEEDED");
    return true;
  });
});

test("HttpSDXLClient: 비 JSON 응답 → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("<html>not json</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
    return true;
  });
});

test("HttpSDXLClient: image_sha256 누락 → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ bbox: [0, 0, 1, 1] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
    return true;
  });
});

test("HttpSDXLClient: bbox 누락 → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ image_sha256: sha("x") }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
    return true;
  });
});

test("HttpSDXLClient: Authorization Bearer 주입", async () => {
  let captured: Record<string, string> | undefined;
  const fakeFetch: typeof fetch = async (_url, init) => {
    captured = init?.headers as Record<string, string>;
    return new Response(
      JSON.stringify({ image_sha256: sha("z"), bbox: [0, 0, 1, 1] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "s3cr3t",
    fetch: fakeFetch,
  });
  await client.invoke(makeReq());
  assert.equal(captured?.authorization, "Bearer s3cr3t");
});

test("HttpSDXLClient: endpoint 말미 / 한 번 제거", async () => {
  let capturedUrl: string | undefined;
  const fakeFetch: typeof fetch = async (url) => {
    capturedUrl = typeof url === "string" ? url : (url as URL).toString();
    return new Response(
      JSON.stringify({ image_sha256: sha("y"), bbox: [0, 0, 1, 1] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test/",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await client.invoke(makeReq());
  assert.equal(capturedUrl, "https://sdxl.test/v1/edit");
});

test("HttpSDXLClient: health 200 → ok=true", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, latency_ms: 5 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  const h = await client.health();
  assert.equal(h.ok, true);
  assert.equal(h.latencyMs, 5);
});

test("HttpSDXLClient: health 503 → ok=false + detail", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("down", { status: 503 });
  const client = new HttpSDXLClient({
    endpoint: "https://sdxl.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  const h = await client.health();
  assert.equal(h.ok, false);
  assert.match(h.detail ?? "", /HTTP 503/);
});

test("HttpSDXLClient: endpoint/apiKey 누락 → 생성자 throw", () => {
  assert.throws(
    () => new HttpSDXLClient({ endpoint: "", apiKey: "k" }),
    /endpoint required/,
  );
  assert.throws(
    () => new HttpSDXLClient({ endpoint: "https://x", apiKey: "" }),
    /apiKey required/,
  );
});
