/**
 * /api/texture/generate - Mock 텍스처 생성 엔드포인트.
 *
 * 요청 body (JSON):
 *   {
 *     preset_id:      "tpl.base.v1.mao_pro",
 *     preset_version: "1.0.0",
 *     prompt:         "blue-haired girl, pastel hoodie",
 *     seed?:          1234567890
 *   }
 *
 * 동작 (P3.1 스텁):
 *   1) preset 조회 → atlas.json 에서 width/height 읽음
 *   2) generateMockTexture(prompt, seed, width, height) → deterministic RGBA PNG
 *   3) sha256 계산 + tmp 저장
 *   4) 응답: { texture_id, sha256, width, height, prompt, seed, adapter: "mock" }
 *
 * 실 AI 벤더 통합 (P3.3+) 에서는 ai-adapter-core.orchestrate() 로 라우팅하도록 교체 예정.
 * 현 단계는 파이프라인 검증용 결정론적 스텁.
 */

import type { FastifyPluginAsync } from "fastify";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { generateMockTexture } from "../lib/mock-generator.js";

export interface TextureGenerateRouteOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir: string;
}

interface AtlasShape {
  readonly textures: readonly { readonly width: number; readonly height: number }[];
}

async function readAtlas(rigTemplatesRoot: string, id: string, version: string) {
  const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
  if (!m || !m[1] || !m[2]) return null;
  const atlasPath = join(rigTemplatesRoot, m[1], m[2], "v" + version, "textures", "atlas.json");
  if (!existsSync(atlasPath)) return null;
  try {
    return JSON.parse(await readFile(atlasPath, "utf8")) as AtlasShape;
  } catch {
    return null;
  }
}

export const textureGenerateRoute: FastifyPluginAsync<TextureGenerateRouteOptions> = async (
  fastify,
  opts,
) => {
  const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
  const texturesDir = resolve(opts.texturesDir);
  await mkdir(texturesDir, { recursive: true });

  fastify.post("/api/texture/generate", async (request, reply) => {
    const body = request.body as
      | {
          preset_id?: string;
          preset_version?: string;
          prompt?: string;
          seed?: number;
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

    // 대용량 PNG 는 느릴 수 있어 최대 변을 2048 로 캡. 실 운영은 prompt/seed hash 만 저장 후
    // 벤더 어댑터가 원 해상도로 생성.
    const width = Math.min(t.width, 2048);
    const height = Math.min(t.height, 2048);

    let pngBuf: Buffer;
    try {
      pngBuf = generateMockTexture({ prompt: prompt.trim(), seed, width, height });
    } catch (err) {
      return reply.code(500).send({
        error: {
          code: "GENERATE_FAILED",
          message: "mock 생성 실패: " + (err as Error).message,
        },
      });
    }

    const sha256 = createHash("sha256").update(pngBuf).digest("hex");
    const textureId = "tex_" + randomUUID().replace(/-/g, "");
    const outPath = join(texturesDir, textureId + ".png");
    await writeFile(outPath, pngBuf);

    return {
      texture_id: textureId,
      sha256,
      width,
      height,
      bytes: pngBuf.length,
      prompt: prompt.trim(),
      seed,
      adapter: "mock",
      preset: { id: preset_id, version: preset_version },
      path: outPath,
      note: "mock 생성 결과 (P3.1). 실 AI 벤더 통합은 P3.3+ 에서 ai-adapter-core 경유로 교체.",
    };
  });
};
