/**
 * 인-메모리 FIFO 잡 큐 + 상태 추적 (Foundation 범위). docs/02 §4 JobRunner 의 최초 내부
 * 참조 구현 — 실제 Redis/BullMQ 큐 결선은 `@geny/job-queue-bullmq` (세션 60) 와 Runtime
 * wiring (세션 62+).
 *
 * 설계:
 *  - `submit(task)` 이 동기적으로 `{ job_id, status: "queued" }` 를 반환.
 *  - **`job_id = task.idempotency_key` 원문 패스스루** (세션 61, ADR 0006 §D3.2 + prework
 *    §2.5). 해시/UUID 변환 없음 — traceability 유지 + BullMQ 드라이버와 계약 동일.
 *  - **동일 `idempotency_key` 재제출은 기존 `JobRecord` 를 그대로 반환** (BullMQ
 *    `queue.add({ jobId })` 의 멱등과 동일). 백그라운드 loop 는 새 엔트리를 만들지 않음.
 *  - 백그라운드 워커 루프가 큐에서 하나씩 꺼내 `orchestrate(task)` 를 호출.
 *  - 상태 전이: queued → running → (succeeded | failed).
 *  - `waitFor(id)` 는 최종 상태가 될 때까지 기다린다 (테스트에서 이벤트 루프 헬퍼).
 *
 * 순환 보장: `start()` 가 호출되지 않아도 `submit()` 만 하면 자동으로 루프를 킨다.
 * 테스트에서 `stop()` 으로 루프를 명시 종료.
 */

import type {
  GenerationTask,
  OrchestrateOutcome,
} from "@geny/ai-adapter-core";

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export interface JobRecord {
  readonly job_id: string;
  readonly task: GenerationTask;
  readonly submitted_at: string;
  status: JobStatus;
  started_at?: string;
  finished_at?: string;
  outcome?: OrchestrateOutcome;
  error?: { code: string; message: string };
}

export interface CreateJobStoreOptions {
  /** orchestrate 호출자. `@geny/orchestrator-service` 의 `svc.orchestrate` 를 그대로 바인딩. */
  orchestrate: (task: GenerationTask) => Promise<OrchestrateOutcome>;
  /** 현재 시각 주입자 (ISO8601). 기본 `new Date().toISOString()`. */
  now?: () => string;
}

export interface JobStore {
  submit(task: GenerationTask): JobRecord;
  get(id: string): JobRecord | undefined;
  list(): readonly JobRecord[];
  /** id 가 최종 상태(succeeded/failed)에 도달할 때까지 resolve 지연. */
  waitFor(id: string, timeoutMs?: number): Promise<JobRecord>;
  /** 대기 중인 모든 잡이 최종 상태에 도달할 때까지 대기. */
  drain(timeoutMs?: number): Promise<void>;
  /** 내부 워커 루프 정지 — 테스트 teardown 용. */
  stop(): Promise<void>;
}

export function createJobStore(opts: CreateJobStoreOptions): JobStore {
  const jobs = new Map<string, JobRecord>();
  const order: string[] = [];
  const pending: string[] = [];
  const waiters = new Map<string, Array<(rec: JobRecord) => void>>();
  const now = opts.now ?? (() => new Date().toISOString());

  let running = false;
  let stopped = false;

  async function loop(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (!stopped && pending.length > 0) {
        const id = pending.shift()!;
        const rec = jobs.get(id);
        if (!rec) continue;
        rec.status = "running";
        rec.started_at = now();
        try {
          const outcome = await opts.orchestrate(rec.task);
          rec.outcome = outcome;
          rec.status = "succeeded";
        } catch (err) {
          rec.error = toErrorPayload(err);
          rec.status = "failed";
        }
        rec.finished_at = now();
        const ws = waiters.get(id);
        if (ws) {
          waiters.delete(id);
          for (const w of ws) w(rec);
        }
      }
    } finally {
      running = false;
    }
  }

  return {
    submit(task) {
      if (stopped) throw new Error("JobStore: 이미 정지됨 — 새 제출 불가");
      const id = task.idempotency_key;
      // 동일 idempotency_key 재제출: 기존 record 그대로 반환, 새 엔트리/새 orchestrate 없음.
      // BullMQ `queue.add({ jobId })` 와 계약 동일 (`@geny/job-queue-bullmq` 세션 60).
      const existing = jobs.get(id);
      if (existing) return existing;
      const rec: JobRecord = {
        job_id: id,
        task,
        submitted_at: now(),
        status: "queued",
      };
      jobs.set(id, rec);
      order.push(id);
      pending.push(id);
      // 이벤트 루프 다음 tick 에 loop 를 깨움 (sync submit 반환 보장).
      queueMicrotask(() => {
        void loop();
      });
      return rec;
    },
    get(id) {
      return jobs.get(id);
    },
    list() {
      return order.map((id) => jobs.get(id)!).filter(Boolean);
    },
    waitFor(id, timeoutMs) {
      const rec = jobs.get(id);
      if (!rec) return Promise.reject(new Error(`unknown job_id: ${id}`));
      if (rec.status === "succeeded" || rec.status === "failed") {
        return Promise.resolve(rec);
      }
      return new Promise<JobRecord>((ok, fail) => {
        const list = waiters.get(id) ?? [];
        list.push(ok);
        waiters.set(id, list);
        if (timeoutMs !== undefined) {
          setTimeout(() => {
            fail(new Error(`waitFor timeout: ${id} after ${timeoutMs} ms`));
          }, timeoutMs).unref?.();
        }
      });
    },
    async drain(timeoutMs) {
      const pendingRecs = order
        .map((id) => jobs.get(id)!)
        .filter((r) => r.status === "queued" || r.status === "running");
      await Promise.all(pendingRecs.map((r) => this.waitFor(r.job_id, timeoutMs)));
    },
    async stop() {
      stopped = true;
      // 남은 waiter 는 그대로 유지 — 진행 중인 작업 완료까지 기다림.
      while (running) await delay(5);
    },
  };
}

function toErrorPayload(err: unknown): { code: string; message: string } {
  if (err && typeof err === "object" && "code" in err) {
    return {
      code: String((err as { code: unknown }).code ?? "UNKNOWN"),
      message: String((err as { message?: unknown }).message ?? err),
    };
  }
  return { code: "UNKNOWN", message: String(err) };
}

function delay(ms: number): Promise<void> {
  return new Promise((ok) => {
    setTimeout(ok, ms).unref?.();
  });
}
