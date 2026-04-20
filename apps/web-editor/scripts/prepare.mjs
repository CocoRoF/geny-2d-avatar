#!/usr/bin/env node
/**
 * web-editor prepare 스크립트.
 *
 * 1) @geny/web-avatar 빌드 → public/vendor/ 복사 (Custom Element JS).
 * 2) halfbody v1.2.0 + fullbody v1.0.0 템플릿 로드 → assembleWebAvatarBundle() →
 *    public/sample/halfbody/, public/sample/fullbody/ 각각 분리 저장.
 * 3) public/INDEX.json 에 templates 배열 기록 (id/label/bundle/avatarId) — 에디터 UI
 *    의 <select> 가 이 manifest 를 fetch 해 스위처를 채운다.
 *
 * 세션 87 — Stage 3 선행(fullbody 지원). 실 렌더러/Export 는 Stage 3+ 이후.
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
const sampleRoot = join(publicDir, "sample");

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

step("build @geny/web-editor-logic", () => {
  runPnpm(["--filter", "@geny/web-editor-logic", "run", "build"]);
});

step("build @geny/web-editor-renderer", () => {
  runPnpm(["--filter", "@geny/web-editor-renderer", "run", "build"]);
});

step("copy @geny/web-avatar dist → public/vendor", () => {
  const src = resolve(repoRoot, "packages/web-avatar/dist");
  cpSync(src, vendorDir, { recursive: true });
});

step("copy @geny/web-editor-logic dist → public/vendor/web-editor-logic", () => {
  const src = resolve(repoRoot, "packages/web-editor-logic/dist");
  const dst = join(vendorDir, "web-editor-logic");
  cpSync(src, dst, { recursive: true });
});

step("copy @geny/web-editor-renderer dist → public/vendor/web-editor-renderer", () => {
  const src = resolve(repoRoot, "packages/web-editor-renderer/dist");
  const dst = join(vendorDir, "web-editor-renderer");
  cpSync(src, dst, { recursive: true });
});

const exporterDist = resolve(repoRoot, "packages/exporter-core/dist");
const { assembleWebAvatarBundle } = await import(
  pathToFileURL(join(exporterDist, "web-avatar-bundle.js")).toString()
);
const { loadTemplate } = await import(
  pathToFileURL(join(exporterDist, "loader.js")).toString()
);

// 세션 87 — halfbody/fullbody 양쪽 지원. id 는 INDEX.json.templates 엔트리 키로 그대로
// 노출되므로 index.html 의 <select> value 와 1:1 매칭됨.
const TEMPLATES = [
  {
    id: "halfbody",
    label: "Halfbody v1.2.0",
    templateDir: resolve(repoRoot, "rig-templates/base/halfbody/v1.2.0"),
    avatarId: "avt.editor.halfbody.demo",
  },
  {
    id: "fullbody",
    label: "Fullbody v1.0.0",
    templateDir: resolve(repoRoot, "rig-templates/base/fullbody/v1.0.0"),
    avatarId: "avt.editor.fullbody.demo",
  },
];

const assembledTemplates = [];

for (const t of TEMPLATES) {
  step(`assemble ${t.id} web-avatar bundle → public/sample/${t.id}/`, () => {
    const tpl = loadTemplate(t.templateDir);
    const outDir = join(sampleRoot, t.id);
    mkdirSync(outDir, { recursive: true });
    const result = assembleWebAvatarBundle(tpl, outDir, {
      avatarId: t.avatarId,
    });
    process.stdout.write(`\n  files=${result.files.length} `);
    process.stdout.write(`bytes=${result.files.reduce((s, f) => s + f.bytes, 0)}`);
    assembledTemplates.push({
      id: t.id,
      label: t.label,
      bundle: `./sample/${t.id}/bundle.json`,
      avatar_id: t.avatarId,
    });
  });
}

step("write public/INDEX.json manifest", () => {
  const manifest = {
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    note: "Static artifacts for the Foundation editor scaffold. Regenerate with `pnpm run build:public`.",
    vendor: "./vendor/index.js",
    templates: assembledTemplates,
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
