/**
 * OpenAI Image (gpt-image-1) 텍스처 어댑터.
 *
 * 모델: gpt-image-1 (organization verification 필요).
 * 두 endpoint:
 *   POST /v1/images/generations  — text-to-image (referenceImage 없을 때)
 *   POST /v1/images/edits        — image-to-image (referenceImage 있을 때)
 *
 * 핵심 사양 (2025-2026 검증):
 *   - response_format 은 gpt-image-1 에서 **deprecated** — 보내면 일부 케이스 400.
 *     gpt-image-1 은 항상 b64_json 으로 응답. output_format (png/jpeg/webp) 으로 형식 제어.
 *   - **input_fidelity: "high"** — image edits 의 핵심. 빠뜨리면 layout 무시하고 regenerate.
 *     사용자가 본 "atlas 보존 안 됨" 의 직접 원인.
 *   - size: "1024x1024" / "1536x1024" / "1024x1536" / "auto" 만 유효.
 *     "2048x2048" 같은 값은 거부됨 (256x256 / 512x512 도 dall-e-2 전용).
 *   - quality: "low" / "medium" / "high" / "auto"
 *   - output_format: "png" / "jpeg" / "webp" (default png)
 *   - background: "transparent" / "opaque" / "auto" (transparent 는 png/webp 만)
 *   - image 필드: Blob/File 로 보내야 함. 파일명 + MIME type 필수.
 *   - Content-Type 헤더 직접 지정 금지 (FormData 가 boundary 자동 설정).
 *
 * 환경변수:
 *   OPENAI_API_KEY                         — 없으면 supports=false
 *   GENY_OPENAI_IMAGE_MODEL                — 기본 "gpt-image-1"
 *   GENY_OPENAI_IMAGE_SIZE                 — 기본 "1024x1024" (gpt-image-1 호환 값만)
 *   GENY_OPENAI_IMAGE_QUALITY              — 기본 "high"
 *   GENY_OPENAI_IMAGE_TIMEOUT_MS           — 기본 120000 (edit 은 30~90s 소요)
 *   GENY_OPENAI_IMAGE_DISABLED=true        — 강제 off
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";

const DEFAULT_MODEL = "gpt-image-1";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_QUALITY = "high";
const VALID_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);

export interface OpenAIImageAdapterOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly size?: string;
  readonly quality?: string;
  readonly timeoutMs?: number;
  readonly enabled?: boolean;
  readonly fetchImpl?: typeof fetch;
}

interface OpenAIImageResponse {
  readonly data?: ReadonlyArray<{ readonly b64_json?: string; readonly url?: string }>;
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
  const rawSize = opts.size ?? process.env.GENY_OPENAI_IMAGE_SIZE ?? DEFAULT_SIZE;
  // gpt-image-1 호환 size 만 허용. 잘못된 값이면 default 로 폴백.
  const size = VALID_SIZES.has(rawSize) ? rawSize : DEFAULT_SIZE;
  const quality = opts.quality ?? process.env.GENY_OPENAI_IMAGE_QUALITY ?? DEFAULT_QUALITY;
  const timeoutMs =
    opts.timeoutMs ??
    Number.parseInt(process.env.GENY_OPENAI_IMAGE_TIMEOUT_MS ?? "120000", 10);
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
      const endpoint = useEdit
        ? "https://api.openai.com/v1/images/edits"
        : "https://api.openai.com/v1/images/generations";

      let requestInit: RequestInit;
      if (useEdit) {
        // multipart/form-data. image 는 Blob (Buffer 직접 X). Content-Type 자동.
        const fd = new FormData();
        fd.append("model", model);
        fd.append("prompt", task.prompt);
        fd.append("n", "1");
        fd.append("size", size);
        fd.append("quality", quality);
        // 핵심: image 의 layout/composition 보존을 위한 high fidelity. 빠뜨리면 regenerate.
        fd.append("input_fidelity", "high");
        fd.append("output_format", "png");
        fd.append("background", "transparent");
        fd.append(
          "image",
          new Blob([new Uint8Array(task.referenceImage!.png)], {
            type: task.referenceImage!.mimeType ?? "image/png",
          }),
          "reference.png",
        );
        // response_format 은 gpt-image-1 deprecated — 보내지 않음.
        requestInit = {
          method: "POST",
          headers: { authorization: "Bearer " + apiKey },
          body: fd,
        };
      } else {
        // text-to-image generations. JSON body. response_format 도 deprecated.
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
            quality,
            output_format: "png",
            background: "transparent",
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
        const code =
          res.status >= 500
            ? "VENDOR_ERROR_5XX"
            : res.status === 429
              ? "RATE_LIMITED"
              : "VENDOR_ERROR_4XX";
        const err = new Error(
          "openai-image HTTP " + res.status + ": " + rawText.slice(0, 300),
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
          "openai-image 응답에 data[0].b64_json 없음. size=" + size +
            " quality=" + quality + " endpoint=" + (useEdit ? "edits" : "generations"),
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      const rawBytes = Buffer.from(b64, "base64");
      const png = await normalizeToPng(rawBytes, {
        targetWidth: task.width,
        targetHeight: task.height,
        ...(task.referenceImage ? { maxAspectRatioDelta: 0.3 } : {}),
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
