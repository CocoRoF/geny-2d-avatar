/**
 * `createBullMQConsumer(client, { queueName, processor, sink?, ... })` — 실 BullMQ `Worker`
 * 바인딩 consumer 어댑터. ADR 0006 §D3 **X+2 단계** (세션 65).
 *
 * ## 계약
 *
 *  - `Worker` 는 BullMQ 5.x `new Worker(queueName, processor, { connection })` 으로 구성.
 *    `processor(job)` 내부에서 `processWithMetrics` 로 감싸 `geny_queue_failed_total` /
 *    `geny_queue_duration_seconds` 2 메트릭을 배출한 뒤 `opts.processor(job.data)` 호출.
 *  - `close()` 는 `Worker.close()` — in-flight 잡을 끝까지 기다린 뒤 connection 을 놓는다.
 *    ioredis 클라이언트 lifecycle 은 호출자 책임 (driver-redis 과 동일 규약).
 *  - `REDIS_URL` 미설정 Foundation CI 에서는 이 파일을 직접 import 하지 않는 한 번들되지 않는다.
 *
 * ## 비-목표 (X+2 범위 밖)
 *
 *  - `QueueEvents` 연결은 본 파일에서 만들지 않음. `geny_queue_duration_seconds` 의 정확한
 *    enqueue→terminal 구간은 Runtime 튜닝 시 QueueEvents `added`/`completed` 타임스탬프 차분
 *    으로 확장 — 현재는 processor 구간 근사.
 *  - DLQ 라우팅(테스트 포인트 5) 은 Runtime 세션에서 `attemptsMade >= max_retries` 분기로 추가.
 */

import { Worker, type Job, type WorkerOptions } from "bullmq";
import type { Redis } from "ioredis";

import type { BullMQJobData } from "./driver.js";
import {
  processWithMetrics,
  type ConsumerMetricsSink,
  type QueueFailureReason,
} from "./processor-metrics.js";

export interface CreateBullMQConsumerOptions<TResult = unknown> {
  /** BullMQ 큐 이름 — producer 의 `queueName` 과 동일해야 함. */
  queueName: string;
  /** 잡 payload (BullMQJobData.payload) 를 받아 처리. 반환값은 BullMQ `job.returnvalue` 로 저장. */
  processor: (data: BullMQJobData) => Promise<TResult>;
  /** 메트릭 어댑트 — 미주입 시 silent (테스트/로컬 편의). */
  sink?: ConsumerMetricsSink;
  /** 에러 분류 커스텀. 기본 `defaultClassifyQueueError`. */
  classifyError?: (err: unknown) => QueueFailureReason;
  /** 동시성. 기본 BullMQ 기본값(1). */
  concurrency?: number;
  /** BullMQ `WorkerOptions` 추가 필드. connection 은 내부 주입. */
  extraWorkerOptions?: Omit<WorkerOptions, "connection" | "concurrency">;
}

export interface BullMQConsumer {
  /** `Worker.waitUntilReady()` — Redis 커넥션 준비 대기. */
  ready(): Promise<void>;
  /** graceful shutdown — in-flight 잡 완료 대기 후 반환. 멱등. */
  close(): Promise<void>;
}

/**
 * ioredis `Redis` 클라이언트를 받아 `BullMQConsumer` 를 빌드. 클라이언트 lifecycle 은 호출자
 * 책임 — 이 래퍼는 BullMQ `Worker` 만 소유하며 `close()` 에서 Worker.close() 만 호출한다.
 */
export function createBullMQConsumer<TResult = unknown>(
  client: Redis,
  opts: CreateBullMQConsumerOptions<TResult>,
): BullMQConsumer {
  const worker = new Worker<BullMQJobData, TResult>(
    opts.queueName,
    async (job: Job<BullMQJobData, TResult>) => {
      return processWithMetrics(() => opts.processor(job.data), {
        queueName: opts.queueName,
        ...(opts.sink ? { sink: opts.sink } : {}),
        ...(opts.classifyError ? { classifyError: opts.classifyError } : {}),
      });
    },
    {
      connection: client,
      ...(opts.concurrency !== undefined ? { concurrency: opts.concurrency } : {}),
      ...opts.extraWorkerOptions,
    },
  );

  let closed = false;
  return {
    async ready() {
      await worker.waitUntilReady();
    },
    async close() {
      if (closed) return;
      closed = true;
      await worker.close();
    },
  };
}
