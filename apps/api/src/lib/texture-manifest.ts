/**
 * texture.manifest.json I/O 유틸 - schema/v1/texture-manifest.schema.json 준수.
 *
 * upload/generate 시 `<texturesDir>/<texture_id>.meta.json` 로 사이드카 저장,
 * build 시 읽어서 bundle 의 `texture.manifest.json` 으로 포함.
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

export type TextureMode = "manual_upload" | "mock_generate" | "ai_generate" | "recolor";

export interface TextureManifest {
  readonly schema_version: "v1";
  readonly format: 1;
  readonly texture_id: string;
  readonly atlas_sha256: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly preset: { readonly id: string; readonly version: string };
  readonly generated_by: {
    readonly mode: TextureMode;
    readonly adapter?: string;
    readonly prompt?: string;
    readonly seed?: number;
    readonly source_filename?: string;
    readonly attempts?: ReadonlyArray<{
      readonly adapter: string;
      readonly status: "success" | "error";
      readonly error_code?: string;
      readonly latency_ms?: number;
    }>;
  };
  readonly created_at: string;
  readonly notes?: string;
}

export interface WriteTextureManifestInput {
  readonly texturesDir: string;
  readonly textureId: string;
  readonly atlasSha256: string;
  readonly width: number;
  readonly height: number;
  readonly bytes: number;
  readonly preset: { id: string; version: string };
  readonly mode: TextureMode;
  readonly adapter?: string;
  readonly prompt?: string;
  readonly seed?: number;
  readonly sourceFilename?: string;
  readonly notes?: string;
}

export async function writeTextureManifest(
  input: WriteTextureManifestInput,
): Promise<TextureManifest> {
  const manifest: TextureManifest = {
    schema_version: "v1",
    format: 1,
    texture_id: input.textureId,
    atlas_sha256: input.atlasSha256,
    width: input.width,
    height: input.height,
    bytes: input.bytes,
    preset: { id: input.preset.id, version: input.preset.version },
    generated_by: {
      mode: input.mode,
      ...(input.adapter !== undefined ? { adapter: input.adapter } : {}),
      ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.sourceFilename !== undefined ? { source_filename: input.sourceFilename } : {}),
    },
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
  };
  const path = join(input.texturesDir, input.textureId + ".meta.json");
  await writeFile(path, JSON.stringify(manifest, null, 2) + "\n");
  return manifest;
}

export async function readTextureManifest(
  texturesDir: string,
  textureId: string,
): Promise<TextureManifest | null> {
  const path = join(texturesDir, textureId + ".meta.json");
  if (!existsSync(path)) return null;
  try {
    const buf = await readFile(path, "utf8");
    return JSON.parse(buf) as TextureManifest;
  } catch {
    return null;
  }
}
