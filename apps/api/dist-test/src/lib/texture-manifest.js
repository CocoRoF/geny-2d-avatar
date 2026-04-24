/**
 * texture.manifest.json I/O 유틸 - schema/v1/texture-manifest.schema.json 준수.
 *
 * upload/generate 시 `<texturesDir>/<texture_id>.meta.json` 로 사이드카 저장,
 * build 시 읽어서 bundle 의 `texture.manifest.json` 으로 포함.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
export async function writeTextureManifest(input) {
    const manifest = {
        schema_version: "v1",
        format: 1,
        texture_id: input.textureId,
        atlas_sha256: input.atlasSha256,
        width: input.width,
        height: input.height,
        bytes: input.bytes,
        preset: { id: input.preset.id, version: input.preset.version },
        generated_by: {
            mode: input.mode,
            ...(input.adapter !== undefined ? { adapter: input.adapter } : {}),
            ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
            ...(input.seed !== undefined ? { seed: input.seed } : {}),
            ...(input.sourceFilename !== undefined ? { source_filename: input.sourceFilename } : {}),
        },
        created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };
    const path = join(input.texturesDir, input.textureId + ".meta.json");
    await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
    return manifest;
}
export async function readTextureManifest(texturesDir, textureId) {
    const path = join(texturesDir, textureId + ".meta.json");
    if (!existsSync(path))
        return null;
    try {
        const buf = await readFile(path, "utf8");
        return JSON.parse(buf);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=texture-manifest.js.map