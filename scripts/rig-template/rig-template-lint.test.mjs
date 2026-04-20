#!/usr/bin/env node
// scripts/rig-template/rig-template-lint.test.mjs
// rig-template-lint.mjs 회귀 (세션 110 리브랜딩, 원래 physics-lint.test.mjs).
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
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { FAMILY_OUTPUT_RULES, diffPhysics, lintPhysics } from "./rig-template-lint.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const halfbody = join(repoRoot, "rig-templates", "base", "halfbody");

async function scratch() {
  return mkdtemp(join(tmpdir(), "geny-rig-template-lint-"));
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

// C11 회귀는 "opt-in 0건" 베이스라인에서 시작해야 결정적이다. 세션 100 에서 halfbody
// v1.3.0 Face 14 파츠에 `parameter_ids` 가 추가된 뒤로 copyV13 만 하면 `parts_with_bindings`
// 가 0 이 아니므로 테스트 하드코딩이 template 진화에 브리틀해진다. 이 헬퍼는 spec 파일의
// `parameter_ids` 필드만 제거 (다른 필드는 원본 보존 불가능하지만 C11 시험 범위에선 무관 —
// 관심 축은 `parameter_ids` 존재/id 존재성 뿐).
async function stripAllParameterIds(dir) {
  const partsDir = join(dir, "parts");
  const entries = await readdir(partsDir);
  for (const name of entries) {
    if (!name.endsWith(".spec.json")) continue;
    const path = join(partsDir, name);
    const spec = JSON.parse(await readFile(path, "utf8"));
    if ("parameter_ids" in spec) {
      delete spec.parameter_ids;
      await writeFile(path, JSON.stringify(spec, null, 2));
    }
  }
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
  // 베이스라인을 결정적으로 만들기 위해 copy 직후 모든 parameter_ids 를 제거하고 시작한다.
  {
    const dir = await scratch();
    await copyV13(dir);
    await stripAllParameterIds(dir);
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
    await stripAllParameterIds(dir);
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
    await stripAllParameterIds(dir);
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

  // 2o) C11 — 기존 rig-template 전체가 C11 오류 0 (세션 99 + 세션 100 Face 14 opt-in 포함)
  // 세션 99 시점엔 parts_with_bindings=0 이었으나, 세션 100 에서 halfbody v1.3.0 Face 14 파츠에
  // opt-in 이 추가됐다. 이 테스트의 초점은 "공식 템플릿은 C11 를 통과한다" 축 — 구체적인 opt-in
  // 카운트는 template 진화에 맡기고 C11 오류 0 + parts_checked 총파츠수 고정만 확인.
  {
    const res = await lintPhysics(join(halfbody, "v1.3.0"));
    const c11 = res.errors.filter((e) => e.startsWith("C11"));
    assert.equal(c11.length, 0, `halfbody v1.3.0 C11 errors: ${res.errors.join(" / ")}`);
    assert.equal(res.summary.parts_checked, 30);
    assert.ok(
      res.summary.parts_with_bindings >= 0 && res.summary.parts_with_bindings <= res.summary.parts_checked,
      `parts_with_bindings=${res.summary.parts_with_bindings} (0..30 범위)`,
    );
    console.log("  ✓ C11 공식 halfbody v1.3.0 통과 (opt-in 카운트는 template 진화에 위임)");
  }

  // 2p) C12 — deformers.json nodes[].params_in 에 없는 id (세션 108)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    const target = def.nodes.find((n) => n.id === "head_pose_rot");
    assert.ok(target, "head_pose_rot 노드가 v1.3.0 에 있어야 함");
    target.params_in = [...target.params_in, "not_a_param_xyz"];
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const c12 = res.errors.filter((e) => e.startsWith("C12"));
    assert.equal(c12.length, 1, `expected 1 C12 error, got: ${res.errors.join(" / ")}`);
    assert.ok(c12[0].includes("not_a_param_xyz"));
    assert.ok(c12[0].includes("head_pose_rot"));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C12 deformers.params_in 가 parameters.json 에 없을 때 차단");
  }

  // 2q) C12 — 빈 params_in (root, body_visual 등 컨테이너) 은 no-op (세션 108)
  {
    const dir = await scratch();
    await copyV13(dir);
    const res = await lintPhysics(dir);
    const c12 = res.errors.filter((e) => e.startsWith("C12"));
    assert.equal(c12.length, 0, `clean v1.3.0 deformers 에서 C12 0 이어야 함: ${res.errors.join(" / ")}`);
    assert.ok(res.summary.deformer_nodes_checked > 0, "deformer_nodes_checked > 0");
    assert.ok(
      res.summary.deformer_params_in_checked > 0,
      "deformer_params_in_checked > 0 (v1.3.0 은 빈 params_in 노드 + 비어있지 않은 노드 혼재)",
    );
    console.log("  ✓ C12 빈 params_in 컨테이너 노드는 no-op (clean v1.3.0)");
  }

  // 2r) C12 — deformers.json 누락 시 no-op (세션 108)
  {
    const dir = await scratch();
    await copyV13(dir);
    await rm(join(dir, "deformers.json"));
    const res = await lintPhysics(dir);
    const c12 = res.errors.filter((e) => e.startsWith("C12"));
    assert.equal(c12.length, 0);
    assert.equal(res.summary.deformer_nodes_checked, 0);
    assert.equal(res.summary.deformer_params_in_checked, 0);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C12 deformers.json 누락 시 no-op");
  }

  // 2s) C12 — 모든 공식 템플릿이 C12 통과 + 카운트 sanity (세션 108)
  {
    for (const v of ["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"]) {
      const res = await lintPhysics(join(halfbody, v));
      const c12 = res.errors.filter((e) => e.startsWith("C12"));
      assert.equal(c12.length, 0, `halfbody ${v} C12 errors: ${res.errors.join(" / ")}`);
      assert.ok(res.summary.deformer_nodes_checked > 0, `${v} 노드 수 > 0`);
      assert.ok(res.summary.deformer_params_in_checked > 0, `${v} params_in 수 > 0`);
    }
    const fb = await lintPhysics(join(repoRoot, "rig-templates", "base", "fullbody", "v1.0.0"));
    const c12fb = fb.errors.filter((e) => e.startsWith("C12"));
    assert.equal(c12fb.length, 0, `fullbody v1.0.0 C12 errors: ${fb.errors.join(" / ")}`);
    assert.ok(fb.summary.deformer_nodes_checked > 0);
    console.log("  ✓ C12 공식 halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 통과");
  }

  // 2t) C13 — 중복 노드 id (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    // ahoge_warp 를 한번 더 복제해서 중복 id 생성.
    const ahoge = def.nodes.find((n) => n.id === "ahoge_warp");
    def.nodes.push({ ...ahoge });
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const dup = res.errors.filter((e) => e.startsWith("C13-duplicate"));
    assert.equal(dup.length, 1, `expected 1 C13-duplicate, got: ${res.errors.join(" / ")}`);
    assert.ok(dup[0].includes("ahoge_warp"));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-duplicate 중복 노드 id 차단");
  }

  // 2u) C13 — root_id 가 nodes 에 없음 (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    def.root_id = "ghost_root";
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const missing = res.errors.filter((e) => e.startsWith("C13-root-missing"));
    assert.equal(missing.length, 1, `expected 1 C13-root-missing, got: ${res.errors.join(" / ")}`);
    assert.ok(missing[0].includes("ghost_root"));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-root-missing root_id 가 nodes 에 없을 때 차단");
  }

  // 2v) C13 — root 노드의 parent 가 null 이 아님 (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    const root = def.nodes.find((n) => n.id === def.root_id);
    root.parent = "overall_warp"; // 순환 유도
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const rp = res.errors.filter((e) => e.startsWith("C13-root-parent"));
    assert.equal(rp.length, 1, `expected 1 C13-root-parent, got: ${res.errors.join(" / ")}`);
    assert.ok(rp[0].includes('"root"'));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-root-parent root 의 parent 가 null 이 아닐 때 차단");
  }

  // 2w) C13 — 비-root 노드의 parent 가 미존재 id (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    const target = def.nodes.find((n) => n.id === "ahoge_warp");
    target.parent = "not_a_node_xyz";
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const pm = res.errors.filter((e) => e.startsWith("C13-parent-missing"));
    assert.equal(pm.length, 1, `expected 1 C13-parent-missing, got: ${res.errors.join(" / ")}`);
    assert.ok(pm[0].includes("ahoge_warp"));
    assert.ok(pm[0].includes("not_a_node_xyz"));
    // ahoge_warp 가 끊겨 고아로도 감지됨.
    const orphans = res.errors.filter((e) => e.startsWith("C13-orphan"));
    assert.ok(orphans.some((e) => e.includes("ahoge_warp")), `parent 끊긴 노드는 orphan 으로도 잡힘: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-parent-missing 비-root parent 가 미존재 id 일 때 차단");
  }

  // 2x) C13 — 비-root 노드의 parent 가 null (다중 루트 금지) (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    const target = def.nodes.find((n) => n.id === "ahoge_warp");
    target.parent = null;
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const nrn = res.errors.filter((e) => e.startsWith("C13-non-root-null-parent"));
    assert.equal(nrn.length, 1, `expected 1 C13-non-root-null-parent, got: ${res.errors.join(" / ")}`);
    assert.ok(nrn[0].includes("ahoge_warp"));
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-non-root-null-parent 다중 루트 차단");
  }

  // 2y) C13 — parent 체인 사이클 (세션 109). overall_warp.parent = ahoge_warp 로 설정 하면
  // ahoge_warp.parent=head_pose_rot→neck_warp→body_pose_warp→breath_warp→overall_warp→ahoge_warp 로 사이클.
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    const overall = def.nodes.find((n) => n.id === "overall_warp");
    overall.parent = "ahoge_warp";
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const cyc = res.errors.filter((e) => e.startsWith("C13-cycle"));
    assert.ok(cyc.length >= 1, `expected >=1 C13-cycle, got: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-cycle parent 체인 사이클 탐지");
  }

  // 2z) C13 — 고아 노드 (root 에서 도달 불가) (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    const deformersPath = join(dir, "deformers.json");
    const def = JSON.parse(await readFile(deformersPath, "utf8"));
    // 완전 분리된 서브트리 추가. parent 가 자신의 형제(island 루트) 로, island 루트의 parent 는
    // 다른 island 노드를 가리켜 root 에서 도달 불가능하지만 parent-missing 은 아니어야 함.
    def.nodes.push({
      id: "island_a",
      type: "warp",
      parent: "island_b",
      params_in: [],
    });
    def.nodes.push({
      id: "island_b",
      type: "warp",
      parent: "island_a",
      params_in: [],
    });
    await writeFile(deformersPath, JSON.stringify(def, null, 2));
    const res = await lintPhysics(dir);
    const orphans = res.errors.filter((e) => e.startsWith("C13-orphan"));
    assert.ok(orphans.some((e) => e.includes("island_a")), `island_a orphan: ${res.errors.join(" / ")}`);
    assert.ok(orphans.some((e) => e.includes("island_b")), `island_b orphan: ${res.errors.join(" / ")}`);
    // island pair 는 자체 사이클이기도 하므로 C13-cycle 도 같이 잡혀야 함.
    const cyc = res.errors.filter((e) => e.startsWith("C13-cycle"));
    assert.ok(cyc.length >= 1, `island pair 는 사이클: ${res.errors.join(" / ")}`);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13-orphan root 에서 도달 불가 노드 탐지");
  }

  // 2aa) C13 — 모든 공식 템플릿이 C13 통과 + tree_checked sanity (세션 109)
  {
    for (const v of ["v1.0.0", "v1.1.0", "v1.2.0", "v1.3.0"]) {
      const res = await lintPhysics(join(halfbody, v));
      const c13 = res.errors.filter((e) => e.startsWith("C13"));
      assert.equal(c13.length, 0, `halfbody ${v} C13 errors: ${res.errors.join(" / ")}`);
      assert.equal(res.summary.deformer_tree_checked, true, `${v} tree_checked true`);
    }
    const fb = await lintPhysics(join(repoRoot, "rig-templates", "base", "fullbody", "v1.0.0"));
    const c13fb = fb.errors.filter((e) => e.startsWith("C13"));
    assert.equal(c13fb.length, 0, `fullbody v1.0.0 C13 errors: ${fb.errors.join(" / ")}`);
    assert.equal(fb.summary.deformer_tree_checked, true);
    console.log("  ✓ C13 공식 halfbody v1.0.0..v1.3.0 + fullbody v1.0.0 통과");
  }

  // 2ab) C13 — deformers.json 누락 시 tree_checked=false + no-op (세션 109)
  {
    const dir = await scratch();
    await copyV13(dir);
    await rm(join(dir, "deformers.json"));
    const res = await lintPhysics(dir);
    const c13 = res.errors.filter((e) => e.startsWith("C13"));
    assert.equal(c13.length, 0);
    assert.equal(res.summary.deformer_tree_checked, false);
    await rm(dir, { recursive: true, force: true });
    console.log("  ✓ C13 deformers.json 누락 시 tree_checked=false no-op");
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

  console.log("[rig-template-lint] ✅ all checks pass");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
