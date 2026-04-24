/**
 * `processWithMetrics()` — consumer processor 래퍼 (세션 65, ADR 0006 §D3 X+2).
 *
 * `createBullMQConsumer` 의 processor 콜백을 감싸서 아래 2 메트릭을 배출한다:
 *
 *  - `geny_queue_failed_total{queue_name, reason}` — processor throw 시 1 증가. `reason` 은
 *    `classifyError(err)` 로 enum(`ai_timeout|ai_5xx|schema_violation|post_processing|export|
 *    other`) 으로 정규화. catalog §2.1 (`infra/observability/metrics-catalog.md`) vocabulary
 *    와 일치. `geny_job_failed_reason_total` 과 교차 확인 가능.
 *  - `geny_queue_duration_seconds{queue_name, outcome}` histogram — `opts.enqueuedAt` 주입
 *    시 **enqueue→terminal 구간** (BullMQ `Job.timestamp` 를 기준으로 wait+process 전체),
 *    미주입 시 **consumer 처리 구간** (processor start → resolve/reject) 만 관측.
 *    `consumer-redis.ts` 가 세션 68 부터 `enqueuedAt=job.timestamp` 를 전달해 Foundation 단계
 *    근사를 정밀화 — BullMQ `Job.timestamp` 는 `Queue.add` 시점의 ms epoch 라 별도 QueueEvents
 *    pub/sub 없이도 동등 정밀도를 얻는다. 외부 하네스가 `added/completed` 를 pub/sub 으로 받는
 *    방식은 cross-process 케이스에서 여전히 유용 — 본 경로는 in-Worker 최단거리 구현.
 *
 * 이 헬퍼는 `bullmq`/`ioredis` 에 의존하지 않는 **순수 함수** — 단위 테스트는 Redis 없이 돌아간다.
 * 실 BullMQ `Worker` 연결은 `consumer-redis.ts` 의 `createBullMQConsumer` 가 담당.
 */

/** 큐 실패 원인 vocabulary — catalog §2.1 과 `geny_job_failed_reason_total` 공통 enum. */
export type QueueFailureReason =
  | "ai_timeout"
  | "ai_5xx"
  | "schema_violation"
  | "post_processing"
  | "export"
  | "other";

export type QueueProcessOutcome = "succeeded" | "failed";

/** Consumer 측 메트릭 싱크 — worker-generate main.ts 가 registry 핸들을 어댑트. */
export interface ConsumerMetricsSink {
  onFailed(labels: { queue_name: string; reason: QueueFailureReason }): void;
  onDuration(
    labels: { queue_name: string; outcome: QueueProcessOutcome },
    seconds: number,
  ): void;
}

/** 에러 분류 기본 구현 — `err.code` (대문자 정규화) 를 부분 매치. */
export function defaultClassifyQueueError(err: unknown): QueueFailureReason {
  if (!err || typeof err !== "object") return "other";
  const code = String((err as { code?: unknown }).code ?? "").toUpperCase();
  if (!code) return "other";
  if (code.includes("TIMEOUT")) return "ai_timeout";
  if (code.includes("5XX") || code.includes("VENDOR_ERROR")) return "ai_5xx";
  if (code.includes("SCHEMA")) return "schema_violation";
  if (code.includes("POST_PROCESS")) return "post_processing";
  if (code.includes("EXPORT")) return "export";
  return "other";
}

export interface ProcessWithMetricsOptions {
  queueName: string;
  sink?: ConsumerMetricsSink;
  classifyError?: (err: unknown) => QueueFailureReason;
  /** 테스트 결정성 — 기본 `Date.now`. */
  clock?: () => number;
  /**
   * enqueue 시각 (ms epoch). 주입 시 duration = `now - enqueuedAt` 으로 wait+process 구간을
   * 측정한다 (세션 68). 미주입 시 processor start → terminal 구간만 측정 (세션 65 호환).
   * `consumer-redis.ts` 는 BullMQ `Job.timestamp` 를 그대로 넘긴다.
   * 음수 차분(clock skew / 시계 역행) 은 0 으로 clamp — histogram bucket 에 음수가 섞이지 않도록.
   */
  enqueuedAt?: number;
}

/**
 * processor 콜백을 감싸서 메트릭 방출 + rethrow. 반환값은 processor 반환값 그대로.
 * BullMQ `Worker` processor 로 바로 꽂을 수 있게 `<T>` 제네릭.
 */
export async function processWithMetrics<T>(
  processor: () => Promise<T>,
  opts: ProcessWithMetricsOptions,
): Promise<T> {
  const now = opts.clock ?? Date.now;
  const processorStart = now();
  const start = opts.enqueuedAt ?? processorStart;
  const durationSeconds = (): number => Math.max(0, (now() - start) / 1000);
  try {
    const result = await processor();
    opts.sink?.onDuration(
      { queue_name: opts.queueName, outcome: "succeeded" },
      durationSeconds(),
    );
    return result;
  } catch (err) {
    const reason = (opts.classifyError ?? defaultClassifyQueueError)(err);
    opts.sink?.onFailed({ queue_name: opts.queueName, reason });
    opts.sink?.onDuration(
      { queue_name: opts.queueName, outcome: "failed" },
      durationSeconds(),
    );
    throw err;
  }
}
