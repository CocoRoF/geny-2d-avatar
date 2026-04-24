/**
 * 슬롯별 프롬프트 엔진 - Phase 4 (docs/04-ROADMAP.md §Phase 4 / docs/02 §4.B).
 *
 * 전역 prompt + slot semantic tag + slot_override + palette_hint 를 조합해
 * 각 슬롯당 독립 생성 프롬프트를 빌드. 슬롯별 generate endpoint (P4.2) 에서 소비.
 *
 * 슬롯 카테고리 규칙:
 *   - face_*                       → "face feature"
 *   - face_base / face_shadow      → "face" (base layer)
 *   - eye_* / brow_* / mouth_* / nose / cheek_*  → "facial element"
 *   - hair_* / ahoge               → "hairstyle strand"
 *   - cloth_* / torso / neck / arm_* → "clothing"
 *   - accessory_*                  → "accessory"
 *   - 그 외                        → "general"
 *
 * 본 분류는 halfbody v1.3.0 / fullbody v1.0.0 슬롯 명명 규약에 맞춤. 새 프리셋 슬롯이
 * 매칭 안 되면 general 로 폴백. 3rd-party wrapper (mao_pro) 는 slot_id 가 cdi3 Part
 * 기반이라 대부분 general 로 떨어짐 — 향후 per-drawable 추출 (Phase 3+) 때 보강.
 */

export type SlotCategory =
  | "face_base"
  | "facial_element"
  | "hair"
  | "clothing"
  | "accessory"
  | "general";

export interface SlotContext {
  readonly slot_id: string;
  readonly category: SlotCategory;
  /** 프롬프트에 삽입될 semantic 태그 (영문). */
  readonly semantic_tag: string;
}

export function categorizeSlot(slotId: string): SlotContext {
  const id = slotId.toLowerCase();
  if (id === "face_base" || id === "face_shadow") {
    return { slot_id: slotId, category: "face_base", semantic_tag: "face base skin layer" };
  }
  if (
    id.startsWith("eye_") ||
    id.startsWith("brow_") ||
    id.startsWith("mouth_") ||
    id === "nose" ||
    id.startsWith("cheek_")
  ) {
    return {
      slot_id: slotId,
      category: "facial_element",
      semantic_tag: "facial element (" + id.replace(/_/g, " ") + ")",
    };
  }
  if (id.startsWith("hair_") || id === "ahoge") {
    return { slot_id: slotId, category: "hair", semantic_tag: "hair strand" };
  }
  if (
    id.startsWith("cloth_") ||
    id === "torso" ||
    id === "neck" ||
    id.startsWith("arm_") ||
    id.startsWith("leg_") ||
    id.startsWith("foot_")
  ) {
    return { slot_id: slotId, category: "clothing", semantic_tag: "clothing piece" };
  }
  if (id.startsWith("accessory_") || id.startsWith("acc_")) {
    return { slot_id: slotId, category: "accessory", semantic_tag: "accessory" };
  }
  return { slot_id: slotId, category: "general", semantic_tag: "avatar part" };
}

export interface PaletteHint {
  readonly primary?: string;
  readonly accent?: string;
  readonly hair?: string;
  readonly skin?: string;
  readonly cloth?: string;
}

export interface BuildSlotPromptInput {
  readonly slot_id: string;
  readonly global_prompt: string;
  readonly slot_override?: string;
  readonly palette_hint?: PaletteHint;
  readonly seed: number;
}

/**
 * 슬롯별 최종 프롬프트 조립.
 * 구조: "<global>, <semantic_tag>, <palette if matched>, <override if given>, seed=<n>"
 * palette_hint 중 해당 카테고리에 맞는 필드만 주입 (hair → palette.hair, cloth → palette.cloth, etc.).
 */
export function buildSlotPrompt(input: BuildSlotPromptInput): string {
  const ctx = categorizeSlot(input.slot_id);
  const parts: string[] = [];
  parts.push(input.global_prompt.trim());
  parts.push(ctx.semantic_tag);

  // Palette hint 중 관련 필드 주입.
  const pal = input.palette_hint;
  if (pal) {
    const paletteParts: string[] = [];
    if (pal.primary) paletteParts.push("primary " + pal.primary);
    if (pal.accent) paletteParts.push("accent " + pal.accent);
    if (ctx.category === "hair" && pal.hair) paletteParts.push("hair color " + pal.hair);
    if (ctx.category === "face_base" && pal.skin) paletteParts.push("skin " + pal.skin);
    if (ctx.category === "clothing" && pal.cloth) paletteParts.push("cloth color " + pal.cloth);
    if (paletteParts.length > 0) parts.push(paletteParts.join(", "));
  }

  if (input.slot_override && input.slot_override.trim().length > 0) {
    parts.push("(slot override: " + input.slot_override.trim() + ")");
  }

  parts.push("seed=" + input.seed);
  return parts.join(", ");
}

export interface PlanSlotGenerationsInput {
  readonly global_prompt: string;
  readonly seed: number;
  readonly slots: ReadonlyArray<{ readonly slot_id: string }>;
  readonly palette_hint?: PaletteHint;
  /** slot_id → slot-specific override prompt. */
  readonly slot_overrides?: Record<string, string>;
}

export interface SlotGenerationPlan {
  readonly slot_id: string;
  readonly category: SlotCategory;
  readonly prompt: string;
  /** slot-specific seed (전역 seed + slot_id 해시). 같은 global 입력 → 같은 slot seed. */
  readonly seed: number;
}

/**
 * 전체 슬롯 plan 생성. 각 슬롯에 자기만의 prompt + deterministic seed 부여.
 * slot seed 는 (globalSeed * 31 + hash(slot_id)) 로 파생해 결정론 보장.
 */
export function planSlotGenerations(input: PlanSlotGenerationsInput): SlotGenerationPlan[] {
  const out: SlotGenerationPlan[] = [];
  for (const s of input.slots) {
    const override = input.slot_overrides?.[s.slot_id];
    const ctx = categorizeSlot(s.slot_id);
    const slotSeed = derivedSeed(input.seed, s.slot_id);
    const prompt = buildSlotPrompt({
      slot_id: s.slot_id,
      global_prompt: input.global_prompt,
      seed: slotSeed,
      ...(override !== undefined ? { slot_override: override } : {}),
      ...(input.palette_hint !== undefined ? { palette_hint: input.palette_hint } : {}),
    });
    out.push({ slot_id: s.slot_id, category: ctx.category, prompt, seed: slotSeed });
  }
  return out;
}

/** 결정론적 slot seed 파생 - fnv1a 변종 (seed, slot_id) → 32-bit int. */
export function derivedSeed(globalSeed: number, slotId: string): number {
  let h = (globalSeed >>> 0) ^ 0x811c9dc5;
  for (let i = 0; i < slotId.length; i++) {
    h = (h ^ slotId.charCodeAt(i)) >>> 0;
    h = (Math.imul(h, 0x01000193) >>> 0);
  }
  return h >>> 0;
}
