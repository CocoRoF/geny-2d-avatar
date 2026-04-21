import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

export interface PartSpec {
  schema_version: string;
  slot_id: string;
  role: string;
  cubism_part_id: string;
  parameter_ids?: readonly string[];
  [key: string]: unknown;
}

export interface PoseSlot {
  slot_id: string;
  link?: string[];
}

export interface PoseDoc {
  schema_version: string;
  format: number;
  type: "live2d_pose";
  fade_in_time?: number;
  groups: PoseSlot[][];
}

export interface TemplateManifest {
  schema_version: string;
  id: string;
  version: string;
  parts_dir: string;
  physics_file?: string;
  motions_dir?: string;
  cubism_mapping?: Record<string, string>;
  [key: string]: unknown;
}

export interface PhysicsInput {
  source_param: string;
  weight: number;
  type: string;
  reflect: boolean;
}

export interface PhysicsOutput {
  destination_param: string;
  vertex_index: number;
  scale: number;
  weight: number;
  type: string;
  reflect: boolean;
}

export interface PhysicsVertex {
  position: { x: number; y: number };
  mobility: number;
  delay: number;
  acceleration: number;
  radius: number;
}

export interface PhysicsNormalizationRange {
  minimum: number;
  default: number;
  maximum: number;
}

export interface PhysicsSettingDoc {
  id: string;
  enabled_by_default?: boolean;
  notes?: string;
  input: PhysicsInput[];
  output: PhysicsOutput[];
  vertices: PhysicsVertex[];
  normalization: {
    position: PhysicsNormalizationRange;
    angle: PhysicsNormalizationRange;
  };
}

export interface PhysicsDoc {
  schema_version: string;
  version: number;
  notes?: string;
  meta: {
    physics_setting_count: number;
    total_input_count: number;
    total_output_count: number;
    vertex_count: number;
    fps: number;
    effective_forces: {
      gravity: { x: number; y: number };
      wind: { x: number; y: number };
    };
  };
  physics_dictionary: Array<{
    id: string;
    name: { en: string; ko?: string; ja?: string };
  }>;
  physics_settings: PhysicsSettingDoc[];
  presets?: Record<string, unknown>;
}

export interface MotionCurve {
  target: "parameter" | "part_opacity";
  target_id: string;
  fade_in_sec?: number;
  fade_out_sec?: number;
  segments: number[];
}

export interface MotionPackMeta {
  duration_sec: number;
  fps: 30 | 60;
  fade_in_sec: number;
  fade_out_sec: number;
  loop: boolean;
  curve_count: number;
  total_segment_count: number;
  total_point_count: number;
}

export interface MotionUserDataEntry {
  time_sec: number;
  value: string;
}

export interface MotionPackDoc {
  schema_version: string;
  pack_id: string;
  version: string;
  format?: number;
  notes?: string;
  meta: MotionPackMeta;
  curves: MotionCurve[];
  user_data?: MotionUserDataEntry[];
}

export interface ExpressionBlend {
  target_id: string;
  value: number;
  blend: "Add" | "Multiply" | "Overwrite";
}

export interface ExpressionPackDoc {
  schema_version: string;
  expression_id: string;
  version: string;
  format?: number;
  name: { en: string; ko?: string; ja?: string };
  notes?: string;
  fade_in_sec?: number;
  fade_out_sec?: number;
  blends: ExpressionBlend[];
}

export interface ParameterGroupDoc {
  id: string;
  display_name: { en: string; ko?: string; ja?: string };
}

export interface ParameterDoc {
  id: string;
  display_name: { en: string; ko?: string; ja?: string };
  unit?: string;
  range: [number, number];
  default: number;
  required?: boolean;
  group: string;
  channel?: string;
  /** Cubism parameter ID (`ParamAngleX`). Inline override; manifest.cubism_mapping 이 fallback. */
  cubism?: string;
  physics_input?: boolean;
  physics_output?: boolean;
  notes?: string;
}

export interface ParametersDoc {
  schema_version: string;
  groups: ParameterGroupDoc[];
  /** `[[axisH_id, axisV_id], ...]` — cdi3 CombinedParameters 의 원본. */
  combined_axes: string[][];
  parameters: ParameterDoc[];
}

