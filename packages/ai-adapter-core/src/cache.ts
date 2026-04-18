/**
 * docs/05 §8.2 — 어댑터 결과 캐시.
 *
 * 캐시 키는 **결과에 영향을 미치는 모든 입력의 해시**:
 *   sha256(adapter_name | model_version | prompt_sha256 | negative_sha256 |
 *          reference_image_sha256 | mask_sha256 | style_refs | seed |
 *          size | guidance | strength | slot_id)
 *
 * prompt 는 해시로만 저장(원문 저장 없음) — provenance 와 동일 원칙.
 * 다음 단계에서 Redis/etcd 로 교체될 수 있도록 `AdapterCache` 인터페이스만 정의.
 */

import { createHash } from "node:crypto";

import type { GenerationResult, GenerationTask } from "./types.js";
import { promptSha256 } from "./deterministic-seed.js";

export interface AdapterCache {
  get(key: string): Promise<GenerationResult | null>;
  set(key: string, result: GenerationResult): Promise<void>;
}

export interface CacheKeyInput {
  adapterName: string;
  modelVersion: string;
  task: GenerationTask;
  seed: number;
}

/**
 * 결정론적 캐시 키. 같은 입력은 언제나 같은 key 를 낸다.
 * prompt 는 해시만 — 원문이 키에 노출되지 않음.
 */
export function buildCacheKey(input: CacheKeyInput): string {
  const { adapterName, modelVersion, task, seed } = input;
  const parts: string[] = [
    `adapter=${adapterName}`,
    `model=${modelVersion}`,
    `prompt=${promptSha256(task.prompt)}`,
    `negative=${task.negative_prompt ? promptSha256(task.negative_prompt) : ""}`,
    `ref=${task.reference_image_sha256 ?? ""}`,
    `mask=${task.mask_sha256 ?? ""}`,
    `style=${(task.style_reference_sha256 ?? []).slice().sort().join(",")}`,
    `profile=${task.style_profile_id ?? ""}`,
    `seed=${seed}`,
    `size=${task.size[0]}x${task.size[1]}`,
    `guidance=${task.guidance_scale ?? ""}`,
    `strength=${task.strength ?? ""}`,
    `slot=${task.slot_id}`,
  ];
  return createHash("sha256").update(parts.join("|"), "utf8").digest("hex");
}

/**
 * 단일 프로세스 메모리 캐시. TTL 지원(기본 무제한).
 * 프로덕션은 Redis 등 공유 스토리지로 교체.
 */
export class InMemoryAdapterCache implements AdapterCache {
  private readonly store = new Map<string, { result: GenerationResult; expiresAt: number }>();

  constructor(private readonly ttlMs: number = Number.POSITIVE_INFINITY) {}

  async get(key: string): Promise<GenerationResult | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.result;
  }

  async set(key: string, result: GenerationResult): Promise<void> {
    const expiresAt = this.ttlMs === Number.POSITIVE_INFINITY
      ? Number.POSITIVE_INFINITY
      : Date.now() + this.ttlMs;
    this.store.set(key, { result, expiresAt });
  }

  size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
