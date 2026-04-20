#!/usr/bin/env node
// scripts/observability-smoke.mjs
// 세션 75 — Observability smoke validation.
//
// 목적: Producer + Consumer 의 `/metrics` 엔드포인트를 스크랩해 `infra/observability/metrics-catalog.md`
// §2.1 (Queue state) + §3 (AI vendor calls) 로 선언된 메트릭 이름이 **두 서비스의 합집합**에서
// 모두 노출되는지 확인. 분할은 자연스럽다 (producer 쪽은 큐 depth/enqueue, consumer 쪽은
// 처리 지연/AI 어댑터), 하지만 카탈로그가 실제 배선과 맞는지 Foundation 단계에서 캡처.
//
// 전제: (1) Redis 가 `--redis-url` 로 떠있음 (2) producer/consumer 가 이미 기동돼 있음
//       — 본 스크립트는 **기동이 아니라 검증** 전용. `scripts/perf-harness.mjs` 와 달리 job 은
//       던지지 않는다 (스모크 로드는 호출자가 선행).
//
// Usage:
//   node scripts/observability-smoke.mjs \
//     --producer-url http://127.0.0.1:9091 \
//     --consumer-url http://127.0.0.1:9092 \
//     --expect-enqueued 20 \
//     --expect-ai-calls 20 \
//     --snapshot infra/observability/smoke-snapshot-session-75.txt

import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

function parseArgv(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

const ARGS = parseArgv(process.argv.slice(2));
const PRODUCER_URL = String(ARGS["producer-url"] ?? "http://127.0.0.1:9091");
const CONSUMER_URL = String(ARGS["consumer-url"] ?? "http://127.0.0.1:9092");
const EXPECT_ENQUEUED = Number(ARGS["expect-enqueued"] ?? 0);
const EXPECT_AI_CALLS = Number(ARGS["expect-ai-calls"] ?? 0);
const SNAPSHOT_PATH = ARGS["snapshot"] ? String(ARGS["snapshot"]) : null;

// 카탈로그 §2.1 + §3 필수 메트릭 이름. 합집합(producer+consumer) 에 전부 있어야 한다.
const REQUIRED_METRICS_21 = [
  "geny_queue_depth",
  "geny_queue_enqueued_total",
  "geny_queue_failed_total",
  "geny_queue_duration_seconds",
];
const REQUIRED_METRICS_3 = [
  "geny_ai_call_total",
  "geny_ai_call_duration_seconds",
  "geny_ai_call_cost_usd",
  "geny_ai_fallback_total",
];

async function scrape(url) {
  const res = await fetch(`${url}/metrics`);
  if (!res.ok) throw new Error(`${url}/metrics → HTTP ${res.status}`);
  return await res.text();
}

// Prometheus exposition 에서 메트릭 이름 집합 추출.
// `# TYPE <name> <kind>` 라인 + 샘플 라인(`<name>{...} <value>` 또는 `<name> <value>`) 둘 다 수집.
// 히스토그램은 `<name>_bucket` / `<name>_sum` / `<name>_count` 접미사를 제거해 base name 으로 축약.
export function extractMetricNames(exposition) {
  const names = new Set();
  for (const line of exposition.split("\n")) {
    if (!line || line.startsWith("# HELP")) continue;
    let name;
    if (line.startsWith("# TYPE ")) {
      const parts = line.split(/\s+/);
      name = parts[2];
    } else if (line.startsWith("#")) {
      continue;
    } else {
      const m = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\b/);
      if (!m) continue;
      name = m[1];
    }
    if (!name) continue;
    name = name.replace(/_(bucket|sum|count)$/, "");
    names.add(name);
  }
  return names;
}

// 특정 메트릭 이름 + 레이블 조건에 맞는 첫 샘플의 value 를 읽는다.
// labelFilter 가 주어지면 라벨이 전부 포함돼야 매치 (부분 일치 OK).
export function readSampleValue(exposition, metricName, labelFilter = {}) {
  const lines = exposition.split("\n");
  for (const line of lines) {
    if (line.startsWith("#") || !line.trim()) continue;
    if (!line.startsWith(metricName)) continue;
    const valueMatch = line.match(/\s([0-9e+\-.]+(?:NaN|Inf)?)\s*$/);
    if (!valueMatch) continue;
    const value = Number(valueMatch[1]);
    if (!Number.isFinite(value)) continue;
    const labelPart = line.slice(metricName.length).trim();
    const labels = {};
    const braces = labelPart.match(/^\{([^}]*)\}/);
    if (braces) {
      for (const kv of braces[1].split(",")) {
        const m = kv.match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"\s*$/);
        if (m) labels[m[1]] = m[2];
      }
    }
    let ok = true;
    for (const [k, v] of Object.entries(labelFilter)) {
      if (labels[k] !== v) {
        ok = false;
        break;
      }
    }
    if (ok) return value;
  }
  return null;
}

