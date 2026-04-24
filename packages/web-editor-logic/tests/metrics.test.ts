import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  METRIC_PHASE_LABELS,
  buildGenerateMetricEvents,
  summarizeMetricHistory,
  type GenerateMetricEvent,
} from "../src/index.js";

/**
 * β P2-S5 — Generate 텔레메트리 이벤트 스키마 회귀 고정.
 *
 * index.html 의 `emitGenerateMetrics` 가 이 순수 함수를 감싸고 있으므로,
 * 여기서 검증된 이벤트 구조는 그대로 P5 staging 로그 scraper 가 보게 된다.
 * 스키마/라벨 변경은 Grafana 쿼리 + alert rule 을 전부 깨뜨릴 수 있어
 * 단위 테스트로 fix.
 */

function at(events: readonly GenerateMetricEvent[], i: number): GenerateMetricEvent {
  const e = events[i];
  assert.ok(e, `events[${i}] exists`);
  return e;
}

describe("buildGenerateMetricEvents — 이벤트 개수 + 순서", () => {
  test("항상 phase 5 + total 1 = 6 이벤트 반환", () => {
    const events = buildGenerateMetricEvents({
      ts: 1_700_000_000_000,
      trigger: "user",
      template: "halfbody",
      prompt: "hello",
      phaseMs: [10, 20, 30, 40, 50],
      totalMs: 150,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(events.length, 6, "5 phase + 1 total = 6");
    for (let i = 0; i < 5; i += 1) {
      const e = at(events, i);
      assert.equal(e.kind, "generate.phase", `event ${i} kind=phase`);
      assert.equal(e.labels.phase, METRIC_PHASE_LABELS[i], `event ${i} phase label`);
    }
    const total = at(events, 5);
    assert.equal(total.kind, "generate.total");
    assert.equal(total.labels.phase, undefined, "total event 은 phase 라벨 없음");
  });

  test("phase 순서는 고정 (ingest → synth → atlas → swap → paint)", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [1, 2, 3, 4, 5],
      totalMs: 15,
      budgetMs: 5000,
      ok: true,
    });
    assert.deepEqual(
      events.slice(0, 5).map((e) => e.labels.phase),
      ["ingest", "synth", "atlas", "swap", "paint"],
    );
  });
});

describe("buildGenerateMetricEvents — Prometheus metric names", () => {
  test("phase event name = geny_generate_phase_duration_ms", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [10, 20, 30, 40, 50],
      totalMs: 150,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 0).name, "geny_generate_phase_duration_ms");
  });

  test("total event name = geny_generate_total_duration_ms", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [10, 20, 30, 40, 50],
      totalMs: 150,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, events.length - 1).name, "geny_generate_total_duration_ms");
  });
});

describe("buildGenerateMetricEvents — 라벨 의미", () => {
  test("trigger/template/ok 은 모든 phase + total 에 공통", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "auto",
      template: "fullbody",
      prompt: "p",
      phaseMs: [1, 2, 3, 4, 5],
      totalMs: 15,
      budgetMs: 5000,
      ok: false,
    });
    for (const e of events) {
      assert.equal(e.labels.trigger, "auto");
      assert.equal(e.labels.template, "fullbody");
      assert.equal(e.labels.ok, "false");
    }
  });

  test("budget_ms + budget_ok 는 total 에만 존재", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [1000, 1000, 1000, 1000, 1000],
      totalMs: 5000,
      budgetMs: 5000,
      ok: true,
    });
    const total = at(events, 5);
    assert.equal(total.labels.budget_ms, "5000");
    assert.equal(total.labels.budget_ok, "true", "5000 == budget → ok");

    const phase0 = at(events, 0);
    assert.equal(phase0.labels.budget_ms, undefined);
    assert.equal(phase0.labels.budget_ok, undefined);
  });

  test("totalMs 가 예산 초과면 budget_ok = false", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [1000, 1000, 1000, 1000, 1001],
      totalMs: 5001,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 5).labels.budget_ok, "false");
  });
});

