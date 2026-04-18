/**
 * docs/05 §2.2 — AI 어댑터 계약의 TypeScript 표현.
 *
 * 스키마 `schema/v1/ai-adapter-task.schema.json` · `ai-adapter-result.schema.json`
 * 이 권위 정의이며 이 파일은 런타임 사용 편의용 타입 미러다.
 * 스키마와 타입의 정합성은 validate-schemas 가 cross-check 한다.
 */

export type Capability = "edit" | "style_ref" | "mask" | "seg" | "kp" | "upscale" | "embed";

export type TaskPriority = "interactive" | "batch";

export interface GenerationTask {
  schema_version: "v1";
  task_id: string;
  slot_id: string;
  reference_image_sha256?: string | null;
  mask_sha256?: string | null;
  style_reference_sha256?: string[];
  style_profile_id?: string | null;
  prompt: string;
  negative_prompt: string;
  size: [number, number];
  seed?: number | null;
  guidance_scale?: number | null;
  strength?: number | null;
  deadline_ms: number;
  budget_usd: number;
  idempotency_key: string;
  capability_required?: Capability[];
  priority?: TaskPriority;
}

export interface GenerationResult {
  schema_version: "v1";
  task_id: string;
  slot_id: string;
  image_sha256: string;
  alpha_sha256?: string | null;
  bbox?: [number, number, number, number];
  vendor: string;
  model_version: string;
  seed: number;
  prompt_sha256: string;
  cost_usd: number;
  latency_ms: number;
  completed_at: string;
  vendor_metadata?: Record<string, unknown>;
  logs?: string[];
}

/**
 * 어댑터 카탈로그(`adapters.yaml` / `.json`) 엔트리.
 * docs/05 §12 의 "벤더 추가 가이드" 를 데이터로 표현.
 */
export interface AdapterMeta {
  name: string;
  version: string;
  capability: Capability[];
  cost_per_call_usd: number;
  max_parallel: number;
  routing_weight: number;
}

export interface AIAdapter {
  readonly meta: AdapterMeta;
  generate(task: GenerationTask): Promise<GenerationResult>;
  estimateCost(task: GenerationTask): number;
  probe(): Promise<ProbeReport>;
}

export interface ProbeReport {
  ok: boolean;
  latency_ms: number;
  checked_at: string;
  detail?: string;
}
