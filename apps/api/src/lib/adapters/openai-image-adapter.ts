/**
 * OpenAI Image 텍스처 어댑터 — 2026 최신 모델 라인업 지원.
 *
 * 모델 (release order):
 *   gpt-image-1            — 2025-03 (Deprecated label)
 *   gpt-image-1-mini       — 2025-10 (저렴/빠름)
 *   gpt-image-1.5          — 2025-12 (transparent 지원, input_fidelity high 토글)
 *   gpt-image-2            — 2026-04 (SOTA, 항상 high fidelity, transparent 미지원)
 *
 * 두 endpoint:
 *   POST /v1/images/generations  — text-to-image
 *   POST /v1/images/edits        — image-to-image (referenceImage 있을 때)
 *
 * 모델별 옵션 호환:
 *   - input_fidelity:  gpt-image-1/-mini/-1.5 만 (gpt-image-2 무시/거부 — 보내지 않음)
 *   - background:transparent: gpt-image-1/-mini/-1.5 만 (gpt-image-2 미지원 — opaque 고정)
 *   - size:            gpt-image-1/-mini/-1.5 = {1024x1024, 1536x1024, 1024x1536, auto}
 *                      gpt-image-2 = 더 넓은 범위 (max edge 3840, 16의 배수, 0.65~8.3M px)
 *   - response_format: deprecated 모든 GPT-Image 모델. 항상 b64_json.
 *
 * default model = "gpt-image-1.5":
 *   atlas texture 는 transparent background 필요 (mao_pro 등). gpt-image-2 가 SOTA 지만 transparent
 *   미지원이라 atlas-friendly 한 1.5 를 default. 사용자가 .env 로 gpt-image-2 override 가능.
 *
 * 환경변수:
 *   OPENAI_API_KEY                         — 없으면 supports=false
 *   GENY_OPENAI_IMAGE_MODEL                — 기본 "gpt-image-1.5"
 *   GENY_OPENAI_IMAGE_SIZE                 — 기본 "1024x1024"
 *   GENY_OPENAI_IMAGE_QUALITY              — 기본 "high"
 *   GENY_OPENAI_IMAGE_TIMEOUT_MS           — 기본 120000 (edit 30~90s 소요)
 *   GENY_OPENAI_IMAGE_DISABLED=true        — 강제 off
 *
 * 주의: 모든 GPT-Image 모델은 organization verification 필요 (403 OOO_must_be_verified 에러).
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";
import { buildEditPrompt, buildGenerateAtlasPrompt } from "../edit-prompt.js";

const DEFAULT_MODEL = "gpt-image-1.5";
const DEFAULT_SIZE = "1024x1024";
const DEFAULT_QUALITY = "high";

// gpt-image-1/-mini/-1.5 의 size 화이트리스트.
const LEGACY_SIZES = new Set(["1024x1024", "1536x1024", "1024x1536", "auto"]);

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

interface ModelCapabilities {
  /** input_fidelity 파라미터 보낼지 (gpt-image-2 는 무시/거부). */
  readonly supportsInputFidelity: boolean;
  /** size 검증 함수. */
  readonly validateSize: (size: string) => string;
}

function detectCapabilities(model: string): ModelCapabilities {
  // gpt-image-2 (모든 dated snapshot 포함).
  if (model.startsWith("gpt-image-2")) {
    return {
      supportsInputFidelity: false,
      validateSize: (s) => {
        // gpt-image-2 는 더 자유롭지만 안전을 위해 1024-2048 1:1 류만 허용 (8.3M px ≤).
        const m = /^(\d+)x(\d+)$/.exec(s);
        if (!m) return DEFAULT_SIZE;
        const w = Number(m[1]);
        const h = Number(m[2]);
        if (
          w > 0 && h > 0 &&
          w % 16 === 0 && h % 16 === 0 &&
          Math.max(w, h) <= 3840 &&
          w * h <= 8_294_400
        ) {
          return s;
        }
        return DEFAULT_SIZE;
      },
    };
  }
  // gpt-image-1 / -mini / -1.5 (legacy enum sizes 만).
  return {
    supportsInputFidelity: true,
    validateSize: (s) => (LEGACY_SIZES.has(s) ? s : DEFAULT_SIZE),
  };
}

