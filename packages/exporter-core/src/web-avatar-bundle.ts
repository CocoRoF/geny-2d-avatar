/**
 * Web Avatar 번들 조립기 (세션 15 stage 1).
 *
 * 구성 파일:
 *  - `<outDir>/web-avatar.json` — 런타임 전용 JSON 메타 (converters/web-avatar.ts).
 *  - `<outDir>/bundle.json` — 번들 매니페스트 (kind=web-avatar-bundle, 세션 13 재사용).
 *
 * 본 stage 에서는 텍스처 PNG 등 바이너리 자산을 포함하지 않는다. `web-avatar.json`
 * 의 `textures[]` 는 참조 경로만 적고, 실제 에셋은 Editor 연동 후 stage 2+ 에서 추가.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import type { Template } from "./loader.js";
import { canonicalJson } from "./util/canonical-json.js";
import {
  convertWebAvatar,
  type ConvertWebAvatarOptions,
  type WebAvatarTexture,
} from "./converters/web-avatar.js";
import type { BundleFileEntry, BundleResult } from "./bundle.js";

export interface WebAvatarBundleManifestJson {
  schema_version: "v1";
  kind: "web-avatar-bundle";
  format: 1;
  template_id: string | null;
  template_version: string | null;
  avatar_id: string | null;
  files: BundleFileEntry[];
}

export interface AssembleWebAvatarBundleOptions extends ConvertWebAvatarOptions {
  /** web-avatar.json 파일 이름 override. 기본 `web-avatar.json`. */
  webAvatarFileName?: string;
  /** bundle.json 파일 이름 override. 기본 `bundle.json`. */
  manifestFileName?: string;
}

const DEFAULT_WEB_AVATAR_FILE = "web-avatar.json";
const DEFAULT_MANIFEST_FILE = "bundle.json";

/**
 * 템플릿 → web-avatar 번들 디렉터리.
 *
 * 결정론:
 *  - web-avatar.json 은 canonicalJson 으로 직렬화 (키 정렬, 2-space, LF, trailing \n).
 *  - bundle.json 도 동일. `files[]` 는 path 알파벳 정렬, `bundle.json` 자신은 제외 (세션 13 D1).
 *  - sha256 은 쓰여진 바이트에 대한 hex digest.
 */
export function assembleWebAvatarBundle(
  template: Template,
  outDir: string,
  opts: AssembleWebAvatarBundleOptions = {},
): BundleResult {
  const webAvatarName = opts.webAvatarFileName ?? DEFAULT_WEB_AVATAR_FILE;
  const manifestName = opts.manifestFileName ?? DEFAULT_MANIFEST_FILE;

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

  const convertOpts: ConvertWebAvatarOptions = {};
  if (opts.avatarId !== undefined) convertOpts.avatarId = opts.avatarId;
  if (opts.textures !== undefined) convertOpts.textures = opts.textures;
  const webAvatar = convertWebAvatar(template, convertOpts);
  writeJson(webAvatarName, webAvatar);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const manifest: WebAvatarBundleManifestJson = {
    schema_version: "v1",
    kind: "web-avatar-bundle",
    format: 1,
    template_id: template.manifest.id ?? null,
    template_version: template.manifest.version ?? null,
    avatar_id: opts.avatarId ?? null,
    files: [...files],
  };
  writeJson(manifestName, manifest);

  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return { outDir, files };
}

export type { WebAvatarTexture } from "./converters/web-avatar.js";