describe("buildGenerateMetricEvents — value 정수화", () => {
  test("phase ms 는 Math.round 처리", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [0.4, 0.6, 42.5, 99.49, 100.51],
      totalMs: 243.5,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 0).value, 0);
    assert.equal(at(events, 1).value, 1);
    assert.equal(at(events, 2).value, 43);
    assert.equal(at(events, 3).value, 99);
    assert.equal(at(events, 4).value, 101);
    assert.equal(at(events, 5).value, 244);
  });

  test("phase ms 배열이 짧으면 나머지는 0 으로 채움", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [10, 20],
      totalMs: 30,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 0).value, 10);
    assert.equal(at(events, 1).value, 20);
    assert.equal(at(events, 2).value, 0);
    assert.equal(at(events, 3).value, 0);
    assert.equal(at(events, 4).value, 0);
  });
});

describe("buildGenerateMetricEvents — prompt_len", () => {
  test("total event 에 prompt 길이 (문자 수) 포함", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "hello world",
      phaseMs: [1, 1, 1, 1, 1],
      totalMs: 5,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 5).prompt_len, 11);
  });

  test("phase event 에는 prompt_len 없음", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "hello",
      phaseMs: [1, 1, 1, 1, 1],
      totalMs: 5,
      budgetMs: 5000,
      ok: true,
    });
    for (let i = 0; i < 5; i += 1) {
      assert.equal(at(events, i).prompt_len, undefined, `phase ${i} should not have prompt_len`);
    }
  });

  test("빈 프롬프트 → prompt_len = 0", () => {
    const events = buildGenerateMetricEvents({
      ts: 0,
      trigger: "auto",
      template: "halfbody",
      prompt: "",
      phaseMs: [0, 0, 0, 0, 0],
      totalMs: 0,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(events, 5).prompt_len, 0);
  });
});

describe("buildGenerateMetricEvents — sink fan-out 시뮬레이션", () => {
  test("events 배열을 iterate 하면 sink 가 6 회 호출됨", () => {
    const events = buildGenerateMetricEvents({
      ts: 1,
      trigger: "user",
      template: "halfbody",
      prompt: "hi",
      phaseMs: [1, 2, 3, 4, 5],
      totalMs: 15,
      budgetMs: 5000,
      ok: true,
    });
    const sink: GenerateMetricEvent[] = [];
    for (const e of events) sink.push(e);
    assert.equal(sink.length, 6);
    for (const e of sink) assert.equal(e.ts, 1);
  });

  test("auto vs user trigger 분리 — 같은 metric name, 다른 label", () => {
    const user = buildGenerateMetricEvents({
      ts: 0,
      trigger: "user",
      template: "halfbody",
      prompt: "",
      phaseMs: [1, 1, 1, 1, 1],
      totalMs: 5,
      budgetMs: 5000,
      ok: true,
    });
    const auto = buildGenerateMetricEvents({
      ts: 0,
      trigger: "auto",
      template: "halfbody",
      prompt: "",
      phaseMs: [1, 1, 1, 1, 1],
      totalMs: 5,
      budgetMs: 5000,
      ok: true,
    });
    assert.equal(at(user, 5).name, at(auto, 5).name, "같은 metric name");
    assert.notEqual(at(user, 5).labels.trigger, at(auto, 5).labels.trigger, "다른 trigger label");
  });
});

