/**
 * HttpNanoBananaClient — 실제 nano-banana (Gemini 2.5 Flash Image) HTTP 호출.
 *
 * 설계 원칙:
 *   - `NanoBananaClient` 인터페이스를 그대로 구현 → 어댑터 본체(`NanoBananaAdapter`) 는 변경 無
 *   - `fetch` 는 생성자 주입 (기본 `globalThis.fetch`) — 테스트는 네트워크 없이 동작
 *   - 벤더 HTTP 상태 → `AdapterError` 매핑 테이블은 이 파일 하나에 고정 (docs/05 §12.3)
 *   - 엔드포인트/모델명/단가는 생성자 옵션 — 환경별 override 가능
 *   - AbortController + deadline_ms 로 요청 단위 타임아웃
 *
 * 요청/응답 바디 구조는 **벤더 스펙의 Foundation placeholder** 이다. 실 API 스펙이 확정되면
 * 이 파일의 `Req/Res` 타입과 매핑만 교체하며, 어댑터·라우터·provenance 경로는 재작성 불필요.
 */

import { AdapterError } from "@geny/ai-adapter-core";

import type {
  NanoBananaClient,
  NanoBananaRequest,
  NanoBananaResponse,
} from "./client.js";

export interface HttpNanoBananaClientOptions {
  endpoint: string;
  apiKey: string;
  modelVersion?: string;
  costPerCallUsd?: number;
  /** 기본 `globalThis.fetch`. 테스트에서 mock 주입용. */
  fetch?: typeof fetch;
  /** per-request 타임아웃 (ms). 명시 안 하면 task.deadline_ms 만 적용. */
  defaultTimeoutMs?: number;
}

interface VendorResponseBody {
  image_sha256?: string;
  alpha_sha256?: string | null;
  bbox?: [number, number, number, number];
  latency_ms?: number;
  vendor_metadata?: Record<string, unknown>;
}

interface VendorHealthBody {
  ok?: boolean;
  latency_ms?: number;
  detail?: string;
}

/**
 * 벤더 HTTP 상태 → AdapterError code 매핑 (docs/05 §12.3).
 * AbortError 는 DEADLINE_EXCEEDED — 어댑터의 `withDeadline()` 이 잡는 폴백.
 */
function mapHttpStatus(status: number): "VENDOR_ERROR_4XX" | "VENDOR_ERROR_5XX" {
  if (status >= 500) return "VENDOR_ERROR_5XX";
  return "VENDOR_ERROR_4XX";
}

export class HttpNanoBananaClient implements NanoBananaClient {
  readonly modelVersion: string;
  readonly costPerCallUsd: number;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number | undefined;

  constructor(opts: HttpNanoBananaClientOptions) {
    if (!opts.endpoint) throw new Error("HttpNanoBananaClient: endpoint required");
    if (!opts.apiKey) throw new Error("HttpNanoBananaClient: apiKey required");
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.modelVersion = opts.modelVersion ?? "gemini-2.5-flash-image";
    this.costPerCallUsd = opts.costPerCallUsd ?? 0.015;
    const injected = opts.fetch;
    if (injected) {
      this.fetchImpl = injected;
    } else if (typeof globalThis.fetch === "function") {
      this.fetchImpl = globalThis.fetch.bind(globalThis);
    } else {
      throw new Error(
        "HttpNanoBananaClient: global fetch unavailable — inject opts.fetch",
      );
    }
    this.defaultTimeoutMs = opts.defaultTimeoutMs;
  }

  async invoke(request: NanoBananaRequest): Promise<NanoBananaResponse> {
    const url = `${this.endpoint}/v1/generate`;
    const controller = new AbortController();
    const timeoutMs = Math.min(
      request.deadline_ms,
      this.defaultTimeoutMs ?? request.deadline_ms,
    );
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "authorization": `Bearer ${this.apiKey}`,
          "x-idempotency-key": request.idempotency_key,
        },
        body: JSON.stringify(toVendorRequest(request, this.modelVersion)),
        signal: controller.signal,
      });
    } catch (err) {
      const error = err as Error & { name?: string };
      if (error.name === "AbortError") {
        throw new AdapterError(
          `vendor request aborted after ${timeoutMs}ms`,
          "DEADLINE_EXCEEDED",
          { task_id: request.task_id, timeout_ms: timeoutMs },
        );
      }
      // 네트워크 계열(fetch 자체 throw)은 5xx 범주 — 라우터가 폴백 가능하도록.
      throw new AdapterError(
        `vendor network error: ${error.message}`,
        "VENDOR_ERROR_5XX",
        { task_id: request.task_id, cause: error.message },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new AdapterError(
        `vendor HTTP ${res.status}: ${body.slice(0, 200)}`,
        mapHttpStatus(res.status),
        { task_id: request.task_id, status: res.status },
      );
    }

    let parsed: VendorResponseBody;
    try {
      parsed = (await res.json()) as VendorResponseBody;
    } catch (err) {
      throw new AdapterError(
        `vendor returned non-JSON body: ${(err as Error).message}`,
        "INVALID_OUTPUT",
        { task_id: request.task_id },
      );
    }

    if (!parsed.image_sha256 || !/^[0-9a-f]{64}$/.test(parsed.image_sha256)) {
      throw new AdapterError(
        "vendor response missing or malformed image_sha256",
        "INVALID_OUTPUT",
        { task_id: request.task_id, got: parsed.image_sha256 ?? null },
      );
    }
    if (
      !parsed.bbox ||
      !Array.isArray(parsed.bbox) ||
      parsed.bbox.length !== 4 ||
      parsed.bbox.some((v) => typeof v !== "number")
    ) {
      throw new AdapterError(
        "vendor response missing or malformed bbox",
        "INVALID_OUTPUT",
        { task_id: request.task_id },
      );
    }

    return {
      image_sha256: parsed.image_sha256,
      alpha_sha256: parsed.alpha_sha256 ?? null,
      bbox: parsed.bbox,
      latency_ms: typeof parsed.latency_ms === "number" ? parsed.latency_ms : 0,
      vendor_metadata: parsed.vendor_metadata ?? {},
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
    const url = `${this.endpoint}/v1/health`;
    const started = Date.now();
    try {
      const res = await this.fetchImpl(url, {
        method: "GET",
        headers: { authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        return { ok: false, latencyMs: Date.now() - started, detail: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as VendorHealthBody;
      return {
        ok: body.ok !== false,
        latencyMs: typeof body.latency_ms === "number" ? body.latency_ms : Date.now() - started,
        ...(body.detail ? { detail: body.detail } : {}),
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: (err as Error).message,
      };
    }
  }
}

function toVendorRequest(
  request: NanoBananaRequest,
  modelVersion: string,
): Record<string, unknown> {
  return {
    model: modelVersion,
    prompt: request.prompt,
    negative_prompt: request.negative_prompt,
    size: { width: request.size[0], height: request.size[1] },
    seed: request.seed,
    reference_image_sha256: request.reference_image_sha256,
    mask_sha256: request.mask_sha256,
    style_reference_sha256: request.style_reference_sha256,
    style_profile_id: request.style_profile_id,
    guidance_scale: request.guidance_scale,
    strength: request.strength,
    slot_id: request.slot_id,
    task_id: request.task_id,
  };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
