/**
 * `createBullMQJobStore({ driver, orchestrate })` — `apps/worker-generate` 의 in-memory
 * FIFO `JobStore` 와 **동일한 인터페이스**를 유지하면서 실행/저장 경로만 `BullMQDriver` 로
 * 위임하는 팩토리. ADR 0006 §D3 X 단계의 핵심 성과물.
 *
 * ## 설계 축
 *
 *  - **idempotency_key → jobId 패스스루**: `task.idempotency_key` (`^[A-Za-z0-9._:-]{8,128}$`)
 *    를 **원문 그대로** BullMQ `job.id` 로 씀. 해시/UUID 변환 없음. 동일 키 재제출 시 BullMQ
 *    `queue.add({ jobId })` 가 반환하는 기존 snapshot 을 그대로 반환 (`running`/`succeeded`/
 *    `failed` 상태 보존). ADR 0006 §D3.2 + bullmq-driver-prework §2.4 테스트 포인트 5 고정점.
 *
 *  - **상태 매핑**: `mapBullMQState(driver snapshot.state)` → `JobStatus`. 드라이버가 `null`
 *    (완료 후 TTL 로 소멸) 을 반환하면 이미 `jobs` 캐시에 추적 중인 레코드가 있으면 그걸 반환,
 *    없으면 `undefined`.
 *
 *  - **mode 로 실행 경로 분기** (세션 65, ADR 0006 §D3 X+2):
 *    `"inline"` (기본) — submit 내부 `setImmediate(orchestrate)` 으로 같은 프로세스가 처리.
 *    세션 63 X+1 까지의 호환 경로.
 *    `"producer-only"` — submit 은 enqueue 만. 별 프로세스 Worker (`createBullMQConsumer`) 가
 *    consume. Runtime 운영 형상. `waitFor/drain` 는 로컬 `waiters` Map 에 의존하므로
 *    producer-only 에서는 resolve 되지 않음 — 호출자는 `get(id)` 폴링으로 상태 관측해야 한다.
 *
 *  - **removeOnComplete 의도**: 팩토리는 driver 의 TTL 정책을 건드리지 않음 — prework §2.3
 *    에서 `removeOnComplete: { age: 3600 }` 을 Runtime 세션 튜닝 대상으로 남김. 여기서는
 *    드라이버 계약만 의존.
 */

import type {
  GenerationTask,
  OrchestrateOutcome,
} from "@geny/ai-adapter-core";
import type {
  BullMQDriver,
  BullMQJobData,
  BullMQJobSnapshot,
} from "./driver.js";
import { mapBullMQState } from "./driver.js";

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

/**
 * 실행 모드 (세션 65 — ADR 0006 §D3 X+2).
 *
 *  - `"inline"` (기본, 세션 63 X+1 호환) — `submit()` 내부에서 `setImmediate(orchestrate)` 로
 *    같은 프로세스가 처리. `orchestrate` 콜백 **필수**. in-memory 유사 동작으로 로컬 dev 편의.
 *  - `"producer-only"` — `submit()` 은 큐에 넣기만 하고 in-process orchestrate 훅 생략.
 *    별 프로세스의 `createBullMQConsumer` (BullMQ `Worker`) 가 consume — Runtime 운영 형상.
 *    `orchestrate` 콜백 **불필요** (미제공 허용).
 */
export type BullMQJobStoreMode = "inline" | "producer-only";

export interface CreateBullMQJobStoreOptions {
  driver: BullMQDriver;
  /** `"inline"` 에서 필수. `"producer-only"` 에서는 생략 가능 (consumer 가 orchestrate 실행). */
  orchestrate?: (task: GenerationTask) => Promise<OrchestrateOutcome>;
  /** 시각 주입자 — 테스트 결정성. 기본 `new Date().toISOString()`. */
  now?: () => string;
  /** 기본 `"inline"`. 세션 63 배포 호환. */
  mode?: BullMQJobStoreMode;
  /**
   * `submit()` 성공 직후 1회 호출 (재제출 dedupe 의 경우는 미호출 — 새 enqueue 만 counter 증가
   * 시키기 위함). `geny_queue_enqueued_total{queue_name}` counter 배선 지점 (catalog §2.1).
   */
  onEnqueued?: (task: GenerationTask) => void;
}

export interface BullMQJobStore {
  submit(task: GenerationTask): Promise<JobRecord>;
  get(id: string): Promise<JobRecord | undefined>;
  list(): Promise<readonly JobRecord[]>;
  /** id 가 최종 상태(succeeded/failed)에 도달할 때까지 resolve 지연. */
  waitFor(id: string, timeoutMs?: number): Promise<JobRecord>;
  /** 대기 중/실행 중인 모든 잡이 최종 상태에 도달할 때까지 대기. */
  drain(timeoutMs?: number): Promise<void>;
  /** 드라이버 `close()` 위임. */
  stop(): Promise<void>;
}

