#!/usr/bin/env node
/**
 * validate-schemas.mjs
 *
 * 1) schema/v1/**\/*.schema.json  을 Ajv 2020 에 전부 로드.
 * 2) rig-templates/base/**\/v*.*.*\/ 아래의 템플릿 파일들을 각 스키마에 매칭해 검증.
 * 3) 디렉터리명(`v1.0.0`) 과 `template.manifest.json` 의 `version` 이 일치하는지 확인 (ADR 0003).
 *
 * Exits 0 on success, 1 on any validation failure.
 *
 * 의존: ajv@^8, ajv-formats@^3 (package.json devDependencies).
 */

import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const SCHEMA_ROOT = join(REPO_ROOT, "schema", "v1");
const RIG_ROOT = join(REPO_ROOT, "rig-templates", "base");

// ——— Schema IDs (from $id fields) we expect and route files to ———
const SCHEMA_ID = {
  rigTemplate: "https://geny.ai/schema/v1/rig-template.schema.json",
  parameters: "https://geny.ai/schema/v1/parameters.schema.json",
  partSpec: "https://geny.ai/schema/v1/part-spec.schema.json",
  avatarMeta: "https://geny.ai/schema/v1/avatar-metadata.schema.json",
  avatarExport: "https://geny.ai/schema/v1/avatar-export.schema.json",
  deformers: "https://geny.ai/schema/v1/deformers.schema.json",
  physics: "https://geny.ai/schema/v1/physics.schema.json",
  motionPack: "https://geny.ai/schema/v1/motion-pack.schema.json",
  testPoses: "https://geny.ai/schema/v1/test-poses.schema.json",
  pose: "https://geny.ai/schema/v1/pose.schema.json",
};

// ——— Utilities ———
async function walk(root) {
  const out = [];
  async function rec(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        await rec(p);
      } else if (entry.isFile()) {
        out.push(p);
      }
    }
  }
  await rec(root);
  return out;
}

async function readJson(path) {
  const text = await readFile(path, "utf8");
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`${path}: invalid JSON — ${err.message}`);
  }
}

function fmtErrors(errors, file) {
  return errors
    .map((e) => `  ✗ ${file} :: ${e.instancePath || "/"} ${e.message} ${e.params ? JSON.stringify(e.params) : ""}`)
    .join("\n");
}

