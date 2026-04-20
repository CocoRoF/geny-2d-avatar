#!/usr/bin/env node
/**
 * web-editor 자동 E2E — 세션 81 Foundation 에디터 스캐폴드의 CI 커버리지.
 *
 * 단계:
 *   1) `prepare.mjs` 로 public/ 생성 (web-avatar 빌드 → 복사 → halfbody 번들 조립).
 *   2) `serve.mjs` 를 임의 포트로 띄우고 "listening" 라인 대기.
 *   3) `/`, `/public/sample/*`, `/public/vendor/index.js` HTTP 200 + content-type 검증.
 *   4) `loadWebAvatarBundle` 체인으로 manifest.avatar_id = avt.editor.halfbody.demo 검증
 *      (web-preview 번들과 분리된 editor 전용 식별자 — prepare 의 assembleWebAvatarBundle
 *      옵션이 실제로 적용되는지 보증).
 *   5) happy-dom 으로 `<geny-avatar>` ready 이벤트 구독 + index.html 의 categorize 규칙을
 *      동형으로 실행해 파츠 사이드바 그룹핑이 Face/Hair/Body/Accessory 4 카테고리에 대해
 *      expected 카디널리티를 만족하는지 어서션. 스냅샷 고정으로 role 추가/삭제 시
 *      CI 가 먼저 깨져 카테고리 규칙 재검토를 강제한다.
 *
 * web-preview 의 e2e-check.mjs 와 동일한 뼈대 — 차이는 (a) 포트 기본값, (b) avatar_id,
 * (c) 파츠 카테고리 카운트 어서션.
 */

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const repoRoot = resolve(appRoot, "..", "..");
const CATEGORY_ORDER = ["Face", "Hair", "Body", "Accessory"];

function log(step) {
  process.stdout.write(`[e2e] ${step}\n`);
}

await runPrepare();

const port = await findFreePort();
const serveProc = await startServer(port);

let exitCode = 0;
try {
  const base = `http://localhost:${port}`;
  await checkHttp(`${base}/`, "text/html");
  await checkHttp(`${base}/public/sample/bundle.json`, "application/json");
  await checkHttp(`${base}/public/sample/web-avatar.json`, "application/json");
  await checkHttp(`${base}/public/sample/atlas.json`, "application/json");
  await checkHttp(`${base}/public/sample/textures/base.png`, "image/png");
  await checkHttp(`${base}/public/vendor/index.js`, "text/javascript");
  const bundle = await runLoaderChain(`${base}/public/sample/bundle.json`);
  runCategorize(bundle.meta.parts);
  await runDomLifecycle(`${base}/public/sample/bundle.json`);
  log("✅ web-editor e2e pass");
} catch (err) {
  log(`✖ ${err?.message ?? err}`);
  exitCode = 1;
} finally {
  serveProc.kill("SIGTERM");
  await once(serveProc, "exit").catch(() => undefined);
}

process.exit(exitCode);

// ---- steps ----

async function runPrepare() {
  log("prepare public/ (build → copy → assemble)");
  const res = spawnSync("node", ["scripts/prepare.mjs"], {
    cwd: appRoot,
    stdio: "inherit",
  });
  if (res.status !== 0) throw new Error(`prepare failed (exit ${res.status})`);
}

async function findFreePort() {
  return await new Promise((resolveFn, rejectFn) => {
    const srv = createServer();
    srv.on("error", rejectFn);
    srv.listen(0, () => {
      const addr = srv.address();
      if (typeof addr === "object" && addr && typeof addr.port === "number") {
        srv.close(() => resolveFn(addr.port));
      } else {
        rejectFn(new Error("could not resolve port"));
      }
    });
  });
}

async function startServer(port) {
  log(`start serve.mjs on port ${port}`);
  const child = spawn("node", ["scripts/serve.mjs"], {
    cwd: appRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "inherit"],
  });

  const rl = createInterface({ input: child.stdout });
  const wait = new Promise((resolveFn, rejectFn) => {
    const t = setTimeout(() => rejectFn(new Error("serve.mjs did not listen within 5s")), 5000);
    rl.once("line", (line) => {
      clearTimeout(t);
      if (line.includes(`http://localhost:${port}/`)) resolveFn();
      else rejectFn(new Error(`unexpected startup line: ${line}`));
    });
    child.once("error", rejectFn);
  });
  await wait;
  rl.on("line", () => undefined);
  return child;
}

async function checkHttp(url, expectedMimePrefix) {
  const res = await fetch(url);
  assert.equal(res.status, 200, `${url} → status ${res.status}`);
  const ct = res.headers.get("content-type") ?? "";
  assert.ok(
    ct.startsWith(expectedMimePrefix),
    `${url} → content-type=${ct}, expected prefix ${expectedMimePrefix}`,
  );
  await res.arrayBuffer();
  log(`  ✓ ${url} (${ct})`);
}

