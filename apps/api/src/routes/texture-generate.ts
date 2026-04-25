/**
 * /api/texture/generate - 텍스처 생성 (어댑터 경유).
 *
 * 요청 body (JSON):
 *   {
 *     preset_id:      "tpl.base.v1.mao_pro",
 *     preset_version: "1.0.0",
 *     prompt:         "blue-haired girl, pastel hoodie",
 *     seed?:          1234567890
 *   }
 *
 * 동작 (P3.3):
 *   1) preset 조회 → atlas.json 에서 width/height 읽음
 *   2) TextureAdapterRegistry 에서 eligible 어댑터 순차 시도 (첫 성공 채택)
 *   3) attempts[] 기록 → texture.manifest.json.generated_by.attempts
 *   4) 응답: { texture_id, sha256, adapter, attempts, ... }
 *
 * 현재 등록된 어댑터: "mock" (P3.3). 실 AI 벤더 어댑터 (P3.4) 추가 시 primary 자동 변경.
 */

import type { FastifyPluginAsync } from "fastify";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { writeTextureManifest } from "../lib/texture-manifest.js";
import {
  runTextureGenerate,
  AllAdaptersFailedError,
  NoEligibleAdapterError,
  TextureAdapterRegistry,
} from "../lib/texture-adapter.js";
import { createNanoBananaAdapter } from "../lib/adapters/nano-banana-adapter.js";
import { createOpenAIImageAdapter } from "../lib/adapters/openai-image-adapter.js";
import { createPollinationsAdapter } from "../lib/adapters/pollinations-adapter.js";
import { createRecolorAdapter } from "../lib/adapters/recolor-adapter.js";
import { createMockAdapter } from "../lib/adapters/mock-adapter.js";

export interface TextureGenerateRouteOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir: string;
  readonly adapters: TextureAdapterRegistry;
}

interface AtlasShape {
  readonly textures: readonly { readonly width: number; readonly height: number }[];
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

async function readAtlas(rigTemplatesRoot: string, id: string, version: string) {
  const p = parsePresetId(id);
  if (!p) return null;
  const atlasPath = join(rigTemplatesRoot, p.ns, p.slug, "v" + version, "textures", "atlas.json");
  if (!existsSync(atlasPath)) return null;
  try {
    return JSON.parse(await readFile(atlasPath, "utf8")) as AtlasShape;
  } catch {
    return null;
  }
}

interface PresetManifestShape {
  readonly origin?: { readonly kind?: string };
}

/**
 * Third-party preset 의 baseline 텍스처 PNG 를 reference 로 로드.
 * model3.json 의 FileReferences.Textures[0] 가 가리키는 파일을 runtime_assets/ 에서 읽음.
 * 실패 시 null — 어댑터는 reference 없이 text-only 로 동작 fallback.
 */
async function loadBaselineReference(
  rigTemplatesRoot: string,
  presetId: string,
  presetVersion: string,
): Promise<Buffer | null> {
  const p = parsePresetId(presetId);
  if (!p) return null;
  const presetDir = join(rigTemplatesRoot, p.ns, p.slug, "v" + presetVersion);
  const manifestPath = join(presetDir, "template.manifest.json");
  if (!existsSync(manifestPath)) return null;
  let manifest: PresetManifestShape;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8")) as PresetManifestShape;
  } catch {
    return null;
  }
  if (manifest.origin?.kind !== "third-party") return null;
  const runtimeAssets = join(presetDir, "runtime_assets");
  // <slug>.model3.json 에서 Textures[0] 경로 읽음.
  const candidates = [join(runtimeAssets, p.slug + ".model3.json"), join(runtimeAssets, "model3.json")];
  let model3Path: string | null = null;
  for (const c of candidates) if (existsSync(c)) { model3Path = c; break; }
  if (!model3Path) return null;
  try {
    const m3 = JSON.parse(await readFile(model3Path, "utf8")) as {
      FileReferences?: { Textures?: string[] };
    };
    const texRel = m3.FileReferences?.Textures?.[0];
    if (!texRel) return null;
    const texPath = join(runtimeAssets, texRel);
    if (!existsSync(texPath)) return null;
    return await readFile(texPath);
  } catch {
    return null;
  }
}

/**
 * 단일 어댑터만 들어있는 일회용 레지스트리 생성. 사용자가 명시적으로 adapter/model 을 선택했을 때 사용.
 * 알 수 없는 vendor 면 null.
 */
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

