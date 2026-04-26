/**
 * POST /api/texture/inpaint — mask 기반 부분 변형 (atlas 외부 100% 보존).
 *
 * 핵심 흐름:
 *   1. 사용자가 brush 로 mask 를 그려 PNG 로 보냄 (alpha=255 = 변형 영역)
 *   2. preset 의 baseline texture 를 읽음 (mao_pro 의 4096 PNG)
 *   3. AI 어댑터에 task = { referenceImage: original, inpaintMask: mask, prompt }
 *      - openai-image: /v1/images/edits 의 mask 필드로 invert 후 전송
 *      - nano-banana: 두 번째 inline_data + prompt 강화로 전송
 *      - recolor: mask 무시하고 전체 hue shift (단, 후처리에서 mask 외부 복원되어 결과적으로 mask 영역만 변경됨)
 *      - mock: 무시
 *   4. AI 결과를 받음 → **manual sharp 후처리**:
 *      compositeInpaintResult({original, ai_result, mask}) →
 *      mask 영역은 AI, 외부는 원본. AI 가 mask 무시해도 우리가 강제로 atlas 보존.
 *   5. 결과 저장 → texture_id 반환.
 *
 * 요청 body:
 *   {
 *     preset_id, preset_version,
 *     prompt, seed?,
 *     mask_png_base64: string,   // 사용자가 그린 mask (alpha=255 변형 영역, 임의 사이즈 OK — atlas 로 resize)
 *     adapter?, model?,          // 명시 선택 (없으면 priority chain)
 *     feather_px?: number,       // mask 경계 부드럽게 (default 2)
 *   }
 *
 * 응답:
 *   { texture_id, sha256, width, height, bytes, adapter, attempts, mask_bytes, timing, ... }
 */

import type { FastifyPluginAsync } from "fastify";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { writeTextureManifest } from "../lib/texture-manifest.js";
import { compositeInpaintResult } from "../lib/inpaint-composite.js";
import {
  AllAdaptersFailedError,
  NoEligibleAdapterError,
  TextureAdapterRegistry,
  runTextureGenerate,
} from "../lib/texture-adapter.js";
import { createNanoBananaAdapter } from "../lib/adapters/nano-banana-adapter.js";
import { createOpenAIImageAdapter } from "../lib/adapters/openai-image-adapter.js";
import { createPollinationsAdapter } from "../lib/adapters/pollinations-adapter.js";
import { createRecolorAdapter } from "../lib/adapters/recolor-adapter.js";
import { createMockAdapter } from "../lib/adapters/mock-adapter.js";

export interface TextureInpaintRouteOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir: string;
  readonly adapters: TextureAdapterRegistry;
}

interface PresetParse {
  readonly ns: "base" | "community" | "custom";
  readonly slug: string;
}

function parsePresetId(id: string): PresetParse | null {
  const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
  if (!m || !m[1] || !m[2]) return null;
  return { ns: m[1] as PresetParse["ns"], slug: m[2] };
}

interface AtlasShape {
  readonly textures: readonly { readonly width: number; readonly height: number }[];
}

interface PresetManifestShape {
  readonly origin?: { readonly kind?: string };
}

