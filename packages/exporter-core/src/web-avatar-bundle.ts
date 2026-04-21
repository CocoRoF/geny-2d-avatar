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

import type {
  Template,
  TemplateTextureFile,
  TemplateAtlasDoc,
  TemplateAtlasSlotEntry,
  TemplateAtlasTextureEntry,
  PartSpec,
} from "./loader.js";
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
  /**
   * atlas.json 내용을 override (P1-S2 세션). 제공되면 `template.atlas` 대신 이 문서를
   * 직렬화해 기록. `textureOverrides` 와 조합 가능 — 호출자는 Mock/실제 텍스처로 대체
   * 한 뒤 새 크기에 맞춰 atlas 를 재구성한다.
   */
  atlasOverride?: TemplateAtlasDoc;
  /** web-avatar.json 파일 이름 override. 기본 `web-avatar.json`. */
  webAvatarFileName?: string;
  /** bundle.json 파일 이름 override. 기본 `bundle.json`. */
  manifestFileName?: string;
  /**
   * 텍스처 파일을 번들에 포함할지. 기본 true — template.textures 전부 복사.
   * false 로 두면 Stage 1 이하 동작 (web-avatar.json + bundle.json 만).
   */
  includeTextures?: boolean;
  /**
   * texture emit 직전 훅 (세션 35). 제공되면 `template.textures` 대신 이 배열을 사용.
   * 호출자는 원본 `template.textures` 를 디코딩하고 `@geny/post-processing` 의
   * `applyPreAtlasNormalization` / `applyAlphaSanitation` 등을 태운 뒤, 다시 PNG/WebP 로
   * 재인코딩해 이 옵션으로 주입한다. exporter-core 자체는 이미지 디코딩 의존성이 없다.
   * 각 항목의 `path` 는 원본과 동일해야 번들 매니페스트의 슬롯 참조가 깨지지 않는다.
   */
  textureOverrides?: readonly TemplateTextureFile[];
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
    ? (opts.textureOverrides ? [...opts.textureOverrides] : template.textures)
    : [];

  if (opts.textureOverrides && includeTextures) {
    const expectedPaths = new Set(template.textures.map((t) => t.path));
    for (const t of opts.textureOverrides) {
      if (!expectedPaths.has(t.path)) {
        throw new Error(
          `textureOverrides path '${t.path}' 는 template.textures 에 없음 — 경로 보존 필요`,
        );
      }
    }
  }

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

    const atlasDoc =
      opts.atlasOverride ?? template.atlas ?? buildSyntheticAtlas(templateTextures);
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

/**
 * 리그 템플릿의 `PartSpec.canvas_px` + `uv_box_px` 에서 atlas.slots 를 유도한다 (P1-S2).
 *
 * 각 part spec 에 `canvas_px: {w, h}` + `uv_box_px: {x, y, w, h}` 가 있으면
 * `uv = [x/W, y/H, w/W, h/H]` 정규화 좌표를 계산한다. 누락되거나 형식이 다른 spec 은
 * 조용히 건너뛴다 (옵셔널 필드).
 *
 * `texturePath` 는 어느 텍스처 파일에 매핑할지 — 현재 모든 템플릿이 단일 `textures/base.png`
 * 를 쓰므로 caller 가 지정. 다수 텍스처 분할은 P3+ 확장.
 *
 * 반환값은 `slot_id` 알파벳 정렬. 파생 가능한 슬롯이 하나도 없으면 빈 배열.
 */
export function deriveSlotsFromSpecs(
  partsById: Record<string, PartSpec>,
  texturePath: string,
): TemplateAtlasSlotEntry[] {
  const slots: TemplateAtlasSlotEntry[] = [];
  for (const slotId of Object.keys(partsById).sort()) {
    const spec = partsById[slotId];
    if (!spec) continue;
    const canvas = spec["canvas_px"] as { w?: unknown; h?: unknown } | undefined;
    const box = spec["uv_box_px"] as
      | { x?: unknown; y?: unknown; w?: unknown; h?: unknown }
      | undefined;
    if (!canvas || !box) continue;
    const W = Number(canvas.w);
    const H = Number(canvas.h);
    const x = Number(box.x);
    const y = Number(box.y);
    const w = Number(box.w);
    const h = Number(box.h);
    if (![W, H, x, y, w, h].every((n) => Number.isFinite(n))) continue;
    if (W <= 0 || H <= 0) continue;
    slots.push({
      slot_id: slotId,
      texture_path: texturePath,
      uv: [x / W, y / H, w / W, h / H],
    });
  }
  return slots;
}

/**
 * 리그 템플릿 전체 → `TemplateAtlasDoc` 유도. textures 항목은 `template.textures`
 * 의 실 파일 메타를 그대로 사용. slots 는 `deriveSlotsFromSpecs` 로 계산.
 *
 * `template.textures` 가 비어 있거나 유도 가능한 slot 이 하나도 없으면 `null` 을 반환.
 * caller 는 이 값을 `opts.atlasOverride` 로 주입하거나, 필요 시 texture width/height 을
 * Mock 생성 결과에 맞춰 덮어쓴다.
 */
export function deriveAtlasFromTemplate(template: Template): TemplateAtlasDoc | null {
  if (template.textures.length === 0) return null;
  const primary = template.textures[0];
  if (!primary) return null;
  const slots = deriveSlotsFromSpecs(template.partsById, primary.path);
  if (slots.length === 0) return null;
  const textures: TemplateAtlasTextureEntry[] = template.textures.map((t) => ({
    path: t.path,
    width: t.width,
    height: t.height,
    format: t.format,
    premultiplied_alpha: false,
  }));
  return {
    schema_version: "v1",
    format: 1,
    textures,
    slots,
  };
}

export type { WebAvatarTexture, WebAvatarAtlasRef } from "./converters/web-avatar.js";
