#!/usr/bin/env node
/**
 * web-preview 자동 E2E — Foundation Exit #1 checklist D 의 무인 변종.
 *
 * 단계:
 *   1) `build:public` 을 돌려 public/ 을 새로 생성.
 *   2) `serve.mjs` 를 임시 포트로 띄우고 "listening" 라인을 기다린다.
 *   3) `/`, `/public/sample/bundle.json` 을 HTTP 로 가져와 200 / content-type 검증.
 *   4) 컴파일된 `@geny/web-avatar/loader` 로 서버 URL 에 대해
 *      `loadWebAvatarBundle` 을 호출 → bundle→meta→atlas 체인 검증.
 *   5) (세션 45) happy-dom 으로 `<geny-avatar>` 실 DOM 라이프사이클을 HTTP URL 에 대해 검증 —
 *      setAttribute("src") → ready 이벤트 페이로드가 D-시각 체크리스트(상태/Manifest/Meta/Atlas)와
 *      1:1 대응하는지 어서션. Exit #1 의 "브라우저 수동 pass-through" 를 CI 로 승격.
 *   6) 서버 종료 + exit 0 (실패 시 non-zero).
 *
 * Playwright 같은 무거운 브라우저 자동화를 피하고 Node runtime 에서 루프를 완주.
 * happy-dom 은 loader 가 쓰는 `globalThis.fetch` 를 건드리지 않음 — Node 22 의 native fetch 가
 * HTTP 경로로 번들을 읽는다 (세션 23 의 file:// 경로 테스트와 상보적).
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

const KEEP_PUBLIC = process.env.E2E_KEEP_PUBLIC === "1";

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
  await runLoaderChain(`${base}/public/sample/bundle.json`);
  await runDomLifecycle(`${base}/public/sample/bundle.json`);
  log("✅ web-preview e2e pass");
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
  // 이후 stdout 은 드레인만 (블록 방지)
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
  // 바디를 완전히 드레인해서 소켓 누수 방지.
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
  assert.equal(bundle.manifest.template_version, "1.3.0");
  assert.equal(bundle.manifest.avatar_id, "avt.preview.halfbody.demo");
  assert.ok(bundle.manifest.files.length >= 3, "manifest.files >=3");

  assert.ok(bundle.meta.parameters.length > 0, "meta.parameters non-empty");
  assert.ok(bundle.meta.parts.length > 0, "meta.parts non-empty");
  assert.ok(bundle.meta.textures.length >= 1, "meta.textures includes base.png");
  assert.equal(bundle.meta.textures[0].path, "textures/base.png");

  assert.ok(bundle.atlas, "atlas resolved");
  assert.equal(bundle.atlas.textures.length, 1);
  assert.equal(bundle.atlas.textures[0].path, "textures/base.png");

  log(`  ✓ manifest files=${bundle.manifest.files.length}, meta parameters=${bundle.meta.parameters.length}, atlas textures=${bundle.atlas.textures.length}`);
}

/**
 * 세션 45 — `<geny-avatar>` DOM 라이프사이클을 HTTP URL 에 대해 happy-dom 으로 검증.
 *
 * Exit #1 D-시각 체크리스트(상태 박스 / Bundle Manifest / Web Avatar Meta / Atlas) 의
 * 각 필드가 ready 이벤트 payload 에 존재·값 일치하는지 어서션. index.html 인라인 스크립트는
 * ev.detail 을 그대로 DOM 에 포맷할 뿐이므로 payload 검증이 DOM 렌더 정합성을 함의한다.
 *
 * 전략:
 *  - happy-dom Window 에서 HTMLElement/customElements/CustomEvent/Event/document 를 globalThis 주입.
 *  - globalThis.fetch 는 Node native 로 남겨두어 HTTP 경로가 그대로 동작.
 *    (세션 23 의 file:// 테스트는 happy-dom fetch 가 file:// 미지원이라 fs-fetch 로 override 했음.)
 *  - 컴파일된 element.js 의 registerGenyAvatar() 호출 → <geny-avatar> 생성 → src 세팅 → ready 대기.
 */
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

    assert.equal(manifest.kind, "web-avatar-bundle", "manifest.kind");
    assert.equal(manifest.template_id, "tpl.base.v1.halfbody", "manifest.template_id");
    assert.equal(manifest.template_version, "1.3.0", "manifest.template_version");
    assert.equal(manifest.avatar_id, "avt.preview.halfbody.demo", "manifest.avatar_id");
    assert.equal(manifest.files.length, 3, "manifest.files.length === 3");

    assert.ok(meta.parameters.length > 0, "meta.parameters >= 1");
    assert.ok(meta.parts.length > 0, "meta.parts >= 1");
    assert.ok(meta.motions.length > 0, "meta.motions >= 1");
    assert.ok(meta.expressions.length > 0, "meta.expressions >= 1");
    assert.ok(meta.physics_summary, "meta.physics_summary present");
    assert.ok(meta.atlas, "meta.atlas ref present");

    assert.ok(atlas, "atlas resolved");
    assert.equal(atlas.textures.length, 1, "atlas.textures.length === 1");
    assert.equal(atlas.textures[0].path, "textures/base.png", "atlas textures[0].path");
    assert.equal(atlas.textures[0].width, 4, "atlas textures[0].width");
    assert.equal(atlas.textures[0].height, 4, "atlas textures[0].height");
    assert.equal(atlas.textures[0].format, "png", "atlas textures[0].format");

    log(
      `  ✓ ready payload: ${manifest.template_id}@${manifest.template_version}, ` +
        `files=${manifest.files.length}, motions=${meta.motions.length}, ` +
        `expressions=${meta.expressions.length}, atlas=${atlas.textures[0].path}`,
    );
  } finally {
    await window.happyDOM.close().catch(() => undefined);
    for (const k of KEYS) g[k] = saved[k];
  }
}

function waitForEvent(target, name, timeoutMs) {
  return new Promise((resolveFn, rejectFn) => {
    const t = setTimeout(() => rejectFn(new Error(`timeout waiting for "${name}"`)), timeoutMs);
    const onEvt = (evt) => {
      clearTimeout(t);
      resolveFn(evt);
    };
    target.addEventListener(name, onEvt, { once: true });
  });
}

// ---- unused but kept for debug ergonomics ----
void KEEP_PUBLIC;
