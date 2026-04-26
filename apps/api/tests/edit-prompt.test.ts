// edit-prompt 빌더 회귀 — 모든 vendor 가 사용하는 atlas-aware prompt 형식.

import test from "node:test";
import assert from "node:assert/strict";
import { buildEditPrompt, buildGenerateAtlasPrompt } from "../src/lib/edit-prompt.js";

test("buildEditPrompt: atlas=true → atlas-edit 패턴 + 사용자 prompt 포함", () => {
  const p = buildEditPrompt({ userPrompt: "red hair", seed: 42, isAtlas: true });
  assert.match(p, /Live2D character texture atlas/);
  assert.match(p, /red hair/);
  assert.match(p, /Do NOT change the input aspect ratio/);
  assert.match(p, /transparent.*background/i);
  assert.match(p, /Seed: 42/);
});

test("buildEditPrompt: atlas=true → portrait 생성 명시 거부", () => {
  const p = buildEditPrompt({ userPrompt: "blue", seed: 0, isAtlas: true });
  assert.match(p, /[Dd]o not generate a portrait/);
});

test("buildEditPrompt: atlas=false → 일반 reference 패턴", () => {
  const p = buildEditPrompt({ userPrompt: "make it brighter", seed: 1, isAtlas: false });
  assert.match(p, /Using the provided image as a reference/);
  assert.match(p, /make it brighter/);
  assert.match(p, /Seed: 1/);
});

test("buildEditPrompt: 공백 trim", () => {
  const p = buildEditPrompt({ userPrompt: "  red hair  ", seed: 0, isAtlas: true });
  assert.match(p, /produce an edited atlas where red hair\./);
});

test("buildGenerateAtlasPrompt: text-to-image 시 atlas 형식 명시", () => {
  const p = buildGenerateAtlasPrompt("anime girl", 7);
  assert.match(p, /anime girl/);
  assert.match(p, /texture atlas for a Live2D character avatar/);
  assert.match(p, /transparent background/);
  assert.match(p, /Seed: 7/);
});
