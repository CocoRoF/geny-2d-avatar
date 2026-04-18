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

test("assembleWebAvatarBundle: writes exactly 2 files (web-avatar.json + bundle.json)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleWebAvatarBundle(tpl, dir);
    assert.equal(res.files.length, 2);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("web-avatar.json"));
    assert.ok(paths.includes("bundle.json"));
    for (const f of res.files) {
      assert.ok(existsSync(join(dir, f.path)), `expected on disk: ${f.path}`);
    }
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
    assert.ok(!paths.includes("bundle.json"), "manifest must exclude itself");
    assert.equal(manifest.files.length, 1);
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
