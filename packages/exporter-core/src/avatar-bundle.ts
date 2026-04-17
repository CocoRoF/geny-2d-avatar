import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { loadTemplate } from "./loader.js";
import {
  assembleBundle,
  type AssembleBundleOptions,
  type BundleResult,
} from "./bundle.js";

/**
 * docs/11 §3.5 · 세션 11.
 *
 * Avatar 단의 번들 조립 입력. `schema/v1/avatar-export.schema.json` 의 TS 투영.
 * metadata(`.avatar.json`) 와 짝으로 저장되며, 이 구조체 하나로 번들링을 재현할 수 있다.
 */
export interface AvatarExportSpec {
  schema_version: "v1";
  avatar_id: string;
  template_id: string;
  template_version: string;
  bundle_name: string;
  moc_path?: string;
  texture_paths?: string[];
  lipsync?: "simple" | "precise";
  extra_file_refs?: { user_data?: string };
  notes?: string;
}

/**
 * 세션 11 D5: `<rigTemplatesRoot>/<channel>/<family>/v<template_version>/`.
 *
 * template_id 포맷: `tpl.<channel>.v<major>.<family>` (common/ids.json · templateRef).
 * 예: `tpl.base.v1.halfbody` + `template_version=1.2.0` → `<root>/base/halfbody/v1.2.0/`.
 */
const TEMPLATE_ID_RE = /^tpl\.(base|community|custom)\.v(\d+)\.([a-z][a-z0-9_]{1,40})$/;

/**
 * avatar-export 스펙 + rig template 레퍼런스 → Cubism 번들 디렉터리 조립.
 *
 * - 번들 파일명 prefix 는 `spec.bundle_name` 로 결정 (세션 11 D4).
 * - `motions/` 디렉터리명은 변경하지 않는다 (D4 명시).
 * - `spec.moc_path` / `spec.texture_paths` 생략 시 `{bundle_name}.moc3` / `[textures/{bundle_name}_00.png]` 로 채움 (schema default).
 * - template 경로 규약 불일치 시 즉시 throw (재현성 확보).
 *
 * 결정론:
 * - 결과 `files` 배열은 path 정렬 + sha256 포함 (→ snapshotBundle 로 golden 생성 가능).
 */
export function assembleAvatarBundle(
  spec: AvatarExportSpec,
  rigTemplatesRoot: string,
  outDir: string,
): BundleResult {
  const templateDir = resolveTemplateDir(rigTemplatesRoot, spec.template_id, spec.template_version);
  const tpl = loadTemplate(templateDir);

  if (tpl.manifest.version !== spec.template_version) {
    throw new Error(
      `assembleAvatarBundle: spec.template_version=${spec.template_version} but manifest at ${templateDir} has version=${tpl.manifest.version} (ADR 0003 mismatch)`,
    );
  }
  if (tpl.manifest.id !== spec.template_id) {
    throw new Error(
      `assembleAvatarBundle: spec.template_id=${spec.template_id} but manifest at ${templateDir} has id=${tpl.manifest.id}`,
    );
  }

  const opts = specToBundleOptions(spec);
  return assembleBundle(tpl, outDir, opts);
}

/**
 * AvatarExportSpec → AssembleBundleOptions.
 *
 * bundle_name 은 파일명 prefix 로 전개 (D4):
 *   bundle_name "aria" → `aria.{model,cdi,pose,physics}3.json` + `motions/…` (unchanged).
 */
export function specToBundleOptions(spec: AvatarExportSpec): AssembleBundleOptions {
  const name = spec.bundle_name;
  const opts: AssembleBundleOptions = {
    fileNames: {
      model: `${name}.model3.json`,
      cdi: `${name}.cdi3.json`,
      pose: `${name}.pose3.json`,
      physics: `${name}.physics3.json`,
      motionsDir: "motions",
    },
    mocPath: spec.moc_path ?? `${name}.moc3`,
    texturePaths: spec.texture_paths ?? [`textures/${name}_00.png`],
  };
  if (spec.lipsync !== undefined) opts.lipsync = spec.lipsync;
  return opts;
}

/**
 * D5: 규약 기반 템플릿 경로 해석. 실패 시 throw.
 */
export function resolveTemplateDir(
  rigTemplatesRoot: string,
  templateId: string,
  templateVersion: string,
): string {
  const m = TEMPLATE_ID_RE.exec(templateId);
  if (!m) {
    throw new Error(
      `assembleAvatarBundle: template_id '${templateId}' does not match pattern 'tpl.<channel>.v<major>.<family>'`,
    );
  }
  const [, channel, major, family] = m;
  const versionMajor = templateVersion.split(".")[0];
  if (versionMajor !== major) {
    throw new Error(
      `assembleAvatarBundle: template_version major '${versionMajor}' does not match template_id major 'v${major}' in '${templateId}'`,
    );
  }
  const dir = join(rigTemplatesRoot, channel!, family!, `v${templateVersion}`);
  if (!existsSync(dir)) {
    throw new Error(
      `assembleAvatarBundle: template directory not found at ${dir} (derived from template_id=${templateId}, template_version=${templateVersion}, rigTemplatesRoot=${rigTemplatesRoot})`,
    );
  }
  return dir;
}

/**
 * 파일에서 AvatarExportSpec 을 읽는 헬퍼. CLI 편의용. 스키마 검증은 수행하지 않는다 —
 * 호출자(또는 pre-commit, CI `validate:schemas`)가 이미 보장한다는 가정.
 */
export function readAvatarExportSpec(path: string): AvatarExportSpec {
  const raw = readFileSync(path, "utf8");
  const parsed = JSON.parse(raw) as AvatarExportSpec;
  return parsed;
}
