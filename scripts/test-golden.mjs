#!/usr/bin/env node
// scripts/test-golden.mjs
//
// 단일 엔트리 골든 회귀 러너. 실행:
//   pnpm run test:golden
//
// 2026-04-24 P0.2 스코프 리셋 — OFF-GOAL 단계 13 종 제거. 현재 16 단계.
// 과거 30+ 단계 러너는 git history (commit 30d2215 이전) 에서 확인 가능.
//
// 현 단계 (모두 ALIGNED · ADJACENT):
//   1) validate-schemas                  — schema/v1 + rig-templates + samples
//   2) exporter-core unit tests          — 88 tests, canonicalJson + converters
//   3) bundle golden diff                — halfbody v1.3.0 bundle byte-equal
//   4) avatar bundle golden diff         — sample-01-aria (halfbody v1.3.0 기반)
//   5) web-avatar bundle golden diff     — halfbody v1.3.0 web-avatar bundle
//   6) web-preview e2e                   — loader + <geny-avatar> 체인
//   7) license-verifier tests            — registry 파서 + verify round-trip
//   8) ai-adapter-core tests             — deterministicSeed/registry/orchestrate/metrics (68 tests)
//   9) ai-adapter-nano-banana tests      — capability matrix + provenance round-trip
//  10) web-avatar dom lifecycle          — happy-dom 기반 Web Component 회귀
//  11) metrics-http tests                — /metrics + /healthz 핸들러 (12 tests)
//  12) post-processing tests             — alpha sanitation + color normalize (111 tests)
//  13) rig-template-lint                 — physics/parts/deformers 무결성 C1~C13
//  14) web-editor-logic tests            — categorize/prompt-slot-planner 회귀
//  15) web-avatar-renderer contracts     — Renderer* 계약 + null/logging 구현
//  16) web-editor-renderer tests         — structure renderer 회귀
//  17) web-editor e2e                    — editor 스캐폴드 E2E
//
// 어느 단계든 실패하면 non-zero exit. stderr 에 힌트 출력.
//
// Phase 1 에서 신규 단계 (atlas extraction, mao_pro preset validation 등) 가 추가될 예정.

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
  { name: "metrics-http tests", run: runMetricsHttpTests },
  { name: "post-processing tests", run: runPostProcessingTests },
  { name: "rig-template-lint", run: runRigTemplateLintTests },
  { name: "web-editor-logic tests", run: runWebEditorLogicTests },
  { name: "web-avatar-renderer contracts tests", run: runWebAvatarRendererTests },
  { name: "web-editor-renderer tests", run: runWebEditorRendererTests },
  { name: "web-editor e2e", run: runWebEditorE2E },
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
      "          packages/exporter-core/tests/golden/halfbody_v1.3.0.*.json\n" +
      "          packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar*.json\n" +
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
    await run(
      "sh",
      [
        "-c",
        [
          "node",
          "packages/exporter-core/dist/cli.js",
          "bundle",
          "--template",
          "rig-templates/base/halfbody/v1.3.0",
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
          "packages/exporter-core/tests/golden/halfbody_v1.3.0.bundle.snapshot.json",
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
          "rig-templates/base/halfbody/v1.3.0",
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
          "packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar-bundle.snapshot.json",
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

async function runWebEditorLogicTests() {
  await run("pnpm", ["-F", "@geny/web-editor-logic", "test"], { cwd: repoRoot });
}

async function runWebAvatarRendererTests() {
  await run("pnpm", ["-F", "@geny/web-avatar-renderer", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/web-avatar-renderer", "test"], { cwd: repoRoot });
}

async function runWebEditorRendererTests() {
  await run("pnpm", ["-F", "@geny/web-editor-renderer", "test"], { cwd: repoRoot });
}

async function runWebEditorE2E() {
  await run("pnpm", ["-F", "@geny/web-editor", "test"], { cwd: repoRoot });
}

async function runLicenseVerifierTests() {
  await run("pnpm", ["-F", "@geny/license-verifier", "test"], { cwd: repoRoot });
}

async function runAIAdapterCoreTests() {
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "test"], { cwd: repoRoot });
}

async function runAIAdapterNanoBananaTests() {
  await run("pnpm", ["-F", "@geny/license-verifier", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/ai-adapter-nano-banana", "test"], { cwd: repoRoot });
}

async function runWebAvatarDomTests() {
  await run("pnpm", ["-F", "@geny/web-avatar", "test"], { cwd: repoRoot });
}

async function runPostProcessingTests() {
  await run("pnpm", ["-F", "@geny/post-processing", "test"], { cwd: repoRoot });
}

async function runMetricsHttpTests() {
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/metrics-http", "test"], { cwd: repoRoot });
}

async function runRigTemplateLintTests() {
  await run("node", ["scripts/rig-template/rig-template-lint.test.mjs"], { cwd: repoRoot });
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
