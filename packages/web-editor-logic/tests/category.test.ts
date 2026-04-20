import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  CATEGORY_ORDER,
  GROUPS_FOR_CATEGORY,
  OVERALL_GROUP,
  categorize,
  categoryOf,
  parametersForPart,
  type Category,
  type ParameterLike,
  type PartLike,
} from "../src/index.js";

const HALFBODY_ROLES: readonly string[] = [
  "eye_iris_l", "eye_iris_r", "eye_highlight_l", "eye_highlight_r",
  "eye_white_l", "eye_white_r", "eye_eyelid_l", "eye_eyelid_r",
  "brow_l", "brow_r",
  "mouth_upper", "mouth_lower",
  "face_shape", "face_shadow",
  "nose", "cheek_blush",
  "hair_front", "hair_back", "hair_side_l", "hair_side_r",
  "arm_l", "arm_r", "cloth_upper", "torso", "neck", "body", "cloth_inner",
  "accessory_back", "accessory_front",
];

const FULLBODY_ROLES: readonly string[] = [
  ...HALFBODY_ROLES,
  "ahoge",
  "limb", "limb",
  "clothing", "clothing",
  "accessory",
];

describe("categoryOf — halfbody v1.2.0/v1.3.0 roles", () => {
  const expected: Record<string, Category> = {
    eye_iris_l: "Face",
    eye_highlight_r: "Face",
    brow_l: "Face",
    mouth_upper: "Face",
    face_shadow: "Face",
    nose: "Face",
    cheek_blush: "Face",

    hair_front: "Hair",
    hair_back: "Hair",
    ahoge: "Hair",

    arm_l: "Body",
    arm_r: "Body",
    cloth_upper: "Body",
    cloth_inner: "Body",
    torso: "Body",
    neck: "Body",
    body: "Body",

    accessory_back: "Accessory",
    accessory_front: "Accessory",
  };

  for (const [role, want] of Object.entries(expected)) {
    test(`${role} → ${want}`, () => {
      assert.equal(categoryOf(role), want);
    });
  }
});

describe("categoryOf — fullbody generic roles (세션 87)", () => {
  test("limb → Body", () => assert.equal(categoryOf("limb"), "Body"));
  test("clothing → Body", () => assert.equal(categoryOf("clothing"), "Body"));
  test("accessory → Accessory", () => assert.equal(categoryOf("accessory"), "Accessory"));
});

describe("categoryOf — Other fallback", () => {
  test("unknown role falls through to Other", () => {
    assert.equal(categoryOf("mystery_part"), "Other");
  });
  test("empty string → Other", () => {
    assert.equal(categoryOf(""), "Other");
  });
});

describe("categoryOf — prefix boundaries", () => {
  test("eye (no underscore) → Other (prefix requires _)", () => {
    assert.equal(categoryOf("eye"), "Other");
  });
  test("hair (no underscore) → Other", () => {
    assert.equal(categoryOf("hair"), "Other");
  });
  test("mouth (no underscore) → Other", () => {
    assert.equal(categoryOf("mouth"), "Other");
  });
  test("cloth (no underscore) → Other", () => {
    assert.equal(categoryOf("cloth"), "Other");
  });
  test("arm (no underscore) → Other", () => {
    assert.equal(categoryOf("arm"), "Other");
  });
  test("accessory exact → Accessory (not prefix)", () => {
    assert.equal(categoryOf("accessory"), "Accessory");
  });
});

