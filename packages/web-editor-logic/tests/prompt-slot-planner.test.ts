import { strict as assert } from "node:assert";
import { describe, test } from "node:test";

import {
  CATEGORY_BASE_PROMPTS,
  PROMPT_CATEGORY_ORDER,
  buildSlotPrompt,
  extractPromptHints,
  mapRoleToCategory,
  planSlotGenerations,
} from "../src/prompt-slot-planner.js";

/**
 * β P4-S1 — 사용자 프롬프트 → 슬롯별 생성 플랜 규칙 회귀 고정.
 *
 * P3 실 nano-banana 합류 시 벤더 wiring 만 바뀌고 본 모듈 규칙은 불변이어야
 * 한다. 프롬프트 파싱/힌트 추출/카테고리 프롬프트 조립/슬롯 그룹화 모두 여기.
 */

describe("extractPromptHints — 프롬프트 키워드 추출", () => {
  test("빈/잘못된 입력 → raw=\"\", tags=[], 다른 hint undefined", () => {
    const h = extractPromptHints("");
    assert.equal(h.raw, "");
    assert.deepEqual(h.styleTags, []);
    assert.equal(h.hairColor, undefined);
    assert.equal(h.eyeColor, undefined);
  });

  test("non-string 입력도 throw 하지 않고 기본값", () => {
    const h = extractPromptHints(null);
    assert.equal(h.raw, "");
    assert.deepEqual(h.styleTags, []);
  });

  test("'blue hair' → hairColor='blue'", () => {
    assert.equal(extractPromptHints("a girl with blue hair").hairColor, "blue");
  });

  test("'green eyes' → eyeColor='green'", () => {
    assert.equal(extractPromptHints("bright green eyes").eyeColor, "green");
  });

  test("한글 '파란 머리' → hairColor='파란'", () => {
    assert.equal(extractPromptHints("파란 머리 소녀").hairColor, "파란");
  });

  test("한글 '눈은 초록' 역순 패턴도 잡힘", () => {
    assert.equal(extractPromptHints("그녀의 눈은 초록색이다").eyeColor, "초록");
  });

  test("의상 색: 'red outfit' → outfitColor='red'", () => {
    assert.equal(extractPromptHints("wearing a red outfit").outfitColor, "red");
  });

  test("스타일 태그 'cyberpunk' 포함 → styleTags 에 반영", () => {
    const h = extractPromptHints("cyberpunk warrior");
    assert.ok(h.styleTags.includes("cyberpunk"));
    assert.ok(h.styleTags.includes("warrior"));
  });

  test("styleTags 는 정렬 + 중복 제거", () => {
    const h = extractPromptHints("cute cute cute cyberpunk cute");
    // cute 가 한 번만
    const cuteCount = h.styleTags.filter((t) => t === "cute").length;
    assert.equal(cuteCount, 1);
    // 정렬
    assert.deepEqual(h.styleTags, [...h.styleTags].sort());
  });

  test("한글 스타일 태그 → canonical 영어로 정규화", () => {
    const h = extractPromptHints("귀여운 소녀");
    assert.ok(h.styleTags.includes("cute"));
    assert.ok(!h.styleTags.includes("귀여운"), "원본 한글 태그는 styleTags 에 남지 않음");
  });

  test("한글 '멋진' 과 영어 'cool' 모두 'cool' 로 수렴 (중복 제거)", () => {
    const h = extractPromptHints("cool 멋진 student");
    const coolCount = h.styleTags.filter((t) => t === "cool").length;
    assert.equal(coolCount, 1);
  });

  test("skin tone: 'pale skin' → skinTone='pale'", () => {
    const h = extractPromptHints("pale skin and blue hair");
    assert.equal(h.skinTone, "pale");
    assert.equal(h.hairColor, "blue");
  });

  test("raw 는 원본 그대로", () => {
    const raw = "a Cyberpunk GIRL with Blue Hair";
    assert.equal(extractPromptHints(raw).raw, raw);
  });

  test("여러 색이 섞여 있으면 COLOR_WORDS 순서대로 첫 매치 — 안정성", () => {
    // red 가 COLOR_WORDS 에서 앞이므로 hair 에 대해 먼저 red 매치 시도됨
    const h = extractPromptHints("red hair, blue outfit, green eyes");
    assert.equal(h.hairColor, "red");
    assert.equal(h.outfitColor, "blue");
    assert.equal(h.eyeColor, "green");
  });
});

