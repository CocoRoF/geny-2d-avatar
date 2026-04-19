/**
 * `processWithMetrics()` — consumer processor 래퍼 (세션 65, ADR 0006 §D3 X+2).
 *
 * `createBullMQConsumer` 의 processor 콜백을 감싸서 아래 2 메트릭을 배출한다:
 *
 *  - `geny_queue_failed_total{queue_name, reason}` — processor throw 시 1 증가. `reason` 은
 *    `classifyError(err)` 로 enum(`ai_timeout|ai_5xx|schema_violation|post_processing|export|
 *    other`) 으로 정규화. catalog §2.1 (`infra/observability/metrics-catalog.md`) vocabulary
 *    와 일치. `geny_job_failed_reason_total` 과 교차 확인 가능.
 *  - `geny_queue_duration_seconds{queue_name, outcome}` histogram — enqueue→terminal 전체가
 *    아니라 **consumer 처리 구간**(processor start → resolve/reject) 만 관측. Foundation 단계
 *    의 근사치이며, 정확한 wait+process 구간은 Runtime 세션에서 QueueEvents 의
 *    `added/completed` 타임스탬프 차분으로 확장 예정.
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
  const start = now();
  try {
    const result = await processor();
    opts.sink?.onDuration(
      { queue_name: opts.queueName, outcome: "succeeded" },
      (now() - start) / 1000,
    );
    return result;
  } catch (err) {
    const reason = (opts.classifyError ?? defaultClassifyQueueError)(err);
    opts.sink?.onFailed({ queue_name: opts.queueName, reason });
    opts.sink?.onDuration(
      { queue_name: opts.queueName, outcome: "failed" },
      (now() - start) / 1000,
    );
    throw err;
  }
}