describe("categorize — group + sort", () => {
  const parts: readonly PartLike[] = [
    { role: "eye_iris_l", slot_id: "eye_iris_l" },
    { role: "hair_front", slot_id: "hair_front" },
    { role: "hair_back", slot_id: "hair_back" },
    { role: "arm_r", slot_id: "arm_r" },
    { role: "arm_l", slot_id: "arm_l" },
    { role: "accessory_back", slot_id: "accessory_back" },
  ];

  test("entries are grouped by category", () => {
    const groups = categorize(parts);
    assert.equal(groups.get("Face")?.length, 1);
    assert.equal(groups.get("Hair")?.length, 2);
    assert.equal(groups.get("Body")?.length, 2);
    assert.equal(groups.get("Accessory")?.length, 1);
    assert.equal(groups.has("Other"), false);
  });

  test("within a category parts are sorted by slot_id", () => {
    const groups = categorize(parts);
    assert.deepEqual(
      groups.get("Hair")?.map((p) => p.slot_id),
      ["hair_back", "hair_front"],
    );
    assert.deepEqual(
      groups.get("Body")?.map((p) => p.slot_id),
      ["arm_l", "arm_r"],
    );
  });

  test("empty input → empty map", () => {
    const groups = categorize([]);
    assert.equal(groups.size, 0);
  });

  test("Other category is retained when role falls through", () => {
    const groups = categorize([{ role: "stranger", slot_id: "stranger" }]);
    assert.equal(groups.get("Other")?.length, 1);
  });
});

describe("CATEGORY_ORDER — UX 안정성", () => {
  test("카테고리 순서는 Face→Hair→Body→Accessory 고정", () => {
    assert.deepEqual([...CATEGORY_ORDER], ["Face", "Hair", "Body", "Accessory"]);
  });
  test("Other 는 UX 순서에 포함되지 않음 (불변식)", () => {
    assert.ok(!(CATEGORY_ORDER as readonly string[]).includes("Other"));
  });
});

describe("세션 87 — 실 rig-templates 샘플 총 카디널리티 회귀", () => {
  test("halfbody 29 parts → Face=16/Hair=4/Body=7/Accessory=2", () => {
    const roles = [
      "eye_iris_l", "eye_iris_r",
      "eye_highlight_l", "eye_highlight_r",
      "eye_white_l", "eye_white_r",
      "eye_eyelid_l", "eye_eyelid_r",
      "brow_l", "brow_r",
      "mouth_upper", "mouth_lower",
      "face_shape", "face_shadow",
      "nose", "cheek_blush",
      "hair_front", "hair_back", "hair_side_l", "hair_side_r",
      "arm_l", "arm_r", "cloth_upper", "cloth_inner", "torso", "neck", "body",
      "accessory_back", "accessory_front",
    ];
    const parts: PartLike[] = roles.map((r, i) => ({ role: r, slot_id: `s_${i}` }));
    const g = categorize(parts);
    assert.equal(g.get("Face")?.length, 16);
    assert.equal(g.get("Hair")?.length, 4);
    assert.equal(g.get("Body")?.length, 7);
    assert.equal(g.get("Accessory")?.length, 2);
    assert.equal(g.has("Other"), false);
  });
});