export function createBullMQJobStore(opts: CreateBullMQJobStoreOptions): BullMQJobStore {
  const { driver } = opts;
  const mode: BullMQJobStoreMode = opts.mode ?? "inline";
  const orchestrate = opts.orchestrate;
  if (mode === "inline" && !orchestrate) {
    throw new Error('createBullMQJobStore: mode="inline" 은 orchestrate 콜백이 필수');
  }
  const now = opts.now ?? (() => new Date().toISOString());

  // 최종 상태/outcome/error 는 로컬 캐시에 보관 (driver snapshot 은 removeOnComplete 후 사라질 수
  // 있음 — ADR 0006 §D3 X+2 retention policy 참조).
  const records = new Map<string, JobRecord>();
  const waiters = new Map<string, Array<(rec: JobRecord) => void>>();
  const inflight = new Map<string, Promise<void>>();

  function fulfillWaiters(rec: JobRecord): void {
    const ws = waiters.get(rec.job_id);
    if (!ws) return;
    waiters.delete(rec.job_id);
    for (const w of ws) w(rec);
  }

  function snapshotToRecord(task: GenerationTask, snap: BullMQJobSnapshot): JobRecord {
    const status = mapBullMQState(snap.state);
    const rec: JobRecord = {
      job_id: snap.id,
      task,
      submitted_at: snap.data.submitted_at,
      status,
    };
    if (snap.processedOn !== undefined) rec.started_at = new Date(snap.processedOn).toISOString();
    if (snap.finishedOn !== undefined) rec.finished_at = new Date(snap.finishedOn).toISOString();
    return rec;
  }

  async function execute(task: GenerationTask, rec: JobRecord): Promise<void> {
    rec.status = "running";
    rec.started_at = now();
    try {
      // mode === "inline" 검증이 생성자에서 통과했으므로 orchestrate 는 non-null.
      const outcome = await orchestrate!(task);
      rec.outcome = outcome;
      rec.status = "succeeded";
    } catch (err) {
      rec.error = toErrorPayload(err);
      rec.status = "failed";
    }
    rec.finished_at = now();
    fulfillWaiters(rec);
  }

  return {
    async submit(task) {
      const jobId = task.idempotency_key;
      const data: BullMQJobData = {
        payload: task,
        idempotency_key: task.idempotency_key,
        submitted_at: now(),
      };
      const snap = await driver.add({ jobId, data });

      // 동일 idempotency_key 재제출: 기존 레코드 그대로 반환 (enqueue counter 미증가).
      const existing = records.get(jobId);
      if (existing) return existing;

      const rec = snapshotToRecord(task, snap);
      // driver 가 add 직후 이미 active/completed/failed 상태를 반환했다면 그 상태를 존중.
      // 계약상 fresh add 는 waiting/delayed 중 하나 — status 는 "queued".
      rec.status = mapBullMQState(snap.state);
      records.set(jobId, rec);
      // 새 enqueue (재제출 dedupe 후). catalog §2.1 `geny_queue_enqueued_total` 배선 지점.
      opts.onEnqueued?.(task);

      // orchestrate 를 백그라운드 실행 (mode="inline" 만). `producer-only` 모드에서는 별
      // 프로세스 Worker (createBullMQConsumer) 가 consume — 이 훅 skip.
      // `setImmediate` 로 다음 매크로태스크까지 지연 — `await submit(...)` 마이크로태스크
      // 체인이 먼저 완료되어야 호출자가 `status === "queued"` 를 관측할 수 있다.
      if (mode === "inline" && rec.status === "queued") {
        const p = new Promise<void>((ok) => {
          setImmediate(() => {
            void execute(task, rec).finally(() => {
              inflight.delete(jobId);
              ok();
            });
          });
        });
        inflight.set(jobId, p);
      }
      return rec;
    },

    async get(id) {
      const cached = records.get(id);
      if (cached) return cached;
      const snap = await driver.getJob(id);
      if (!snap) return undefined;
      return snapshotToRecord(snap.data.payload as GenerationTask, snap);
    },

    async list() {
      return Array.from(records.values());
    },

    waitFor(id, timeoutMs) {
      const rec = records.get(id);
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
      const pending = Array.from(records.values()).filter(
        (r) => r.status === "queued" || r.status === "running",
      );
      await Promise.all(pending.map((r) => this.waitFor(r.job_id, timeoutMs)));
    },

    async stop() {
      // 진행 중인 orchestrate 는 끝까지 기다림 — 의도치 않은 중단 금지.
      await Promise.allSettled(Array.from(inflight.values()));
      await driver.close();
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
