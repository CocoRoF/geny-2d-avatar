import type {
  ExpressionPackDoc,
  MotionPackDoc,
  ParametersDoc,
  Template,
  TemplateManifest,
} from "../loader.js";
import { expressionSlug } from "./expression.js";

export interface Model3MotionEntry {
  File: string;
  FadeInTime: number;
  FadeOutTime: number;
}

export interface Model3ExpressionEntry {
  Name: string;
  File: string;
}

export interface Model3FileReferences {
  Moc: string;
  Textures: string[];
  Physics?: string;
  Pose?: string;
  DisplayInfo?: string;
  Motions?: Record<string, Model3MotionEntry[]>;
  Expressions?: Model3ExpressionEntry[];
  UserData?: string;
}

export interface Model3Group {
  Target: "Parameter" | "Part";
  Name: string;
  Ids: string[];
}

export interface Model3HitArea {
  Id: string;
  Name: string;
}

export interface Model3Json {
  Version: number;
  FileReferences: Model3FileReferences;
  Groups: Model3Group[];
  HitAreas: Model3HitArea[];
}

/**
 * 번들 내 파일 이름 규약 (세션 09 D8, 세션 12 expressionsDir 추가). 호출자가 override 가능.
 */
export interface BundleFileNames {
  model: string;
  cdi: string;
  pose: string;
  physics: string;
  motionsDir: string;
  expressionsDir: string;
}

export const DEFAULT_BUNDLE_FILE_NAMES: BundleFileNames = {
  model: "avatar.model3.json",
  cdi: "avatar.cdi3.json",
  pose: "avatar.pose3.json",
  physics: "avatar.physics3.json",
  motionsDir: "motions",
  expressionsDir: "expressions",
};

export const DEFAULT_MOC_PATH = "avatar.moc3";
export const DEFAULT_TEXTURE_PATHS: string[] = ["textures/texture_00.png"];

export interface ConvertModelOptions {
  /** 5-vowel precise LipSync group (D5). Default: simple single-vowel group. */
  lipsync?: "simple" | "precise";
  /** Moc 파일 경로 override. 기본 `avatar.moc3` (D7). */
  mocPath?: string;
  /** Textures 경로 override. 기본 `["textures/texture_00.png"]`. */
  texturePaths?: string[];
  /** 번들 파일명 override. 기본 `DEFAULT_BUNDLE_FILE_NAMES`. */
  fileNames?: Partial<BundleFileNames>;
  /** motion pack id → motion group name 매핑. 기본: 첫 토큰(`idle.default` → `Idle`). */
  motionGroupName?: (packId: string) => string;
}

export interface ConvertModelInput {
  manifest: TemplateManifest;
  parameters: ParametersDoc | null;
  /** pack_id → MotionPackDoc. null 이면 Motions 생략. */
  motions: Record<string, MotionPackDoc>;
  /** expression_id → ExpressionPackDoc. 비어 있으면 Expressions 키 생략. */
  expressions?: Record<string, ExpressionPackDoc>;
  opts?: ConvertModelOptions;
}

/**
 * 내부 manifest + parameters + motions → Cubism model3.json.
 *
 * 규약 (세션 09 결정):
 * - D5: Groups.EyeBlink = [eye_open_l, eye_open_r] (있는 것만), LipSync = [mouth_vowel_a]
 *        또는 `opts.lipsync: "precise"` 일 때 5 vowel.
 * - D6: HitAreas 는 manifest.hit_areas 에서 직역. Name = role PascalCase (Head, Body).
 * - D7: FileReferences.Moc/Textures 기본 placeholder, opts 로 override.
 * - D8: 파일명 규약 `avatar.{model,cdi,pose,physics}3.json` + `motions/<pack_slug>.motion3.json`.
 *        `pack_slug` = pack_id 의 `.` → `_`, lowercase.
 */
