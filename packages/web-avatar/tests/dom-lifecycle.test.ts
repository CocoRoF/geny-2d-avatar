/**
 * `<geny-avatar>` DOM lifecycle 회귀 테스트.
 *
 * Exit #1 공백이었던 "실 DOM 에서 커스텀 엘리먼트가 bundle 을 해석해 `ready` 를 쏘는지"를
 * happy-dom 기반으로 재현. 브라우저/Node 의 차이는 `HTMLElement` · `customElements` · `CustomEvent`
 * · `document` 네 개이므로 happy-dom 의 `Window` 에서 뽑아 globalThis 에 주입한 뒤 테스트한다.
 *
 * `loader.ts` 는 `globalThis.fetch` 를 사용한다 (element 가 opts.fetch 를 주입하지 않음).
 * happy-dom 의 fetch 는 HTTP 전용이므로 `file://` 용 fs fetch 를 `globalThis.fetch` 에 덮어쓴다.
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { Window } from "happy-dom";

import { registerGenyAvatar } from "../src/element.js";
import type { WebAvatarBundle } from "../src/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(repoRoot, "packages", "exporter-core", "tests", "golden");
const halfbodyTemplateDir = resolve(
  repoRoot,
  "rig-templates",
  "base",
  "halfbody",
  "v1.2.0",
);

/** 임시 번들 디렉터리 구성 — 골든 JSON + 템플릿 PNG 를 배치. */
function materializeGoldenBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-dom-"));
  const webAvatar = readFileSync(join(goldenDir, "halfbody_v1.2.0.web-avatar.json"));
  const atlas = readFileSync(join(goldenDir, "halfbody_v1.2.0.atlas.json"));
  const bundleSnapshot = JSON.parse(
    readFileSync(join(goldenDir, "halfbody_v1.2.0.web-avatar-bundle.snapshot.json"), "utf8"),
  ) as { files: Array<{ path: string; sha256: string; bytes: number }> };

  writeFileSync(join(dir, "web-avatar.json"), webAvatar);
  writeFileSync(join(dir, "atlas.json"), atlas);
  const textureBuf = readFileSync(join(halfbodyTemplateDir, "textures/base.png"));
  mkdirSync(join(dir, "textures"), { recursive: true });
  writeFileSync(join(dir, "textures/base.png"), textureBuf);

  const manifest = {
    schema_version: "v1" as const,
    kind: "web-avatar-bundle" as const,
    format: 1 as const,
    template_id: "geny.base.halfbody",
    template_version: "1.2.0",
    avatar_id: null,
    files: bundleSnapshot.files.filter((f) => f.path !== "bundle.json"),
  };
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

/** file:// URL 을 읽는 fetch — happy-dom 기본 fetch 가 HTTP 전용이라 덮어쓴다. */
function fsFetch(input: unknown): Promise<Response> {
  const urlStr = input instanceof URL ? input.toString() : String(input);
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return Promise.resolve(new Response(null, { status: 400 }));
  }
  if (url.protocol !== "file:") {
    return Promise.resolve(new Response(null, { status: 400 }));
  }
  try {
    const buf = readFileSync(fileURLToPath(url));
    return Promise.resolve(new Response(buf, { status: 200 }));
  } catch {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
}

// globalThis 에 DOM 프로퍼티를 주입/복원하는 헬퍼 — 타입 체커는 DOM lib 을 알지만
// happy-dom 의 런타임 타입은 동일 이름만 공유하므로 `any` 경유로 대입.
const g = globalThis as unknown as Record<string, unknown>;
const ORIGINAL_KEYS = [
  "HTMLElement",
  "customElements",
  "CustomEvent",
  "Event",
  "document",
  "window",
  "fetch",
] as const;
const originals: Record<string, unknown> = {};
let window: Window;

before(() => {
  for (const k of ORIGINAL_KEYS) originals[k] = g[k];
  window = new Window({ url: "https://test.local/" });
  const w = window as unknown as Record<string, unknown>;
  for (const k of ["HTMLElement", "customElements", "CustomEvent", "Event", "document"]) {
    g[k] = w[k];
  }
  g.window = window;
  // element 는 opts.fetch 를 주입하지 않아 loader 가 globalThis.fetch 를 사용.
  // happy-dom fetch 는 file:// 미지원이므로 fs 기반으로 대체.
  g.fetch = fsFetch;
  registerGenyAvatar();
});

