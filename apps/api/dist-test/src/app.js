/**
 * Geny API Fastify app 생성자. 서버와 테스트에서 공용.
 *
 * 설계 (docs/03-ARCHITECTURE.md §3.2):
 *   - 프레임워크: Fastify v5 (schemas / CORS / hooks 풍부)
 *   - 엔드포인트 순차 추가: presets → texture/upload → build → bundle
 *   - rigTemplatesRoot 는 DI - 테스트에서 tmp dir 사용
 */
import fastifyFactory from "fastify";
import { presetsRoute } from "./routes/presets.js";
export async function buildApp(opts) {
    const fastify = fastifyFactory({ logger: opts.logger ?? false });
    await fastify.register(presetsRoute, { rigTemplatesRoot: opts.rigTemplatesRoot });
    fastify.get("/api/health", async () => ({ status: "ok", version: "0.1.0" }));
    return fastify;
}
//# sourceMappingURL=app.js.map