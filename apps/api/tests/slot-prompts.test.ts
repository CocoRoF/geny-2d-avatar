// P4.1 - slot-prompt 엔진 회귀.

import test from "node:test";
import assert from "node:assert/strict";
import {
  categorizeSlot,
  buildSlotPrompt,
  planSlotGenerations,
  derivedSeed,
} from "../src/lib/slot-prompts.js";

// ---- categorizeSlot ----

test("categorizeSlot: face_base / face_shadow → face_base category", () => {
  assert.equal(categorizeSlot("face_base").category, "face_base");
  assert.equal(categorizeSlot("face_shadow").category, "face_base");
});

test("categorizeSlot: eye_* / brow_* / mouth_* / nose / cheek_* → facial_element", () => {
  const cases = [
    "eye_iris_l",
    "eye_white_r",
    "eye_lash_upper_l",
    "brow_l",
    "mouth_base",
    "mouth_inner",
    "nose",
    "cheek_blush",
  ];
  for (const s of cases) {
    assert.equal(categorizeSlot(s).category, "facial_element", "slot=" + s);
  }
});

test("categorizeSlot: hair_* / ahoge → hair", () => {
  assert.equal(categorizeSlot("hair_front").category, "hair");
  assert.equal(categorizeSlot("hair_side_l").category, "hair");
  assert.equal(categorizeSlot("ahoge").category, "hair");
});

test("categorizeSlot: cloth_* / torso / neck / arm_* / leg_* / foot_* → clothing", () => {
  const cases = ["cloth_main", "torso", "neck", "arm_l_a", "arm_r_b", "leg_l", "foot_r"];
  for (const s of cases) {
    assert.equal(categorizeSlot(s).category, "clothing", "slot=" + s);
  }
});

test("categorizeSlot: accessory_* / acc_* → accessory", () => {
  assert.equal(categorizeSlot("accessory_front").category, "accessory");
  assert.equal(categorizeSlot("accessory_back").category, "accessory");
  assert.equal(categorizeSlot("acc_belt").category, "accessory");
});

test("categorizeSlot: 알수 없는 slot → general", () => {
  assert.equal(categorizeSlot("unknown_part").category, "general");
  assert.equal(categorizeSlot("PartSmoke").category, "general");
  assert.equal(categorizeSlot("core").category, "general");
});

test("categorizeSlot: semantic_tag 포함", () => {
  assert.match(categorizeSlot("hair_front").semantic_tag, /hair/);
  assert.match(categorizeSlot("face_base").semantic_tag, /face/);
  assert.match(categorizeSlot("eye_iris_l").semantic_tag, /facial element/);
});

// ---- buildSlotPrompt ----

test("buildSlotPrompt: global + semantic_tag + seed 기본 구조", () => {
  const p = buildSlotPrompt({
    slot_id: "hair_front",
    global_prompt: "anime girl pastel",
    seed: 42,
  });
  assert.match(p, /anime girl pastel/);
  assert.match(p, /hair strand/);
  assert.match(p, /seed=42/);
});

test("buildSlotPrompt: slot_override 포함", () => {
  const p = buildSlotPrompt({
    slot_id: "hair_front",
    global_prompt: "g",
    seed: 1,
    slot_override: "short wavy blue",
  });
  assert.match(p, /slot override: short wavy blue/);
});

test("buildSlotPrompt: palette_hint.hair 는 hair 카테고리에서만 적용", () => {
  const forHair = buildSlotPrompt({
    slot_id: "hair_front",
    global_prompt: "g",
    seed: 1,
    palette_hint: { hair: "#A0C8FF" },
  });
  assert.match(forHair, /hair color #A0C8FF/);

  const forCloth = buildSlotPrompt({
    slot_id: "cloth_main",
    global_prompt: "g",
    seed: 1,
    palette_hint: { hair: "#A0C8FF" },
  });
  assert.doesNotMatch(forCloth, /hair color/, "cloth 슬롯은 hair palette 무시");
});

test("buildSlotPrompt: palette_hint.primary/accent 는 모든 슬롯 공통", () => {
  const p = buildSlotPrompt({
    slot_id: "eye_iris_l",
    global_prompt: "g",
    seed: 1,
    palette_hint: { primary: "#111", accent: "#FFF" },
  });
  assert.match(p, /primary #111/);
  assert.match(p, /accent #FFF/);
});

test("buildSlotPrompt: skin palette 는 face_base 만", () => {
  const faceBase = buildSlotPrompt({
    slot_id: "face_base",
    global_prompt: "g",
    seed: 1,
    palette_hint: { skin: "light" },
  });
  assert.match(faceBase, /skin light/);
  const hair = buildSlotPrompt({
    slot_id: "hair_front",
    global_prompt: "g",
    seed: 1,
    palette_hint: { skin: "light" },
  });
  assert.doesNotMatch(hair, /skin light/);
});

// ---- planSlotGenerations ----

test("planSlotGenerations: 각 슬롯마다 prompt + seed 생성, 카테고리 포함", () => {
  const plan = planSlotGenerations({
    global_prompt: "vtuber style",
    seed: 100,
    slots: [
      { slot_id: "hair_front" },
      { slot_id: "face_base" },
      { slot_id: "cloth_main" },
    ],
  });
  assert.equal(plan.length, 3);
  const hair = plan.find((p) => p.slot_id === "hair_front");
  assert.ok(hair);
  assert.equal(hair!.category, "hair");
  assert.match(hair!.prompt, /hair strand/);
  const face = plan.find((p) => p.slot_id === "face_base");
  assert.equal(face!.category, "face_base");
});

test("planSlotGenerations: slot_overrides 는 특정 슬롯에만 적용", () => {
  const plan = planSlotGenerations({
    global_prompt: "g",
    seed: 1,
    slots: [{ slot_id: "hair_front" }, { slot_id: "cloth_main" }],
    slot_overrides: { hair_front: "blonde braid" },
  });
  const hair = plan.find((p) => p.slot_id === "hair_front");
  const cloth = plan.find((p) => p.slot_id === "cloth_main");
  assert.match(hair!.prompt, /slot override: blonde braid/);
  assert.doesNotMatch(cloth!.prompt, /slot override/);
});

test("planSlotGenerations: 결정론 - 동일 (global_prompt, seed) → 동일 plan", () => {
  const a = planSlotGenerations({
    global_prompt: "x",
    seed: 7,
    slots: [{ slot_id: "hair_front" }, { slot_id: "face_base" }],
  });
  const b = planSlotGenerations({
    global_prompt: "x",
    seed: 7,
    slots: [{ slot_id: "hair_front" }, { slot_id: "face_base" }],
  });
  assert.deepEqual(a, b);
});

test("derivedSeed: 동일 (globalSeed, slot_id) → 동일", () => {
  assert.equal(derivedSeed(1, "hair_front"), derivedSeed(1, "hair_front"));
});

test("derivedSeed: 다른 slot_id → 다른 seed", () => {
  assert.notEqual(derivedSeed(1, "hair_front"), derivedSeed(1, "face_base"));
});

test("derivedSeed: 다른 globalSeed → 다른 seed", () => {
  assert.notEqual(derivedSeed(1, "hair_front"), derivedSeed(2, "hair_front"));
});

test("derivedSeed: 32-bit unsigned 범위", () => {
  const s = derivedSeed(12345, "accessory_front");
  assert.ok(s >= 0);
  assert.ok(s <= 0xffffffff);
});
