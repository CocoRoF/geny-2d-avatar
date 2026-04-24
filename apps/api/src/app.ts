/**
 * Geny API Fastify app 생성자. 서버와 테스트에서 공용.
 *
 * 설계 (docs/03-ARCHITECTURE.md §3.2):
 *   - 프레임워크: Fastify v5
 *   - 엔드포인트: /api/health, /api/presets, /api/texture/upload, /api/build, /api/bundle/:id/*
 *   - rigTemplatesRoot, texturesDir, bundlesDir 는 DI (테스트에서 tmp dir)
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import fastifyFactory from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyCors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { presetsRoute } from "./routes/presets.js";
import { textureUploadRoute } from "./routes/texture-upload.js";
import { buildRoute } from "./routes/build.js";
import { bundleRoute } from "./routes/bundle.js";

export interface AppOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir?: string;
  readonly bundlesDir?: string;
  readonly maxFileSize?: number;
  readonly logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const fastify = fastifyFactory({ logger: opts.logger ?? false });

  const texturesDir = opts.texturesDir ?? join(tmpdir(), "geny-api-textures");
  const bundlesDir = opts.bundlesDir ?? join(tmpdir(), "geny-api-bundles");
  const maxFileSize = opts.maxFileSize ?? 16 * 1024 * 1024;

  // 웹 UI 가 다른 포트 (web-preview 4173 / web-editor 5173) 에서 접근.
  // dev 환경에선 * 로 열어두고 프로덕션은 환경변수로 origin allowlist 교체 예정 (Phase 6).
  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: maxFileSize, fields: 10, files: 1 },
  });

  await fastify.register(presetsRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
  await fastify.register(textureUploadRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    maxFileSize,
  });
  await fastify.register(buildRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    bundlesDir,
  });
  await fastify.register(bundleRoute, { bundlesDir });

  fastify.get("/api/health", async () => ({ status: "ok", version: "0.1.0" }));

  return fastify;
}
