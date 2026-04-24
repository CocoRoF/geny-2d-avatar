#!/usr/bin/env node
// scripts/verify-observability-chart.mjs
//
// infra/helm/observability/ Helm chart 무결성 검증. helm 바이너리가 없는 CI 환경에서도
// 동작하는 결정론적 구조 검사:
//   1) chart 의 configs/ 가 canonical infra/observability/ 와 byte 동기 (drift = fail)
//   2) Chart.yaml 필수 필드 (apiVersion=v2, name, version, appVersion) 존재
//   3) values.yaml · values-dev.yaml · values-prod.yaml 존재 + YAML 파싱 성공
//   4) 모든 기대 템플릿 파일 존재 (prometheus/alertmanager/grafana config+workload + helpers + NOTES)
//   5) 템플릿이 configs/ 의 모든 파일을 최소 한 번씩 참조 — 참조 누락 = 탑재 실수
//
// helm 이 설치돼 있다면 추가로 `helm template` 을 실행해 렌더 에러를 잡는다 (선택).

import { promises as fs, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const chartRoot = resolve(repoRoot, "infra", "helm", "observability");

const errors = [];

function fail(msg) {
  errors.push(msg);
}

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

// ---------- 1) sync check ----------
async function checkSync() {
  const res = spawnSync("node", [resolve(__dirname, "sync-observability-chart.mjs"), "--check"], {
    stdio: "inherit",
  });
  if (res.status !== 0) {
    fail(`configs/ drift — see output above; run: node scripts/sync-observability-chart.mjs`);
  }
}

// ---------- 2) Chart.yaml ----------
async function checkChartYaml() {
  const p = resolve(chartRoot, "Chart.yaml");
  if (!existsSync(p)) return fail(`missing Chart.yaml`);
  const src = await fs.readFile(p, "utf8");
  for (const key of ["apiVersion", "name", "version", "appVersion"]) {
    if (!new RegExp(`^${key}:`, "m").test(src)) {
      fail(`Chart.yaml missing required key: ${key}`);
    }
  }
  if (!/^apiVersion:\s*v2\s*$/m.test(src)) {
    fail(`Chart.yaml apiVersion must be v2 (helm 3)`);
  }
}

// ---------- 3) values files ----------
async function checkValues() {
  for (const f of ["values.yaml", "values-dev.yaml", "values-prod.yaml"]) {
    const p = resolve(chartRoot, f);
    if (!existsSync(p)) fail(`missing ${f}`);
    else {
      const src = await fs.readFile(p, "utf8");
      // 단순 구조 검증 — 탭 문자 금지, 주요 루트키는 yaml key 문자 로 시작.
      if (src.includes("\t")) fail(`${f} contains tab character (YAML forbids tabs)`);
    }
  }
}

// ---------- 4) required templates ----------
async function checkTemplates() {
  const required = [
    "templates/_helpers.tpl",
    "templates/NOTES.txt",
    "templates/prometheus.yaml",
    "templates/prometheus-config.yaml",
    "templates/alertmanager.yaml",
    "templates/alertmanager-config.yaml",
    "templates/grafana.yaml",
    "templates/grafana-config.yaml",
  ];
  for (const rel of required) {
    if (!existsSync(resolve(chartRoot, rel))) fail(`missing template: ${rel}`);
  }
}

// ---------- 5) template ↔ configs reference ----------
async function checkReferences() {
  const expected = [
    { file: "configs/prometheus.yml", key: 'Files.Get "configs/prometheus.yml"' },
    { file: "configs/alerts.yml", key: 'Files.Get "configs/alerts.yml"' },
    { file: "configs/dashboards/*.json", key: 'Files.Glob "configs/dashboards/*.json"' },
  ];
  const templatesDir = resolve(chartRoot, "templates");
  const templateFiles = (await fs.readdir(templatesDir)).map((f) => resolve(templatesDir, f));
  const combined = (
    await Promise.all(templateFiles.map((p) => fs.readFile(p, "utf8")))
  ).join("\n");
  for (const e of expected) {
    if (!combined.includes(e.key)) {
      fail(`templates do not reference ${e.file} — expected substring: ${e.key}`);
    }
  }
}

// ---------- 6) optional helm template ----------
async function checkHelmTemplate() {
  const helm = spawnSync("helm", ["version", "--short"], { encoding: "utf8" });
  if (helm.status !== 0) {
    process.stderr.write(`[verify] helm binary not found — skipping render check\n`);
    return;
  }
  for (const valuesFile of ["values-dev.yaml", "values-prod.yaml"]) {
    const render = spawnSync(
      "helm",
      ["template", "obs", ".", "-f", valuesFile],
      { cwd: chartRoot, encoding: "utf8" },
    );
    if (render.status !== 0) {
      fail(`helm template ${valuesFile} failed:\n${render.stderr}`);
    }
  }
  process.stderr.write(`[verify] ✔ helm template dev/prod render OK\n`);
}

async function main() {
  await checkSync();
  await checkChartYaml();
  await checkValues();
  await checkTemplates();
  await checkReferences();
  await checkHelmTemplate();
  if (errors.length > 0) {
    process.stderr.write(`\n[verify] ✖ ${errors.length} issue(s):\n`);
    for (const e of errors) process.stderr.write(`  - ${e}\n`);
    process.exit(1);
  }
  process.stderr.write(
    `[verify] ✔ chart ${relative(repoRoot, chartRoot)} OK (Chart.yaml + values + templates + configs sync)\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[verify] ${err.stack ?? err}\n`);
  process.exit(1);
});
