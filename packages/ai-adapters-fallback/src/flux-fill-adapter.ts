/**
 * FluxFillAdapter (skeleton) — docs/05 §2.3 mask 폴백.
 *
 * nano-banana 가 mask 작업에서 실패했을 때 유일한 마스크 지원 폴백. SDXL 은 mask 를
 * 지원하지 않으므로, mask capability 요구 시 라우터는 nano-banana → flux-fill 로만
 * 내려간다. routing_weight 는 nano-banana(100) 보다 낮은 70.
 *
 * Foundation 단계는 `FluxFillMockClient` 로만 검증 — 실제 HTTP 는 세션 26+.
 */

import {
  AdapterError,
  deterministicSeed,
  promptSha256,
  type AIAdapter,
  type AdapterMeta,
  type Capability,
  type GenerationResult,
  type GenerationTask,
  type ProbeReport,
} from "@geny/ai-adapter-core";

import { createHash } from "node:crypto";

const FLUX_FILL_CAPABILITIES: Capability[] = ["mask"];

export interface FluxFillClient {
  readonly modelVersion: string;
  readonly costPerCallUsd: number;
  invoke(req: FluxFillRequest): Promise<FluxFillResponse>;
  health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface FluxFillRequest {
  task_id: string;
  slot_id: string;
  prompt: string;
  negative_prompt: string;
  size: [number, number];
  seed: number;
  reference_image_sha256: string;
  mask_sha256: string;
  guidance_scale: number | null;
  strength: number | null;
}

export interface FluxFillResponse {
  image_sha256: string;
  bbox: [number, number, number, number];
  latency_ms: number;
  vendor_metadata: Record<string, unknown>;
}

export class FluxFillMockClient implements FluxFillClient {
  readonly modelVersion = "flux-fill-1.0-mock";
  readonly costPerCallUsd = 0.012;

  async invoke(req: FluxFillRequest): Promise<FluxFillResponse> {
    const image = createHash("sha256")
      .update(`flux-fill:v0|${req.seed}|${req.mask_sha256}|${req.prompt}|${req.slot_id}`)
      .digest("hex");
    const [w, h] = req.size;
    return {
      image_sha256: image,
      bbox: [0, 0, w, h],
      latency_ms: 250 + (req.seed % 250),
      vendor_metadata: { client: "mock", family: "flux-fill" },
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
    return { ok: true, latencyMs: 1, detail: "mock" };
  }
}

export interface FluxFillAdapterOptions {
  client?: FluxFillClient;
  routingWeight?: number;
  maxParallel?: number;
}

export class FluxFillAdapter implements AIAdapter {
  readonly meta: AdapterMeta;
  private readonly client: FluxFillClient;

  constructor(opts: FluxFillAdapterOptions = {}) {
    this.client = opts.client ?? new FluxFillMockClient();
    this.meta = {
      name: "flux-fill",
      version: this.client.modelVersion,
      capability: [...FLUX_FILL_CAPABILITIES],
      cost_per_call_usd: this.client.costPerCallUsd,
      max_parallel: opts.maxParallel ?? 2,
      routing_weight: opts.routingWeight ?? 70,
    };
  }

  estimateCost(task: GenerationTask): number {
    const [w, h] = task.size;
    const area = Math.max(w, h);
    const multiplier = area > 2048 ? 1.6 : area > 1024 ? 1.25 : 1.0;
    return Number((this.client.costPerCallUsd * multiplier).toFixed(4));
  }

  async probe(): Promise<ProbeReport> {
    const h = await this.client.health();
    return {
      ok: h.ok,
      latency_ms: h.latencyMs,
      checked_at: new Date().toISOString(),
      ...(h.detail !== undefined ? { detail: h.detail } : {}),
    };
  }

  async generate(task: GenerationTask): Promise<GenerationResult> {
    for (const req of task.capability_required ?? []) {
      if (!FLUX_FILL_CAPABILITIES.includes(req)) {
        throw new AdapterError(
          `flux-fill does not support capability '${req}'`,
          "CAPABILITY_MISMATCH",
          { task_id: task.task_id, required: req },
        );
      }
    }
    if (!task.reference_image_sha256 || !task.mask_sha256) {
      throw new AdapterError(
        "flux-fill requires reference_image_sha256 and mask_sha256",
        "CAPABILITY_MISMATCH",
        {
          task_id: task.task_id,
          reference: task.reference_image_sha256 ?? null,
          mask: task.mask_sha256 ?? null,
        },
      );
    }
    const est = this.estimateCost(task);
    if (est > task.budget_usd) {
      throw new AdapterError(
        `estimated $${est} exceeds budget $${task.budget_usd}`,
        "BUDGET_EXCEEDED",
        { task_id: task.task_id, estimate_usd: est },
      );
    }
    const seed = task.seed ?? deterministicSeed(task.idempotency_key);
    const started = Date.now();
    const response = await this.client.invoke({
      task_id: task.task_id,
      slot_id: task.slot_id,
      prompt: task.prompt,
      negative_prompt: task.negative_prompt,
      size: task.size,
      seed,
      reference_image_sha256: task.reference_image_sha256,
      mask_sha256: task.mask_sha256,
      guidance_scale: task.guidance_scale ?? null,
      strength: task.strength ?? null,
    });
    if (!/^[0-9a-f]{64}$/.test(response.image_sha256)) {
      throw new AdapterError(
        "flux-fill vendor returned invalid image_sha256",
        "INVALID_OUTPUT",
        { task_id: task.task_id },
      );
    }
    return {
      schema_version: "v1",
      task_id: task.task_id,
      slot_id: task.slot_id,
      image_sha256: response.image_sha256,
      alpha_sha256: null,
      bbox: response.bbox,
      vendor: this.meta.name,
      model_version: this.meta.version,
      seed,
      prompt_sha256: promptSha256(task.prompt),
      cost_usd: est,
      latency_ms: Date.now() - started,
      completed_at: new Date().toISOString(),
      vendor_metadata: response.vendor_metadata,
    };
  }
}
