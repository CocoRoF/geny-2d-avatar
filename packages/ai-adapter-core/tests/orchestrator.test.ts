/**
 * orchestrate() 회귀 — catalog + factories + routeWithFallback + provenance(attempts).
 *
 * "end-to-end 한 건" 을 대표 경로로 박제한다:
 *   - happy: 1차 어댑터 성공 → attempts [ok]
 *   - fallback: 1차 5xx → 2차 성공 → attempts [fail, ok]
 *   - cache: 두 번째 호출은 어댑터 안 타고 provenance 에도 [ok 1 건]
 *   - 4xx: 즉시 throw (provenance 생성 안 됨)
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  AdapterError,
  InMemoryAdapterCache,
  entryToMeta,
  orchestrate,
  parseAdapterCatalog,
} from "../src/index.js";
import type {
  AIAdapter,
  AdapterCatalogEntry,
  AdapterFactory,
  GenerationResult,
  GenerationTask,
  ProbeReport,
} from "../src/index.js";

function catalog() {
  return parseAdapterCatalog({
    schema_version: "v1",
    adapters: [
      {
        name: "nano-banana",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.015,
        max_parallel: 8,
        routing_weight: 100,
      },
      {
        name: "sdxl",
        version: "0.1.0",
        capability: ["edit"],
        cost_per_call_usd: 0.022,
        max_parallel: 4,
        routing_weight: 80,
      },
    ],
  });
}

type Behaviour = "ok" | "5xx" | "4xx";

function factoryWithBehaviour(behaviour: Behaviour): AdapterFactory {
  return (entry: AdapterCatalogEntry): AIAdapter => ({
    meta: entryToMeta(entry),
    estimateCost: () => entry.cost_per_call_usd,
    async probe(): Promise<ProbeReport> {
      return { ok: true, latency_ms: 1, checked_at: "2026-04-18T00:00:00Z" };
    },
    async generate(task: GenerationTask): Promise<GenerationResult> {
      if (behaviour === "5xx") {
        throw new AdapterError(`${entry.name} 5xx`, "VENDOR_ERROR_5XX", {
          adapter: entry.name,
        });
      }
      if (behaviour === "4xx") {
        throw new AdapterError(`${entry.name} 4xx`, "VENDOR_ERROR_4XX", {
          adapter: entry.name,
        });
      }
      return {
        schema_version: "v1",
        task_id: task.task_id,
        slot_id: task.slot_id,
        image_sha256: "a".repeat(64),
        alpha_sha256: null,
        bbox: [0, 0, task.size[0], task.size[1]],
        vendor: entry.name,
        model_version: entry.version,
        seed: task.seed ?? 0,
        prompt_sha256: "b".repeat(64),
        cost_usd: entry.cost_per_call_usd,
        latency_ms: 5,
        completed_at: "2026-04-18T00:00:00Z",
      };
    },
  });
}

function baseTask(): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "task.orch.001",
    slot_id: "hair_front",
    prompt: "pink hair",
    negative_prompt: "",
    size: [1024, 1024],
    deadline_ms: 60000,
    budget_usd: 0.05,
    idempotency_key: "idem-orch-001",
    capability_required: ["edit"],
    seed: 42,
    reference_image_sha256: "f".repeat(64),
  };
}

test("orchestrate: 1차 어댑터 성공 → provenance.attempts 1건(ok) + vendor/seed 기록", async () => {
  const outcome = await orchestrate(baseTask(), {
    catalog: catalog(),
    factories: {
      "nano-banana": factoryWithBehaviour("ok"),
      sdxl: factoryWithBehaviour("ok"),
    },
  });
  assert.equal(outcome.primary, "nano-banana");
  assert.equal(outcome.used, "nano-banana");
  assert.equal(outcome.provenance.vendor, "nano-banana");
  assert.equal(outcome.provenance.seed, 42);
  assert.equal(outcome.provenance.source_asset_sha256, "f".repeat(64));
  assert.equal(outcome.provenance.attempts?.length, 1);
  assert.equal(outcome.provenance.attempts?.[0]!.ok, true);
  assert.equal(outcome.provenance.attempts?.[0]!.adapter, "nano-banana");
});

test("orchestrate: 1차 5xx → 2차 성공 → attempts [fail, ok], used=sdxl, primary=nano-banana", async () => {
  const outcome = await orchestrate(baseTask(), {
    catalog: catalog(),
    factories: {
      "nano-banana": factoryWithBehaviour("5xx"),
      sdxl: factoryWithBehaviour("ok"),
    },
  });
  assert.equal(outcome.primary, "nano-banana");
  assert.equal(outcome.used, "sdxl");
  assert.equal(outcome.provenance.vendor, "sdxl");
  const attempts = outcome.provenance.attempts ?? [];
  assert.equal(attempts.length, 2);
  assert.equal(attempts[0]!.adapter, "nano-banana");
  assert.equal(attempts[0]!.ok, false);
  assert.equal(attempts[0]!.error_code, "VENDOR_ERROR_5XX");
  assert.equal(attempts[1]!.adapter, "sdxl");
  assert.equal(attempts[1]!.ok, true);
});

test("orchestrate: 1차 4xx → 즉시 throw (fallback 금지)", async () => {
  await assert.rejects(
    orchestrate(baseTask(), {
      catalog: catalog(),
      factories: {
        "nano-banana": factoryWithBehaviour("4xx"),
        sdxl: factoryWithBehaviour("ok"),
      },
    }),
    (err: unknown) =>
      err instanceof AdapterError && err.code === "VENDOR_ERROR_4XX",
  );
});

test("orchestrate: 캐시 hit 시 attempts=[] + cached=true + provenance.vendor=cached.vendor", async () => {
  const cache = new InMemoryAdapterCache();
  const sharedCatalog = catalog();
  const factories = {
    "nano-banana": factoryWithBehaviour("ok"),
    sdxl: factoryWithBehaviour("ok"),
  };
  const first = await orchestrate(baseTask(), {
    catalog: sharedCatalog,
    factories,
    cache,
  });
  assert.equal(first.cached, false);

  const second = await orchestrate(baseTask(), {
    catalog: sharedCatalog,
    factories,
    cache,
  });
  assert.equal(second.cached, true);
  assert.equal(second.provenance.attempts?.length ?? 0, 0);
  // attempts 가 비어있으면 `attempts` 필드는 생략되는 것을 확인.
  assert.equal(second.provenance.attempts, undefined);
  assert.equal(second.provenance.vendor, first.used);
});

test("orchestrate: 모든 후보 5xx → 마지막 에러 throw (결과/provenance 반환 안 함)", async () => {
  await assert.rejects(
    orchestrate(baseTask(), {
      catalog: catalog(),
      factories: {
        "nano-banana": factoryWithBehaviour("5xx"),
        sdxl: factoryWithBehaviour("5xx"),
      },
    }),
    (err: unknown) =>
      err instanceof AdapterError && err.code === "VENDOR_ERROR_5XX",
  );
});

test("orchestrate: maxAttempts=1 → 폴백 금지 (5xx 에서 즉시 throw)", async () => {
  await assert.rejects(
    orchestrate(baseTask(), {
      catalog: catalog(),
      factories: {
        "nano-banana": factoryWithBehaviour("5xx"),
        sdxl: factoryWithBehaviour("ok"),
      },
      maxAttempts: 1,
    }),
    (err: unknown) => err instanceof AdapterError,
  );
});