export const textureGenerateRoute: FastifyPluginAsync<TextureGenerateRouteOptions> = async (
  fastify,
  opts,
) => {
  const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
  const texturesDir = resolve(opts.texturesDir);
  const registry = opts.adapters;
  await mkdir(texturesDir, { recursive: true });

  fastify.post("/api/texture/generate", async (request, reply) => {
    const body = request.body as
      | {
          preset_id?: string;
          preset_version?: string;
          prompt?: string;
          seed?: number;
          /** 명시적 어댑터 선택 (nano-banana / openai-image / pollinations / recolor / mock). 미지정 = registry priority chain. */
          adapter?: string;
          /** 해당 어댑터의 모델 override (예: gpt-image-2, gemini-3-pro-image-preview). */
          model?: string;
        }
      | undefined;

    if (!body || typeof body !== "object") {
      return reply.code(400).send({
        error: { code: "INVALID_BODY", message: "application/json body 필요" },
      });
    }
    const { preset_id, preset_version, prompt } = body;
    if (!preset_id || !preset_version || typeof prompt !== "string" || prompt.trim() === "") {
      return reply.code(400).send({
        error: {
          code: "MISSING_FIELDS",
          message: "preset_id, preset_version, prompt 모두 필요.",
        },
      });
    }
    const seed = Number.isFinite(body.seed) ? (body.seed as number) : 0;

    const atlas = await readAtlas(rigTemplatesRoot, preset_id, preset_version);
    if (!atlas) {
      return reply.code(404).send({
        error: {
          code: "PRESET_NOT_FOUND",
          message: preset_id + "@" + preset_version + " 프리셋 또는 atlas.json 없음.",
        },
      });
    }
    const t = atlas.textures[0];
    if (!t) {
      return reply.code(500).send({
        error: { code: "ATLAS_EMPTY", message: "atlas.textures[] 비어있음." },
      });
    }

    // 대용량 PNG 캡 (mock 속도 보호). 실 벤더 어댑터는 내부에서 자체 제한.
    const width = Math.min(t.width, 2048);
    const height = Math.min(t.height, 2048);

    // image-to-image: third-party preset (mao_pro) 면 baseline texture 를 reference 로 자동 주입.
    const referencePng = await loadBaselineReference(rigTemplatesRoot, preset_id, preset_version);

    // 명시적 adapter / model 선택이면 일회용 registry 만들어 그 어댑터만 호출. 없으면 기본 registry priority.
    const useRegistry = !body.adapter
      ? registry
      : buildSingleAdapterRegistry(body.adapter, body.model);
    if (useRegistry === null) {
      return reply.code(400).send({
        error: {
          code: "UNKNOWN_ADAPTER",
          message:
            "지원되지 않는 adapter: " + body.adapter +
            ". 가능: nano-banana / openai-image / pollinations / recolor / mock",
        },
      });
    }

    let run;
    try {
      run = await runTextureGenerate(
        {
          preset: { id: preset_id, version: preset_version },
          prompt: prompt.trim(),
          seed,
          width,
          height,
          ...(referencePng ? { referenceImage: { png: referencePng } } : {}),
        },
        useRegistry,
      );
    } catch (err) {
      if (err instanceof NoEligibleAdapterError) {
        return reply.code(503).send({
          error: { code: "NO_ELIGIBLE_ADAPTER", message: err.message },
        });
      }
      if (err instanceof AllAdaptersFailedError) {
        return reply.code(502).send({
          error: {
            code: "ALL_ADAPTERS_FAILED",
            message: err.message,
            attempts: err.attempts,
          },
        });
      }
      return reply.code(500).send({
        error: { code: "GENERATE_FAILED", message: (err as Error).message },
      });
    }

    const { result, adapter, attempts } = run;
    const textureId = "tex_" + randomUUID().replace(/-/g, "");
    const outPath = join(texturesDir, textureId + ".png");
    await writeFile(outPath, result.png);
    // provenance 포함 manifest. attempts 는 generated_by.attempts 로 직접 포함시킬 수 없음 —
    // writeTextureManifest 는 mode 기반 — 확장 필요. P3.3 에서는 우선 기본 mode 만.
    const mode = adapter === "mock" ? "mock_generate" : "ai_generate";
    await writeTextureManifest({
      texturesDir,
      textureId,
      atlasSha256: result.sha256,
      width: result.width,
      height: result.height,
      bytes: result.png.length,
      preset: { id: preset_id, version: preset_version },
      mode,
      adapter,
      prompt: prompt.trim(),
      seed,
      notes:
        "P3.3 adapter registry 경유 (" +
        adapter +
        "). attempts=" +
        attempts.length +
        ".",
    });

    return {
      texture_id: textureId,
      sha256: result.sha256,
      width: result.width,
      height: result.height,
      bytes: result.png.length,
      prompt: prompt.trim(),
      seed,
      adapter,
      attempts,
      preset: { id: preset_id, version: preset_version },
      path: outPath,
      reference_used: referencePng !== null,
      reference_bytes: referencePng?.length ?? 0,
      note:
        adapter === "mock"
          ? "mock 생성 (결정론적, 실 AI 아님)"
          : "실 AI 벤더 " + adapter + (referencePng ? " (image-to-image, baseline reference 주입)" : " (text-to-image)"),
    };
  });
};
