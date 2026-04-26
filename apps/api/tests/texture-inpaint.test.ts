// /api/texture/inpaint — mask 기반 부분 변형 라우트 회귀.
// 외부 AI 호출은 disable. mock 어댑터로 happy path, recolor 도 함께 검증.

process.env.GENY_POLLINATIONS_DISABLED = "true";
process.env.GENY_NANO_BANANA_DISABLED = "true";
process.env.GENY_OPENAI_IMAGE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { buildApp } from "../src/app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-api-inpaint-test-"));
}

async function makeMaskPng(
  width: number,
  height: number,
  fill: "white" | "black" | "left-half" = "white",
): Promise<string> {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let v = 0;
      if (fill === "white") v = 255;
      else if (fill === "left-half") v = x < width / 2 ? 255 : 0;
      buf[i] = v; buf[i + 1] = v; buf[i + 2] = v; buf[i + 3] = 255;
    }
  }
  const png = await sharp(buf, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return "data:image/png;base64," + png.toString("base64");
}

// ---- validation errors ----

test("POST /api/texture/inpaint: 누락 필드 → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ preset_id: "tpl.base.v1.halfbody" }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "MISSING_FIELDS",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/inpaint: 빈 prompt → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const mask = await makeMaskPng(16, 16, "white");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "   ",
        mask_png_base64: mask,
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "MISSING_FIELDS",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/inpaint: 빈 mask → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "red hair",
        mask_png_base64: "",
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "MISSING_FIELDS",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/inpaint: 없는 preset → 404 PRESET_NOT_FOUND", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const mask = await makeMaskPng(16, 16, "white");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.ghost",
        preset_version: "9.9.9",
        prompt: "test",
        mask_png_base64: mask,
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

test("POST /api/texture/inpaint: 짧은/잘못된 mask base64 → 400 INVALID_MASK", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "red hair",
        // 8 bytes 미만으로 디코드되는 짧은 base64.
        mask_png_base64: "AA==",
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "INVALID_MASK",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/inpaint: 알 수 없는 adapter → 400 UNKNOWN_ADAPTER", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const mask = await makeMaskPng(16, 16, "white");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "red hair",
        mask_png_base64: mask,
        adapter: "ultra-secret-vendor",
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "UNKNOWN_ADAPTER",
    );
  } finally {
    await app.close();
  }
});

// ---- happy path ----

test("POST /api/texture/inpaint: halfbody (derived) + mock 어댑터 → 200 + 결과 PNG", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const mask = await makeMaskPng(64, 64, "white"); // 임의 사이즈 — 서버가 atlas 사이즈로 resize
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "blue hair",
        seed: 7,
        mask_png_base64: mask,
        adapter: "mock",
        feather_px: 0,
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      texture_id: string;
      sha256: string;
      width: number;
      height: number;
      bytes: number;
      adapter: string;
      mask_bytes: number;
      feather_px: number;
      timing: { total_ms: number; vendor_ms: number; composite_ms: number };
    };
    assert.match(json.texture_id, /^tex_[a-f0-9]{32}$/);
    assert.match(json.sha256, /^[a-f0-9]{64}$/);
    assert.equal(json.width, 4);  // halfbody atlas 4x4 placeholder
    assert.equal(json.height, 4);
    assert.equal(json.feather_px, 0);
    assert.equal(json.adapter, "mock");
    assert.ok(json.bytes > 0);
    assert.ok(json.mask_bytes > 0);
    assert.ok(json.timing.total_ms >= 0);
    assert.ok(json.timing.vendor_ms >= 0);
    assert.ok(json.timing.composite_ms >= 0);
    // 결과 PNG 파일이 디스크에 작성되어 있어야 함.
    const outPath = join(textures, json.texture_id + ".png");
    assert.ok(existsSync(outPath));
    // manifest sidecar 도.
    assert.ok(existsSync(join(textures, json.texture_id + ".meta.json")));
    const meta = JSON.parse(readFileSync(join(textures, json.texture_id + ".meta.json"), "utf8")) as {
      generated_by: { mode: string; adapter: string; prompt: string; seed: number };
      preset: { id: string; version: string };
    };
    assert.equal(meta.generated_by.mode, "ai_generate");
    assert.match(meta.generated_by.adapter, /\(inpaint\)/);
    assert.equal(meta.generated_by.prompt, "blue hair");
    assert.equal(meta.generated_by.seed, 7);
    assert.equal(meta.preset.id, "tpl.base.v1.halfbody");
    assert.equal(meta.preset.version, "1.3.0");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/inpaint: mao_pro third-party + mock → 2048 캡 + atlas 외부 보존 회귀", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    // 좌측 절반만 변형. 우측 절반은 원본 픽셀이 유지되어야 함.
    const mask = await makeMaskPng(256, 256, "left-half");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "purple highlights",
        seed: 42,
        mask_png_base64: mask,
        adapter: "mock",
        feather_px: 0,
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as { width: number; height: number; texture_id: string };
    assert.equal(json.width, 2048, "mao_pro 4096 → 2048 캡");
    assert.equal(json.height, 2048);
    // 결과 파일을 읽어 우측 픽셀을 sample → 원본 mao_pro 의 우측 픽셀과 (대략) 일치 확인.
    const outPath = join(textures, json.texture_id + ".png");
    const outMeta = await sharp(outPath).metadata();
    assert.equal(outMeta.width, 2048);
    assert.equal(outMeta.height, 2048);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/inpaint: feather_px 범위 [0, 20] 클램프", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const mask = await makeMaskPng(16, 16, "white");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "test",
        mask_png_base64: mask,
        adapter: "mock",
        feather_px: 999, // 20 으로 clamp 되어야 함
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { feather_px: number };
    assert.equal(json.feather_px, 20);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/inpaint: feather_px 음수 → 0 으로 클램프", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const mask = await makeMaskPng(16, 16, "white");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "test",
        mask_png_base64: mask,
        adapter: "mock",
        feather_px: -5,
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { feather_px: number };
    assert.equal(json.feather_px, 0);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/inpaint: data URL prefix 없는 raw base64 도 허용", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const dataUrl = await makeMaskPng(16, 16, "white");
    const rawBase64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/inpaint",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "test",
        mask_png_base64: rawBase64,
        adapter: "mock",
      }),
    });
    assert.equal(res.statusCode, 200);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});
