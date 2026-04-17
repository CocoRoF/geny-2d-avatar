import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import type { Template } from "./loader.js";
import { canonicalJson } from "./util/canonical-json.js";
import { convertPoseFromTemplate } from "./converters/pose.js";
import { convertPhysicsFromTemplate } from "./converters/physics.js";
import { convertMotion } from "./converters/motion.js";
import { convertCdiFromTemplate } from "./converters/cdi.js";
import { convertExpression, expressionSlug } from "./converters/expression.js";
import {
  convertModelFromTemplate,
  DEFAULT_BUNDLE_FILE_NAMES,
  type BundleFileNames,
  type ConvertModelOptions,
  packSlug,
} from "./converters/model.js";

export interface BundleFileEntry {
  /** 번들 루트 기준 상대 경로 (e.g., `avatar.cdi3.json`, `motions/idle_default.motion3.json`). */
  path: string;
  /** sha256(hex) of the bytes written. */
  sha256: string;
  /** 바이트 크기. */
  bytes: number;
}

export interface BundleResult {
  outDir: string;
  files: BundleFileEntry[];
}

/**
 * 번들 루트 `bundle.json` (세션 13). schema/v1/bundle-manifest.schema.json 의 TS 투영.
 *
 * 자신(bundle.json)은 `files[]` 에 포함하지 않는다 (D1: self-reference 회피).
 * 결정론을 위해 타임스탬프·서명은 포함하지 않음 (D4).
 */
export interface BundleManifestJson {
  schema_version: "v1";
  kind: "cubism-bundle";
  format: 1;
  template_id: string | null;
  template_version: string | null;
  avatar_id: string | null;
  files: BundleFileEntry[];
}

export interface AssembleBundleOptions extends ConvertModelOptions {
  /** 파일명 override. 기본 `DEFAULT_BUNDLE_FILE_NAMES`. Forwarded to model3 converter. */
  fileNames?: Partial<BundleFileNames>;
  /** avatar-export 경유로 조립된 번들이면 해당 avatar_id. 단독 템플릿 조립 시 생략(null 저장). */
  avatarId?: string;
}

/**
 * 템플릿에서 Cubism 번들 디렉터리를 조립.
 *
 * 생성 파일 (세션 09 D8 + 세션 12 expressions + 세션 13 bundle.json):
 *  - `<outDir>/avatar.cdi3.json`
 *  - `<outDir>/avatar.model3.json`
 *  - `<outDir>/avatar.pose3.json`     (pose.json 이 있으면)
 *  - `<outDir>/avatar.physics3.json`  (physics.json 이 있으면)
 *  - `<outDir>/motions/<pack_slug>.motion3.json` per motion pack
 *  - `<outDir>/expressions/<expression_slug>.exp3.json` per expression pack
 *  - `<outDir>/bundle.json` (루트 매니페스트, 세션 13 — 자신 제외 모든 파일의 sha256)
 *
 * 결정론:
 *  - 모든 JSON 은 canonicalJson 경유 (키 알파벳 정렬).
 *  - `files` 배열은 path 알파벳 정렬. `bundle.json` 도 포함.
 *  - sha256 는 쓰여진 byte 그대로에 대한 hex digest.
 *  - bundle.json 내부 `files[]` 는 자기 자신을 제외 (세션 13 D1).
 */
export function assembleBundle(
  template: Template,
  outDir: string,
  opts: AssembleBundleOptions = {},
): BundleResult {
  const names: BundleFileNames = { ...DEFAULT_BUNDLE_FILE_NAMES, ...(opts.fileNames ?? {}) };
  const files: BundleFileEntry[] = [];

  const writeJson = (relPath: string, value: unknown): void => {
    const abs = join(outDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    const text = canonicalJson(value);
    const buf = Buffer.from(text, "utf8");
    writeFileSync(abs, buf);
    files.push({
      path: relPath,
      sha256: createHash("sha256").update(buf).digest("hex"),
      bytes: buf.byteLength,
    });
  };

  if (template.parameters) {
    writeJson(names.cdi, convertCdiFromTemplate(template));
  }

  if (template.pose) {
    writeJson(names.pose, convertPoseFromTemplate(template));
  }

  if (template.physics) {
    writeJson(names.physics, convertPhysicsFromTemplate(template));
  }

  const packIds = Object.keys(template.motions).sort();
  for (const packId of packIds) {
    const pack = template.motions[packId]!;
    const motion3 = convertMotion({ motion: pack, manifest: template.manifest });
    writeJson(`${names.motionsDir}/${packSlug(packId)}.motion3.json`, motion3);
  }

  const expressionIds = Object.keys(template.expressions).sort();
  for (const expressionId of expressionIds) {
    const pack = template.expressions[expressionId]!;
    const exp3 = convertExpression({
      pack,
      manifest: template.manifest,
      parameters: template.parameters,
    });
    writeJson(`${names.expressionsDir}/${expressionSlug(expressionId)}.exp3.json`, exp3);
  }

  writeJson(names.model, convertModelFromTemplate(template, modelOpts(opts)));

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const manifest: BundleManifestJson = {
    schema_version: "v1",
    kind: "cubism-bundle",
    format: 1,
    template_id: template.manifest.id ?? null,
    template_version: template.manifest.version ?? null,
    avatar_id: opts.avatarId ?? null,
    files: [...files],
  };
  writeJson(names.manifest, manifest);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { outDir, files };
}

/**
 * 번들 결과의 결정론적 스냅샷 (golden 용).
 * `files` 배열 = `[{path, sha256, bytes}, ...]` (path 정렬), + 총 파일 수·총 바이트.
 */
export function snapshotBundle(result: BundleResult): string {
  const totalBytes = result.files.reduce((acc, f) => acc + f.bytes, 0);
  return canonicalJson({
    file_count: result.files.length,
    files: result.files,
    total_bytes: totalBytes,
  });
}

function modelOpts(opts: AssembleBundleOptions): ConvertModelOptions | undefined {
  const { fileNames, lipsync, mocPath, texturePaths, motionGroupName } = opts;
  const out: ConvertModelOptions = {};
  if (fileNames !== undefined) out.fileNames = fileNames;
  if (lipsync !== undefined) out.lipsync = lipsync;
  if (mocPath !== undefined) out.mocPath = mocPath;
  if (texturePaths !== undefined) out.texturePaths = texturePaths;
  if (motionGroupName !== undefined) out.motionGroupName = motionGroupName;
  return Object.keys(out).length > 0 ? out : undefined;
}
