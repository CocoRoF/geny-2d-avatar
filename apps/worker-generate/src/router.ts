/**
 * 잡 라우터 — Node http 수준에서 `POST /jobs` / `GET /jobs/:id` / `GET /jobs` 를 처리.
 * `@geny/orchestrator-service` 의 `createMetricsServer({ fallback })` 슬롯에 끼우기 위해
 * `(req, res) => void` 시그니처.
 *
 * 라우터 범위:
 *  - `/metrics` 와 `/healthz` 는 orchestrator-service 가 먼저 처리.
 *  - 여기서 다루는 경로: `/jobs`, `/jobs/{id}`.
 *  - 그 외 경로 → 404.
 *
 * 본문 파싱:
 *  - Content-Length 4 KB 상한 (Foundation 기본) — 프롬프트/레퍼런스 정도.
 *  - JSON 만 허용 (`content-type: application/json`).
 *  - 최소 필드(`task_id`, `slot_id`, `prompt`, `size`, `deadline_ms`, `budget_usd`,
 *    `idempotency_key`, `schema_version`) 유효성은 여기서 — 실 adapter 계약 검증은
 *    orchestrate() 내부 (capability_required 매칭 등) 에 위임.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { GenerationTask } from "@geny/ai-adapter-core";

import type { JobRecord, JobStore } from "./job-store.js";

const MAX_BODY_BYTES = 4 * 1024;

export interface JobRouterOptions {
  store: JobStore;
  /** 로그 싱크. undefined 면 조용. */
  logger?: {
    info?: (msg: string, meta?: unknown) => void;
    warn?: (msg: string, meta?: unknown) => void;
  };
}

export function createJobRouter(opts: JobRouterOptions): (req: IncomingMessage, res: ServerResponse) => void {
  const { store, logger } = opts;

  return (req, res) => {
    const url = req.url ?? "/";
    const path = url.split("?")[0] ?? "/";

    if (path === "/jobs" && (req.method === "GET" || req.method === "HEAD")) {
      void handleList(res, store, req.method === "HEAD");
      return;
    }

    if (path === "/jobs" && req.method === "POST") {
      void handleSubmit(req, res, store, logger);
      return;
    }

    // 세션 70: 스키마 idempotency_key regex 가 `:` 제거 (BullMQ custom id 제약) — 본 path
    // regex 도 정합하게 narrow. 세션 63 설정 이래 `:` 는 실제로 legal 인 적 없었음.
    const m = /^\/jobs\/([A-Za-z0-9_.-]+)$/.exec(path);
    if (m && (req.method === "GET" || req.method === "HEAD")) {
      const id = m[1]!;
      void handleGet(res, store, id, req.method === "HEAD");
      return;
    }

    if (path === "/jobs" || m) {
      res.statusCode = 405;
      res.setHeader("Allow", path === "/jobs" ? "GET, HEAD, POST" : "GET, HEAD");
      res.end();
      return;
    }

    writeJson(res, 404, { error: "not found" });
  };
}

async function handleSubmit(
  req: IncomingMessage,
  res: ServerResponse,
  store: JobStore,
  logger: JobRouterOptions["logger"],
): Promise<void> {
  const ct = (req.headers["content-type"] ?? "").toString().toLowerCase();
  if (!ct.startsWith("application/json")) {
    return writeJson(res, 415, { error: "content-type must be application/json" });
  }
  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    return writeJson(res, 413, { error: String((err as Error).message) });
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return writeJson(res, 400, { error: "invalid JSON" });
  }
  const task = validateTask(parsed);
  if (!task.ok) {
    return writeJson(res, 400, { error: task.error });
  }
  try {
    const rec = await store.submit(task.task);
    logger?.info?.(`job submitted: ${rec.job_id}`, { slot_id: rec.task.slot_id });
    writeJson(res, 202, summary(rec));
  } catch (err) {
    logger?.warn?.(`submit failed: ${(err as Error).message}`);
    writeJson(res, 503, { error: (err as Error).message });
  }
}

async function handleList(
  res: ServerResponse,
  store: JobStore,
  headOnly: boolean,
): Promise<void> {
  try {
    const list = (await store.list()).map(summary);
    writeJson(res, 200, { jobs: list }, headOnly);
  } catch (err) {
    writeJson(res, 503, { error: (err as Error).message });
  }
}

async function handleGet(
  res: ServerResponse,
  store: JobStore,
  id: string,
  headOnly: boolean,
): Promise<void> {
  try {
    const rec = await store.get(id);
    if (!rec) return writeJson(res, 404, { error: "unknown job_id" });
    writeJson(res, 200, summary(rec), headOnly);
  } catch (err) {
    writeJson(res, 503, { error: (err as Error).message });
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((ok, fail) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error(`payload too large (> ${MAX_BODY_BYTES} bytes)`));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => ok(Buffer.concat(chunks).toString("utf8")));
    req.on("error", fail);
  });
}

type ValidateResult =
  | { ok: true; task: GenerationTask }
  | { ok: false; error: string };

export function validateTask(raw: unknown): ValidateResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "body must be an object" };
  const o = raw as Record<string, unknown>;
  if (o["schema_version"] !== "v1") return { ok: false, error: "schema_version must be \"v1\"" };
  for (const key of ["task_id", "slot_id", "prompt", "idempotency_key"] as const) {
    if (typeof o[key] !== "string" || (o[key] as string).length === 0) {
      return { ok: false, error: `${key} must be non-empty string` };
    }
  }
  // negative_prompt 은 빈 문자열 허용 (docs/05 §2.2 — 기본값 "").
  if (typeof o["negative_prompt"] !== "string") {
    return { ok: false, error: "negative_prompt must be string" };
  }
  for (const key of ["deadline_ms", "budget_usd"] as const) {
    if (typeof o[key] !== "number" || !Number.isFinite(o[key] as number) || (o[key] as number) < 0) {
      return { ok: false, error: `${key} must be non-negative number` };
    }
  }
  const size = o["size"];
  if (
    !Array.isArray(size) ||
    size.length !== 2 ||
    typeof size[0] !== "number" ||
    typeof size[1] !== "number"
  ) {
    return { ok: false, error: "size must be [number, number]" };
  }
  return { ok: true, task: o as unknown as GenerationTask };
}

function summary(rec: JobRecord): Record<string, unknown> {
  const out: Record<string, unknown> = {
    job_id: rec.job_id,
    task_id: rec.task.task_id,
    slot_id: rec.task.slot_id,
    status: rec.status,
    submitted_at: rec.submitted_at,
  };
  if (rec.started_at) out["started_at"] = rec.started_at;
  if (rec.finished_at) out["finished_at"] = rec.finished_at;
  if (rec.status === "succeeded" && rec.outcome) {
    out["result"] = {
      vendor: rec.outcome.result.vendor,
      image_sha256: rec.outcome.result.image_sha256,
      cost_usd: rec.outcome.result.cost_usd,
      latency_ms: rec.outcome.result.latency_ms,
      attempts: rec.outcome.attempts.length,
    };
  }
  if (rec.status === "failed" && rec.error) {
    out["error"] = rec.error;
  }
  return out;
}

function writeJson(res: ServerResponse, status: number, body: unknown, headOnly = false): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (headOnly) {
    res.end();
  } else {
    res.end(JSON.stringify(body));
  }
}
