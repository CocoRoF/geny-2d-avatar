/**
 * Geny API Fastify app 생성자. 서버와 테스트에서 공용.
 *
 * 설계 (docs/03-ARCHITECTURE.md §3.2):
 *   - 프레임워크: Fastify v5 (schemas / CORS / hooks 풍부)
 *   - 엔드포인트 순차 추가: presets → texture/upload → build → bundle
 *   - rigTemplatesRoot, texturesDir 는 DI - 테스트에서 tmp dir 사용
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import fastifyFactory from "fastify";
import fastifyMultipart from "@fastify/multipart";
import type { FastifyInstance } from "fastify";
import { presetsRoute } from "./routes/presets.js";
import { textureUploadRoute } from "./routes/texture-upload.js";

export interface AppOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir?: string;
  readonly maxFileSize?: number;
  readonly logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const fastify = fastifyFactory({ logger: opts.logger ?? false });

  const texturesDir = opts.texturesDir ?? join(tmpdir(), "geny-api-textures");
  const maxFileSize = opts.maxFileSize ?? 16 * 1024 * 1024;

  await fastify.register(fastifyMultipart, {
    limits: {
      fileSize: maxFileSize,
      fields: 10,
      files: 1,
    },
  });

  await fastify.register(presetsRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
  await fastify.register(textureUploadRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    maxFileSize,
  });

  fastify.get("/api/health", async () => ({ status: "ok", version: "0.1.0" }));

  return fastify;
}
