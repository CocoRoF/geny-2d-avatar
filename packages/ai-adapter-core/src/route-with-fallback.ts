/**
 * docs/05 §8.1 — `routeWithFallback(registry, task, opts)` 헬퍼.
 *
 * 입력
 *   registry    : 등록된 AdapterRegistry (route() 가 deterministic 후보 리스트를 줌)
 *   task        : GenerationTask
 *   opts.cache  : (옵션) 캐시 hit 시 어댑터 호출 없이 즉시 반환
 *   opts.safety : (옵션) 생성 결과에 대한 안전성 필터
 *   opts.maxAttempts : (옵션) 최대 폴백 시도 수 (기본 = 후보 수)
 *
 * 동작 순서
 *   1. registry.route(task) — 폴백 순서 후보 확보
 *   2. opts.cache 가 주어지면 `buildCacheKey(primary)` 로 lookup.
 *      hit → 그 결과 즉시 반환 (primary seed 기준 key)
 *   3. 후보를 순서대로 시도:
 *      - AdapterError(retryable=true) → 다음 후보
 *      - AdapterError(retryable=false, code ≠ UNSAFE_CONTENT) → 즉시 throw (client-side 오류는
 *        다른 벤더도 같은 입력을 같은 방식으로 거부할 것)
 *      - safety.check(result) 가 allowed=false 면 UNSAFE_CONTENT 로 기록 후 다음 후보
 *      - 비(非) AdapterError → 5xx 등가로 간주 후 다음 후보
 *   4. 성공한 어댑터의 결과를 캐시에 저장(있으면) 후 반환.
 *   5. 모든 후보 실패 시, 마지막 에러를 다시 throw (원인 보존).
 *
 * 주의
 *   - 캐시 키는 **primary 후보의 meta.name + model_version** 으로 잠긴다. 폴백이 일어나면
 *     다른 벤더가 답했지만 저장되는 키는 primary 기준 — "같은 task 의 재시도는 같은 결과" 를
 *     원하기 때문. 다른 벤더 결과는 provenance 의 `vendor` 필드로 추적하면 됨.
 *   - 4xx/CAPABILITY_MISMATCH/BUDGET_EXCEEDED/INVALID_OUTPUT/NO_ELIGIBLE_ADAPTER 는 fallback
 *     하지 않음. 4xx 는 입력이 잘못된 것이므로 벤더를 바꿔도 의미 없음 (docs/05 §12.3).
 */

import { AdapterError } from "./errors.js";
import { buildCacheKey, type AdapterCache } from "./cache.js";
import { deterministicSeed } from "./deterministic-seed.js";
import type { SafetyFilter } from "./safety.js";
import type { AIAdapter, GenerationResult, GenerationTask } from "./types.js";
import type { AdapterRegistry } from "./registry.js";

export interface RouteWithFallbackOptions {
  cache?: AdapterCache;
  safety?: SafetyFilter;
  maxAttempts?: number;
}

export interface FallbackAttemptTrace {
  adapter: string;
  modelVersion: string;
  ok: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface RouteWithFallbackOutcome {
  result: GenerationResult;
  primary: string;
  used: string;
  attempts: FallbackAttemptTrace[];
  cached: boolean;
}

/**
 * docs/05 §12.3 — fallback 을 허용하는 에러 코드 화이트리스트.
 * AdapterError.retryable 은 5xx / DEADLINE / PROBE_FAILED 만 허용. 여기에 UNSAFE_CONTENT 를
 * 추가 — 다른 벤더가 안전한 결과를 낼 가능성이 있음.
 */
function shouldFallback(err: unknown): boolean {
  if (err instanceof AdapterError) {
    if (err.retryable) return true;
    if (err.code === "UNSAFE_CONTENT") return true;
    return false;
  }
  // Non-AdapterError (네트워크 실패 등) 는 5xx 와 같이 취급 — 폴백 허용.
  return true;
}

export async function routeWithFallback(
  registry: AdapterRegistry,
  task: GenerationTask,
  opts: RouteWithFallbackOptions = {},
): Promise<RouteWithFallbackOutcome> {
  const candidates = registry.route(task);
  if (candidates.length === 0) {
    throw new AdapterError("routeWithFallback: no candidates", "NO_ELIGIBLE_ADAPTER", {
      task_id: task.task_id,
    });
  }
  const primary = candidates[0] as AIAdapter;
  const seed = task.seed ?? deterministicSeed(task.idempotency_key);

  // 2. 캐시 lookup (primary 키 기준)
  if (opts.cache) {
    const key = buildCacheKey({
      adapterName: primary.meta.name,
      modelVersion: primary.meta.version,
      task,
      seed,
    });
    const cached = await opts.cache.get(key);
    if (cached) {
      return {
        result: cached,
        primary: primary.meta.name,
        used: cached.vendor,
        attempts: [],
        cached: true,
      };
    }
  }

  const limit = Math.min(
    opts.maxAttempts ?? candidates.length,
    candidates.length,
  );
  const attempts: FallbackAttemptTrace[] = [];
  let lastError: unknown = null;

  for (let i = 0; i < limit; i++) {
    const adapter = candidates[i] as AIAdapter;
    try {
      const result = await adapter.generate(task);
      if (opts.safety) {
        const verdict = await opts.safety.check(result, task);
        if (!verdict.allowed) {
          const err = new AdapterError(
            `safety filter blocked ${adapter.meta.name} result: ${verdict.reason ?? "no reason"}`,
            "UNSAFE_CONTENT",
            {
              task_id: task.task_id,
              adapter: adapter.meta.name,
              categories: verdict.categories ?? [],
            },
          );
          attempts.push({
            adapter: adapter.meta.name,
            modelVersion: adapter.meta.version,
            ok: false,
            errorCode: err.code,
            errorMessage: err.message,
          });
          lastError = err;
          continue;
        }
      }
      attempts.push({
        adapter: adapter.meta.name,
        modelVersion: adapter.meta.version,
        ok: true,
      });
      if (opts.cache) {
        const key = buildCacheKey({
          adapterName: primary.meta.name,
          modelVersion: primary.meta.version,
          task,
          seed,
        });
        await opts.cache.set(key, result);
      }
      return {
        result,
        primary: primary.meta.name,
        used: adapter.meta.name,
        attempts,
        cached: false,
      };
    } catch (err) {
      const code = err instanceof AdapterError ? err.code : "VENDOR_ERROR_5XX";
      attempts.push({
        adapter: adapter.meta.name,
        modelVersion: adapter.meta.version,
        ok: false,
        errorCode: code,
        errorMessage: (err as Error).message,
      });
      lastError = err;
      if (!shouldFallback(err)) {
        throw err;
      }
      // 다음 후보로 계속
    }
  }

  // 모든 후보 실패
  if (lastError instanceof AdapterError) throw lastError;
  throw new AdapterError(
    `routeWithFallback: all ${attempts.length} candidates failed`,
    "VENDOR_ERROR_5XX",
    {
      task_id: task.task_id,
      attempts,
      cause: lastError instanceof Error ? lastError.message : String(lastError),
    },
  );
}
