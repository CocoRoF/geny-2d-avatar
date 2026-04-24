// P3.1 - /api/texture/generate mock endpoint + mock-generator 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { generateMockTexture } from "../src/lib/mock-generator.js";
import { readPngInfo, isPng } from "../src/lib/png.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

function scratch() {
  return mkdtempSync(join(tmpdir(), "geny-api-test-"));
}

// ---- mock-generator ----

test("generateMockTexture: 4x4 RGBA PNG 생성", () => {
  const buf = generateMockTexture({ prompt: "test", seed: 0, width: 4, height: 4 });
  assert.ok(isPng(buf));
  const info = readPngInfo(buf);
  assert.ok(info);
  assert.equal(info!.width, 4);
  assert.equal(info!.height, 4);
  assert.equal(info!.hasAlpha, true);
});

test("generateMockTexture: 동일 (prompt, seed, size) → 결정론적 (바이트 동일)", () => {
  const a = generateMockTexture({ prompt: "blue hair", seed: 42, width: 128, height: 128 });
  const b = generateMockTexture({ prompt: "blue hair", seed: 42, width: 128, height: 128 });
  assert.deepEqual(a, b);
});

test("generateMockTexture: 다른 prompt → 다른 bytes", () => {
  const a = generateMockTexture({ prompt: "blue", seed: 0, width: 64, height: 64 });
  const b = generateMockTexture({ prompt: "red", seed: 0, width: 64, height: 64 });
  assert.notDeepEqual(a, b);
});

test("generateMockTexture: 다른 seed → 다른 bytes", () => {
  const a = generateMockTexture({ prompt: "same", seed: 1, width: 64, height: 64 });
  const b = generateMockTexture({ prompt: "same", seed: 2, width: 64, height: 64 });
  assert.notDeepEqual(a, b);
});

// ---- POST /api/texture/generate ----

test("POST /api/texture/generate: halfbody v1.3.0 프리셋에 대해 생성 성공", async () => {
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
        prompt: "pastel anime girl",
        seed: 12345,
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      texture_id: string;
      sha256: string;
      width: number;
      height: number;
      bytes: number;
      prompt: string;
      seed: number;
      adapter: string;
    };
    assert.match(json.texture_id, /^tex_[a-f0-9]{32}$/);
    assert.match(json.sha256, /^[a-f0-9]{64}$/);
    assert.equal(json.width, 4); // halfbody base.png 는 4x4 placeholder
    assert.equal(json.height, 4);
    assert.equal(json.prompt, "pastel anime girl");
    assert.equal(json.seed, 12345);
    assert.equal(json.adapter, "mock");
    assert.ok(json.bytes > 0);
    // P3.3 - attempts 배열 포함 확인.
    const jsonFull = json as unknown as { attempts?: Array<{ adapter: string; status: string }> };
    assert.ok(Array.isArray(jsonFull.attempts));
    assert.equal(jsonFull.attempts![0]!.adapter, "mock");
    assert.equal(jsonFull.attempts![0]!.status, "success");
    assert.ok(existsSync(join(textures, json.texture_id + ".png")));
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate: mao_pro (4096) 는 2048 캡 적용", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "mao variation",
        seed: 7,
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { width: number; height: number };
    assert.equal(json.width, 2048);
    assert.equal(json.height, 2048);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate: 누락 필드 → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ preset_id: "tpl.base.v1.halfbody" }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, "MISSING_FIELDS");
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate: 없는 preset → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.ghost",
        preset_version: "9.9.9",
        prompt: "test",
      }),
    });
    assert.equal(res.statusCode, 404);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "PRESET_NOT_FOUND",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate: 결정론 - 동일 (preset/prompt/seed) → 동일 sha256", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const payload = JSON.stringify({
      preset_id: "tpl.base.v1.halfbody",
      preset_version: "1.3.0",
      prompt: "consistent",
      seed: 99,
    });
    const a = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload,
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload,
    });
    const ja = a.json() as { sha256: string; bytes: number };
    const jb = b.json() as { sha256: string; bytes: number };
    assert.equal(ja.sha256, jb.sha256, "same input must produce same bytes");
    assert.equal(ja.bytes, jb.bytes);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});