describe("buildSlotPrompt — 카테고리별 벤더 프롬프트 조립", () => {
  test("Hair + hairColor → base + 'blue hair'", () => {
    const hints = extractPromptHints("blue hair cyberpunk");
    const p = buildSlotPrompt("Hair", hints);
    assert.ok(p.includes(CATEGORY_BASE_PROMPTS.Hair));
    assert.ok(p.includes("blue hair"));
    assert.ok(p.includes("cyberpunk"));
  });

  test("Face + eyeColor + skinTone 반영", () => {
    const hints = extractPromptHints("green eyes pale skin");
    const p = buildSlotPrompt("Face", hints);
    assert.ok(p.includes("green eyes"));
    assert.ok(p.includes("pale skin"));
  });

  test("Body + outfitColor 만 반영 (hair/eye 는 제외 — 원본 프롬프트 echo 금지)", () => {
    const hints = extractPromptHints("blue hair red outfit green eyes");
    const p = buildSlotPrompt("Body", hints);
    assert.ok(p.includes("red outfit"));
    assert.ok(!p.includes("blue hair"), "Body 슬롯에 hair 색 누출 금지");
    assert.ok(!p.includes("green eyes"), "Body 슬롯에 eye 색 누출 금지");
  });

  test("Accessory 는 기본 prompt + 스타일 태그만 — 색 힌트 주입 없음", () => {
    const hints = extractPromptHints("cute cyberpunk blue hair");
    const p = buildSlotPrompt("Accessory", hints);
    assert.ok(p.includes(CATEGORY_BASE_PROMPTS.Accessory));
    assert.ok(p.includes("cute"));
    assert.ok(p.includes("cyberpunk"));
    // accessory 는 색 힌트를 주입하지 않음 (원본 프롬프트 echo 도 없음)
    assert.ok(!p.includes("blue hair"));
  });

  test("빈 userPrompt → base + (선택) styleTags 만. throw 없이 통과", () => {
    const hints = extractPromptHints("");
    const p = buildSlotPrompt("Face", hints);
    assert.ok(p.startsWith(CATEGORY_BASE_PROMPTS.Face));
  });

  test("없는 힌트는 prompt 에 생략 — '<color> hair' 패턴 미출현", () => {
    const hints = extractPromptHints("");
    const p = buildSlotPrompt("Hair", hints);
    // base 자체는 "anime hair" 를 포함하지만, 추가 '<color> hair' 부가 프롬프트는 없어야
    assert.equal(p, CATEGORY_BASE_PROMPTS.Hair);
  });

  test("모든 카테고리에 'transparent background' 공통으로 포함 (atlas 합성 안전)", () => {
    const hints = extractPromptHints("test");
    for (const cat of PROMPT_CATEGORY_ORDER) {
      const p = buildSlotPrompt(cat, hints);
      assert.ok(p.includes("transparent background"), `${cat} 에 transparent background 누락`);
    }
  });

  test("원본 사용자 프롬프트 문자열이 그대로 echo 되지 않음 — 카테고리 격리 보장", () => {
    const raw = "mysterious phrase xyzzy magic-word";
    const hints = extractPromptHints(raw);
    for (const cat of PROMPT_CATEGORY_ORDER) {
      const p = buildSlotPrompt(cat, hints);
      assert.ok(!p.includes("xyzzy"), `${cat} 에 사용자 원본 토큰 누출`);
      assert.ok(!p.includes("magic-word"), `${cat} 에 사용자 원본 토큰 누출`);
    }
  });
});

describe("mapRoleToCategory — role → SlotCategory", () => {
  test("Face prefixes", () => {
    assert.equal(mapRoleToCategory("eye_l"), "Face");
    assert.equal(mapRoleToCategory("brow_r"), "Face");
    assert.equal(mapRoleToCategory("mouth_main"), "Face");
    assert.equal(mapRoleToCategory("face_base"), "Face");
    assert.equal(mapRoleToCategory("nose"), "Face");
    assert.equal(mapRoleToCategory("cheek_blush"), "Face");
  });

  test("Hair prefixes", () => {
    assert.equal(mapRoleToCategory("hair_front"), "Hair");
    assert.equal(mapRoleToCategory("hair_back"), "Hair");
    assert.equal(mapRoleToCategory("ahoge"), "Hair");
  });

  test("Body prefixes", () => {
    assert.equal(mapRoleToCategory("arm_l"), "Body");
    assert.equal(mapRoleToCategory("cloth_top"), "Body");
    assert.equal(mapRoleToCategory("leg_l"), "Body");
    assert.equal(mapRoleToCategory("torso"), "Body");
  });

  test("Accessory prefixes (accessory_ + acc_)", () => {
    assert.equal(mapRoleToCategory("accessory_back"), "Accessory");
    assert.equal(mapRoleToCategory("acc_belt"), "Accessory");
    assert.equal(mapRoleToCategory("accessory"), "Accessory");
  });

  test("알 수 없는 role → undefined (플랜에서 제외)", () => {
    assert.equal(mapRoleToCategory("unknown_role"), undefined);
    assert.equal(mapRoleToCategory(""), undefined);
  });
});