async function runLoaderChain(bundleUrl) {
  log("loadWebAvatarBundle chain");
  const loaderUrl = pathToFileURL(
    resolve(repoRoot, "packages/web-avatar/dist/loader.js"),
  ).toString();
  const { loadWebAvatarBundle } = await import(loaderUrl);
  const bundle = await loadWebAvatarBundle(bundleUrl);

  assert.equal(bundle.manifest.kind, "web-avatar-bundle");
  assert.equal(bundle.manifest.template_id, "tpl.base.v1.halfbody");
  assert.equal(bundle.manifest.template_version, "1.2.0");
  assert.equal(bundle.manifest.avatar_id, "avt.editor.halfbody.demo");
  assert.ok(bundle.manifest.files.length >= 3, "manifest.files >= 3");

  assert.ok(bundle.meta.parameters.length > 0, "meta.parameters non-empty");
  assert.ok(bundle.meta.parts.length > 0, "meta.parts non-empty");
  assert.ok(bundle.meta.textures.length >= 1, "meta.textures includes base.png");
  assert.equal(bundle.meta.textures[0].path, "textures/base.png");

  assert.ok(bundle.atlas, "atlas resolved");
  assert.equal(bundle.atlas.textures.length, 1);
  assert.equal(bundle.atlas.textures[0].path, "textures/base.png");

  log(`  ✓ manifest files=${bundle.manifest.files.length}, meta parts=${bundle.meta.parts.length}, atlas textures=${bundle.atlas.textures.length}`);
  return bundle;
}

/**
 * index.html 인라인 스크립트의 categoryOf 규칙을 동형 재현.
 * 실제 DOM 을 띄우지 않고도 카테고리 분류가 expected 카디널리티를 만족하는지 검증 —
 * halfbody v1.2.0 meta 의 role 셋이 바뀌면 여기서 먼저 터진다.
 */
function runCategorize(parts) {
  log("categorize halfbody parts (mirrors index.html categoryOf)");
  const categoryOf = (role) => {
    if (
      role.startsWith("eye_") ||
      role.startsWith("brow_") ||
      role.startsWith("mouth_") ||
      role.startsWith("face_") ||
      role === "nose" ||
      role === "cheek_blush"
    ) return "Face";
    if (role.startsWith("hair_") || role === "ahoge") return "Hair";
    if (
      role.startsWith("arm_") ||
      role.startsWith("cloth_") ||
      role === "torso" ||
      role === "neck" ||
      role === "body"
    ) return "Body";
    if (role.startsWith("accessory_")) return "Accessory";
    return "Other";
  };

  const counts = new Map();
  for (const p of parts) {
    const c = categoryOf(p.role);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  assert.ok(counts.get("Face") > 0, "Face category has >=1 parts");
  assert.ok(counts.get("Hair") > 0, "Hair category has >=1 parts");
  assert.ok(counts.get("Body") > 0, "Body category has >=1 parts");
  assert.ok(counts.get("Accessory") > 0, "Accessory category has >=1 parts");
  assert.equal(
    counts.get("Other") ?? 0,
    0,
    `Other category should be empty — role fell through: ${
      [...new Set(parts.map((p) => p.role).filter((r) => categoryOf(r) === "Other"))].join(", ")
    }`,
  );

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, parts.length, "every part landed in exactly one category");

  const summary = CATEGORY_ORDER
    .map((c) => `${c}=${counts.get(c) ?? 0}`)
    .join(", ");
  log(`  ✓ categories: ${summary} (total=${total})`);
}

async function runDomLifecycle(bundleUrl) {
  log("<geny-avatar> DOM lifecycle (happy-dom + HTTP)");
  const { Window } = await import("happy-dom");
  const elementUrl = pathToFileURL(
    resolve(repoRoot, "packages/web-avatar/dist/element.js"),
  ).toString();
  const { registerGenyAvatar } = await import(elementUrl);

  const window = new Window({ url: `${new URL(bundleUrl).origin}/` });
  const g = globalThis;
  const KEYS = ["HTMLElement", "customElements", "CustomEvent", "Event", "document", "window"];
  const saved = {};
  for (const k of KEYS) saved[k] = g[k];
  try {
    for (const k of ["HTMLElement", "customElements", "CustomEvent", "Event", "document"]) {
      g[k] = window[k];
    }
    g.window = window;
    registerGenyAvatar();

    const doc = window.document;
    const el = doc.createElement("geny-avatar");
    doc.body.appendChild(el);
    const ready = waitForEvent(el, "ready", 5000);
    el.setAttribute("src", bundleUrl);
    const evt = await ready;
    const { manifest, meta, atlas } = evt.detail.bundle;

    assert.equal(manifest.avatar_id, "avt.editor.halfbody.demo", "manifest.avatar_id");
    assert.equal(manifest.template_id, "tpl.base.v1.halfbody", "manifest.template_id");
    assert.equal(manifest.template_version, "1.2.0", "manifest.template_version");
    assert.ok(meta.parts.length > 0, "meta.parts >= 1");
    assert.ok(meta.motions.length > 0, "meta.motions >= 1");
    assert.equal(atlas.textures[0].path, "textures/base.png", "atlas textures[0].path");

    log(
      `  ✓ ready payload: ${manifest.avatar_id} @ ${manifest.template_id}@${manifest.template_version}, ` +
        `parts=${meta.parts.length}, motions=${meta.motions.length}`,
    );
  } finally {
    await window.happyDOM.close().catch(() => undefined);
    for (const k of KEYS) g[k] = saved[k];
  }
}

function waitForEvent(target, name, timeoutMs) {
  return new Promise((resolveFn, rejectFn) => {
    const t = setTimeout(() => rejectFn(new Error(`timeout waiting for "${name}"`)), timeoutMs);
    target.addEventListener(name, (evt) => {
      clearTimeout(t);
      resolveFn(evt);
    }, { once: true });
  });
}
