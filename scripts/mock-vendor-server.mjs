#!/usr/bin/env node
/**
 * Mock vendor HTTP server — session 82.
 *
 * `HttpNanoBananaClient` / `HttpSDXLClient` / `HttpFluxFillClient` 세 어댑터가 공유하는
 * HTTP 계약(endpoints + request/response body) 을 로컬에서 재현한다. 실 벤더 API 키나 egress
 * 없이도 HTTP 경로를 end-to-end 로 두드려볼 수 있도록 만든, dependency-zero 의 Node 내장
 * http 서버.
 *
 * 지원 엔드포인트 (세션 82 시점):
 *  - `POST /v1/generate` — nano-banana contract
 *  - `POST /v1/edit` — SDXL edit contract
 *  - `POST /v1/fill` — flux-fill mask contract
 *  - `GET  /v1/health` — 공통 헬스 체크
 *
 * 응답 결정론:
 *  - `image_sha256` = `sha256(task_id || seed || endpoint_name)` 의 hex — 동일 입력 → 동일 출력,
 *    테스트에서 재현 가능.
 *  - `bbox` = `[0, 0, size.width, size.height]` (요청된 full-canvas bounding box).
 *  - `latency_ms` = 실 서버 측 sleep 시간 (ms 정수) — 클라이언트의 duration 측정과
 *    교차검증 가능.
 *
 * 장애 주입:
 *  - `--fail-rate 0.1` — 각 요청의 10% 가 `500 vendor_error` 반환. 어댑터의 `VENDOR_ERROR_5XX`
 *    → 라우터 폴백 경로를 E2E 로 검증할 때 사용.
 *  - `--fail-rate-generate 1.0 --fail-rate-edit 0 --fail-rate-fill 0` — 엔드포인트별 override.
 *    세션 84 `routeWithFallback` 결정론적 폴백 e2e 용 (nano-banana 100% 실패 → sdxl 100% 성공
 *    → 결과는 항상 sdxl 경유 20 successful + 20 fallback events). 미지정 시 `--fail-rate` 상속.
 *  - 결정론적 failure 순서 (`--seed N` 로 RNG 고정) — CI 회귀를 플레이키하게 만들지 않도록.
 *
 * 인증:
 *  - `Authorization: Bearer <non-empty>` 헤더 누락/빈값 → 401. 키 **값** 일치는 검증하지 않는다
 *    (mock 의 책임은 HTTP 계약 재현이지, 키 검증이 아님).
 *
 * CLI:
 *   node scripts/mock-vendor-server.mjs [--port 0] [--latency-mean-ms 30] \
 *     [--latency-jitter-ms 20] [--fail-rate 0] [--seed 42]
 *
 * 기동 후 stdout 한 줄 `mock-vendor listening: http://localhost:<port>` 를 출력.
 */

import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const ENDPOINT_KIND = {
  "/v1/generate": "nano-banana",
  "/v1/edit": "sdxl",
  "/v1/fill": "flux-fill",
};

/**
 * Mulberry32 PRNG — seed 고정 가능한 결정론적 RNG (32-bit 정수 seed).
 * 테스트/회귀 용도로만 쓰며, 암호학적 성질은 없음.
 */
function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) | 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 서버 팩토리. 테스트가 `createMockVendorServer({ port: 0, ... })` 로 인라인 기동,
 * CLI 는 `parseArgv(argv)` 를 거쳐 동일 팩토리로 기동.
 *
 * @returns { server, port, rngState } — `rngState` 는 fail 결정 순서 관찰용.
 */
