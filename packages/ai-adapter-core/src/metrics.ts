/**
 * docs/02 §9 + docs/05 §7.3 — AI 어댑터 orchestrator metric hook.
 *
 * `routeWithFallback`/`orchestrate` 에 `metrics?: MetricsHook` 를 넘기면 각 시도(attempt)에
 * 대해 `onCall(...)` 이, 폴백이 발생할 때마다 `onFallback(...)` 이 호출된다.
 * Hook 은 플러그형 — Prometheus 클라이언트/OpenTelemetry/로깅 등 어떤 백엔드에도 묶을
 * 수 있다. 기본은 `NoopMetricsHook` (아무 것도 하지 않음).
 *
 * 본 모듈은 의존성 없이 동작하는 **최소 Prometheus 레지스트리**도 제공한다 —
 * `InMemoryMetricsRegistry` + `createRegistryMetricsHook(reg)` 를 쓰면 즉시 `/metrics`
 * 엔드포인트에 붙일 수 있는 Prometheus text exposition format 을 얻는다.
 *
 * 레이블 규약은 `infra/observability/metrics-catalog.md` §3 와 1:1:
 *   - `geny_ai_call_total{vendor, model, stage, status}` (counter, status ∈ success|4xx|5xx|timeout|unsafe|other)
 *   - `geny_ai_call_duration_seconds{vendor, model, stage}` (histogram)
 *   - `geny_ai_call_cost_usd{vendor, model, stage}` (counter, success 만 누적)
 *   - `geny_ai_fallback_total{from_vendor, to_vendor, reason}` (counter)
 *
 * 저카디널리티 원칙 (catalog §0) — task_id / avatar_id 등은 **레이블에 넣지 않는다**.
 */

import { AdapterError } from "./errors.js";

export type AdapterCallStatus =
  | "success"
  | "4xx"
  | "5xx"
  | "timeout"
  | "unsafe"
  | "other";

/**
 * AdapterError.code (또는 unknown 에러) 를 Prometheus status 레이블 값으로 매핑.
 * catalog §3 `geny_ai_call_total.status` 와 정합.
 */
export function mapErrorToStatus(err: unknown): AdapterCallStatus {
  if (err instanceof AdapterError) {
    switch (err.code) {
      case "VENDOR_ERROR_4XX":
      case "CAPABILITY_MISMATCH":
      case "BUDGET_EXCEEDED":
      case "INVALID_OUTPUT":
      case "NO_ELIGIBLE_ADAPTER":
        return "4xx";
      case "VENDOR_ERROR_5XX":
      case "PROBE_FAILED":
        return "5xx";
      case "DEADLINE_EXCEEDED":
        return "timeout";
      case "UNSAFE_CONTENT":
        return "unsafe";
      default:
        return "other";
    }
  }
  // 네트워크 실패 등 비 AdapterError 는 5xx 와 등가(routeWithFallback 규약).
  return "5xx";
}

export interface AdapterCallEvent {
  vendor: string;
  model: string;
  stage: string;
  status: AdapterCallStatus;
  durationSeconds: number;
  /** success 일 때만 의미. 실패 케이스에서는 0 또는 생략. */
  costUsd?: number;
}

export interface AdapterFallbackEvent {
  fromVendor: string;
  toVendor: string;
  /** 폴백을 유발한 이전 어댑터의 실패 status. (4xx 는 애초에 폴백하지 않으므로 주로 5xx/timeout/unsafe) */
  reason: AdapterCallStatus;
}

export interface MetricsHook {
  onCall(ev: AdapterCallEvent): void;
  onFallback(ev: AdapterFallbackEvent): void;
}

export const NoopMetricsHook: MetricsHook = {
  onCall() {
    /* no-op */
  },
  onFallback() {
    /* no-op */
  },
};

// ---------------------------------------------------------------------------
// In-process Prometheus registry — 최소 구현
// ---------------------------------------------------------------------------

/**
 * 히스토그램 버킷 (초 단위). Prometheus 권고 + 어댑터 현실(대부분 수백 ms ~ 수십 초)
 * 에 맞춘 분포. catalog §0 명명 규약 준수.
 */
export const DEFAULT_DURATION_BUCKETS_SECONDS: readonly number[] = Object.freeze([
  0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60,
]);

type LabelRecord = Readonly<Record<string, string>>;