describe("summarizeMetricHistory — 빈 / 최소 입력", () => {
  test("이벤트 0개 → runCount=0, rate=null, lastRun=null", () => {
    const snap = summarizeMetricHistory([]);
    assert.equal(snap.eventCount, 0);
    assert.equal(snap.runCount, 0);
    assert.equal(snap.budgetOkCount, 0);
    assert.equal(snap.budgetOverCount, 0);
    assert.equal(snap.budgetOkRate, null, "0 nan vs null 구분");
    assert.equal(snap.avgTotalMs, null);
    assert.equal(snap.p95TotalMs, null);
    assert.equal(snap.lastRun, null);
    assert.deepEqual(snap.phaseAverages, {});
  });

  test("phase 만 있고 total 없음 → runCount=0 이지만 phaseAverages 채워짐", () => {
    const events: GenerateMetricEvent[] = [
      {
        ts: 1,
        kind: "generate.phase",
        name: "geny_generate_phase_duration_ms",
        value: 42,
        labels: { trigger: "user", template: "halfbody", ok: "true", phase: "ingest" },
      },
    ];
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.runCount, 0);
    assert.equal(snap.phaseAverages["ingest"], 42);
    assert.equal(snap.budgetOkRate, null);
    assert.equal(snap.lastRun, null);
  });
});

describe("summarizeMetricHistory — 단일 Generate (6 이벤트)", () => {
  test("buildGenerateMetricEvents 1 회 입력 → runCount=1, phase avg = 단일값", () => {
    const events = buildGenerateMetricEvents({
      ts: 1_700_000_000_000,
      trigger: "user",
      template: "halfbody",
      prompt: "hello",
      phaseMs: [10, 20, 30, 40, 50],
      totalMs: 150,
      budgetMs: 5000,
      ok: true,
    });
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.eventCount, 6);
    assert.equal(snap.runCount, 1);
    assert.equal(snap.budgetOkCount, 1);
    assert.equal(snap.budgetOverCount, 0);
    assert.equal(snap.budgetOkRate, 1);
    assert.equal(snap.phaseAverages["ingest"], 10);
    assert.equal(snap.phaseAverages["synth"], 20);
    assert.equal(snap.phaseAverages["atlas"], 30);
    assert.equal(snap.phaseAverages["swap"], 40);
    assert.equal(snap.phaseAverages["paint"], 50);
    assert.equal(snap.avgTotalMs, 150);
    assert.equal(snap.p95TotalMs, 150);
    assert.ok(snap.lastRun);
    assert.equal(snap.lastRun.ts, 1_700_000_000_000);
    assert.equal(snap.lastRun.ok, true);
    assert.equal(snap.lastRun.totalMs, 150);
    assert.equal(snap.lastRun.promptLen, 5);
    assert.equal(snap.lastRun.template, "halfbody");
    assert.equal(snap.lastRun.trigger, "user");
    assert.equal(snap.lastRun.budgetMs, 5000);
    assert.equal(snap.lastRun.budgetOk, true);
  });
});

