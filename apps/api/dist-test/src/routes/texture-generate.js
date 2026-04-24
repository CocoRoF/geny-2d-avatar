/**
 * /api/texture/generate - 텍스처 생성 (어댑터 경유).
 *
 * 요청 body (JSON):
 *   {
 *     preset_id:      "tpl.base.v1.mao_pro",
 *     preset_version: "1.0.0",
 *     prompt:         "blue-haired girl, pastel hoodie",
 *     seed?:          1234567890
 *   }
 *
 * 동작 (P3.3):
 *   1) preset 조회 → atlas.json 에서 width/height 읽음
 *   2) TextureAdapterRegistry 에서 eligible 어댑터 순차 시도 (첫 성공 채택)
 *   3) attempts[] 기록 → texture.manifest.json.generated_by.attempts
 *   4) 응답: { texture_id, sha256, adapter, attempts, ... }
 *
 * 현재 등록된 어댑터: "mock" (P3.3). 실 AI 벤더 어댑터 (P3.4) 추가 시 primary 자동 변경.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { writeTextureManifest } from "../lib/texture-manifest.js";
import { runTextureGenerate, AllAdaptersFailedError, NoEligibleAdapterError, } from "../lib/texture-adapter.js";
async function readAtlas(rigTemplatesRoot, id, version) {
    const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
    if (!m || !m[1] || !m[2])
        return null;
    const atlasPath = join(rigTemplatesRoot, m[1], m[2], "v" + version, "textures", "atlas.json");
    if (!existsSync(atlasPath))
        return null;
    try {
        return JSON.parse(await readFile(atlasPath, "utf8"));
    }
    catch {
        return null;
    }
}
export const textureGenerateRoute = async (fastify, opts) => {
    const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
    const texturesDir = resolve(opts.texturesDir);
    const registry = opts.adapters;
    await mkdir(texturesDir, { recursive: true });
    fastify.post("/api/texture/generate", async (request, reply) => {
        const body = request.body;
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
        const seed = Number.isFinite(body.seed) ? body.seed : 0;
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
        // 대용량 PNG 캡 (mock 속도 보호). 실 벤더 어댑터는 내부에서 자체 제한.
        const width = Math.min(t.width, 2048);
        const height = Math.min(t.height, 2048);
        let run;
        try {
            run = await runTextureGenerate({
                preset: { id: preset_id, version: preset_version },
                prompt: prompt.trim(),
                seed,
                width,
                height,
            }, registry);
        }
        catch (err) {
            if (err instanceof NoEligibleAdapterError) {
                return reply.code(503).send({
                    error: { code: "NO_ELIGIBLE_ADAPTER", message: err.message },
                });
            }
            if (err instanceof AllAdaptersFailedError) {
                return reply.code(502).send({
                    error: {
                        code: "ALL_ADAPTERS_FAILED",
                        message: err.message,
                        attempts: err.attempts,
                    },
                });
            }
            return reply.code(500).send({
                error: { code: "GENERATE_FAILED", message: err.message },
            });
        }
        const { result, adapter, attempts } = run;
        const textureId = "tex_" + randomUUID().replace(/-/g, "");
        const outPath = join(texturesDir, textureId + ".png");
        await writeFile(outPath, result.png);
        // provenance 포함 manifest. attempts 는 generated_by.attempts 로 직접 포함시킬 수 없음 —
        // writeTextureManifest 는 mode 기반 — 확장 필요. P3.3 에서는 우선 기본 mode 만.
        const mode = adapter === "mock" ? "mock_generate" : "ai_generate";
        await writeTextureManifest({
            texturesDir,
            textureId,
            atlasSha256: result.sha256,
            width: result.width,
            height: result.height,
            bytes: result.png.length,
            preset: { id: preset_id, version: preset_version },
            mode,
            adapter,
            prompt: prompt.trim(),
            seed,
            notes: "P3.3 adapter registry 경유 (" +
                adapter +
                "). attempts=" +
                attempts.length +
                ".",
        });
        return {
            texture_id: textureId,
            sha256: result.sha256,
            width: result.width,
            height: result.height,
            bytes: result.png.length,
            prompt: prompt.trim(),
            seed,
            adapter,
            attempts,
            preset: { id: preset_id, version: preset_version },
            path: outPath,
            note: adapter === "mock"
                ? "mock 생성 (결정론적, 실 AI 아님)"
                : "실 AI 벤더 " + adapter + " 경유",
        };
    });
};
//# sourceMappingURL=texture-generate.js.map