function canonicalizeLabels(labels: LabelRecord): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}="${escapeLabelValue(labels[k]!)}"`).join(",");
}

function escapeLabelValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/"/g, '\\"');
}

interface CounterSeries {
  labels: LabelRecord;
  value: number;
}

interface HistogramSeries {
  labels: LabelRecord;
  bucketCounts: number[];
  sum: number;
  count: number;
}

interface CounterMetric {
  name: string;
  help: string;
  type: "counter";
  series: Map<string, CounterSeries>;
}

interface HistogramMetric {
  name: string;
  help: string;
  type: "histogram";
  buckets: readonly number[];
  series: Map<string, HistogramSeries>;
}

interface GaugeSeries {
  labels: LabelRecord;
  value: number;
}

interface GaugeMetric {
  name: string;
  help: string;
  type: "gauge";
  series: Map<string, GaugeSeries>;
}

type Metric = CounterMetric | HistogramMetric | GaugeMetric;

export class InMemoryMetricsRegistry {
  private readonly metrics = new Map<string, Metric>();

  counter(name: string, help: string): CounterHandle {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type !== "counter") {
        throw new Error(`metric ${name} already registered as ${existing.type}`);
      }
      return new CounterHandle(existing);
    }
    const m: CounterMetric = { name, help, type: "counter", series: new Map() };
    this.metrics.set(name, m);
    return new CounterHandle(m);
  }

  histogram(
    name: string,
    help: string,
    buckets: readonly number[] = DEFAULT_DURATION_BUCKETS_SECONDS,
  ): HistogramHandle {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type !== "histogram") {
        throw new Error(`metric ${name} already registered as ${existing.type}`);
      }
      return new HistogramHandle(existing);
    }
    const sorted = [...buckets].sort((a, b) => a - b);
    const m: HistogramMetric = {
      name,
      help,
      type: "histogram",
      buckets: Object.freeze(sorted),
      series: new Map(),
    };
    this.metrics.set(name, m);
    return new HistogramHandle(m);
  }

  gauge(name: string, help: string): GaugeHandle {
    const existing = this.metrics.get(name);
    if (existing) {
      if (existing.type !== "gauge") {
        throw new Error(`metric ${name} already registered as ${existing.type}`);
      }
      return new GaugeHandle(existing);
    }
    const m: GaugeMetric = { name, help, type: "gauge", series: new Map() };
    this.metrics.set(name, m);
    return new GaugeHandle(m);
  }

  /**
   * Prometheus text exposition format (v0.0.4) 로 직렬화. `/metrics` 엔드포인트에 그대로
   * 응답하면 Prometheus scrape 가능. 메트릭 이름 오름차순으로 deterministic.
   */
  renderPrometheusText(): string {
    const lines: string[] = [];
    const names = [...this.metrics.keys()].sort();
    for (const name of names) {
      const m = this.metrics.get(name)!;
      lines.push(`# HELP ${name} ${m.help}`);
      lines.push(`# TYPE ${name} ${m.type}`);
      const seriesKeys = [...m.series.keys()].sort();
      if (m.type === "counter") {
        for (const sk of seriesKeys) {
          const s = m.series.get(sk)! as CounterSeries;
          lines.push(formatSample(name, s.labels, s.value));
        }
      } else if (m.type === "gauge") {
        for (const sk of seriesKeys) {
          const s = m.series.get(sk)! as GaugeSeries;
          lines.push(formatSample(name, s.labels, s.value));
        }
      } else {
        for (const sk of seriesKeys) {
          const s = m.series.get(sk)! as HistogramSeries;
          let cumulative = 0;
          for (let i = 0; i < m.buckets.length; i++) {
            cumulative += s.bucketCounts[i] ?? 0;
            lines.push(
              formatSample(`${name}_bucket`, { ...s.labels, le: formatBucket(m.buckets[i]!) }, cumulative),
            );
          }
          lines.push(
            formatSample(`${name}_bucket`, { ...s.labels, le: "+Inf" }, s.count),
          );
          lines.push(formatSample(`${name}_sum`, s.labels, s.sum));
          lines.push(formatSample(`${name}_count`, s.labels, s.count));
        }
      }
    }
    return lines.join("\n") + "\n";
  }

  /** 테스트/디버깅용 — 레이블 조합의 현재 값. */
  getCounter(name: string, labels: LabelRecord): number {
    const m = this.metrics.get(name);
    if (!m || m.type !== "counter") return 0;
    const key = canonicalizeLabels(labels);
    return m.series.get(key)?.value ?? 0;
  }

  getHistogramCount(name: string, labels: LabelRecord): number {
    const m = this.metrics.get(name);
    if (!m || m.type !== "histogram") return 0;
    const key = canonicalizeLabels(labels);
    return m.series.get(key)?.count ?? 0;
  }

  getHistogramSum(name: string, labels: LabelRecord): number {
    const m = this.metrics.get(name);
    if (!m || m.type !== "histogram") return 0;
    const key = canonicalizeLabels(labels);
    return m.series.get(key)?.sum ?? 0;
  }

  getGauge(name: string, labels: LabelRecord): number {
    const m = this.metrics.get(name);
    if (!m || m.type !== "gauge") return 0;
    const key = canonicalizeLabels(labels);
    return m.series.get(key)?.value ?? 0;
  }

  /** 레지스트리를 초기 상태로. 테스트 격리용. */
  reset(): void {
    this.metrics.clear();
  }
}

