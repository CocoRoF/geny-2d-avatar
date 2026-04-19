import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTemplate } from "@geny/exporter-core";
import { createImageBuffer, type ImageBuffer } from "@geny/post-processing";

import {
  buildTextureOverride,
  decodePng,
  encodePng,
  runWebAvatarPipeline,
} from "../src/index.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const templateDir = resolve(
  repoRoot,
  "rig-templates",
  "base",
  "halfbody",
  "v1.2.0",
);

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-pipeline-"));
}

function makeCheckerImage(): ImageBuffer {
  const w = 4;
  const h = 4;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const checker = (x + y) % 2 === 0;
      data[i] = checker ? 200 : 40;
      data[i + 1] = checker ? 100 : 150;
      data[i + 2] = checker ? 50 : 210;
      data[i + 3] = checker ? 255 : 128;
    }
  }
  return createImageBuffer(w, h, data, false);
}

test("decodePng / encodePng: round-trip preserves pixels", () => {
  const img = makeCheckerImage();
  const png = encodePng(img);
  const back = decodePng(png);
  assert.equal(back.width, img.width);
  assert.equal(back.height, img.height);
  assert.equal(back.premultiplied, false);
  assert.deepEqual(
    Array.from(back.data),
    Array.from(img.data),
    "모든 픽셀이 동일하게 복원",
  );
});

test("encodePng is deterministic (same pixels → same bytes)", () => {
  const img = makeCheckerImage();
  const a = encodePng(img);
  const b = encodePng(img);
  assert.equal(a.byteLength, b.byteLength);
  assert.ok(a.equals(b), "pngjs 결정론: 동일 입력 → 동일 바이트");
});

test("decodePng handles real template PNG (halfbody/v1.2.0/textures/base.png)", () => {
  const buf = readFileSync(join(templateDir, "textures", "base.png"));
  const img = decodePng(buf);
  assert.ok(img.width > 0);
  assert.ok(img.height > 0);
  assert.equal(img.data.length, img.width * img.height * 4);
  assert.equal(img.premultiplied, false);
});

test("buildTextureOverride preserves path + recomputes sha256/bytes", () => {
  const tpl = loadTemplate(templateDir);
  assert.ok(tpl.textures.length > 0, "templates/v1.2.0 는 base.png 를 포함");
  const src = tpl.textures[0]!;
  const identity = (img: ImageBuffer): ImageBuffer => img;
  const out = buildTextureOverride(src, identity);
  assert.equal(out.path, src.path, "path 는 원본 유지 (훅 가드 통과)");
  assert.equal(out.format, src.format);
  // identity transform 이어도 pngjs 재인코딩은 원본과 다른 바이트를 낼 수 있음 —
  // 중요한 것은 sha256 과 bytes 가 _실제 출력_ 과 일치하는지.
  assert.equal(out.bytes, out.buffer.byteLength);
  assert.equal(
    out.sha256.length,
    64,
    "sha256 은 hex 64자",
  );
  // 동일 재결과 (결정론).
  const out2 = buildTextureOverride(src, identity);
  assert.equal(out.sha256, out2.sha256);
});

test("runWebAvatarPipeline (default: applyAlphaSanitation) emits bundle + sanitized texture", () => {
  const tpl = loadTemplate(templateDir);
  const outDir = scratch();
  try {
    const res = runWebAvatarPipeline(tpl, outDir);
    const bundleJson = JSON.parse(
      readFileSync(join(outDir, "bundle.json"), "utf8"),
    );
    assert.equal(bundleJson.kind, "web-avatar-bundle");
    const textureEntry = bundleJson.files.find(
      (f: { path: string }) => f.path === tpl.textures[0]!.path,
    );
    assert.ok(textureEntry, "원본 path 가 그대로 번들에 등록");
    // exporter-core 가 작성한 result.files 에도 동일 path 가 존재.
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes(tpl.textures[0]!.path));
    assert.ok(paths.includes("bundle.json"));
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("atlas.json"));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("runWebAvatarPipeline: custom transform is invoked on each texture", () => {
  const tpl = loadTemplate(templateDir);
  const outDir = scratch();
  try {
    let calls = 0;
    const res = runWebAvatarPipeline(tpl, outDir, {
      transform: (img) => {
        calls++;
        return img;
      },
    });
    assert.equal(calls, tpl.textures.length, "모든 텍스처가 훅을 거침");
    assert.ok(res.files.length > 0);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

test("runWebAvatarPipeline: determinism (same input → same bundle sha256s)", () => {
  const tpl = loadTemplate(templateDir);
  const a = scratch();
  const b = scratch();
  try {
    const ra = runWebAvatarPipeline(tpl, a);
    const rb = runWebAvatarPipeline(tpl, b);
    const sortByPath = <T extends { path: string }>(xs: readonly T[]) =>
      [...xs].sort((x, y) => (x.path < y.path ? -1 : x.path > y.path ? 1 : 0));
    const fa = sortByPath(ra.files);
    const fb = sortByPath(rb.files);
    assert.equal(fa.length, fb.length);
    for (let i = 0; i < fa.length; i++) {
      assert.equal(fa[i]!.path, fb[i]!.path);
      assert.equal(fa[i]!.sha256, fb[i]!.sha256, `${fa[i]!.path} sha256 결정론`);
      assert.equal(fa[i]!.bytes, fb[i]!.bytes);
    }
  } finally {
    rmSync(a, { recursive: true, force: true });
    rmSync(b, { recursive: true, force: true });
  }
});

test("runWebAvatarPipeline: textureOverrides guard (path 보존) 통과", () => {
  // transform 이 이미지를 바꿔도 path 는 동일 — 가드 통과 확인.
  const tpl = loadTemplate(templateDir);
  const outDir = scratch();
  try {
    // alpha 를 전부 0 으로 만드는 파괴적 transform — 픽셀은 바뀌어도 path 는 보존.
    const res = runWebAvatarPipeline(tpl, outDir, {
      transform: (img) => {
        const d = new Uint8ClampedArray(img.data);
        for (let i = 3; i < d.length; i += 4) d[i] = 0;
        return createImageBuffer(img.width, img.height, d, img.premultiplied);
      },
    });
    const p = tpl.textures[0]!.path;
    assert.ok(res.files.some((f) => f.path === p));
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});
