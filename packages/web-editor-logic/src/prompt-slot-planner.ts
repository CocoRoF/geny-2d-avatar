/**
 * `@geny/web-editor-logic/prompt-slot-planner` — β P4-S1.
 *
 * **한 줄 사용자 프롬프트 → 슬롯별 생성 플랜**. P4 (5 슬롯 자동 조립) 의 핵심
 * 비즈니스 로직. 실 nano-banana (β P3, BL-VENDOR-KEY 대기) 없이도 pure function
 * 으로 구현 가능한 쪽을 먼저 고정 — 벤더 합류 시 wiring 한 곳만 바뀌고 본
 * 모듈은 변하지 않는다.
 *
 * **왜 필요한가?** 현재 Mock 은 1 prompt → 1 texture sheet. 그러나 β 제품 §3
 * (5 슬롯 자동 조립) 은 각 카테고리(Face/Hair/Body/Accessory) 를 **독립적으로**
 * 생성해 합쳐야 한다. 실 벤더는 슬롯별 호출을 병렬로 받으므로, 사용자가 준
 * 단일 프롬프트를 슬롯별로 의미 있는 하위 prompt 로 분해하는 규칙이 필요.
 *
 * **핵심 규칙 (본 모듈이 고정)**:
 * 1) 프롬프트에서 **역할별 힌트 키워드** 추출 (색상/스타일/톤). 예: `"blue hair"`
 *    → hair 슬롯의 `hints.colors=["blue"]`.
 * 2) 각 카테고리의 **role 키워드 카탈로그** 를 프롬프트에 전치해 슬롯별
 *    focused prompt 를 조립. 벤더에 "이 영역만 그려라" 시그널.
 * 3) 같은 카테고리의 여러 슬롯은 **같은 focused prompt 를 공유** (하나의 벤더
 *    호출로 여러 슬롯 채울 수 있게 atlas-level grouping). 예: `hair_front` /
 *    `hair_back` / `ahoge` 는 한 generation 에서 함께 생성.
 * 4) Hair 색/눈 색 등 프롬프트에 명시가 없으면 `default_hints` 에서 채움.
 *
 * 이 모듈의 출력 (`SlotGenerationPlan[]`) 을 worker-generate / ai-adapter-core
 * 에 그대로 넘기면 슬롯별 어댑터 호출이 가능. P3 에서 실 nano-banana 를 기존
 * MockAdapter 자리에 wire 하면 끝.
 */

/** β P4 가 다루는 슬롯 카테고리 고정 목록. `category.ts` 의 Category 와 일치. */
export type SlotCategory = "Face" | "Hair" | "Body" | "Accessory";

export const PROMPT_CATEGORY_ORDER: readonly SlotCategory[] = [
  "Face",
  "Hair",
  "Body",
  "Accessory",
] as const;

/**
 * 카테고리 → 벤더에게 보낼 base 프롬프트 조각. 사용자 프롬프트와 결합돼 슬롯별
 * focused prompt 가 된다. 모든 slot 은 "transparent background" 와 "sprite
 * atlas style" 을 공유해 atlas 합성 시 배경색이 묻지 않게.
 */
export const CATEGORY_BASE_PROMPTS: Readonly<Record<SlotCategory, string>> = {
  Face: "anime face, eyes mouth brows, centered, transparent background, cel-shaded",
  Hair: "anime hair, clean silhouette, centered, transparent background, cel-shaded",
  Body: "anime torso and clothing, centered, transparent background, cel-shaded",
  Accessory: "small accessory prop, isolated, centered, transparent background, cel-shaded",
};

/**
 * 슬롯 입력 최소 shape — atlas.slots 의 각 entry 에서 필요한 필드만.
 * role 은 part.role, slot_id 는 atlas.slots[i].slot_id.
 */
export interface SlotInput {
  readonly slot_id: string;
  readonly role: string;
}

/**
 * 사용자 프롬프트에서 추출한 힌트 — color 는 카테고리별 필터로 확장 가능.
 * β 단계는 간단한 키워드 매칭 (hair color / eye color / style tag).
 * 실 nano-banana 합류 시에도 본 shape 는 유지 — 더 깊은 parsing (NLP, LLM)
 * 이 필요하면 본 함수만 교체하면 된다.
 */
export interface PromptHints {
  /** 머리 색 (예: "blue", "silver"). 없으면 `undefined`. */
  readonly hairColor?: string;
  /** 눈 색 (예: "green", "red"). */
  readonly eyeColor?: string;
  /** 의상/옷 색 또는 톤. */
  readonly outfitColor?: string;
  /** 피부 톤 (예: "pale", "tan"). */
  readonly skinTone?: string;
  /** 스타일 태그들 (예: ["cyberpunk", "cute"]). 중복 제거된 정렬된 배열. */
  readonly styleTags: readonly string[];
  /** 원본 프롬프트 그대로. */
  readonly raw: string;
}

