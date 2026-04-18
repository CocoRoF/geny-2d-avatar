/**
 * FluxFillAdapter (skeleton) — docs/05 §2.3 mask 폴백.
 *
 * nano-banana 가 mask 작업에서 실패했을 때 유일한 마스크 지원 폴백. SDXL 은 mask 를
 * 지원하지 않으므로, mask capability 요구 시 라우터는 nano-banana → flux-fill 로만
 * 내려간다. routing_weight 는 nano-banana(100) 보다 낮은 70.
 *
 * Foundation 단계는 `FluxFillMockClient` 로만 검증 — 실제 HTTP 는 세션 26+.
 */
import { type AIAdapter, type AdapterMeta, type GenerationResult, type GenerationTask, type ProbeReport } from "@geny/ai-adapter-core";
export interface FluxFillClient {
    readonly modelVersion: string;
    readonly costPerCallUsd: number;
    invoke(req: FluxFillRequest): Promise<FluxFillResponse>;
    health(): Promise<{
        ok: boolean;
        latencyMs: number;
        detail?: string;
    }>;
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
export declare class FluxFillMockClient implements FluxFillClient {
    readonly modelVersion = "flux-fill-1.0-mock";
    readonly costPerCallUsd = 0.012;
    invoke(req: FluxFillRequest): Promise<FluxFillResponse>;
    health(): Promise<{
        ok: boolean;
        latencyMs: number;
        detail?: string;
    }>;
}
export interface FluxFillAdapterOptions {
    client?: FluxFillClient;
    routingWeight?: number;
    maxParallel?: number;
}
export declare class FluxFillAdapter implements AIAdapter {
    readonly meta: AdapterMeta;
    private readonly client;
    constructor(opts?: FluxFillAdapterOptions);
    estimateCost(task: GenerationTask): number;
    probe(): Promise<ProbeReport>;
    generate(task: GenerationTask): Promise<GenerationResult>;
}
//# sourceMappingURL=flux-fill-adapter.d.ts.map