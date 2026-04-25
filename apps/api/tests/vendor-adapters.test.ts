// P3.4b - nano-banana (Gemini) + openai-image 어댑터 회귀. fetch 주입으로 네트워크 격리.

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createNanoBananaAdapter } from "../src/lib/adapters/nano-banana-adapter.js";
import { createOpenAIImageAdapter } from "../src/lib/adapters/openai-image-adapter.js";
import { generateMockTexture } from "../src/lib/mock-generator.js";
import type { TextureTask } from "../src/lib/texture-adapter.js";

function task(over?: Partial<TextureTask>): TextureTask {
  return {
    preset: { id: "tpl.base.v1.halfbody", version: "1.3.0" },
    prompt: "blue hair anime girl",
    seed: 42,
    width: 256,
    height: 256,
    ...over,
  };
}

// 유효한 PNG (mock 사용) 을 base64 로 인코딩해 벤더 응답 시뮬.
const VALID_PNG = generateMockTexture({ prompt: "bg", seed: 0, width: 512, height: 512 });
const VALID_PNG_B64 = VALID_PNG.toString("base64");

function mockFetch(fn: (url: string, init?: RequestInit) => Promise<Response>): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const u = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return fn(u, init);
  }) as unknown as typeof fetch;
}

// ================= nano-banana =================

test("nano-banana.supports: key 없으면 false", () => {
  const a = createNanoBananaAdapter({ apiKey: "" });
  assert.equal(a.supports(task()), false);
});

test("nano-banana.supports: enabled=false 면 false", () => {
  const a = createNanoBananaAdapter({ apiKey: "k", enabled: false });
  assert.equal(a.supports(task()), false);
});

test("nano-banana.supports: key 있고 prompt 있으면 true", () => {
  const a = createNanoBananaAdapter({ apiKey: "k" });
  assert.equal(a.supports(task()), true);
});

test("nano-banana.supports: 빈 prompt 는 false", () => {
  const a = createNanoBananaAdapter({ apiKey: "k" });
  assert.equal(a.supports(task({ prompt: "" })), false);
  assert.equal(a.supports(task({ prompt: "   " })), false);
});

test("nano-banana.name 에 model 포함", () => {
  const a = createNanoBananaAdapter({ apiKey: "k", model: "gemini-2.5-flash-image" });
  assert.equal(a.name, "nano-banana@gemini-2.5-flash-image");
});

test("nano-banana.generate: 성공 경로 - inlineData b64 → PNG normalize", async () => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  let capturedHeaders: Record<string, string> = {};
  const a = createNanoBananaAdapter({
    apiKey: "test-key",
    fetchImpl: mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: VALID_PNG_B64 } }],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }),
  });
  const res = await a.generate(task({ width: 128, height: 128 }));
  assert.match(res.sha256, /^[a-f0-9]{64}$/);
  assert.equal(res.width, 128);
  assert.equal(res.height, 128);
  // URL 에 generativelanguage.googleapis.com 포함
  assert.match(capturedUrl, /generativelanguage\.googleapis\.com/);
  // x-goog-api-key 헤더
  assert.equal((capturedHeaders as Record<string, string>)["x-goog-api-key"], "test-key");
  // body 에 text prompt 포함
  const b = capturedBody as { contents: Array<{ parts: Array<{ text: string }> }> };
  assert.match(b.contents[0]!.parts[0]!.text, /blue hair/);
});

test("nano-banana.generate: 500 → VENDOR_ERROR_5XX", async () => {
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async () => new Response("server down", { status: 500 })),
  });
  try {
    await a.generate(task());
    assert.fail("should throw");
  } catch (err) {
    assert.equal((err as { code?: string }).code, "VENDOR_ERROR_5XX");
  }
});

test("nano-banana.generate: 429 → RATE_LIMITED", async () => {
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async () => new Response("quota", { status: 429 })),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "RATE_LIMITED");
  }
});

test("nano-banana.generate: candidates 없음 → INVALID_OUTPUT", async () => {
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(JSON.stringify({ candidates: [] }), { status: 200 }),
    ),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "INVALID_OUTPUT");
  }
});

test("nano-banana.generate: error 필드 있는 응답 → VENDOR_ERROR_4XX", async () => {
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 400, message: "Invalid API key", status: "INVALID_ARGUMENT" },
          }),
          { status: 200 },
        ),
    ),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "VENDOR_ERROR_4XX");
  }
});

// ================= openai-image =================

test("openai-image.supports: key 없으면 false", () => {
  const a = createOpenAIImageAdapter({ apiKey: "" });
  assert.equal(a.supports(task()), false);
});

test("openai-image.supports: disabled → false", () => {
  const a = createOpenAIImageAdapter({ apiKey: "k", enabled: false });
  assert.equal(a.supports(task()), false);
});

test("openai-image.supports: key + prompt → true", () => {
  const a = createOpenAIImageAdapter({ apiKey: "k" });
  assert.equal(a.supports(task()), true);
});

test("openai-image.name 에 model 포함", () => {
  const a1 = createOpenAIImageAdapter({ apiKey: "k", model: "gpt-image-1" });
  assert.equal(a1.name, "openai-image@gpt-image-1");
  const a2 = createOpenAIImageAdapter({ apiKey: "k", model: "dall-e-3" });
  assert.equal(a2.name, "openai-image@dall-e-3");
});

