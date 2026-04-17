import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import {
  convertExpression,
  convertExpressionFromTemplate,
  expressionSlug,
} from "../src/converters/expression.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

test("convertExpression: halfbody v1.2.0 smile byte-for-byte golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const exp3 = convertExpressionFromTemplate(tpl, "expression.smile");
  const got = canonicalJson(exp3);
  const want = readFileSync(join(goldenDir, "halfbody_v1.2.0__smile.exp3.json"), "utf8");
  assert.equal(got, want);
});

test("convertExpression: halfbody v1.2.0 wink byte-for-byte golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const exp3 = convertExpressionFromTemplate(tpl, "expression.wink");
  const got = canonicalJson(exp3);
  const want = readFileSync(join(goldenDir, "halfbody_v1.2.0__wink.exp3.json"), "utf8");
  assert.equal(got, want);
});

test("convertExpression: halfbody v1.2.0 neutral byte-for-byte golden", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const exp3 = convertExpressionFromTemplate(tpl, "expression.neutral");
  const got = canonicalJson(exp3);
  const want = readFileSync(join(goldenDir, "halfbody_v1.2.0__neutral.exp3.json"), "utf8");
  assert.equal(got, want);
});

test("convertExpression: Type is 'Live2D Expression' and fade defaults to 0.5s", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const exp3 = convertExpressionFromTemplate(tpl, "expression.smile");
  assert.equal(exp3.Type, "Live2D Expression");
  assert.equal(exp3.FadeInTime, 0.5);
  assert.equal(exp3.FadeOutTime, 0.5);
});

test("convertExpression: Parameters preserve source blends order (determinism)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const exp3 = convertExpressionFromTemplate(tpl, "expression.smile");
  assert.deepEqual(
    exp3.Parameters.map((p) => p.Id),
    ["ParamEyeLSmile", "ParamEyeRSmile", "ParamMouthUp", "ParamBrowLY", "ParamBrowRY"],
  );
});

test("convertExpression: supports Add / Multiply / Overwrite blends", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const smile = convertExpressionFromTemplate(tpl, "expression.smile");
  assert.ok(smile.Parameters.every((p) => p.Blend === "Add"));
  const wink = convertExpressionFromTemplate(tpl, "expression.wink");
  assert.ok(wink.Parameters.some((p) => p.Blend === "Multiply"));
  const neutral = convertExpressionFromTemplate(tpl, "expression.neutral");
  assert.ok(neutral.Parameters.every((p) => p.Blend === "Overwrite"));
});

test("convertExpression: throws on missing Cubism mapping for target_id", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  assert.throws(
    () =>
      convertExpression({
        pack: {
          schema_version: "v1",
          expression_id: "expression.ghost",
          version: "1.0.0",
          name: { en: "Ghost" },
          blends: [{ target_id: "does_not_exist", value: 1, blend: "Add" }],
        },
        manifest: { ...tpl.manifest, cubism_mapping: {} },
        parameters: null,
      }),
    /no Cubism mapping/,
  );
});

test("convertExpression: throws on duplicate target_id in same pack", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  assert.throws(
    () =>
      convertExpression({
        pack: {
          schema_version: "v1",
          expression_id: "expression.dup",
          version: "1.0.0",
          name: { en: "Dup" },
          blends: [
            { target_id: "mouth_up", value: 1, blend: "Add" },
            { target_id: "mouth_up", value: 0.5, blend: "Add" },
          ],
        },
        manifest: tpl.manifest,
        parameters: tpl.parameters,
      }),
    /duplicate target_id/,
  );
});

test("convertExpressionFromTemplate: throws on unknown expression_id", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  assert.throws(
    () => convertExpressionFromTemplate(tpl, "expression.nope"),
    /not in template/,
  );
});

test("expressionSlug: strips 'expression.' prefix and lowercases nested dots", () => {
  assert.equal(expressionSlug("expression.smile"), "smile");
  assert.equal(expressionSlug("expression.big.smile"), "big_smile");
  assert.equal(expressionSlug("expression.SOFT_WINK"), "soft_wink");
  assert.throws(() => expressionSlug("bad-id"), /malformed/);
});
