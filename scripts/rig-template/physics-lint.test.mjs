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

import { FAMILY_OUTPUT_RULES, diffPhysics, lintPhysics } from "./physics-lint.mjs";

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

  // 2e) output naming convention violation (C10-suffix)
  {
    const dir = await scratch();
    await copyV13(dir);
    // parameters.json 에 physics_output:true 가 붙은 임의의 잘못된 이름을 만들고 output 에 연결
    await patchPhysics(dir, (p) => {
      p.physics_settings[0].output[0].destination_param = "arm_l_angle"; // 존재 but 규약 위반 + physics_output 없음
    });
    const res = await lintPhysics(dir);
    assert.ok(res.errors.some((e) => e.startsWith("C10-suffix")), `expected C10-suffix, got: ${res.errors.join(" / ")}`);
    assert.ok(res.errors.some((e) => e.startsWith("C7")), `expected C7, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C7 + C10-suffix output 규약 위반");
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

  // 2h) halfbody family forbidden prefix (세션 49) — leg_ 같은 하반신 접두사 차단
  {
    const dir = await scratch();
    await copyV13(dir);
    // parameters.json 에 `leg_sway` 를 physics_output:true 로 추가 → C7/C9 는 통과시키고,
    // cubism_mapping 도 등록 → 오직 C10-forbidden 만 발생.
    const parametersPath = join(dir, "parameters.json");
    const manifestPath = join(dir, "template.manifest.json");
    const params = JSON.parse(await readFile(parametersPath, "utf8"));
    params.parameters.push({
      id: "leg_sway",
      display_name: "Leg Sway (synthetic test)",
      range: [-1, 1],
      default: 0,
      physics_output: true,
      kind: "extension",
    });
    await writeFile(parametersPath, JSON.stringify(params, null, 2));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.cubism_mapping["leg_sway"] = "LegSway";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await patchPhysics(dir, (p) => {
      p.physics_settings[0].output[0].destination_param = "leg_sway";
    });
    const res = await lintPhysics(dir);
    const forbidden = res.errors.filter((e) => e.startsWith("C10-forbidden"));
    assert.ok(forbidden.length === 1, `expected 1 C10-forbidden, got: ${res.errors.join(" / ")}`);
    assert.ok(forbidden[0].includes('family="halfbody"'));
    assert.ok(forbidden[0].includes('"leg_"'));
    // C10-suffix 는 `leg_sway` 가 `_sway` 로 끝나므로 통과해야 함.
    assert.ok(
      !res.errors.some((e) => e.startsWith("C10-suffix")),
      `leg_sway 는 suffix 규약 통과해야 함: ${res.errors.join(" / ")}`,
    );
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C10-forbidden halfbody 하반신 접두사 차단 (leg_sway)");
  }

  // 2i) --family override 로 fullbody 처럼 lint 하면 halfbody forbidden 이 사라짐 (세션 49)
  {
    const dir = await scratch();
    await copyV13(dir);
    const parametersPath = join(dir, "parameters.json");
    const manifestPath = join(dir, "template.manifest.json");
    const params = JSON.parse(await readFile(parametersPath, "utf8"));
    params.parameters.push({
      id: "leg_sway",
      display_name: "Leg Sway",
      range: [-1, 1],
      default: 0,
      physics_output: true,
      kind: "extension",
    });
    await writeFile(parametersPath, JSON.stringify(params, null, 2));
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.cubism_mapping["leg_sway"] = "LegSway";
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
    await patchPhysics(dir, (p) => {
      p.physics_settings[0].output[0].destination_param = "leg_sway";
    });
    const res = await lintPhysics(dir, { familyOverride: "fullbody" });
    assert.equal(
      res.errors.length,
      0,
      `fullbody override 하에서 clean 이어야 함: ${res.errors.join(" / ")}`,
    );
    assert.equal(res.summary.family, "fullbody");
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ --family fullbody override 가 하반신 파츠 허용");
  }

  // 2j) 알 수 없는 family → throw (세션 49)
  {
    const dir = await scratch();
    await copyV13(dir);
    await assert.rejects(
      () => lintPhysics(dir, { familyOverride: "alien_species" }),
      /family="alien_species".+FAMILY_OUTPUT_RULES/s,
    );
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ 미등록 family 는 explicit throw");
  }

  // 2k) FAMILY_OUTPUT_RULES 테이블이 schema 의 family enum 6종 전부 커버 (세션 49)
  {
    const expected = ["chibi", "halfbody", "fullbody", "masc_halfbody", "feline", "custom"];
    for (const fam of expected) {
      assert.ok(FAMILY_OUTPUT_RULES[fam], `family=${fam} rule 누락`);
    }
    console.log("  ✓ FAMILY_OUTPUT_RULES 가 schema enum 6종 커버");
  }

  // 2l) C11 — parts/*.spec.json 의 parameter_ids (세션 98) 가 parameters.json 에 없을 때 (세션 99)
  {
    const dir = await scratch();
    await copyV13(dir);
    // 기존 파츠 중 하나에 존재하지 않는 id 주입
    const specPath = join(dir, "parts", "ahoge.spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    spec.parameter_ids = ["ahoge_sway", "not_a_param_xyz"];
    await writeFile(specPath, JSON.stringify(spec, null, 2));
    const res = await lintPhysics(dir);
    const c11 = res.errors.filter((e) => e.startsWith("C11"));
    assert.equal(c11.length, 1, `expected 1 C11 error, got: ${res.errors.join(" / ")}`);
    assert.ok(c11[0].includes("not_a_param_xyz"));
    assert.ok(c11[0].includes("ahoge.spec.json"));
    assert.equal(res.summary.parts_with_bindings, 1, "parts_with_bindings=1 (ahoge 만)");
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C11 parameter_ids 가 parameters.json 에 없을 때 차단");
  }

  // 2m) C11 — 유효한 parameter_ids 는 통과 (세션 99)
  {
    const dir = await scratch();
    await copyV13(dir);
    const specPath = join(dir, "parts", "ahoge.spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    spec.parameter_ids = ["ahoge_sway"]; // v1.3.0 parameters.json 에 실존
    await writeFile(specPath, JSON.stringify(spec, null, 2));
    const res = await lintPhysics(dir);
    const c11 = res.errors.filter((e) => e.startsWith("C11"));
    assert.equal(c11.length, 0, `expected 0 C11 errors, got: ${res.errors.join(" / ")}`);
    assert.equal(res.summary.parts_with_bindings, 1);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C11 유효 parameter_ids 통과");
  }

  // 2n) C11 — 빈 배열 parameter_ids 는 no-op (세션 98 의미: overall-only) (세션 99)
  {
    const dir = await scratch();
    await copyV13(dir);
    const specPath = join(dir, "parts", "ahoge.spec.json");
    const spec = JSON.parse(await readFile(specPath, "utf8"));
    spec.parameter_ids = [];
    await writeFile(specPath, JSON.stringify(spec, null, 2));
    const res = await lintPhysics(dir);
    const c11 = res.errors.filter((e) => e.startsWith("C11"));
    assert.equal(c11.length, 0);
    assert.equal(res.summary.parts_with_bindings, 1, "빈 배열도 'bindings 존재' 로 계수");
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C11 빈 배열은 no-op");
  }

  // 2o) C11 — parameter_ids 필드가 없는 spec (기존 67 파츠 전부 해당) 은 no-op (세션 99)
  {
    // 공식 v1.3.0 그대로 lint → C11 오류 0, parts_checked=30, parts_with_bindings=0
    const res = await lintPhysics(join(halfbody, "v1.3.0"));
    const c11 = res.errors.filter((e) => e.startsWith("C11"));
    assert.equal(c11.length, 0);
    assert.equal(res.summary.parts_checked, 30);
    assert.equal(res.summary.parts_with_bindings, 0, "세션 99 시점엔 opt-in 파츠 0");
    console.log("  ✓ C11 parameter_ids 미지정 파츠는 backward-compat no-op");
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
