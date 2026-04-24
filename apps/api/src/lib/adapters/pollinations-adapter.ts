/**
 * Pollinations.ai 텍스처 어댑터.
 *
 * image.pollinations.ai 공개 HTTP 엔드포인트를 호출 (API key 불필요 - 장난감 스코프 적합).
 *   GET https://image.pollinations.ai/prompt/<url-encoded-prompt>?width=W&height=H&seed=S&nologo=true&model=flux
 * → image/jpeg 또는 image/png 반환 (content-type 참조)
 *
 * 본 어댑터는 Phase 3.4 의 "실 AI 벤더 검증용 primary 경로". Pollinations 가 rate limit
 * 또는 네트워크 오류로 실패하면 runTextureGenerate 가 다음 어댑터 (mock) 로 폴백.
 *
 * 제약:
 *   - 반환 이미지는 JPEG 인 경우가 많음 - 우리 파이프라인은 PNG 요구 → PNG 재인코딩 필요
 *     (Node sharp 없이 pngjs 로 변환하려면 이미지 디코딩 필요) → 본 P3.4 에서는 단순화하여
 *     Pollinations 결과를 그대로 저장하되 content-type 이 png 일 때만 성공 간주.
 *     (Pollinations `?format=png` 또는 `nofeed=true` 등 옵션으로 PNG 강제 가능 - 추후 확인)
 *   - 해상도 제한: Pollinations 는 일반적으로 최대 2048 권장. 본 어댑터 supports: ≤2048 제한.
 *   - 네트워크 timeout 기본 30s.
 *
 * 환경변수:
 *   GENY_POLLINATIONS_DISABLED=true    → 어댑터 비활성화 (mock 만 사용하고 싶을 때)
 *   GENY_POLLINATIONS_MODEL=flux       → 기본 flux. 다른 값: "turbo", "kontext" 등.
 *   GENY_POLLINATIONS_TIMEOUT_MS=30000 → fetch 타임아웃
 */

import { createHash } from "node:crypto";
import type { TextureAdapter, TextureTask } from "../texture-adapter.js";
import { normalizeToPng } from "../image-post.js";

const BASE_URL = "https://image.pollinations.ai/prompt";
const MAX_DIMENSION = 2048;

export interface PollinationsAdapterOptions {
  readonly model?: string;
  readonly timeoutMs?: number;
  readonly enabled?: boolean;
  /** fetch 주입 - 테스트에서 mock. */
  readonly fetchImpl?: typeof fetch;
}

export function createPollinationsAdapter(opts: PollinationsAdapterOptions = {}): TextureAdapter {
  const model = opts.model ?? process.env.GENY_POLLINATIONS_MODEL ?? "flux";
  const timeoutMs =
    opts.timeoutMs ??
    Number.parseInt(process.env.GENY_POLLINATIONS_TIMEOUT_MS ?? "30000", 10);
  const enabled =
    opts.enabled ?? process.env.GENY_POLLINATIONS_DISABLED !== "true";
  const f = opts.fetchImpl ?? fetch;

  return {
    name: "pollinations@" + model,
    supports(task: TextureTask): boolean {
      if (!enabled) return false;
      if (task.width > MAX_DIMENSION || task.height > MAX_DIMENSION) return false;
      if (!task.prompt || task.prompt.trim().length === 0) return false;
      return true;
    },
    async generate(task: TextureTask) {
      const url = new URL(BASE_URL + "/" + encodeURIComponent(task.prompt));
      url.searchParams.set("width", String(task.width));
      url.searchParams.set("height", String(task.height));
      url.searchParams.set("seed", String(task.seed || 0));
      url.searchParams.set("nologo", "true");
      url.searchParams.set("model", model);
      url.searchParams.set("format", "png"); // PNG 강제 요청 (Pollinations 지원 시)

      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), timeoutMs);
      let res: Response;
      try {
        res = await f(url, { signal: controller.signal });
      } catch (err) {
        clearTimeout(t);
        const e = err as Error;
        const code =
          e.name === "AbortError" || /timeout|timed out/i.test(e.message)
            ? "TIMEOUT"
            : "NETWORK_ERROR";
        const wrapped = new Error(
          "pollinations fetch failed (" + code + "): " + e.message,
        ) as Error & { code?: string };
        wrapped.code = code;
        throw wrapped;
      }
      clearTimeout(t);

      if (!res.ok) {
        const code =
          res.status >= 500
            ? "VENDOR_ERROR_5XX"
            : res.status === 429
              ? "RATE_LIMITED"
              : "VENDOR_ERROR_4XX";
        const err = new Error("pollinations HTTP " + res.status) as Error & { code?: string };
        err.code = code;
        throw err;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 16) {
        const err = new Error(
          "pollinations 응답이 너무 짧음 (" + buf.length + " bytes)",
        ) as Error & { code?: string };
        err.code = "INVALID_OUTPUT";
        throw err;
      }
      // sharp normalize - JPEG/WebP 반환도 PNG 로 수렴.
      const png = await normalizeToPng(buf, {
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
