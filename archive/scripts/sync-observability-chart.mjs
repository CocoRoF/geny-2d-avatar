#!/usr/bin/env node
// scripts/sync-observability-chart.mjs
//
// canonical observability config (`infra/observability/`) → Helm chart configs
// (`infra/helm/observability/configs/`) 로 byte-equal 동기화. Helm chart 의
// `configs/` 는 편집 대상이 아니다 — 항상 이 스크립트가 쓴다.
//
// 사용:
//   node scripts/sync-observability-chart.mjs         # 실 동기
//   node scripts/sync-observability-chart.mjs --check # drift 검사 (0 = sync, 1 = drift)

import { promises as fs } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const canonicalRoot = resolve(repoRoot, "infra", "observability");
const chartConfigsRoot = resolve(repoRoot, "infra", "helm", "observability", "configs");

/** 동기 대상 — canonical path → chart-relative dest path. */
const FILES = [
  { from: "prometheus/prometheus.yml", to: "prometheus.yml" },
  { from: "prometheus/rules/alerts.yml", to: "alerts.yml" },
  { from: "grafana/dashboards/01-job-health.json", to: "dashboards/01-job-health.json" },
  { from: "grafana/dashboards/02-cost.json", to: "dashboards/02-cost.json" },
  { from: "grafana/dashboards/03-quality.json", to: "dashboards/03-quality.json" },
];

const checkMode = process.argv.includes("--check");

async function readBuf(p) {
  return fs.readFile(p);
}

async function ensureDir(p) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  const drifts = [];
  for (const { from, to } of FILES) {
    const src = resolve(canonicalRoot, from);
    const dst = resolve(chartConfigsRoot, to);
    const srcBuf = await readBuf(src);
    let dstBuf = null;
    try {
      dstBuf = await readBuf(dst);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
    const same = dstBuf !== null && Buffer.compare(srcBuf, dstBuf) === 0;
    if (checkMode) {
      if (!same) {
        drifts.push({ from: relative(repoRoot, src), to: relative(repoRoot, dst) });
      }
    } else {
      if (same) continue;
      await ensureDir(dirname(dst));
      await fs.writeFile(dst, srcBuf);
      process.stderr.write(`[sync] ${relative(repoRoot, src)} → ${relative(repoRoot, dst)}\n`);
    }
  }
  if (checkMode) {
    if (drifts.length > 0) {
      process.stderr.write(
        `[sync-check] DRIFT detected — infra/helm/observability/configs/ out of sync.\n`,
      );
      for (const d of drifts) {
        process.stderr.write(`  - ${d.from} ↔ ${d.to}\n`);
      }
      process.stderr.write(
        `[sync-check] Fix: node scripts/sync-observability-chart.mjs\n`,
      );
      process.exit(1);
    }
    process.stderr.write(`[sync-check] ✔ chart configs in sync (${FILES.length} files)\n`);
  } else {
    process.stderr.write(`[sync] ✔ ${FILES.length} files synced\n`);
  }
}

main().catch((err) => {
  process.stderr.write(`[sync] ${err.stack ?? err}\n`);
  process.exit(1);
});
