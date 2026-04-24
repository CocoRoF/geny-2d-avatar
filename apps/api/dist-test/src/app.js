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
import { presetsRoute } from "./routes/presets.js";
import { textureUploadRoute } from "./routes/texture-upload.js";
import { textureGenerateRoute } from "./routes/texture-generate.js";
import { buildRoute } from "./routes/build.js";
import { bundleRoute } from "./routes/bundle.js";
import { TextureAdapterRegistry } from "./lib/texture-adapter.js";
import { createMockAdapter } from "./lib/adapters/mock-adapter.js";
/** 기본 레지스트리 = mock 어댑터만. 실 벤더는 P3.4 에서 추가. */
export function createDefaultAdapterRegistry() {
    const r = new TextureAdapterRegistry();
    r.register(createMockAdapter());
    return r;
}
export async function buildApp(opts) {
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
//# sourceMappingURL=app.js.map