test("openai-image.generate: 성공 경로 - b64_json → PNG normalize", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  let capturedBody: unknown = null;
  const a = createOpenAIImageAdapter({
    apiKey: "sk-test",
    fetchImpl: mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          data: [{ b64_json: VALID_PNG_B64 }],
        }),
        { status: 200 },
      );
    }),
  });
  const res = await a.generate(task({ width: 64, height: 64 }));
  assert.match(res.sha256, /^[a-f0-9]{64}$/);
  assert.equal(res.width, 64);
  assert.equal(res.height, 64);
  assert.match(capturedUrl, /api\.openai\.com\/v1\/images\/generations/);
  assert.equal(
    (capturedHeaders as Record<string, string>)["authorization"],
    "Bearer sk-test",
  );
  const b = capturedBody as { prompt: string; model: string; n: number; response_format: string };
  assert.match(b.prompt, /blue hair/);
  assert.equal(b.n, 1);
  assert.equal(b.response_format, "b64_json");
});

test("openai-image.generate: 403 org unverified → VENDOR_ERROR_4XX", async () => {
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response("Organization must be verified to use gpt-image-1", {
          status: 403,
        }),
    ),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "VENDOR_ERROR_4XX");
  }
});

test("openai-image.generate: 500 → VENDOR_ERROR_5XX", async () => {
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async () => new Response("down", { status: 500 })),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "VENDOR_ERROR_5XX");
  }
});

test("openai-image.generate: b64_json 없음 → INVALID_OUTPUT", async () => {
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(JSON.stringify({ data: [{ url: "https://..." }] }), { status: 200 }),
    ),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "INVALID_OUTPUT");
  }
});

test("openai-image.generate: error 필드 → VENDOR_ERROR_4XX", async () => {
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(
          JSON.stringify({ error: { message: "bad prompt", type: "invalid_request" } }),
          { status: 200 },
        ),
    ),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "VENDOR_ERROR_4XX");
  }
});

test("nano-banana.generate: referenceImage → image-to-image (inlineData + 변형 prompt)", async () => {
  let capturedBody: { contents: Array<{ parts: Array<Record<string, unknown>> }> } | null = null;
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: VALID_PNG_B64 } }] } }],
        }),
        { status: 200 },
      );
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  const parts = capturedBody!.contents[0]!.parts;
  assert.equal(parts.length, 2, "inlineData + text 두 part");
  assert.ok(
    (parts[0] as { inlineData?: { data?: string } }).inlineData?.data,
    "첫 part 가 inlineData (reference)",
  );
  assert.match(
    (parts[1] as { text?: string }).text ?? "",
    /TEXTURE ATLAS/,
    "image-to-image 변형 prompt",
  );
});

test("nano-banana.generate: referenceImage 없으면 text-only (단일 part)", async () => {
  let capturedBody: { contents: Array<{ parts: Array<Record<string, unknown>> }> } | null = null;
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: VALID_PNG_B64 } }] } }],
        }),
        { status: 200 },
      );
    }),
  });
  await a.generate(task());
  assert.equal(capturedBody!.contents[0]!.parts.length, 1);
});

test("openai-image.generate: referenceImage → /v1/images/edits multipart", async () => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  let capturedHeaders: Record<string, string> = {};
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = init?.body;
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_B64 }] }), { status: 200 });
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  assert.match(capturedUrl, /\/v1\/images\/edits$/, "edits 엔드포인트");
  assert.equal(
    (capturedHeaders as Record<string, string>)["content-type"],
    undefined,
    "multipart 에서는 content-type 자동 (boundary 포함)",
  );
  assert.ok(capturedBody instanceof FormData, "body 가 FormData");
});

test("openai-image.generate: referenceImage 없으면 /v1/images/generations JSON", async () => {
  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_B64 }] }), { status: 200 });
    }),
  });
  await a.generate(task());
  assert.match(capturedUrl, /\/v1\/images\/generations$/);
  assert.equal((capturedHeaders as Record<string, string>)["content-type"], "application/json");
});

test("nano-banana.generate: referenceImage + portrait 비율 응답 → ATLAS_RATIO_MISMATCH", async () => {
  // 6942×17730 같은 portrait 비율을 시뮬레이션하기 위해 256×768 PNG 응답 (1:3 비율).
  const portraitPng = await sharp({
    create: { width: 256, height: 768, channels: 4, background: { r: 100, g: 150, b: 200, alpha: 1 } },
  }).png().toBuffer();
  const portraitB64 = portraitPng.toString("base64");
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: portraitB64 } }] } }],
          }),
          { status: 200 },
        ),
    ),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  try {
    // task target=256x256 (1:1) — 응답 1:3 은 30% 이상 차이 → reject 예상.
    await a.generate(task({ width: 256, height: 256, referenceImage: { png: refPng } }));
    assert.fail("should throw ATLAS_RATIO_MISMATCH");
  } catch (err) {
    assert.equal((err as { code?: string }).code, "ATLAS_RATIO_MISMATCH");
  }
});

test("openai-image.generate: timeout → TIMEOUT", async () => {
  const abortErr = new Error("aborted");
  abortErr.name = "AbortError";
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async () => {
      throw abortErr;
    }),
  });
  try {
    await a.generate(task());
    assert.fail();
  } catch (err) {
    assert.equal((err as { code?: string }).code, "TIMEOUT");
  }
});
