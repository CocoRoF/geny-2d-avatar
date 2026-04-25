/**
 * OpenAI Image Generation 텍스처 어댑터.
 *
 * Models: gpt-image-1 (권장, 최신) / dall-e-3 (안정).
 * Endpoint: https://api.openai.com/v1/images/generations
 * Auth: Authorization: Bearer $OPENAI_API_KEY
 *
 * 응답 구조:
 *   { created: <ts>, data: [{ b64_json: "<base64>" }] }   # response_format=b64_json
 *   또는 { url: "<signed>" }                              # response_format=url (기본)
 *
 * 본 어댑터는 b64_json 으로 강제 요청. 받은 bytes 를 sharp 로 normalizeToPng → task 크기.
 *
 * 환경변수:
 *   OPENAI_API_KEY                         — 없으면 supports=false
 *   GENY_OPENAI_IMAGE_MODEL                — 기본 "gpt-image-1" (또는 "dall-e-3")
 *   GENY_OPENAI_IMAGE_SIZE                 — 기본 "1024x1024"
 *   GENY_OPENAI_IMAGE_TIMEOUT_MS           — 기본 60000
 *   GENY_OPENAI_IMAGE_DISABLED=true        — 강제 off
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_SIZE = "1024x1024";

export interface OpenAIImageAdapterOptions {
  readonly apiKey?: string;
  readonly model?: string;
  /** OpenAI 요청 size (e.g., "1024x1024" / "1792x1024"). 벤더 반환 후 sharp 로 재조정. */
  readonly size?: string;
  readonly timeoutMs?: number;
  readonly enabled?: boolean;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAIImageResponse {
  readonly data?: ReadonlyArray<{
    readonly b64_json?: string;
    readonly revised_prompt?: string;
    readonly url?: string;
  }>;
  readonly error?: {
    readonly message?: string;
    readonly type?: string;
    readonly code?: string | null;
  };
}

export function createOpenAIImageAdapter(
  opts: OpenAIImageAdapterOptions = {},
): TextureAdapter {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const model = opts.model ?? process.env.GENY_OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const size = opts.size ?? process.env.GENY_OPENAI_IMAGE_SIZE ?? DEFAULT_SIZE;
  const timeoutMs =
    opts.timeoutMs ??
    Number.parseInt(process.env.GENY_OPENAI_IMAGE_TIMEOUT_MS ?? "60000", 10);
  const enabled = opts.enabled ?? process.env.GENY_OPENAI_IMAGE_DISABLED !== "true";
  const f = opts.fetchImpl ?? fetch;

  return {
    name: "openai-image@" + model,
    supports(task: TextureTask): boolean {
      if (!enabled) return false;
      if (!apiKey) return false;
      if (!task.prompt || task.prompt.trim().length === 0) return false;
      return true;
    },
    async generate(task: TextureTask) {
      const useEdit = !!task.referenceImage?.png;
      // edits endpoint 는 multipart/form-data, generations 는 application/json.
      // dall-e-3 는 edit 미지원 — gpt-image-1 만 가능. 이 어댑터는 model 에 따라 분기.
      const endpoint = useEdit
        ? "https://api.openai.com/v1/images/edits"
        : "https://api.openai.com/v1/images/generations";

      let requestInit: RequestInit;
      if (useEdit) {
        const fd = new FormData();
        fd.append("model", model);
        fd.append("prompt", task.prompt);
        fd.append("n", "1");
        fd.append("size", size);
        fd.append("response_format", "b64_json");
        fd.append(
          "image",
          new Blob([new Uint8Array(task.referenceImage!.png)], {
            type: task.referenceImage!.mimeType ?? "image/png",
          }),
          "reference.png",
        );
        requestInit = {
          method: "POST",
          headers: { authorization: "Bearer " + apiKey },
          body: fd,
        };
      } else {
        requestInit = {
          method: "POST",
          headers: {
            authorization: "Bearer " + apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: task.prompt,
            n: 1,
            size,
            response_format: "b64_json",
          }),
        };
      }

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await f(endpoint, { ...requestInit, signal: controller.signal });
      } catch (err) {
        clearTimeout(t);
        const e = err as Error;
        const code =
          e.name === "AbortError" || /timeout|timed out/i.test(e.message)
            ? "TIMEOUT"
            : "NETWORK_ERROR";
        const wrapped = new Error(
          "openai-image fetch failed (" + code + "): " + e.message,
        ) as Error & { code?: string };
        wrapped.code = code;
        throw wrapped;
      }
      clearTimeout(t);

      const rawText = await res.text();
      if (!res.ok) {
        // gpt-image-1 은 org verification 필요 — 403 시 fallback 권장 (다음 어댑터).
        const code =
          res.status >= 500
            ? "VENDOR_ERROR_5XX"
            : res.status === 429
              ? "RATE_LIMITED"
              : "VENDOR_ERROR_4XX";
        const err = new Error(
          "openai-image HTTP " + res.status + ": " + rawText.slice(0, 200),
        ) as Error & { code?: string };
        err.code = code;
        throw err;
      }

      let parsed: OpenAIImageResponse;
      try {
        parsed = JSON.parse(rawText) as OpenAIImageResponse;
      } catch {
        const err = new Error(
          "openai-image JSON parse 실패: " + rawText.slice(0, 200),
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }
      if (parsed.error) {
        const err = new Error(
          "openai-image API error: " + parsed.error.message,
        ) as Error & { code?: string };
        err.code = "VENDOR_ERROR_4XX";
        throw err;
      }
      const b64 = parsed.data?.[0]?.b64_json;
      if (!b64) {
        const err = new Error(
          "openai-image 응답에 data[0].b64_json 없음. size=" + size,
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      const rawBytes = Buffer.from(b64, "base64");
      const png = await normalizeToPng(rawBytes, {
        targetWidth: task.width,
        targetHeight: task.height,
      });
      return {
        png,
        sha256: createHash("sha256").update(png).digest("hex"),
        width: task.width,
        height: task.height,
      };
    },
  };
}
