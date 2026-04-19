/**
 * `createBullMQDriverFromRedis(client, { queueName })` — 실 `bullmq@^5` + `ioredis@^5`
 * 바인딩 `BullMQDriver` 어댑터. ADR 0006 §D3 **X+1 단계** (세션 62).
 *
 * ## 계약
 *
 *  - `add({ jobId, data })` 는 `queue.add(name, data, { jobId })` 로 위임. BullMQ 는 동일
 *    jobId 재호출 시 기존 Job 을 반환하고 새 엔트리를 만들지 않음 (공식 동작 + 세션 60
 *    팩토리 계약과 정합).
 *  - `getJob(id)` 는 `queue.getJob(id)` — TTL 로 사라진 잡은 `null` 반환.
 *  - `listJobs()` 는 Foundation MVP 범위이므로 waiting/active/delayed/completed/failed
 *    5 상태를 순차 페이지 0~1000 으로 긁어서 합침 — 페이징 API 노출은 X+2 세션 이후.
 *  - `getCounts()` 는 `queue.getJobCounts(...)` 5 상태. `geny_queue_depth` gauge 소스.
 *  - `close()` 는 `queue.close()` + `queueEvents?.close()` 멱등 (두번째 호출은 no-op).
 *
 * ## 비-목표 (X+1 범위 밖)
 *
 *  - `Worker` 는 **여기서 만들지 않음**. worker-generate 가 bootstrap 에서 별 Worker
 *    프로세스를 띄울 책임 (세션 63). 본 파일은 producer + observer 측만 구현.
 *  - `removeOnComplete` / `removeOnFail` TTL 정책은 Runtime 튜닝 대상 (prework §2.3) —
 *    어댑터 호출자가 `queueOptions` 로 주입 (기본 `{ age: 3600, count: 1000 }` on complete,
 *    `false` on fail).
 *  - Testcontainers Redis 를 강제하지 않음. `REDIS_URL` env 가 있어야만 integration
 *    테스트가 돌고, 없으면 skip — Foundation CI 는 env 미설정이라 skip 경로.
 *
 * 이 파일은 `bullmq` / `ioredis` 의 타입을 re-export 하지 않는다 — 호출자가 `Redis` 인스
 * 턴스를 직접 만들어 주입하면, 어댑터는 `connection` 옵션으로 BullMQ 에 넘기기만 한다.
 */

import { Queue, type Job, type JobsOptions, type QueueOptions } from "bullmq";
import type { Redis } from "ioredis";

import type {
  BullMQDriver,
  BullMQJobData,
  BullMQJobSnapshot,
  BullMQJobState,
  BullMQQueueCounts,
} from "./driver.js";

export interface CreateBullMQDriverFromRedisOptions {
  /** BullMQ 큐 이름. Foundation 은 단일 큐(`"geny-generate"`) 전제. */
  queueName: string;
  /** `queue.add(name, data)` 의 job name 고정값. 기본 `"generate"`. */
  jobName?: string;
  /** `queue.add` 기본 옵션. `removeOnComplete`/`removeOnFail` TTL 튜닝 지점. */
  defaultJobOptions?: JobsOptions;
  /** BullMQ `QueueOptions` 추가 필드 (prefix, streams maxLen 등). connection 은 내부 주입. */
  extraQueueOptions?: Omit<QueueOptions, "connection">;
}

/**
 * ioredis `Redis` 클라이언트를 받아 `BullMQDriver` 구현체를 빌드. 클라이언트 lifecycle
 * 은 호출자 책임 — 이 어댑터는 BullMQ `Queue` 만 소유한다. `close()` 는 BullMQ queue
 * 만 닫고 ioredis connection 은 건드리지 않음 (공유 connection 가능).
 */
export function createBullMQDriverFromRedis(
  client: Redis,
  opts: CreateBullMQDriverFromRedisOptions,
): BullMQDriver {
  const jobName = opts.jobName ?? "generate";
  const queue = new Queue<BullMQJobData, unknown, string>(opts.queueName, {
    connection: client,
    ...(opts.defaultJobOptions ? { defaultJobOptions: opts.defaultJobOptions } : {}),
    ...opts.extraQueueOptions,
  });

  let closed = false;

  async function jobToSnapshot(job: Job<BullMQJobData>): Promise<BullMQJobSnapshot> {
    const state = (await job.getState()) as BullMQJobState;
    const snap: {
      id: string;
      state: BullMQJobState;
      data: BullMQJobData;
      timestamp: number;
      processedOn?: number | undefined;
      finishedOn?: number | undefined;
      returnvalue?: unknown;
      failedReason?: string | undefined;
    } = {
      id: job.id ?? "",
      state,
      data: job.data,
      timestamp: job.timestamp,
    };
    if (job.processedOn !== undefined) snap.processedOn = job.processedOn;
    if (job.finishedOn !== undefined) snap.finishedOn = job.finishedOn;
    if (job.returnvalue !== undefined) snap.returnvalue = job.returnvalue;
    if (job.failedReason) snap.failedReason = job.failedReason;
    return snap as BullMQJobSnapshot;
  }

  return {
    async add({ jobId, data }) {
      const job = await queue.add(jobName, data, { jobId });
      return jobToSnapshot(job as Job<BullMQJobData>);
    },

    async getJob(id) {
      const job = await queue.getJob(id);
      if (!job) return null;
      return jobToSnapshot(job as Job<BullMQJobData>);
    },

    async listJobs() {
      // MVP: 5 상태 전수 조회 (페이지 0~999). waiting + active + delayed + completed + failed.
      const jobs = await queue.getJobs(
        ["waiting", "active", "delayed", "completed", "failed"],
        0,
        999,
        true,
      );
      const out = await Promise.all(jobs.map((j) => jobToSnapshot(j as Job<BullMQJobData>)));
      return out;
    },

    async getCounts(): Promise<BullMQQueueCounts> {
      const c = await queue.getJobCounts("waiting", "active", "completed", "failed", "delayed");
      return {
        waiting: c["waiting"] ?? 0,
        active: c["active"] ?? 0,
        completed: c["completed"] ?? 0,
        failed: c["failed"] ?? 0,
        delayed: c["delayed"] ?? 0,
      };
    },

    async close() {
      if (closed) return;
      closed = true;
      await queue.close();
    },
  };
}
