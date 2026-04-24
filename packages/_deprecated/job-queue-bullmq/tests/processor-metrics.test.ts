import { test } from "node:test";
import assert from "node:assert/strict";

import {
  defaultClassifyQueueError,
  processWithMetrics,
  type ConsumerMetricsSink,
  type QueueFailureReason,
} from "../src/processor-metrics.js";

interface Recorded {
  failed: Array<{ queue_name: string; reason: QueueFailureReason }>;
  durations: Array<{ queue_name: string; outcome: "succeeded" | "failed"; seconds: number }>;
  sink: ConsumerMetricsSink;
}

function recordingSink(): Recorded {
  const failed: Recorded["failed"] = [];
  const durations: Recorded["durations"] = [];
  return {
    failed,
    durations,
    sink: {
      onFailed(labels) {
        failed.push(labels);
      },
      onDuration(labels, seconds) {
        durations.push({ ...labels, seconds });
      },
    },
  };
}

/** 가상 시계 — tick(ms) 호출로 시간 전진. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000;
  return {
    now: () => t,
    advance(ms) {
      t += ms;
    },
  };
}

test("processWithMetrics: 성공 시 duration(succeeded) 만 방출, 반환값 그대로", async () => {
  const rec = recordingSink();
  const clock = fakeClock();
  const result = await processWithMetrics(
    async () => {
      clock.advance(250); // 250ms 처리
      return "ok";
    },
    { queueName: "q1", sink: rec.sink, clock: clock.now },
  );
  assert.equal(result, "ok");
  assert.equal(rec.failed.length, 0);
  assert.equal(rec.durations.length, 1);
  assert.deepEqual(rec.durations[0], { queue_name: "q1", outcome: "succeeded", seconds: 0.25 });
});

test("processWithMetrics: 실패 시 failed + duration(failed) 방출 + rethrow", async () => {
  const rec = recordingSink();
  const clock = fakeClock();
  const boom = Object.assign(new Error("vendor down"), { code: "VENDOR_ERROR_5XX" });
  await assert.rejects(
    processWithMetrics(
      async () => {
        clock.advance(500);
        throw boom;
      },
      { queueName: "geny-generate", sink: rec.sink, clock: clock.now },
    ),
    /vendor down/,
  );
  assert.deepEqual(rec.failed, [{ queue_name: "geny-generate", reason: "ai_5xx" }]);
  assert.equal(rec.durations.length, 1);
  assert.deepEqual(rec.durations[0], {
    queue_name: "geny-generate",
    outcome: "failed",
    seconds: 0.5,
  });
});

test("processWithMetrics: sink 미주입 시 silent (throw 도 그대로 전파)", async () => {
  const result = await processWithMetrics(async () => 42, { queueName: "q" });
  assert.equal(result, 42);
  await assert.rejects(
    processWithMetrics(
      async () => {
        throw new Error("x");
      },
      { queueName: "q" },
    ),
    /x/,
  );
});

test("processWithMetrics: classifyError 커스텀 훅 우선 적용", async () => {
  const rec = recordingSink();
  await assert.rejects(
    processWithMetrics(
      async () => {
        throw new Error("any");
      },
      {
        queueName: "q",
        sink: rec.sink,
        classifyError: () => "schema_violation",
      },
    ),
  );
  assert.equal(rec.failed[0]?.reason, "schema_violation");
});

test("processWithMetrics: enqueuedAt 주입 시 duration = wait + process (세션 68 정밀화)", async () => {
  const rec = recordingSink();
  const clock = fakeClock();
  // enqueuedAt 은 processor 시작(= clock.now()) 보다 과거 — wait 시간 1200ms 을 가상함.
  const enqueuedAt = clock.now() - 1200;
  const result = await processWithMetrics(
    async () => {
      clock.advance(300); // 실 processor 는 300ms 소요
      return "ok";
    },
    { queueName: "q1", sink: rec.sink, clock: clock.now, enqueuedAt },
  );
  assert.equal(result, "ok");
  // duration = (now() - enqueuedAt) / 1000 = (처음 + 300 - (처음 - 1200)) / 1000 = 1.5s
  assert.deepEqual(rec.durations, [{ queue_name: "q1", outcome: "succeeded", seconds: 1.5 }]);
});

test("processWithMetrics: enqueuedAt 이 미래(clock skew) 면 0 으로 clamp", async () => {
  const rec = recordingSink();
  const clock = fakeClock();
  const enqueuedAt = clock.now() + 5000; // 비정상 — 미래 타임스탬프
  await processWithMetrics(
    async () => "ok",
    { queueName: "q", sink: rec.sink, clock: clock.now, enqueuedAt },
  );
  assert.equal(rec.durations.length, 1);
  assert.equal(rec.durations[0]!.seconds, 0, "미래 enqueuedAt 은 음수 duration 대신 0");
});

test("processWithMetrics: enqueuedAt 미주입 시 기존 processor-구간 유지 (세션 65 호환)", async () => {
  const rec = recordingSink();
  const clock = fakeClock();
  await processWithMetrics(
    async () => {
      clock.advance(400);
      return "ok";
    },
    { queueName: "q", sink: rec.sink, clock: clock.now },
  );
  assert.deepEqual(rec.durations, [{ queue_name: "q", outcome: "succeeded", seconds: 0.4 }]);
});

test("defaultClassifyQueueError: code vocabulary 매핑 커버리지", () => {
  assert.equal(defaultClassifyQueueError({ code: "AI_TIMEOUT" }), "ai_timeout");
  assert.equal(defaultClassifyQueueError({ code: "VENDOR_ERROR_5XX" }), "ai_5xx");
  assert.equal(defaultClassifyQueueError({ code: "5xx" }), "ai_5xx");
  assert.equal(defaultClassifyQueueError({ code: "SCHEMA_VIOLATION" }), "schema_violation");
  assert.equal(defaultClassifyQueueError({ code: "POST_PROCESS_ERROR" }), "post_processing");
  assert.equal(defaultClassifyQueueError({ code: "EXPORT_FAILED" }), "export");
  assert.equal(defaultClassifyQueueError({ code: "WEIRD" }), "other");
  assert.equal(defaultClassifyQueueError(null), "other");
  assert.equal(defaultClassifyQueueError(undefined), "other");
  assert.equal(defaultClassifyQueueError("string-err"), "other");
  assert.equal(defaultClassifyQueueError({}), "other");
});
