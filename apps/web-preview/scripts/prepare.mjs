#!/usr/bin/env node
/**
 * web-preview prepare 스크립트.
 *
 * 1) @geny/web-avatar 빌드 → `public/vendor/` 복사.
 * 2) halfbody v1.2.0 템플릿 로드 → `assembleWebAvatarBundle()` → `public/sample/`.
 * 3) aria 아바타 export → `assembleAvatarBundle()` → `public/cubism/` (Foundation Exit #1 의
 *    "Cubism export" 축 — 다운로드 가능하도록 동반 emit).
 *
 * 결과를 `public/` 에 모으기 때문에 `serve.mjs` 가 이 디렉터리만 서빙해도 완성된 E2E.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..");
const publicDir = join(appRoot, "public");
const vendorDir = join(publicDir, "vendor");
const sampleDir = join(publicDir, "sample");
const cubismDir = join(publicDir, "cubism");

function step(label, fn) {
  process.stdout.write(`[web-preview/prepare] ${label}… `);
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
const { assembleAvatarBundle } = await import(
  pathToFileURL(join(exporterDist, "avatar-bundle.js")).toString()
);
const { loadTemplate } = await import(
  pathToFileURL(join(exporterDist, "loader.js")).toString()
);

const templateDir = resolve(repoRoot, "rig-templates/base/halfbody/v1.2.0");

step("assemble halfbody web-avatar bundle → public/sample/", () => {
  const tpl = loadTemplate(templateDir);
  mkdirSync(sampleDir, { recursive: true });
  const result = assembleWebAvatarBundle(tpl, sampleDir, {
    avatarId: "avt.preview.halfbody.demo",
  });
  process.stdout.write(`\n  files=${result.files.length} `);
  process.stdout.write(`bytes=${result.files.reduce((s, f) => s + f.bytes, 0)}`);
});

step("assemble aria Cubism bundle → public/cubism/", () => {
  const exportJson = JSON.parse(
    readFileSync(resolve(repoRoot, "samples/avatars/sample-01-aria.export.json"), "utf8"),
  );
  const rigTemplatesRoot = resolve(repoRoot, "rig-templates");
  mkdirSync(cubismDir, { recursive: true });
  const result = assembleAvatarBundle(exportJson, rigTemplatesRoot, cubismDir);
  process.stdout.write(`\n  files=${result.files.length} `);
  process.stdout.write(`bytes=${result.files.reduce((s, f) => s + f.bytes, 0)}`);
});

step("write public/INDEX.json manifest of artifacts", () => {
  const manifest = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    note:
      "Static artifacts for the Foundation preview. Regenerate with `pnpm run prepare`.",
    web_avatar_bundle: "./sample/bundle.json",
    cubism_bundle: "./cubism/bundle.json",
    vendor: "./vendor/index.js",
  };
  writeFileSync(join(publicDir, "INDEX.json"), JSON.stringify(manifest, null, 2) + "\n");
});

process.stdout.write("[web-preview/prepare] ✅ ready — run `pnpm run serve`\n");

function runPnpm(args) {
  const res = spawnSync("pnpm", args, { cwd: repoRoot, stdio: "inherit" });
  if (res.status !== 0) {
    throw new Error(`pnpm ${args.join(" ")} failed with code ${res.status}`);
  }
}
