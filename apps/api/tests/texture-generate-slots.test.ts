// P4.2 - /api/texture/generate/slots 회귀. 실 벤더 비활성 → mock adapter 로만 구동.

process.env.GENY_POLLINATIONS_DISABLED = "true";
process.env.GENY_NANO_BANANA_DISABLED = "true";
process.env.GENY_OPENAI_IMAGE_DISABLED = "true";

import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
import { isPng, readPngInfo } from "../src/lib/png.js";
import {
  TextureAdapterRegistry,
  type TextureAdapter,
  type TextureTask,
} from "../src/lib/texture-adapter.js";
import { createMockAdapter } from "../src/lib/adapters/mock-adapter.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");

function scratch() {
  return mkdtempSync(join(tmpdir(), "geny-api-slots-test-"));
}

// atlas.json 에서 halfbody slot_id 목록 / mao_pro atlas 확인용 샘플 로드.
function loadHalfbodySlots(): string[] {
  const atlasPath = join(
    rigTemplatesRoot,
    "base",
    "halfbody",
    "v1.3.0",
    "textures",
    "atlas.json",
  );
  const atlas = JSON.parse(readFileSync(atlasPath, "utf8")) as {
    slots: Array<{ slot_id: string }>;
  };
  return atlas.slots.map((s) => s.slot_id);
}

// ---- 기본 성공 경로 ----

