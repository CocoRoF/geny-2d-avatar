/**
 * /api/presets/:preset_id/:version/atlas - 프리셋 atlas 의 slot_id + UV 목록 반환.
 *
 * P4.3 슬롯 선택 UI 에서 소비. /api/presets 가 aggregate 만 제공하므로 상세 slot
 * 데이터는 별도 엔드포인트로 분리 (payload 절약).
 *
 * 응답:
 *   {
 *     preset: { id, version },
 *     width, height,                          // atlas.textures[0] 크기
 *     slots: [
 *       { slot_id, uv: [u0, v0, u1, v1] },
 *       ...
 *     ]
 *   }
 *
 * 에러:
 *   404 PRESET_NOT_FOUND - preset 없음 or atlas.json 없음
 */

import type { FastifyPluginAsync } from "fastify";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

export interface PresetAtlasRouteOptions {
  readonly rigTemplatesRoot: string;
}

interface AtlasJson {
  readonly textures: readonly { readonly width: number; readonly height: number }[];
  readonly slots: readonly {
    readonly slot_id: string;
    readonly uv: readonly [number, number, number, number];
  }[];
}

export const presetAtlasRoute: FastifyPluginAsync<PresetAtlasRouteOptions> = async (
  fastify,
  opts,
) => {
  const root = resolve(opts.rigTemplatesRoot);

  fastify.get<{ Params: { preset_id: string; version: string } }>(
    "/api/presets/:preset_id/:version/atlas",
    async (request, reply) => {
      const { preset_id, version } = request.params;
      const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(preset_id);
      if (!m || !m[1] || !m[2]) {
        return reply.code(404).send({
          error: { code: "PRESET_NOT_FOUND", message: "invalid preset_id: " + preset_id },
        });
      }
      const atlasPath = join(root, m[1], m[2], "v" + version, "textures", "atlas.json");
      if (!existsSync(atlasPath)) {
        return reply.code(404).send({
          error: {
            code: "PRESET_NOT_FOUND",
            message: preset_id + "@" + version + " atlas.json 없음",
          },
        });
      }
      let atlas: AtlasJson;
      try {
        atlas = JSON.parse(await readFile(atlasPath, "utf8")) as AtlasJson;
      } catch (err) {
        return reply.code(500).send({
          error: { code: "ATLAS_PARSE_ERROR", message: (err as Error).message },
        });
      }
      const tex = atlas.textures[0];
      return {
        preset: { id: preset_id, version },
        width: tex?.width ?? 0,
        height: tex?.height ?? 0,
        slots: atlas.slots.map((s) => ({ slot_id: s.slot_id, uv: s.uv })),
      };
    },
  );
};
