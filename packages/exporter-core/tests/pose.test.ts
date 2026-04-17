import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "../src/loader.js";
import { convertPose, convertPoseFromTemplate } from "../src/converters/pose.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
// dist/tests/pose.test.js → ../../.. to reach repo root.
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function template(version: string): string {
  return resolve(repoRoot, "rig-templates", "base", "halfbody", version);
}

test("pose3: halfbody v1.1.0 matches golden byte-for-byte", () => {
  const tpl = loadTemplate(template("v1.1.0"));
  const got = canonicalJson(convertPoseFromTemplate(tpl));
  const want = readFileSync(resolve(goldenDir, "halfbody_v1.1.0.pose3.json"), "utf8");
  assert.equal(got, want);
});

test("pose3: halfbody v1.2.0 matches golden byte-for-byte", () => {
  const tpl = loadTemplate(template("v1.2.0"));
  const got = canonicalJson(convertPoseFromTemplate(tpl));
  const want = readFileSync(resolve(goldenDir, "halfbody_v1.2.0.pose3.json"), "utf8");
  assert.equal(got, want);
});

test("pose3: throws when slot_id not in parts/", () => {
  assert.throws(
    () =>
      convertPose({
        pose: {
          schema_version: "v1",
          format: 3,
          type: "live2d_pose",
          fade_in_time: 0.5,
          groups: [[{ slot_id: "nonexistent", link: [] }]],
        },
        partsById: {},
      }),
    /not found in parts/,
  );
});

test("pose3: injects default FadeInTime 0.5 when pose.json omits it", () => {
  const out = convertPose({
    pose: {
      schema_version: "v1",
      format: 3,
      type: "live2d_pose",
      groups: [
        [
          { slot_id: "a", link: [] },
          { slot_id: "b", link: [] },
        ],
      ],
    },
    partsById: {
      a: { schema_version: "v1", slot_id: "a", role: "x", cubism_part_id: "PartA" },
      b: { schema_version: "v1", slot_id: "b", role: "x", cubism_part_id: "PartB" },
    },
  });
  assert.equal(out.FadeInTime, 0.5);
});

test("pose3: Link resolves linked slot_ids to their cubism_part_id", () => {
  const out = convertPose({
    pose: {
      schema_version: "v1",
      format: 3,
      type: "live2d_pose",
      fade_in_time: 0.5,
      groups: [[{ slot_id: "a", link: ["b"] }]],
    },
    partsById: {
      a: { schema_version: "v1", slot_id: "a", role: "x", cubism_part_id: "PartA" },
      b: { schema_version: "v1", slot_id: "b", role: "x", cubism_part_id: "PartB" },
    },
  });
  assert.deepEqual(out.Groups[0]![0], { Id: "PartA", Link: ["PartB"] });
});

test("pose3: preserves group order (mutex priority matters)", () => {
  const out = convertPose({
    pose: {
      schema_version: "v1",
      format: 3,
      type: "live2d_pose",
      fade_in_time: 0.5,
      groups: [
        [
          { slot_id: "z", link: [] },
          { slot_id: "a", link: [] },
        ],
      ],
    },
    partsById: {
      a: { schema_version: "v1", slot_id: "a", role: "x", cubism_part_id: "PartA" },
      z: { schema_version: "v1", slot_id: "z", role: "x", cubism_part_id: "PartZ" },
    },
  });
  assert.deepEqual(
    out.Groups[0]!.map((g) => g.Id),
    ["PartZ", "PartA"],
  );
});
