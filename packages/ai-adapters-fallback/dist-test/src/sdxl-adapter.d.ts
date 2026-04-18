/**
 * SDXLAdapter (skeleton) — docs/05 §2.3 edit/style_ref 폴백.
 *
 * nano-banana 가 5xx/DEADLINE 으로 실패하면 라우터가 다음 후보로 내려간다. SDXL 은
 * mask 파이프라인을 지원하지 않으므로 capability 는 {edit, style_ref}. routing_weight
 * 는 nano-banana(100) 보다 낮은 80 — "동등 capability 면 nano 우선".
 *
 * Foundation 단계는 `SDXLMockClient` 로만 검증 — 실제 HTTP 는 세션 26+.
 */
import { type AIAdapter, type AdapterMeta, type GenerationResult, type GenerationTask, type ProbeReport } from "@geny/ai-adapter-core";
export interface SDXLClient {
    readonly modelVersion: string;
    readonly costPerCallUsd: number;
    invoke(req: SDXLRequest): Promise<SDXLResponse>;
    health(): Promise<{
        ok: boolean;
        latencyMs: number;
        detail?: string;
    }>;
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
export declare class SDXLMockClient implements SDXLClient {
    readonly modelVersion = "sdxl-1.0-mock";
    readonly costPerCallUsd = 0.008;
    invoke(req: SDXLRequest): Promise<SDXLResponse>;
    health(): Promise<{
        ok: boolean;
        latencyMs: number;
        detail?: string;
    }>;
}
export interface SDXLAdapterOptions {
    client?: SDXLClient;
    routingWeight?: number;
    maxParallel?: number;
}
export declare class SDXLAdapter implements AIAdapter {
    readonly meta: AdapterMeta;
    private readonly client;
    constructor(opts?: SDXLAdapterOptions);
    estimateCost(task: GenerationTask): number;
    probe(): Promise<ProbeReport>;
    generate(task: GenerationTask): Promise<GenerationResult>;
}
//# sourceMappingURL=sdxl-adapter.d.ts.map