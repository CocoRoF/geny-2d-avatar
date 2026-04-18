import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
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