export function createMockVendorServer(opts = {}) {
  const latencyMean = Math.max(0, Number.isFinite(opts.latencyMeanMs) ? opts.latencyMeanMs : 0);
  const latencyJitter = Math.max(0, Number.isFinite(opts.latencyJitterMs) ? opts.latencyJitterMs : 0);
  const failRate = Math.min(1, Math.max(0, Number.isFinite(opts.failRate) ? opts.failRate : 0));
  // 세션 84 — 엔드포인트별 fail rate override. 미지정 시 전역 `failRate` 상속. nano-banana 만
  // 1.0 으로 고정하면 매 호출 폴백 트리거, sdxl 0 으로 고정하면 폴백 도착지 항상 성공.
  const pickRate = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : failRate);
  const kindFailRate = {
    "nano-banana": pickRate(opts.failRateGenerate),
    "sdxl": pickRate(opts.failRateEdit),
    "flux-fill": pickRate(opts.failRateFill),
  };
  const rng = mulberry32(Number.isFinite(opts.seed) ? opts.seed : 42);

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      if (req.method === "GET" && url.pathname === "/v1/health") {
        return json(res, 200, { ok: true, latency_ms: 0 });
      }

      const kind = ENDPOINT_KIND[url.pathname];
      if (!kind || req.method !== "POST") {
        return json(res, 404, { error: "unknown endpoint", path: url.pathname });
      }

      const auth = req.headers["authorization"];
      if (typeof auth !== "string" || !/^Bearer\s+\S+/.test(auth)) {
        return json(res, 401, { error: "missing or malformed Authorization: Bearer <token>" });
      }

      const body = await readJson(req);
      if (!body || typeof body !== "object") {
        return json(res, 400, { error: "body must be JSON object" });
      }
      if (typeof body.task_id !== "string" || body.task_id.length === 0) {
        return json(res, 400, { error: "task_id required" });
      }
      if (!body.size || typeof body.size !== "object" ||
          !Number.isFinite(body.size.width) || !Number.isFinite(body.size.height)) {
        return json(res, 400, { error: "size.width/height required" });
      }

      const latency = Math.round(latencyMean + (rng() * 2 - 1) * latencyJitter);
      const clamped = Math.max(0, latency);
      if (clamped > 0) await sleep(clamped);

      // 결정론적 실패 주입 — sleep 이후에 roll 하여 클라이언트의 timeout abort 와 섞이지 않게.
      // 세션 84 — kind 별 fail rate 적용 (미override 시 전역 failRate 와 동일).
      const kindRate = kindFailRate[kind];
      if (kindRate > 0 && rng() < kindRate) {
        return json(res, 500, {
          error: "simulated vendor error",
          task_id: body.task_id,
          kind,
        });
      }

      const seedStr = String(body.seed ?? 0);
      const image_sha256 = createHash("sha256")
        .update(body.task_id)
        .update("|")
        .update(seedStr)
        .update("|")
        .update(kind)
        .digest("hex");

      return json(res, 200, {
        image_sha256,
        bbox: [0, 0, body.size.width, body.size.height],
        latency_ms: clamped,
        vendor_metadata: { kind, model: body.model ?? null },
      });
    } catch (err) {
      return json(res, 500, { error: `mock-vendor internal: ${(err && err.message) || err}` });
    }
  });

  return server;
}

async function readJson(req) {
  const chunks = [];
  let total = 0;
  const MAX = 1 << 20; // 1 MiB — mock 는 큰 바디 받을 이유 없음.
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX) {
      const err = new Error(`body too large (>${MAX} bytes)`);
      err.code = "BODY_TOO_LARGE";
      throw err;
    }
    chunks.push(chunk);
  }
  if (total === 0) return null;
  const text = Buffer.concat(chunks).toString("utf8");
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function parseArgv(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === "--port") { opts.port = Number(next); i += 1; }
    else if (a === "--latency-mean-ms") { opts.latencyMeanMs = Number(next); i += 1; }
    else if (a === "--latency-jitter-ms") { opts.latencyJitterMs = Number(next); i += 1; }
    else if (a === "--fail-rate") { opts.failRate = Number(next); i += 1; }
    else if (a === "--fail-rate-generate") { opts.failRateGenerate = Number(next); i += 1; }
    else if (a === "--fail-rate-edit") { opts.failRateEdit = Number(next); i += 1; }
    else if (a === "--fail-rate-fill") { opts.failRateFill = Number(next); i += 1; }
    else if (a === "--seed") { opts.seed = Number(next); i += 1; }
    else if (a === "--help" || a === "-h") { opts.help = true; }
    else throw new Error(`unknown arg: ${a}`);
  }
  return opts;
}

async function main() {
  const opts = parseArgv(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(
      "mock-vendor-server [--port 0] [--latency-mean-ms N] [--latency-jitter-ms N]" +
      " [--fail-rate 0..1] [--seed N]\n",
    );
    return;
  }
  const server = createMockVendorServer(opts);
  await new Promise((resolveFn, rejectFn) => {
    server.on("error", rejectFn);
    server.listen(opts.port ?? 0, () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      process.stdout.write(`mock-vendor listening: http://localhost:${port}\n`);
      resolveFn();
    });
  });
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      server.close(() => process.exit(0));
    });
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    process.stderr.write(`[mock-vendor] ✖ ${err?.message ?? err}\n`);
    process.exit(1);
  });
}
