import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import {
  assembleBundle,
  type BundleManifestJson,
} from "../src/bundle.js";
import {
  assembleAvatarBundle,
  readAvatarExportSpec,
} from "../src/avatar-bundle.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const samplesDir = resolve(repoRoot, "samples", "avatars");

function scratch(): string {
  return mkdtempSync(join(tmpdir(), "geny-manifest-"));
}

function readManifest(dir: string, name = "bundle.json"): BundleManifestJson {
  return JSON.parse(readFileSync(join(dir, name), "utf8")) as BundleManifestJson;
}

test("bundle.json: kind='cubism-bundle', format=1, schema_version='v1'", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleBundle(tpl, dir);
    const m = readManifest(dir);
    assert.equal(m.kind, "cubism-bundle");
    assert.equal(m.format, 1);
    assert.equal(m.schema_version, "v1");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: template_id / template_version come from manifest; avatar_id=null for template-only bundle", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleBundle(tpl, dir);
    const m = readManifest(dir);
    assert.equal(m.template_id, "tpl.base.v1.halfbody");
    assert.equal(m.template_version, "1.2.0");
    assert.equal(m.avatar_id, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: files list excludes self and is path-sorted", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir);
    const m = readManifest(dir);
    assert.equal(m.files.length, res.files.length - 1);
    assert.ok(!m.files.some((f) => f.path === "bundle.json"));
    const sorted = [...m.files].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    );
    assert.deepEqual(m.files, sorted);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: each file entry in manifest matches BundleResult entry (sha256 + bytes)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir);
    const m = readManifest(dir);
    for (const manifestEntry of m.files) {
      const resEntry = res.files.find((f) => f.path === manifestEntry.path);
      assert.ok(resEntry, `manifest references unknown file ${manifestEntry.path}`);
      assert.equal(manifestEntry.sha256, resEntry!.sha256);
      assert.equal(manifestEntry.bytes, resEntry!.bytes);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: avatarId option propagates into avatar_id field", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    assembleBundle(tpl, dir, { avatarId: "av_01HXYZABCDEFGHJKMNPQRSTVWX" });
    const m = readManifest(dir);
    assert.equal(m.avatar_id, "av_01HXYZABCDEFGHJKMNPQRSTVWX");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: assembleAvatarBundle injects spec.avatar_id", () => {
  const spec = readAvatarExportSpec(join(samplesDir, "sample-01-aria.export.json"));
  const rigTemplatesRoot = resolve(repoRoot, "rig-templates");
  const dir = scratch();
  try {
    assembleAvatarBundle(spec, rigTemplatesRoot, dir);
    const m = readManifest(dir);
    assert.equal(m.avatar_id, spec.avatar_id);
    assert.equal(m.template_id, spec.template_id);
    assert.equal(m.template_version, spec.template_version);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: fileNames.manifest override renames the manifest file", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dir = scratch();
  try {
    const res = assembleBundle(tpl, dir, { fileNames: { manifest: "MANIFEST.json" } });
    const paths = res.files.map((f) => f.path);
    assert.ok(paths.includes("MANIFEST.json"));
    assert.ok(!paths.includes("bundle.json"));
    const m = readManifest(dir, "MANIFEST.json");
    assert.ok(!m.files.some((f) => f.path === "MANIFEST.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle.json: repeated calls produce identical manifest bytes (determinism)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const dirA = scratch();
  const dirB = scratch();
  try {
    assembleBundle(tpl, dirA);
    assembleBundle(tpl, dirB);
    const a = readFileSync(join(dirA, "bundle.json"), "utf8");
    const b = readFileSync(join(dirB, "bundle.json"), "utf8");
    assert.equal(a, b);
  } finally {
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
  }
});
