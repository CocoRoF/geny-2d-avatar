#!/usr/bin/env node
/**
 * Mock vendor HTTP server 회귀 — 세션 82.
 *
 * 계약 커버리지:
 *  - 3 엔드포인트(generate/edit/fill) 모두 동일 response shape 반환.
 *  - `/v1/health` OK.
 *  - Authorization 누락/빈값 → 401.
 *  - non-JSON body → 400.
 *  - task_id / size 누락 → 400.
 *  - 결정론: 동일 task_id+seed → 동일 image_sha256.
 *  - 엔드포인트별 image_sha256 구분 (같은 task_id 라도 kind 가 달라 다른 hex).
 *  - latency_ms 는 실 sleep 시간 반영 (클라이언트 duration 과 교차검증 가능).
 *  - fail-rate 1.0 → 항상 500, 0 → 항상 200.
 *  - unknown 엔드포인트 → 404.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe } from "node:test";
import { createMockVendorServer, parseArgv } from "./mock-vendor-server.mjs";

let passed = 0;
let failed = 0;

function check(name, fn) {
  return fn()
    .then(() => { process.stdout.write(`  ✓ ${name}\n`); passed += 1; })
    .catch((err) => { process.stdout.write(`  ✖ ${name}\n    ${err?.stack ?? err}\n`); failed += 1; });
}

async function withServer(opts, fn) {
  const server = createMockVendorServer(opts);
  const port = await new Promise((resolveFn, rejectFn) => {
    server.on("error", rejectFn);
    server.listen(0, () => {
      const addr = server.address();
      resolveFn(typeof addr === "object" && addr ? addr.port : 0);
    });
  });
  try {
    await fn(`http://localhost:${port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}

async function run() {
  process.stdout.write("[mock-vendor-test] start\n");

  await check("health returns ok:true", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/health`);
      assert.equal(r.status, 200);
      const body = await r.json();
      assert.equal(body.ok, true);
      assert.equal(typeof body.latency_ms, "number");
    });
  });

  await check("generate returns deterministic image_sha256", async () => {
    await withServer({}, async (base) => {
      const body = { task_id: "t1", seed: 42, size: { width: 512, height: 768 } };
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200);
      const parsed = await r.json();
      const expected = createHash("sha256")
        .update("t1").update("|").update("42").update("|").update("nano-banana")
        .digest("hex");
      assert.equal(parsed.image_sha256, expected);
      assert.deepEqual(parsed.bbox, [0, 0, 512, 768]);
      assert.equal(typeof parsed.latency_ms, "number");
      assert.equal(parsed.vendor_metadata.kind, "nano-banana");
    });
  });

  await check("edit + fill differ in image_sha256 for same task_id", async () => {
    await withServer({}, async (base) => {
      const body = { task_id: "t1", seed: 42, size: { width: 256, height: 256 } };
      const mk = async (path) => {
        const r = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer x" },
          body: JSON.stringify(body),
        });
        assert.equal(r.status, 200, `${path} status`);
        return (await r.json()).image_sha256;
      };
      const gen = await mk("/v1/generate");
      const edit = await mk("/v1/edit");
      const fill = await mk("/v1/fill");
      assert.notEqual(gen, edit);
      assert.notEqual(edit, fill);
      assert.notEqual(gen, fill);
    });
  });

  await check("missing Authorization → 401", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task_id: "t", size: { width: 1, height: 1 } }),
      });
      assert.equal(r.status, 401);
    });
  });

  await check("malformed Authorization (Bearer without token) → 401", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer " },
        body: JSON.stringify({ task_id: "t", size: { width: 1, height: 1 } }),
      });
      assert.equal(r.status, 401);
    });
  });

  await check("non-JSON body → 400", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: "not json",
      });
      assert.equal(r.status, 400);
    });
  });

  await check("missing task_id → 400", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: JSON.stringify({ size: { width: 1, height: 1 } }),
      });
      assert.equal(r.status, 400);
    });
  });

  await check("missing size → 400", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: JSON.stringify({ task_id: "t" }),
      });
      assert.equal(r.status, 400);
    });
  });

  await check("unknown endpoint → 404", async () => {
    await withServer({}, async (base) => {
      const r = await fetch(`${base}/v1/unknown`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: JSON.stringify({ task_id: "t", size: { width: 1, height: 1 } }),
      });
      assert.equal(r.status, 404);
    });
  });

  await check("latency-mean=30ms → response latency_ms ≈ 30 (±jitter)", async () => {
    await withServer({ latencyMeanMs: 30, latencyJitterMs: 5, seed: 7 }, async (base) => {
      const body = { task_id: "t1", seed: 1, size: { width: 1, height: 1 } };
      const r = await fetch(`${base}/v1/generate`, {
        method: "POST",
        headers: { "content-type": "application/json", "authorization": "Bearer x" },
        body: JSON.stringify(body),
      });
      assert.equal(r.status, 200);
      const parsed = await r.json();
      assert.ok(parsed.latency_ms >= 25 && parsed.latency_ms <= 35,
        `latency_ms=${parsed.latency_ms} out of [25,35]`);
    });
  });

  await check("fail-rate=1.0 → 500 on every call", async () => {
    await withServer({ failRate: 1.0 }, async (base) => {
      const body = { task_id: "t", seed: 1, size: { width: 1, height: 1 } };
      for (let i = 0; i < 3; i += 1) {
        const r = await fetch(`${base}/v1/generate`, {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer x" },
          body: JSON.stringify(body),
        });
        assert.equal(r.status, 500);
      }
    });
  });

  await check("fail-rate=0 → 200 on every call", async () => {
    await withServer({ failRate: 0 }, async (base) => {
      const body = { task_id: "t", seed: 1, size: { width: 1, height: 1 } };
      for (let i = 0; i < 3; i += 1) {
        const r = await fetch(`${base}/v1/generate`, {
          method: "POST",
          headers: { "content-type": "application/json", "authorization": "Bearer x" },
          body: JSON.stringify(body),
        });
        assert.equal(r.status, 200);
      }
    });
  });

  await check("per-endpoint fail-rate: generate=1.0 → 500, edit=0 → 200 (세션 84)", async () => {
    await withServer({ failRateGenerate: 1.0, failRateEdit: 0, failRateFill: 0 }, async (base) => {
      const body = { task_id: "t", seed: 1, size: { width: 1, height: 1 } };
      const headers = { "content-type": "application/json", "authorization": "Bearer x" };
      for (let i = 0; i < 3; i += 1) {
        const rGen = await fetch(`${base}/v1/generate`, {
          method: "POST", headers, body: JSON.stringify(body),
        });
        assert.equal(rGen.status, 500);
        const rEdit = await fetch(`${base}/v1/edit`, {
          method: "POST", headers, body: JSON.stringify(body),
        });
        assert.equal(rEdit.status, 200);
      }
    });
  });

  await check("per-endpoint fail-rate: undefined → inherits global fail-rate", async () => {
    // failRate=1 전역 + failRateEdit=0 override → generate/fill=500, edit=200
    await withServer({ failRate: 1, failRateEdit: 0 }, async (base) => {
      const body = { task_id: "t", seed: 1, size: { width: 1, height: 1 } };
      const headers = { "content-type": "application/json", "authorization": "Bearer x" };
      const rGen = await fetch(`${base}/v1/generate`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      assert.equal(rGen.status, 500);
      const rEdit = await fetch(`${base}/v1/edit`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      assert.equal(rEdit.status, 200);
      const rFill = await fetch(`${base}/v1/fill`, {
        method: "POST", headers, body: JSON.stringify(body),
      });
      assert.equal(rFill.status, 500);
    });
  });

  await check("parseArgv accepts all flags + rejects unknown", async () => {
    const ok = parseArgv(["--port", "0", "--latency-mean-ms", "10", "--latency-jitter-ms", "2",
      "--fail-rate", "0.1", "--fail-rate-generate", "1", "--fail-rate-edit", "0.2",
      "--fail-rate-fill", "0.3", "--seed", "99"]);
    assert.equal(ok.port, 0);
    assert.equal(ok.latencyMeanMs, 10);
    assert.equal(ok.latencyJitterMs, 2);
    assert.equal(ok.failRate, 0.1);
    assert.equal(ok.failRateGenerate, 1);
    assert.equal(ok.failRateEdit, 0.2);
    assert.equal(ok.failRateFill, 0.3);
    assert.equal(ok.seed, 99);
    assert.throws(() => parseArgv(["--bogus", "1"]), /unknown arg: --bogus/);
    return Promise.resolve();
  });

  process.stdout.write(`\n[mock-vendor-test] passed=${passed} failed=${failed}\n`);
  if (failed > 0) process.exit(1);
}

// describe 는 node --test 스타일에서 로드될 때만 쓰이고, 기본은 main 엔트리.
void describe;

run().catch((err) => {
  process.stderr.write(`[mock-vendor-test] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