async function main() {
  console.log(`[obs-smoke] producer=${PRODUCER_URL} consumer=${CONSUMER_URL}`);
  const [producerExp, consumerExp] = await Promise.all([scrape(PRODUCER_URL), scrape(CONSUMER_URL)]);
  const producerNames = extractMetricNames(producerExp);
  const consumerNames = extractMetricNames(consumerExp);
  const union = new Set([...producerNames, ...consumerNames]);

  const violations = [];
  const report = {
    schema: "geny-obs-smoke-v1",
    timestamp: new Date().toISOString(),
    producer_url: PRODUCER_URL,
    consumer_url: CONSUMER_URL,
    producer_metric_names: [...producerNames].sort(),
    consumer_metric_names: [...consumerNames].sort(),
    union_metric_names: [...union].sort(),
    required: {
      "catalog_§2.1": REQUIRED_METRICS_21,
      "catalog_§3": REQUIRED_METRICS_3,
    },
    missing: { producer: [], consumer: [], union: [] },
    samples: {},
    pass: false,
  };

  for (const m of [...REQUIRED_METRICS_21, ...REQUIRED_METRICS_3]) {
    if (!union.has(m)) {
      report.missing.union.push(m);
      violations.push(`missing ${m} — neither producer nor consumer exposes it`);
    }
    if (!producerNames.has(m)) report.missing.producer.push(m);
    if (!consumerNames.has(m)) report.missing.consumer.push(m);
  }

  const enqueued = readSampleValue(producerExp, "geny_queue_enqueued_total");
  report.samples.producer_enqueued_total = enqueued;
  if (EXPECT_ENQUEUED > 0) {
    if (enqueued === null) {
      violations.push(`geny_queue_enqueued_total sample missing on producer`);
    } else if (enqueued < EXPECT_ENQUEUED) {
      violations.push(
        `geny_queue_enqueued_total=${enqueued} < expected ${EXPECT_ENQUEUED} (smoke load may not have reached producer)`,
      );
    }
  }

  const aiCalls = readSampleValue(consumerExp, "geny_ai_call_total", { status: "success" });
  report.samples.consumer_ai_call_total_success = aiCalls;
  if (EXPECT_AI_CALLS > 0) {
    if (aiCalls === null) {
      violations.push(`geny_ai_call_total{status=success} sample missing on consumer`);
    } else if (aiCalls < EXPECT_AI_CALLS) {
      violations.push(
        `geny_ai_call_total{status=success}=${aiCalls} < expected ${EXPECT_AI_CALLS}`,
      );
    }
  }

  const aiDurationCount = readSampleValue(consumerExp, "geny_ai_call_duration_seconds_count");
  report.samples.consumer_ai_duration_count = aiDurationCount;
  if (EXPECT_AI_CALLS > 0 && (aiDurationCount === null || aiDurationCount < EXPECT_AI_CALLS)) {
    violations.push(
      `geny_ai_call_duration_seconds_count=${aiDurationCount} < expected ${EXPECT_AI_CALLS}`,
    );
  }

  const queueDurationCount = readSampleValue(consumerExp, "geny_queue_duration_seconds_count", {
    outcome: "succeeded",
  });
  report.samples.consumer_queue_duration_count = queueDurationCount;
  if (EXPECT_ENQUEUED > 0 && (queueDurationCount === null || queueDurationCount < EXPECT_ENQUEUED)) {
    violations.push(
      `geny_queue_duration_seconds_count{outcome=succeeded}=${queueDurationCount} < expected ${EXPECT_ENQUEUED}`,
    );
  }

  report.pass = violations.length === 0;
  report.violations = violations;

  if (SNAPSHOT_PATH) {
    const snap =
      `# observability smoke snapshot — ${report.timestamp}\n` +
      `# producer ${PRODUCER_URL}\n${producerExp.trim()}\n\n` +
      `# consumer ${CONSUMER_URL}\n${consumerExp.trim()}\n`;
    writeFileSync(SNAPSHOT_PATH, snap);
    console.log(`[obs-smoke] snapshot → ${SNAPSHOT_PATH}`);
  }

  console.log(`[obs-smoke] producer metric names: ${producerNames.size}`);
  console.log(`[obs-smoke] consumer metric names: ${consumerNames.size}`);
  console.log(`[obs-smoke] union: ${union.size}`);
  console.log(
    `[obs-smoke] samples: enqueued=${enqueued} ai_calls=${aiCalls} ai_dur_count=${aiDurationCount} q_dur_count=${queueDurationCount}`,
  );

  if (!report.pass) {
    console.error("[obs-smoke] ❌ violations:");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  console.log("[obs-smoke] ✅ all catalog §2.1 + §3 metrics present on union, samples above threshold");
  console.log(JSON.stringify(report, null, 2));
}

// CLI 가 직접 실행될 때만 main() — import 는 pure (테스트에서 extractMetricNames/readSampleValue 만 임포트 가능).
const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) : null;
if (entryPath && process.argv[1] === entryPath) {
  main().catch((err) => {
    console.error("[obs-smoke] error:", err);
    process.exit(1);
  });
}
