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

import { MockNanoBananaClient, toNanoBananaRequest, type NanoBananaClient } from "./client.js";

const NANO_BANANA_CAPABILITIES: Capability[] = ["edit", "style_ref", "mask"];

export interface NanoBananaAdapterOptions {
  client?: NanoBananaClient;
  routingWeight?: number;
  maxParallel?: number;
}

/**
 * docs/05 §3 — nano-banana primary 어댑터.
 * Foundation skeleton: 네트워크 호출 없이 Mock 클라이언트로 검증 가능.
 * 교체 지점: 생성자에 실제 HTTP `NanoBananaClient` 를 주입하면 프로덕션 코드 변경 無.
 */
export class NanoBananaAdapter implements AIAdapter {
  readonly meta: AdapterMeta;
  private readonly client: NanoBananaClient;

  constructor(opts: NanoBananaAdapterOptions = {}) {
    this.client = opts.client ?? new MockNanoBananaClient();
    this.meta = {
      name: "nano-banana",
      version: this.client.modelVersion,
      capability: [...NANO_BANANA_CAPABILITIES],
      cost_per_call_usd: this.client.costPerCallUsd,
      max_parallel: opts.maxParallel ?? 8,
      routing_weight: opts.routingWeight ?? 100,
    };
  }

  estimateCost(task: GenerationTask): number {
    // docs/05 §3.5 — 기본은 고정 요금. 1024 초과 해상도에서는 ×1.5 (4096) 가정.
    const [w, h] = task.size;
    const area = Math.max(w, h);
    const multiplier = area > 2048 ? 1.5 : area > 1024 ? 1.2 : 1.0;
    return Number((this.client.costPerCallUsd * multiplier).toFixed(4));
  }

  async probe(): Promise<ProbeReport> {
    try {
      const h = await this.client.health();
      return {
        ok: h.ok,
        latency_ms: h.latencyMs,
        checked_at: new Date().toISOString(),
        ...(h.detail !== undefined ? { detail: h.detail } : {}),
      };
    } catch (err) {
      throw new AdapterError(
        `nano-banana probe failed: ${(err as Error).message}`,
        "PROBE_FAILED",
      );
    }
  }

  async generate(task: GenerationTask): Promise<GenerationResult> {
    // 1. capability_required 검증
    for (const req of task.capability_required ?? []) {
      if (!NANO_BANANA_CAPABILITIES.includes(req)) {
        throw new AdapterError(
          `nano-banana does not support capability '${req}'`,
          "CAPABILITY_MISMATCH",
          { task_id: task.task_id, required: req },
        );
      }
    }
    // 2. 예산 검증
    const est = this.estimateCost(task);
    if (est > task.budget_usd) {
      throw new AdapterError(
        `estimated $${est} exceeds budget $${task.budget_usd}`,
        "BUDGET_EXCEEDED",
        { task_id: task.task_id, estimate_usd: est },
      );
    }
    // 3. 시드 결정 (docs/05 §7.1)
    const seed = task.seed ?? deterministicSeed(task.idempotency_key);
    // 4. 벤더 호출 (+ deadline enforcement)
    const vendorRequest = toNanoBananaRequest(task, seed);
    const started = Date.now();
    const response = await withDeadline(
      this.client.invoke(vendorRequest),
      task.deadline_ms,
      task.task_id,
    );
    const latency = Date.now() - started;
    // 5. 결과 계약 검증
    if (!/^[0-9a-f]{64}$/.test(response.image_sha256)) {
      throw new AdapterError(
        "vendor returned invalid image_sha256",
        "INVALID_OUTPUT",
        { task_id: task.task_id, got: response.image_sha256 },
      );
    }
    return {
      schema_version: "v1",
      task_id: task.task_id,
      slot_id: task.slot_id,
      image_sha256: response.image_sha256,
      alpha_sha256: response.alpha_sha256,
      bbox: response.bbox,
      vendor: this.meta.name,
      model_version: this.meta.version,
      seed,
      prompt_sha256: promptSha256(task.prompt),
      cost_usd: est,
      latency_ms: latency,
      completed_at: new Date().toISOString(),
      vendor_metadata: response.vendor_metadata,
    };
  }
}

async function withDeadline<T>(
  promise: Promise<T>,
  deadlineMs: number,
  taskId: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new AdapterError(
            `deadline ${deadlineMs}ms exceeded`,
            "DEADLINE_EXCEEDED",
            { task_id: taskId, deadline_ms: deadlineMs },
          ),
        ),
      deadlineMs,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
