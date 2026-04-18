import { AdapterError } from "./errors.js";
import type { AIAdapter, Capability, GenerationTask } from "./types.js";

/**
 * docs/05 §8 AdapterRouter 의 최소 구현.
 *
 *   - capability 일치 + 어댑터 meta.capability ⊇ task.capability_required
 *   - estimateCost ≤ task.budget_usd
 *   - 정렬 키: (routing_weight desc, estimate_cost asc, name asc) — deterministic.
 *
 * 실제 프로덕션 라우팅(벤더 헬스, 사용자 등급, 쿼터) 은 세션 23+ 에서 확장한다.
 * Foundation 단계는 "capability + budget + deterministic" 만으로 충분.
 */
export class AdapterRegistry {
  private readonly adapters = new Map<string, AIAdapter>();

  register(adapter: AIAdapter): void {
    const key = `${adapter.meta.name}@${adapter.meta.version}`;
    if (this.adapters.has(key)) {
      throw new Error(`AdapterRegistry: duplicate ${key}`);
    }
    this.adapters.set(key, adapter);
  }

  list(): AIAdapter[] {
    return [...this.adapters.values()];
  }

  /**
   * 주어진 Task 를 처리할 수 있는 어댑터 목록을 routing_weight desc 로 반환.
   * 비어있으면 NO_ELIGIBLE_ADAPTER.
   */
  route(task: GenerationTask): AIAdapter[] {
    const required = new Set(task.capability_required ?? []);
    const eligible: Array<{ adapter: AIAdapter; cost: number }> = [];
    for (const adapter of this.adapters.values()) {
      if (!hasAll(adapter.meta.capability, required)) continue;
      const cost = adapter.estimateCost(task);
      if (cost > task.budget_usd) continue;
      eligible.push({ adapter, cost });
    }
    if (eligible.length === 0) {
      throw new AdapterError(
        `no adapter matches capability=[${[...required].join(",")}] under budget=$${task.budget_usd}`,
        "NO_ELIGIBLE_ADAPTER",
        { task_id: task.task_id, slot_id: task.slot_id },
      );
    }
    eligible.sort((a, b) => {
      const w = b.adapter.meta.routing_weight - a.adapter.meta.routing_weight;
      if (w !== 0) return w;
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.adapter.meta.name.localeCompare(b.adapter.meta.name);
    });
    return eligible.map((e) => e.adapter);
  }
}

function hasAll(have: Capability[], need: Set<Capability>): boolean {
  const set = new Set(have);
  for (const cap of need) if (!set.has(cap)) return false;
  return true;
}
