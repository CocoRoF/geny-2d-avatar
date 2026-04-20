export type Category = "Face" | "Hair" | "Body" | "Accessory" | "Other";

export const CATEGORY_ORDER: readonly Category[] = ["Face", "Hair", "Body", "Accessory"] as const;

export interface PartLike {
  readonly role: string;
  readonly slot_id: string;
  readonly parameter_ids?: readonly string[];
}

export function categoryOf(role: string): Category {
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
    role === "torso" ||
    role === "neck" ||
    role === "body" ||
    role === "limb" ||
    role === "clothing"
  ) return "Body";
  if (role.startsWith("accessory_") || role === "accessory") return "Accessory";
  return "Other";
}

export function categorize<P extends PartLike>(parts: readonly P[]): Map<Category, P[]> {
  const groups = new Map<Category, P[]>();
  for (const p of parts) {
    const cat = categoryOf(p.role);
    let list = groups.get(cat);
    if (!list) {
      list = [];
      groups.set(cat, list);
    }
    list.push(p);
  }
  for (const list of groups.values()) {
    list.sort((a, b) => a.slot_id.localeCompare(b.slot_id));
  }
  return groups;
}

export interface ParameterLike {
  readonly id: string;
  readonly group: string;
}

export const GROUPS_FOR_CATEGORY: Readonly<Record<Category, readonly string[]>> = {
  Face: ["face", "eyes", "brows", "mouth"],
  Hair: ["hair"],
  Body: ["body"],
  Accessory: ["body"],
  Other: [],
} as const;

export const OVERALL_GROUP = "overall";

export function parametersForPart<P extends ParameterLike>(
  part: PartLike | null,
  parameters: readonly P[],
): P[] {
  if (part === null) return [...parameters];
  const overallParams = parameters.filter((p) => p.group === OVERALL_GROUP);
  if (part.parameter_ids !== undefined) {
    const explicit = new Set(part.parameter_ids);
    const matches = parameters.filter((p) => explicit.has(p.id));
    const seen = new Set(matches.map((p) => p.id));
    const extras = overallParams.filter((p) => !seen.has(p.id));
    return [...matches, ...extras];
  }
  const role = part.role;
  const substringMatches = parameters.filter((p) => p.id.includes(role));
  if (substringMatches.length > 0) {
    const seen = new Set(substringMatches.map((p) => p.id));
    const extras = overallParams.filter((p) => !seen.has(p.id));
    return [...substringMatches, ...extras];
  }
  const whitelist = new Set<string>([
    ...GROUPS_FOR_CATEGORY[categoryOf(role)],
    OVERALL_GROUP,
  ]);
  return parameters.filter((p) => whitelist.has(p.group));
}
