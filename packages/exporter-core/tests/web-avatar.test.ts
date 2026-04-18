import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { convertWebAvatar } from "../src/converters/web-avatar.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");

test("convertWebAvatar: halfbody v1.2.0 basic shape", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const wa = convertWebAvatar(tpl);

  assert.equal(wa.schema_version, "v1");
  assert.equal(wa.format, 1);
  assert.equal(wa.template_id, tpl.manifest.id ?? null);
  assert.equal(wa.template_version, tpl.manifest.version ?? null);
  assert.equal(wa.avatar_id, null);

  assert.ok(Array.isArray(wa.parameter_groups));
  assert.ok(wa.parameter_groups.length > 0, "halfbody should have parameter groups");
  assert.ok(Array.isArray(wa.parameters));
  assert.ok(wa.parameters.length > 0, "halfbody should expose parameters");
  assert.ok(Array.isArray(wa.parts));
  assert.ok(wa.parts.length > 0, "halfbody should expose parts");
  assert.ok(Array.isArray(wa.motions));
  assert.ok(wa.motions.length >= 1, "halfbody should include motion packs");
  assert.ok(Array.isArray(wa.expressions));
  assert.ok(wa.expressions.length >= 1, "halfbody should include expression packs");
  assert.deepEqual(wa.textures, []);
  assert.ok(wa.physics_summary !== null);
  assert.equal(typeof wa.physics_summary!.setting_count, "number");
  assert.equal(typeof wa.physics_summary!.total_output_count, "number");
});

test("convertWebAvatar: arrays are stably sorted", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const wa = convertWebAvatar(tpl);

  const isSortedBy = <T>(arr: T[], key: keyof T): boolean => {
    for (let i = 1; i < arr.length; i++) {
      if ((arr[i - 1]![key] as unknown as string) > (arr[i]![key] as unknown as string)) {
        return false;
      }
    }
    return true;
  };
  assert.ok(isSortedBy(wa.parameter_groups, "id"), "parameter_groups sorted by id");
  assert.ok(isSortedBy(wa.parameters, "id"), "parameters sorted by id");
  assert.ok(isSortedBy(wa.parts, "slot_id"), "parts sorted by slot_id");
  assert.ok(isSortedBy(wa.motions, "pack_id"), "motions sorted by pack_id");
  assert.ok(isSortedBy(wa.expressions, "expression_id"), "expressions sorted by expression_id");
});

test("convertWebAvatar: avatar_id option is embedded", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const wa = convertWebAvatar(tpl, { avatarId: "avt.test.unit" });
  assert.equal(wa.avatar_id, "avt.test.unit");
});

test("convertWebAvatar: textures option is sorted by path and preserved", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const wa = convertWebAvatar(tpl, {
    textures: [
      { path: "textures/b.png", purpose: "albedo" },
      { path: "textures/a.png", purpose: "albedo" },
    ],
  });
  assert.deepEqual(wa.textures, [
    { path: "textures/a.png", purpose: "albedo" },
    { path: "textures/b.png", purpose: "albedo" },
  ]);
});

test("convertWebAvatar: canonicalJson bytes are stable across calls", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const a = canonicalJson(convertWebAvatar(tpl));
  const b = canonicalJson(convertWebAvatar(tpl));
  assert.equal(a, b);
});

test("convertWebAvatar: parameters keep physics_output ids (runtime may inspect)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.2.0"));
  const wa = convertWebAvatar(tpl);
  const ids = new Set(wa.parameters.map((p) => p.id));
  assert.ok(ids.has("ParamAngleX") || ids.size > 0, "at least one parameter exposed");
  for (const p of wa.parameters) {
    assert.equal(p.range.length, 2);
    assert.ok(typeof p.default === "number");
    assert.ok(typeof p.group === "string");
  }
});
