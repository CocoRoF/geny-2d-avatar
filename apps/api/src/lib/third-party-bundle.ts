/**
 * Third-party preset 번들 조립 - mao_pro 처럼 원본 Cubism 형식으로 배포된 프리셋 전용.
 *
 * derived preset 의 `assembleAvatarBundle` (우리 schema → Cubism format 변환) 은 third-party
 * 프리셋에 안 맞는다. mao_pro 의 cdi3.json/parameters/parts 는 이미 Cubism 표준 이름 (예:
 * `o_hair_mesh`) 을 쓰는데 변환 로직은 우리 manifest.cubism_mapping 매핑을 요구해서 실패.
 *
 * Third-party 의 올바른 처리: `runtime_assets/` 통째로 복사 (모든 .moc3/.cdi3/.physics3/.pose3/
 * .model3.json/motions/expressions/원본 texture). 그 위에 사용자가 만든 새 텍스처만 덮어쓴다.
 * model3.json 의 FileReferences.Textures[0] 가 가리키는 경로에 정확히 PNG 를 배치해야 외부
 * Live2D viewer 에서 그대로 재생됨.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

export interface ThirdPartyBundleInput {
  readonly presetDir: string; // <root>/base/<slug>/v<X.Y.Z>
  readonly slug: string;
  readonly presetId: string;
  readonly presetVersion: string;
  readonly textureSrcPath: string; // .../<texture_id>.png
  readonly outDir: string;
  readonly avatarId?: string | null;
}

export interface BundleFile {
  readonly path: string; // relative to outDir
  readonly sha256: string;
  readonly bytes: number;
}

export interface ThirdPartyBundleResult {
  readonly outDir: string;
  readonly files: ReadonlyArray<BundleFile>;
  readonly model3Path: string; // 외부 viewer 가 로드할 model3.json 경로 (relative)
  readonly textureRelPath: string; // FileReferences.Textures[0] 위치 (relative)
}

interface Model3Json {
  readonly Version: number;
  readonly FileReferences: {
    readonly Moc?: string;
    readonly Textures?: ReadonlyArray<string>;
  };
}

async function* walkFiles(dir: string): AsyncGenerator<string> {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkFiles(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

async function sha256OfFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const buf = await readFile(path);
  const sha256 = createHash("sha256").update(buf).digest("hex");
  return { sha256, bytes: buf.length };
}

export async function assembleThirdPartyBundle(
  input: ThirdPartyBundleInput,
): Promise<ThirdPartyBundleResult> {
  const runtimeAssets = join(input.presetDir, "runtime_assets");
  if (!existsSync(runtimeAssets)) {
    throw new Error(
      "third-party preset 인데 runtime_assets/ 가 없음: " +
        input.presetId +
        "@" +
        input.presetVersion,
    );
  }

  // 1. runtime_assets 통째로 outDir 로 복사 (recursive).
  await mkdir(input.outDir, { recursive: true });
  await cp(runtimeAssets, input.outDir, { recursive: true });

  // 2. model3.json 위치 + 그 안의 texture 경로 파악.
  const model3RelCandidates = [
    input.slug + ".model3.json",
    "model3.json",
  ];
  let model3Rel: string | null = null;
  for (const candidate of model3RelCandidates) {
    if (existsSync(join(input.outDir, candidate))) {
      model3Rel = candidate;
      break;
    }
  }
  if (!model3Rel) {
    throw new Error(
      "third-party preset 의 model3.json 을 못 찾음 (시도: " +
        model3RelCandidates.join(", ") +
        ")",
    );
  }
  const model3Abs = join(input.outDir, model3Rel);
  const model3 = JSON.parse(await readFile(model3Abs, "utf8")) as Model3Json;
  const texRel = model3.FileReferences.Textures?.[0];
  if (!texRel) {
    throw new Error("model3.json 에 FileReferences.Textures[0] 없음");
  }

  // 3. 사용자 texture 를 그 경로에 덮어쓰기 (원본 texture_00.png 교체).
  const textureDest = join(input.outDir, texRel);
  await mkdir(dirname(textureDest), { recursive: true });
  await copyFile(input.textureSrcPath, textureDest);

  // 4. 모든 파일 walk → bundle.json 매니페스트 작성. bundle.json 자체는 제외.
  const bundleJsonRel = "bundle.json";
  const files: BundleFile[] = [];
  for await (const abs of walkFiles(input.outDir)) {
    const rel = relative(input.outDir, abs).replace(/\\/g, "/");
    if (rel === bundleJsonRel) continue;
    const { sha256, bytes } = await sha256OfFile(abs);
    files.push({ path: rel, sha256, bytes });
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  // 5. bundle.json 작성. self-reference 회피.
  const manifest = {
    schema_version: "v1",
    kind: "cubism-bundle",
    format: 1,
    template_id: input.presetId,
    template_version: input.presetVersion,
    avatar_id: input.avatarId ?? null,
    files,
  };
  await writeFile(join(input.outDir, bundleJsonRel), JSON.stringify(manifest, null, 2) + "\n");

  return {
    outDir: input.outDir,
    files,
    model3Path: model3Rel,
    textureRelPath: texRel,
  };
}

export interface PresetOriginShape {
  readonly origin?: { readonly kind?: string };
}

export function isThirdPartyPreset(manifest: PresetOriginShape | null | undefined): boolean {
  return manifest?.origin?.kind === "third-party";
}
