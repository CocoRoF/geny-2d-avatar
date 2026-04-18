/**
 * parseAdapterCatalog / buildRegistryFromCatalog 회귀 — docs/05 §12.6.
 *
 * 오류 케이스는 데이터 문제를 운영 시점이 아닌 부팅 시점에 멈추게 하는 것이 목적.
 * factory 는 "name → 어댑터 생성자" 맵으로 주입. 코드가 아닌 JSON 에 비밀/로직을 두지 않는다.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { test } from "node:test";

import {
  parseAdapterCatalog,
  buildRegistryFromCatalog,
  entryToMeta,
} from "../src/index.js";
import type {
  AIAdapter,
  AdapterCatalogEntry,
  AdapterFactory,
  GenerationResult,
  GenerationTask,
  ProbeReport,
} from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

function stubFactory(entry: AdapterCatalogEntry): AIAdapter {
  return {
    meta: entryToMeta(entry),
    estimateCost: () => entry.cost_per_call_usd,
    async probe(): Promise<ProbeReport> {
      return { ok: true, latency_ms: 1, checked_at: "2026-04-18T00:00:00Z" };
    },
    async generate(task: GenerationTask): Promise<GenerationResult> {
      return {
        schema_version: "v1",
        task_id: task.task_id,
        slot_id: task.slot_id,
        image_sha256: "0".repeat(64),
        alpha_sha256: null,
        bbox: [0, 0, task.size[0], task.size[1]],
        vendor: entry.name,
        model_version: entry.version,
        seed: task.seed ?? 0,
        prompt_sha256: "1".repeat(64),
        cost_usd: entry.cost_per_call_usd,
        latency_ms: 1,
        completed_at: "2026-04-18T00:00:00Z",
      };
    },
  };
}

test("parseAdapterCatalog: 정상 JSON → v1 엔트리 배열", () => {
  const json = {
    schema_version: "v1",
    adapters: [
      {
        name: "nano-banana",
        version: "0.1.0",
        capability: ["edit", "mask"],
        cost_per_call_usd: 0.015,
        max_parallel: 8,
        routing_weight: 100,
      },
    ],
  };
  const catalog = parseAdapterCatalog(json);
  assert.equal(catalog.adapters.length, 1);
  assert.equal(catalog.adapters[0]!.name, "nano-banana");
  assert.equal(catalog.adapters[0]!.enabled, true); // 기본 true
});

test("parseAdapterCatalog: schema_version 아니면 throw", () => {
  assert.throws(
    () =>
      parseAdapterCatalog({
        schema_version: "v2",
        adapters: [{}],
      }),
    /schema_version/,
  );
});

test("parseAdapterCatalog: 빈 adapters 배열 → throw", () => {
  assert.throws(
    () => parseAdapterCatalog({ schema_version: "v1", adapters: [] }),
    /non-empty/,
  );
});

test("parseAdapterCatalog: 중복 name@version → throw", () => {
  const entry = {
    name: "foo",
    version: "0.1.0",
    capability: ["edit"],
    cost_per_call_usd: 0.01,
    max_parallel: 1,
    routing_weight: 50,
  };
  assert.throws(
    () =>
      parseAdapterCatalog({
        schema_version: "v1",
        adapters: [entry, { ...entry }],
      }),
    /duplicate/,
  );
});

test("parseAdapterCatalog: 잘못된 capability → throw", () => {
  assert.throws(
    () =>
      parseAdapterCatalog({
        schema_version: "v1",
        adapters: [
          {
            name: "bad",
            version: "0.1.0",
            capability: ["dream"],
            cost_per_call_usd: 0.01,
            max_parallel: 1,
            routing_weight: 10,
          },
        ],
      }),
    /capability/,
  );
});

test("parseAdapterCatalog: canonical infra/adapters/adapters.json 파싱 성공", () => {
  // __dirname = .../ai-adapter-core/dist-test/tests → repo root = ../../../../
  const catalogPath = resolve(__dirname, "../../../../infra/adapters/adapters.json");
  const raw = JSON.parse(readFileSync(catalogPath, "utf-8"));
  const catalog = parseAdapterCatalog(raw);
  const names = catalog.adapters.map((a) => a.name);
  assert.deepEqual(names, ["nano-banana", "sdxl", "flux-fill"]);
  // routing_weight 가 내림차순으로 선언되어 있어야 라우터 의도가 명확
  const weights = catalog.adapters.map((a) => a.routing_weight);
  assert.deepEqual(weights, [...weights].sort((a, b) => b - a));
});

test("buildRegistryFromCatalog: enabled=true 만 등록", () => {
  const catalog = parseAdapterCatalog({
    schema_version: "v1",
    adapters: [
      {
        name: "alpha",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.01,
        max_parallel: 1,
        routing_weight: 100,
      },
      {
        name: "beta",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.01,
        max_parallel: 1,
        routing_weight: 50,
        enabled: false,
      },
    ],
  });
  const factories: Record<string, AdapterFactory> = {
    alpha: stubFactory,
    beta: stubFactory,
  };
  const registry = buildRegistryFromCatalog(catalog, factories);
  const names = registry.list().map((x) => x.meta.name);
  assert.deepEqual(names, ["alpha"]);
});

test("buildRegistryFromCatalog: factory 누락 → throw", () => {
  const catalog = parseAdapterCatalog({
    schema_version: "v1",
    adapters: [
      {
        name: "ghost",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.01,
        max_parallel: 1,
        routing_weight: 10,
      },
    ],
  });
  assert.throws(() => buildRegistryFromCatalog(catalog, {}), /factory/);
});

test("buildRegistryFromCatalog: factory 가 다른 meta 를 돌려주면 throw", () => {
  const catalog = parseAdapterCatalog({
    schema_version: "v1",
    adapters: [
      {
        name: "claimed",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.01,
        max_parallel: 1,
        routing_weight: 10,
      },
    ],
  });
  const wrong: AdapterFactory = (entry) => {
    const base = stubFactory(entry);
    return {
      ...base,
      meta: { ...base.meta, name: "impostor" },
    };
  };
  assert.throws(
    () => buildRegistryFromCatalog(catalog, { claimed: wrong }),
    /factory for "claimed"/,
  );
});
