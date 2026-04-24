// P2.1 - /api/presets 엔드포인트 검증.
// Fastify inject() 로 실 HTTP 포트 없이 호출.
// P3.4 - /api/health 응답에 adapters 포함. 테스트에서 pollinations 비활성 (mock 단독).
process.env.GENY_POLLINATIONS_DISABLED = "true";
import test from "node:test";
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/app.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..", "..");
const rigTemplatesRoot = resolve(repoRoot, "rig-templates");
test("/api/health → status ok", async () => {
    const app = await buildApp({ rigTemplatesRoot });
    try {
        const res = await app.inject({ method: "GET", url: "/api/health" });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.equal(body.status, "ok");
        assert.ok(body.version.length > 0);
    }
    finally {
        await app.close();
    }
});
test("/api/presets → 현 활성 프리셋 (mao_pro + halfbody v1.3.0 + fullbody v1.0.0)", async () => {
    const app = await buildApp({ rigTemplatesRoot });
    try {
        const res = await app.inject({ method: "GET", url: "/api/presets" });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.ok(Array.isArray(body.presets));
        // 최소 3 프리셋 (mao_pro + halfbody v1.3.0 + fullbody v1.0.0). 구버전은 archive 라 미포함.
        assert.ok(body.presets.length >= 3, "expected at least 3 presets, got " + body.presets.length);
        const mao = body.presets.find((p) => p.id === "tpl.base.v1.mao_pro");
        assert.ok(mao, "mao_pro preset should be listed");
        assert.equal(mao.version, "1.0.0");
        assert.equal(mao.origin, "third-party");
        assert.equal(mao.family, "custom");
        const halfbody = body.presets.find((p) => p.id === "tpl.base.v1.halfbody");
        assert.ok(halfbody, "halfbody preset should be listed");
        assert.equal(halfbody.version, "1.3.0");
        assert.equal(halfbody.origin, "derived"); // origin 필드 없으면 derived 기본
        const fullbody = body.presets.find((p) => p.id === "tpl.base.v1.fullbody");
        assert.ok(fullbody, "fullbody preset should be listed");
        assert.equal(fullbody.version, "1.0.0");
        // 모든 프리셋이 canvas + display_name 를 포함
        for (const p of body.presets) {
            assert.ok(p.canvas.width > 0);
            assert.ok(p.canvas.height > 0);
            assert.ok(p.display_name.en.length > 0);
        }
    }
    finally {
        await app.close();
    }
});
test("/api/presets → 비어있는 rigTemplatesRoot 는 빈 배열", async () => {
    const app = await buildApp({ rigTemplatesRoot: "/tmp/non-existent-geny-test" });
    try {
        const res = await app.inject({ method: "GET", url: "/api/presets" });
        assert.equal(res.statusCode, 200);
        const body = res.json();
        assert.deepEqual(body.presets, []);
    }
    finally {
        await app.close();
    }
});
test("/api/presets 응답은 id@version 알파벳 정렬", async () => {
    const app = await buildApp({ rigTemplatesRoot });
    try {
        const res = await app.inject({ method: "GET", url: "/api/presets" });
        const body = res.json();
        const keys = body.presets.map((p) => p.id + "@" + p.version);
        const sorted = [...keys].sort();
        assert.deepEqual(keys, sorted, "presets should be sorted by id@version");
    }
    finally {
        await app.close();
    }
});
test("GET /api/unknown → 404", async () => {
    const app = await buildApp({ rigTemplatesRoot });
    try {
        const res = await app.inject({ method: "GET", url: "/api/unknown" });
        assert.equal(res.statusCode, 404);
    }
    finally {
        await app.close();
    }
});
//# sourceMappingURL=presets.test.js.map