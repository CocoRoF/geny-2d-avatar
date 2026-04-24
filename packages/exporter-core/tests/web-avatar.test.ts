import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadTemplate } from "../src/loader.js";
import { convertWebAvatar } from "../src/converters/web-avatar.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");

test("convertWebAvatar: halfbody v1.3.0 basic shape", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
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
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
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
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const wa = convertWebAvatar(tpl, { avatarId: "avt.test.unit" });
  assert.equal(wa.avatar_id, "avt.test.unit");
});

test("convertWebAvatar: textures option is sorted by path and preserved", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const wa = convertWebAvatar(tpl, {
    textures: [
      {
        path: "textures/b.png",
        purpose: "albedo",
        width: 8,
        height: 8,
        bytes: 100,
        sha256: "b".repeat(64),
      },
      {
        path: "textures/a.png",
        purpose: "albedo",
        width: 4,
        height: 4,
        bytes: 64,
        sha256: "a".repeat(64),
      },
    ],
  });
  assert.equal(wa.textures.length, 2);
  assert.equal(wa.textures[0]!.path, "textures/a.png");
  assert.equal(wa.textures[1]!.path, "textures/b.png");
  assert.equal(wa.textures[0]!.width, 4);
  assert.equal(wa.textures[1]!.bytes, 100);
});

test("convertWebAvatar: atlas option passed through when provided", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const atlasRef = { path: "atlas.json" as const, sha256: "f".repeat(64) };
  const wa = convertWebAvatar(tpl, { atlas: atlasRef });
  assert.deepEqual(wa.atlas, atlasRef);
});

test("convertWebAvatar: default atlas is null (opts.atlas omitted)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const wa = convertWebAvatar(tpl);
  assert.equal(wa.atlas, null);
  assert.deepEqual(wa.textures, []);
});

test("convertWebAvatar: canonicalJson bytes are stable across calls", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const a = canonicalJson(convertWebAvatar(tpl));
  const b = canonicalJson(convertWebAvatar(tpl));
  assert.equal(a, b);
});

test("convertWebAvatar: parameters keep physics_output ids (runtime may inspect)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const wa = convertWebAvatar(tpl);
  const ids = new Set(wa.parameters.map((p) => p.id));
  assert.ok(ids.has("ParamAngleX") || ids.size > 0, "at least one parameter exposed");
  for (const p of wa.parameters) {
    assert.equal(p.range.length, 2);
    assert.ok(typeof p.default === "number");
    assert.ok(typeof p.group === "string");
  }
});

test("convertWebAvatar: part.parameter_ids 가 spec 에 있으면 번들로 전파 (세션 103)", () => {
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/fullbody/v1.0.0"));
  const wa = convertWebAvatar(tpl);
  const legL = wa.parts.find((p) => p.slot_id === "leg_l");
  assert.ok(legL, "fullbody should expose leg_l");
  assert.deepEqual(legL!.parameter_ids, ["leg_l_angle", "leg_sway_l"]);
  const footL = wa.parts.find((p) => p.slot_id === "foot_l");
  assert.deepEqual(footL!.parameter_ids, ["foot_l_angle"]);
  const withIds = wa.parts.filter((p) => Array.isArray(p.parameter_ids));
  assert.equal(withIds.length, 27, "fullbody v1.0.0 has 27 parts with parameter_ids post-세션107 (+ahoge +acc_belt)");
});

test("convertWebAvatar: spec 에 parameter_ids 없으면 번들에서 생략 (세션 103)", () => {
  // P0.3.2 — 구 assertion 은 halfbody v1.2.0 (parameter_ids 全 부재) 기준이었음.
  // v1.3.0 Face 14 파츠는 parameter_ids 를 갖고, 나머지는 여전히 부재 →
  // "없으면 생략" 의 본 의도는 부재 파츠 표본에서 확인.
  const tpl = loadTemplate(join(repoRoot, "rig-templates/base/halfbody/v1.3.0"));
  const wa = convertWebAvatar(tpl);
  const withoutIds = wa.parts.filter((p) => p.parameter_ids === undefined);
  assert.ok(withoutIds.length > 0, "at least one part without parameter_ids expected");
  for (const p of withoutIds) {
    assert.equal(p.parameter_ids, undefined, `${p.slot_id} should retain undefined parameter_ids`);
  }
});
