import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { MIGRATORS, migrate, planMigrations } from "../src/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// 컴파일 후 위치: packages/migrator/dist-test/tests/migrate.test.js → 4 단계 위가 repoRoot.
const repoRoot = resolve(__dirname, "..", "..", "..", "..");

function templatePath(rel: string): string {
  return join(repoRoot, rel);
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function withTempOut<T>(
  fn: (out: string, cleanup: () => Promise<void>) => Promise<T>,
): Promise<T> {
  const base = await mkdtemp(join(tmpdir(), "geny-migrator-test-"));
  const out = join(base, "migrated");
  try {
    return await fn(out, async () => {
      await rm(base, { recursive: true, force: true });
    });
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

test("planMigrations 는 v1.0.0 에서 전체 3 hop 체인을 반환", () => {
  const plan = planMigrations("1.0.0");
  assert.equal(plan.length, 3);
  assert.deepEqual(
    plan.map((m) => `${m.from}→${m.to}`),
    ["1.0.0→1.1.0", "1.1.0→1.2.0", "1.2.0→1.3.0"],
  );
});

test("planMigrations 는 v1.2.0 에서 단일 hop 을 반환", () => {
  const plan = planMigrations("1.2.0");
  assert.equal(plan.length, 1);
  assert.equal(plan[0]!.from, "1.2.0");
  assert.equal(plan[0]!.to, "1.3.0");
});

test("planMigrations 는 unsupported 버전에 빈 배열 반환", () => {
  assert.deepEqual(planMigrations("2.0.0"), []);
  assert.deepEqual(planMigrations(""), []);
});

test("MIGRATORS 레지스트리는 3 엔트리 chain 을 노출", () => {
  assert.equal(MIGRATORS.length, 3);
  const hops = MIGRATORS.map((m) => `${m.from}→${m.to}`);
  assert.deepEqual(hops, [
    "1.0.0→1.1.0",
    "1.1.0→1.2.0",
    "1.2.0→1.3.0",
  ]);
});

test("migrate(v1.0.0) 는 v1.3.0 로 version bump + cubism_mapping 누적", async () => {
  await withTempOut(async (out) => {
    const result = await migrate(
      templatePath("rig-templates/base/halfbody/v1.0.0"),
      out,
    );
    assert.equal(result.targetVersion, "1.3.0");
    assert.equal(result.appliedSteps.length, 3);
    assert.equal(result.todos.length, 3);

    const manifest = await readJson(join(out, "template.manifest.json"));
    assert.equal(manifest.version, "1.3.0");
    for (const key of [
      "arm_l_angle",
      "arm_r_angle",
      "cloth_main_fuwa",
      "ahoge_sway",
      "accessory_back_sway",
      "accessory_front_sway",
    ]) {
      assert.ok(
        manifest.cubism_mapping[key],
        `cubism_mapping.${key} 가 누적 등록되어야 함`,
      );
    }

    const params = await readJson(join(out, "parameters.json"));
    const ids = new Set(params.parameters.map((p: any) => p.id));
    for (const required of [
      "arm_l_angle",
      "cloth_main_fuwa",
      "ahoge_sway",
      "accessory_back_sway",
      "accessory_front_sway",
    ]) {
      assert.ok(ids.has(required), `parameters.json 에 ${required} 가 있어야 함`);
    }

    const report = await readFile(join(out, "MIGRATION_REPORT.md"), "utf8");
    assert.match(report, /1\.0\.0 → 1\.1\.0/);
    assert.match(report, /1\.2\.0 → 1\.3\.0/);
    assert.match(report, /physics\.json/);
  });
});

test("migrate(v1.2.0) 는 단일 hop + mechanical patch 3종을 적용", async () => {
  await withTempOut(async (out) => {
    const result = await migrate(
      templatePath("rig-templates/base/halfbody/v1.2.0"),
      out,
    );
    assert.equal(result.targetVersion, "1.3.0");
    assert.equal(result.appliedSteps.length, 1);

    const manifest = await readJson(join(out, "template.manifest.json"));
    assert.equal(manifest.cubism_mapping.ahoge_sway, "ParamAhogeSway");
    assert.equal(
      manifest.cubism_mapping.accessory_back_sway,
      "ParamAccessoryBackSway",
    );
    assert.equal(
      manifest.cubism_mapping.accessory_front_sway,
      "ParamAccessoryFrontSway",
    );

    const ahogePart = await readJson(join(out, "parts", "ahoge.spec.json"));
    assert.equal(ahogePart.slot_id, "ahoge");
    assert.equal(ahogePart.deformation_parent, "ahoge_warp");
    assert.equal(ahogePart.cubism_part_id, "PartAhoge");

    const accBack = await readJson(
      join(out, "parts", "accessory_back.spec.json"),
    );
    const accFront = await readJson(
      join(out, "parts", "accessory_front.spec.json"),
    );
    assert.equal(accBack.deformation_parent, "accessory_back_warp");
    assert.equal(accFront.deformation_parent, "accessory_front_warp");

    const def = await readJson(join(out, "deformers.json"));
    const defIds = def.nodes.map((n: any) => n.id);
    for (const id of [
      "ahoge_warp",
      "accessory_back_warp",
      "accessory_front_warp",
    ]) {
      assert.ok(defIds.includes(id), `deformers.json 에 ${id} 추가되어야 함`);
    }
    const ahogeWarp = def.nodes.find((n: any) => n.id === "ahoge_warp");
    assert.equal(ahogeWarp.parent, "head_pose_rot");
    assert.deepEqual(ahogeWarp.params_in, ["ahoge_sway"]);

    const mapping = await readFile(
      join(out, "physics", "mao_pro_mapping.md"),
      "utf8",
    );
    assert.match(mapping, /## 6\. v1\.3\.0/);
    assert.match(mapping, /accessory_sway_phys/);

    // 물리 튜닝만 수동 TODO (세션 37 D1).
    assert.equal(result.todos[0]!.todos.length, 1);
  });
});

test("migrate 는 결정론 (동일 src → 동일 결과)", async () => {
  const runOnce = async () =>
    withTempOut(async (out) => {
      await migrate(
        templatePath("rig-templates/base/halfbody/v1.2.0"),
        out,
      );
      const manifest = await readFile(
        join(out, "template.manifest.json"),
        "utf8",
      );
      const params = await readFile(join(out, "parameters.json"), "utf8");
      const deformers = await readFile(join(out, "deformers.json"), "utf8");
      return { manifest, params, deformers };
    });
  const a = await runOnce();
  const b = await runOnce();
  assert.equal(a.manifest, b.manifest);
  assert.equal(a.params, b.params);
  assert.equal(a.deformers, b.deformers);
});

test("migrate 는 outDir 이 이미 존재하면 거부", async () => {
  await withTempOut(async (out) => {
    await migrate(templatePath("rig-templates/base/halfbody/v1.2.0"), out);
    await assert.rejects(
      migrate(templatePath("rig-templates/base/halfbody/v1.2.0"), out),
      /refusing to write/,
    );
  });
});
