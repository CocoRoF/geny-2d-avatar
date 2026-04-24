import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "../src/loader.js";
import {
  convertMotion,
  convertMotionFromTemplate,
} from "../src/converters/motion.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function template(version: string): string {
  return resolve(repoRoot, "rig-templates", "base", "halfbody", version);
}

test("motion3: halfbody v1.3.0 idle.default matches golden byte-for-byte", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const got = canonicalJson(convertMotionFromTemplate(tpl, "idle.default"));
  const want = readFileSync(
    resolve(goldenDir, "halfbody_v1.3.0__idle_default.motion3.json"),
    "utf8",
  );
  assert.equal(got, want);
});

test("motion3: halfbody v1.3.0 greet.wave matches golden byte-for-byte", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const got = canonicalJson(convertMotionFromTemplate(tpl, "greet.wave"));
  const want = readFileSync(
    resolve(goldenDir, "halfbody_v1.3.0__greet_wave.motion3.json"),
    "utf8",
  );
  assert.equal(got, want);
});

test("motion3: throws on unknown pack_id", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  assert.throws(
    () => convertMotionFromTemplate(tpl, "does.not.exist"),
    /pack 'does\.not\.exist' not found/,
  );
});

test("motion3: throws on part_opacity target (session 09 deferred)", () => {
  assert.throws(
    () =>
      convertMotion({
        motion: {
          schema_version: "v1",
          pack_id: "x.y",
          version: "1.0.0",
          meta: {
            duration_sec: 1,
            fps: 30,
            fade_in_sec: 0,
            fade_out_sec: 0,
            loop: false,
            curve_count: 1,
            total_segment_count: 1,
            total_point_count: 2,
          },
          curves: [
            { target: "part_opacity", target_id: "arm_l_a", segments: [0, 1, 0, 1, 0] },
          ],
        },
        manifest: {
          schema_version: "v1",
          id: "x",
          version: "1.0.0",
          parts_dir: "parts/",
          cubism_mapping: {},
        },
      }),
    /part_opacity.*not yet supported/,
  );
});

test("motion3: throws on unmapped parameter", () => {
  assert.throws(
    () =>
      convertMotion({
        motion: {
          schema_version: "v1",
          pack_id: "x.y",
          version: "1.0.0",
          meta: {
            duration_sec: 1,
            fps: 30,
            fade_in_sec: 0,
            fade_out_sec: 0,
            loop: false,
            curve_count: 1,
            total_segment_count: 1,
            total_point_count: 2,
          },
          curves: [{ target: "parameter", target_id: "not_in_mapping", segments: [0, 0, 0, 1, 0] }],
        },
        manifest: {
          schema_version: "v1",
          id: "x",
          version: "1.0.0",
          parts_dir: "parts/",
          cubism_mapping: {},
        },
      }),
    /cubism_mapping missing entry for parameter 'not_in_mapping'/,
  );
});

test("motion3: UserData empty defaults to count=0 size=0", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertMotionFromTemplate(tpl, "idle.default");
  assert.equal(out.Meta.UserDataCount, 0);
  assert.equal(out.Meta.TotalUserDataSize, 0);
  assert.deepEqual(out.UserData, []);
});

test("motion3: segments copied byte-equal (no normalization)", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertMotionFromTemplate(tpl, "greet.wave");
  assert.deepEqual(out.Curves[0]!.Segments, [0, 0, 0, 0.5, 20, 0, 1.0, 0, 0, 1.5, 20, 0, 2.0, 0]);
});
