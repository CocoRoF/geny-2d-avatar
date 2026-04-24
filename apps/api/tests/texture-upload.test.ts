// P2.2 - /api/texture/upload multipart + PNG 검증 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { readPngInfo, isPng } from "../src/lib/png.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

function scratchDir() {
  return mkdtempSync(join(tmpdir(), "geny-api-test-"));
}

// --- 헬퍼: 최소 유효 PNG 생성 (IHDR + IDAT + IEND). 크기 임의로 설정. ---
//
// PNG 압축/CRC 계산이 복잡하므로 실 fixture 파일을 쓰는 편이 단순:
//   rig-templates/base/halfbody/v1.3.0/textures/base.png = 4x4 placeholder PNG.

const HALFBODY_BASE_PNG = resolve(
  repoRoot,
  "rig-templates/base/halfbody/v1.3.0/textures/base.png",
);
const MAO_TEXTURE_PNG = resolve(
  repoRoot,
  "rig-templates/base/mao_pro/v1.0.0/textures/base.png",
);

test("readPngInfo: halfbody v1.3.0 base.png → 4x4 RGBA", () => {
  const buf = readFileSync(HALFBODY_BASE_PNG);
  assert.ok(isPng(buf), "should be valid PNG");
  const info = readPngInfo(buf);
  assert.ok(info);
  assert.equal(info!.width, 4);
  assert.equal(info!.height, 4);
  assert.equal(info!.colorTypeName, "rgba");
  assert.equal(info!.hasAlpha, true);
});

test("readPngInfo: mao_pro base.png → 4096x4096 RGBA", () => {
  const buf = readFileSync(MAO_TEXTURE_PNG);
  assert.ok(isPng(buf));
  const info = readPngInfo(buf);
  assert.ok(info);
  assert.equal(info!.width, 4096);
  assert.equal(info!.height, 4096);
  assert.equal(info!.hasAlpha, true);
});

test("readPngInfo: 잘못된 시그니처 → null", () => {
  const notPng = Buffer.from("not a png file");
  assert.equal(isPng(notPng), false);
  assert.equal(readPngInfo(notPng), null);
});

test("/api/texture/upload: halfbody v1.3.0 4x4 PNG 업로드 성공", async () => {
  const textures = scratchDir();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const pngBuf = readFileSync(HALFBODY_BASE_PNG);
    const boundary = "----TestBoundary" + Date.now();
    const body = makeMultipartBody(boundary, [
      { type: "field", name: "preset_id", value: "tpl.base.v1.halfbody" },
      { type: "field", name: "preset_version", value: "1.3.0" },
      { type: "file", name: "file", filename: "test.png", contentType: "image/png", data: pngBuf },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      payload: body,
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      texture_id: string;
      sha256: string;
      width: number;
      height: number;
      bytes: number;
      preset: { id: string; version: string };
      path: string;
    };
    assert.match(json.texture_id, /^tex_[a-f0-9]{32}$/);
    assert.equal(json.width, 4);
    assert.equal(json.height, 4);
    assert.equal(json.preset.id, "tpl.base.v1.halfbody");
    assert.equal(json.preset.version, "1.3.0");
    assert.match(json.sha256, /^[a-f0-9]{64}$/);
    assert.ok(existsSync(json.path), "saved file should exist on disk");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("/api/texture/upload: 크기 mismatch 시 400 SIZE_MISMATCH", async () => {
  // halfbody 는 4x4 base.png 기대. mao 4096x4096 을 올리면 mismatch.
  const textures = scratchDir();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const pngBuf = readFileSync(MAO_TEXTURE_PNG);
    const boundary = "----TestBoundary" + Date.now();
    const body = makeMultipartBody(boundary, [
      { type: "field", name: "preset_id", value: "tpl.base.v1.halfbody" },
      { type: "field", name: "preset_version", value: "1.3.0" },
      { type: "file", name: "file", filename: "big.png", contentType: "image/png", data: pngBuf },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      payload: body,
    });
    assert.equal(res.statusCode, 400);
    const json = res.json() as { error: { code: string; message: string } };
    assert.equal(json.error.code, "SIZE_MISMATCH");
    assert.match(json.error.message, /4096x4096/);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("/api/texture/upload: 잘못된 PNG 는 400 NOT_PNG", async () => {
  const textures = scratchDir();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const boundary = "----TB" + Date.now();
    const body = makeMultipartBody(boundary, [
      { type: "field", name: "preset_id", value: "tpl.base.v1.halfbody" },
      { type: "field", name: "preset_version", value: "1.3.0" },
      {
        type: "file",
        name: "file",
        filename: "fake.png",
        contentType: "image/png",
        data: Buffer.from("not actually png bytes!!!"),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      payload: body,
    });
    assert.equal(res.statusCode, 400);
    const json = res.json() as { error: { code: string } };
    assert.equal(json.error.code, "NOT_PNG");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("/api/texture/upload: 존재하지 않는 preset → 404 PRESET_NOT_FOUND", async () => {
  const textures = scratchDir();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const boundary = "----TB" + Date.now();
    const body = makeMultipartBody(boundary, [
      { type: "field", name: "preset_id", value: "tpl.base.v1.nonexistent" },
      { type: "field", name: "preset_version", value: "9.9.9" },
      {
        type: "file",
        name: "file",
        filename: "t.png",
        contentType: "image/png",
        data: readFileSync(HALFBODY_BASE_PNG),
      },
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "multipart/form-data; boundary=" + boundary },
      payload: body,
    });
    assert.equal(res.statusCode, 404);
    const json = res.json() as { error: { code: string } };
    assert.equal(json.error.code, "PRESET_NOT_FOUND");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("/api/texture/upload: multipart 아닌 요청 → 400 NOT_MULTIPART", async () => {
  const textures = scratchDir();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/upload",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ preset_id: "x" }),
    });
    assert.equal(res.statusCode, 400);
    const json = res.json() as { error: { code: string } };
    assert.equal(json.error.code, "NOT_MULTIPART");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

// ---- 헬퍼 ----

interface FieldPart {
  readonly type: "field";
  readonly name: string;
  readonly value: string;
}
interface FilePart {
  readonly type: "file";
  readonly name: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}
type Part = FieldPart | FilePart;

function makeMultipartBody(boundary: string, parts: Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const p of parts) {
    chunks.push(Buffer.from("--" + boundary + "\r\n"));
    if (p.type === "field") {
      chunks.push(
        Buffer.from(
          'Content-Disposition: form-data; name="' + p.name + '"\r\n\r\n' + p.value + "\r\n",
        ),
      );
    } else {
      chunks.push(
        Buffer.from(
          'Content-Disposition: form-data; name="' +
            p.name +
            '"; filename="' +
            p.filename +
            '"\r\nContent-Type: ' +
            p.contentType +
            "\r\n\r\n",
        ),
      );
      chunks.push(p.data);
      chunks.push(Buffer.from("\r\n"));
    }
  }
  chunks.push(Buffer.from("--" + boundary + "--\r\n"));
  return Buffer.concat(chunks);
}
