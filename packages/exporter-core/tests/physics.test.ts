import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "../src/loader.js";
import {
  convertPhysics,
  convertPhysicsFromTemplate,
} from "../src/converters/physics.js";
import { canonicalJson } from "../src/util/canonical-json.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(here, "..", "..", "tests", "golden");

function template(version: string): string {
  return resolve(repoRoot, "rig-templates", "base", "halfbody", version);
}

test("physics3: halfbody v1.3.0 matches golden byte-for-byte", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const got = canonicalJson(convertPhysicsFromTemplate(tpl));
  const want = readFileSync(resolve(goldenDir, "halfbody_v1.3.0.physics3.json"), "utf8");
  assert.equal(got, want);
});

test("physics3: throws on missing cubism_mapping entry", () => {
  assert.throws(
    () =>
      convertPhysics({
        physics: {
          schema_version: "v1",
          version: 3,
          meta: {
            physics_setting_count: 1,
            total_input_count: 1,
            total_output_count: 1,
            vertex_count: 2,
            fps: 30,
            effective_forces: { gravity: { x: 0, y: -1 }, wind: { x: 0, y: 0 } },
          },
          physics_dictionary: [{ id: "PhysicsSetting1", name: { en: "X" } }],
          physics_settings: [
            {
              id: "PhysicsSetting1",
              input: [{ source_param: "unknown_param", weight: 100, type: "X", reflect: false }],
              output: [
                {
                  destination_param: "also_unknown",
                  vertex_index: 1,
                  scale: 1,
                  weight: 100,
                  type: "X",
                  reflect: false,
                },
              ],
              vertices: [
                { position: { x: 0, y: 0 }, mobility: 1, delay: 1, acceleration: 1, radius: 0 },
                { position: { x: 0, y: 5 }, mobility: 1, delay: 1, acceleration: 1, radius: 5 },
              ],
              normalization: {
                position: { minimum: 0, default: 0, maximum: 1 },
                angle: { minimum: 0, default: 0, maximum: 1 },
              },
            },
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
    /cubism_mapping missing entry for 'unknown_param'/,
  );
});

test("physics3: PhysicsDictionary.Name uses 'en' (D3)", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertPhysicsFromTemplate(tpl);
  const names = out.Meta.PhysicsDictionary.map((d) => d.Name);
  assert.ok(names.every((n) => /^[\x20-\x7e()]+$/.test(n)), `non-ASCII leaked: ${names}`);
});

test("physics3: presets field is ignored", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertPhysicsFromTemplate(tpl);
  assert.ok(!("presets" in out));
  assert.ok(!("Presets" in out));
});

test("physics3: Meta counts match source", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertPhysicsFromTemplate(tpl);
  // v1.3.0: 12 settings (머리 8 + 옷 4) / 31 inputs / 13 outputs / 24 vertices.
  assert.equal(out.Meta.PhysicsSettingCount, 12);
  assert.equal(out.Meta.TotalInputCount, 31);
  assert.equal(out.Meta.TotalOutputCount, 13);
  assert.equal(out.Meta.VertexCount, 24);
  assert.equal(out.Meta.Fps, 30);
  assert.equal(out.Version, 3);
});

test("physics3: Input.Source.Target is 'Parameter'", () => {
  const tpl = loadTemplate(template("v1.3.0"));
  const out = convertPhysicsFromTemplate(tpl);
  for (const s of out.PhysicsSettings) {
    for (const i of s.Input) {
      assert.equal(i.Source.Target, "Parameter");
    }
    for (const o of s.Output) {
      assert.equal(o.Destination.Target, "Parameter");
    }
  }
});
