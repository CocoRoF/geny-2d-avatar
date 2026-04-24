// Runtime Preview - /api/texture/:id.png + /api/live2d/:preset/:ver/* 회귀.

process.env.GENY_POLLINATIONS_DISABLED = "true";
process.env.GENY_NANO_BANANA_DISABLED = "true";
process.env.GENY_OPENAI_IMAGE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { isPng } from "../src/lib/png.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

function scratch() {
  return mkdtempSync(join(tmpdir(), "geny-api-rt-"));
}

// ---- /api/texture/:id.png ----

test("GET /api/texture/:id.png: 생성된 텍스처를 PNG 로 서빙", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const gen = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "rt test",
        seed: 1,
      }),
    });
    assert.equal(gen.statusCode, 200);
    const { texture_id } = gen.json() as { texture_id: string };

    const png = await app.inject({
      method: "GET",
      url: "/api/texture/" + texture_id + ".png",
    });
    assert.equal(png.statusCode, 200);
    assert.match(png.headers["content-type"] as string, /image\/png/);
    assert.ok(isPng(png.rawPayload), "응답 body 는 유효한 PNG");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("GET /api/texture/:id.png: 잘못된 id 포맷 → 400", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/texture/garbage.png",
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, "INVALID_TEXTURE_ID");
  } finally {
    await app.close();
  }
});

test("GET /api/texture/:id.png: 없는 파일 → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/texture/tex_" + "a".repeat(32) + ".png",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: { code: string } }).error.code, "TEXTURE_NOT_FOUND");
  } finally {
    await app.close();
  }
});

// ---- /api/live2d/:preset_id/:version/model3.json ----

test("GET /api/live2d/mao_pro/1.0.0/model3.json: FileReferences 반환", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/model3.json",
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const body = res.json() as {
      Version: number;
      FileReferences: { Moc: string; Textures: string[] };
    };
    assert.equal(body.Version, 3);
    assert.equal(body.FileReferences.Moc, "mao_pro.moc3");
    assert.equal(body.FileReferences.Textures.length, 1);
    // texture_id 쿼리 없으므로 원본 텍스처 경로 유지.
    assert.match(body.FileReferences.Textures[0]!, /mao_pro\.4096\/texture_00\.png/);
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/mao_pro/1.0.0/model3.json?texture_id=...: Textures[0] 재작성", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const tid = "tex_" + "b".repeat(32);
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/model3.json?texture_id=" + tid,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      FileReferences: { Textures: string[] };
    };
    assert.equal(body.FileReferences.Textures[0], "/api/texture/" + tid + ".png");
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/mao_pro/1.0.0/model3.json?texture_id=invalid: 원본 유지", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/model3.json?texture_id=not_a_valid_id",
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { FileReferences: { Textures: string[] } };
    // 유효하지 않은 texture_id 는 무시 → 원본 경로 유지.
    assert.match(body.FileReferences.Textures[0]!, /mao_pro\.4096/);
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/halfbody/1.3.0/model3.json: runtime_assets 없음 → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.halfbody/1.3.0/model3.json",
    });
    assert.equal(res.statusCode, 404);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "MODEL3_JSON_NOT_FOUND",
    );
  } finally {
    await app.close();
  }
});

// ---- /api/live2d/:preset/:ver/<any> ----

test("GET /api/live2d/mao_pro/1.0.0/mao_pro.moc3: binary 스트림", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/mao_pro.moc3",
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "application/octet-stream");
    // .moc3 는 MOC3 magic 으로 시작 (Live2D binary header).
    const magic = res.rawPayload.slice(0, 4).toString("ascii");
    assert.equal(magic, "MOC3");
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/mao_pro/1.0.0/motions/...: motion3.json 서빙", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    // mao_pro 의 모션 하나를 열어봄. 파일명이 정확히 무엇인지 확인.
    const runtimeDir = resolve(
      rigTemplatesRoot,
      "base",
      "mao_pro",
      "v1.0.0",
      "runtime_assets",
      "motions",
    );
    const { readdirSync } = await import("node:fs");
    const files = readdirSync(runtimeDir).filter((f) => f.endsWith(".motion3.json"));
    assert.ok(files.length > 0, "mao_pro 에 motion 이 최소 1개");
    const sample = files[0]!;
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/motions/" + sample,
    });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers["content-type"] as string, /application\/json/);
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/*: .. traversal → 400", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/..%2F..%2Fetc%2Fpasswd",
    });
    // URL decode 후 .. 검출 → 400 INVALID_PATH. Fastify 는 basic URL-decode.
    assert.ok([400, 404].includes(res.statusCode), "traversal 차단 확인: got " + res.statusCode);
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/:preset/:ver/*: 없는 파일 → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/not_a_real_file.json",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: { code: string } }).error.code, "FILE_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("GET /api/live2d/:bogus_preset/1.0.0/model3.json: 잘못된 id → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/live2d/not_a_preset/1.0.0/model3.json",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: { code: string } }).error.code, "PRESET_NOT_FOUND");
  } finally {
    await app.close();
  }
});

// ---- e2e: generate → model3.json ----

test("e2e: generate → model3.json?texture_id=<id> → /api/texture/:id.png", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const gen = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "ai variation",
        seed: 1,
      }),
    });
    assert.equal(gen.statusCode, 200);
    const { texture_id } = gen.json() as { texture_id: string };

    const m3 = await app.inject({
      method: "GET",
      url: "/api/live2d/tpl.base.v1.mao_pro/1.0.0/model3.json?texture_id=" + texture_id,
    });
    assert.equal(m3.statusCode, 200);
    const body = m3.json() as { FileReferences: { Textures: string[] } };
    assert.equal(body.FileReferences.Textures[0], "/api/texture/" + texture_id + ".png");

    // 해당 텍스처 URL 이 실제로 유효.
    const png = await app.inject({
      method: "GET",
      url: body.FileReferences.Textures[0]!,
    });
    assert.equal(png.statusCode, 200);
    assert.ok(isPng(png.rawPayload));
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});
