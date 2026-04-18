import type { GenerationResult, GenerationTask } from "./types.js";

/**
 * provenance.schema.json `parts[]` 엔트리 중 `source_type: "ai_generated"` 한 건.
 * schema 의 additionalProperties=false 규약을 따른다.
 */
export interface ProvenancePartEntry {
  slot_id: string;
  source_type: "ai_generated";
  vendor: string;
  model_version: string;
  seed: number;
  prompt_sha256: string;
  source_asset_sha256: string | null;
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
  return {
    slot_id: result.slot_id,
    source_type: "ai_generated",
    vendor: result.vendor,
    model_version: result.model_version,
    seed: result.seed,
    prompt_sha256: result.prompt_sha256,
    source_asset_sha256: task.reference_image_sha256 ?? null,
  };
}