export interface TemplateTextureFile {
  /** 번들에 놓일 상대 경로, 예: `textures/base.png`. path 알파벳 정렬. */
  path: string;
  /** 디스크 상 절대 경로 (디버깅 용). */
  absPath: string;
  width: number;
  height: number;
  format: "png" | "webp";
  bytes: number;
  sha256: string;
  buffer: Buffer;
}

export interface TemplateAtlasTextureEntry {
  path: string;
  width: number;
  height: number;
  format: "png" | "webp";
  premultiplied_alpha: boolean;
}

export interface TemplateAtlasSlotEntry {
  slot_id: string;
  texture_path: string;
  uv: [number, number, number, number];
  /** β P1-S7 optional — 회전/스케일 피벗의 canvas UV 좌표. 미지정 시 slot UV 중심. */
  pivot_uv?: [number, number];
}

export interface TemplateAtlasDoc {
  schema_version: "v1";
  format: 1;
  textures: TemplateAtlasTextureEntry[];
  slots: TemplateAtlasSlotEntry[];
}

export interface Template {
  dir: string;
  manifest: TemplateManifest;
  pose: PoseDoc | null;
  /** slot_id → PartSpec. */
  partsById: Record<string, PartSpec>;
  physics: PhysicsDoc | null;
  /** pack_id → MotionPackDoc. */
  motions: Record<string, MotionPackDoc>;
  parameters: ParametersDoc | null;
  /** expression_id → ExpressionPackDoc. 빈 객체 = 표정 미선언 템플릿. */
  expressions: Record<string, ExpressionPackDoc>;
  /** 템플릿 `textures/` 의 모든 PNG/WebP. path 알파벳 정렬. 없으면 빈 배열. */
  textures: TemplateTextureFile[];
  /** 템플릿 `textures/atlas.json`. 없으면 null. */
  atlas: TemplateAtlasDoc | null;
}

/**
 * 리그 템플릿 디렉터리를 읽어 메모리 표현으로 변환.
 * v0.2.0: manifest + pose + parts + physics + motions + parameters 로드 (세션 09 확장).
 */
