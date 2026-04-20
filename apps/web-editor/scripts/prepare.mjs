#!/usr/bin/env node
/**
 * web-editor prepare 스크립트.
 *
 * 1) @geny/web-avatar 빌드 → public/vendor/ 복사 (Custom Element JS).
 * 2) halfbody v1.2.0 템플릿 로드 → assembleWebAvatarBundle() → public/sample/.
 *
 * Foundation 레벨 에디터는 web-preview 와 동일한 halfbody 번들을 공유 — 에디터 UX 를
 * 데모하는 목적이라 실 아바타 저장/재생성 없이 "기본 레이아웃 + 프리뷰" 만. Cubism 번들은
 * 에디터 범위 밖(세션 82+ Runtime 에서 Export 액션 연결).
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..");
const publicDir = join(appRoot, "public");
const vendorDir = join(publicDir, "vendor");
const sampleDir = join(publicDir, "sample");

function step(label, fn) {
  process.stdout.write(`[web-editor/prepare] ${label}… `);
  const t0 = Date.now();
  const result = fn();
  process.stdout.write(`done (${Date.now() - t0}ms)\n`);
  return result;
}

step("clean public/", () => {
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
});

step("build @geny/exporter-core", () => {
  runPnpm(["--filter", "@geny/exporter-core", "run", "build"]);
});

step("build @geny/web-avatar", () => {
  runPnpm(["--filter", "@geny/web-avatar", "run", "build"]);
});

step("copy @geny/web-avatar dist → public/vendor", () => {
  const src = resolve(repoRoot, "packages/web-avatar/dist");
  cpSync(src, vendorDir, { recursive: true });
});

const exporterDist = resolve(repoRoot, "packages/exporter-core/dist");
const { assembleWebAvatarBundle } = await import(
  pathToFileURL(join(exporterDist, "web-avatar-bundle.js")).toString()
);
const { loadTemplate } = await import(
  pathToFileURL(join(exporterDist, "loader.js")).toString()
);

const templateDir = resolve(repoRoot, "rig-templates/base/halfbody/v1.2.0");

step("assemble halfbody web-avatar bundle → public/sample/", () => {
  const tpl = loadTemplate(templateDir);
  mkdirSync(sampleDir, { recursive: true });
  const result = assembleWebAvatarBundle(tpl, sampleDir, {
    avatarId: "avt.editor.halfbody.demo",
  });
  process.stdout.write(`\n  files=${result.files.length} `);
  process.stdout.write(`bytes=${result.files.reduce((s, f) => s + f.bytes, 0)}`);
});

step("write public/INDEX.json manifest", () => {
  const manifest = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    note: "Static artifacts for the Foundation editor scaffold. Regenerate with `pnpm run build:public`.",
    web_avatar_bundle: "./sample/bundle.json",
    vendor: "./vendor/index.js",
  };
  writeFileSync(join(publicDir, "INDEX.json"), JSON.stringify(manifest, null, 2) + "\n");
});

process.stdout.write("[web-editor/prepare] ✅ ready — run `pnpm run serve`\n");

function runPnpm(args) {
  const res = spawnSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with code ${res.status}`);
  }
}
