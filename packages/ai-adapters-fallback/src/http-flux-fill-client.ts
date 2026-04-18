/**
 * HttpFluxFillClient — 실제 Flux-Fill HTTP 호출 (세션 28). mask 전용 폴백.
 *
 * 동일 원칙 (HttpNanoBananaClient/HttpSDXLClient 와 대칭):
 *   - FluxFillClient 인터페이스 구현
 *   - fetch 생성자 주입
 *   - HTTP 5xx/4xx → VENDOR_ERROR_{5,4}XX, AbortError → DEADLINE_EXCEEDED
 *   - 비 JSON/잘못된 sha/bbox → INVALID_OUTPUT
 */

import { AdapterError } from "@geny/ai-adapter-core";

import type {
  FluxFillClient,
  FluxFillRequest,
  FluxFillResponse,
} from "./flux-fill-adapter.js";

export interface HttpFluxFillClientOptions {
  endpoint: string;
  apiKey: string;
  modelVersion?: string;
  costPerCallUsd?: number;
  fetch?: typeof fetch;
  defaultTimeoutMs?: number;
}

interface VendorBody {
  image_sha256?: string;
  bbox?: [number, number, number, number];
  latency_ms?: number;
  vendor_metadata?: Record<string, unknown>;
}

interface VendorHealthBody {
  ok?: boolean;
  latency_ms?: number;
  detail?: string;
}

function mapHttpStatus(status: number): "VENDOR_ERROR_4XX" | "VENDOR_ERROR_5XX" {
  return status >= 500 ? "VENDOR_ERROR_5XX" : "VENDOR_ERROR_4XX";
}

export class HttpFluxFillClient implements FluxFillClient {
  readonly modelVersion: string;
  readonly costPerCallUsd: number;
  private readonly endpoint: string;
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number | undefined;

  constructor(opts: HttpFluxFillClientOptions) {
    if (!opts.endpoint) throw new Error("HttpFluxFillClient: endpoint required");
    if (!opts.apiKey) throw new Error("HttpFluxFillClient: apiKey required");
    this.endpoint = opts.endpoint.replace(/\/$/, "");
    this.apiKey = opts.apiKey;
    this.modelVersion = opts.modelVersion ?? "flux-fill-1.0";
    this.costPerCallUsd = opts.costPerCallUsd ?? 0.012;
    const injected = opts.fetch;
    if (injected) {
      this.fetchImpl = injected;
    } else if (typeof globalThis.fetch === "function") {
      this.fetchImpl = globalThis.fetch.bind(globalThis);
    } else {
      throw new Error("HttpFluxFillClient: global fetch unavailable — inject opts.fetch");
    }
    this.defaultTimeoutMs = opts.defaultTimeoutMs;
  }

  async invoke(req: FluxFillRequest): Promise<FluxFillResponse> {
    const url = `${this.endpoint}/v1/fill`;
    const controller = new AbortController();
    const timeoutMs = this.defaultTimeoutMs ?? 60000;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(toVendorRequest(req, this.modelVersion)),
        signal: controller.signal,
      });
    } catch (err) {
      const e = err as Error & { name?: string };
      if (e.name === "AbortError") {
        throw new AdapterError(
          `flux-fill request aborted after ${timeoutMs}ms`,
          "DEADLINE_EXCEEDED",
          { task_id: req.task_id, timeout_ms: timeoutMs },
        );
      }
      throw new AdapterError(
        `flux-fill network error: ${e.message}`,
        "VENDOR_ERROR_5XX",
        { task_id: req.task_id, cause: e.message },
      );
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await safeReadText(res);
      throw new AdapterError(
        `flux-fill HTTP ${res.status}: ${body.slice(0, 200)}`,
        mapHttpStatus(res.status),
        { task_id: req.task_id, status: res.status },
      );
    }

    let parsed: VendorBody;
    try {
      parsed = (await res.json()) as VendorBody;
    } catch (err) {
      throw new AdapterError(
        `flux-fill returned non-JSON: ${(err as Error).message}`,
        "INVALID_OUTPUT",
        { task_id: req.task_id },
      );
    }

    if (!parsed.image_sha256 || !/^[0-9a-f]{64}$/.test(parsed.image_sha256)) {
      throw new AdapterError(
        "flux-fill missing/malformed image_sha256",
        "INVALID_OUTPUT",
        { task_id: req.task_id, got: parsed.image_sha256 ?? null },
      );
    }
    if (
      !parsed.bbox ||
      !Array.isArray(parsed.bbox) ||
      parsed.bbox.length !== 4 ||
      parsed.bbox.some((v) => typeof v !== "number")
    ) {
      throw new AdapterError("flux-fill missing/malformed bbox", "INVALID_OUTPUT", {
        task_id: req.task_id,
      });
    }

    return {
      image_sha256: parsed.image_sha256,
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

function toVendorRequest(req: FluxFillRequest, model: string): Record<string, unknown> {
  return {
    model,
    prompt: req.prompt,
    negative_prompt: req.negative_prompt,
    size: { width: req.size[0], height: req.size[1] },
    seed: req.seed,
    reference_image_sha256: req.reference_image_sha256,
    mask_sha256: req.mask_sha256,
    guidance_scale: req.guidance_scale,
    strength: req.strength,
    slot_id: req.slot_id,
    task_id: req.task_id,
  };
}

async function safeReadText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "";
  }
}
