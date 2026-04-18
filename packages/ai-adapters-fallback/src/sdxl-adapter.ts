/**
 * SDXLAdapter (skeleton) — docs/05 §2.3 edit/style_ref 폴백.
 *
 * nano-banana 가 5xx/DEADLINE 으로 실패하면 라우터가 다음 후보로 내려간다. SDXL 은
 * mask 파이프라인을 지원하지 않으므로 capability 는 {edit, style_ref}. routing_weight
 * 는 nano-banana(100) 보다 낮은 80 — "동등 capability 면 nano 우선".
 *
 * Foundation 단계는 `SDXLMockClient` 로만 검증 — 실제 HTTP 는 세션 26+.
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

const SDXL_CAPABILITIES: Capability[] = ["edit", "style_ref"];

export interface SDXLClient {
  readonly modelVersion: string;
  readonly costPerCallUsd: number;
  invoke(req: SDXLRequest): Promise<SDXLResponse>;
  health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface SDXLRequest {
  task_id: string;
  slot_id: string;
  prompt: string;
  negative_prompt: string;
  size: [number, number];
  seed: number;
  reference_image_sha256: string | null;
  style_reference_sha256: string[];
  guidance_scale: number | null;
  strength: number | null;
}

export interface SDXLResponse {
  image_sha256: string;
  bbox: [number, number, number, number];
  latency_ms: number;
  vendor_metadata: Record<string, unknown>;
}

export class SDXLMockClient implements SDXLClient {
  readonly modelVersion = "sdxl-1.0-mock";
  readonly costPerCallUsd = 0.008;

  async invoke(req: SDXLRequest): Promise<SDXLResponse> {
    const image = createHash("sha256")
      .update(`sdxl:v0|${req.seed}|${req.prompt}|${req.slot_id}`)
      .digest("hex");
    const [w, h] = req.size;
    const bw = Math.round(w * 0.92);
    const bh = Math.round(h * 0.92);
    const bx = Math.round((w - bw) / 2);
    const by = Math.round((h - bh) / 2);
    return {
      image_sha256: image,
      bbox: [bx, by, bw, bh],
      latency_ms: 200 + (req.seed % 200),
      vendor_metadata: { client: "mock", family: "sdxl" },
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
    return { ok: true, latencyMs: 1, detail: "mock" };
  }
}

export interface SDXLAdapterOptions {
  client?: SDXLClient;
  routingWeight?: number;
  maxParallel?: number;
}

export class SDXLAdapter implements AIAdapter {
  readonly meta: AdapterMeta;
  private readonly client: SDXLClient;

  constructor(opts: SDXLAdapterOptions = {}) {
    this.client = opts.client ?? new SDXLMockClient();
    this.meta = {
      name: "sdxl",
      version: this.client.modelVersion,
      capability: [...SDXL_CAPABILITIES],
      cost_per_call_usd: this.client.costPerCallUsd,
      max_parallel: opts.maxParallel ?? 4,
      routing_weight: opts.routingWeight ?? 80,
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
      if (!SDXL_CAPABILITIES.includes(req)) {
        throw new AdapterError(
          `sdxl does not support capability '${req}'`,
          "CAPABILITY_MISMATCH",
          { task_id: task.task_id, required: req },
        );
      }
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
      reference_image_sha256: task.reference_image_sha256 ?? null,
      style_reference_sha256: task.style_reference_sha256 ?? [],
      guidance_scale: task.guidance_scale ?? null,
      strength: task.strength ?? null,
    });
    if (!/^[0-9a-f]{64}$/.test(response.image_sha256)) {
      throw new AdapterError(
        "sdxl vendor returned invalid image_sha256",
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