function formatBucket(v: number): string {
  // 10 은 "10" 으로, 0.05 는 "0.05" 로 — Prometheus 관행.
  return Number.isInteger(v) ? v.toFixed(0) : String(v);
}

function formatSample(name: string, labels: LabelRecord, value: number): string {
  const canon = canonicalizeLabels(labels);
  return canon.length === 0 ? `${name} ${value}` : `${name}{${canon}} ${value}`;
}

export class CounterHandle {
  constructor(private readonly metric: CounterMetric) {}

  inc(labels: LabelRecord, delta = 1): void {
    if (delta < 0) throw new Error("counter delta must be >= 0");
    const key = canonicalizeLabels(labels);
    let s = this.metric.series.get(key);
    if (!s) {
      s = { labels: { ...labels }, value: 0 };
      this.metric.series.set(key, s);
    }
    s.value += delta;
  }
}

export class GaugeHandle {
  constructor(private readonly metric: GaugeMetric) {}

  set(labels: LabelRecord, value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error(`gauge set requires finite value, got ${value}`);
    }
    const key = canonicalizeLabels(labels);
    let s = this.metric.series.get(key);
    if (!s) {
      s = { labels: { ...labels }, value: 0 };
      this.metric.series.set(key, s);
    }
    s.value = value;
  }
}

export class HistogramHandle {
  constructor(private readonly metric: HistogramMetric) {}

  observe(labels: LabelRecord, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`histogram observe requires non-negative finite value, got ${value}`);
    }
    const key = canonicalizeLabels(labels);
    let s = this.metric.series.get(key);
    if (!s) {
      s = {
        labels: { ...labels },
        bucketCounts: new Array(this.metric.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      this.metric.series.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.metric.buckets.length; i++) {
      if (value <= (this.metric.buckets[i] ?? Infinity)) {
        s.bucketCounts[i] = (s.bucketCounts[i] ?? 0) + 1;
        return;
      }
    }
    // > 최대 버킷 — +Inf 에만 잡힘 (count 만 증가, bucketCounts 는 변경 없음)
  }
}

/**
 * InMemoryMetricsRegistry 에 catalog §3 메트릭 4종을 등록하고, 그걸 쓰는 MetricsHook
 * 을 돌려준다. 동일 레지스트리를 여러 orchestrator 가 공유할 수 있다.
 */
export function createRegistryMetricsHook(registry: InMemoryMetricsRegistry): MetricsHook {
  const callTotal = registry.counter(
    "geny_ai_call_total",
    "AI adapter invocations (catalog §3)",
  );
  const callDuration = registry.histogram(
    "geny_ai_call_duration_seconds",
    "AI adapter call latency seconds (catalog §3)",
  );
  const callCost = registry.counter(
    "geny_ai_call_cost_usd",
    "AI adapter cost in USD (success only, catalog §3)",
  );
  const fallbackTotal = registry.counter(
    "geny_ai_fallback_total",
    "AI adapter fallback events (catalog §3)",
  );
  return {
    onCall(ev) {
      const base = { vendor: ev.vendor, model: ev.model, stage: ev.stage };
      callTotal.inc({ ...base, status: ev.status }, 1);
      callDuration.observe(base, ev.durationSeconds);
      if (ev.status === "success" && ev.costUsd !== undefined && ev.costUsd > 0) {
        callCost.inc(base, ev.costUsd);
      }
    },
    onFallback(ev) {
      fallbackTotal.inc(
        { from_vendor: ev.fromVendor, to_vendor: ev.toVendor, reason: ev.reason },
        1,
      );
    },
  };
}
