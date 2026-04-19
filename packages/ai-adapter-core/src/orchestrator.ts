/**
 * docs/05 §7 + §12.6 — AI 어댑터 오케스트레이터 진입점.
 *
 * 한 GenerationTask 를 받아서 (catalog + factories) 를 이용해 registry 를 구성하고,
 * `routeWithFallback` 으로 실행한 뒤, 결과와 함께 provenance `parts[]` 엔트리
 * (`attempts[]` 포함) 를 반환한다. 상위 호출자(worker/editor/CLI)가 provenance 스키마에
 * 그대로 삽입 → `@geny/license-verifier` 로 서명·검증 가능.
 *
 * 이 함수는 동일한 task 에 대해 결정론적이어야 한다. routeWithFallback 이 seed 와
 * 라우팅 순서를 고정하므로, 카탈로그 엔트리 순서가 고정되어 있고 factory 가 동일 어댑터
 * 객체를 돌려주면 결과는 동일하다.
 */
import { AdapterRegistry } from "./registry.js";
import { routeWithFallback } from "./route-with-fallback.js";
import type {
  FallbackAttemptTrace,
  RouteWithFallbackOptions,
  RouteWithFallbackOutcome,
} from "./route-with-fallback.js";
import { buildProvenancePartEntry } from "./provenance.js";
import type { ProvenancePartEntry } from "./provenance.js";
import type {
  AdapterCatalog,
  AdapterFactory,
} from "./catalog.js";
import { buildRegistryFromCatalog } from "./catalog.js";
import type { GenerationTask } from "./types.js";

export interface OrchestrateOptions extends RouteWithFallbackOptions {
  catalog: AdapterCatalog;
  factories: Record<string, AdapterFactory>;
  /** 미리 만들어둔 레지스트리를 재사용하고 싶을 때 주입. 카탈로그는 메타 추적 용도로 여전히 필요. */
  registry?: AdapterRegistry;
}

export interface OrchestrateOutcome extends RouteWithFallbackOutcome {
  /**
   * provenance.schema.json `parts[]` 에 삽입할 한 건. `attempts[]` 는 orchestrator 가
   * routeWithFallback 의 트레이스를 그대로 옮긴 것 — 최종 성공한 어댑터는 `ok=true`
   * 엔트리 중 마지막 항목이다. 실패만 있는 경우는 호출자가 아예 이 outcome 을 받기 전에
   * throw 된다.
   */
  provenance: ProvenancePartEntry;
}

export async function orchestrate(
  task: GenerationTask,
  opts: OrchestrateOptions,
): Promise<OrchestrateOutcome> {
  const registry = opts.registry ?? buildRegistryFromCatalog(opts.catalog, opts.factories);
  const routeOpts: RouteWithFallbackOptions = {};
  if (opts.cache) routeOpts.cache = opts.cache;
  if (opts.safety) routeOpts.safety = opts.safety;
  if (opts.maxAttempts !== undefined) routeOpts.maxAttempts = opts.maxAttempts;
  if (opts.metrics) routeOpts.metrics = opts.metrics;
  if (opts.stage !== undefined) routeOpts.stage = opts.stage;
  if (opts.now) routeOpts.now = opts.now;

  const outcome = await routeWithFallback(registry, task, routeOpts);
  const provenance = buildProvenancePartEntry(task, outcome.result, {
    attempts: outcome.attempts,
  });
  return { ...outcome, provenance };
}

export type { FallbackAttemptTrace };
