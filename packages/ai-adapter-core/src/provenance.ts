import type { FallbackAttemptTrace } from "./route-with-fallback.js";
import type { GenerationResult, GenerationTask } from "./types.js";

/**
 * provenance.schema.json `parts[]` 엔트리 중 `source_type: "ai_generated"` 한 건.
 * schema 의 additionalProperties=false 규약을 따른다. `attempts` 는 orchestrator 가
 * 기록한 폴백 트레이스(optional — preset/upload 출처에선 없음).
 */
export interface ProvenancePartAttempt {
  adapter: string;
  model_version: string;
  ok: boolean;
  error_code?: string;
  error_message?: string;
}

export interface ProvenancePartEntry {
  slot_id: string;
  source_type: "ai_generated";
  vendor: string;
  model_version: string;
  seed: number;
  prompt_sha256: string;
  source_asset_sha256: string | null;
  attempts?: ProvenancePartAttempt[];
}

export interface ProvenancePartOptions {
  /**
   * `routeWithFallback` 의 `attempts[]` (FallbackAttemptTrace). orchestrator 가 그대로 전달.
   * 생략하면 provenance 엔트리에도 `attempts` 필드가 포함되지 않는다(하위 호환).
   */
  attempts?: FallbackAttemptTrace[];
}

/**
 * GenerationTask + GenerationResult → provenance parts[] 엔트리.
 * 이 엔트리는 `@geny/license-verifier` 로 서명·검증 가능한 provenance 문서의
 * `parts[]` 에 그대로 삽입해야 한다.
 *
 * `source_asset_sha256` 는 task 의 reference_image_sha256 (없으면 null). 후처리에서
 * 원본 업로드 자산을 식별하는 용도.
 */
export function buildProvenancePartEntry(
  task: GenerationTask,
  result: GenerationResult,
  opts: ProvenancePartOptions = {},
): ProvenancePartEntry {
  if (task.slot_id !== result.slot_id) {
    throw new Error(
      `provenance: task.slot_id '${task.slot_id}' ≠ result.slot_id '${result.slot_id}'`,
    );
  }
  if (task.task_id !== result.task_id) {
    throw new Error(
      `provenance: task.task_id '${task.task_id}' ≠ result.task_id '${result.task_id}'`,
    );
  }
  const entry: ProvenancePartEntry = {
    slot_id: result.slot_id,
    source_type: "ai_generated",
    vendor: result.vendor,
    model_version: result.model_version,
    seed: result.seed,
    prompt_sha256: result.prompt_sha256,
    source_asset_sha256: task.reference_image_sha256 ?? null,
  };
  if (opts.attempts && opts.attempts.length > 0) {
    entry.attempts = opts.attempts.map(fromTrace);
  }
  return entry;
}

function fromTrace(trace: FallbackAttemptTrace): ProvenancePartAttempt {
  const out: ProvenancePartAttempt = {
    adapter: trace.adapter,
    model_version: trace.modelVersion,
    ok: trace.ok,
  };
  if (trace.errorCode) out.error_code = trace.errorCode;
  if (trace.errorMessage) out.error_message = truncate(trace.errorMessage, 512);
  return out;
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
