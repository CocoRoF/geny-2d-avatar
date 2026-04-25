/**
 * nano-banana (Google Gemini 2.5 Flash Image) 텍스처 어댑터.
 *
 * Model: gemini-2.5-flash-image (별칭 "nano banana"). Google 의 뷰럴 이미지 생성 모델.
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 * Auth: x-goog-api-key 헤더 (env GEMINI_API_KEY / GOOGLE_API_KEY)
 *
 * 응답 구조:
 *   { candidates: [{ content: { parts: [{ inlineData: { mimeType, data: "<base64>" } }] } }] }
 *
 * 본 어댑터는 벤더 반환 이미지를 sharp 로 normalizeToPng() → task.width/height 에 맞춤.
 *
 * 환경변수:
 *   GEMINI_API_KEY 또는 GOOGLE_API_KEY   — 없으면 supports=false (fallback)
 *   GENY_NANO_BANANA_MODEL                — 기본 "gemini-2.5-flash-image"
 *   GENY_NANO_BANANA_TIMEOUT_MS           — 기본 60000
 *   GENY_NANO_BANANA_DISABLED=true        — 강제 off
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";

const DEFAULT_MODEL = "gemini-2.5-flash-image";

export interface NanoBananaAdapterOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly enabled?: boolean;
  readonly fetchImpl?: typeof fetch;
}

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: {
      readonly parts?: ReadonlyArray<{
        readonly inlineData?: { readonly mimeType?: string; readonly data?: string };
      }>;
    };
  }>;
  readonly error?: { readonly code?: number; readonly message?: string; readonly status?: string };
}

export function createNanoBananaAdapter(opts: NanoBananaAdapterOptions = {}): TextureAdapter {
  const apiKey =
    opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const model = opts.model ?? process.env.GENY_NANO_BANANA_MODEL ?? DEFAULT_MODEL;
  const timeoutMs =
    opts.timeoutMs ?? Number.parseInt(process.env.GENY_NANO_BANANA_TIMEOUT_MS ?? "60000", 10);
  const enabled = opts.enabled ?? process.env.GENY_NANO_BANANA_DISABLED !== "true";
  const f = opts.fetchImpl ?? fetch;

  return {
    name: "nano-banana@" + model,
    supports(task: TextureTask): boolean {
      if (!enabled) return false;
      if (!apiKey) return false;
      if (!task.prompt || task.prompt.trim().length === 0) return false;
      // Gemini 이미지 모델은 1024 주변 크기 생성. sharp 로 resize 하므로 큰 제약 없음.
      return true;
    },
    async generate(task: TextureTask) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent";
      // image-to-image: referenceImage 가 있으면 inlineData 로 함께 보내 변형 요청.
      const parts: Array<
        | { text: string }
        | { inlineData: { mimeType: string; data: string } }
      > = [];
      if (task.referenceImage?.png) {
        parts.push({
          inlineData: {
            mimeType: task.referenceImage.mimeType ?? "image/png",
            data: task.referenceImage.png.toString("base64"),
          },
        });
        parts.push({
          text:
            "Modify this Live2D character texture atlas based on the following description while keeping the same UV layout, parts arrangement, and overall composition. Description: " +
            task.prompt +
            " (seed=" +
            task.seed +
            "). Output a clean character texture atlas image with the same regions in the same positions as the input.",
        });
      } else {
        parts.push({
          text:
            task.prompt +
            " (seed=" +
            task.seed +
            ", texture atlas for character avatar, centered subject, transparent or clean background)",
        });
      }
      const body = { contents: [{ parts }] };

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await f(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        clearTimeout(t);
        const e = err as Error;
        const code =
          e.name === "AbortError" || /timeout|timed out/i.test(e.message)
            ? "TIMEOUT"
            : "NETWORK_ERROR";
        const wrapped = new Error(
          "nano-banana fetch failed (" + code + "): " + e.message,
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
          "nano-banana HTTP " + res.status + ": " + rawText.slice(0, 200),
        ) as Error & { code?: string };
        err.code = code;
        throw err;
      }

      let parsed: GeminiResponse;
      try {
        parsed = JSON.parse(rawText) as GeminiResponse;
      } catch (e) {
        const err = new Error(
          "nano-banana JSON parse 실패: " + rawText.slice(0, 200),
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      if (parsed.error) {
        const err = new Error(
          "nano-banana API error: " + parsed.error.message,
        ) as Error & { code?: string };
        err.code = "VENDOR_ERROR_4XX";
        throw err;
      }

      // 첫 candidate 의 inlineData 찾기.
      let base64Image: string | undefined;
      let mimeType = "";
      for (const c of parsed.candidates ?? []) {
        for (const p of c.content?.parts ?? []) {
          if (p.inlineData?.data) {
            base64Image = p.inlineData.data;
            mimeType = p.inlineData.mimeType ?? "";
            break;
          }
        }
        if (base64Image) break;
      }
      if (!base64Image) {
        const err = new Error(
          "nano-banana 응답에서 inlineData 찾을 수 없음. mime=" + mimeType,
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      const rawBytes = Buffer.from(base64Image, "base64");
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
