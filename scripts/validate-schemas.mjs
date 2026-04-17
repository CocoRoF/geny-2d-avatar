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
  };
  for (const [name, v] of Object.entries(validators)) {
    if (!v) throw new Error(`Could not compile validator for ${name} (id=${SCHEMA_ID[name]})`);
  }

  // 2. Validate rig templates
  let failed = 0;
  let checked = 0;
  const versionDirRe = /^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

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

    // 2c. parts/*.spec.json
    const partsDirRel = manifest.parts_dir || "parts/";
    const partsDir = join(dir, partsDirRel);
    let partsEntries = [];
    try {
      partsEntries = await readdir(partsDir);
    } catch {
      /* no parts dir yet */
    }
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

  // 3. Summary
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
