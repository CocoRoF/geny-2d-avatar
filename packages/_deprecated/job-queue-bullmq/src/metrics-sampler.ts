/**
 * `createQueueMetricsSampler({ driver, setDepth, queueName, intervalMs })` — 세션 64
 * (ADR 0006 §D3 X+2 단계 부분). BullMQ `Queue.getJobCounts()` 를 주기적으로 폴링해
 * `geny_queue_depth` gauge 5 상태(waiting/active/delayed/completed/failed) 로 반영한다.
 *
 * 설계:
 *  - **`setDepth` 는 callback**: 레지스트리 타입(`@geny/ai-adapter-core`)에 직접 의존하지
 *    않는다. 호출자가 `(labels, value) => gauge.set(labels, value)` 형태로 주입. 덕분에
 *    `@geny/job-queue-bullmq` 는 `ai-adapter-core` 를 dep 으로 끌어오지 않아도 된다.
 *  - **BullMQ `Worker`/`QueueEvents` 는 쓰지 않는다**: 본 sampler 는 producer-side 관측.
 *    completed/failed 카운터나 duration histogram 은 QueueEvents 구독 경로가 필요한데 그건
 *    Worker consumer 분리 세션(65+) 범위. 여기서는 **gauge 만**.
 *  - **시간 주입**: `setInterval` 을 직접 쓰지 않고, `scheduler` 옵션으로 교체 가능. 테스트
 *    에서는 `tickOnce()` 를 직접 부르고 스케줄러는 우회(기본 `setIntervalScheduler` 는 실
 *    `setInterval` 사용). 프로덕션은 기본 30s (catalog §2.1).
 *
 *  - **에러 격리**: `driver.getCounts()` 가 throw 해도 sampler 는 죽지 않고 다음 tick 에 재시도.
 *    연속 실패 로깅은 `onError` 콜백으로 외부 위임.
 */

import type { BullMQDriver, BullMQQueueCounts } from "./driver.js";

export type QueueState = "waiting" | "active" | "delayed" | "completed" | "failed";

export const QUEUE_STATES: readonly QueueState[] = Object.freeze([
  "waiting",
  "active",
  "delayed",
  "completed",
  "failed",
]);

export interface QueueDepthSink {
  setDepth(labels: { queue_name: string; state: QueueState }, value: number): void;
}

export interface Scheduler {
  schedule(fn: () => void, intervalMs: number): { cancel(): void };
}

export const setIntervalScheduler: Scheduler = {
  schedule(fn, intervalMs) {
    const handle = setInterval(fn, intervalMs);
    handle.unref?.();
    return {
      cancel() {
        clearInterval(handle);
      },
    };
  },
};

export interface CreateQueueMetricsSamplerOptions {
  driver: BullMQDriver;
  sink: QueueDepthSink;
  queueName: string;
  /** 폴링 주기(ms). 기본 30_000 (catalog §2.1). */
  intervalMs?: number;
  scheduler?: Scheduler;
  /** getCounts() 실패 시 외부 로깅 (기본 silent). */
  onError?: (err: unknown) => void;
}

export interface QueueMetricsSampler {
  /** 스케줄러에 tick 을 등록. 이미 start 된 경우 no-op. */
  start(): void;
  /** 스케줄러를 해제 + inflight tick 대기. */
  stop(): Promise<void>;
  /**
   * 한 번 즉시 샘플링 실행 후 gauge 반영. 테스트/초기 1회 샘플링 용.
   * 에러는 `onError` 경유로 전달 — throw 되지 않음.
   */
  tickOnce(): Promise<void>;
}

export function createQueueMetricsSampler(
  opts: CreateQueueMetricsSamplerOptions,
): QueueMetricsSampler {
  const driver = opts.driver;
  const sink = opts.sink;
  const queueName = opts.queueName;
  const intervalMs = opts.intervalMs ?? 30_000;
  const scheduler = opts.scheduler ?? setIntervalScheduler;
  const onError = opts.onError ?? (() => undefined);

  let handle: { cancel(): void } | null = null;
  let inflight: Promise<void> | null = null;

  async function sample(): Promise<void> {
    try {
      const counts: BullMQQueueCounts = await driver.getCounts();
      sink.setDepth({ queue_name: queueName, state: "waiting" }, counts.waiting);
      sink.setDepth({ queue_name: queueName, state: "active" }, counts.active);
      sink.setDepth({ queue_name: queueName, state: "delayed" }, counts.delayed);
      sink.setDepth({ queue_name: queueName, state: "completed" }, counts.completed);
      sink.setDepth({ queue_name: queueName, state: "failed" }, counts.failed);
    } catch (err) {
      onError(err);
    }
  }

  return {
    start() {
      if (handle) return;
      handle = scheduler.schedule(() => {
        inflight = sample().finally(() => {
          inflight = null;
        });
      }, intervalMs);
    },
    async stop() {
      if (handle) {
        handle.cancel();
        handle = null;
      }
      if (inflight) await inflight;
    },
    async tickOnce() {
      inflight = sample().finally(() => {
        inflight = null;
      });
      await inflight;
    },
  };
}
