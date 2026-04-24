// P3.4 - Pollinations.ai 어댑터 회귀. fetch 주입으로 네트워크 격리.
import test from "node:test";
import assert from "node:assert/strict";
import { createPollinationsAdapter } from "../src/lib/adapters/pollinations-adapter.js";
function task(over) {
    return {
        preset: { id: "tpl.base.v1.halfbody", version: "1.3.0" },
        prompt: "test prompt",
        seed: 42,
        width: 512,
        height: 512,
        ...over,
    };
}
/** 유효한 최소 PNG (8-byte signature + IHDR + IDAT + IEND). pngjs 로 생성 후 캐싱하지 않고 리터럴 bytes 사용은 복잡 — 대신 실제 mock-generator 로 4x4 PNG 만들어 사용. */
import { generateMockTexture } from "../src/lib/mock-generator.js";
const VALID_PNG = generateMockTexture({ prompt: "fx", seed: 0, width: 32, height: 32 });
function mockFetchOk(buf, contentType = "image/png") {
    return (async () => new Response(new Uint8Array(buf), {
        status: 200,
        headers: { "content-type": contentType },
    }));
}
function mockFetchStatus(status) {
    return (async () => new Response("error", { status }));
}
function mockFetchThrow(err) {
    return (async () => {
        throw err;
    });
}
test("pollinations.supports: prompt 공백 / 해상도 초과 / disabled 는 false", () => {
    const a = createPollinationsAdapter({ enabled: true });
    assert.equal(a.supports(task()), true);
    assert.equal(a.supports(task({ prompt: "" })), false);
    assert.equal(a.supports(task({ prompt: "   " })), false);
    assert.equal(a.supports(task({ width: 4096 })), false);
    assert.equal(a.supports(task({ height: 4096 })), false);
    const disabled = createPollinationsAdapter({ enabled: false });
    assert.equal(disabled.supports(task()), false);
});
test("pollinations.name 에 모델 포함", () => {
    const a = createPollinationsAdapter({ model: "flux" });
    assert.equal(a.name, "pollinations@flux");
    const b = createPollinationsAdapter({ model: "turbo" });
    assert.equal(b.name, "pollinations@turbo");
});
test("pollinations.generate: 200 + PNG 반환 → 성공", async () => {
    const a = createPollinationsAdapter({
        fetchImpl: mockFetchOk(VALID_PNG, "image/png"),
    });
    const res = await a.generate(task({ width: 32, height: 32 }));
    assert.ok(res.png.length > 0);
    assert.match(res.sha256, /^[a-f0-9]{64}$/);
    assert.equal(res.width, 32);
    assert.equal(res.height, 32);
});
test("pollinations.generate: 200 + JPEG 반환 → INVALID_OUTPUT", async () => {
    const jpegLike = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0]);
    const a = createPollinationsAdapter({
        fetchImpl: mockFetchOk(jpegLike, "image/jpeg"),
    });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "INVALID_OUTPUT");
    }
});
test("pollinations.generate: 503 → VENDOR_ERROR_5XX", async () => {
    const a = createPollinationsAdapter({ fetchImpl: mockFetchStatus(503) });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "VENDOR_ERROR_5XX");
    }
});
test("pollinations.generate: 400 → VENDOR_ERROR_4XX", async () => {
    const a = createPollinationsAdapter({ fetchImpl: mockFetchStatus(400) });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "VENDOR_ERROR_4XX");
    }
});
test("pollinations.generate: 429 → RATE_LIMITED", async () => {
    const a = createPollinationsAdapter({ fetchImpl: mockFetchStatus(429) });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "RATE_LIMITED");
    }
});
test("pollinations.generate: AbortError → TIMEOUT", async () => {
    const abortErr = new Error("aborted");
    abortErr.name = "AbortError";
    const a = createPollinationsAdapter({ fetchImpl: mockFetchThrow(abortErr) });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "TIMEOUT");
    }
});
test("pollinations.generate: 네트워크 error → NETWORK_ERROR", async () => {
    const a = createPollinationsAdapter({
        fetchImpl: mockFetchThrow(new Error("ENOTFOUND")),
    });
    try {
        await a.generate(task());
        assert.fail("should throw");
    }
    catch (err) {
        const e = err;
        assert.equal(e.code, "NETWORK_ERROR");
    }
});
test("pollinations URL 구성 검증 (prompt/width/height/seed/model 파라미터)", async () => {
    let capturedUrl = null;
    const a = createPollinationsAdapter({
        model: "flux",
        fetchImpl: (async (url) => {
            capturedUrl = url;
            return new Response(new Uint8Array(VALID_PNG), {
                status: 200,
                headers: { "content-type": "image/png" },
            });
        }),
    });
    await a.generate(task({ prompt: "blue hair girl", seed: 777, width: 256, height: 512 }));
    const u = new URL(capturedUrl.toString());
    assert.match(u.pathname, /blue/);
    assert.equal(u.searchParams.get("width"), "256");
    assert.equal(u.searchParams.get("height"), "512");
    assert.equal(u.searchParams.get("seed"), "777");
    assert.equal(u.searchParams.get("model"), "flux");
    assert.equal(u.searchParams.get("nologo"), "true");
});
//# sourceMappingURL=pollinations-adapter.test.js.map