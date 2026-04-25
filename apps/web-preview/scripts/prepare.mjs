#!/usr/bin/env node
/**
 * web-preview prepare 스크립트.
 *
 * 1) @geny/web-avatar 빌드 → `public/vendor/` 복사.
 * 2) halfbody v1.3.0 템플릿 로드 → `assembleWebAvatarBundle()` → `public/sample/`.
 * 3) aria 아바타 export → `assembleAvatarBundle()` → `public/cubism/` (Foundation Exit #1 의
 *    "Cubism export" 축 — 다운로드 가능하도록 동반 emit).
 *
 * 결과를 `public/` 에 모으기 때문에 `serve.mjs` 가 이 디렉터리만 서빙해도 완성된 E2E.
 */

import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
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

/**
 * 의존 패키지 dist 가 이미 존재하면 빌드 skip — 부모 (root pnpm dev) 가 직렬로
 * `build:packages` 를 먼저 처리해 두면 prepare 는 자산 복사만 담당해 동시-빌드 충돌이 없음.
 * standalone 실행 (예: 단독 `pnpm -F @geny/web-preview run build:public`) 에서는 dist 없으면 빌드.
 */
function buildIfMissing(name, distRel) {
  const distAbs = resolve(repoRoot, distRel);
  if (existsSync(distAbs)) {
    process.stdout.write(`[web-preview/prepare] skip build ${name} (dist exists)\n`);
    return;
  }
  step(`build ${name}`, () => {
    runPnpm(["--filter", name, "run", "build"]);
  });
}

step("clean public/", () => {
  rmSync(publicDir, { recursive: true, force: true });
  mkdirSync(publicDir, { recursive: true });
});

buildIfMissing("@geny/exporter-core", "packages/exporter-core/dist");
buildIfMissing("@geny/web-avatar", "packages/web-avatar/dist");

step("copy @geny/web-avatar dist → public/vendor", () => {
  const src = resolve(repoRoot, "packages/web-avatar/dist");
  cpSync(src, vendorDir, { recursive: true });
});

// P1.5 - Live2D 실 렌더 데모에 필요한 dist 추가 복사.
buildIfMissing("@geny/web-avatar-renderer", "packages/web-avatar-renderer/dist");
buildIfMissing("@geny/web-avatar-renderer-pixi", "packages/web-avatar-renderer-pixi/dist");
step("copy @geny/web-avatar-renderer dist → public/vendor/renderer", () => {
  const src = resolve(repoRoot, "packages/web-avatar-renderer/dist");
  cpSync(src, join(vendorDir, "renderer"), { recursive: true });
});
step("copy @geny/web-avatar-renderer-pixi dist → public/vendor/renderer-pixi", () => {
  const src = resolve(repoRoot, "packages/web-avatar-renderer-pixi/dist");
  cpSync(src, join(vendorDir, "renderer-pixi"), { recursive: true });
});
step("copy mao_pro runtime_assets → public/presets/mao_pro/", () => {
  // Live2D Framework 가 브라우저에서 model3.json 을 로드할 때 상대경로로
  // moc3/texture/motions/expressions 에 접근하므로 전체 디렉토리 복사.
  const src = resolve(repoRoot, "rig-templates/base/mao_pro/v1.0.0/runtime_assets");
  const dest = join(publicDir, "presets", "mao_pro");
  mkdirSync(join(publicDir, "presets"), { recursive: true });
  cpSync(src, dest, { recursive: true });
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

const templateDir = resolve(repoRoot, "rig-templates/base/halfbody/v1.3.0");

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
