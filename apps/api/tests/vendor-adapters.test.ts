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
  const b = capturedBody as { prompt: string; model: string; n: number; size: string; quality: string; output_format: string };
  assert.match(b.prompt, /blue hair/);
  assert.equal(b.n, 1);
  assert.equal(b.size, "1024x1024");
  assert.equal(b.quality, "high");
  assert.equal(b.output_format, "png");
  // response_format 은 gpt-image-1 deprecated — 보내지 않음.
  assert.equal((b as Record<string, unknown>).response_format, undefined);
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

test("nano-banana.generate: referenceImage → image-to-image (text 먼저 + inline_data + responseModalities)", async () => {
  let capturedBody:
    | {
        contents: Array<{ parts: Array<Record<string, unknown>> }>;
        generationConfig?: { responseModalities?: string[] };
      }
    | null = null;
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ inlineData: { mimeType: "image/png", data: VALID_PNG_B64 } }],
              },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 },
      );
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  const parts = capturedBody!.contents[0]!.parts;
  assert.equal(parts.length, 2, "text + inline_data 두 part");
  // 공식 패턴: text 먼저, image 나중.
  assert.match(
    (parts[0] as { text?: string }).text ?? "",
    /Using the provided image/,
    "첫 part 가 'Using the provided image' 로 시작하는 edit prompt",
  );
  assert.ok(
    (parts[1] as { inline_data?: { data?: string } }).inline_data?.data,
    "두 번째 part 가 inline_data (snake_case)",
  );
  // generationConfig.responseModalities=["IMAGE"] 필수.
  assert.deepEqual(
    capturedBody!.generationConfig?.responseModalities,
    ["IMAGE"],
    "generationConfig.responseModalities=['IMAGE'] 필수",
  );
});

test("nano-banana.generate: finishReason !== STOP → INVALID_OUTPUT", async () => {
  const a = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [{ finishReason: "IMAGE_SAFETY" }],
          }),
          { status: 200 },
        ),
    ),
  });
  try {
    await a.generate(task());
    assert.fail("should throw");
  } catch (err) {
    assert.equal((err as { code?: string }).code, "INVALID_OUTPUT");
  }
});

test("nano-banana.generate: gemini-3.1-flash-image-preview → imageConfig + thinkingConfig 포함", async () => {
  let capturedBody:
    | { generationConfig?: { imageConfig?: { aspectRatio?: string; imageSize?: string }; thinkingConfig?: { thinkingLevel?: string } } }
    | null = null;
  const a = createNanoBananaAdapter({
    apiKey: "k",
    model: "gemini-3.1-flash-image-preview",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ inline_data: { mime_type: "image/png", data: VALID_PNG_B64 } }] },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 },
      );
    }),
  });
  await a.generate(task());
  assert.equal(capturedBody!.generationConfig?.imageConfig?.aspectRatio, "1:1");
  assert.equal(capturedBody!.generationConfig?.imageConfig?.imageSize, "2K");
  assert.equal(capturedBody!.generationConfig?.thinkingConfig?.thinkingLevel, "high");
});

test("nano-banana.generate: gemini-2.5-flash-image (legacy) → imageConfig 미전송 (aspect bug 회피)", async () => {
  let capturedBody:
    | { generationConfig?: { imageConfig?: unknown; thinkingConfig?: unknown } }
    | null = null;
  const a = createNanoBananaAdapter({
    apiKey: "k",
    model: "gemini-2.5-flash-image",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = JSON.parse((init?.body as string) ?? "{}");
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: { parts: [{ inline_data: { mime_type: "image/png", data: VALID_PNG_B64 } }] },
              finishReason: "STOP",
            },
          ],
        }),
        { status: 200 },
      );
    }),
  });
  await a.generate(task());
  assert.equal(
    capturedBody!.generationConfig?.imageConfig,
    undefined,
    "2.5 는 imageConfig 안 보냄 (aspect-ratio bug)",
  );
  assert.equal(capturedBody!.generationConfig?.thinkingConfig, undefined);
});

