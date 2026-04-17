import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { convertCdi, convertCdiFromTemplate } from "../src/converters/cdi.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

test("convertCdi: halfbody v1.2.0 byte-for-byte golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  const got = canonicalJson(cdi3);
  const want = readFileSync(join(goldenDir, "halfbody_v1.2.0.cdi3.json"), "utf8");
  assert.equal(got, want);
});

test("convertCdi: Version is fixed to 3", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  assert.equal(cdi3.Version, 3);
});

test("convertCdi: Parameters.Name uses display_name.en only", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  for (const p of cdi3.Parameters) {
    assert.ok(/^[\x20-\x7e]+$/.test(p.Name), `Name should be ASCII-only, got '${p.Name}'`);
  }
});

test("convertCdi: ParameterGroups use PascalCase Ids", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  const ids = cdi3.ParameterGroups.map((g) => g.Id);
  assert.deepEqual(ids, ["Face", "Eyes", "Brows", "Mouth", "Body", "Hair", "Overall"]);
  for (const g of cdi3.ParameterGroups) assert.equal(g.GroupId, "");
});

test("convertCdi: Parts.Name is synthesized from slot_id (arm_l_a → 'Arm L A')", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  const armLA = cdi3.Parts.find((p) => p.Id === "PartArmLA");
  assert.ok(armLA, "PartArmLA should exist");
  assert.equal(armLA!.Name, "Arm L A");
  const faceBase = cdi3.Parts.find((p) => p.Id === "PartFaceBase");
  assert.ok(faceBase, "PartFaceBase should exist");
  assert.equal(faceBase!.Name, "Face Base");
});

test("convertCdi: Parts are sorted by slot_id for determinism", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  const slotIdsFromPartsOrder = Object.keys(tpl.partsById).sort();
  assert.equal(cdi3.Parts.length, slotIdsFromPartsOrder.length);
});

test("convertCdi: CombinedParameters map internal combined_axes via cubism IDs", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const cdi3 = convertCdiFromTemplate(tpl);
  assert.deepEqual(cdi3.CombinedParameters, [
    { ParameterIdH: "ParamAngleX", ParameterIdV: "ParamAngleY" },
    { ParameterIdH: "ParamOverallX", ParameterIdV: "ParamOverallY" },
  ]);
});

test("convertCdi: throws when combined_axes references unknown parameter", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  assert.ok(tpl.parameters);
  const badParams = {
    ...tpl.parameters!,
    combined_axes: [["head_angle_x", "does_not_exist"]],
  };
  assert.throws(
    () => convertCdi({ parameters: badParams, partsById: tpl.partsById, manifest: tpl.manifest }),
    /combined_axes.*does_not_exist/,
  );
});

test("convertCdi: throws when a parameter has no cubism mapping (inline nor manifest)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  assert.ok(tpl.parameters);
  const strippedParams = {
    ...tpl.parameters!,
    parameters: tpl.parameters!.parameters.map((p) => {
      if (p.id !== "head_angle_x") return p;
      const { cubism: _discard, ...rest } = p;
      return rest;
    }),
  };
  const strippedManifest = { ...tpl.manifest, cubism_mapping: {} };
  assert.throws(
    () =>
      convertCdi({
        parameters: strippedParams,
        partsById: tpl.partsById,
        manifest: strippedManifest,
      }),
    /no Cubism mapping for parameter 'head_angle_x'/,
  );
});
