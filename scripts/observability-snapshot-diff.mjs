#!/usr/bin/env node
// scripts/observability-snapshot-diff.mjs
// 세션 80 — Prometheus exposition 스냅샷 drift 검사.
//
// staging 클러스터의 kube-prometheus-stack 이 실제로 수집하는 exposition 이
// Foundation 스냅샷 (`infra/observability/smoke-snapshot-session-75.txt`) 대비
// **구조적으로** 동일한지 비교한다. 샘플 값 차이는 무관(트래픽/타이밍 변동),
// metric 이름 + label key 집합이 바뀌면 대시보드/알람이 깨질 수 있으므로 drift 로 탐지.
//
// 사용:
//   node scripts/observability-snapshot-diff.mjs \
//     --baseline infra/observability/smoke-snapshot-session-75.txt \
//     --current  /tmp/staging-scrape.txt
//
// exit 0 = 구조 동일, exit 1 = drift (added/removed metric, label key 변화).

import { readFileSync } from "node:fs";

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

// Exposition 파싱 — 세션 75/76 파서 계약을 확장(label keys + sample count 수집).
// - `# TYPE <name> <kind>` 만 있어도 metric 노출로 인정 (샘플이 0건이어도 선언 OK).
// - 샘플 라인에서 `_bucket`/`_sum`/`_count` 접미사는 base name 으로 축약 (세션 75 D6).
//   이유: 카탈로그는 base name 으로 선언되므로 drift 기준도 base name.
// - label 키 집합은 **모든 접미사 변종의 합집합** — histogram `_bucket` 의 `le` 를
//   의도적으로 수집해 대시보드 쿼리 재현성 확보.
export function parseExposition(text) {
  const metrics = new Map(); // name -> { type?, labelKeys: Set, sampleCount }

  function touch(name) {
    if (!metrics.has(name)) metrics.set(name, { type: undefined, labelKeys: new Set(), sampleCount: 0 });
    return metrics.get(name);
  }

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;

    // # TYPE <name> <kind>
    const typeMatch = line.match(/^#\s*TYPE\s+(\S+)\s+(\S+)/);
    if (typeMatch) {
      const [, name, kind] = typeMatch;
      const base = stripSuffix(name);
      const entry = touch(base);
      entry.type = kind;
      continue;
    }
    if (line.startsWith("#")) continue;

    // 샘플 라인: metric_name{labels} value [timestamp]
    const sampleMatch = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+\S+/);
    if (!sampleMatch) continue;
    const [, fullName, labelBlob] = sampleMatch;
    const base = stripSuffix(fullName);
    const entry = touch(base);
    entry.sampleCount += 1;
    if (labelBlob) {
      for (const kv of splitLabels(labelBlob)) {
        entry.labelKeys.add(kv.key);
      }
    }
  }
  return metrics;
}

function stripSuffix(name) {
  return name.replace(/_(bucket|sum|count)$/, "");
}

// 라벨 파싱 — escape 된 값 안의 쉼표/따옴표 방어.
function splitLabels(blob) {
  const out = [];
  let i = 0;
  while (i < blob.length) {
    const eq = blob.indexOf("=", i);
    if (eq === -1) break;
    const key = blob.slice(i, eq).trim();
    let j = eq + 1;
    if (blob[j] !== '"') break;
    j++;
    let value = "";
    while (j < blob.length && blob[j] !== '"') {
      if (blob[j] === "\\" && j + 1 < blob.length) {
        value += blob[j + 1];
        j += 2;
      } else {
        value += blob[j];
        j++;
      }
    }
    j++; // closing quote
    out.push({ key, value });
    // skip comma
    while (j < blob.length && (blob[j] === "," || blob[j] === " ")) j++;
    i = j;
  }
  return out;
}

export function diffExpositions(baseline, current) {
  const baseNames = new Set(baseline.keys());
  const currNames = new Set(current.keys());
  const added = [...currNames].filter((n) => !baseNames.has(n)).sort();
  const removed = [...baseNames].filter((n) => !currNames.has(n)).sort();

  const labelDrift = [];
  const sampleCountDelta = [];
  for (const name of [...baseNames].filter((n) => currNames.has(n)).sort()) {
    const b = baseline.get(name);
    const c = current.get(name);
    const bKeys = new Set(b.labelKeys);
    const cKeys = new Set(c.labelKeys);
    const missingKeys = [...bKeys].filter((k) => !cKeys.has(k)).sort();
    const extraKeys = [...cKeys].filter((k) => !bKeys.has(k)).sort();
    if (missingKeys.length || extraKeys.length) {
      labelDrift.push({ metric: name, missingKeys, extraKeys });
    }
    if (b.sampleCount !== c.sampleCount) {
      sampleCountDelta.push({ metric: name, baseline: b.sampleCount, current: c.sampleCount });
    }
  }

  return { added, removed, labelDrift, sampleCountDelta };
}

function reportDiff(diff, { verbose }) {
  const { added, removed, labelDrift, sampleCountDelta } = diff;
  const structural = added.length + removed.length + labelDrift.length;
  console.log(`[diff] added=${added.length} removed=${removed.length} labelDrift=${labelDrift.length} sampleCountDelta=${sampleCountDelta.length}`);
  if (added.length) {
    console.log(`[diff] + added (in current, not baseline):`);
    for (const m of added) console.log(`  + ${m}`);
  }
  if (removed.length) {
    console.log(`[diff] - removed (in baseline, not current):`);
    for (const m of removed) console.log(`  - ${m}`);
  }
  if (labelDrift.length) {
    console.log(`[diff] ~ label drift:`);
    for (const { metric, missingKeys, extraKeys } of labelDrift) {
      const parts = [];
      if (missingKeys.length) parts.push(`missing=${missingKeys.join(",")}`);
      if (extraKeys.length) parts.push(`extra=${extraKeys.join(",")}`);
      console.log(`  ~ ${metric}: ${parts.join(" ")}`);
    }
  }
  if (verbose && sampleCountDelta.length) {
    console.log(`[diff] sample count delta (informational):`);
    for (const { metric, baseline, current } of sampleCountDelta) {
      console.log(`  · ${metric}: ${baseline} → ${current}`);
    }
  }
  return structural === 0;
}

async function main() {
  const args = parseArgv(process.argv.slice(2));
  const baselinePath = args["baseline"];
  const currentPath = args["current"];
  const verbose = args["verbose"] === true;
  if (!baselinePath || !currentPath) {
    console.error("usage: observability-snapshot-diff.mjs --baseline <path> --current <path> [--verbose]");
    process.exit(2);
  }
  const baseline = parseExposition(readFileSync(baselinePath, "utf8"));
  const current = parseExposition(readFileSync(currentPath, "utf8"));
  console.log(`[diff] baseline=${baselinePath} (${baseline.size} metrics)`);
  console.log(`[diff] current=${currentPath} (${current.size} metrics)`);
  const diff = diffExpositions(baseline, current);
  const ok = reportDiff(diff, { verbose });
  if (ok) {
    console.log(`[diff] ✅ no structural drift`);
    process.exit(0);
  }
  console.log(`[diff] ❌ structural drift detected`);
  process.exit(1);
}

import { fileURLToPath } from "node:url";
const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) : null;
if (entryPath && process.argv[1] === entryPath) {
  main().catch((err) => {
    console.error("[diff] fatal:", err);
    process.exit(2);
  });
}
