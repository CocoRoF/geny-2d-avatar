/**
 * `@geny/web-editor-logic/metrics` — β P2-S4 에서 index.html 인라인으로 도입된
 * `emitGenerateMetrics` 의 순수 이벤트 빌더. P2-S5 에서 별도 모듈로 승격해
 * node:test 회귀 커버리지 확보 (index.html 은 DOM/브라우저 wrapper 만 남김).
 *
 * `buildGenerateMetricEvents` 는 **side-effect 없음** — phase 배열 + total 을
 * 받아 5 phase event + 1 total event = **총 6 이벤트** 를 반환한다. emit 경로
 * (console.info / __genyMetricsSink fan-out) 는 호출자 책임. 이 분리가 있어야
 * P5 staging 의 log scraper 가 소비할 metric name/label 스키마를 DOM 없이
 * 스냅샷 테스트 가능.
 *
 * name 필드는 Prometheus metric naming 규약 (`geny_<domain>_<unit>`) 과
 * 1:1 — server-side `geny_ai_call_duration_seconds` (세션 64+) 와 같은 축으로
 * Grafana query 가능. labels 는 cardinality 를 일부러 작게 (trigger/template/ok)
 * 유지해 시계열 폭발을 막는다.
 */

export const METRIC_PHASE_LABELS = ["ingest", "synth", "atlas", "swap", "paint"] as const;

export type GenerateMetricKind = "generate.phase" | "generate.total";

export interface GenerateMetricEvent {
  readonly ts: number;
  readonly kind: GenerateMetricKind;
  readonly name: string;
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly prompt_len?: number;
}

export interface BuildGenerateMetricsInput {
  readonly ts: number;
  /** "user" (Generate 클릭) 또는 "auto" (mount-time auto-preview). */
  readonly trigger: string;
  /** 현재 선택된 템플릿 id — halfbody / fullbody 분포 라벨. */
  readonly template: string;
  /** 프롬프트 원문. value 로 쓰진 않고 `prompt_len` 만 계산. */
  readonly prompt: string;
  /** phase 별 ms. 5 < 미만이면 나머지는 0 처리. */
  readonly phaseMs: readonly number[];
  /** 총 ms (ingest~paint 합과 근사). */
  readonly totalMs: number;
  /** β §7 예산 (ms). 기본 5000. budget_ok 라벨 계산에 쓰임. */
  readonly budgetMs: number;
  /** 성공/실패 플래그. error 경로에선 false 로 emit 해 p95 failure histogram 분리 가능. */
  readonly ok: boolean;
}

/**
 * Generate 한 회의 phase/total ms 를 6 개의 `GenerateMetricEvent` 배열로 변환.
 * emit side-effect 없음 — 호출자가 배열을 iterate 해 console.info / sink 로 전달.
 *
 * 반환 순서는 고정: phase 0~4 (ingest → synth → atlas → swap → paint) → total.
 * 라벨 순서는 Prometheus exposition 에 영향 없지만, 스냅샷 테스트 안정성을 위해
 * 일정한 property 삽입 순서 유지.
 */
export function buildGenerateMetricEvents(
  input: BuildGenerateMetricsInput,
): GenerateMetricEvent[] {
  const baseLabels = {
    trigger: input.trigger,
    template: input.template,
    ok: input.ok ? "true" : "false",
  };
  const events: GenerateMetricEvent[] = [];
  for (let i = 0; i < METRIC_PHASE_LABELS.length; i += 1) {
    const phase = METRIC_PHASE_LABELS[i] as string;
    events.push({
      ts: input.ts,
      kind: "generate.phase",
      name: "geny_generate_phase_duration_ms",
      value: Math.round(input.phaseMs[i] ?? 0),
      labels: { ...baseLabels, phase },
    });
  }
  events.push({
    ts: input.ts,
    kind: "generate.total",
    name: "geny_generate_total_duration_ms",
    value: Math.round(input.totalMs),
    labels: {
      ...baseLabels,
      budget_ms: String(input.budgetMs),
      budget_ok: input.totalMs <= input.budgetMs ? "true" : "false",
    },
    prompt_len: input.prompt.length,
  });
  return events;
}