describe("parametersForPart (세션 95)", () => {
  const PARAMS: readonly ParameterLike[] = [
    { id: "head_angle_x", group: "face" },
    { id: "head_angle_y", group: "face" },
    { id: "body_angle_x", group: "body" },
    { id: "body_angle_y", group: "body" },
    { id: "body_breath", group: "body" },
    { id: "eye_open_l", group: "eyes" },
    { id: "eye_open_r", group: "eyes" },
    { id: "brow_l_y", group: "brows" },
    { id: "brow_r_y", group: "brows" },
    { id: "mouth_vowel_a", group: "mouth" },
    { id: "mouth_up", group: "mouth" },
    { id: "hair_front_sway", group: "hair" },
    { id: "hair_front_fuwa", group: "hair" },
    { id: "hair_back_sway", group: "hair" },
    { id: "hair_side_sway_l", group: "hair" },
    { id: "ahoge_sway", group: "hair" },
    { id: "overall_x", group: "overall" },
    { id: "overall_y", group: "overall" },
    { id: "overall_rotate", group: "overall" },
    { id: "accessory_back_sway", group: "body" },
    { id: "accessory_front_sway", group: "body" },
    { id: "arm_l_angle", group: "body" },
    { id: "arm_r_angle", group: "body" },
    { id: "cloth_main_fuwa", group: "body" },
  ];

  test("null selection returns pass-through copy (new array reference)", () => {
    const out = parametersForPart(null, PARAMS);
    assert.equal(out.length, PARAMS.length);
    assert.deepEqual(out, PARAMS);
    assert.notStrictEqual(out, PARAMS);
  });

  test("substring match — hair_front narrows to hair_front_* + overall", () => {
    const out = parametersForPart({ role: "hair_front", slot_id: "hair_front" }, PARAMS);
    const ids = out.map((p) => p.id).sort();
    assert.deepEqual(ids, [
      "hair_front_fuwa",
      "hair_front_sway",
      "overall_rotate",
      "overall_x",
      "overall_y",
    ]);
  });

  test("substring match — accessory_back narrows to accessory_back_sway + overall", () => {
    const out = parametersForPart({ role: "accessory_back", slot_id: "accessory_back" }, PARAMS);
    const ids = out.map((p) => p.id).sort();
    assert.deepEqual(ids, [
      "accessory_back_sway",
      "overall_rotate",
      "overall_x",
      "overall_y",
    ]);
  });

  test("substring match — arm_l narrows to arm_l_angle + overall", () => {
    const out = parametersForPart({ role: "arm_l", slot_id: "arm_l_a" }, PARAMS);
    const ids = out.map((p) => p.id).sort();
    assert.deepEqual(ids, ["arm_l_angle", "overall_rotate", "overall_x", "overall_y"]);
  });

  test("category-group fallback — eye_iris_l (Face, no substring hit) → face/eyes/brows/mouth + overall", () => {
    const out = parametersForPart({ role: "eye_iris_l", slot_id: "eye_iris_l" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ["brows", "eyes", "face", "mouth", "overall"].sort());
    for (const p of out) assert.ok(!p.id.includes("body") || p.group === "overall");
  });

  test("category-group fallback — torso (Body) → body + overall only", () => {
    const out = parametersForPart({ role: "torso", slot_id: "torso" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ["body", "overall"]);
  });

  test("category-group fallback — face_base (Face) → face/eyes/brows/mouth + overall", () => {
    const out = parametersForPart({ role: "face_base", slot_id: "face_base" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ["brows", "eyes", "face", "mouth", "overall"].sort());
  });

  test("category-group fallback — fullbody generic role `clothing` (Body) → body + overall", () => {
    const out = parametersForPart({ role: "clothing", slot_id: "cloth_skirt" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ["body", "overall"]);
  });

  test("category-group fallback — fullbody generic role `limb` (Body) → body + overall", () => {
    const out = parametersForPart({ role: "limb", slot_id: "leg_l" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups].sort(), ["body", "overall"]);
  });

  test("overall group always included even via substring path (hair_front has no overall_ prefix)", () => {
    const out = parametersForPart({ role: "hair_front", slot_id: "hair_front" }, PARAMS);
    const overallIds = out.filter((p) => p.group === "overall").map((p) => p.id);
    assert.deepEqual(overallIds.sort(), ["overall_rotate", "overall_x", "overall_y"]);
  });

  test("overall included once even if substring match overlaps overall (no dedupe regression)", () => {
    const params: ParameterLike[] = [
      { id: "overall_x", group: "overall" },
      { id: "overall_test", group: "overall" },
    ];
    const out = parametersForPart({ role: "overall", slot_id: "overall_test" }, params);
    const ids = out.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "no duplicate ids");
  });

  test("Other category falls back to overall-only whitelist", () => {
    const out = parametersForPart({ role: "unknown_role", slot_id: "u0" }, PARAMS);
    const groups = new Set(out.map((p) => p.group));
    assert.deepEqual([...groups], ["overall"]);
  });

  test("GROUPS_FOR_CATEGORY is a stable mapping (enum coverage)", () => {
    const keys = Object.keys(GROUPS_FOR_CATEGORY).sort();
    assert.deepEqual(keys, ["Accessory", "Body", "Face", "Hair", "Other"].sort());
    assert.equal(OVERALL_GROUP, "overall");
    assert.deepEqual([...GROUPS_FOR_CATEGORY.Face], ["face", "eyes", "brows", "mouth"]);
    assert.deepEqual([...GROUPS_FOR_CATEGORY.Hair], ["hair"]);
    assert.deepEqual([...GROUPS_FOR_CATEGORY.Body], ["body"]);
    assert.deepEqual([...GROUPS_FOR_CATEGORY.Accessory], ["body"]);
    assert.deepEqual([...GROUPS_FOR_CATEGORY.Other], []);
  });
});
