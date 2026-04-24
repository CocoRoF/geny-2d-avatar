/**
 * /api/live2d/:preset_id/:preset_version/* - 프리셋 runtime_assets 서빙 + model3.json 동적 rewrite.
 *
 * 런타임 프리뷰 (builder.html 의 Live2D 렌더) 가 프리셋의 `.moc3` + motions/expressions
 * 등을 불러올 수 있는 HTTP 경로를 제공하고, model3.json 요청에 대해 `?texture_id=<id>`
 * 쿼리가 있으면 FileReferences.Textures[0] 을 `/api/texture/<id>.png` (절대 URL) 로
 * 교체한 JSON 을 즉석 반환한다. 이로써 사용자는:
 *
 *   Live2DModel.from("/api/live2d/tpl.base.v1.mao_pro/1.0.0/model3.json?texture_id=tex_xxx")
 *
 * 한 줄로 AI 생성 텍스처가 입혀진 mao_pro 를 웹에서 렌더 가능.
 *
 * 현 제약:
 *   - halfbody/fullbody 처럼 .moc3 가 없는 derived preset 은 렌더 불가 (FileReferences.Moc 이 실 파일을 가리켜야 하기 때문).
 *   - `model3.json` 파일명은 프리셋마다 다름 (mao_pro 는 `mao_pro.model3.json`). 본 라우트가 /model3.json 을 요청받으면 해당 프리셋의 <slug>.model3.json 으로 해석.
 */

import type { FastifyPluginAsync } from "fastify";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

export interface Live2DProxyRouteOptions {
  readonly rigTemplatesRoot: string;
}

const MIME: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".moc3": "application/octet-stream",
  ".png": "image/png",
  ".webp": "image/webp",
};

function contentType(p: string): string {
  return MIME[extname(p).toLowerCase()] ?? "application/octet-stream";
}

interface PresetFields {
  readonly ns: "base" | "community" | "custom";
  readonly slug: string;
  readonly version: string;
}

function parsePresetId(id: string, version: string): PresetFields | null {
  const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
  if (!m || !m[1] || !m[2]) return null;
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) return null;
  return { ns: m[1] as PresetFields["ns"], slug: m[2], version };
}

function presetRuntimeDir(
  rigTemplatesRoot: string,
  p: PresetFields,
): string {
  return join(rigTemplatesRoot, p.ns, p.slug, "v" + p.version, "runtime_assets");
}

export const live2dProxyRoute: FastifyPluginAsync<Live2DProxyRouteOptions> = async (
  fastify,
  opts,
) => {
  const root = resolve(opts.rigTemplatesRoot);

  // model3.json (동적 쓰기).
  fastify.get<{
    Params: { preset_id: string; preset_version: string };
    Querystring: { texture_id?: string };
  }>("/api/live2d/:preset_id/:preset_version/model3.json", async (request, reply) => {
    const { preset_id, preset_version } = request.params;
    const p = parsePresetId(preset_id, preset_version);
    if (!p) {
      return reply.code(404).send({
        error: { code: "PRESET_NOT_FOUND", message: "invalid preset: " + preset_id },
      });
    }
    const runtimeDir = presetRuntimeDir(root, p);
    const modelPath = join(runtimeDir, p.slug + ".model3.json");
    if (!existsSync(modelPath)) {
      return reply.code(404).send({
        error: {
          code: "MODEL3_JSON_NOT_FOUND",
          message:
            "프리셋 " +
            preset_id +
            "@" +
            preset_version +
            " 에 runtime_assets/" +
            p.slug +
            ".model3.json 없음. .moc3 기반 프리셋만 런타임 프리뷰 지원.",
        },
      });
    }
    let raw: { FileReferences: { Textures: string[] } } & Record<string, unknown>;
    try {
      raw = JSON.parse(await readFile(modelPath, "utf8"));
    } catch (err) {
      return reply.code(500).send({
        error: { code: "MODEL3_PARSE_ERROR", message: (err as Error).message },
      });
    }
    const textureId = request.query.texture_id;
    if (textureId && /^tex_[a-f0-9]{32}$/.test(textureId)) {
      raw.FileReferences.Textures = ["/api/texture/" + textureId + ".png"];
    }
    reply.header("content-type", "application/json; charset=utf-8");
    reply.header("cache-control", "no-cache");
    return raw;
  });

  // runtime_assets 의 나머지 파일 (.moc3 / motions / expressions / 원본 texture).
  fastify.get<{ Params: { preset_id: string; preset_version: string; "*": string } }>(
    "/api/live2d/:preset_id/:preset_version/*",
    async (request, reply) => {
      const { preset_id, preset_version } = request.params;
      const sub = request.params["*"];
      const p = parsePresetId(preset_id, preset_version);
      if (!p) {
        return reply.code(404).send({
          error: { code: "PRESET_NOT_FOUND", message: "invalid preset: " + preset_id },
        });
      }
      // 경로 traversal 방지.
      if (sub.includes("..")) {
        return reply.code(400).send({
          error: { code: "INVALID_PATH", message: "path traversal 금지" },
        });
      }
      const runtimeDir = presetRuntimeDir(root, p);
      const filePath = join(runtimeDir, sub);
      if (!filePath.startsWith(runtimeDir)) {
        return reply.code(400).send({
          error: { code: "INVALID_PATH", message: "runtime_assets 외부 접근 불가" },
        });
      }
      if (!existsSync(filePath)) {
        return reply.code(404).send({
          error: { code: "FILE_NOT_FOUND", message: sub + " 없음" },
        });
      }
      const info = await stat(filePath);
      if (info.isDirectory()) {
        return reply.code(400).send({
          error: { code: "IS_DIRECTORY", message: sub + " 는 디렉토리" },
        });
      }
      const buf = await readFile(filePath);
      reply.header("content-type", contentType(filePath));
      reply.header("content-length", info.size);
      reply.header("cache-control", "no-cache");
      return reply.send(buf);
    },
  );
};
