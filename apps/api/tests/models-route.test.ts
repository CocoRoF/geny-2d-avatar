// /api/models — 어댑터 / 모델 / 활성 메타 회귀.

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

interface ModelEntry {
  id: string;
  label: string;
  recommended?: boolean;
  premium?: boolean;
  deprecated?: boolean;
}
interface AdapterMeta {
  vendor: string;
  label: string;
  activeModel: string;
  active: boolean;
  inactiveReason?: string;
  requiresKey?: string;
  supportsImageToImage: boolean;
  availableModels: ModelEntry[];
}

test("GET /api/models: 모든 어댑터 메타 노출 + 비활성 사유", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const res = await app.inject({ method: "GET", url: "/api/models" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { adapters: AdapterMeta[] };
    const vendors = body.adapters.map((a) => a.vendor);
    // 5종 어댑터: nano-banana, openai-image, recolor, pollinations, mock.
    assert.ok(vendors.includes("nano-banana"));
    assert.ok(vendors.includes("openai-image"));
    assert.ok(vendors.includes("recolor"));
    assert.ok(vendors.includes("pollinations"));
    assert.ok(vendors.includes("mock"));

    // 테스트 환경: nano-banana / openai-image / pollinations 가 DISABLED 라 비활성.
    const nb = body.adapters.find((a) => a.vendor === "nano-banana")!;
    assert.equal(nb.active, false, "GEMINI_API_KEY/DISABLED → 비활성");
    assert.match(nb.inactiveReason ?? "", /GEMINI_API_KEY|DISABLED/);
    assert.equal(nb.supportsImageToImage, true);
    assert.equal(nb.requiresKey, "GEMINI_API_KEY");

    // recolor 와 mock 은 항상 활성.
    const rc = body.adapters.find((a) => a.vendor === "recolor")!;
    assert.equal(rc.active, true);
    const mk = body.adapters.find((a) => a.vendor === "mock")!;
    assert.equal(mk.active, true);
  } finally {
    await app.close();
  }
});

test("GET /api/models: 어댑터별 availableModels + recommended/premium/deprecated 플래그", async () => {
  const app = await buildApp({ rigTemplatesRoot });
  try {
    const body = (
      await app.inject({ method: "GET", url: "/api/models" })
    ).json() as { adapters: AdapterMeta[] };

    const nb = body.adapters.find((a) => a.vendor === "nano-banana")!;
    const nbModels = nb.availableModels.map((m) => m.id);
    assert.ok(nbModels.includes("gemini-3.1-flash-image-preview"));
    assert.ok(nbModels.includes("gemini-3-pro-image-preview"));
    assert.ok(nbModels.includes("gemini-2.5-flash-image"));
    assert.equal(
      nb.availableModels.find((m) => m.id === "gemini-3.1-flash-image-preview")?.recommended,
      true,
    );
    assert.equal(
      nb.availableModels.find((m) => m.id === "gemini-3-pro-image-preview")?.premium,
      true,
    );
    assert.equal(
      nb.availableModels.find((m) => m.id === "gemini-2.5-flash-image")?.deprecated,
      true,
    );

    const oi = body.adapters.find((a) => a.vendor === "openai-image")!;
    const oiModels = oi.availableModels.map((m) => m.id);
    assert.ok(oiModels.includes("gpt-image-1.5"));
    assert.ok(oiModels.includes("gpt-image-2"));
    assert.equal(
      oi.availableModels.find((m) => m.id === "gpt-image-1.5")?.recommended,
      true,
    );
  } finally {
    await app.close();
  }
});

// /api/texture/generate adapter / model override

test("POST /api/texture/generate: adapter=mock → mock 만 호출 (priority 무시)", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const textures = mkdtempSync(join(tmpdir(), "geny-test-"));
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "blue hair",
        seed: 1,
        adapter: "mock",
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { adapter: string };
    assert.equal(json.adapter, "mock");
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});

test("POST /api/texture/generate: adapter=알수없음 → 400 UNKNOWN_ADAPTER", async () => {
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const textures = mkdtempSync(join(tmpdir(), "geny-test-"));
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.mao_pro",
        preset_version: "1.0.0",
        prompt: "x",
        seed: 1,
        adapter: "stable-diffusion",
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
