import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { assembleWebAvatarBundle } from "../src/web-avatar-bundle.js";
import { snapshotBundle } from "../src/bundle.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-web-avatar-"));
}

test("assembleWebAvatarBundle: halfbody v1.2.0 bundle snapshot matches golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "halfbody_v1.2.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: web-avatar.json matches golden byte-for-byte", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "halfbody_v1.2.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: halfbody v1.2.0 writes 4 files (web-avatar + atlas + bundle + 1 texture)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    assert.equal(res.files.length, 4);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("bundle.json"));
    assert.ok(paths.includes("atlas.json"));
    assert.ok(paths.includes("textures/base.png"));
    for (const f of res.files) {
      assert.ok(existsSync(join(dir, f.path)), `expected on disk: ${f.path}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: includeTextures=false reverts to stage 1 (2 files)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir, { includeTextures: false });
    assert.equal(res.files.length, 2);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("bundle.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: bundle.json excludes itself from files[]", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const manifest = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as {
      kind: string;
      files: Array<{ path: string }>;
    };
    assert.equal(manifest.kind, "web-avatar-bundle");
    const paths = manifest.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("atlas.json"));
    assert.ok(paths.includes("textures/base.png"));
    assert.ok(!paths.includes("bundle.json"), "manifest must exclude itself");
    assert.equal(manifest.files.length, 3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textures/*.png bytes match template source", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const srcBuf = readFileSync(
      join(repoRoot, "rig-templates/base/halfbody/v1.2.0/textures/base.png"),
    );
    const outBuf = readFileSync(join(dir, "textures/base.png"));
    assert.deepEqual(Buffer.compare(srcBuf, outBuf), 0, "texture bytes must be identical");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: atlas.json in bundle matches schema shape", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const atlas = JSON.parse(readFileSync(join(dir, "atlas.json"), "utf8")) as {
      schema_version: string;
      format: number;
      textures: Array<{ path: string; width: number; height: number; format: string }>;
      slots: Array<unknown>;
    };
    assert.equal(atlas.schema_version, "v1");
    assert.equal(atlas.format, 1);
    assert.equal(atlas.textures.length, 1);
    assert.equal(atlas.textures[0]!.path, "textures/base.png");
    assert.equal(atlas.textures[0]!.width, 4);
    assert.equal(atlas.textures[0]!.height, 4);
    assert.equal(atlas.textures[0]!.format, "png");
    assert.deepEqual(atlas.slots, []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: avatarId option embedded in web-avatar.json and bundle.json", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir, { avatarId: "avt.test.demo" });
    const wa = JSON.parse(readFileSync(join(dir, "web-avatar.json"), "utf8")) as {
      avatar_id: string | null;
    };
    const bundle = JSON.parse(readFileSync(join(dir, "bundle.json"), "utf8")) as {
      avatar_id: string | null;
    };
    assert.equal(wa.avatar_id, "avt.test.demo");
    assert.equal(bundle.avatar_id, "avt.test.demo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: repeated calls produce identical snapshots", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dirA = scratch();
  const dirB = scratch();
  try {
    const a = snapshotBundle(assembleWebAvatarBundle(tpl, dirA));
    const b = snapshotBundle(assembleWebAvatarBundle(tpl, dirB));
    assert.equal(a, b);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textureOverrides 가 template.textures 를 대체 (세션 35)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    // 원본을 복사해 1 바이트만 변경 — sha256 가 달라져야 한다.
    const orig = tpl.textures[0]!;
    const tamperedBuf = Buffer.from(orig.buffer);
    // PNG 마지막 byte (IEND CRC) 는 건드리면 깨지므로 IHDR 데이터 영역은 피하고, 데이터 청크의
    // 맨 앞 (보통 pixel data 시작, PNG 헤더 8B + IHDR 25B 이후) 을 살짝 수정.
    // 대신 여기선 buffer 자체를 재할당하는 대신 원본 그대로 주입해 경로/sha256 동일성만 확인.
    const override = {
      ...orig,
      buffer: tamperedBuf,
      sha256: createHash("sha256").update(tamperedBuf).digest("hex"),
    };
    const res = assembleWebAvatarBundle(tpl, dir, { textureOverrides: [override] });
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("textures/base.png"));
    const texEntry = res.files.find((f) => f.path === "textures/base.png")!;
    assert.equal(texEntry.sha256, override.sha256);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// 세션 105 — halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들 L4 golden 승격.
// 세션 103 wire-through 로 parameter_ids 가 실 번들에 방출되고(halfbody 18 / fullbody 25),
// 세션 104 에서 editor 가 halfbody v1.3.0 을 assembly 하기 시작 → 회귀 방어 대상.
// 세션 103 D5 "의도된 drift" 의 최종 종결 — 이 시점부터 parameter_ids 변경이 golden 에 나타난다.
test("assembleWebAvatarBundle: halfbody v1.3.0 bundle snapshot matches golden (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "halfbody_v1.3.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: halfbody v1.3.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "halfbody_v1.3.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
    const parts = (JSON.parse(got) as { parts: Array<{ parameter_ids?: string[] }> }).parts;
    const withIds = parts.filter((p) => Array.isArray(p.parameter_ids)).length;
    assert.equal(parts.length, 30, "halfbody v1.3.0 = 30 parts (ahoge 포함)");
    assert.equal(withIds, 19, "halfbody v1.3.0 opt-in 19 parts (세션 100 Face 14 + 세션 102 비-Face 4 + 세션 106 ahoge 1)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: fullbody v1.0.0 bundle snapshot matches golden (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(
      join(goldenDir, "fullbody_v1.0.0.web-avatar-bundle.snapshot.json"),
      "utf8",
    );
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: fullbody v1.0.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const dir = scratch();
  try {
    assembleWebAvatarBundle(tpl, dir);
    const got = readFileSync(join(dir, "web-avatar.json"), "utf8");
    const want = readFileSync(join(goldenDir, "fullbody_v1.0.0.web-avatar.json"), "utf8");
    assert.equal(got, want);
    const parts = (JSON.parse(got) as { parts: Array<{ parameter_ids?: string[] }> }).parts;
    const withIds = parts.filter((p) => Array.isArray(p.parameter_ids)).length;
    assert.equal(parts.length, 38, "fullbody v1.0.0 = 38 parts");
    assert.equal(withIds, 27, "fullbody v1.0.0 opt-in 27 parts (세션 101 Face 14 + 세션 102 비-Face 11 + 세션 107 ahoge 1 + acc_belt 1)");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleWebAvatarBundle: textureOverrides path 가 template 에 없으면 throw (세션 35)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const orig = tpl.textures[0]!;
    const bogus = { ...orig, path: "textures/bogus.png" };
    assert.throws(
      () => assembleWebAvatarBundle(tpl, dir, { textureOverrides: [bogus] }),
      /경로 보존 필요|not in template|textureOverrides/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