/**
 * 프롬프트 파서. 간단한 키워드 분류 — "<color> hair" / "<color> eyes" 패턴 등.
 *
 * - 색상 단어 테이블 — 영어/한글 병행. 프롬프트에 "blue hair" 또는 "파란 머리"
 *   둘 다 잡힘.
 * - 스타일 태그는 카탈로그에 있는 단어만 추출 (cyberpunk/cute/cool/...) —
 *   임의 키워드로 부풀리지 않는다.
 */
const COLOR_WORDS: readonly string[] = [
  "red", "pink", "orange", "yellow", "green", "teal", "cyan", "blue",
  "purple", "violet", "magenta", "black", "white", "silver", "gold",
  "brown", "beige", "gray", "grey", "platinum",
  "빨", "빨간", "분홍", "주황", "노란", "초록", "청록", "파란", "파랑",
  "보라", "검은", "흰", "은색", "금색", "갈색", "회색",
];

const STYLE_TAGS: readonly string[] = [
  "cyberpunk", "cute", "cool", "warrior", "student", "casual",
  "gothic", "magical", "fantasy", "sci-fi", "mecha", "idol",
  "kawaii", "dark", "elegant", "sporty",
  "귀여운", "쿨한", "전사", "학생", "캐주얼", "고딕", "마법", "판타지", "멋진",
];

const SKIN_TONE_WORDS: readonly string[] = [
  "pale", "fair", "tan", "dark", "olive",
  "창백한", "태닝", "어두운", "밝은",
];

/**
 * 프롬프트에서 힌트를 추출. 어떤 입력이 와도 throw 하지 않고 `styleTags: []`
 * 와 `raw` 만 채워 반환.
 */
export function extractPromptHints(prompt: string | null | undefined): PromptHints {
  const safe = typeof prompt === "string" ? prompt : "";
  const lower = safe.toLowerCase();

  const hairColor = matchColorBefore(lower, ["hair", "머리", "헤어"]);
  const eyeColor = matchColorBefore(lower, ["eye", "eyes", "눈"]);
  const outfitColor = matchColorBefore(lower, [
    "outfit",
    "dress",
    "shirt",
    "clothes",
    "clothing",
    "옷",
    "의상",
  ]);
  const skinTone = matchFirstWord(lower, SKIN_TONE_WORDS);

  const tags = new Set<string>();
  for (const tag of STYLE_TAGS) {
    if (lower.includes(tag)) tags.add(normalizeStyleTag(tag));
  }
  const styleTags = Array.from(tags).sort();

  return {
    ...(hairColor ? { hairColor } : {}),
    ...(eyeColor ? { eyeColor } : {}),
    ...(outfitColor ? { outfitColor } : {}),
    ...(skinTone ? { skinTone } : {}),
    styleTags,
    raw: safe,
  };
}

/**
 * 한글 태그를 영어 canonical 로 정규화. 벤더 프롬프트는 보통 영어 프로밍이
 * 유리하므로 단방향 매핑 (ko→en) 만. 영어 태그는 그대로.
 */
function normalizeStyleTag(tag: string): string {
  switch (tag) {
    case "귀여운": return "cute";
    case "쿨한": return "cool";
    case "전사": return "warrior";
    case "학생": return "student";
    case "캐주얼": return "casual";
    case "고딕": return "gothic";
    case "마법": return "magical";
    case "판타지": return "fantasy";
    case "멋진": return "cool";
    default: return tag;
  }
}

function matchFirstWord(lower: string, dict: readonly string[]): string | undefined {
  for (const w of dict) {
    if (lower.includes(w)) return w;
  }
  return undefined;
}

/**
 * `<color> (hair|eye|...)` / `(머리|눈|...) <color>` 패턴을 둘 다 잡는다.
 * 영어는 color 가 명사 앞, 한글은 명사 뒤에 오는 경향 — 양방향으로 탐색.
 */
function matchColorBefore(lower: string, nouns: readonly string[]): string | undefined {
  for (const color of COLOR_WORDS) {
    for (const noun of nouns) {
      if (lower.includes(`${color} ${noun}`)) return color;
      if (lower.includes(`${noun} ${color}`)) return color;
      if (lower.includes(`${noun}은 ${color}`)) return color;
      if (lower.includes(`${noun}이 ${color}`)) return color;
    }
  }
  return undefined;
}

