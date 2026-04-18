import { strict as assert } from "node:assert";
import { test } from "node:test";
import { createHash } from "node:crypto";

import { AdapterError } from "@geny/ai-adapter-core";

import { HttpNanoBananaClient } from "../src/http-client.js";
import type { NanoBananaRequest } from "../src/client.js";

function makeRequest(overrides: Partial<NanoBananaRequest> = {}): NanoBananaRequest {
  return {
    task_id: "t-1",
    slot_id: "hair_front",
    prompt: "aria hair",
    negative_prompt: "",
    size: [1024, 1024],
    seed: 42,
    reference_image_sha256: null,
    mask_sha256: null,
    style_reference_sha256: [],
    style_profile_id: null,
    guidance_scale: null,
    strength: null,
    idempotency_key: "idem-1",
    deadline_ms: 5000,
    ...overrides,
  };
}

function validSha(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

test("HttpNanoBananaClient: 200 → 파싱된 NanoBananaResponse 반환", async () => {
  const expectedImageSha = validSha("x");
  const fakeFetch: typeof fetch = async (_url, _init) =>
    new Response(
      JSON.stringify({
        image_sha256: expectedImageSha,
        alpha_sha256: null,
        bbox: [10, 20, 900, 900],
        latency_ms: 150,
        vendor_metadata: { gem_ver: "2.5" },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "secret",
    fetch: fakeFetch,
  });
  const res = await client.invoke(makeRequest());
  assert.equal(res.image_sha256, expectedImageSha);
  assert.equal(res.alpha_sha256, null);
  assert.deepEqual(res.bbox, [10, 20, 900, 900]);
  assert.equal(res.latency_ms, 150);
  assert.deepEqual(res.vendor_metadata, { gem_ver: "2.5" });
});

test("HttpNanoBananaClient: HTTP 500 → VENDOR_ERROR_5XX (retryable)", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("server exploded", { status: 500 });
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "VENDOR_ERROR_5XX");
      assert.equal((err as AdapterError).retryable, true);
      return true;
    },
  );
});

test("HttpNanoBananaClient: HTTP 400 → VENDOR_ERROR_4XX (retryable=false)", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("bad request", { status: 400 });
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "VENDOR_ERROR_4XX");
      assert.equal((err as AdapterError).retryable, false);
      return true;
    },
  );
});

test("HttpNanoBananaClient: HTTP 429 → VENDOR_ERROR_4XX", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("rate limit", { status: 429 });
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "VENDOR_ERROR_4XX");
      return true;
    },
  );
});

test("HttpNanoBananaClient: 네트워크 throw → VENDOR_ERROR_5XX (폴백 가능)", async () => {
  const fakeFetch: typeof fetch = async () => {
    throw new Error("ENETUNREACH");
  };
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "VENDOR_ERROR_5XX");
      return true;
    },
  );
});

test("HttpNanoBananaClient: AbortError → DEADLINE_EXCEEDED", async () => {
  const fakeFetch: typeof fetch = async () => {
    const err = new Error("aborted") as Error & { name: string };
    err.name = "AbortError";
    throw err;
  };
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest({ deadline_ms: 100 })),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "DEADLINE_EXCEEDED");
      return true;
    },
  );
});

test("HttpNanoBananaClient: non-JSON body → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } });
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
      return true;
    },
  );
});

test("HttpNanoBananaClient: 잘못된 image_sha256 → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ image_sha256: "not-a-sha", bbox: [0, 0, 1, 1] }),
      { status: 200 },
    );
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
      return true;
    },
  );
});

test("HttpNanoBananaClient: 누락된 bbox → INVALID_OUTPUT", async () => {
  const fakeFetch: typeof fetch = async () =>
    new Response(
      JSON.stringify({ image_sha256: validSha("a") }),
      { status: 200 },
    );
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test",
    apiKey: "k",
    fetch: fakeFetch,
  });
  await assert.rejects(
    client.invoke(makeRequest()),
    (err: unknown) => {
      assert.ok(err instanceof AdapterError);
      assert.equal((err as AdapterError).code, "INVALID_OUTPUT");
      return true;
    },
  );
});

test("HttpNanoBananaClient: Authorization/Idempotency 헤더 + JSON 바디 전송", async () => {
  let capturedInit: RequestInit | undefined;
  let capturedUrl: string | undefined;
  const fakeFetch: typeof fetch = async (url, init) => {
    capturedUrl = String(url);
    capturedInit = init ?? {};
    return new Response(
      JSON.stringify({ image_sha256: validSha("x"), bbox: [0, 0, 1, 1] }),
      { status: 200 },
    );
  };
  const client = new HttpNanoBananaClient({
    endpoint: "https://nano-banana.test/",
    apiKey: "top-secret",
    fetch: fakeFetch,
  });
  await client.invoke(makeRequest({ idempotency_key: "idem-XX" }));
  assert.equal(capturedUrl, "https://nano-banana.test/v1/generate");
  const headers = capturedInit!.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer top-secret");
  assert.equal(headers["x-idempotency-key"], "idem-XX");
  const body = JSON.parse(String(capturedInit!.body));
  assert.equal(body.prompt, "aria hair");
  assert.equal(body.slot_id, "hair_front");
  assert.deepEqual(body.size, { width: 1024, height: 1024 });
});

test("HttpNanoBananaClient.health(): 200 → ok:true; 503 → ok:false; throw → ok:false", async () => {
  const mkClient = (fakeFetch: typeof fetch) =>
    new HttpNanoBananaClient({
      endpoint: "https://nano-banana.test",
      apiKey: "k",
      fetch: fakeFetch,
    });
  const ok = await mkClient(async () => new Response(JSON.stringify({ ok: true, latency_ms: 5 }), { status: 200 })).health();
  assert.equal(ok.ok, true);
  const bad = await mkClient(async () => new Response("nope", { status: 503 })).health();
  assert.equal(bad.ok, false);
  assert.equal(bad.detail, "HTTP 503");
  const thrown = await mkClient(async () => { throw new Error("boom"); }).health();
  assert.equal(thrown.ok, false);
  assert.equal(thrown.detail, "boom");
});

test("HttpNanoBananaClient: endpoint/apiKey 누락 시 생성자 throw", () => {
  assert.throws(
    () => new HttpNanoBananaClient({ endpoint: "", apiKey: "k" }),
    /endpoint required/,
  );
  assert.throws(
    () => new HttpNanoBananaClient({ endpoint: "https://x", apiKey: "" }),
    /apiKey required/,
  );
});
