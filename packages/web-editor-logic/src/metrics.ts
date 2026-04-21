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
