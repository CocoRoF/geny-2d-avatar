/**
 * nano-banana (Google Gemini) 텍스처 어댑터 — 2026 최신 모델 라인업 지원.
 *
 * 모델 (current lineup, April 2026):
 *   gemini-2.5-flash-image          — Stable. Aspect-ratio bug 있음 (1:1 collapse). atlas 보존 약함.
 *   gemini-2.5-flash-image-preview  — Deprecated. 이전 별칭.
 *   gemini-3.1-flash-image-preview  — Preview (Nano Banana 2). atlas 보존 안정적, 14 ratio + imageSize 지원.
 *   gemini-3-pro-image-preview      — Preview (Nano Banana Pro). 최고 품질 layout 보존. 비싸지만 thinkingConfig 지원.
 *
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 * Auth: x-goog-api-key 헤더.
 *
 * default model = "gemini-3.1-flash-image-preview":
 *   atlas-friendly aspect ratio 처리 + 적정 가격. 2.5-flash-image 의 1:1 collapse bug 회피.
 *   사용자가 더 좋은 품질 원하면 GENY_NANO_BANANA_MODEL=gemini-3-pro-image-preview override.
 *
 * 모델별 옵션 호환:
 *   - imageConfig (aspectRatio, imageSize): 3.1+ 만 지원. 2.5 는 무시 / aspect-ratio bug.
 *   - thinkingConfig: 3.1+ 와 3-pro 지원.
 *   - 14가지 aspect ratio (1:4, 4:1, 1:8, 8:1 추가): 3.1 만.
 *
 * 환경변수:
 *   GEMINI_API_KEY 또는 GOOGLE_API_KEY    — 없으면 supports=false (fallback)
 *   GENY_NANO_BANANA_MODEL                — 기본 "gemini-3.1-flash-image-preview"
 *   GENY_NANO_BANANA_TIMEOUT_MS           — 기본 60000
 *   GENY_NANO_BANANA_DISABLED=true        — 강제 off
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";

export interface NanoBananaAdapterOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly enabled?: boolean;
  readonly fetchImpl?: typeof fetch;
}

interface InlineDataPartLower {
  readonly inline_data?: { readonly mime_type?: string; readonly data?: string };
}
interface InlineDataPartCamel {
  readonly inlineData?: { readonly mimeType?: string; readonly data?: string };
}
interface TextPart { readonly text?: string }
type ResponsePart = TextPart & InlineDataPartLower & InlineDataPartCamel;

interface GeminiResponse {
  readonly candidates?: ReadonlyArray<{
    readonly content?: { readonly parts?: ReadonlyArray<ResponsePart> };
    readonly finishReason?: string;
  }>;
  readonly promptFeedback?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string; readonly status?: string };
}

interface ModelCapabilities {
  /** imageConfig (aspectRatio + imageSize) 지원 여부. 3.1+ 만 신뢰성 있음. */
  readonly supportsImageConfig: boolean;
  /** thinkingConfig 지원 여부. 3.1+ 와 3-pro. */
  readonly supportsThinking: boolean;
  /** atlas-recommended imageSize 값. */
  readonly recommendedImageSize: "1K" | "2K" | "4K";
}

function detectCapabilities(model: string): ModelCapabilities {
  // gemini-3-pro: 최고 품질, thinking 지원, 4K 까지.
  if (model.startsWith("gemini-3-pro-image")) {
    return {
      supportsImageConfig: true,
      supportsThinking: true,
      recommendedImageSize: "2K",
    };
  }
  // gemini-3.1+: imageConfig + thinking 지원.
  if (model.startsWith("gemini-3.1-flash-image") || model.startsWith("gemini-3-")) {
    return {
      supportsImageConfig: true,
      supportsThinking: true,
      recommendedImageSize: "2K",
    };
  }
  // gemini-2.5: legacy. imageConfig 신뢰성 낮음 → 보내지 않음 (output 비율은 입력 따라감).
  return {
    supportsImageConfig: false,
    supportsThinking: false,
    recommendedImageSize: "1K",
  };
}

function buildEditPrompt(userPrompt: string, seed: number): string {
  // 공식 권장 패턴: "Using the provided image, change only the X. Keep everything else..."
  // atlas 보존을 강하게 anchor.
  return (
    "Using the provided image as a Live2D character texture atlas " +
    "(multiple character parts arranged in fixed UV regions on a single flat sheet), " +
    "produce an edited atlas where " +
    userPrompt.trim() +
    ". " +
    "Hard constraints: " +
    "(1) Do NOT change the position, scale, rotation, or shape of any part. " +
    "(2) Do NOT change the input aspect ratio. " +
    "(3) Preserve transparent (alpha=0) background pixels exactly. " +
    "(4) Do not generate a portrait or a new composition; only modify pixels inside relevant existing regions. " +
    "Seed: " + seed + "."
  );
}

