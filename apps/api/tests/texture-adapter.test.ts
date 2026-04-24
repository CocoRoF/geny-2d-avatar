// P3.3 - TextureAdapterRegistry + runTextureGenerate + mock-adapter 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import {
  TextureAdapterRegistry,
  runTextureGenerate,
  NoEligibleAdapterError,
  AllAdaptersFailedError,
  type TextureAdapter,
  type TextureTask,
} from "../src/lib/texture-adapter.js";
import { createMockAdapter } from "../src/lib/adapters/mock-adapter.js";

function task(over?: Partial<TextureTask>): TextureTask {
  return {
    preset: { id: "tpl.base.v1.halfbody", version: "1.3.0" },
    prompt: "test",
    seed: 0,
    width: 64,
    height: 64,
    ...over,
  };
}

test("TextureAdapterRegistry: register + list + eligible", () => {
  const r = new TextureAdapterRegistry();
  const mock = createMockAdapter();
  r.register(mock);
  assert.equal(r.list().length, 1);
  assert.equal(r.list()[0]!.name, "mock");
  assert.equal(r.eligible(task()).length, 1);
});

test("TextureAdapterRegistry: 중복 이름 register → throw", () => {
  const r = new TextureAdapterRegistry();
  r.register(createMockAdapter());
  assert.throws(() => r.register(createMockAdapter()), /duplicate adapter/);
});

test("TextureAdapterRegistry: 등록 순서 = eligible 순서", () => {
  const r = new TextureAdapterRegistry();
  const a: TextureAdapter = {
    name: "a",
    supports: () => true,
    async generate() {
      throw new Error("nope");
    },
  };
  const b: TextureAdapter = {
    name: "b",
    supports: () => true,
    async generate() {
      throw new Error("nope");
    },
  };
  r.register(a);
  r.register(b);
  const e = r.eligible(task());
  assert.equal(e[0]!.name, "a");
  assert.equal(e[1]!.name, "b");
});

test("runTextureGenerate: mock adapter 성공 경로", async () => {
  const r = new TextureAdapterRegistry();
  r.register(createMockAdapter());
  const res = await runTextureGenerate(task(), r);
  assert.equal(res.adapter, "mock");
  assert.equal(res.attempts.length, 1);
  assert.equal(res.attempts[0]!.status, "success");
  assert.ok(res.result.png.length > 0);
  assert.match(res.result.sha256, /^[a-f0-9]{64}$/);
  assert.equal(res.result.width, 64);
  assert.equal(res.result.height, 64);
});

test("runTextureGenerate: eligible 없으면 NoEligibleAdapterError", async () => {
  const r = new TextureAdapterRegistry();
  r.register({
    name: "strict",
    supports: (t) => t.width >= 1024,
    async generate() {
      throw new Error("not called");
    },
  });
  await assert.rejects(
    () => runTextureGenerate(task({ width: 64, height: 64 }), r),
    NoEligibleAdapterError,
  );
});

test("runTextureGenerate: primary 실패 → secondary 성공 fallback", async () => {
  const r = new TextureAdapterRegistry();
  let primaryCalled = false;
  r.register({
    name: "primary",
    supports: () => true,
    async generate() {
      primaryCalled = true;
      const e = new Error("primary error");
      (e as { code?: string }).code = "SIMULATED";
      throw e;
    },
  });
  r.register(createMockAdapter());
  const res = await runTextureGenerate(task(), r);
  assert.ok(primaryCalled);
  assert.equal(res.adapter, "mock");
  assert.equal(res.attempts.length, 2);
  assert.equal(res.attempts[0]!.adapter, "primary");
  assert.equal(res.attempts[0]!.status, "error");
  assert.equal(res.attempts[0]!.error_code, "SIMULATED");
  assert.equal(res.attempts[1]!.adapter, "mock");
  assert.equal(res.attempts[1]!.status, "success");
});

test("runTextureGenerate: 모든 어댑터 실패 → AllAdaptersFailedError + attempts 제공", async () => {
  const r = new TextureAdapterRegistry();
  r.register({
    name: "a",
    supports: () => true,
    async generate() {
      throw new Error("a fail");
    },
  });
  r.register({
    name: "b",
    supports: () => true,
    async generate() {
      throw new Error("b fail");
    },
  });
  try {
    await runTextureGenerate(task(), r);
    assert.fail("should throw");
  } catch (err) {
    assert.ok(err instanceof AllAdaptersFailedError);
    assert.equal((err as AllAdaptersFailedError).attempts.length, 2);
    assert.equal((err as AllAdaptersFailedError).attempts[0]!.adapter, "a");
    assert.equal((err as AllAdaptersFailedError).attempts[1]!.adapter, "b");
  }
});

test("mock-adapter: supports 는 항상 true", () => {
  const m = createMockAdapter();
  assert.equal(m.supports(task()), true);
  assert.equal(m.supports(task({ width: 1, height: 1 })), true);
  assert.equal(m.supports(task({ width: 8192, height: 8192 })), true);
});

test("mock-adapter: generate 결정론 - 동일 task → 동일 sha256", async () => {
  const m = createMockAdapter();
  const a = await m.generate(task({ prompt: "deterministic", seed: 5 }));
  const b = await m.generate(task({ prompt: "deterministic", seed: 5 }));
  assert.equal(a.sha256, b.sha256);
});
