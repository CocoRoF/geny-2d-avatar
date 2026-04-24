/**
 * /api/build - 업로드된 texture 와 preset 을 결합해 Cubism 번들 조립.
 *
 * 요청 body (application/json):
 *   {
 *     preset_id:      "tpl.base.v1.mao_pro",
 *     preset_version: "1.0.0",
 *     texture_id:     "tex_<uuid-hex32>",   // /api/texture/upload 응답에서 반환
 *     bundle_name?:   "aria",               // 기본: preset slug
 *     avatar_id?:     "avt.demo-001"        // 기본: "avt.<bundle_id>"
 *   }
 *
 * 동작:
 *   1) preset 존재 확인
 *   2) texture_id 의 PNG 파일 존재 확인
 *   3) 임시 AvatarExportSpec 작성:
 *        template_id / template_version / bundle_name / moc_path / texture_paths
 *   4) assembleAvatarBundle(spec, rigTemplatesRoot, bundleOutDir) 호출
 *   5) bundle 의 textures/ 하위에 업로드 PNG 복사 (spec 의 texture_paths 경로로 배치)
 *   6) 응답: { bundle_id, bundle_url: "/api/bundle/<id>/bundle.json", files: [...] }
 */
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { assembleAvatarBundle, } from "@geny/exporter-core/avatar-bundle";
async function readManifest(rigTemplatesRoot, id, version) {
    const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
    if (!m || !m[1] || !m[2])
        return null;
    const ns = m[1];
    const slug = m[2];
    const path = join(rigTemplatesRoot, ns, slug, "v" + version, "template.manifest.json");
    if (!existsSync(path))
        return null;
    try {
        const buf = await readFile(path, "utf8");
        return { manifest: JSON.parse(buf), slug };
    }
    catch {
        return null;
    }
}
export const buildRoute = async (fastify, opts) => {
    const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
    const texturesDir = resolve(opts.texturesDir);
    const bundlesDir = resolve(opts.bundlesDir);
    await mkdir(bundlesDir, { recursive: true });
    fastify.post("/api/build", async (request, reply) => {
        const body = request.body;
        if (!body || typeof body !== "object") {
            return reply.code(400).send({
                error: { code: "INVALID_BODY", message: "application/json body 가 필요합니다." },
            });
        }
        const { preset_id, preset_version, texture_id } = body;
        if (!preset_id || !preset_version || !texture_id) {
            return reply.code(400).send({
                error: {
                    code: "MISSING_FIELDS",
                    message: "preset_id, preset_version, texture_id 모두 필요합니다.",
                },
            });
        }
        // Preset 확인
        const presetInfo = await readManifest(rigTemplatesRoot, preset_id, preset_version);
        if (!presetInfo) {
            return reply.code(404).send({
                error: {
                    code: "PRESET_NOT_FOUND",
                    message: preset_id + "@" + preset_version + " 프리셋을 찾을 수 없습니다.",
                },
            });
        }
        // Texture 확인
        const texturePath = join(texturesDir, texture_id + ".png");
        if (!existsSync(texturePath)) {
            return reply.code(404).send({
                error: {
                    code: "TEXTURE_NOT_FOUND",
                    message: "texture_id=" + texture_id + " 파일을 찾을 수 없습니다.",
                },
            });
        }
        const bundleName = body.bundle_name ?? presetInfo.slug;
        const bundleId = "bnd_" + randomUUID().replace(/-/g, "");
        const avatarId = body.avatar_id ?? null;
        const bundleOutDir = join(bundlesDir, bundleId);
        await mkdir(bundleOutDir, { recursive: true });
        // AvatarExportSpec 작성. avatar_id 패턴은 av_<ULID> (schema) — 간이 데모용으로 null.
        // 실 프로덕션은 ULID 생성 유틸이 필요 (sample-01-aria 처럼).
        const spec = {
            schema_version: "v1",
            avatar_id: avatarId ?? "av_01JBMBTC8W5FQ0RTYAX38P7Z5K",
            template_id: preset_id,
            template_version: preset_version,
            bundle_name: bundleName,
            moc_path: bundleName + ".moc3",
            texture_paths: ["textures/" + bundleName + "_00.png"],
            lipsync: "precise",
        };
        // Bundle 조립.
        let result;
        try {
            result = assembleAvatarBundle(spec, rigTemplatesRoot, bundleOutDir);
        }
        catch (err) {
            return reply.code(500).send({
                error: {
                    code: "ASSEMBLE_FAILED",
                    message: "assembleAvatarBundle 실패: " + err.message,
                },
            });
        }
        // 업로드 PNG 를 bundle 의 texture slot 위치로 복사.
        const paths = spec.texture_paths ?? [];
        const textureDestRel = paths[0]; // "textures/<name>_00.png"
        if (textureDestRel) {
            const textureDest = join(bundleOutDir, textureDestRel);
            await mkdir(dirname(textureDest), { recursive: true });
            await copyFile(texturePath, textureDest);
        }
        return {
            bundle_id: bundleId,
            bundle_url: "/api/bundle/" + bundleId + "/bundle.json",
            download_url: "/api/bundle/" + bundleId + "/download",
            preset: { id: preset_id, version: preset_version },
            texture_id,
            bundle_name: bundleName,
            file_count: result.files.length,
            files: result.files.map((f) => ({ path: f.path, bytes: f.bytes })),
        };
    });
};
//# sourceMappingURL=build.js.map