after(async () => {
  await (window as unknown as { happyDOM: { close(): Promise<void> } }).happyDOM.close();
  for (const k of ORIGINAL_KEYS) g[k] = originals[k];
});

function waitFor(
  target: EventTarget,
  eventName: "ready" | "error",
  timeoutMs = 2000,
): Promise<CustomEvent> {
  return new Promise((resolvePromise, rejectPromise) => {
    const timer = setTimeout(() => {
      rejectPromise(new Error(`timeout waiting for "${eventName}"`));
    }, timeoutMs);
    target.addEventListener(
      eventName,
      (evt) => {
        clearTimeout(timer);
        resolvePromise(evt as CustomEvent);
      },
      { once: true },
    );
  });
}

test("<geny-avatar>: dispatches ready with full bundle payload after src set to golden bundle", async () => {
  const dir = materializeGoldenBundle();
  try {
    const doc = g.document as unknown as Document;
    const el = doc.createElement("geny-avatar") as HTMLElement;
    doc.body.appendChild(el);
    const readyP = waitFor(el, "ready");
    el.setAttribute("src", pathToFileURL(join(dir, "bundle.json")).toString());
    const evt = await readyP;

    const bundle = (evt.detail as { bundle: WebAvatarBundle }).bundle;
    assert.equal(bundle.manifest.kind, "web-avatar-bundle");
    assert.equal(bundle.manifest.schema_version, "v1");
    assert.equal(bundle.meta.schema_version, "v1");
    assert.ok(bundle.meta.parameters.length > 0);
    assert.ok(bundle.meta.parts.length > 0);
    assert.ok(bundle.atlas !== null);
    assert.equal(bundle.atlas!.textures.length, 1);
    assert.equal(bundle.atlas!.textures[0]!.path, "textures/base.png");

    // element.bundle getter 역시 이벤트 이후에 동일하게 노출.
    const getterBundle = (el as unknown as { bundle: WebAvatarBundle | null }).bundle;
    assert.ok(getterBundle !== null);
    assert.equal(getterBundle!.bundleUrl, bundle.bundleUrl);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("<geny-avatar>: dispatches error with INVALID_KIND code on cubism-bundle manifest", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-dom-kind-"));
  try {
    const manifest = {
      schema_version: "v1",
      kind: "cubism-bundle",
      format: 1,
      template_id: null,
      template_version: null,
      avatar_id: null,
      files: [],
    };
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest));

    const doc = g.document as unknown as Document;
    const el = doc.createElement("geny-avatar") as HTMLElement;
    doc.body.appendChild(el);
    const errorP = waitFor(el, "error");
    el.setAttribute("src", pathToFileURL(join(dir, "bundle.json")).toString());
    const evt = await errorP;

    const err = (evt.detail as { error: { code?: string; name?: string } }).error;
    assert.equal(err.name, "WebAvatarBundleError");
    assert.equal(err.code, "INVALID_KIND");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("<geny-avatar>: superseding src cancels stale load (no ready from first src)", async () => {
  const dirGood = materializeGoldenBundle();
  const dirBad = mkdtempSync(join(tmpdir(), "geny-web-avatar-dom-super-"));
  try {
    // 유효하지 않은 첫 src → error 방출 전에 두 번째 src 로 덮어씌움.
    writeFileSync(join(dirBad, "bundle.json"), "{not json");

    const doc = g.document as unknown as Document;
    const el = doc.createElement("geny-avatar") as HTMLElement;
    doc.body.appendChild(el);
    const readyP = waitFor(el, "ready");
    let staleError = false;
    el.addEventListener("error", () => {
      staleError = true;
    });
    el.setAttribute("src", pathToFileURL(join(dirBad, "bundle.json")).toString());
    // 마이크로태스크로 첫 load 가 시작된 뒤 두 번째 src 로 교체.
    await Promise.resolve();
    el.setAttribute("src", pathToFileURL(join(dirGood, "bundle.json")).toString());
    const evt = await readyP;

    assert.equal(staleError, false, "stale load must not fire error after being superseded");
    const bundle = (evt.detail as { bundle: WebAvatarBundle }).bundle;
    assert.equal(bundle.manifest.kind, "web-avatar-bundle");
  } finally {
    rmSync(dirGood, { recursive: true, force: true });
    rmSync(dirBad, { recursive: true, force: true });
  }
});
