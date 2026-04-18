#!/usr/bin/env node
// scripts/test-golden.mjs
// 단일 엔트리 골든 회귀 러너. 실행:
//   node scripts/test-golden.mjs
//   pnpm run test:golden   (루트 package.json 에 정의)
//
// 동작:
//  1) 스키마 + rig template 검증 (scripts/validate-schemas.mjs).
//  2) @geny/exporter-core 빌드 + 단위 테스트 (88 tests, byte-equal golden; 세션 15 +7, 13 +8).
//  3) CLI 로 halfbody v1.2.0 번들을 임시 디렉터리에 조립, snapshot 을 기존 golden 과 byte 비교.
//  4) CLI `avatar` 로 sample-01-aria 번들을 조립, snapshot 을 아바타 단 golden 과 byte 비교 (세션 11).
//  5) CLI `web-avatar` 로 halfbody v1.2.0 web-avatar 번들을 조립, snapshot 을 golden 과 byte 비교 (세션 15).
//  6) apps/web-preview e2e — prepare+serve+fetch+loadWebAvatarBundle 체인 (세션 20). Foundation Exit #1 의 무인 축.
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
