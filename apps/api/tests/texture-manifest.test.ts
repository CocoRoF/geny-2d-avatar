// P3.2 - texture.manifest.json 작성 + bundle 첨부 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { readTextureManifest, writeTextureManifest } from "../src/lib/texture-manifest.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");
const HALFBODY_BASE_PNG = resolve(
  repoRoot,
  "rig-templates/base/halfbody/v1.3.0/textures/base.png",
);

function scratch() {
  return mkdtempSync(join(tmpdir(), "geny-api-test-"));
}

test("writeTextureManifest → readTextureManifest round-trip", async () => {
  const dir = scratch();
  try {
    const m = await writeTextureManifest({
      texturesDir: dir,
      textureId: "tex_" + "0".repeat(32),
      atlasSha256: "a".repeat(64),
      width: 128,
      height: 128,
      bytes: 1234,
      preset: { id: "tpl.base.v1.halfbody", version: "1.3.0" },
      mode: "mock_generate",
      adapter: "mock",
      prompt: "test",
      seed: 42,
    });
    assert.equal(m.schema_version, "v1");
    assert.equal(m.format, 1);
    assert.equal(m.texture_id, "tex_" + "0".repeat(32));
    assert.equal(m.generated_by.mode, "mock_generate");
    assert.equal(m.generated_by.adapter, "mock");
    assert.equal(m.generated_by.prompt, "test");
    assert.equal(m.generated_by.seed, 42);

    const read = await readTextureManifest(dir, m.texture_id);
    assert.ok(read);
    assert.deepEqual(read, m);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeTextureManifest: manual_upload mode 는 prompt/seed 생략", async () => {
  const dir = scratch();
  try {
    const m = await writeTextureManifest({
      texturesDir: dir,
      textureId: "tex_" + "1".repeat(32),
      atlasSha256: "b".repeat(64),
      width: 4,
      height: 4,
      bytes: 123,
      preset: { id: "tpl.base.v1.halfbody", version: "1.3.0" },
      mode: "manual_upload",
      sourceFilename: "user.png",
    });
    assert.equal(m.generated_by.mode, "manual_upload");
    assert.equal(m.generated_by.source_filename, "user.png");
    assert.equal(m.generated_by.prompt, undefined);
    assert.equal(m.generated_by.seed, undefined);
    assert.equal(m.generated_by.adapter, undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("readTextureManifest: 없는 파일 → null", async () => {
  const m = await readTextureManifest("/tmp/geny-ghost-" + Date.now(), "tex_xxx");
  assert.equal(m, null);
});

test("POST /api/texture/upload → .meta.json 사이드카 작성", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const boundary = "----Bnd" + Date.now();
    const pngBuf = readFileSync(HALFBODY_BASE_PNG);
    const body = Buffer.concat([
      Buffer.from("--" + boundary + "\r\n"),
      Buffer.from('Content-Disposition: form-data; name="preset_id"\r\n\r\ntpl.base.v1.halfbody\r\n'),
      Buffer.from("--" + boundary + "\r\n"),
      Buffer.from('Content-Disposition: form-data; name="preset_version"\r\n\r\n1.3.0\r\n'),
      Buffer.from("--" + boundary + "\r\n"),
      Buffer.from(
        'Content-Disposition: form-data; name="file"; filename="custom.png"\r\nContent-Type: image/png\r\n\r\n',
      ),
      pngBuf,
      Buffer.from("\r\n--" + boundary + "--\r\n"),
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      payload: body,
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { texture_id: string };
    const manifest = await readTextureManifest(textures, json.texture_id);
    assert.ok(manifest, "manifest should exist");
    assert.equal(manifest!.generated_by.mode, "manual_upload");
    assert.equal(manifest!.generated_by.source_filename, "custom.png");
    assert.equal(manifest!.width, 4);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate → .meta.json 에 prompt/seed 기록", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "blue hair",
        seed: 777,
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { texture_id: string };
    const manifest = await readTextureManifest(textures, json.texture_id);
    assert.ok(manifest);
    assert.equal(manifest!.generated_by.mode, "mock_generate");
    assert.equal(manifest!.generated_by.adapter, "mock");
    assert.equal(manifest!.generated_by.prompt, "blue hair");
    assert.equal(manifest!.generated_by.seed, 777);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/build → bundle 에 texture.manifest.json 첨부", async () => {
  const textures = scratch();
  const bundles = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures, bundlesDir: bundles });
  try {
    // 1) generate 로 텍스처 준비 (manifest 사이드카 생김)
    const gen = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "test gen",
        seed: 123,
      }),
    });
    const { texture_id } = gen.json() as { texture_id: string };

    // 2) build
    const build = await app.inject({
      method: "POST",
      url: "/api/build",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        texture_id,
      }),
    });
    assert.equal(build.statusCode, 200, build.body);
    const buildJson = build.json() as {
      bundle_id: string;
      texture_manifest: { path: string; mode: string } | null;
    };
    assert.ok(buildJson.texture_manifest);
    assert.equal(buildJson.texture_manifest!.path, "texture.manifest.json");
    assert.equal(buildJson.texture_manifest!.mode, "mock_generate");

    // 3) bundle dir 확인
    const bundleDir = join(bundles, buildJson.bundle_id);
    const manifestPath = join(bundleDir, "texture.manifest.json");
    assert.ok(existsSync(manifestPath));
    const manifestJson = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      schema_version: string;
      generated_by: { mode: string; prompt: string; seed: number };
    };
    assert.equal(manifestJson.schema_version, "v1");
    assert.equal(manifestJson.generated_by.mode, "mock_generate");
    assert.equal(manifestJson.generated_by.prompt, "test gen");
    assert.equal(manifestJson.generated_by.seed, 123);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
    rmSync(bundles, { recursive: true, force: true });
  }
});
