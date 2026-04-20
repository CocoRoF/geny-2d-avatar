#!/usr/bin/env node
/**
 * web-editor 자동 E2E — 세션 81 Foundation 에디터 스캐폴드의 CI 커버리지.
 *
 * 세션 87 — fullbody v1.0.0 추가. INDEX.json.templates 를 진실 소스로 삼아 halfbody/
 * fullbody 양쪽에 대해 HTTP/loader/DOM/카테고리 카디널리티 어서션을 모두 반복 실행.
 *
 * 단계:
 *   1) `prepare.mjs` 로 public/ 생성 (web-avatar 빌드 → 복사 → halfbody/fullbody 번들 조립).
 *   2) `serve.mjs` 를 임의 포트로 띄우고 "listening" 라인 대기.
 *   3) INDEX.json 로드 → templates 배열 검증 (halfbody + fullbody 최소 2 종).
 *   4) 각 템플릿마다 HTTP 200 + content-type, loadWebAvatarBundle 매니페스트, categorize
 *      카디널리티, `<geny-avatar>` DOM lifecycle 을 모두 검증 — 스냅샷 고정으로 role
 *      추가/삭제 시 CI 가 먼저 깨져 categoryOf 확장을 강제한다.
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

// 세션 87 — 템플릿별 스냅샷 기대값. rig-templates/base/*/v*/parts/*.spec.json 를 편집할 때
// 여기 숫자가 먼저 깨지도록 고정. halfbody=29 parts, fullbody=38 parts.
const TEMPLATE_EXPECTATIONS = {
  halfbody: {
    templateId: "tpl.base.v1.halfbody",
    templateVersion: "1.2.0",
    avatarId: "avt.editor.halfbody.demo",
    partsTotal: 29,
    categories: { Face: 16, Hair: 4, Body: 7, Accessory: 2 },
  },
  fullbody: {
    templateId: "tpl.base.v1.fullbody",
    templateVersion: "1.0.0",
    avatarId: "avt.editor.fullbody.demo",
    partsTotal: 38,
    categories: { Face: 16, Hair: 5, Body: 14, Accessory: 3 },
  },
};

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
  await checkHttp(`${base}/public/vendor/index.js`, "text/javascript");

  const indexRes = await fetch(`${base}/public/INDEX.json`);
  assert.equal(indexRes.status, 200, "INDEX.json HTTP 200");
  const manifest = await indexRes.json();
  assert.ok(Array.isArray(manifest.templates), "INDEX.json.templates is array");
  const ids = manifest.templates.map((t) => t.id).sort();
  assert.deepEqual(ids, ["fullbody", "halfbody"], `templates = ${ids.join(",")}, expected halfbody+fullbody`);
  log(`INDEX.json templates: ${ids.join(", ")}`);

  for (const t of manifest.templates) {
    log(`── template "${t.id}" ──`);
    const expect = TEMPLATE_EXPECTATIONS[t.id];
    assert.ok(expect, `no expectations registered for template id=${t.id}`);
    const bundleUrl = `${base}/public/sample/${t.id}/bundle.json`;
    await checkHttp(bundleUrl, "application/json");
    await checkHttp(`${base}/public/sample/${t.id}/web-avatar.json`, "application/json");
    await checkHttp(`${base}/public/sample/${t.id}/atlas.json`, "application/json");
    await checkHttp(`${base}/public/sample/${t.id}/textures/base.png`, "image/png");
    const bundle = await runLoaderChain(bundleUrl, expect);
    await runCategorize(bundle.meta.parts, t.id, expect);
    await runDomLifecycle(bundleUrl, expect);
    await runRendererMount(bundleUrl, expect);
  }

  log("✅ web-editor e2e pass (halfbody + fullbody)");
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

async function runLoaderChain(bundleUrl, expect) {
  log("loadWebAvatarBundle chain");
  const loaderUrl = pathToFileURL(
    resolve(repoRoot, "packages/web-avatar/dist/loader.js"),
  ).toString();
  const { loadWebAvatarBundle } = await import(loaderUrl);
  const bundle = await loadWebAvatarBundle(bundleUrl);

  assert.equal(bundle.manifest.kind, "web-avatar-bundle");
  assert.equal(bundle.manifest.template_id, expect.templateId);
  assert.equal(bundle.manifest.template_version, expect.templateVersion);
  assert.equal(bundle.manifest.avatar_id, expect.avatarId);
  assert.ok(bundle.manifest.files.length >= 3, "manifest.files >= 3");

  assert.ok(bundle.meta.parameters.length > 0, "meta.parameters non-empty");
  assert.equal(bundle.meta.parts.length, expect.partsTotal, `meta.parts.length = ${bundle.meta.parts.length}, expected ${expect.partsTotal}`);
  assert.ok(bundle.meta.textures.length >= 1, "meta.textures includes base.png");
  assert.equal(bundle.meta.textures[0].path, "textures/base.png");

  assert.ok(bundle.atlas, "atlas resolved");
  assert.equal(bundle.atlas.textures.length, 1);
  assert.equal(bundle.atlas.textures[0].path, "textures/base.png");

  log(`  ✓ manifest files=${bundle.manifest.files.length}, meta parts=${bundle.meta.parts.length}, atlas textures=${bundle.atlas.textures.length}`);
  return bundle;
}

/**
 * 세션 89 — `@geny/web-editor-logic` 단일 소스에서 categoryOf 를 import.
 * index.html 과 e2e-check.mjs 가 같은 dist 를 쓰므로 drift 구조적으로 제거됨.
 * 스냅샷 카디널리티는 그대로 — Other=0 불변식 + 카테고리별 카운트 고정.
 */
