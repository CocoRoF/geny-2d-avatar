import { test } from "node:test";
import assert from "node:assert/strict";

import type { BullMQDriver, BullMQQueueCounts } from "../src/driver.js";
import {
  createQueueMetricsSampler,
  type QueueDepthSink,
  type QueueState,
  type Scheduler,
} from "../src/metrics-sampler.js";

function stubDriver(counts: BullMQQueueCounts, overrides: Partial<BullMQDriver> = {}): BullMQDriver {
  return {
    async add() {
      throw new Error("unused");
    },
    async getJob() {
      return null;
    },
    async listJobs() {
      return [];
    },
    async getCounts() {
      return counts;
    },
    async close() {},
    ...overrides,
  };
}

function recordingSink(): {
  sink: QueueDepthSink;
  values: Map<QueueState, number>;
  calls: number;
} {
  const values = new Map<QueueState, number>();
  let calls = 0;
  return {
    sink: {
      setDepth(labels, value) {
        calls++;
        values.set(labels.state, value);
      },
    },
    get values() {
      return values;
    },
    get calls() {
      return calls;
    },
  };
}

/** 수동 제어 스케줄러 — tick 시점을 테스트가 결정. */
function manualScheduler(): Scheduler & { fire(): void; cancelled: boolean } {
  let cb: (() => void) | null = null;
  let cancelled = false;
  return {
    schedule(fn) {
      cb = fn;
      return {
        cancel() {
          cancelled = true;
          cb = null;
        },
      };
    },
    fire() {
      if (cb) cb();
    },
    get cancelled() {
      return cancelled;
    },
  };
}

test("QueueMetricsSampler: tickOnce() 이 getCounts → 5 상태 gauge 반영", async () => {
  const rec = recordingSink();
  const sampler = createQueueMetricsSampler({
    driver: stubDriver({ waiting: 7, active: 2, delayed: 1, completed: 100, failed: 3 }),
    sink: rec.sink,
    queueName: "geny-generate",
  });
  await sampler.tickOnce();
  assert.equal(rec.calls, 5);
  assert.equal(rec.values.get("waiting"), 7);
  assert.equal(rec.values.get("active"), 2);
  assert.equal(rec.values.get("delayed"), 1);
  assert.equal(rec.values.get("completed"), 100);
  assert.equal(rec.values.get("failed"), 3);
});

test("QueueMetricsSampler: start()/stop() scheduler 훅 + cancel 호출", async () => {
  const rec = recordingSink();
  const sched = manualScheduler();
  const sampler = createQueueMetricsSampler({
    driver: stubDriver({ waiting: 1, active: 0, delayed: 0, completed: 0, failed: 0 }),
    sink: rec.sink,
    queueName: "q",
    scheduler: sched,
    intervalMs: 100,
  });
  sampler.start();
  sched.fire();
  await new Promise((ok) => setImmediate(ok));
  assert.equal(rec.values.get("waiting"), 1);
  await sampler.stop();
  assert.equal(sched.cancelled, true);
});

test("QueueMetricsSampler: getCounts() 실패 → onError 호출 + 다음 tick 에 복구", async () => {
  const rec = recordingSink();
  let throwOnce = true;
  const errors: unknown[] = [];
  const sampler = createQueueMetricsSampler({
    driver: stubDriver({ waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }, {
      async getCounts() {
        if (throwOnce) {
          throwOnce = false;
          throw new Error("redis down");
        }
        return { waiting: 5, active: 0, delayed: 0, completed: 0, failed: 0 };
      },
    }),
    sink: rec.sink,
    queueName: "q",
    onError: (e) => errors.push(e),
  });
  await sampler.tickOnce();
  assert.equal(errors.length, 1);
  assert.match(String(errors[0]), /redis down/);
  assert.equal(rec.calls, 0); // 실패 시 setDepth 미호출
  await sampler.tickOnce();
  assert.equal(errors.length, 1);
  assert.equal(rec.values.get("waiting"), 5);
});

test("QueueMetricsSampler: start() 두 번 호출 → 두 번째 no-op (idempotent)", async () => {
  const rec = recordingSink();
  const sched = manualScheduler();
  let scheduleCount = 0;
  const wrapped: Scheduler = {
    schedule(fn, ms) {
      scheduleCount++;
      return sched.schedule(fn, ms);
    },
  };
  const sampler = createQueueMetricsSampler({
    driver: stubDriver({ waiting: 0, active: 0, delayed: 0, completed: 0, failed: 0 }),
    sink: rec.sink,
    queueName: "q",
    scheduler: wrapped,
  });
  sampler.start();
  sampler.start();
  assert.equal(scheduleCount, 1);
  await sampler.stop();
});
