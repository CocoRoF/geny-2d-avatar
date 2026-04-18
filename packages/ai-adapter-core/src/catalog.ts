/**
 * docs/05 §12.6 — 어댑터 카탈로그 로더.
 *
 * 카탈로그 JSON(`infra/adapters/adapters.json`) 은 "무엇을 등록할지" 를 데이터로 선언한다.
 * 런타임 factory(실제 HTTP 클라이언트/Mock/SDK 구현) 는 코드에서 주입 — 비밀/로직은
 * 스키마에 담지 않는다는 ADR 0002 의 연장.
 *
 *   parseAdapterCatalog(json)            → `AdapterCatalogEntry[]`
 *   buildRegistryFromCatalog(entries, factories) → `AdapterRegistry`
 *
 * `enabled: false` 엔트리는 파싱은 되지만 등록에서 제외(A/B 토글). factories 맵에 없는
 * 어댑터를 활성화 상태로 남기면 즉시 throw — "카탈로그에 있는데 팩토리가 없다" 는 배포
 * 실수를 조기에 잡는다.
 */
import { AdapterRegistry } from "./registry.js";
import type { AIAdapter, AdapterMeta, Capability } from "./types.js";

export interface AdapterCatalogConfig {
  endpoint?: string;
  api_key_env?: string;
  model?: string;
  timeout_ms?: number;
}

export interface AdapterCatalogEntry {
  name: string;
  version: string;
  capability: Capability[];
  cost_per_call_usd: number;
  max_parallel: number;
  routing_weight: number;
  config?: AdapterCatalogConfig;
  enabled: boolean;
}

export interface AdapterCatalog {
  schema_version: "v1";
  adapters: AdapterCatalogEntry[];
}

export type AdapterFactory = (entry: AdapterCatalogEntry) => AIAdapter;

export function parseAdapterCatalog(raw: unknown): AdapterCatalog {
  if (!isRecord(raw)) {
    throw new Error("adapter-catalog: root must be an object");
  }
  if (raw["schema_version"] !== "v1") {
    throw new Error(
      `adapter-catalog: schema_version must be "v1" (got ${String(raw["schema_version"])})`,
    );
  }
  const adaptersRaw = raw["adapters"];
  if (!Array.isArray(adaptersRaw) || adaptersRaw.length === 0) {
    throw new Error("adapter-catalog: `adapters` must be a non-empty array");
  }
  const seen = new Set<string>();
  const adapters: AdapterCatalogEntry[] = adaptersRaw.map((entry, i) => {
    const parsed = parseEntry(entry, i);
    const key = `${parsed.name}@${parsed.version}`;
    if (seen.has(key)) {
      throw new Error(`adapter-catalog: duplicate entry ${key}`);
    }
    seen.add(key);
    return parsed;
  });
  return { schema_version: "v1", adapters };
}

export function buildRegistryFromCatalog(
  catalog: AdapterCatalog,
  factories: Record<string, AdapterFactory>,
): AdapterRegistry {
  const registry = new AdapterRegistry();
  for (const entry of catalog.adapters) {
    if (!entry.enabled) continue;
    const factory = factories[entry.name];
    if (!factory) {
      throw new Error(
        `adapter-catalog: no factory registered for "${entry.name}" — pass it in the factories map or mark the entry enabled=false`,
      );
    }
    const adapter = factory(entry);
    if (adapter.meta.name !== entry.name || adapter.meta.version !== entry.version) {
      throw new Error(
        `adapter-catalog: factory for "${entry.name}" returned adapter with meta ` +
          `${adapter.meta.name}@${adapter.meta.version} (expected ${entry.name}@${entry.version})`,
      );
    }
    registry.register(adapter);
  }
  return registry;
}

export function entryToMeta(entry: AdapterCatalogEntry): AdapterMeta {
  return {
    name: entry.name,
    version: entry.version,
    capability: [...entry.capability],
    cost_per_call_usd: entry.cost_per_call_usd,
    max_parallel: entry.max_parallel,
    routing_weight: entry.routing_weight,
  };
}

function parseEntry(raw: unknown, idx: number): AdapterCatalogEntry {
  if (!isRecord(raw)) {
    throw new Error(`adapter-catalog[${idx}]: entry must be an object`);
  }
  const name = raw["name"];
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]{1,63}$/.test(name)) {
    throw new Error(`adapter-catalog[${idx}]: invalid name`);
  }
  const version = raw["version"];
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`adapter-catalog[${idx}]: invalid version`);
  }
  const capabilityRaw = raw["capability"];
  if (!Array.isArray(capabilityRaw) || capabilityRaw.length === 0) {
    throw new Error(`adapter-catalog[${idx}]: capability must be non-empty array`);
  }
  const allowed: Capability[] = ["edit", "style_ref", "mask", "seg", "kp", "upscale", "embed"];
  const capability: Capability[] = capabilityRaw.map((c, i) => {
    if (typeof c !== "string" || !(allowed as string[]).includes(c)) {
      throw new Error(`adapter-catalog[${idx}].capability[${i}]: unknown ${String(c)}`);
    }
    return c as Capability;
  });
  const cost = raw["cost_per_call_usd"];
  if (typeof cost !== "number" || !(cost >= 0)) {
    throw new Error(`adapter-catalog[${idx}]: cost_per_call_usd must be ≥ 0`);
  }
  const maxParallel = raw["max_parallel"];
  if (!Number.isInteger(maxParallel) || (maxParallel as number) < 1 || (maxParallel as number) > 64) {
    throw new Error(`adapter-catalog[${idx}]: max_parallel must be integer in [1,64]`);
  }
  const weight = raw["routing_weight"];
  if (typeof weight !== "number" || weight < 0 || weight > 1000) {
    throw new Error(`adapter-catalog[${idx}]: routing_weight must be in [0,1000]`);
  }
  const enabledRaw = raw["enabled"];
  const enabled = enabledRaw === undefined ? true : Boolean(enabledRaw);

  const configRaw = raw["config"];
  let config: AdapterCatalogConfig | undefined;
  if (configRaw !== undefined) {
    if (!isRecord(configRaw)) {
      throw new Error(`adapter-catalog[${idx}].config must be object`);
    }
    config = {};
    if (typeof configRaw["endpoint"] === "string") config.endpoint = configRaw["endpoint"];
    if (typeof configRaw["api_key_env"] === "string") config.api_key_env = configRaw["api_key_env"];
    if (typeof configRaw["model"] === "string") config.model = configRaw["model"];
    if (typeof configRaw["timeout_ms"] === "number") config.timeout_ms = configRaw["timeout_ms"];
  }

  const entry: AdapterCatalogEntry = {
    name,
    version,
    capability,
    cost_per_call_usd: cost,
    max_parallel: maxParallel as number,
    routing_weight: weight,
    enabled,
  };
  if (config !== undefined) entry.config = config;
  return entry;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}
