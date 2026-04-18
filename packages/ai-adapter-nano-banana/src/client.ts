import type { GenerationTask } from "@geny/ai-adapter-core";

/**
 * nano-banana 벤더 HTTP API 의 최소 인터페이스.
 * Foundation 단계는 `MockNanoBananaClient` 로만 실제 호출되며 네트워크 Stub 는
 * 세션 23+ 에서 구현한다. HTTP 구현이 이 인터페이스를 구현하면 어댑터는 그대로 재사용.
 */
export interface NanoBananaClient {
  readonly modelVersion: string;
  readonly costPerCallUsd: number;
  invoke(request: NanoBananaRequest): Promise<NanoBananaResponse>;
  health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }>;
}

export interface NanoBananaRequest {
  task_id: string;
  slot_id: string;
  prompt: string;
  negative_prompt: string;
  size: [number, number];
  seed: number;
  reference_image_sha256: string | null;
  mask_sha256: string | null;
  style_reference_sha256: string[];
  style_profile_id: string | null;
  guidance_scale: number | null;
  strength: number | null;
  idempotency_key: string;
  deadline_ms: number;
}

export interface NanoBananaResponse {
  image_sha256: string;
  alpha_sha256: string | null;
  bbox: [number, number, number, number];
  latency_ms: number;
  vendor_metadata: Record<string, unknown>;
}

/**
 * 결정론적 Mock 클라이언트.
 *  · seed + prompt → image_sha256 = sha256("nano-banana:v0|<seed>|<prompt>")
 *    골든 테스트와 capability matrix 재현성 확보.
 *  · bbox 는 task.size 에 내접하는 중앙 정렬 박스 (size*0.9).
 *  · 요청별 latency_ms 는 seed 기반 (60–180ms).
 * 실제 HTTP 구현과 API 호환 — 테스트 전환은 생성자 주입으로만.
 */
export class MockNanoBananaClient implements NanoBananaClient {
  readonly modelVersion = "mock-2026.04.18";
  readonly costPerCallUsd = 0.015;

  async invoke(request: NanoBananaRequest): Promise<NanoBananaResponse> {
    const { createHash } = await import("node:crypto");
    const image = createHash("sha256")
      .update(`nano-banana:v0|${request.seed}|${request.prompt}|${request.slot_id}`)
      .digest("hex");
    const [w, h] = request.size;
    const bw = Math.round(w * 0.9);
    const bh = Math.round(h * 0.9);
    const bx = Math.round((w - bw) / 2);
    const by = Math.round((h - bh) / 2);
    const latency = 60 + (request.seed % 120);
    return {
      image_sha256: image,
      alpha_sha256: null,
      bbox: [bx, by, bw, bh],
      latency_ms: latency,
      vendor_metadata: {
        client: "mock",
        seed: request.seed,
        size: [w, h],
      },
    };
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; detail?: string }> {
    return { ok: true, latencyMs: 1, detail: "mock" };
  }
}

/**
 * GenerationTask → 벤더 요청 변환. 어댑터 본체에서 호출.
 */
export function toNanoBananaRequest(
  task: GenerationTask,
  seed: number,
): NanoBananaRequest {
  return {
    task_id: task.task_id,
    slot_id: task.slot_id,
    prompt: task.prompt,
    negative_prompt: task.negative_prompt,
    size: task.size,
    seed,
    reference_image_sha256: task.reference_image_sha256 ?? null,
    mask_sha256: task.mask_sha256 ?? null,
    style_reference_sha256: task.style_reference_sha256 ?? [],
    style_profile_id: task.style_profile_id ?? null,
    guidance_scale: task.guidance_scale ?? null,
    strength: task.strength ?? null,
    idempotency_key: task.idempotency_key,
    deadline_ms: task.deadline_ms,
  };
}
