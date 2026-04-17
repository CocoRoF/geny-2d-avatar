import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface PartSpec {
  schema_version: string;
  slot_id: string;
  role: string;
  cubism_part_id: string;
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

  return { dir, manifest, pose, partsById, physics, motions, parameters, expressions };
}

function readJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}
