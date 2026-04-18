import { test } from "node:test";
import assert from "node:assert/strict";

import { createGenyAvatarElementClass, registerGenyAvatar } from "../src/element.js";

test("createGenyAvatarElementClass: returns class subclassing HTMLElement (when available)", () => {
  if (typeof HTMLElement === "undefined") {
    // Node 환경 — HTMLElement 가 없으면 클래스 생성이 불가.
    // DOM 없이 import 만 안전한지 검증 (아래 registerGenyAvatar no-op 테스트로 충분).
    assert.ok(true);
    return;
  }
  const Cls = createGenyAvatarElementClass();
  assert.ok(Cls.prototype instanceof HTMLElement);
  assert.ok((Cls as unknown as { observedAttributes: string[] }).observedAttributes.includes("src"));
});

test("registerGenyAvatar: no-op when customElements is undefined", () => {
  const originalCE = (globalThis as { customElements?: unknown }).customElements;
  try {
    (globalThis as { customElements?: unknown }).customElements = undefined;
    // Should not throw
    registerGenyAvatar();
    assert.ok(true);
  } finally {
    (globalThis as { customElements?: unknown }).customElements = originalCE;
  }
});