describe("planSlotGenerations — end-to-end 슬롯 분배", () => {
  const halfbodySlots = [
    { slot_id: "eye_l", role: "eye_l" },
    { slot_id: "eye_r", role: "eye_r" },
    { slot_id: "mouth_main", role: "mouth_main" },
    { slot_id: "hair_front", role: "hair_front" },
    { slot_id: "hair_back", role: "hair_back" },
    { slot_id: "ahoge", role: "ahoge" },
    { slot_id: "torso", role: "torso" },
    { slot_id: "cloth_top", role: "cloth_top" },
    { slot_id: "accessory_back", role: "accessory_back" },
  ];

  test("4 카테고리 모두 플랜 생성 + 카테고리 순서 고정", () => {
    const plans = planSlotGenerations("blue hair green eyes red outfit cyberpunk", halfbodySlots);
    assert.equal(plans.length, 4);
    assert.deepEqual(
      plans.map((p) => p.category),
      ["Face", "Hair", "Body", "Accessory"],
    );
  });

  test("각 플랜의 slots 는 정렬 + 같은 카테고리 여러 슬롯 묶음", () => {
    const plans = planSlotGenerations("test", halfbodySlots);
    const hair = plans.find((p) => p.category === "Hair");
    assert.ok(hair);
    assert.deepEqual(hair.slots, ["ahoge", "hair_back", "hair_front"]);
  });

  test("Face 플랜 prompt 에 eye/skin 힌트 반영", () => {
    const plans = planSlotGenerations("green eyes pale skin", halfbodySlots);
    const face = plans.find((p) => p.category === "Face");
    assert.ok(face);
    assert.ok(face.prompt.includes("green eyes"));
    assert.ok(face.prompt.includes("pale skin"));
  });

  test("Hair 플랜 prompt 에 hair color 반영", () => {
    const plans = planSlotGenerations("silver hair", halfbodySlots);
    const hair = plans.find((p) => p.category === "Hair");
    assert.ok(hair?.prompt.includes("silver hair"));
  });

  test("해당 카테고리 슬롯이 없으면 플랜에서 제외", () => {
    const onlyHair = [{ slot_id: "hair_back", role: "hair_back" }];
    const plans = planSlotGenerations("test", onlyHair);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.category, "Hair");
  });

  test("Other 카테고리 (알 수 없는 role) 는 플랜에 포함되지 않음", () => {
    const weird = [
      { slot_id: "weird", role: "xyz_unknown" },
      { slot_id: "hair_back", role: "hair_back" },
    ];
    const plans = planSlotGenerations("test", weird);
    assert.equal(plans.length, 1);
    assert.equal(plans[0]?.category, "Hair");
  });

  test("슬롯 목록 빈 배열 → 빈 플랜", () => {
    assert.deepEqual(planSlotGenerations("blue hair", []), []);
  });

  test("각 플랜은 고유한 prompt (카테고리별 base 가 다름)", () => {
    const plans = planSlotGenerations("blue hair green eyes red outfit", halfbodySlots);
    const prompts = new Set(plans.map((p) => p.prompt));
    assert.equal(prompts.size, plans.length, "카테고리별 prompt 는 모두 달라야 함");
  });

  test("플랜 수는 β 핵심 제품 정의 — 한 번의 Generate 가 최대 4 벤더 호출 (카테고리당 1)", () => {
    // P4 핵심: 1 prompt → N 벤더 call where N = 카테고리별 슬롯 유무 ≤ 4
    const plans = planSlotGenerations("blue hair green eyes red outfit cute", halfbodySlots);
    assert.ok(plans.length <= 4, "카테고리는 4 개가 최대");
  });
});

describe("실제 halfbody/fullbody 샘플 — 비즈니스 시나리오", () => {
  test("halfbody 30 슬롯 샘플 — 4 카테고리 분배", () => {
    const halfbody = [
      "eye_l", "eye_r", "brow_l", "brow_r", "mouth_main", "nose",
      "cheek_blush", "face_base", "face_shadow",
      "hair_front", "hair_back", "hair_side_l", "hair_side_r", "ahoge",
      "torso", "neck", "cloth_top", "cloth_collar",
      "arm_l", "arm_r",
      "accessory_back", "accessory_front", "acc_belt",
    ].map((r) => ({ slot_id: r, role: r }));
    const plans = planSlotGenerations("cyberpunk girl with silver hair and red eyes", halfbody);
    assert.equal(plans.length, 4);
    const face = plans.find((p) => p.category === "Face");
    const hair = plans.find((p) => p.category === "Hair");
    assert.ok(face?.prompt.includes("red eyes"));
    assert.ok(hair?.prompt.includes("silver hair"));
    assert.ok(face?.prompt.includes("cyberpunk"));
    assert.ok(hair?.prompt.includes("cyberpunk"));
  });

  test("한글 프롬프트 — '파란 머리 귀여운 소녀' → Hair='blue', style=cute 포함", () => {
    const slots = [
      { slot_id: "hair_front", role: "hair_front" },
      { slot_id: "eye_l", role: "eye_l" },
    ];
    const plans = planSlotGenerations("파란 머리 귀여운 소녀", slots);
    const hair = plans.find((p) => p.category === "Hair");
    const face = plans.find((p) => p.category === "Face");
    assert.ok(hair);
    assert.ok(face);
    assert.ok(hair.prompt.includes("파란 hair"));
    assert.ok(hair.prompt.includes("cute"));
    assert.ok(face.prompt.includes("cute"));
  });
});