export function createOpenAIImageAdapter(
  opts: OpenAIImageAdapterOptions = {},
): TextureAdapter {
  const apiKey = opts.apiKey ?? process.env.OPENAI_API_KEY ?? "";
  const model = opts.model ?? process.env.GENY_OPENAI_IMAGE_MODEL ?? DEFAULT_MODEL;
  const caps = detectCapabilities(model);
  const rawSize = opts.size ?? process.env.GENY_OPENAI_IMAGE_SIZE ?? DEFAULT_SIZE;
  const size = caps.validateSize(rawSize);
  const quality = opts.quality ?? process.env.GENY_OPENAI_IMAGE_QUALITY ?? DEFAULT_QUALITY;
  const timeoutMs =
    opts.timeoutMs ??
    Number.parseInt(process.env.GENY_OPENAI_IMAGE_TIMEOUT_MS ?? "600000", 10);
  // 10분. mao_pro 4096 PNG (~7MB) upload + gpt-image-2 quality:high 처리 + 응답 download.
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
        // **Atlas-aware prompt 강화**: 사용자 raw prompt ("red hair") 를 그대로 보내면
        // OpenAI 가 character generation 으로 해석해 portrait 그림. atlas 보존 의도를 명시.
        const fd = new FormData();
        fd.append("model", model);
        fd.append(
          "prompt",
          buildEditPrompt({ userPrompt: task.prompt, seed: task.seed, isAtlas: true }),
        );
        fd.append("n", "1");
        fd.append("size", size);
        fd.append("quality", quality);
        // output_format=png — alpha 채널 보존 (atlas 의 transparent 픽셀 유지).
        fd.append("output_format", "png");
        // input_fidelity: gpt-image-1/-mini/-1.5 만. gpt-image-2 는 항상 high.
        if (caps.supportsInputFidelity) {
          fd.append("input_fidelity", "high");
        }
        // 주의: background 옵션은 일부러 보내지 않음. "transparent" 강제 시 OpenAI 가
        // 캐릭터 외곽을 임의로 지워서 atlas 의 의도된 영역까지 빈 공간으로 만들어버림.
        // png 자체는 alpha 채널 가질 수 있고 model 이 reference 의 transparent 픽셀을 보존.
        fd.append(
          "image",
          new Blob([new Uint8Array(task.referenceImage!.png)], {
            type: task.referenceImage!.mimeType ?? "image/png",
          }),
          "reference.png",
        );
        // response_format 은 모든 GPT-Image 모델 deprecated — 보내지 않음.
        requestInit = {
          method: "POST",
          headers: { authorization: "Bearer " + apiKey },
          body: fd,
        };
      } else {
        // text-to-image generations. JSON body. background 옵션 미전송 (위와 동일 이유).
        requestInit = {
          method: "POST",
          headers: {
            authorization: "Bearer " + apiKey,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model,
            prompt: buildGenerateAtlasPrompt(task.prompt, task.seed),
            n: 1,
            size,
            quality,
            output_format: "png",
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
          "openai-image HTTP " + res.status + " (" + model + ", " + (useEdit ? "edits" : "generations") + "): " + rawText.slice(0, 1000),
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
          "openai-image 응답에 data[0].b64_json 없음. model=" + model + " size=" + size +
            " quality=" + quality + " endpoint=" + (useEdit ? "edits" : "generations"),
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      const rawBytes = Buffer.from(b64, "base64");
      const png = await normalizeToPng(rawBytes, {
        targetWidth: task.width,
        targetHeight: task.height,
        ...(task.referenceImage ? { maxAspectRatioDelta: 0.05 } : {}),
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