/**
 * 하나의 슬롯 카테고리에 대해 실제로 벤더에 보낼 prompt 를 조립. 없는 힌트는
 * 생략되고, 존재하는 힌트만 쉼표로 연결 — 벤더가 빈 prompt 를 받지 않도록.
 *
 * 주의: 사용자 원본 프롬프트는 **echo 하지 않는다**. 원본을 그대로 포함하면
 * 카테고리 간 힌트 누출 (Body 슬롯이 "blue hair" 를 보고 머리카락을 그림) 이
 * 생긴다. 프롬프트는 `extractPromptHints` 에서 이미 카테고리별로 분해됐으므로
 * 본 함수는 구조화된 힌트만 사용해 **카테고리 focused** vendor call 을 보장.
 */
export function buildSlotPrompt(
  category: SlotCategory,
  hints: PromptHints,
): string {
  const base = CATEGORY_BASE_PROMPTS[category];
  const parts: string[] = [base];
  switch (category) {
    case "Face":
      if (hints.eyeColor) parts.push(`${hints.eyeColor} eyes`);
      if (hints.skinTone) parts.push(`${hints.skinTone} skin`);
      break;
    case "Hair":
      if (hints.hairColor) parts.push(`${hints.hairColor} hair`);
      break;
    case "Body":
      if (hints.outfitColor) parts.push(`${hints.outfitColor} outfit`);
      break;
    case "Accessory":
      // accessory 는 기본 prompt + style 만 — 색은 너무 제한적.
      break;
  }
  for (const tag of hints.styleTags) parts.push(tag);
  return parts.join(", ");
}

/**
 * 카테고리별 슬롯 그룹 + 벤더 prompt. `planSlotGenerations` 의 반환 형태.
 * 실 벤더 어댑터는 이 배열을 iterate 해 카테고리 별 한 번만 호출 (같은 그룹의
 * slot 들은 한 sheet 에서 잘라낼 수 있음).
 */
export interface SlotGenerationPlan {
  readonly category: SlotCategory;
  readonly slots: readonly string[];
  readonly prompt: string;
}

/**
 * 입력 슬롯 배열 + 사용자 프롬프트 → 카테고리별 생성 플랜. 카테고리 순서는
 * `PROMPT_CATEGORY_ORDER` 고정. 해당 카테고리에 슬롯이 하나도 없으면 해당
 * 카테고리는 플랜에서 제외된다 (Other 카테고리도 제외 — 본 모듈은 4 카테고리
 * 만 다룸).
 */
export function planSlotGenerations(
  userPrompt: string,
  slots: readonly SlotInput[],
): SlotGenerationPlan[] {
  const hints = extractPromptHints(userPrompt);
  const bucket: Record<SlotCategory, string[]> = {
    Face: [],
    Hair: [],
    Body: [],
    Accessory: [],
  };
  for (const s of slots) {
    const cat = mapRoleToCategory(s.role);
    if (cat) bucket[cat].push(s.slot_id);
  }
  const plans: SlotGenerationPlan[] = [];
  for (const cat of PROMPT_CATEGORY_ORDER) {
    const list = bucket[cat];
    if (list.length === 0) continue;
    plans.push({
      category: cat,
      slots: [...list].sort(),
      prompt: buildSlotPrompt(cat, hints),
    });
  }
  return plans;
}

/**
 * role prefix → SlotCategory. `category.ts` 의 `categoryOf` 와 동일한 규칙이지만
 * "Other" 를 undefined 로 반환해 플랜에서 제외. `categoryOf` 를 재사용하지 않는
 * 이유: 본 모듈은 role key-space 확장 시 독립적으로 튜닝돼야 하고 (벤더 프롬프트
 * 구조 변경), P4 specifics 만 반영 — 다른 곳 UI 분류와 coupling 되면 안 됨.
 */
export function mapRoleToCategory(role: string): SlotCategory | undefined {
  if (
    role.startsWith("eye_") ||
    role.startsWith("brow_") ||
    role.startsWith("mouth_") ||
    role.startsWith("face_") ||
    role === "nose" ||
    role === "cheek_blush"
  ) return "Face";
  if (role.startsWith("hair_") || role === "ahoge") return "Hair";
  if (
    role.startsWith("arm_") ||
    role.startsWith("cloth_") ||
    role.startsWith("leg_") ||
    role === "torso" ||
    role === "neck" ||
    role === "body" ||
    role === "limb" ||
    role === "clothing"
  ) return "Body";
  if (role.startsWith("accessory_") || role === "accessory" || role.startsWith("acc_")) return "Accessory";
  return undefined;
}
