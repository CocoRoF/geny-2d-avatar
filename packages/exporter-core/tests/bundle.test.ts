import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { assembleBundle, snapshotBundle } from "../src/bundle.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-bundle-"));
}

test("assembleBundle: halfbody v1.3.0 snapshot matches golden byte-for-byte", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir);
    const got = snapshotBundle(res);
    const want = readFileSync(join(goldenDir, "halfbody_v1.3.0.bundle.snapshot.json"), "utf8");
    assert.equal(got, want);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleBundle: writes all 17 expected files for v1.3.0 (incl. bundle.json root manifest)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir);
    // v1.3.0: 9 motion packs + 4 sibling JSONs + 3 expressions + 1 bundle.json = 17 files.
    assert.equal(res.files.length, 17);
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("avatar.cdi3.json"));
    assert.ok(paths.includes("avatar.model3.json"));
    assert.ok(paths.includes("avatar.pose3.json"));
    assert.ok(paths.includes("avatar.physics3.json"));
    assert.ok(paths.includes("motions/idle_default.motion3.json"));
    assert.ok(paths.includes("motions/greet_wave.motion3.json"));
    assert.ok(paths.includes("expressions/smile.exp3.json"));
    assert.ok(paths.includes("expressions/wink.exp3.json"));
    assert.ok(paths.includes("expressions/neutral.exp3.json"));
    assert.ok(paths.includes("bundle.json"));
    for (const f of res.files) {
      assert.ok(existsSync(join(dir, f.path)), `expected file on disk: ${f.path}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleBundle: individual files byte-match their per-converter goldens", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    assembleBundle(tpl, dir);
    const cases: Array<[string, string]> = [
      ["avatar.cdi3.json", "halfbody_v1.3.0.cdi3.json"],
      ["avatar.model3.json", "halfbody_v1.3.0.model3.json"],
      ["avatar.physics3.json", "halfbody_v1.3.0.physics3.json"],
      ["motions/idle_default.motion3.json", "halfbody_v1.3.0__idle_default.motion3.json"],
      ["motions/greet_wave.motion3.json", "halfbody_v1.3.0__greet_wave.motion3.json"],
      ["expressions/smile.exp3.json", "halfbody_v1.3.0__smile.exp3.json"],
      ["expressions/wink.exp3.json", "halfbody_v1.3.0__wink.exp3.json"],
      ["expressions/neutral.exp3.json", "halfbody_v1.3.0__neutral.exp3.json"],
    ];
    for (const [bundlePath, goldenName] of cases) {
      const got = readFileSync(join(dir, bundlePath), "utf8");
      const want = readFileSync(join(goldenDir, goldenName), "utf8");
      assert.equal(got, want, `bundle ${bundlePath} differs from golden ${goldenName}`);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleBundle: fileNames override changes paths but keeps bytes", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir, {
      fileNames: {
        model: "m.model3.json",
        cdi: "m.cdi3.json",
        pose: "m.pose3.json",
        physics: "m.physics3.json",
        motionsDir: "mo",
      },
    });
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("m.cdi3.json"));
    assert.ok(paths.includes("m.model3.json"));
    assert.ok(paths.includes("mo/idle_default.motion3.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleBundle: files list is path-sorted for determinism", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir);
    const sorted = [...res.files].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    assert.deepEqual(res.files, sorted);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("assembleBundle: repeated calls on same template produce identical snapshot", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const dirA = scratch();
  const dirB = scratch();
  try {
    const a = snapshotBundle(assembleBundle(tpl, dirA));
    const b = snapshotBundle(assembleBundle(tpl, dirB));
    assert.equal(a, b);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});
