/**
 * /api/texture/:id.png - 생성/업로드된 텍스처 PNG 직접 서빙.
 *
 * builder.html 의 런타임 프리뷰 (Live2D 렌더) 가 최신 텍스처를 바로 HTTP URL 로
 * 참조하기 위해 사용. `texturesDir/<texture_id>.png` 를 그대로 스트림.
 *
 * 에러:
 *   400 INVALID_TEXTURE_ID - 형식 불일치
 *   404 TEXTURE_NOT_FOUND  - 파일 없음
 */

import type { FastifyPluginAsync } from "fastify";
import { existsSync } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface TextureServeRouteOptions {
  readonly texturesDir: string;
}

export const textureServeRoute: FastifyPluginAsync<TextureServeRouteOptions> = async (
  fastify,
  opts,
) => {
  const texturesDir = resolve(opts.texturesDir);

  fastify.get<{ Params: { id: string } }>("/api/texture/:id.png", async (request, reply) => {
    const id = request.params.id;
    if (!/^tex_[a-f0-9]{32}$/.test(id)) {
      return reply.code(400).send({
        error: { code: "INVALID_TEXTURE_ID", message: "texture_id 포맷 오류: " + id },
      });
    }
    const filePath = join(texturesDir, id + ".png");
    if (!existsSync(filePath)) {
      return reply.code(404).send({
        error: { code: "TEXTURE_NOT_FOUND", message: "texture_id=" + id + " 파일 없음" },
      });
    }
    const info = await stat(filePath);
    const buf = await readFile(filePath);
    reply.header("content-type", "image/png");
    reply.header("content-length", info.size);
    reply.header("cache-control", "no-cache"); // 텍스처는 동일 id 로 덮어쓰지 않지만 안전하게.
    return reply.send(buf);
  });
};