async function runCategorize(parts, templateId, expect) {
  log(`categorize ${templateId} parts (@geny/web-editor-logic)`);
  const logicDist = resolve(repoRoot, "packages/web-editor-logic/dist/index.js");
  const { categoryOf, CATEGORY_ORDER } = await import(pathToFileURL(logicDist).toString());

  const counts = new Map();
  for (const p of parts) {
    const c = categoryOf(p.role);
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }

  assert.equal(
    counts.get("Other") ?? 0,
    0,
    `Other category should be empty — role fell through: ${
      [...new Set(parts.map((p) => p.role).filter((r) => categoryOf(r) === "Other"))].join(", ")
    }`,
  );

  for (const [cat, expected] of Object.entries(expect.categories)) {
    const actual = counts.get(cat) ?? 0;
    assert.equal(actual, expected, `${templateId} ${cat} count = ${actual}, expected ${expected}`);
  }

  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  assert.equal(total, parts.length, "every part landed in exactly one category");
  assert.equal(total, expect.partsTotal, `${templateId} total parts = ${total}, expected ${expect.partsTotal}`);

  const summary = CATEGORY_ORDER
    .map((c) => `${c}=${counts.get(c) ?? 0}`)
    .join(", ");
  log(`  ✓ categories: ${summary} (total=${total})`);
}

