/**
 * HttpFluxFillClient 회귀 — HttpSDXLClient/HttpNanoBananaClient 와 대칭.
 *
 * mask 전용 파라미터 매핑(reference_image/mask sha256 → vendor body) 검증 포함.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { AdapterError } from "@geny/ai-adapter-core";

import { HttpFluxFillClient } from "../src/http-flux-fill-client.js";
import type { FluxFillRequest } from "../src/flux-fill-adapter.js";

function makeReq(overrides: Partial<FluxFillRequest> = {}): FluxFillRequest {
  return {
    task_id: "t-ff-1",
    slot_id: "face_base",
    prompt: "fill in mask",
    negative_prompt: "",
    size: [512, 512],
    seed: 11,
    reference_image_sha256: "a".repeat(64),
    mask_sha256: "b".repeat(64),
    guidance_scale: null,
    strength: null,
    ...overrides,
  };
}

function sha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

test("HttpFluxFillClient: 200 → 파싱된 FluxFillResponse", async () => {
  const imageSha = sha("ff1");
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({
        image_sha256: imageSha,
        bbox: [0, 0, 512, 512],
        latency_ms: 300,
        vendor_metadata: { backend: "ff-test" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  const res = await client.invoke(makeReq());
  assert.equal(res.image_sha256, imageSha);
  assert.deepEqual(res.bbox, [0, 0, 512, 512]);
  assert.equal(res.latency_ms, 300);
});

test("HttpFluxFillClient: mask_sha256 + reference_image_sha256 요청 바디에 실림", async () => {
  let capturedBody: unknown;
  const fakeFetch: typeof fetch = async (_url, init) => {
    capturedBody = JSON.parse(init?.body as string);
    return new Response(
      JSON.stringify({ image_sha256: sha("x"), bbox: [0, 0, 1, 1] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await client.invoke(makeReq());
  const body = capturedBody as Record<string, unknown>;
  assert.equal(body.mask_sha256, "b".repeat(64));
  assert.equal(body.reference_image_sha256, "a".repeat(64));
  assert.equal(body.model, "flux-fill-1.0");
});

test("HttpFluxFillClient: HTTP 500 → VENDOR_ERROR_5XX", async () => {
  const fakeFetch: typeof fetch = async () => new Response("boom", { status: 500 });
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "VENDOR_ERROR_5XX");
    return true;
  });
});

test("HttpFluxFillClient: HTTP 422 → VENDOR_ERROR_4XX", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("validation", { status: 422 });
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "VENDOR_ERROR_4XX");
    return true;
  });
});

test("HttpFluxFillClient: AbortError → DEADLINE_EXCEEDED", async () => {
  const fakeFetch: typeof fetch = async () => {
    const e = new Error("aborted");
    (e as Error & { name: string }).name = "AbortError";
    throw e;
  };
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
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

test("HttpFluxFillClient: 비 JSON 응답 → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("<html/>", { status: 200, headers: { "content-type": "text/html" } });
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
    return true;
  });
});

test("HttpFluxFillClient: 잘못된 sha → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ image_sha256: "NOT-HEX", bbox: [0, 0, 1, 1] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(client.invoke(makeReq()), (err: unknown) => {
    assert.ok(err instanceof AdapterError);
    assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
    return true;
  });
});

test("HttpFluxFillClient: endpoint/apiKey 누락 → 생성자 throw", () => {
  assert.throws(
    () => new HttpFluxFillClient({ endpoint: "", apiKey: "k" }),
    /endpoint required/,
  );
  assert.throws(
    () => new HttpFluxFillClient({ endpoint: "https://x", apiKey: "" }),
    /apiKey required/,
  );
});

test("HttpFluxFillClient: health 200 → ok=true", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(JSON.stringify({ ok: true, latency_ms: 3 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  const client = new HttpFluxFillClient({
    endpoint: "https://flux-fill.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  const h = await client.health();
  assert.equal(h.ok, true);
  assert.equal(h.latencyMs, 3);
});