export function convertModel({
  manifest,
  parameters,
  motions,
  expressions = {},
  opts = {},
}: ConvertModelInput): Model3Json {
  const names: BundleFileNames = { ...DEFAULT_BUNDLE_FILE_NAMES, ...(opts.fileNames ?? {}) };
  const mapping = manifest.cubism_mapping ?? {};
  const paramId = (internal: string): string | null => {
    if (parameters) {
      const p = parameters.parameters.find((x) => x.id === internal);
      if (p?.cubism) return p.cubism;
    }
    return mapping[internal] ?? null;
  };

  const Groups: Model3Group[] = [];

  const eyeBlinkIds: string[] = [];
  for (const i of ["eye_open_l", "eye_open_r"]) {
    const id = paramId(i);
    if (id) eyeBlinkIds.push(id);
  }
  if (eyeBlinkIds.length > 0) {
    Groups.push({ Target: "Parameter", Name: "EyeBlink", Ids: eyeBlinkIds });
  }

  const lipsyncInternals =
    opts.lipsync === "precise"
      ? ["mouth_vowel_a", "mouth_vowel_i", "mouth_vowel_u", "mouth_vowel_e", "mouth_vowel_o"]
      : ["mouth_vowel_a"];
  const lipsyncIds: string[] = [];
  for (const i of lipsyncInternals) {
    const id = paramId(i);
    if (id) lipsyncIds.push(id);
  }
  if (lipsyncIds.length > 0) {
    Groups.push({ Target: "Parameter", Name: "LipSync", Ids: lipsyncIds });
  }

  const HitAreas: Model3HitArea[] = (manifest.hit_areas as Array<{ id: string; role: string }> ?? []).map((h) => ({
    Id: h.id,
    Name: toPascalCase(h.role),
  }));

  const Motions: Record<string, Model3MotionEntry[]> = {};
  const packIds = Object.keys(motions).sort();
  const groupName = opts.motionGroupName ?? defaultMotionGroupName;
  for (const packId of packIds) {
    const pack = motions[packId]!;
    const name = groupName(packId);
    const slug = packSlug(packId);
    const entry: Model3MotionEntry = {
      File: `${names.motionsDir}/${slug}.motion3.json`,
      FadeInTime: pack.meta.fade_in_sec,
      FadeOutTime: pack.meta.fade_out_sec,
    };
    const bucket = Motions[name] ?? [];
    bucket.push(entry);
    Motions[name] = bucket;
  }

  const FileReferences: Model3FileReferences = {
    Moc: opts.mocPath ?? DEFAULT_MOC_PATH,
    Textures: opts.texturePaths ?? DEFAULT_TEXTURE_PATHS.slice(),
    Physics: names.physics,
    Pose: names.pose,
    DisplayInfo: names.cdi,
  };
  if (packIds.length > 0) FileReferences.Motions = Motions;

  const expressionIds = Object.keys(expressions).sort();
  if (expressionIds.length > 0) {
    const Expressions: Model3ExpressionEntry[] = expressionIds.map((id) => {
      const slug = expressionSlug(id);
      return { Name: slug, File: `${names.expressionsDir}/${slug}.exp3.json` };
    });
    FileReferences.Expressions = Expressions;
  }

  return {
    Version: 3,
    FileReferences,
    Groups,
    HitAreas,
  };
}

export function convertModelFromTemplate(
  tpl: Template,
  opts?: ConvertModelOptions,
): Model3Json {
  return convertModel({
    manifest: tpl.manifest,
    parameters: tpl.parameters,
    motions: tpl.motions,
    expressions: tpl.expressions,
    ...(opts !== undefined ? { opts } : {}),
  });
}

function toPascalCase(snake: string): string {
  return snake
    .split("_")
    .filter((t) => t.length > 0)
    .map((t) => t.charAt(0).toUpperCase() + t.slice(1).toLowerCase())
    .join("");
}

/** `idle.default` → `idle_default`. */
export function packSlug(packId: string): string {
  return packId.replace(/\./g, "_").toLowerCase();
}

/** `idle.default` → `Idle`, `greet.wave` → `Greet`. */
function defaultMotionGroupName(packId: string): string {
  const head = packId.split(".")[0] ?? packId;
  return head.charAt(0).toUpperCase() + head.slice(1).toLowerCase();
}