test("POST /api/texture/generate/slots: halfbody v1.3.0 전체 슬롯 생성 성공", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "pastel anime girl",
        seed: 42,
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      texture_id: string;
      sha256: string;
      width: number;
      height: number;
      slot_count: number;
      success_count: number;
      slot_results: Array<{
        slot_id: string;
        adapter?: string;
        attempts: Array<{ adapter: string; status: string }>;
        success: boolean;
        bytes?: number;
      }>;
    };
    assert.match(json.texture_id, /^tex_[a-f0-9]{32}$/);
    assert.match(json.sha256, /^[a-f0-9]{64}$/);
    // halfbody base.png 는 4x4 placeholder 지만 slot-composite 는 최소 256px 에서 동작.
    assert.equal(json.width, 256);
    assert.equal(json.height, 256);
    assert.equal(json.slot_count, 30, "halfbody v1.3.0 는 30 slot");
    assert.equal(json.success_count, 30, "모든 slot 이 mock 으로 성공");
    assert.equal(json.slot_results.length, 30);
    for (const r of json.slot_results) {
      assert.equal(r.success, true, "slot=" + r.slot_id);
      assert.equal(r.adapter, "mock");
      assert.ok(r.attempts.length >= 1);
      assert.ok(r.bytes && r.bytes > 0);
    }
    // 저장된 PNG 는 실제 RGBA 이미지여야 한다.
    const outPath = join(textures, json.texture_id + ".png");
    assert.ok(existsSync(outPath));
    const buf = readFileSync(outPath);
    assert.ok(isPng(buf));
    const info = readPngInfo(buf);
    assert.ok(info);
    assert.equal(info!.width, 256);
    assert.equal(info!.height, 256);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: body.slots[] 주어지면 해당 슬롯만 생성", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "just 2 slots",
        seed: 1,
        slots: ["hair_front", "face_base"],
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      slot_count: number;
      slot_results: Array<{ slot_id: string; success: boolean }>;
    };
    assert.equal(json.slot_count, 2);
    const ids = json.slot_results.map((r) => r.slot_id).sort();
    assert.deepEqual(ids, ["face_base", "hair_front"]);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: slot_overrides 적용 시 해당 슬롯 prompt 에 반영", async () => {
  // 스파이 어댑터로 실제 생성 요청된 prompt 확인.
  const texturePrompts = new Map<string, string>();
  const spy: TextureAdapter = {
    name: "prompt-spy",
    supports: () => true,
    generate: async (task: TextureTask) => {
      const mock = createMockAdapter();
      const r = await mock.generate(task);
      // task 에는 slot_id 가 없고 prompt 만 있으므로 prompt 로 기록.
      texturePrompts.set(task.prompt, task.prompt);
      return r;
    },
  };
  const registry = new TextureAdapterRegistry();
  registry.register(spy);

  const textures = scratch();
  const app = await buildApp({
    rigTemplatesRoot,
    texturesDir: textures,
    adapters: registry,
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "global",
        seed: 1,
        slots: ["hair_front", "cloth_main"],
        slot_overrides: { hair_front: "blonde braid" },
      }),
    });
    assert.equal(res.statusCode, 200);
    // hair_front prompt 에 override, cloth_main 에는 override 없음.
    const prompts = Array.from(texturePrompts.keys());
    assert.ok(prompts.some((p) => /slot override: blonde braid/.test(p) && /hair strand/.test(p)));
    assert.ok(
      prompts.some((p) => /clothing piece/.test(p) && !/slot override/.test(p)),
      "cloth_main 은 override 없음",
    );
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: palette_hint 는 관련 카테고리에만 주입", async () => {
  const prompts: string[] = [];
  const spy: TextureAdapter = {
    name: "prompt-spy",
    supports: () => true,
    generate: async (task: TextureTask) => {
      prompts.push(task.prompt);
      const mock = createMockAdapter();
      return mock.generate(task);
    },
  };
  const registry = new TextureAdapterRegistry();
  registry.register(spy);

  const textures = scratch();
  const app = await buildApp({
    rigTemplatesRoot,
    texturesDir: textures,
    adapters: registry,
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "g",
        seed: 1,
        slots: ["hair_front", "cloth_main", "face_base"],
        palette_hint: { primary: "#A0C8FF", hair: "#F7D58A", skin: "light", cloth: "navy" },
      }),
    });
    assert.equal(res.statusCode, 200);
    assert.ok(
      prompts.some((p) => /hair strand/.test(p) && /hair color #F7D58A/.test(p)),
      "hair_front 에 hair 팔레트",
    );
    assert.ok(
      prompts.some((p) => /clothing piece/.test(p) && /cloth color navy/.test(p)),
      "cloth_main 에 cloth 팔레트",
    );
    assert.ok(
      prompts.some((p) => /face base/.test(p) && /skin light/.test(p)),
      "face_base 에 skin 팔레트",
    );
    // primary 는 모든 슬롯 공통.
    assert.ok(prompts.every((p) => /primary #A0C8FF/.test(p)));
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: 결정론 - 동일 입력 → 동일 sha256", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const payload = JSON.stringify({
      preset_id: "tpl.base.v1.halfbody",
      preset_version: "1.3.0",
      prompt: "deterministic",
      seed: 999,
      slots: ["hair_front", "face_base"],
    });
    const a = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload,
    });
    const b = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload,
    });
    const ja = a.json() as { sha256: string };
    const jb = b.json() as { sha256: string };
    assert.equal(ja.sha256, jb.sha256, "slot-composite 결과도 결정론이어야 함");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

// ---- 에러 경로 ----

test("POST /api/texture/generate/slots: body 없음 → 400 INVALID_BODY", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: "null",
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, "INVALID_BODY");
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate/slots: 누락 필드 → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ preset_id: "tpl.base.v1.halfbody", preset_version: "1.3.0" }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, "MISSING_FIELDS");
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate/slots: 빈 prompt → 400 MISSING_FIELDS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "   ",
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal((res.json() as { error: { code: string } }).error.code, "MISSING_FIELDS");
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate/slots: 없는 preset → 404 PRESET_NOT_FOUND", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.ghost",
        preset_version: "9.9.9",
        prompt: "x",
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

