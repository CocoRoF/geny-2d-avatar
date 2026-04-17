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

export interface AssembleBundleOptions extends ConvertModelOptions {
  /** 파일명 override. 기본 `DEFAULT_BUNDLE_FILE_NAMES`. Forwarded to model3 converter. */
  fileNames?: Partial<BundleFileNames>;
}

/**
 * 템플릿에서 Cubism 번들 디렉터리를 조립.
 *
 * 생성 파일 (세션 09 D8 + 세션 12 expressions):
 *  - `<outDir>/avatar.cdi3.json`
 *  - `<outDir>/avatar.model3.json`
 *  - `<outDir>/avatar.pose3.json`     (pose.json 이 있으면)
 *  - `<outDir>/avatar.physics3.json`  (physics.json 이 있으면)
 *  - `<outDir>/motions/<pack_slug>.motion3.json` per motion pack
 *  - `<outDir>/expressions/<expression_slug>.exp3.json` per expression pack
 *
 * 결정론:
 *  - 모든 JSON 은 canonicalJson 경유 (키 알파벳 정렬).
 *  - `files` 배열은 path 알파벳 정렬.
 *  - sha256 는 쓰여진 byte 그대로에 대한 hex digest.
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
