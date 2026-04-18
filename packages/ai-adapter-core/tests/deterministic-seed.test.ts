import { strict as assert } from "node:assert";
import { test } from "node:test";

import { deterministicSeed, promptSha256 } from "../src/deterministic-seed.js";

test("deterministicSeed: same idempotency_key → same seed", () => {
  const a = deterministicSeed("task-hair-front-001");
  const b = deterministicSeed("task-hair-front-001");
  assert.equal(a, b);
});

test("deterministicSeed: different keys → different seeds (overwhelmingly)", () => {
  const a = deterministicSeed("key-a");
  const b = deterministicSeed("key-b");
  assert.notEqual(a, b);
});

test("deterministicSeed: returns Uint32 range", () => {
  const s = deterministicSeed("hello-world");
  assert.ok(Number.isInteger(s));
  assert.ok(s >= 0 && s <= 0xffffffff);
});

test("promptSha256: deterministic 64-hex", () => {
  const p1 = promptSha256("hair_front, clean thin line, pastel pink");
  const p2 = promptSha256("hair_front, clean thin line, pastel pink");
  assert.equal(p1, p2);
  assert.match(p1, /^[0-9a-f]{64}$/);
});

test("promptSha256: unicode preserved (utf8)", () => {
  // 한글 한 글자가 섞여도 동일하게 64-hex.
  const p = promptSha256("앞머리 스타일");
  assert.match(p, /^[0-9a-f]{64}$/);
});
