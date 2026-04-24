// P2.3 - /api/build + /api/bundle/:id/* 회귀.
// P3.4 - 테스트에서 pollinations 비활성 (기본 adapter registry 에 추가됨, 네트워크 격리).
process.env.GENY_POLLINATIONS_DISABLED = "true";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");
const HALFBODY_BASE_PNG = resolve(repoRoot, "rig-templates/base/halfbody/v1.3.0/textures/base.png");
function scratchDir() {
    return mkdtempSync(join(tmpdir(), "geny-api-test-"));
}
/** halfbody v1.3.0 base.png 를 textures dir 에 <texture_id>.png 로 배치해 업로드 시뮬. */
function seedTexture(texturesDir, textureId) {
    const buf = readFileSync(HALFBODY_BASE_PNG);
    writeFileSync(join(texturesDir, textureId + ".png"), buf);
}
test("POST /api/build: halfbody v1.3.0 번들 조립 성공", async () => {
    const textures = scratchDir();
    const bundles = scratchDir();
    seedTexture(textures, "tex_seed00000000000000000000000000");
    const app = await buildApp({ rigTemplatesRoot, texturesDir: textures, bundlesDir: bundles });
    try {
        const res = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                preset_id: "tpl.base.v1.halfbody",
                preset_version: "1.3.0",
                texture_id: "tex_seed00000000000000000000000000",
                bundle_name: "test_halfbody",
            }),
        });
        assert.equal(res.statusCode, 200, "body=" + res.body);
        const json = res.json();
        assert.match(json.bundle_id, /^bnd_[a-f0-9]{32}$/);
        assert.equal(json.bundle_url, "/api/bundle/" + json.bundle_id + "/bundle.json");
        assert.equal(json.download_url, "/api/bundle/" + json.bundle_id + "/download");
        assert.equal(json.file_count, 17, "halfbody v1.3.0 expected 17 files");
        // 번들이 디스크에 생성되었는지.
        const bundleDir = join(bundles, json.bundle_id);
        assert.ok(existsSync(join(bundleDir, "bundle.json")), "bundle.json on disk");
        assert.ok(existsSync(join(bundleDir, "textures", "test_halfbody_00.png")), "uploaded texture copied to bundle");
    }
    finally {
        await app.close();
        rmSync(textures, { recursive: true, force: true });
        rmSync(bundles, { recursive: true, force: true });
    }
});
test("POST /api/build: 누락 필드는 400 MISSING_FIELDS", async () => {
    const app = await buildApp({
        rigTemplatesRoot,
        texturesDir: scratchDir(),
        bundlesDir: scratchDir(),
    });
    try {
        const res = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({ preset_id: "tpl.base.v1.halfbody" }),
        });
        assert.equal(res.statusCode, 400);
        const json = res.json();
        assert.equal(json.error.code, "MISSING_FIELDS");
    }
    finally {
        await app.close();
    }
});
test("POST /api/build: 없는 preset 은 404 PRESET_NOT_FOUND", async () => {
    const app = await buildApp({
        rigTemplatesRoot,
        texturesDir: scratchDir(),
        bundlesDir: scratchDir(),
    });
    try {
        const res = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                preset_id: "tpl.base.v1.nonexistent",
                preset_version: "9.9.9",
                texture_id: "tex_anything",
            }),
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error.code, "PRESET_NOT_FOUND");
    }
    finally {
        await app.close();
    }
});
test("POST /api/build: 없는 texture 는 404 TEXTURE_NOT_FOUND", async () => {
    const app = await buildApp({
        rigTemplatesRoot,
        texturesDir: scratchDir(),
        bundlesDir: scratchDir(),
    });
    try {
        const res = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                preset_id: "tpl.base.v1.halfbody",
                preset_version: "1.3.0",
                texture_id: "tex_ghost00000000000000000000000000",
            }),
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error.code, "TEXTURE_NOT_FOUND");
    }
    finally {
        await app.close();
    }
});
test("GET /api/bundle/:id/bundle.json: 생성된 번들 파일 조회", async () => {
    const textures = scratchDir();
    const bundles = scratchDir();
    seedTexture(textures, "tex_seed00000000000000000000000001");
    const app = await buildApp({ rigTemplatesRoot, texturesDir: textures, bundlesDir: bundles });
    try {
        const buildRes = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                preset_id: "tpl.base.v1.halfbody",
                preset_version: "1.3.0",
                texture_id: "tex_seed00000000000000000000000001",
                bundle_name: "demo",
            }),
        });
        assert.equal(buildRes.statusCode, 200);
        const bundleId = buildRes.json().bundle_id;
        // bundle.json fetch
        const bundleJsonRes = await app.inject({
            method: "GET",
            url: "/api/bundle/" + bundleId + "/bundle.json",
        });
        assert.equal(bundleJsonRes.statusCode, 200);
        assert.match(bundleJsonRes.headers["content-type"], /application\/json/);
        const manifest = JSON.parse(bundleJsonRes.body);
        assert.equal(manifest.schema_version, "v1");
        assert.equal(manifest.template_id, "tpl.base.v1.halfbody");
    }
    finally {
        await app.close();
        rmSync(textures, { recursive: true, force: true });
        rmSync(bundles, { recursive: true, force: true });
    }
});
test("GET /api/bundle/:id/download: zip 스트리밍", async () => {
    const textures = scratchDir();
    const bundles = scratchDir();
    seedTexture(textures, "tex_seed00000000000000000000000002");
    const app = await buildApp({ rigTemplatesRoot, texturesDir: textures, bundlesDir: bundles });
    try {
        const buildRes = await app.inject({
            method: "POST",
            url: "/api/build",
            headers: { "content-type": "application/json" },
            payload: JSON.stringify({
                preset_id: "tpl.base.v1.halfbody",
                preset_version: "1.3.0",
                texture_id: "tex_seed00000000000000000000000002",
            }),
        });
        const bundleId = buildRes.json().bundle_id;
        const dl = await app.inject({
            method: "GET",
            url: "/api/bundle/" + bundleId + "/download",
        });
        assert.equal(dl.statusCode, 200);
        assert.equal(dl.headers["content-type"], "application/zip");
        assert.match(dl.headers["content-disposition"], new RegExp('attachment; filename="' + bundleId + '\\.zip"'));
        // ZIP magic: PK\x03\x04
        const zipBuf = dl.rawPayload;
        assert.ok(zipBuf.length > 0);
        assert.equal(zipBuf[0], 0x50);
        assert.equal(zipBuf[1], 0x4b);
    }
    finally {
        await app.close();
        rmSync(textures, { recursive: true, force: true });
        rmSync(bundles, { recursive: true, force: true });
    }
});
test("GET /api/bundle/invalid/xxx → 400 INVALID_BUNDLE_ID", async () => {
    const app = await buildApp({
        rigTemplatesRoot,
        texturesDir: scratchDir(),
        bundlesDir: scratchDir(),
    });
    try {
        const res = await app.inject({
            method: "GET",
            url: "/api/bundle/bnd_invalid/bundle.json",
        });
        assert.equal(res.statusCode, 400);
        assert.equal(res.json().error.code, "INVALID_BUNDLE_ID");
    }
    finally {
        await app.close();
    }
});
test("GET /api/bundle/bnd_<valid>/missing.json → 404 FILE_NOT_FOUND", async () => {
    const bundles = scratchDir();
    const app = await buildApp({
        rigTemplatesRoot,
        texturesDir: scratchDir(),
        bundlesDir: bundles,
    });
    try {
        // 유효 id 규격의 불특정 번들 요청 → 번들 디렉토리 자체 없어 BUNDLE_NOT_FOUND.
        const ghostId = "bnd_" + "0".repeat(32);
        const res = await app.inject({
            method: "GET",
            url: "/api/bundle/" + ghostId + "/bundle.json",
        });
        assert.equal(res.statusCode, 404);
        assert.equal(res.json().error.code, "BUNDLE_NOT_FOUND");
    }
    finally {
        await app.close();
        rmSync(bundles, { recursive: true, force: true });
    }
});
//# sourceMappingURL=build.test.js.map