/**
 * (β P2-S6) dev `?debug=metrics` 패널용 집계. `buildGenerateMetricEvents` 가
 * emit 한 순수 이벤트 배열만 입력받아 **side-effect 없이** 카운트/평균/p95 를
 * 계산한다. DOM/브라우저 의존성 없이 node:test 로 회귀 고정.
 *
 * - `runCount` — "generate.total" 이벤트 개수 (한 Generate 클릭 당 1).
 * - `budgetOkCount` / `budgetOverCount` — total 이벤트의 `labels.budget_ok`
 *   분포. 두 값의 합은 runCount 와 일치.
 * - `budgetOkRate` — budgetOkCount / runCount. runCount=0 이면 `null` (0 을
 *   리턴하면 "100% 실패" 로 오인될 수 있어 분리).
 * - `phaseAverages` — phase → 평균 ms. 관측되지 않은 phase 는 키 자체 없음.
 * - `lastRun` — 마지막 total 이벤트의 요약 (ts, ok, totalMs, promptLen,
 *   template, trigger).  없으면 `null`.
 * - `p95TotalMs` — runCount ≥ 1 이면 sort + index ceil(0.95·n) 의 rudimentary
 *   p95. β 단계의 상대적 추세 파악용 — 실 SLO 는 P5 Prometheus histogram.
 */
export interface MetricRunSummary {
  readonly ts: number;
  readonly ok: boolean;
  readonly totalMs: number;
  readonly promptLen: number;
  readonly template: string;
  readonly trigger: string;
  readonly budgetMs: number;
  readonly budgetOk: boolean;
}

export interface MetricHistorySnapshot {
  readonly eventCount: number;
  readonly runCount: number;
  readonly budgetOkCount: number;
  readonly budgetOverCount: number;
  readonly budgetOkRate: number | null;
  readonly phaseAverages: Readonly<Record<string, number>>;
  readonly avgTotalMs: number | null;
  readonly p95TotalMs: number | null;
  readonly lastRun: MetricRunSummary | null;
}

export function summarizeMetricHistory(
  events: readonly GenerateMetricEvent[],
): MetricHistorySnapshot {
  const phaseSums: Record<string, { sum: number; count: number }> = {};
  const totals: number[] = [];
  let budgetOkCount = 0;
  let budgetOverCount = 0;
  let lastRun: MetricRunSummary | null = null;

  for (const e of events) {
    if (e.kind === "generate.phase") {
      const phase = e.labels["phase"];
      if (typeof phase !== "string") continue;
      const entry = phaseSums[phase] ?? { sum: 0, count: 0 };
      entry.sum += e.value;
      entry.count += 1;
      phaseSums[phase] = entry;
    } else if (e.kind === "generate.total") {
      totals.push(e.value);
      const okStr = e.labels["budget_ok"];
      const budgetOk = okStr === "true";
      if (okStr === "true") budgetOkCount += 1;
      else if (okStr === "false") budgetOverCount += 1;
      const budgetMsStr = e.labels["budget_ms"];
      const budgetMs = budgetMsStr !== undefined ? Number(budgetMsStr) : 0;
      lastRun = {
        ts: e.ts,
        ok: e.labels["ok"] === "true",
        totalMs: e.value,
        promptLen: e.prompt_len ?? 0,
        template: e.labels["template"] ?? "unknown",
        trigger: e.labels["trigger"] ?? "unknown",
        budgetMs: Number.isFinite(budgetMs) ? budgetMs : 0,
        budgetOk,
      };
    }
  }

  const phaseAverages: Record<string, number> = {};
  for (const [phase, entry] of Object.entries(phaseSums)) {
    phaseAverages[phase] = entry.count > 0 ? entry.sum / entry.count : 0;
  }

  const runCount = totals.length;
  const avgTotalMs = runCount > 0 ? totals.reduce((s, v) => s + v, 0) / runCount : null;
  let p95TotalMs: number | null = null;
  if (runCount > 0) {
    const sorted = [...totals].sort((a, b) => a - b);
    const idx = Math.min(runCount - 1, Math.ceil(0.95 * runCount) - 1);
    p95TotalMs = sorted[Math.max(0, idx)] ?? null;
  }

  return {
    eventCount: events.length,
    runCount,
    budgetOkCount,
    budgetOverCount,
    budgetOkRate: runCount > 0 ? budgetOkCount / runCount : null,
    phaseAverages,
    avgTotalMs,
    p95TotalMs,
    lastRun,
  };
}
