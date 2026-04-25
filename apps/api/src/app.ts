/**
 * Geny API Fastify app 생성자. 서버와 테스트 공용.
 *
 * 설계 (docs/03-ARCHITECTURE.md §3.2):
 *   - Fastify v5 + @fastify/cors + @fastify/multipart
 *   - 엔드포인트: /api/health, /api/presets, /api/texture/{upload,generate}, /api/build, /api/bundle/:id/*
 *   - DI: rigTemplatesRoot / texturesDir / bundlesDir / TextureAdapterRegistry
 */

import { tmpdir } from "node:os";
import { join } from "node:path";
import fastifyFactory from "fastify";
import fastifyMultipart from "@fastify/multipart";
import fastifyCors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { presetsRoute } from "./routes/presets.js";
import { presetAtlasRoute } from "./routes/preset-atlas.js";
import { modelsRoute } from "./routes/models.js";
import { textureUploadRoute } from "./routes/texture-upload.js";
import { textureGenerateRoute } from "./routes/texture-generate.js";
import { textureGenerateSlotsRoute } from "./routes/texture-generate-slots.js";
import { textureServeRoute } from "./routes/texture-serve.js";
import { live2dProxyRoute } from "./routes/live2d-proxy.js";
import { buildRoute } from "./routes/build.js";
import { bundleRoute } from "./routes/bundle.js";
import { TextureAdapterRegistry } from "./lib/texture-adapter.js";
import { createMockAdapter } from "./lib/adapters/mock-adapter.js";
import { createPollinationsAdapter } from "./lib/adapters/pollinations-adapter.js";
import { createNanoBananaAdapter } from "./lib/adapters/nano-banana-adapter.js";
import { createOpenAIImageAdapter } from "./lib/adapters/openai-image-adapter.js";
import { createRecolorAdapter } from "./lib/adapters/recolor-adapter.js";

export interface AppOptions {
  readonly rigTemplatesRoot: string;
  readonly texturesDir?: string;
  readonly bundlesDir?: string;
  readonly maxFileSize?: number;
  readonly logger?: boolean;
  /** 어댑터 레지스트리. 주입 안 되면 mock adapter 만 등록 (P3.3 기본값). */
  readonly adapters?: TextureAdapterRegistry;
}

/**
 * 기본 레지스트리 우선순위 (앞=primary):
 *   1. nano-banana (Google Gemini 2.5 Flash Image)  — GEMINI_API_KEY 있을 때
 *   2. openai-image (gpt-image-1 edits)             — OPENAI_API_KEY 있을 때
 *   3. recolor (sharp 로컬 hue shift)               — referenceImage + 색 키워드 있을 때만
 *   4. pollinations@flux                            — 공개 HTTP, key 불필요
 *   5. mock                                         — 결정론 placeholder
 *
 * recolor 가 AI 다음에 위치한 이유: AI 가 atlas 형식 보존하면 좋음 (헤어스타일 변경 등 가능).
 * AI 가 ATLAS_RATIO_MISMATCH 로 거부하거나 실패하면 recolor 가 fallback 으로 동작 →
 * atlas 보존 + 색 변경은 무조건 성공. AI 키 없으면 recolor → pollinations → mock 순.
 *
 * supports() 에 의해 key 없는 벤더는 자동 skip → 다음 어댑터 시도.
 *
 * 개별 disable:
 *   GENY_NANO_BANANA_DISABLED=true
 *   GENY_OPENAI_IMAGE_DISABLED=true
 *   GENY_POLLINATIONS_DISABLED=true
 *   GENY_RECOLOR_DISABLED=true
 */
export function createDefaultAdapterRegistry(): TextureAdapterRegistry {
  const r = new TextureAdapterRegistry();
  r.register(createNanoBananaAdapter());
  r.register(createOpenAIImageAdapter());
  r.register(createRecolorAdapter());
  r.register(createPollinationsAdapter());
  r.register(createMockAdapter());
  return r;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const fastify = fastifyFactory({ logger: opts.logger ?? false });

  const texturesDir = opts.texturesDir ?? join(tmpdir(), "geny-api-textures");
  const bundlesDir = opts.bundlesDir ?? join(tmpdir(), "geny-api-bundles");
  const maxFileSize = opts.maxFileSize ?? 16 * 1024 * 1024;
  const adapters = opts.adapters ?? createDefaultAdapterRegistry();

  await fastify.register(fastifyCors, { origin: true });
  await fastify.register(fastifyMultipart, {
    limits: { fileSize: maxFileSize, fields: 10, files: 1 },
  });

  await fastify.register(presetsRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
  await fastify.register(presetAtlasRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
  await fastify.register(modelsRoute, { adapters });
  await fastify.register(textureUploadRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    maxFileSize,
  });
  await fastify.register(textureGenerateRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    adapters,
  });
  await fastify.register(textureGenerateSlotsRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    adapters,
  });
  await fastify.register(textureServeRoute, { texturesDir });
  await fastify.register(live2dProxyRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
  await fastify.register(buildRoute, {
    rigTemplatesRoot: opts.rigTemplatesRoot,
    texturesDir,
    bundlesDir,
  });
  await fastify.register(bundleRoute, { bundlesDir });

  fastify.get("/api/health", async () => ({
    status: "ok",
    version: "0.1.0",
    adapters: adapters.list().map((a) => a.name),
  }));

  return fastify;
}
