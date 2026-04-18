#!/usr/bin/env node
// scripts/test-golden.mjs
// 단일 엔트리 골든 회귀 러너. 실행:
//   node scripts/test-golden.mjs
//   pnpm run test:golden   (루트 package.json 에 정의)
//
// 동작:
//  1) 스키마 + rig template 검증 (scripts/validate-schemas.mjs).
//  2) @geny/exporter-core 빌드 + 단위 테스트 (88 tests, byte-equal golden; 세션 15 +7, 13 +8).
//     이후 단계에서 각 TS 패키지는 자체 build/test 스크립트가 dist/ 를 만들어 workspace: 참조가 풀린다.
//  3) CLI 로 halfbody v1.2.0 번들을 임시 디렉터리에 조립, snapshot 을 기존 golden 과 byte 비교.
//  4) CLI `avatar` 로 sample-01-aria 번들을 조립, snapshot 을 아바타 단 golden 과 byte 비교 (세션 11).
//  5) CLI `web-avatar` 로 halfbody v1.2.0 web-avatar 번들을 조립, snapshot 을 golden 과 byte 비교 (세션 15).
//  6) apps/web-preview e2e — prepare+serve+fetch+loadWebAvatarBundle 체인 (세션 20). Foundation Exit #1 의 무인 축.
//  7) @geny/license-verifier tests — registry 파서 + verifyLicense/Provenance + tamper/expiry/scope 회귀 (세션 21).
//  8) @geny/ai-adapter-core tests — deterministicSeed/promptSha256 + AdapterRegistry 라우팅 + provenance 엔트리 빌더
//     + routeWithFallback() 헬퍼(5xx/4xx/safety/캐시 분기) + SafetyFilter 계약
//     + adapters.json catalog 파서 + factory 주입 + orchestrate() 단일 진입점 (세션 22/28/30, 52 tests).
//  9) @geny/ai-adapter-nano-banana tests — capability matrix + BUDGET/CAPABILITY/DEADLINE/INVALID_OUTPUT 에러 매핑
//     + adapter → provenance → license-verifier round-trip (세션 22).
// 10) @geny/web-avatar tests — happy-dom 기반 `<geny-avatar>` DOM lifecycle 회귀 + loader 단위 테스트 (세션 23).
// 11) infra/helm/observability — chart configs sync + 구조 검증 (Chart.yaml / values / templates / `.Files.Get` 참조). 세션 24.
// 12) @geny/ai-adapters-fallback tests — SDXL(edit/style_ref) + Flux-Fill(mask) Mock 의 capability 매트릭스 + AdapterRegistry
//     통합 폴백 순서(nano-banana → sdxl → flux-fill) + HttpSDXLClient · HttpFluxFillClient 회귀 (세션 25/28).
// 13) @geny/post-processing tests — docs/06 §4 Stage 1 alpha sanitation (premult 라운드트립 + noise threshold +
//     tight bbox + 파이프라인 결과 sha256 golden) (세션 26).
// 14) rig-template migrate — v1.0.0→v1.3.0 체인 + v1.2.0→v1.3.0 단일 hop + 결정론 (세션 27).
// 어느 단계든 실패하면 non-zero exit. stderr 에 힌트 출력.

import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const STEPS = [
  { name: "validate-schemas", run: runSchemas },
  { name: "exporter-core tests", run: runExporterCoreTests },
  { name: "bundle golden diff", run: runBundleDiff },
  { name: "avatar bundle golden diff", run: runAvatarBundleDiff },
  { name: "web-avatar bundle golden diff", run: runWebAvatarBundleDiff },
  { name: "web-preview e2e", run: runWebPreviewE2E },
  { name: "license-verifier tests", run: runLicenseVerifierTests },
  { name: "ai-adapter-core tests", run: runAIAdapterCoreTests },
  { name: "ai-adapter-nano-banana tests", run: runAIAdapterNanoBananaTests },
  { name: "web-avatar dom lifecycle", run: runWebAvatarDomTests },
  { name: "observability chart verify", run: runObservabilityChartVerify },
  { name: "ai-adapters-fallback tests", run: runAIAdaptersFallbackTests },
  { name: "post-processing tests", run: runPostProcessingTests },
  { name: "rig-template migrate tests", run: runRigMigrateTests },
];

const failed = [];
for (const step of STEPS) {
  const t0 = Date.now();
  process.stderr.write(`[golden] ▶ ${step.name}\n`);
  try {
    await step.run();
    process.stderr.write(`[golden] ✔ ${step.name} (${Date.now() - t0} ms)\n`);
  } catch (err) {
    process.stderr.write(`[golden] ✖ ${step.name}\n${err.stack ?? err}\n`);
    failed.push(step.name);
  }
}