async function runDomLifecycle(bundleUrl, expect) {
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

    assert.equal(manifest.avatar_id, expect.avatarId, "manifest.avatar_id");
    assert.equal(manifest.template_id, expect.templateId, "manifest.template_id");
    assert.equal(manifest.template_version, expect.templateVersion, "manifest.template_version");
    assert.equal(meta.parts.length, expect.partsTotal, "meta.parts.length");
    assert.ok(meta.motions.length > 0, "meta.motions >= 1");
    assert.equal(atlas.textures[0].path, "textures/base.png", "atlas textures[0].path");

    // 세션 90 — setParameter write-through 계약 검증. parameter write 가
    // parameterchange 이벤트 → getParameters 스냅샷 반영 → 범위 클램프 모두 작동하는지.
    const params0 = el.getParameters();
    assert.equal(
      Object.keys(params0).length,
      meta.parameters.length,
      `getParameters() size = ${Object.keys(params0).length}, expected ${meta.parameters.length}`,
    );
    const firstParam = meta.parameters[0];
    const [lo, hi] = firstParam.range;
    const mid = (lo + hi) / 2;
    const changePromise = waitForEvent(el, "parameterchange", 2000);
    const returned = el.setParameter(firstParam.id, mid);
    const changeEvt = await changePromise;
    assert.equal(returned, mid, `setParameter returned = ${returned}, expected ${mid}`);
    assert.equal(changeEvt.detail.id, firstParam.id);
    assert.equal(changeEvt.detail.value, mid);
    assert.equal(el.getParameters()[firstParam.id], mid, "getParameters reflects write");

    // Out-of-range → 클램프.
    const overReturned = el.setParameter(firstParam.id, hi + 999);
    assert.equal(overReturned, hi, "out-of-range clamped to hi");

    log(
      `  ✓ ready payload: ${manifest.avatar_id} @ ${manifest.template_id}@${manifest.template_version}, ` +
        `parts=${meta.parts.length}, motions=${meta.motions.length}, parameters=${meta.parameters.length}`,
    );
    log(
      `  ✓ parameter write-through: ${firstParam.id} ` +
        `default=${firstParam.default} → mid=${mid} → clamped=${hi}`,
    );
  } finally {
    await window.happyDOM.close().catch(() => undefined);
    for (const k of KEYS) g[k] = saved[k];
  }
}

/**
 * 세션 91 — `@geny/web-editor-renderer` 구조 프리뷰 mount.
 * `<geny-avatar>` 의 ready 이벤트에 맞춰 SVG 가 part 개수만큼 rect/text 를 만들고,
 * parameterchange 가 root group 에 rotate() 를 반영하는지 검증한다.
 */
async function runRendererMount(bundleUrl, expect) {
  log("web-editor-renderer SVG mount (happy-dom + HTTP)");
  const { Window } = await import("happy-dom");
  const elementUrl = pathToFileURL(
    resolve(repoRoot, "packages/web-avatar/dist/element.js"),
  ).toString();
  const rendererUrl = pathToFileURL(
    resolve(repoRoot, "packages/web-editor-renderer/dist/index.js"),
  ).toString();
  const { registerGenyAvatar } = await import(elementUrl);
  const { createStructureRenderer } = await import(rendererUrl);

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
    const mount = doc.createElement("div");
    doc.body.appendChild(mount);
    const el = doc.createElement("geny-avatar");
    doc.body.appendChild(el);

    const renderer = createStructureRenderer({ element: el, mount });
    const ready = waitForEvent(el, "ready", 5000);
    el.setAttribute("src", bundleUrl);
    await ready;

    assert.equal(renderer.partCount, expect.partsTotal, `renderer.partCount = ${renderer.partCount}, expected ${expect.partsTotal}`);
    const svg = mount.querySelector('svg[data-testid="structure-preview"]');
    assert.ok(svg, "svg host exists");
    const rects = svg.querySelectorAll("rect");
    assert.equal(rects.length, expect.partsTotal, `rect count = ${rects.length}, expected ${expect.partsTotal}`);
    const rootGroup = svg.querySelector('g[data-testid="structure-root"]');
    assert.ok(rootGroup, "structure-root group exists");

    // head_angle_x 로 rotation 이 작동해야 함.
    const angleParam = (await (async () => {
      // parameterchange 기다리기 전에 파라미터 존재 확인.
      const params = el.getParameters();
      const ids = Object.keys(params);
      const angleId = ids.find((id) => id.includes("angle")) ?? ids[0];
      return angleId;
    })());
    const rotPromise = waitForEvent(el, "parameterchange", 2000);
    el.setParameter(angleParam, 10);
    await rotPromise;
    assert.equal(renderer.rotationDeg, 10, `rotationDeg = ${renderer.rotationDeg}, expected 10`);
    assert.match(
      rootGroup.getAttribute("transform") ?? "",
      /rotate\(10 200 250\)/,
      "rotate() transform applied with viewBox center",
    );

    renderer.destroy();
    log(`  ✓ renderer mounted: parts=${renderer.partCount}, rotation via ${angleParam} OK`);
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
