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
 * 기본 레지스트리 우선순위 (앞=primary, 자동 chain):
 *   1. recolor (sharp 로컬 hue shift)               — referenceImage 있을 때 (atlas 100% 보존)
 *   2. pollinations@flux                            — 공개 HTTP, text-to-image only
 *   3. mock                                         — 결정론 placeholder
 *   4. nano-banana (Google Gemini)                  — 자동 chain 의 거의 마지막. 명시 선택 시만 의미.
 *   5. openai-image (gpt-image-*)                   — 자동 chain 의 마지막. 명시 선택 시만 의미.
 *
 * 왜 AI 가 자동 chain 끝쪽인가:
 *   Gemini Image / OpenAI gpt-image API 는 receive 한 atlas reference 를 무시하고 character
 *   portrait 을 새로 그리는 경향이 강함. atlas 형식 (정사각형 UV layout) 보존 못 함 →
 *   결과를 mao_pro skeleton 에 입히면 깨짐. 자동 모드에서는 atlas 안전한 recolor 로 갈음.
 *   AI 호출은 사용자가 builder.html 의 드롭다운에서 명시 선택했을 때만 단일 어댑터로 시도
 *   (apps/api/src/routes/texture-generate.ts 의 buildSingleAdapterRegistry).
 *
 * 개별 disable:
 *   GENY_NANO_BANANA_DISABLED=true
 *   GENY_OPENAI_IMAGE_DISABLED=true
 *   GENY_POLLINATIONS_DISABLED=true
 *   GENY_RECOLOR_DISABLED=true
 */
export function createDefaultAdapterRegistry(): TextureAdapterRegistry {
  const r = new TextureAdapterRegistry();
  r.register(createRecolorAdapter());
  r.register(createPollinationsAdapter());
  r.register(createMockAdapter());
  r.register(createNanoBananaAdapter());
  r.register(createOpenAIImageAdapter());
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
