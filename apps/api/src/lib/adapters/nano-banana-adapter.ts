/**
 * nano-banana (Google Gemini 2.5 Flash Image) 텍스처 어댑터.
 *
 * 모델: gemini-2.5-flash-image (속칭 "nano banana"). image-to-image edit + text-to-image.
 * Endpoint: https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent
 * Auth: x-goog-api-key 헤더 (env GEMINI_API_KEY / GOOGLE_API_KEY)
 *
 * 핵심 사양 (2025-2026 검증):
 *   - generationConfig.responseModalities = ["IMAGE"] **필수**. 빠뜨리면 텍스트만 반환
 *     ("이미지 안 나오는" 가장 흔한 원인).
 *   - parts 순서: 공식 문서 패턴은 **text 먼저, image 나중**.
 *   - prompt 는 "Using the provided image, ..." 로 시작해야 edit 의도로 인식
 *     ("change only the X" / "keep everything else" 패턴 강력 권장).
 *   - 출력 aspect ratio 는 입력 이미지 비율을 따름 — atlas (1:1) 보내면 1:1 출력.
 *     `imageConfig.aspectRatio` 는 edit 시 신뢰성 낮음 (Google 자체 권고).
 *   - 응답 finishReason 이 "STOP" 가 아니면 실패 (NO_IMAGE / IMAGE_SAFETY 등).
 *   - inline_data / inlineData 두 키 모두 응답에 나타날 수 있음 — 둘 다 처리.
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

function buildEditPrompt(userPrompt: string, seed: number): string {
  // 공식 권장 패턴: "Using the provided image, change only the X. Keep everything else..."
  // atlas 보존을 강하게 anchor.
  return (
    "Using the provided image as a Live2D character texture atlas " +
    "(multiple character parts arranged in fixed UV regions on a single flat sheet), " +
    "produce an edited atlas where " +
    userPrompt.trim() +
    ". " +
    "Keep the layout, the part positions, and the aspect ratio of the input image exactly the same. " +
    "Do not change the input aspect ratio. Do not generate a portrait or a new composition. " +
    "Preserve every part in the same pixel region; only modify the colors and details inside the relevant region. " +
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
      return true;
    },
    async generate(task: TextureTask) {
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/" +
        encodeURIComponent(model) +
        ":generateContent";

      // parts: 공식 패턴 = text 먼저, image 나중.
      // image-to-image edit 인지 text-to-image generate 인지에 따라 prompt 형식 분기.
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

      const body = {
        contents: [{ parts }],
        generationConfig: {
          // 필수. 빠뜨리면 IMAGE 모달리티 응답 안 나옴.
          responseModalities: ["IMAGE"],
        },
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
          "nano-banana HTTP " + res.status + ": " + rawText.slice(0, 200),
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

      // 첫 candidate 의 inline_data (또는 inlineData) 찾기. 두 케이스 모두 응답될 수 있음.
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
      // edit 모드는 입력 비율과 정확히 같은 비율 응답 기대 → ratio 미스매치 시 reject.
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
