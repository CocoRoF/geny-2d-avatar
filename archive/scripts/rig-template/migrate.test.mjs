#!/usr/bin/env node
// scripts/rig-template/migrate.test.mjs
// migrate.mjs 의 순방향 체인 (v1.0.0 → v1.3.0) 회귀.
//
// 수행:
//  1) 임시 디렉터리에 v1.0.0 / v1.2.0 를 각각 migrate 실행.
//  2) 결과 manifest.version 과 parameters 개수 · 새 cubism_mapping 엔트리 존재 검증.
//  3) v1.2.0 → v1.3.0 경로가 3 physics 출력 파라미터 (`ahoge_sway`, `accessory_back_sway`,
//     `accessory_front_sway`) 를 추가하고 manifest cubism_mapping 에 반영하는지 확인.
//
// node --test 대신 표준 CLI 엔트리 — test-golden.mjs step 14 로 호출된다.

import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");
const migrateScript = join(__dirname, "migrate.mjs");

function run(cmd, args) {
  return new Promise((ok, fail) => {
    const c = spawn(cmd, args, { stdio: "pipe" });
    let stderr = "";
    c.stderr.on("data", (d) => (stderr += d.toString()));
    c.on("error", fail);
    c.on("exit", (code) => {
      if (code === 0) ok();
      else fail(new Error(`${cmd} ${args.join(" ")} → exit ${code}\n${stderr}`));
    });
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function migrateCase(srcRel) {
  const src = join(repoRoot, srcRel);
  const base = await mkdtemp(join(tmpdir(), "geny-rig-migrate-"));
  const out = join(base, "migrated");
  await run("node", [migrateScript, src, out]);
  const manifest = await readJson(join(out, "template.manifest.json"));
  const params = await readJson(join(out, "parameters.json"));
  const report = await readFile(join(out, "MIGRATION_REPORT.md"), "utf8");
  return { out, base, manifest, params, report };
}

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch {
    return null;
  }
}

async function main() {
  const failures = [];

  // Case A: v1.0.0 → v1.3.0 전체 체인
  try {
    const { base, manifest, params, report } = await migrateCase(
      "rig-templates/base/halfbody/v1.0.0",
    );
    try {
      assert.equal(manifest.version, "1.3.0", "v1.0.0→ 최신 version bump");
      for (const key of [
        "arm_l_angle",
        "cloth_main_fuwa",
        "ahoge_sway",
        "accessory_back_sway",
        "accessory_front_sway",
      ]) {
        assert.ok(
          manifest.cubism_mapping[key],
          `cubism_mapping.${key} 가 전체 체인에서 누적 등록되어야 함`,
        );
      }
      const ids = new Set(params.parameters.map((p) => p.id));
      assert.ok(ids.has("arm_l_angle"));
      assert.ok(ids.has("cloth_main_fuwa"));
      assert.ok(ids.has("ahoge_sway"));
      assert.ok(ids.has("accessory_back_sway"));
      assert.ok(ids.has("accessory_front_sway"));
      assert.match(report, /1\.0\.0 → 1\.1\.0/);
      assert.match(report, /1\.2\.0 → 1\.3\.0/);
      // 세션 37 — v1.3.0 hop 이 남기는 유일한 저자 TODO 는 physics.json.
      assert.match(report, /physics\.json/);
      assert.doesNotMatch(report, /ahoge\.spec\.json/);
      console.error("[migrate.test] ✔ v1.0.0 → v1.3.0 full chain");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  } catch (err) {
    failures.push(`v1.0.0 → v1.3.0: ${err.message}`);
  }

  // Case B: v1.2.0 → v1.3.0 단일 hop
  try {
    const { out, base, manifest, params, report } = await migrateCase(
      "rig-templates/base/halfbody/v1.2.0",
    );
    try {
      assert.equal(manifest.version, "1.3.0");
      assert.equal(manifest.cubism_mapping.ahoge_sway, "ParamAhogeSway");
      assert.equal(
        manifest.cubism_mapping.accessory_back_sway,
        "ParamAccessoryBackSway",
      );
      assert.equal(
        manifest.cubism_mapping.accessory_front_sway,
        "ParamAccessoryFrontSway",
      );
      const newIds = params.parameters
        .filter((p) =>
          ["ahoge_sway", "accessory_back_sway", "accessory_front_sway"].includes(
            p.id,
          ),
        )
        .map((p) => p.id)
        .sort();
      assert.deepEqual(newIds, [
        "accessory_back_sway",
        "accessory_front_sway",
        "ahoge_sway",
      ]);
      for (const p of params.parameters) {
        if (newIds.includes(p.id)) {
          assert.equal(p.physics_output, true, `${p.id} 는 physics_output`);
          assert.equal(p.channel, "extension", `${p.id} 는 extension 채널`);
        }
      }
      // v1.0.0/v1.1.0/v1.2.0 전환 TODO 는 포함되지 않아야 (단일 hop)
      assert.doesNotMatch(report, /1\.0\.0 → 1\.1\.0/);
      assert.match(report, /1\.2\.0 → 1\.3\.0/);
      assert.match(report, /physics\.json/);

      // 세션 37 — mechanical auto-patch 검증.
      const ahogePart = await readJson(join(out, "parts", "ahoge.spec.json"));
      assert.equal(ahogePart.slot_id, "ahoge");
      assert.equal(ahogePart.deformation_parent, "ahoge_warp");
      assert.equal(ahogePart.z_order, 94);
      assert.equal(ahogePart.cubism_part_id, "PartAhoge");

      const accBack = await readJson(join(out, "parts", "accessory_back.spec.json"));
      const accFront = await readJson(
        join(out, "parts", "accessory_front.spec.json"),
      );
      assert.equal(
        accBack.deformation_parent,
        "accessory_back_warp",
        "accessory_back 의 parent 가 신규 warp 로 이동",
      );
      assert.equal(
        accFront.deformation_parent,
        "accessory_front_warp",
        "accessory_front 의 parent 가 신규 warp 로 이동",
      );

      const def = await readJson(join(out, "deformers.json"));
      const defIds = def.nodes.map((n) => n.id);
      for (const id of ["ahoge_warp", "accessory_back_warp", "accessory_front_warp"]) {
        assert.ok(defIds.includes(id), `deformers.json 에 ${id} 추가되어야 함`);
      }
      const layer = def.nodes.find((n) => n.id === "accessories_layer");
      assert.match(
        layer.notes,
        /accessory_back_warp.*accessory_front_warp/,
        "accessories_layer notes 갱신",
      );
      // ahoge_warp 의 parent 는 head_pose_rot (아호게는 머리 직속).
      const ahogeWarp = def.nodes.find((n) => n.id === "ahoge_warp");
      assert.equal(ahogeWarp.parent, "head_pose_rot");
      assert.deepEqual(ahogeWarp.params_in, ["ahoge_sway"]);

      const mapping = await readIfExists(
        join(out, "physics", "mao_pro_mapping.md"),
      );
      assert.ok(mapping, "mao_pro_mapping.md 존재");
      assert.match(mapping, /## 6\. v1\.3\.0/);
      assert.match(mapping, /accessory_sway_phys/);

      // TODO 항목은 1개 (physics.json 만) — 세션 37 D1.
      const todoLines = report.split("\n").filter((l) => l.startsWith("- [ ]"));
      assert.equal(
        todoLines.length,
        1,
        `v1.2.0→v1.3.0 hop 의 수동 TODO 는 1개여야 (실제: ${todoLines.length})`,
      );

      console.error("[migrate.test] ✔ v1.2.0 → v1.3.0 single hop");
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  } catch (err) {
    failures.push(`v1.2.0 → v1.3.0: ${err.message}`);
  }

  // Case C: 재실행(idempotent) — 같은 src 를 두 번 migrate 해도 결과 동일해야 함 (determinism)
  try {
    const a = await migrateCase("rig-templates/base/halfbody/v1.2.0");
    const b = await migrateCase("rig-templates/base/halfbody/v1.2.0");
    try {
      const manA = JSON.stringify(a.manifest);
      const manB = JSON.stringify(b.manifest);
      assert.equal(manA, manB, "manifest 결정론");
      const paramsA = JSON.stringify(a.params);
      const paramsB = JSON.stringify(b.params);
      assert.equal(paramsA, paramsB, "parameters 결정론");
      console.error("[migrate.test] ✔ deterministic");
    } finally {
      await rm(a.base, { recursive: true, force: true });
      await rm(b.base, { recursive: true, force: true });
    }
  } catch (err) {
    failures.push(`determinism: ${err.message}`);
  }

  if (failures.length > 0) {
    process.stderr.write(
      `[migrate.test] ✖ ${failures.length} failure(s):\n  - ${failures.join("\n  - ")}\n`,
    );
    process.exit(1);
  }
  console.error("[migrate.test] ✅ all cases passed");
}

main().catch((err) => {
  process.stderr.write(`[migrate.test] fatal: ${err.stack ?? err}\n`);
  process.exit(1);
});
