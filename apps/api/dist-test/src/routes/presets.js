/**
 * /api/presets - rig-templates/ 디렉토리를 스캔해 프리셋 카탈로그 반환.
 *
 * 응답 스키마:
 * {
 *   presets: Array<{
 *     id: string,          // "tpl.base.v1.mao_pro"
 *     version: string,     // "1.0.0"
 *     display_name: { en, ko?, ja? },
 *     family: string,      // "halfbody" | "fullbody" | "custom" | ...
 *     origin: "third-party" | "derived" | "user",
 *     canvas: { width, height },
 *     atlas: { width, height, slot_count },
 *     motion_count: number,
 *     expression_count: number
 *   }>
 * }
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
async function readJson(path) {
    try {
        const buf = await readFile(path, "utf8");
        return JSON.parse(buf);
    }
    catch {
        return null;
    }
}
async function countFiles(dir) {
    if (!existsSync(dir))
        return 0;
    try {
        const names = await readdir(dir);
        let n = 0;
        for (const name of names) {
            const full = join(dir, name);
            const st = await stat(full);
            if (st.isFile())
                n += 1;
        }
        return n;
    }
    catch {
        return 0;
    }
}
async function scanPresetDir(presetDir) {
    const manifestPath = join(presetDir, "template.manifest.json");
    const manifest = await readJson(manifestPath);
    if (!manifest)
        return null;
    const atlas = await readJson(join(presetDir, "textures", "atlas.json"));
    const motionCount = await countFiles(join(presetDir, "motions"));
    const expressionCount = await countFiles(join(presetDir, "expressions"));
    return {
        id: manifest.id,
        version: manifest.version,
        display_name: manifest.display_name,
        family: manifest.family,
        origin: manifest.origin?.kind ?? "derived",
        canvas: manifest.canvas,
        atlas: atlas
            ? {
                width: atlas.textures[0]?.width ?? 0,
                height: atlas.textures[0]?.height ?? 0,
                slot_count: atlas.slots.length,
            }
            : null,
        motion_count: motionCount,
        expression_count: expressionCount,
    };
}
/**
 * rig-templates root 디렉토리를 순회해 모든 preset 발견.
 * 구조: <root>/base/<slug>/v<X.Y.Z>/template.manifest.json
 */
export async function scanPresets(rigTemplatesRoot) {
    const baseDir = join(rigTemplatesRoot, "base");
    if (!existsSync(baseDir))
        return [];
    const results = [];
    const slugs = await readdir(baseDir);
    for (const slug of slugs) {
        const slugDir = join(baseDir, slug);
        const st = await stat(slugDir).catch(() => null);
        if (!st?.isDirectory())
            continue;
        const versions = await readdir(slugDir);
        for (const v of versions) {
            if (!/^v[0-9]+\.[0-9]+\.[0-9]+$/.test(v))
                continue;
            const presetDir = join(slugDir, v);
            const p = await scanPresetDir(presetDir);
            if (p)
                results.push(p);
        }
    }
    // id + version 정렬
    results.sort((a, b) => {
        if (!a || !b)
            return 0;
        const aKey = a.id + "@" + a.version;
        const bKey = b.id + "@" + b.version;
        return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
    });
    return results.filter((r) => r !== null);
}
export const presetsRoute = async (fastify, opts) => {
    const root = resolve(opts.rigTemplatesRoot);
    fastify.get("/api/presets", async () => {
        const presets = await scanPresets(root);
        return { presets };
    });
};
//# sourceMappingURL=presets.js.map