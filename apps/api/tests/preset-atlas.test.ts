// P4.3 - GET /api/presets/:preset_id/:version/atlas 회귀.

process.env.GENY_POLLINATIONS_DISABLED = "true";
process.env.GENY_NANO_BANANA_DISABLED = "true";
process.env.GENY_OPENAI_IMAGE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

test("GET /api/presets/:id/:v/atlas: halfbody v1.3.0 → 30 slot + UV", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/presets/tpl.base.v1.halfbody/1.3.0/atlas",
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as {
      preset: { id: string; version: string };
      width: number;
      height: number;
      slots: Array<{ slot_id: string; uv: [number, number, number, number] }>;
    };
    assert.equal(json.preset.id, "tpl.base.v1.halfbody");
    assert.equal(json.preset.version, "1.3.0");
    assert.equal(json.width, 4); // base.png placeholder
    assert.equal(json.height, 4);
    assert.equal(json.slots.length, 30);
    // 각 slot 에 uv 가 [u0, v0, u1, v1] 4-tuple 이며 0..1 범위.
    for (const s of json.slots) {
      assert.ok(typeof s.slot_id === "string" && s.slot_id.length > 0);
      assert.equal(s.uv.length, 4);
      for (const v of s.uv) {
        assert.ok(v >= 0 && v <= 1, "uv value 0..1: " + v);
      }
    }
    // hair_front 포함.
    const names = json.slots.map((s) => s.slot_id);
    assert.ok(names.includes("hair_front"));
    assert.ok(names.includes("face_base"));
  } finally {
    await app.close();
  }
});

test("GET /api/presets/:id/:v/atlas: mao_pro → slots[] 비어있음", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/presets/tpl.base.v1.mao_pro/1.0.0/atlas",
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { width: number; height: number; slots: unknown[] };
    assert.equal(json.width, 4096);
    assert.equal(json.height, 4096);
    assert.equal(json.slots.length, 0, "mao_pro 는 drawable 추출 전이라 slots 없음");
  } finally {
    await app.close();
  }
});

test("GET /api/presets/:id/:v/atlas: 잘못된 id → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/presets/not_a_preset/1.0.0/atlas",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: { code: string } }).error.code, "PRESET_NOT_FOUND");
  } finally {
    await app.close();
  }
});

test("GET /api/presets/:id/:v/atlas: 없는 version → 404", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/presets/tpl.base.v1.halfbody/9.9.9/atlas",
    });
    assert.equal(res.statusCode, 404);
    assert.equal((res.json() as { error: { code: string } }).error.code, "PRESET_NOT_FOUND");
  } finally {
    await app.close();
  }
});