test("nano-banana.generate: 응답 inline_data (snake_case) 와 inlineData (camelCase) 모두 처리", async () => {
  // snake_case 응답.
  const a1 = createNanoBananaAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(
      async () =>
        new Response(
          JSON.stringify({
            candidates: [
              {
                content: { parts: [{ inline_data: { mime_type: "image/png", data: VALID_PNG_B64 } }] },
                finishReason: "STOP",
              },
            ],
          }),
          { status: 200 },
        ),
    ),
  });
  const r1 = await a1.generate(task());
  assert.match(r1.sha256, /^[a-f0-9]{64}$/);
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

test("openai-image.generate: referenceImage → /v1/images/edits multipart + input_fidelity=high", async () => {
  let capturedUrl = "";
  let capturedBody: unknown = null;
  let capturedHeaders: Record<string, string> = {};
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    fetchImpl: mockFetch(async (url, init) => {
      capturedUrl = url;
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      capturedBody = init?.body as FormData;
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_B64 }] }), { status: 200 });
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  assert.match(capturedUrl, /\/v1\/images\/edits$/, "edits 엔드포인트");
  assert.equal(
    capturedHeaders["content-type"],
    undefined,
    "multipart 에서는 content-type 자동 (boundary 포함)",
  );
  assert.ok(capturedBody instanceof FormData, "body 가 FormData");
  const fd = capturedBody as FormData;
  // 핵심: input_fidelity=high 가 layout 보존 보장.
  assert.equal(fd.get("input_fidelity"), "high", "input_fidelity=high (layout 보존)");
  // default model 은 atlas-friendly 한 gpt-image-1.5 (transparent + input_fidelity high 둘 다 지원).
  assert.equal(fd.get("model"), "gpt-image-1.5");
  assert.equal(fd.get("size"), "1024x1024");
  assert.equal(fd.get("quality"), "high");
  assert.equal(fd.get("output_format"), "png");
  // background 는 보내지 않음 — OpenAI 가 임의로 캐릭터 외곽을 지우는 걸 방지 (사용자 보고).
  assert.equal(fd.get("background"), null, "background 는 보내지 않음");
  // response_format 은 deprecated → 보내지 않음.
  assert.equal(fd.get("response_format"), null);
  // image 필드는 Blob (Buffer 아님).
  const img = fd.get("image");
  assert.ok(img instanceof Blob, "image 가 Blob");
});

test("openai-image.generate: gpt-image-2 → input_fidelity / background 미전송 (모델별 분기)", async () => {
  let capturedBody: unknown = null;
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    model: "gpt-image-2",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = init?.body;
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_B64 }] }), { status: 200 });
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  assert.ok(capturedBody instanceof FormData);
  const fd = capturedBody as FormData;
  assert.equal(fd.get("model"), "gpt-image-2");
  // gpt-image-2 는 input_fidelity 미지원 (항상 high 동작) — 보내지 않아야 함.
  assert.equal(fd.get("input_fidelity"), null, "gpt-image-2 는 input_fidelity 미전송");
  // background 는 모든 모델에서 보내지 않음 (OpenAI 가 임의로 캐릭터 외곽 지우는 문제 회피).
  assert.equal(fd.get("background"), null);
});

test("openai-image.generate: gpt-image-1.5 → input_fidelity=high (background 은 미전송)", async () => {
  let capturedBody: unknown = null;
  const a = createOpenAIImageAdapter({
    apiKey: "k",
    model: "gpt-image-1.5",
    fetchImpl: mockFetch(async (_url, init) => {
      capturedBody = init?.body;
      return new Response(JSON.stringify({ data: [{ b64_json: VALID_PNG_B64 }] }), { status: 200 });
    }),
  });
  const refPng = Buffer.from(VALID_PNG_B64, "base64");
  await a.generate(task({ referenceImage: { png: refPng } }));
  const fd = capturedBody as FormData;
  assert.equal(fd.get("input_fidelity"), "high");
  // background 는 의도적으로 미전송 (OpenAI 가 임의로 영역을 지우는 문제 회피).
  assert.equal(fd.get("background"), null);
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
