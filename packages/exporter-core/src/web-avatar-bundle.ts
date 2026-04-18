/**
 * Web Avatar 번들 조립기.
 *
 * Stage 1 (세션 15): web-avatar.json + bundle.json 만 방출.
 * Stage 2 (세션 18): + textures/*.{png,webp} 바이너리 + atlas.json.
 *
 * 구성 파일:
 *  - `<outDir>/web-avatar.json` — 런타임 전용 JSON 메타. textures[]/atlas 필드가 포함.
 *  - `<outDir>/atlas.json` — 텍스처 치수 + 슬롯 UV. textures 가 있으면 필수 (schema).
 *  - `<outDir>/textures/*.{png,webp}` — 바이너리 텍스처.
 *  - `<outDir>/bundle.json` — 번들 매니페스트 (kind=web-avatar-bundle).
 *
 * 결정론:
 *  - JSON 파일은 canonicalJson (키 정렬, 2-space, LF, trailing \n).
 *  - 텍스처 바이너리는 템플릿에서 읽은 바이트를 그대로 복사 — 재인코딩 없음.
 *  - bundle.json files[] 는 path 알파벳 정렬, `bundle.json` 자신은 제외 (세션 13 D1).
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import type { Template, TemplateTextureFile } from "./loader.js";
import { canonicalJson } from "./util/canonical-json.js";
import {
  convertWebAvatar,
  type ConvertWebAvatarOptions,
  type WebAvatarTexture,
  type WebAvatarAtlasRef,
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
  /**
   * 텍스처 파일을 번들에 포함할지. 기본 true — template.textures 전부 복사.
   * false 로 두면 Stage 1 이하 동작 (web-avatar.json + bundle.json 만).
   */
  includeTextures?: boolean;
}

const DEFAULT_WEB_AVATAR_FILE = "web-avatar.json";
const DEFAULT_MANIFEST_FILE = "bundle.json";
const ATLAS_FILE = "atlas.json";

export function assembleWebAvatarBundle(
  template: Template,
  outDir: string,
  opts: AssembleWebAvatarBundleOptions = {},
): BundleResult {
  const webAvatarName = opts.webAvatarFileName ?? DEFAULT_WEB_AVATAR_FILE;
  const manifestName = opts.manifestFileName ?? DEFAULT_MANIFEST_FILE;
  const includeTextures = opts.includeTextures ?? true;

  const files: BundleFileEntry[] = [];

  const writeJson = (relPath: string, value: unknown): string => {
    const abs = join(outDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    const text = canonicalJson(value);
    const buf = Buffer.from(text, "utf8");
    writeFileSync(abs, buf);
    const hash = createHash("sha256").update(buf).digest("hex");
    files.push({ path: relPath, sha256: hash, bytes: buf.byteLength });
    return hash;
  };

  const writeBinary = (relPath: string, buf: Buffer, sha256: string): void => {
    const abs = join(outDir, relPath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, buf);
    files.push({ path: relPath, sha256, bytes: buf.byteLength });
  };

  const textureEntries: WebAvatarTexture[] = [];
  let atlasRef: WebAvatarAtlasRef | null = null;

  const templateTextures: TemplateTextureFile[] = includeTextures
    ? template.textures
    : [];

  if (templateTextures.length > 0) {
    for (const t of templateTextures) {
      writeBinary(t.path, t.buffer, t.sha256);
      textureEntries.push({
        path: t.path,
        purpose: "albedo",
        width: t.width,
        height: t.height,
        bytes: t.bytes,
        sha256: t.sha256,
      });
    }

    const atlasDoc = template.atlas ?? buildSyntheticAtlas(templateTextures);
    const atlasHash = writeJson(ATLAS_FILE, atlasDoc);
    atlasRef = { path: ATLAS_FILE, sha256: atlasHash };
  }

  const convertOpts: ConvertWebAvatarOptions = {};
  if (opts.avatarId !== undefined) convertOpts.avatarId = opts.avatarId;
  convertOpts.textures = opts.textures ?? textureEntries;
  convertOpts.atlas = opts.atlas !== undefined ? opts.atlas : atlasRef;
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

/**
 * atlas.json 이 템플릿에 없으면 자동 생성. slots[] 는 비어 있으며 textures[] 는
 * 실제 파일 메타를 반영. Foundation placeholder 동작 — AI 파이프라인은 고유 atlas
 * 를 전달하므로 이 경로는 미사용 예상.
 */
function buildSyntheticAtlas(textures: TemplateTextureFile[]) {
  return {
    schema_version: "v1" as const,
    format: 1 as const,
    textures: textures.map((t) => ({
      path: t.path,
      width: t.width,
      height: t.height,
      format: t.format,
      premultiplied_alpha: false,
    })),
    slots: [],
  };
}

export type { WebAvatarTexture, WebAvatarAtlasRef } from "./converters/web-avatar.js";
