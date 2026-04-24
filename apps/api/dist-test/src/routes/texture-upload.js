/**
 * /api/texture/upload - PNG 텍스처 업로드 + 검증 + 저장.
 *
 * multipart 필드:
 *   preset_id      (string)  예: "tpl.base.v1.mao_pro"
 *   preset_version (string)  예: "1.0.0"
 *   file           (binary)  PNG 바이너리
 *
 * 동작:
 *   1) preset 조회 → atlas.json 에서 기대 width/height 읽음
 *   2) PNG magic + IHDR 파싱 → 크기/포맷 검증
 *   3) sha256 계산
 *   4) `<texturesDir>/<uuid>.png` 로 저장
 *   5) 응답: { texture_id, sha256, width, height }
 *
 * 검증 실패 시 400 + { error: { code, message } }.
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { isPng, readPngInfo } from "../lib/png.js";
import { writeTextureManifest } from "../lib/texture-manifest.js";
async function readAtlas(rigTemplatesRoot, id, version) {
    // id="tpl.base.v1.<slug>" → base/<slug>/v<version>/textures/atlas.json
    const m = /^tpl\.(base|community|custom)\.v[0-9]+\.([a-z][a-z0-9_]{1,40})$/.exec(id);
    if (!m || !m[1] || !m[2])
        return null;
    const ns = m[1];
    const slug = m[2];
    const atlasPath = join(rigTemplatesRoot, ns, slug, "v" + version, "textures", "atlas.json");
    if (!existsSync(atlasPath))
        return null;
    try {
        const buf = await readFile(atlasPath, "utf8");
        return JSON.parse(buf);
    }
    catch {
        return null;
    }
}
export const textureUploadRoute = async (fastify, opts) => {
    const rigTemplatesRoot = resolve(opts.rigTemplatesRoot);
    const texturesDir = resolve(opts.texturesDir);
    const maxFileSize = opts.maxFileSize ?? 16 * 1024 * 1024;
    await mkdir(texturesDir, { recursive: true });
    fastify.post("/api/texture/upload", async (request, reply) => {
        if (!request.isMultipart()) {
            return reply.code(400).send({
                error: { code: "NOT_MULTIPART", message: "Content-Type 은 multipart/form-data 여야 합니다." },
            });
        }
        let presetId = "";
        let presetVersion = "";
        let fileBuf = null;
        let filename = "";
        for await (const part of request.parts()) {
            if (part.type === "field") {
                if (part.fieldname === "preset_id")
                    presetId = String(part.value);
                else if (part.fieldname === "preset_version")
                    presetVersion = String(part.value);
            }
            else if (part.type === "file") {
                if (part.fieldname !== "file")
                    continue;
                filename = part.filename ?? "(no name)";
                const chunks = [];
                let total = 0;
                for await (const chunk of part.file) {
                    total += chunk.length;
                    if (total > maxFileSize) {
                        return reply.code(413).send({
                            error: {
                                code: "FILE_TOO_LARGE",
                                message: `파일 크기가 최대 허용치 ${maxFileSize} bytes 를 초과했습니다.`,
                            },
                        });
                    }
                    chunks.push(chunk);
                }
                fileBuf = Buffer.concat(chunks);
            }
        }
        if (!fileBuf || fileBuf.length === 0) {
            return reply.code(400).send({
                error: { code: "MISSING_FILE", message: "file 필드에 PNG 가 포함되지 않았습니다." },
            });
        }
        if (!presetId || !presetVersion) {
            return reply.code(400).send({
                error: {
                    code: "MISSING_PRESET",
                    message: "preset_id 와 preset_version 필드가 필요합니다.",
                },
            });
        }
        if (!isPng(fileBuf)) {
            return reply.code(400).send({
                error: { code: "NOT_PNG", message: "PNG 시그니처가 아닙니다. (filename=" + filename + ")" },
            });
        }
        const info = readPngInfo(fileBuf);
        if (!info) {
            return reply.code(400).send({
                error: { code: "INVALID_PNG_HEADER", message: "PNG IHDR 을 읽을 수 없습니다." },
            });
        }
        if (!info.hasAlpha) {
            return reply.code(400).send({
                error: {
                    code: "PNG_NO_ALPHA",
                    message: "RGBA 또는 grayscale+alpha 만 허용 (현재 colorType=" + info.colorTypeName + ").",
                },
            });
        }
        // Preset atlas 와 크기 비교.
        const atlas = await readAtlas(rigTemplatesRoot, presetId, presetVersion);
        if (!atlas) {
            return reply.code(404).send({
                error: {
                    code: "PRESET_NOT_FOUND",
                    message: "preset_id=" + presetId + "@" + presetVersion + " 또는 atlas.json 을 찾을 수 없음.",
                },
            });
        }
        const expected = atlas.textures[0];
        if (!expected) {
            return reply.code(500).send({
                error: { code: "PRESET_ATLAS_EMPTY", message: "atlas.textures[] 가 비어있습니다." },
            });
        }
        if (info.width !== expected.width || info.height !== expected.height) {
            return reply.code(400).send({
                error: {
                    code: "SIZE_MISMATCH",
                    message: "PNG 크기 " +
                        info.width +
                        "x" +
                        info.height +
                        " 가 atlas 기대값 " +
                        expected.width +
                        "x" +
                        expected.height +
                        " 와 다릅니다.",
                },
            });
        }
        // sha256 + PNG 저장 + manifest 사이드카 저장.
        const sha256 = createHash("sha256").update(fileBuf).digest("hex");
        const textureId = "tex_" + randomUUID().replace(/-/g, "");
        const outPath = join(texturesDir, textureId + ".png");
        await writeFile(outPath, fileBuf);
        await writeTextureManifest({
            texturesDir,
            textureId,
            atlasSha256: sha256,
            width: info.width,
            height: info.height,
            bytes: fileBuf.length,
            preset: { id: presetId, version: presetVersion },
            mode: "manual_upload",
            sourceFilename: filename,
        });
        return {
            texture_id: textureId,
            sha256,
            width: info.width,
            height: info.height,
            bytes: fileBuf.length,
            preset: { id: presetId, version: presetVersion },
            path: outPath,
        };
    });
};
//# sourceMappingURL=texture-upload.js.map