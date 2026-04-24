/**
 * `@geny/exporter-pipeline` — exporter-core + post-processing 를 PNG decode/encode 로
 * 연결하는 e2e 참조 구현 (세션 38).
 *
 * exporter-core 자체는 "bytes-only" 순수 층이라 이미지 디코딩 의존성이 없다. 세션 35 가
 * `assembleWebAvatarBundle` 에 `textureOverrides?` 훅을 열어 둔 이유가 여기에 있다 —
 * 호출자가 실제 PNG 파싱/인코딩을 책임진다. 본 패키지는 그 책임을 `pngjs` 로 구현하고,
 * post-processing 의 `applyAlphaSanitation` / 임의 transform 을 태운 뒤 훅으로 주입한다.
 *
 * 계약:
 *  - `decodePng(Buffer): ImageBuffer` — straight RGBA8, premultiplied=false.
 *  - `encodePng(ImageBuffer): Buffer` — 결정론적 (pngjs 는 동일 pixel 입력에 동일 바이트).
 *  - `runWebAvatarPipeline(tpl, outDir, { transform? })` —
 *      template.textures 전체를 decode → transform 실행 → encode → 원본 path 유지 →
 *      `assembleWebAvatarBundle` 호출. transform 생략 시 기본 `applyAlphaSanitation`.
 *
 * 결정론 가드:
 *  - `assembleWebAvatarBundle` 의 `textureOverrides` 검증 (세션 35): path 가 반드시
 *    `template.textures` 에 이미 존재해야 한다. 본 모듈이 만드는 `TemplateTextureFile`
 *    은 원본 `path` 를 그대로 유지하므로 가드를 통과.
 */

import { createHash } from "node:crypto";
import { PNG } from "pngjs";

import type { ImageBuffer } from "@geny/post-processing";
import {
  applyAlphaSanitation,
  createImageBuffer,
  type AlphaSanitationOptions,
} from "@geny/post-processing";
import {
  assembleWebAvatarBundle,
  type AssembleWebAvatarBundleOptions,
} from "@geny/exporter-core";
import type {
  BundleResult,
  Template,
  TemplateTextureFile,
} from "@geny/exporter-core";

/**
 * PNG Buffer → straight RGBA8 ImageBuffer.
 *
 * `pngjs` 는 8-bit RGBA 로 정규화해 `png.data` (Node Buffer) 에 left-to-right,
 * top-to-bottom 으로 채운다. 본 함수는 이를 `Uint8ClampedArray` 로 재포장한다.
 * premultiplied 플래그는 항상 `false` — PNG 표준이 straight alpha 이므로.
 */
export function decodePng(buffer: Buffer): ImageBuffer {
  const png = PNG.sync.read(buffer);
  // pngjs 의 data 는 Node Buffer. 별도 bytes 복사로 공유 메모리 참조를 끊어 둔다 — 이후
  // post-processing 이 in-place 변형을 하더라도 원본 PNG 파일 메모리에 영향 없음.
  const copy = new Uint8ClampedArray(png.data.byteLength);
  copy.set(png.data);
  return createImageBuffer(png.width, png.height, copy, false);
}

/**
 * ImageBuffer → PNG Buffer.
 *
 * `pngjs` 는 color=6 (RGBA), bit depth=8 로 고정 출력. Deflate 블록이 결정론적이므로
 * 동일 픽셀 입력에 동일 바이트가 나온다 (테스트 case C 가 이를 확인).
 */
export function encodePng(image: ImageBuffer): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.data.buffer, image.data.byteOffset, image.data.byteLength);
  return PNG.sync.write(png);
}

/**
 * template.textures 의 한 항목을 decode 한 뒤 임의 transform 을 태우고 재인코딩해
 * 번들 주입용 `TemplateTextureFile` 을 만든다.
 *
 * 반환 항목의 `path` 는 원본과 동일 — `assembleWebAvatarBundle` 의 경로 보존 가드를 통과.
 * `width/height` 는 transform 이 변경했을 가능성을 반영해 결과 이미지 기준으로 채운다
 * (uvClip 이 차원을 바꿀 수는 없으나 미래 transform 을 위한 안전망).
 */
export function buildTextureOverride(
  src: TemplateTextureFile,
  transform: (img: ImageBuffer) => ImageBuffer,
): TemplateTextureFile {
  const decoded = decodePng(src.buffer);
  const transformed = transform(decoded);
  const encoded = encodePng(transformed);
  const sha256 = createHash("sha256").update(encoded).digest("hex");
  return {
    path: src.path,
    absPath: src.absPath,
    width: transformed.width,
    height: transformed.height,
    format: src.format,
    bytes: encoded.byteLength,
    sha256,
    buffer: encoded,
  };
}

export interface RunWebAvatarPipelineOptions {
  /**
   * 각 텍스처에 적용할 변형. 생략하면 `applyAlphaSanitation(opts.sanitation ?? {})` 를
   * 기본으로 쓴다 — 세션 35 Stage 1 기본 동작.
   */
  transform?: (image: ImageBuffer) => ImageBuffer;
  /** `transform` 이 없을 때 기본 sanitation 에 전달할 옵션. */
  sanitation?: AlphaSanitationOptions;
  /** `assembleWebAvatarBundle` 에 추가로 전달할 옵션. `textureOverrides` 는 강제로 본 pipeline 이 채운다. */
  bundle?: Omit<AssembleWebAvatarBundleOptions, "textureOverrides">;
}

/**
 * e2e 실행 — `template.textures` 를 decode → transform → encode 후
 * `assembleWebAvatarBundle` 에 textureOverrides 로 주입.
 *
 * 텍스처가 없는 템플릿은 변환 없이 그대로 bundle 만 생성 (훅 자체를 꽂지 않음).
 */
export function runWebAvatarPipeline(
  template: Template,
  outDir: string,
  opts: RunWebAvatarPipelineOptions = {},
): BundleResult {
  const transform =
    opts.transform ??
    ((img: ImageBuffer): ImageBuffer =>
      applyAlphaSanitation(img, opts.sanitation ?? {}).image);

  const bundleOpts: AssembleWebAvatarBundleOptions = { ...(opts.bundle ?? {}) };
  if (template.textures.length > 0) {
    const overrides = template.textures.map((t) => buildTextureOverride(t, transform));
    bundleOpts.textureOverrides = overrides;
  }
  return assembleWebAvatarBundle(template, outDir, bundleOpts);
}