function buildGeneratePrompt(userPrompt: string, seed: number): string {
  return (
    userPrompt.trim() +
    " (texture atlas for a Live2D character avatar, flat sheet with parts arranged in UV regions, " +
    "centered subject, transparent or clean background, square aspect ratio, seed=" + seed + ")"
  );
}

export function createNanoBananaAdapter(opts: NanoBananaAdapterOptions = {}): TextureAdapter {
  const apiKey =
    opts.apiKey ?? process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY ?? "";
  const model = opts.model ?? process.env.GENY_NANO_BANANA_MODEL ?? DEFAULT_MODEL;
  const caps = detectCapabilities(model);
  const timeoutMs =
    opts.timeoutMs ?? Number.parseInt(process.env.GENY_NANO_BANANA_TIMEOUT_MS ?? "600000", 10);
  // 10분. mao_pro 4096 PNG (~7MB) upload + 3-pro thinking + 4K 응답.
  const enabled = opts.enabled ?? process.env.GENY_NANO_BANANA_DISABLED !== "true";
  const f = opts.fetchImpl ?? fetch;

  return {
    name: "nano-banana@" + model,
    supports(task: TextureTask): boolean {
      if (!enabled) return false;
      if (!apiKey) return false;
      if (!task.prompt || task.prompt.trim().length === 0) return false;
      return true;
    },
    async generate(task: TextureTask) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent";

      // parts: 공식 패턴 = text 먼저, image 나중.
      const parts: Array<
        | { text: string }
        | { inline_data: { mime_type: string; data: string } }
      > = [];
      if (task.referenceImage?.png) {
        parts.push({ text: buildEditPrompt(task.prompt, task.seed) });
        parts.push({
          inline_data: {
            mime_type: task.referenceImage.mimeType ?? "image/png",
            data: task.referenceImage.png.toString("base64"),
          },
        });
      } else {
        parts.push({ text: buildGeneratePrompt(task.prompt, task.seed) });
      }

      // generationConfig: responseModalities 필수, imageConfig 는 3.1+ 만.
      const generationConfig: Record<string, unknown> = {
        responseModalities: ["IMAGE"],
      };
      if (caps.supportsImageConfig) {
        generationConfig.imageConfig = {
          aspectRatio: "1:1",
          imageSize: caps.recommendedImageSize,
        };
      }
      if (caps.supportsThinking) {
        generationConfig.thinkingConfig = { thinkingLevel: "high" };
      }

      const body = {
        contents: [{ parts }],
        generationConfig,
        // safetySettings: 화이트 박스 캐릭터 텍스처에서 false-positive 줄이기 위해 BLOCK_ONLY_HIGH.
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        ],
      };

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
          "nano-banana HTTP " + res.status + " (" + model + "): " + rawText.slice(0, 1000),
        ) as Error & { code?: string };
        err.code = code;
        throw err;
      }

      let parsed: GeminiResponse;
      try {
        parsed = JSON.parse(rawText) as GeminiResponse;
      } catch {
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

      // finishReason 검증. STOP 만 정상.
      const cand = parsed.candidates?.[0];
      const finishReason = cand?.finishReason ?? "UNKNOWN";
      if (finishReason !== "STOP" && finishReason !== "UNKNOWN") {
        const err = new Error(
          "nano-banana 비정상 finishReason=" + finishReason +
            " — 안전 필터/토큰 한계 등으로 이미지 미반환. promptFeedback=" +
            JSON.stringify(parsed.promptFeedback ?? null),
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      // 첫 candidate 의 inline_data (또는 inlineData) 찾기.
      let base64Image: string | undefined;
      let mimeType = "";
      for (const p of cand?.content?.parts ?? []) {
        const inline = p.inline_data ?? p.inlineData;
        if (inline?.data) {
          base64Image = inline.data;
          mimeType =
            (p.inline_data?.mime_type) ?? (p.inlineData?.mimeType) ?? "";
          break;
        }
      }
      if (!base64Image) {
        const textParts = (cand?.content?.parts ?? [])
          .map((p) => p.text)
          .filter((x): x is string => typeof x === "string" && x.length > 0)
          .join(" | ");
        const err = new Error(
          "nano-banana 응답에 이미지 part 없음. finishReason=" + finishReason +
            ", text=" + textParts.slice(0, 200) + ", mime=" + mimeType,
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }

      const rawBytes = Buffer.from(base64Image, "base64");
      const png = await normalizeToPng(rawBytes, {
        targetWidth: task.width,
        targetHeight: task.height,
        // image-to-image 시 응답이 정확히 입력 비율 이어야 함. 0.05 이상 차이면 portrait 등으로 판단 reject.
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