export function loadTemplate(dir: string): Template {
  const manifestPath = join(dir, "template.manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`loadTemplate: manifest not found at ${manifestPath}`);
  }
  const manifest = readJson<TemplateManifest>(manifestPath);

  const partsDir = join(dir, manifest.parts_dir ?? "parts/");
  const partsById: Record<string, PartSpec> = {};
  if (existsSync(partsDir)) {
    for (const f of readdirSync(partsDir)) {
      if (!f.endsWith(".spec.json")) continue;
      const spec = readJson<PartSpec>(join(partsDir, f));
      if (!spec.slot_id) {
        throw new Error(`loadTemplate: part ${f} is missing slot_id`);
      }
      partsById[spec.slot_id] = spec;
    }
  }

  const posePath = join(dir, "pose.json");
  const pose = existsSync(posePath) ? readJson<PoseDoc>(posePath) : null;

  const physicsRel = manifest.physics_file ?? "physics/physics.json";
  const physicsPath = join(dir, physicsRel);
  const physics = existsSync(physicsPath) ? readJson<PhysicsDoc>(physicsPath) : null;

  const motionsRel = manifest.motions_dir ?? "motions/";
  const motionsDir = join(dir, motionsRel);
  const motions: Record<string, MotionPackDoc> = {};
  if (existsSync(motionsDir)) {
    for (const f of readdirSync(motionsDir)) {
      if (!f.endsWith(".motion.json")) continue;
      const pack = readJson<MotionPackDoc>(join(motionsDir, f));
      if (!pack.pack_id) {
        throw new Error(`loadTemplate: motion ${f} is missing pack_id`);
      }
      motions[pack.pack_id] = pack;
    }
  }

  const paramsRel = (manifest.parameters_file as string | undefined) ?? "parameters.json";
  const paramsPath = join(dir, paramsRel);
  const parameters = existsSync(paramsPath) ? readJson<ParametersDoc>(paramsPath) : null;

  const expressionsRel = manifest.expressions_dir as string | undefined;
  const expressions: Record<string, ExpressionPackDoc> = {};
  if (expressionsRel) {
    const expressionsDir = join(dir, expressionsRel);
    if (existsSync(expressionsDir)) {
      for (const f of readdirSync(expressionsDir)) {
        if (!f.endsWith(".expression.json")) continue;
        const pack = readJson<ExpressionPackDoc>(join(expressionsDir, f));
        if (!pack.expression_id) {
          throw new Error(`loadTemplate: expression ${f} is missing expression_id`);
        }
        expressions[pack.expression_id] = pack;
      }
    }
  }

  const texturesRel = (manifest.textures_dir as string | undefined) ?? "textures/";
  const texturesDir = join(dir, texturesRel);
  const textures: TemplateTextureFile[] = [];
  let atlas: TemplateAtlasDoc | null = null;
  if (existsSync(texturesDir)) {
    for (const f of readdirSync(texturesDir)) {
      const lower = f.toLowerCase();
      if (lower === "atlas.json") continue;
      if (!lower.endsWith(".png") && !lower.endsWith(".webp")) continue;
      const abs = join(texturesDir, f);
      const buffer = readFileSync(abs);
      const format: "png" | "webp" = lower.endsWith(".webp") ? "webp" : "png";
      const { width, height } = readImageDimensions(buffer, format, abs);
      textures.push({
        path: `${texturesRel.replace(/\/$/, "")}/${f}`,
        absPath: abs,
        width,
        height,
        format,
        bytes: buffer.byteLength,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        buffer,
      });
    }
    textures.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

    const atlasPath = join(texturesDir, "atlas.json");
    if (existsSync(atlasPath)) {
      atlas = readJson<TemplateAtlasDoc>(atlasPath);
    }
  }

  return {
    dir,
    manifest,
    pose,
    partsById,
    physics,
    motions,
    parameters,
    expressions,
    textures,
    atlas,
  };
}

function readJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}

/**
 * PNG / WebP 헤더에서 width · height 만 읽는다.
 *
 * - PNG: signature 8B + IHDR chunk (length/type/width(4B)/height(4B)/…). Offset 16,20.
 * - WebP: RIFF + WEBP + 서브청크(VP8 / VP8L / VP8X). 본 프로젝트는 PNG 우선, WebP 는
 *   VP8 (단일 프레임 lossy) 만 지원한다. VP8L / VP8X 는 후속 세션에서 확장.
 */
function readImageDimensions(
  buf: Buffer,
  format: "png" | "webp",
  debugPath: string,
): { width: number; height: number } {
  if (format === "png") {
    if (buf.byteLength < 24) {
      throw new Error(`loadTemplate: PNG too small at ${debugPath}`);
    }
    const sig = buf.subarray(0, 8);
    if (
      sig[0] !== 0x89 ||
      sig[1] !== 0x50 ||
      sig[2] !== 0x4e ||
      sig[3] !== 0x47 ||
      sig[4] !== 0x0d ||
      sig[5] !== 0x0a ||
      sig[6] !== 0x1a ||
      sig[7] !== 0x0a
    ) {
      throw new Error(`loadTemplate: not a PNG at ${debugPath}`);
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    if (width === 0 || height === 0) {
      throw new Error(`loadTemplate: PNG has zero dimension at ${debugPath}`);
    }
    return { width, height };
  }
  // WebP (VP8 lossy — docs/11 §3.4 기본).
  if (buf.byteLength < 30) {
    throw new Error(`loadTemplate: WebP too small at ${debugPath}`);
  }
  if (
    buf.subarray(0, 4).toString("ascii") !== "RIFF" ||
    buf.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    throw new Error(`loadTemplate: not a WebP at ${debugPath}`);
  }
  const sub = buf.subarray(12, 16).toString("ascii");
  if (sub === "VP8 ") {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height };
  }
  throw new Error(
    `loadTemplate: WebP subchunk ${sub.trim()} not supported (only VP8) at ${debugPath}`,
  );
}
