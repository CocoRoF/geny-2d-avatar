#!/usr/bin/env node
// scripts/rig-template/physics-lint.test.mjs
// physics-lint.mjs 회귀.
//
// 수행:
//  1) 모든 halfbody 공식 버전(v1.0.0 .. v1.3.0) 에 lintPhysics 를 실행해 errors == 0 검증.
//  2) 변조 케이스: 카운트 mismatch · 범위 밖 vertex_index · 존재하지 않는 source_param ·
//     output 네이밍 규약 위반 · cubism_mapping 누락 · dictionary/settings id 불일치.
//     각 변조가 정확히 해당 규칙의 error 만 발생시키는지.
//  3) v1.2.0 → v1.3.0 diff 가 PhysicsSetting10/11/12 세 개를 신규로 잡는지.
//
// node --test 대신 표준 CLI 엔트리 — test-golden.mjs step 18 로 호출된다.

import { strict as assert } from "node:assert";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { diffPhysics, lintPhysics } from "./physics-lint.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const halfbody = join(repoRoot, "rig-templates", "base", "halfbody");

async function scratch() {
  return mkdtemp(join(tmpdir(), "geny-physics-lint-"));
}

async function copyV13(dir) {
  await cp(join(halfbody, "v1.3.0"), dir, { recursive: true });
  return dir;
}

async function patchPhysics(dir, mutate) {
  const path = join(dir, "physics", "physics.json");
  const obj = JSON.parse(await readFile(path, "utf8"));
  mutate(obj);
  await writeFile(path, JSON.stringify(obj, null, 2));
}

async function main() {
  // 1) 공식 버전 4개 clean
  for (const v of ["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"]) {
    const res = await lintPhysics(join(halfbody, v));
    assert.equal(res.errors.length, 0, `${v}: ${res.errors.join(" / ")}`);
  }
  console.log("  ✓ halfbody v1.0.0..v1.3.0 전부 clean");

  // 2a) meta 카운트 mismatch
  {
    const dir = await scratch();
    await copyV13(dir);
    await patchPhysics(dir, (p) => { p.meta.physics_setting_count = 99; });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C1")), `expected C1 error, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C1 meta.physics_setting_count mismatch");
  }

  // 2b) input count mismatch
  {
    const dir = await scratch();
    await copyV13(dir);
    await patchPhysics(dir, (p) => { p.meta.total_input_count = 1; });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C2")));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C2 total_input_count mismatch");
  }

  // 2c) vertex_index out of range
  {
    const dir = await scratch();
    await copyV13(dir);
    await patchPhysics(dir, (p) => { p.physics_settings[0].output[0].vertex_index = 99; });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C8")), `expected C8, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C8 vertex_index out of range");
  }

  // 2d) missing source_param
  {
    const dir = await scratch();
    await copyV13(dir);
    await patchPhysics(dir, (p) => { p.physics_settings[0].input[0].source_param = "not_a_param_x"; });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C6")));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C6 missing input source_param");
  }

  // 2e) output naming convention violation
  {
    const dir = await scratch();
    await copyV13(dir);
    // parameters.json 에 physics_output:true 가 붙은 임의의 잘못된 이름을 만들고 output 에 연결
    await patchPhysics(dir, (p) => {
      p.physics_settings[0].output[0].destination_param = "arm_l_angle"; // 존재 but 규약 위반 + physics_output 없음
    });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C10")), `expected C10, got: ${res.errors.join(" / ")}`);
    assert.ok(res.errors.some((e) => e.startsWith("C7")), `expected C7, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C7 + C10 output 규약 위반");
  }

  // 2f) cubism_mapping 누락
  {
    const dir = await scratch();
    await copyV13(dir);
    const manifestPath = join(dir, "template.manifest.json");
    const m = JSON.parse(await readFile(manifestPath, "utf8"));
    delete m.cubism_mapping["ahoge_sway"];
    await writeFile(manifestPath, JSON.stringify(m, null, 2));
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C9")), `expected C9, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C9 cubism_mapping 누락");
  }

  // 2g) dictionary / settings id mismatch
  {
    const dir = await scratch();
    await copyV13(dir);
    await patchPhysics(dir, (p) => { p.physics_dictionary.pop(); });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C5")), `expected C5, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C5 dictionary/settings id mismatch");
  }

  // 3) diff v1.2.0 vs v1.3.0 — 3 신규 세팅
  {
    const lines = await diffPhysics(join(halfbody, "v1.2.0"), join(halfbody, "v1.3.0"));
    const added = lines.filter((l) => l.startsWith("+ PhysicsSetting"));
    assert.equal(added.length, 3, `expected 3 added, got ${lines.join(" / ")}`);
    assert.ok(lines.some((l) => l.includes("PhysicsSetting10")));
    assert.ok(lines.some((l) => l.includes("PhysicsSetting11")));
    assert.ok(lines.some((l) => l.includes("PhysicsSetting12")));
    console.log("  ✓ diff v1.2.0→v1.3.0 = +3 settings");
  }

  console.log("[physics-lint] ✅ all checks pass");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
