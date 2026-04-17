import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { convertModel, convertModelFromTemplate, packSlug } from "../src/converters/model.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

test("convertModel: halfbody v1.2.0 byte-for-byte golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl);
  const got = canonicalJson(model3);
  const want = readFileSync(join(goldenDir, "halfbody_v1.2.0.model3.json"), "utf8");
  assert.equal(got, want);
});

test("convertModel: Groups.EyeBlink uses both eye_open_l/r", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl);
  const eye = model3.Groups.find((g) => g.Name === "EyeBlink");
  assert.ok(eye, "EyeBlink group must exist");
  assert.deepEqual(eye!.Ids, ["ParamEyeLOpen", "ParamEyeROpen"]);
  assert.equal(eye!.Target, "Parameter");
});

test("convertModel: Groups.LipSync simple mode uses only ParamA", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl);
  const lip = model3.Groups.find((g) => g.Name === "LipSync");
  assert.ok(lip, "LipSync group must exist");
  assert.deepEqual(lip!.Ids, ["ParamA"]);
});

test("convertModel: Groups.LipSync precise mode has all 5 vowels", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl, { lipsync: "precise" });
  const lip = model3.Groups.find((g) => g.Name === "LipSync");
  assert.ok(lip, "LipSync group must exist");
  assert.deepEqual(lip!.Ids, ["ParamA", "ParamI", "ParamU", "ParamE", "ParamO"]);
});

test("convertModel: HitAreas from manifest with PascalCase roles", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl);
  assert.deepEqual(model3.HitAreas, [
    { Id: "HitAreaHead", Name: "Head" },
    { Id: "HitAreaBody", Name: "Body" },
  ]);
});

test("convertModel: FileReferences default Moc/Textures are placeholders, overridable", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const def = convertModelFromTemplate(tpl);
  assert.equal(def.FileReferences.Moc, "avatar.moc3");
  assert.deepEqual(def.FileReferences.Textures, ["textures/texture_00.png"]);

  const over = convertModelFromTemplate(tpl, {
    mocPath: "real.moc3",
    texturePaths: ["textures/tex_a.png", "textures/tex_b.png"],
  });
  assert.equal(over.FileReferences.Moc, "real.moc3");
  assert.deepEqual(over.FileReferences.Textures, ["textures/tex_a.png", "textures/tex_b.png"]);
});

test("convertModel: motion file paths follow <motionsDir>/<pack_slug>.motion3.json", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModelFromTemplate(tpl);
  const idle = model3.FileReferences.Motions?.["Idle"];
  assert.ok(idle, "Idle motion group must exist");
  const files = idle!.map((m) => m.File).sort();
  assert.deepEqual(files, ["motions/idle_default.motion3.json", "motions/idle_sleepy.motion3.json"]);
});

test("convertModel: empty motions produces no Motions field", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const model3 = convertModel({
    manifest: tpl.manifest,
    parameters: tpl.parameters,
    motions: {},
  });
  assert.equal(model3.FileReferences.Motions, undefined);
});

test("convertModel: no parameters doc → empty Groups", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const manifestNoMapping = { ...tpl.manifest, cubism_mapping: {} };
  const model3 = convertModel({
    manifest: manifestNoMapping,
    parameters: null,
    motions: {},
  });
  assert.deepEqual(model3.Groups, []);
});

test("packSlug: '.' → '_', lowercase", () => {
  assert.equal(packSlug("idle.default"), "idle_default");
  assert.equal(packSlug("GREET.WAVE"), "greet_wave");
});