test("POST /api/texture/generate/slots: mao_pro 는 atlas.slots[] 비어있어 422 ATLAS_SLOTS_EMPTY", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "mao variation",
        seed: 1,
      }),
    });
    assert.equal(res.statusCode, 422);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "ATLAS_SLOTS_EMPTY",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate/slots: body.slots[] 와 매칭 없음 → 400 NO_MATCHING_SLOTS", async () => {
  const app = await buildApp({ rigTemplatesRoot, texturesDir: scratch() });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "x",
        slots: ["nonexistent_slot_xyz"],
      }),
    });
    assert.equal(res.statusCode, 400);
    assert.equal(
      (res.json() as { error: { code: string } }).error.code,
      "NO_MATCHING_SLOTS",
    );
  } finally {
    await app.close();
  }
});

test("POST /api/texture/generate/slots: 모든 어댑터 실패 → 502 ALL_SLOTS_FAILED", async () => {
  // 항상 실패하는 어댑터만 등록한 레지스트리.
  const failing: TextureAdapter = {
    name: "always-fails",
    supports: () => true,
    generate: async () => {
      const e = new Error("simulated vendor outage") as Error & {
        code: string;
        attempts: unknown[];
      };
      e.code = "VENDOR_ERROR_5XX";
      e.attempts = [];
      throw e;
    },
  };
  const registry = new TextureAdapterRegistry();
  registry.register(failing);

  const textures = scratch();
  const app = await buildApp({
    rigTemplatesRoot,
    texturesDir: textures,
    adapters: registry,
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "fail",
        seed: 1,
        slots: ["hair_front", "face_base"],
      }),
    });
    assert.equal(res.statusCode, 502);
    const json = res.json() as {
      error: {
        code: string;
        slot_results: Array<{
          slot_id: string;
          success: boolean;
          error_code?: string;
        }>;
      };
    };
    assert.equal(json.error.code, "ALL_SLOTS_FAILED");
    assert.equal(json.error.slot_results.length, 2);
    for (const r of json.error.slot_results) {
      assert.equal(r.success, false);
    }
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: 부분 실패 허용 - 일부만 성공해도 200", async () => {
  // slot_id 를 알 수 없지만 prompt 에 hair strand 가 들어간 것만 성공시키는 어댑터.
  const partial: TextureAdapter = {
    name: "partial-fail",
    supports: () => true,
    generate: async (task: TextureTask) => {
      if (/hair strand/.test(task.prompt)) {
        const mock = createMockAdapter();
        return mock.generate(task);
      }
      const e = new Error("not hair") as Error & { code: string };
      e.code = "VENDOR_ERROR_4XX";
      throw e;
    },
  };
  const registry = new TextureAdapterRegistry();
  registry.register(partial);

  const textures = scratch();
  const app = await buildApp({
    rigTemplatesRoot,
    texturesDir: textures,
    adapters: registry,
  });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "g",
        seed: 1,
        slots: ["hair_front", "face_base", "cloth_main"],
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as {
      success_count: number;
      slot_count: number;
      slot_results: Array<{ slot_id: string; success: boolean; error_code?: string }>;
    };
    assert.equal(json.slot_count, 3);
    assert.equal(json.success_count, 1, "hair_front 1개만 성공");
    const hair = json.slot_results.find((r) => r.slot_id === "hair_front");
    const cloth = json.slot_results.find((r) => r.slot_id === "cloth_main");
    assert.equal(hair!.success, true);
    assert.equal(cloth!.success, false);
    assert.equal(cloth!.error_code, "VENDOR_ERROR_4XX");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

// ---- 매니페스트 ----

test("POST /api/texture/generate/slots: manifest 가 mode=ai_generate + adapter=slots-composite 로 기록", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "manifest test",
        seed: 5,
        slots: ["hair_front", "face_base"],
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { texture_id: string };
    const manifestPath = join(textures, json.texture_id + ".meta.json");
    assert.ok(existsSync(manifestPath));
    const m = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      generated_by?: { mode?: string; adapter?: string; prompt?: string; seed?: number };
    };
    assert.equal(m.generated_by?.mode, "ai_generate");
    assert.equal(m.generated_by?.adapter, "slots-composite");
    assert.equal(m.generated_by?.prompt, "manifest test");
    assert.equal(m.generated_by?.seed, 5);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