if (failed.length > 0) {
  process.stderr.write(`\n[golden] FAILED: ${failed.join(", ")}\n`);
  process.stderr.write(
    "[golden] 골든이 의도적으로 바뀌어야 한다면 다음을 참고:\n" +
      "          packages/exporter-core/tests/golden/halfbody_v1.2.0.*.json\n" +
      "          packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar*.json\n" +
      "          samples/avatars/sample-01-aria.bundle.snapshot.json\n" +
      "          를 새 결과로 덮어쓴 뒤 PR 에 '골든 갱신' 명시.\n",
  );
  process.exit(1);
}

process.stderr.write("\n[golden] ✅ all steps pass\n");

// ---------- steps ----------

async function runSchemas() {
  await run("node", ["scripts/validate-schemas.mjs"], { cwd: repoRoot });
}

async function runExporterCoreTests() {
  await run("pnpm", ["-F", "@geny/exporter-core", "test"], { cwd: repoRoot });
}

async function runBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    // CLI 는 snapshot 을 stdout, 로그를 stderr 로 분리한다 (세션 09).
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "bundle",
          "--template",
          "rig-templates/base/halfbody/v1.2.0",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(
          repoRoot,
          "packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json",
        ),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runAvatarBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-avatar-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "avatar",
          "--spec",
          "samples/avatars/sample-01-aria.export.json",
          "--rig-templates-root",
          "rig-templates",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(repoRoot, "samples/avatars/sample-01-aria.bundle.snapshot.json"),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `avatar bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runWebAvatarBundleDiff() {
  const tmpDir = await mkdtemp(join(tmpdir(), "geny-golden-web-avatar-"));
  try {
    const snapPath = join(tmpDir, "snapshot.json");
    const bundleDir = join(tmpDir, "bundle");
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "web-avatar",
          "--template",
          "rig-templates/base/halfbody/v1.2.0",
          "--out-dir",
          bundleDir,
          ">",
          snapPath,
        ].join(" "),
      ],
      { cwd: repoRoot },
    );
    const [got, want] = await Promise.all([
      readFile(snapPath, "utf8"),
      readFile(
        resolve(
          repoRoot,
          "packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar-bundle.snapshot.json",
        ),
        "utf8",
      ),
    ]);
    if (got !== want) {
      const diffPath = join(tmpDir, "diff.txt");
      await writeFile(diffPath, `--- golden\n+++ actual\n${diffInline(want, got)}`);
      throw new Error(
        `web-avatar bundle snapshot differs from golden (see ${diffPath} for inline diff)`,
      );
    }
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

async function runWebPreviewE2E() {
  await run("pnpm", ["-F", "@geny/web-preview", "test"], { cwd: repoRoot });
}

async function runLicenseVerifierTests() {
  await run("pnpm", ["-F", "@geny/license-verifier", "test"], { cwd: repoRoot });
}

async function runAIAdapterCoreTests() {
  // build 가 dist/ 를 만들어야 nano-banana 가 import 가능. 먼저 core 를 빌드.
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "test"], { cwd: repoRoot });
}

async function runAIAdapterNanoBananaTests() {
  // license-verifier dist 가 필요 (round-trip 테스트에서 import).
  await run("pnpm", ["-F", "@geny/license-verifier", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "test"], { cwd: repoRoot });
}

async function runWebAvatarDomTests() {
  // loader + happy-dom 기반 `<geny-avatar>` DOM lifecycle (세션 23).
  await run("pnpm", ["-F", "@geny/web-avatar", "test"], { cwd: repoRoot });
}

async function runObservabilityChartVerify() {
  // infra/helm/observability chart 구조 + canonical sync (세션 24).
  await run("node", ["scripts/verify-observability-chart.mjs"], { cwd: repoRoot });
}

async function runAIAdaptersFallbackTests() {
  // SDXL + Flux-Fill skeleton + AdapterRegistry 통합 폴백 (세션 25).
  // nano-banana 는 router integration test 에서 dist/ import.
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapters-fallback", "test"], { cwd: repoRoot });
}

async function runPostProcessingTests() {
  // docs/06 §4 Stage 1 alpha sanitation skeleton (세션 26).
  await run("pnpm", ["-F", "@geny/post-processing", "test"], { cwd: repoRoot });
}

async function runRigMigrateTests() {
  // halfbody v1.0.0→v1.3.0 migrator 체인 회귀 (세션 27).
  await run("node", ["scripts/rig-template/migrate.test.mjs"], { cwd: repoRoot });
}

// ---------- util ----------

function run(cmd, args, opts) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", rejectPromise);
    child.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else rejectPromise(new Error(`${cmd} ${args.join(" ")} → exit ${code}`));
    });
  });
}

function diffInline(a, b) {
  const al = a.split("\n");
  const bl = b.split("\n");
  const n = Math.max(al.length, bl.length);
  const lines = [];
  for (let i = 0; i < n; i++) {
    if (al[i] === bl[i]) continue;
    if (al[i] !== undefined) lines.push(`- ${al[i]}`);
    if (bl[i] !== undefined) lines.push(`+ ${bl[i]}`);
  }
  return lines.slice(0, 200).join("\n");
}
