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
  cubism_mapping?: Record<string, string>;
  [key: string]: unknown;
}

export interface Template {
  dir: string;
  manifest: TemplateManifest;
  pose: PoseDoc | null;
  /** slot_id → PartSpec. */
  partsById: Record<string, PartSpec>;
}

/**
 * 리그 템플릿 디렉터리를 읽어 메모리 표현으로 변환.
 * v0.0.1: manifest + pose + parts 만 로드. parameters/deformers/physics/motions 는 세션 08b+.
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

  return { dir, manifest, pose, partsById };
}

function readJson<T>(path: string): T {
  const raw = readFileSync(path, "utf8");
  return JSON.parse(raw) as T;
}