// ---- slot_id 존재 검증 (halfbody slot list 와 atlas 일치) ----

test("atlas.json halfbody v1.3.0 은 30 slot (회귀 guard)", () => {
  const slots = loadHalfbodySlots();
  assert.equal(slots.length, 30, "P1.B 가 설정한 30 slot 유지");
});

// ---- P5.3 fullbody 프리셋 회귀 (derived + 38 slot) ----

test("POST /api/texture/generate/slots: fullbody v1.0.0 는 38 slot 모두 성공", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.fullbody",
        preset_version: "1.0.0",
        prompt: "fullbody pastel girl",
        seed: 7,
      }),
    });
    assert.equal(res.statusCode, 200, "body=" + res.body);
    const json = res.json() as {
      slot_count: number;
      success_count: number;
      width: number;
      height: number;
    };
    assert.equal(json.slot_count, 38, "P1.B 가 설정한 fullbody 38 slot");
    assert.equal(json.success_count, 38, "모든 slot 이 mock 으로 성공");
    // fullbody atlas base.png 는 4x4 placeholder → floor 256 적용
    assert.equal(json.width, 256);
    assert.equal(json.height, 256);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: fullbody 슬롯 subset (leg/foot) 재생성", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.fullbody",
        preset_version: "1.0.0",
        prompt: "fullbody legs",
        seed: 1,
        slots: ["leg_l", "leg_r", "foot_l", "foot_r"],
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { slot_count: number; success_count: number };
    assert.equal(json.slot_count, 4);
    assert.equal(json.success_count, 4);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("GET /api/presets/tpl.base.v1.fullbody/1.0.0/atlas: 38 slot + 각 uv 0..1", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({
      method: "GET",
      url: "/api/presets/tpl.base.v1.fullbody/1.0.0/atlas",
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as {
      slots: Array<{ slot_id: string; uv: [number, number, number, number] }>;
    };
    assert.equal(json.slots.length, 38);
    // fullbody 전용 슬롯 확인.
    const names = json.slots.map((s) => s.slot_id);
    for (const expected of ["leg_l", "leg_r", "foot_l", "foot_r"]) {
      assert.ok(names.includes(expected), "fullbody 슬롯 " + expected + " 포함");
    }
    for (const s of json.slots) {
      for (const v of s.uv) assert.ok(v >= 0 && v <= 1);
    }
  } finally {
    await app.close();
  }
});

// ---- P4.5 feather_px ----

test("POST /api/texture/generate/slots: 기본 feather_px=4, 응답에 echo", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "feather default",
        seed: 1,
        slots: ["hair_front", "face_base"],
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { feather_px: number; note: string };
    assert.equal(json.feather_px, 4, "P4.5 default feather_px=4");
    assert.match(json.note, /edge feather/);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: feather_px=0 은 feather off", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "no feather",
        seed: 1,
        slots: ["hair_front"],
        feather_px: 0,
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

test("POST /api/texture/generate/slots: feather_px 범위 초과 → 32 로 clamp", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody",
        preset_version: "1.3.0",
        prompt: "overfeather",
        seed: 1,
        slots: ["hair_front"],
        feather_px: 9999,
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { feather_px: number };
    assert.equal(json.feather_px, 32);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate/slots: feather on/off 는 다른 sha256 을 생성", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const base = {
      preset_id: "tpl.base.v1.halfbody",
      preset_version: "1.3.0",
      prompt: "feather-diff",
      seed: 42,
      slots: ["hair_front", "face_base"],
    };
    const off = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ ...base, feather_px: 0 }),
    });
    const on = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({ ...base, feather_px: 8 }),
    });
    const jOff = off.json() as { sha256: string };
    const jOn = on.json() as { sha256: string };
    assert.notEqual(jOff.sha256, jOn.sha256, "feather 가 실제로 픽셀을 바꿔야 함");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});