// ——— Main ———
async function main() {
  const ajv = new Ajv2020({
    strict: true,
    allErrors: true,
    allowUnionTypes: true,
  });
  addFormats.default ? addFormats.default(ajv) : addFormats(ajv);

  // 1. Load all schemas under schema/v1
  const schemaFiles = (await walk(SCHEMA_ROOT)).filter((f) => f.endsWith(".json"));
  const loadedIds = [];
  for (const f of schemaFiles) {
    const schema = await readJson(f);
    if (!schema.$id) {
      throw new Error(`Schema missing $id: ${relative(REPO_ROOT, f)}`);
    }
    ajv.addSchema(schema, schema.$id);
    loadedIds.push(schema.$id);
  }
  console.log(`[schema] loaded ${loadedIds.length} schema(s):`);
  for (const id of loadedIds) console.log(`  • ${id}`);

  // Compile validators we'll route to
  const validators = {
    rigTemplate: ajv.getSchema(SCHEMA_ID.rigTemplate),
    parameters: ajv.getSchema(SCHEMA_ID.parameters),
    partSpec: ajv.getSchema(SCHEMA_ID.partSpec),
    avatarMeta: ajv.getSchema(SCHEMA_ID.avatarMeta),
    avatarExport: ajv.getSchema(SCHEMA_ID.avatarExport),
    deformers: ajv.getSchema(SCHEMA_ID.deformers),
    physics: ajv.getSchema(SCHEMA_ID.physics),
    motionPack: ajv.getSchema(SCHEMA_ID.motionPack),
    testPoses: ajv.getSchema(SCHEMA_ID.testPoses),
    pose: ajv.getSchema(SCHEMA_ID.pose),
  };
  for (const [name, v] of Object.entries(validators)) {
    if (!v) throw new Error(`Could not compile validator for ${name} (id=${SCHEMA_ID[name]})`);
  }

  // 2. Validate rig templates
  let failed = 0;
  let checked = 0;
  const versionDirRe = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
  // Collected across all template dirs → used later to cross-check avatar sample template refs.
  const knownTemplates = new Set();

  async function validateTemplateVersionDir(dir) {
    const dirName = dir.split("/").pop();
    if (!versionDirRe.test(dirName)) {
      console.log(`[rig] skip non-version dir: ${relative(REPO_ROOT, dir)}`);
      return;
    }
    const expectedVersion = dirName.slice(1); // drop leading "v"

    // 2a. manifest
    const manifestPath = join(dir, "template.manifest.json");
    const manifest = await readJson(manifestPath);
    checked += 1;
    if (!validators.rigTemplate(manifest)) {
      failed += 1;
      console.error(`[rig] INVALID manifest ${relative(REPO_ROOT, manifestPath)}`);
      console.error(fmtErrors(validators.rigTemplate.errors, relative(REPO_ROOT, manifestPath)));
    }
    // ADR 0003 check
    if (manifest.version !== expectedVersion) {
      failed += 1;
      console.error(
        `[rig] VERSION MISMATCH ${relative(REPO_ROOT, manifestPath)} — dir=${dirName} manifest.version=${manifest.version} (ADR 0003)`,
      );
    }
    if (manifest.id && manifest.version) {
      knownTemplates.add(`${manifest.id}@${manifest.version}`);
    }

    // 2b. parameters.json
    const paramsPath = join(dir, manifest.parameters_file || "parameters.json");
    const params = await readJson(paramsPath);
    checked += 1;
    if (!validators.parameters(params)) {
      failed += 1;
      console.error(`[rig] INVALID parameters ${relative(REPO_ROOT, paramsPath)}`);
      console.error(fmtErrors(validators.parameters.errors, relative(REPO_ROOT, paramsPath)));
    }

    // Cross-check: every groups[].id referenced by parameters[].group must exist
    const groupIds = new Set((params.groups || []).map((g) => g.id));
    for (const p of params.parameters || []) {
      if (p.group && !groupIds.has(p.group)) {
        failed += 1;
        console.error(
          `[rig] parameters.json: parameter '${p.id}' references unknown group '${p.group}' in ${relative(REPO_ROOT, paramsPath)}`,
        );
      }
    }

    // Cross-check: every parameter referenced by combined_axes must exist
    const paramIds = new Set((params.parameters || []).map((p) => p.id));
    for (const pair of params.combined_axes || []) {
      for (const pid of pair) {
        if (!paramIds.has(pid)) {
          failed += 1;
          console.error(
            `[rig] parameters.json: combined_axes references unknown parameter '${pid}' in ${relative(REPO_ROOT, paramsPath)}`,
          );
        }
      }
    }

    // 2c. deformers.json (if present)
    const deformersPath = join(dir, manifest.deformers_file || "deformers.json");
    let deformerIds = null; // null → deformers.json not yet present (session pre-02)
    try {
      const deformers = await readJson(deformersPath);
      checked += 1;
      if (!validators.deformers(deformers)) {
        failed += 1;
        console.error(`[rig] INVALID deformers ${relative(REPO_ROOT, deformersPath)}`);
        console.error(fmtErrors(validators.deformers.errors, relative(REPO_ROOT, deformersPath)));
      } else {
        // Cross-checks
        deformerIds = new Set(deformers.nodes.map((n) => n.id));
        // root_id exists and its node has parent=null
        if (!deformerIds.has(deformers.root_id)) {
          failed += 1;
          console.error(`[rig] deformers.json: root_id '${deformers.root_id}' not in nodes — ${relative(REPO_ROOT, deformersPath)}`);
        } else {
          const rootNode = deformers.nodes.find((n) => n.id === deformers.root_id);
          if (rootNode.parent !== null) {
            failed += 1;
            console.error(`[rig] deformers.json: root node '${deformers.root_id}' must have parent=null (got ${JSON.stringify(rootNode.parent)})`);
          }
        }
        // Duplicate id detection
        if (deformerIds.size !== deformers.nodes.length) {
          failed += 1;
          console.error(`[rig] deformers.json: duplicate node ids in ${relative(REPO_ROOT, deformersPath)}`);
        }
        // Every parent (if not null) must be a known id
        for (const n of deformers.nodes) {
          if (n.parent !== null && !deformerIds.has(n.parent)) {
            failed += 1;
            console.error(`[rig] deformers.json: node '${n.id}' references unknown parent '${n.parent}'`);
          }
          // params_in must reference valid params
          for (const pid of n.params_in || []) {
            if (!paramIds.has(pid)) {
              failed += 1;
              console.error(`[rig] deformers.json: node '${n.id}' params_in references unknown parameter '${pid}'`);
            }
          }
        }
        // Cycle detection (walk ancestors; every node must reach root in ≤ nodes.length hops)
        const nodeById = new Map(deformers.nodes.map((n) => [n.id, n]));
        for (const n of deformers.nodes) {
          let cur = n;
          const seen = new Set();
          let hops = 0;
          while (cur.parent !== null) {
            if (seen.has(cur.id)) {
              failed += 1;
              console.error(`[rig] deformers.json: cycle detected at '${n.id}' (via '${cur.id}')`);
              break;
            }
            seen.add(cur.id);
            hops += 1;
            if (hops > deformers.nodes.length) {
              failed += 1;
              console.error(`[rig] deformers.json: ancestor chain too long at '${n.id}' — likely cycle`);
              break;
            }
            const next = nodeById.get(cur.parent);
            if (!next) break;
            cur = next;
          }
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.log(`[rig] no deformers.json yet at ${relative(REPO_ROOT, deformersPath)} — skipping deformer cross-checks`);
    }

    // 2c-bis. physics/physics.json (if present)
    // docs/03 §6.2: input ⊂ {head_angle_*, body_angle_*, body_breath} (physics_input=true), output ⊂ *_sway / *_phys (physics_output=true).
    const physicsPath = join(dir, manifest.physics_file || "physics/physics.json");
    const physicsInputAllowed = new Set(
      (params.parameters || []).filter((p) => p.physics_input === true).map((p) => p.id),
    );
    const physicsOutputAllowed = new Set(
      (params.parameters || []).filter((p) => p.physics_output === true).map((p) => p.id),
    );
    try {
      const physics = await readJson(physicsPath);
      checked += 1;
      if (!validators.physics(physics)) {
        failed += 1;
        console.error(`[rig] INVALID physics ${relative(REPO_ROOT, physicsPath)}`);
        console.error(fmtErrors(validators.physics.errors, relative(REPO_ROOT, physicsPath)));
      } else {
        // Cross-checks
        const settings = physics.physics_settings;
        // Dictionary ids match setting ids 1:1
        const dictIds = new Set(physics.physics_dictionary.map((d) => d.id));
        const settingIds = new Set(settings.map((s) => s.id));
        for (const id of settingIds) {
          if (!dictIds.has(id)) {
            failed += 1;
            console.error(`[rig] physics.json: setting '${id}' missing in physics_dictionary`);
          }
        }
        for (const id of dictIds) {
          if (!settingIds.has(id)) {
            failed += 1;
            console.error(`[rig] physics.json: dictionary '${id}' has no matching physics_settings entry`);
          }
        }
        // Duplicate setting ids
        if (settingIds.size !== settings.length) {
          failed += 1;
          console.error(`[rig] physics.json: duplicate physics_settings.id in ${relative(REPO_ROOT, physicsPath)}`);
        }
        // Meta counts must match reality
        const totalInputs = settings.reduce((acc, s) => acc + s.input.length, 0);
        const totalOutputs = settings.reduce((acc, s) => acc + s.output.length, 0);
        const totalVertices = settings.reduce((acc, s) => acc + s.vertices.length, 0);
        if (physics.meta.physics_setting_count !== settings.length) {
          failed += 1;
          console.error(`[rig] physics.json: meta.physics_setting_count=${physics.meta.physics_setting_count} vs actual=${settings.length}`);
        }
        if (physics.meta.total_input_count !== totalInputs) {
          failed += 1;
          console.error(`[rig] physics.json: meta.total_input_count=${physics.meta.total_input_count} vs actual=${totalInputs}`);
        }
        if (physics.meta.total_output_count !== totalOutputs) {
          failed += 1;
          console.error(`[rig] physics.json: meta.total_output_count=${physics.meta.total_output_count} vs actual=${totalOutputs}`);
        }
        if (physics.meta.vertex_count !== totalVertices) {
          failed += 1;
          console.error(`[rig] physics.json: meta.vertex_count=${physics.meta.vertex_count} vs actual=${totalVertices}`);
        }
        // Per-setting checks
        for (const s of settings) {
          // Inputs must be physics_input-flagged params
          for (const inp of s.input) {
            if (!paramIds.has(inp.source_param)) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' input source_param '${inp.source_param}' not in parameters.json`);
            } else if (!physicsInputAllowed.has(inp.source_param)) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' input '${inp.source_param}' is not marked physics_input=true (docs/03 §6.2)`);
            }
          }
          // Outputs must be physics_output-flagged params and suffix must match *_sway / *_phys
          for (const out of s.output) {
            if (!paramIds.has(out.destination_param)) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' output destination_param '${out.destination_param}' not in parameters.json`);
            } else if (!physicsOutputAllowed.has(out.destination_param)) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' output '${out.destination_param}' is not marked physics_output=true`);
            }
            // docs/03 §6.2 — *_sway / *_phys / *_fuwa 접미사. 좌우 분리 시 _l / _r 뒤붙임 허용.
            // `_fuwa` 는 세션 07 에서 볼륨 팽창용 물리 출력으로 정식 도입 (docs/03 §12.1 #1).
            if (!/_(sway|phys|fuwa)(_[lr])?$/.test(out.destination_param)) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' output '${out.destination_param}' must end in _sway / _phys / _fuwa (optionally + _l/_r) — docs/03 §6.2`);
            }
            // vertex_index must be within the setting's vertices array
            if (out.vertex_index >= s.vertices.length) {
              failed += 1;
              console.error(`[rig] physics.json: setting '${s.id}' output vertex_index=${out.vertex_index} out of range (vertices=${s.vertices.length})`);
            }
          }
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.log(`[rig] no physics.json yet at ${relative(REPO_ROOT, physicsPath)} — skipping physics cross-checks`);
    }

    // 2d. parts/*.spec.json
    const partsDirRel = manifest.parts_dir || "parts/";
    const partsDir = join(dir, partsDirRel);
    let partsEntries = [];
    try {
      partsEntries = await readdir(partsDir);
    } catch {
      /* no parts dir yet */
    }
    const slotIds = new Set();
    const parts = [];
    for (const entry of partsEntries) {
      if (!entry.endsWith(".spec.json")) continue;
      const partPath = join(partsDir, entry);
      const part = await readJson(partPath);
      checked += 1;
      if (!validators.partSpec(part)) {
        failed += 1;
        console.error(`[rig] INVALID part spec ${relative(REPO_ROOT, partPath)}`);
        console.error(fmtErrors(validators.partSpec.errors, relative(REPO_ROOT, partPath)));
      }
      // Cross-check: slot_id should match filename stem
      const expectedSlot = entry.replace(/\.spec\.json$/, "");
      if (part.slot_id !== expectedSlot) {
        failed += 1;
        console.error(
          `[rig] part spec slot_id mismatch: file=${entry} slot_id=${part.slot_id} in ${relative(REPO_ROOT, partPath)}`,
        );
      }
      // Cross-check: template reference
      if (part.template && !part.template.startsWith("tpl.")) {
        failed += 1;
        console.error(`[rig] part spec template must start with 'tpl.': ${relative(REPO_ROOT, partPath)}`);
      }
      // Cross-check: deformation_parent must exist in deformers.json (if loaded)
      if (deformerIds && part.deformation_parent && !deformerIds.has(part.deformation_parent)) {
        failed += 1;
        console.error(
          `[rig] part '${part.slot_id}' deformation_parent '${part.deformation_parent}' not in deformers.json`,
        );
      }
      // Cross-check: symmetry.pair_with exists as a slot (collected below after all parts loaded)
      slotIds.add(part.slot_id);
      parts.push({ path: partPath, part });
    }
    // Second pass: validate symmetry.pair_with + dependencies
    for (const { path: partPath, part } of parts) {
      if (part.symmetry && part.symmetry.pair_with && !slotIds.has(part.symmetry.pair_with)) {
        failed += 1;
        console.error(
          `[rig] part '${part.slot_id}' symmetry.pair_with '${part.symmetry.pair_with}' not found as a slot`,
        );
      }
      for (const dep of part.dependencies || []) {
        if (!slotIds.has(dep)) {
          failed += 1;
          console.error(
            `[rig] part '${part.slot_id}' dependency '${dep}' not found as a slot`,
          );
        }
      }
    }

    // 2d-bis. manifest.hit_areas[].bound_to_part ∈ slotIds (docs/03 §12.1 #7, docs/11 §3.2)
    for (const ha of manifest.hit_areas || []) {
      if (ha.bound_to_part && slotIds.size > 0 && !slotIds.has(ha.bound_to_part)) {
        failed += 1;
        console.error(
          `[rig] manifest.hit_areas[id=${ha.id}].bound_to_part '${ha.bound_to_part}' not found as a slot in ${relative(REPO_ROOT, manifestPath)}`,
        );
      }
    }

    // 2d-ter. optional pose.json — docs/11 §3.2.1 mutex groups.
    // v1.0.0 의 halfbody 는 파일이 없으므로 ENOENT 는 skip. 존재 시 스키마 + slot 교차검증.
    const posePath = join(dir, "pose.json");
    try {
      const pose = await readJson(posePath);
      checked += 1;
      if (!validators.pose(pose)) {
        failed += 1;
        console.error(`[rig] INVALID pose ${relative(REPO_ROOT, posePath)}`);
        console.error(fmtErrors(validators.pose.errors, relative(REPO_ROOT, posePath)));
      } else {
        const seenInGroup = new Set();
        for (const group of pose.groups) {
          for (const item of group) {
            if (seenInGroup.has(item.slot_id)) {
              failed += 1;
              console.error(
                `[rig] pose: slot '${item.slot_id}' appears in multiple mutex groups (${relative(REPO_ROOT, posePath)})`,
              );
            }
            seenInGroup.add(item.slot_id);
            if (slotIds.size > 0 && !slotIds.has(item.slot_id)) {
              failed += 1;
              console.error(
                `[rig] pose: slot '${item.slot_id}' not defined in parts/ (${relative(REPO_ROOT, posePath)})`,
              );
            }
            for (const linked of item.link || []) {
              if (slotIds.size > 0 && !slotIds.has(linked)) {
                failed += 1;
                console.error(
                  `[rig] pose: link target '${linked}' not a slot (${relative(REPO_ROOT, posePath)})`,
                );
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      // silent skip — not all templates declare alt-pose groups
    }

    // 2e. motions/*.motion.json
    // Build a parameterId → { range, default } map for value-range checks.
    const paramMeta = new Map((params.parameters || []).map((p) => [p.id, { range: p.range, default: p.default }]));
    // Strip '@^X' / '@^X.Y' from manifest.compat.motion_packs → pack id set
    const manifestPackIds = new Set(
      (manifest.compat?.motion_packs || []).map((s) => s.split("@")[0]),
    );
    const motionsDirRel = manifest.motions_dir || "motions/";
    const motionsDir = join(dir, motionsDirRel);
    let motionEntries = [];
    try {
      motionEntries = await readdir(motionsDir);
    } catch {
      /* no motions dir yet */
    }
    const seenPackIds = new Set();
    for (const entry of motionEntries) {
      if (!entry.endsWith(".motion.json")) continue;
      const motionPath = join(motionsDir, entry);
      const motion = await readJson(motionPath);
      checked += 1;
      if (!validators.motionPack(motion)) {
        failed += 1;
        console.error(`[rig] INVALID motion ${relative(REPO_ROOT, motionPath)}`);
        console.error(fmtErrors(validators.motionPack.errors, relative(REPO_ROOT, motionPath)));
        continue;
      }
      // pack_id unique + ∈ manifest.compat.motion_packs
      if (seenPackIds.has(motion.pack_id)) {
        failed += 1;
        console.error(`[rig] duplicate motion pack_id '${motion.pack_id}' in ${relative(REPO_ROOT, motionPath)}`);
      }
      seenPackIds.add(motion.pack_id);
      if (manifestPackIds.size > 0 && !manifestPackIds.has(motion.pack_id)) {
        failed += 1;
        console.error(`[rig] motion '${motion.pack_id}' not declared in manifest.compat.motion_packs (${relative(REPO_ROOT, motionPath)})`);
      }
      // Curves: target_id must resolve against parameters or slots
      let segTotal = 0;
      let pointTotal = 0;
      for (const c of motion.curves) {
        if (c.target === "parameter" && !paramIds.has(c.target_id)) {
          failed += 1;
          console.error(`[rig] motion '${motion.pack_id}': curve target_id '${c.target_id}' not in parameters.json`);
        }
        if (c.target === "part_opacity" && slotIds.size > 0 && !slotIds.has(c.target_id)) {
          failed += 1;
          console.error(`[rig] motion '${motion.pack_id}': part_opacity curve target_id '${c.target_id}' not a known slot`);
        }
        // segments layout: initial (2) + Linear(3)|Stepped(3)|InverseStepped(3)|Bezier(7)
        const s = c.segments;
        if (s.length < 2 || (s.length - 2) === 0) {
          failed += 1;
          console.error(`[rig] motion '${motion.pack_id}': curve '${c.target_id}' segments too short`);
          continue;
        }
        let i = 2;
        let segCount = 0;
        let pointCount = 1;
        let ok = true;
        while (i < s.length) {
          const type = s[i];
          const step = type === 1 ? 7 : (type === 0 || type === 2 || type === 3 ? 3 : -1);
          if (step === -1) {
            failed += 1;
            console.error(`[rig] motion '${motion.pack_id}': curve '${c.target_id}' unknown segment type ${type} at index ${i}`);
            ok = false;
            break;
          }
          if (i + step > s.length) {
            failed += 1;
            console.error(`[rig] motion '${motion.pack_id}': curve '${c.target_id}' truncated segment at index ${i}`);
            ok = false;
            break;
          }
          i += step;
          segCount += 1;
          pointCount += 1;
        }
        if (ok) {
          segTotal += segCount;
          pointTotal += pointCount;
        }
      }
      if (motion.meta.curve_count !== motion.curves.length) {
        failed += 1;
        console.error(`[rig] motion '${motion.pack_id}': meta.curve_count=${motion.meta.curve_count} vs actual=${motion.curves.length}`);
      }
      if (motion.meta.total_segment_count !== segTotal) {
        failed += 1;
        console.error(`[rig] motion '${motion.pack_id}': meta.total_segment_count=${motion.meta.total_segment_count} vs actual=${segTotal}`);
      }
      if (motion.meta.total_point_count !== pointTotal) {
        failed += 1;
        console.error(`[rig] motion '${motion.pack_id}': meta.total_point_count=${motion.meta.total_point_count} vs actual=${pointTotal}`);
      }
    }
    // Every manifest-declared pack must have a file
    if (manifestPackIds.size > 0 && seenPackIds.size > 0) {
      for (const id of manifestPackIds) {
        if (!seenPackIds.has(id)) {
          failed += 1;
          console.error(`[rig] manifest.compat.motion_packs declares '${id}' but no matching motion file found in ${relative(REPO_ROOT, motionsDir)}`);
        }
      }
    }

    // 2f. test_poses/validation_set.json
    const testPosesPath = join(dir, manifest.test_poses_file || "test_poses/validation_set.json");
    try {
      const poses = await readJson(testPosesPath);
      checked += 1;
      if (!validators.testPoses(poses)) {
        failed += 1;
        console.error(`[rig] INVALID test_poses ${relative(REPO_ROOT, testPosesPath)}`);
        console.error(fmtErrors(validators.testPoses.errors, relative(REPO_ROOT, testPosesPath)));
      } else {
        const seenPoseIds = new Set();
        for (const pose of poses.poses) {
          if (seenPoseIds.has(pose.id)) {
            failed += 1;
            console.error(`[rig] test_poses: duplicate pose id '${pose.id}'`);
          }
          seenPoseIds.add(pose.id);
          for (const [pid, value] of Object.entries(pose.params || {})) {
            const meta = paramMeta.get(pid);
            if (!meta) {
              failed += 1;
              console.error(`[rig] test_poses: pose '${pose.id}' references unknown parameter '${pid}'`);
              continue;
            }
            if (Array.isArray(meta.range)) {
              const [lo, hi] = meta.range;
              if (value < lo || value > hi) {
                failed += 1;
                console.error(`[rig] test_poses: pose '${pose.id}' param '${pid}'=${value} outside range [${lo}, ${hi}]`);
              }
            }
          }
        }
      }
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.log(`[rig] no test_poses at ${relative(REPO_ROOT, testPosesPath)} — skipping pose checks`);
    }
  }

  async function walkRigRoot() {
    let families = [];
    try {
      families = await readdir(RIG_ROOT, { withFileTypes: true });
    } catch {
      console.log("[rig] no rig-templates/base dir — skipping rig validation");
      return;
    }
    for (const family of families) {
      if (!family.isDirectory()) continue;
      const familyDir = join(RIG_ROOT, family.name);
      const versions = await readdir(familyDir, { withFileTypes: true });
      for (const v of versions) {
        if (!v.isDirectory()) continue;
        await validateTemplateVersionDir(join(familyDir, v.name));
      }
    }
  }

  await walkRigRoot();

  // 3. Validate sample data (samples/{domain}/...)
  // docs/12 §4.5 — avatars/ 의 avatar-metadata 인스턴스. template 참조는 walkRigRoot 에서 수집한 set 과 대조.
  async function validateAvatarSamples() {
    const avatarsDir = join(REPO_ROOT, "samples", "avatars");
    let files = [];
    try {
      files = await readdir(avatarsDir);
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
      console.log("[samples] no samples/avatars — skipping avatar sample validation");
      return;
    }
    const avatarIds = new Set();
    for (const entry of files) {
      if (!entry.endsWith(".avatar.json")) continue;
      const p = join(avatarsDir, entry);
      const avatar = await readJson(p);
      checked += 1;
      if (!validators.avatarMeta(avatar)) {
        failed += 1;
        console.error(`[samples] INVALID avatar ${relative(REPO_ROOT, p)}`);
        console.error(fmtErrors(validators.avatarMeta.errors, relative(REPO_ROOT, p)));
        continue;
      }
      avatarIds.add(avatar.id);
      const ref = `${avatar.template_id}@${avatar.template_version}`;
      if (!knownTemplates.has(ref)) {
        failed += 1;
        console.error(
          `[samples] avatar '${avatar.id}' references unknown template '${ref}' (${relative(REPO_ROOT, p)})`,
        );
      }
    }
    // avatar-export 스펙(세션 11): metadata 와 짝으로 저장. avatar_id 가 metadata 에 존재해야 한다.
    for (const entry of files) {
      if (!entry.endsWith(".export.json")) continue;
      const p = join(avatarsDir, entry);
      const spec = await readJson(p);
      checked += 1;
      if (!validators.avatarExport(spec)) {
        failed += 1;
        console.error(`[samples] INVALID avatar-export ${relative(REPO_ROOT, p)}`);
        console.error(fmtErrors(validators.avatarExport.errors, relative(REPO_ROOT, p)));
        continue;
      }
      if (!avatarIds.has(spec.avatar_id)) {
        failed += 1;
        console.error(
          `[samples] avatar-export '${relative(REPO_ROOT, p)}' references unknown avatar_id '${spec.avatar_id}' (no matching .avatar.json in samples/avatars)`,
        );
      }
      const ref = `${spec.template_id}@${spec.template_version}`;
      if (!knownTemplates.has(ref)) {
        failed += 1;
        console.error(
          `[samples] avatar-export '${relative(REPO_ROOT, p)}' references unknown template '${ref}'`,
        );
      }
    }
  }
  await validateAvatarSamples();

  // 4. Summary
  console.log("");
  console.log(`[validate] checked=${checked} failed=${failed}`);
  if (failed > 0) {
    console.error(`[validate] ❌ ${failed} failure(s)`);
    process.exit(1);
  }
  console.log("[validate] ✅ all schemas + rig templates valid");
}

main().catch((err) => {
  console.error("[validate] fatal:", err);
  process.exit(2);
});