async function loadAtlasAndBaseline(
  rigTemplatesRoot: string,
  presetId: string,
  presetVersion: string,
): Promise<{ width: number; height: number; baseline: Buffer | null } | null> {
  const p = parsePresetId(presetId);
  if (!p) return null;
  const presetDir = join(rigTemplatesRoot, p.ns, p.slug, "v" + presetVersion);
  const atlasPath = join(presetDir, "textures", "atlas.json");
  if (!existsSync(atlasPath)) return null;
  const atlas = JSON.parse(await readFile(atlasPath, "utf8")) as AtlasShape;
  const t = atlas.textures[0];
  if (!t) return null;
  // third-party preset 의 runtime_assets 텍스처 (mao_pro 의 4096) 우선 사용.
  const manifestPath = join(presetDir, "template.manifest.json");
  let baseline: Buffer | null = null;
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PresetManifestShape;
      if (manifest.origin?.kind === "third-party") {
        const runtime = join(presetDir, "runtime_assets");
        const m3Path = join(runtime, p.slug + ".model3.json");
        if (existsSync(m3Path)) {
          const m3 = JSON.parse(await readFile(m3Path, "utf8")) as {
            FileReferences?: { Textures?: string[] };
          };
          const texRel = m3.FileReferences?.Textures?.[0];
          if (texRel) {
            const texPath = join(runtime, texRel);
            if (existsSync(texPath)) {
              baseline = await readFile(texPath);
            }
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  // Fallback: textures/base.png.
  if (!baseline) {
    const basePath = join(presetDir, "textures", "base.png");
    if (existsSync(basePath)) {
      baseline = await readFile(basePath);
    }
  }
  return { width: t.width, height: t.height, baseline };
}

function buildSingleAdapterRegistry(
  vendor: string,
  model: string | undefined,
): TextureAdapterRegistry | null {
  const r = new TextureAdapterRegistry();
  switch (vendor) {
    case "nano-banana":
      r.register(createNanoBananaAdapter(model ? { model } : {}));
      return r;
    case "openai-image":
      r.register(createOpenAIImageAdapter(model ? { model } : {}));
      return r;
    case "pollinations":
      r.register(createPollinationsAdapter());
      return r;
    case "recolor":
      r.register(createRecolorAdapter());
      return r;
    case "mock":
      r.register(createMockAdapter());
      return r;
    default:
      return null;
  }
}

export const textureInpaintRoute: FastifyPluginAsync<TextureInpaintRouteOptions> = async (
  fastify,
  opts,
) => {
  const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
  const texturesDir = resolve(opts.texturesDir);
  const registry = opts.adapters;
  await mkdir(texturesDir, { recursive: true });

  fastify.post("/api/texture/inpaint", async (request, reply) => {
    const startMs = Date.now();
    const body = request.body as
      | {
          preset_id?: string;
          preset_version?: string;
          prompt?: string;
          seed?: number;
          mask_png_base64?: string;
          adapter?: string;
          model?: string;
          feather_px?: number;
        }
      | undefined;
    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        error: { code: "INVALID_BODY", message: "application/json body 필요" },
      });
    }
    const { preset_id, preset_version, prompt, mask_png_base64 } = body;
    if (
      !preset_id || !preset_version ||
      typeof prompt !== "string" || prompt.trim() === "" ||
      typeof mask_png_base64 !== "string" || mask_png_base64.length === 0
    ) {
      return reply.code(400).send({
        error: {
          code: "MISSING_FIELDS",
          message: "preset_id, preset_version, prompt, mask_png_base64 모두 필요",
        },
      });
    }
    const seed = Number.isFinite(body.seed) ? (body.seed as number) : 0;
    const featherPx = Number.isFinite(body.feather_px)
      ? Math.max(0, Math.min(20, Math.round(body.feather_px as number)))
      : 2;

    const timing: Record<string, number> = {};
    const tPreset = Date.now();
    const presetData = await loadAtlasAndBaseline(rigTemplatesRoot, preset_id, preset_version);
    timing.preset_lookup_ms = Date.now() - tPreset;
    if (!presetData) {
      return reply.code(404).send({
        error: {
          code: "PRESET_NOT_FOUND",
          message: preset_id + "@" + preset_version + " 또는 atlas.json 없음",
        },
      });
    }
    if (!presetData.baseline) {
      return reply.code(422).send({
        error: {
          code: "BASELINE_MISSING",
          message:
            "Inpainting 은 baseline texture 가 있어야 합니다. third-party preset (mao_pro) 또는 textures/base.png 가 필요.",
        },
      });
    }

    let maskPng: Buffer;
    try {
      // base64 prefix 제거 가능 (data:image/png;base64,xxx).
      const cleaned = mask_png_base64.replace(/^data:image\/[a-z]+;base64,/i, "");
      maskPng = Buffer.from(cleaned, "base64");
      if (maskPng.length < 8) throw new Error("too small");
    } catch {
      return reply.code(400).send({
        error: { code: "INVALID_MASK", message: "mask_png_base64 base64 디코드 실패" },
      });
    }

    // atlas 사이즈 캡 (큰 4096 그대로 vendor 에 보냄, 우리 후처리는 atlas full size 에서).
    const width = Math.min(presetData.width, 2048);
    const height = Math.min(presetData.height, 2048);

    const useRegistry = !body.adapter
      ? registry
      : buildSingleAdapterRegistry(body.adapter, body.model);
    if (useRegistry === null) {
      return reply.code(400).send({
        error: { code: "UNKNOWN_ADAPTER", message: "지원되지 않는 adapter: " + body.adapter },
      });
    }

    request.log.info(
      {
        preset_id, preset_version, prompt: prompt.trim(), seed,
        adapter: body.adapter ?? "auto", model: body.model,
        atlas: { width: presetData.width, height: presetData.height },
        baseline_bytes: presetData.baseline.length,
        mask_bytes: maskPng.length,
        feather_px: featherPx,
      },
      "[inpaint] start",
    );

    let run;
    const tVendor = Date.now();
    try {
      run = await runTextureGenerate(
        {
          preset: { id: preset_id, version: preset_version },
          prompt: prompt.trim(),
          seed,
          width,
          height,
          referenceImage: { png: presetData.baseline },
          inpaintMask: { png: maskPng },
        },
        useRegistry,
      );
    } catch (err) {
      timing.vendor_ms = Date.now() - tVendor;
      const errLog = {
        adapter: body.adapter ?? "auto",
        model: body.model,
        timing,
        message: (err as Error).message,
      };
      if (err instanceof NoEligibleAdapterError) {
        request.log.warn(errLog, "[inpaint] no eligible adapter");
        return reply.code(503).send({
          error: { code: "NO_ELIGIBLE_ADAPTER", message: err.message, timing },
        });
      }
      if (err instanceof AllAdaptersFailedError) {
        request.log.error({ ...errLog, attempts: err.attempts }, "[inpaint] all failed");
        return reply.code(502).send({
          error: {
            code: "ALL_ADAPTERS_FAILED",
            message: err.message,
            attempts: err.attempts,
            timing,
          },
        });
      }
      request.log.error(errLog, "[inpaint] unexpected error");
      return reply.code(500).send({
        error: { code: "INPAINT_FAILED", message: (err as Error).message, timing },
      });
    }
    timing.vendor_ms = Date.now() - tVendor;

    const { result, adapter, attempts } = run;

    // **CORE**: AI 결과 + 원본 + mask 를 sharp 로 합성. mask 외부는 강제 원본 픽셀 → atlas 보존.
    const tComposite = Date.now();
    let finalPng: Buffer;
    try {
      finalPng = await compositeInpaintResult({
        originalPng: presetData.baseline,
        aiResultPng: result.png,
        maskPng,
        width: result.width,
        height: result.height,
        featherPx,
      });
    } catch (err) {
      timing.composite_ms = Date.now() - tComposite;
      request.log.error({ error: (err as Error).message, timing }, "[inpaint] composite failed");
      return reply.code(500).send({
        error: { code: "COMPOSITE_FAILED", message: (err as Error).message, timing },
      });
    }
    timing.composite_ms = Date.now() - tComposite;

    const textureId = "tex_" + randomUUID().replace(/-/g, "");
    const outPath = join(texturesDir, textureId + ".png");
    const tWrite = Date.now();
    await writeFile(outPath, finalPng);
    timing.write_ms = Date.now() - tWrite;

    const finalSha256 = createHash("sha256").update(finalPng).digest("hex");
    await writeTextureManifest({
      texturesDir,
      textureId,
      atlasSha256: finalSha256,
      width: result.width,
      height: result.height,
      bytes: finalPng.length,
      preset: { id: preset_id, version: preset_version },
      mode: "ai_generate",
      adapter: adapter + " (inpaint)",
      prompt: prompt.trim(),
      seed,
      notes:
        "inpainting: mask 영역만 변형, 외부는 원본 보존. adapter=" + adapter +
        ", attempts=" + attempts.length + ", feather_px=" + featherPx,
    });

    request.log.info(
      {
        texture_id: textureId,
        bytes: finalPng.length,
        timing: { ...timing, total_ms: Date.now() - startMs },
      },
      "[inpaint] success",
    );

    return {
      texture_id: textureId,
      sha256: finalSha256,
      width: result.width,
      height: result.height,
      bytes: finalPng.length,
      prompt: prompt.trim(),
      seed,
      adapter,
      attempts,
      preset: { id: preset_id, version: preset_version },
      path: outPath,
      mask_bytes: maskPng.length,
      feather_px: featherPx,
      timing: { ...timing, total_ms: Date.now() - startMs },
      note:
        "Inpainting 완료: AI 어댑터 (" + adapter + ") 가 그린 결과를 mask 영역에만 적용. " +
        "mask 외부는 원본 atlas 픽셀 그대로 보존됨 (sharp 후처리). atlas layout 100% 유지.",
    };
  });
};