describe("summarizeMetricHistory — 다회 Generate 집계", () => {
  test("3 회 (ok/ok/over) → rate=2/3, budgetOverCount=1, avg 합계/3", () => {
    const runs = [
      buildGenerateMetricEvents({
        ts: 1,
        trigger: "user",
        template: "halfbody",
        prompt: "",
        phaseMs: [10, 20, 30, 40, 50],
        totalMs: 150,
        budgetMs: 5000,
        ok: true,
      }),
      buildGenerateMetricEvents({
        ts: 2,
        trigger: "user",
        template: "halfbody",
        prompt: "",
        phaseMs: [20, 20, 20, 20, 20],
        totalMs: 100,
        budgetMs: 5000,
        ok: true,
      }),
      buildGenerateMetricEvents({
        ts: 3,
        trigger: "user",
        template: "halfbody",
        prompt: "",
        phaseMs: [1000, 1000, 1000, 1000, 2000],
        totalMs: 6000,
        budgetMs: 5000,
        ok: false,
      }),
    ];
    const events = runs.flat();
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.eventCount, 18);
    assert.equal(snap.runCount, 3);
    assert.equal(snap.budgetOkCount, 2);
    assert.equal(snap.budgetOverCount, 1);
    assert.ok(snap.budgetOkRate !== null);
    assert.ok(Math.abs(snap.budgetOkRate - 2 / 3) < 1e-9);
    assert.equal(snap.phaseAverages["ingest"], (10 + 20 + 1000) / 3);
    assert.equal(snap.phaseAverages["paint"], (50 + 20 + 2000) / 3);
    assert.equal(snap.avgTotalMs, (150 + 100 + 6000) / 3);
  });

  test("lastRun 은 가장 마지막에 나타난 total event 메타", () => {
    const events = [
      ...buildGenerateMetricEvents({
        ts: 100,
        trigger: "user",
        template: "halfbody",
        prompt: "first",
        phaseMs: [1, 1, 1, 1, 1],
        totalMs: 5,
        budgetMs: 5000,
        ok: true,
      }),
      ...buildGenerateMetricEvents({
        ts: 200,
        trigger: "auto",
        template: "fullbody",
        prompt: "second-run",
        phaseMs: [2, 2, 2, 2, 2],
        totalMs: 10,
        budgetMs: 5000,
        ok: false,
      }),
    ];
    const snap = summarizeMetricHistory(events);
    assert.ok(snap.lastRun);
    assert.equal(snap.lastRun.ts, 200);
    assert.equal(snap.lastRun.ok, false);
    assert.equal(snap.lastRun.template, "fullbody");
    assert.equal(snap.lastRun.trigger, "auto");
    assert.equal(snap.lastRun.promptLen, 10);
  });
});

describe("summarizeMetricHistory — p95 index", () => {
  test("5 샘플 [10,20,30,40,50] → p95 = 50 (ceil(4.75)-1 = 4)", () => {
    const events: GenerateMetricEvent[] = [10, 20, 30, 40, 50].map((ms, i) => ({
      ts: i,
      kind: "generate.total" as const,
      name: "geny_generate_total_duration_ms",
      value: ms,
      labels: {
        trigger: "user",
        template: "halfbody",
        ok: "true",
        budget_ms: "5000",
        budget_ok: "true",
      },
      prompt_len: 0,
    }));
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.p95TotalMs, 50);
  });

  test("20 샘플 1~20 → p95 = 19 (idx = ceil(19) - 1 = 18, 정렬 후 [18])", () => {
    const events: GenerateMetricEvent[] = Array.from({ length: 20 }, (_, i) => ({
      ts: i,
      kind: "generate.total" as const,
      name: "geny_generate_total_duration_ms",
      value: i + 1,
      labels: {
        trigger: "user",
        template: "halfbody",
        ok: "true",
        budget_ms: "5000",
        budget_ok: "true",
      },
      prompt_len: 0,
    }));
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.p95TotalMs, 19);
  });
});

describe("summarizeMetricHistory — 이상치 방어", () => {
  test("label 누락된 total event 는 budgetOk/over 카운트에서 제외", () => {
    const events: GenerateMetricEvent[] = [
      {
        ts: 0,
        kind: "generate.total",
        name: "geny_generate_total_duration_ms",
        value: 100,
        labels: { trigger: "user", template: "halfbody", ok: "true" },
        prompt_len: 0,
      },
    ];
    const snap = summarizeMetricHistory(events);
    assert.equal(snap.runCount, 1);
    assert.equal(snap.budgetOkCount, 0);
    assert.equal(snap.budgetOverCount, 0);
    assert.equal(snap.budgetOkRate, 0, "runCount=1, budgetOkCount=0 → rate=0");
  });

  test("phase label 누락된 phase event 는 phaseAverages 에서 제외", () => {
    const events: GenerateMetricEvent[] = [
      {
        ts: 0,
        kind: "generate.phase",
        name: "geny_generate_phase_duration_ms",
        value: 99,
        labels: { trigger: "user", template: "halfbody", ok: "true" },
      },
    ];
    const snap = summarizeMetricHistory(events);
    assert.deepEqual(snap.phaseAverages, {});
  });
});
