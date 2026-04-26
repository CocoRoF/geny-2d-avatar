/**
 * Atlas-aware edit prompt 빌더 — 모든 vendor (OpenAI / Gemini) 가 reference image 를
 * "Live2D character texture atlas" 로 인식하고 atlas 형식 보존하면서 변형하도록 지시.
 *
 * 사용자가 ChatGPT/Gemini playground 에서 직접 사용 시 multimodal 대화 context 로 의도가
 * 자연스럽게 전달되는데, API 호출 시 단순 prompt 한 줄만 보내면 모델이 character
 * generation 으로 해석해 새 portrait 그림. 명시적 atlas-edit 패턴 prompt 필수.
 *
 * 출처: Google "how to prompt Gemini 2.5 Flash Image" + OpenAI image edits cookbook 의
 * inpainting 패턴 ("Using the provided image, change only X. Keep everything else...").
 */

export interface EditPromptInput {
  /** 사용자가 입력한 prompt (예: "red hair", "blue jacket"). */
  readonly userPrompt: string;
  /** seed 값. */
  readonly seed: number;
  /** 입력 이미지가 atlas (UV layout) 인지. mao_pro 같은 third-party preset 은 true. */
  readonly isAtlas: boolean;
}

export function buildEditPrompt(input: EditPromptInput): string {
  const userPrompt = input.userPrompt.trim();
  if (input.isAtlas) {
    // Atlas 보존을 강하게 anchor. 공식 inpainting 패턴 + 핵심 제약 명시.
    return [
      "Using the provided image as a Live2D character texture atlas",
      "(multiple character parts arranged in fixed UV regions on a single flat sheet, with transparent background between parts),",
      "produce an edited atlas where",
      userPrompt + ".",
      "",
      "Hard constraints:",
      "(1) Do NOT change the position, scale, rotation, or shape of any part.",
      "(2) Do NOT change the input aspect ratio. Output dimensions must match the input.",
      "(3) Preserve the transparent (alpha=0) background pixels exactly — do not paint over them with any color.",
      "(4) Do not generate a portrait or a new composition; only modify pixels inside the existing colored regions.",
      "(5) Apply the modification consistently across all instances of the same part (front/side/back hair, multiple eye states, etc.).",
      "",
      "Seed: " + input.seed + ".",
    ].join(" ").replace(/  +/g, " ").trim();
  }
  // Atlas 가 아닌 일반 reference (예: 사용자가 임의 PNG 업로드 — 미래 시나리오).
  return (
    "Using the provided image as a reference, " +
    userPrompt +
    ". Keep the overall layout, framing, aspect ratio, and transparent regions exactly the same. Seed: " +
    input.seed + "."
  );
}

/**
 * text-to-image (reference 없음) 시 prompt. atlas 형식으로 새로 그리도록 요청.
 */
export function buildGenerateAtlasPrompt(userPrompt: string, seed: number): string {
  return (
    userPrompt.trim() +
    " — texture atlas for a Live2D character avatar," +
    " flat sheet with parts arranged in UV regions on transparent background," +
    " centered subject, square aspect ratio. Seed: " + seed + "."
  );
}
