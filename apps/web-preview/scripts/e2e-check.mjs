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
 *   5) 서버 종료 + exit 0 (실패 시 non-zero).
 *
 * Playwright 같은 무거운 브라우저 자동화를 피하고 Node runtime 에서 루프를 완주.
 * Custom Element 렌더링은 Stage 3+ 에서 별도 테스트 (happy-dom/jsdom 주입) 가능.
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
  assert.equal(bundle.manifest.template_version, "1.2.0");
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

// ---- unused but kept for debug ergonomics ----
void KEEP_PUBLIC;
