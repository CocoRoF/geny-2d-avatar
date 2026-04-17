#!/usr/bin/env node
// scripts/rig-template/migrate.mjs
// 공식 `halfbody` 계열 리그 템플릿 순방향 마이그레이션.
//
// CLI:
//   node scripts/rig-template/migrate.mjs <srcDir> <outDir>
//
// 예:
//   node scripts/rig-template/migrate.mjs rig-templates/base/halfbody/v1.0.0 /tmp/migrated-v1.2.0
//
// 동작:
//   1) <srcDir> 를 <outDir> 로 전체 복사 (outDir 비어 있어야 함).
//   2) template.manifest.json 의 version 을 읽어 현재 버전 감지.
//   3) migrators 레지스트리 순서대로 적용 (v1.0.0 → v1.1.0 → v1.2.0).
//   4) 각 migrator 는 mechanical transform (manifest/parameters 필드 추가·버전 bump) 만 안전하게 수행.
//      파츠 추가/분할, 물리 튜닝, deformers 트리 변경은 <outDir>/MIGRATION_REPORT.md 에 TODO 로 기록.
//
// 의존성: Node 20.11+ built-in 만.
// 결정: migrator 는 보수적 (세션 10 D1). 데이터 손실 없음. downgrade 없음.

import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

/** @typedef {{ from: string; to: string; apply: (outDir: string) => Promise<string[]> }} Migrator */

/** @type {Migrator[]} */
const MIGRATORS = [
  {
    from: "1.0.0",
    to: "1.1.0",
    async apply(outDir) {
      const todos = [];
      await patchJson(join(outDir, "template.manifest.json"), (m) => {
        m.version = "1.1.0";
        m.cubism_mapping = {
          ...m.cubism_mapping,
          arm_pose_variant: "ParamArmPoseVariant",
          arm_l_angle: "ParamArmLAngle",
          arm_r_angle: "ParamArmRAngle",
        };
        return m;
      });
      await patchJson(join(outDir, "parameters.json"), (p) => {
        const existing = new Set(p.parameters.map((x) => x.id));
        for (const def of V1_1_0_NEW_PARAMETERS) {
          if (!existing.has(def.id)) p.parameters.push(def);
        }
        return p;
      });
      todos.push(
        "v1.1.0: arm L/R 단일 파츠 (`arm_l.spec.json`, `arm_r.spec.json`) 를 A/B variant 로 분할해야 합니다. 새로 저작: `parts/arm_{l,r}_{a,b}.spec.json` 4개. UV box/z_order/deformation_parent 는 수동 결정.",
        "v1.1.0: `pose.json` 을 추가하여 `arm_l_a` ↔ `arm_l_b`, `arm_r_a` ↔ `arm_r_b` 의 mutex 포즈 그룹을 선언해야 합니다 (docs/03 §12.1 #3, session 06 참고).",
        "v1.1.0: `deformers.json` 에 `arm_l_warp` / `arm_r_warp` 와 연결 부위를 추가하여 `arm_{l,r}_angle` 을 실제로 반영하도록 해야 합니다.",
        "v1.1.0: `motions/greet_wave.motion.json` 이 `arm_*` 파라미터를 구동하도록 갱신 (세션 06 D6).",
      );
      return todos;
    },
  },
  {
    from: "1.1.0",
    to: "1.2.0",
    async apply(outDir) {
      const todos = [];
      await patchJson(join(outDir, "template.manifest.json"), (m) => {
        m.version = "1.2.0";
        m.cubism_mapping = {
          ...m.cubism_mapping,
          cloth_main_fuwa: "ParamClothMainFuwa",
          hair_front_fuwa: "ParamHairFrontFuwa",
          hair_side_fuwa_l: "ParamHairSideFuwaL",
          hair_side_fuwa_r: "ParamHairSideFuwaR",
          hair_back_fuwa: "ParamHairBackFuwa",
          overall_x: "ParamOverallX",
          overall_y: "ParamOverallY",
          overall_rotate: "ParamOverallRotate",
        };
        return m;
      });
      await patchJson(join(outDir, "parameters.json"), (p) => {
        const existing = new Set(p.parameters.map((x) => x.id));
        for (const def of V1_2_0_NEW_PARAMETERS) {
          if (!existing.has(def.id)) p.parameters.push(def);
        }
        return p;
      });
      todos.push(
        "v1.2.0: `parts/cloth_main.spec.json` 을 추가해야 합니다 (docs/03 §12.1 #1, session 07).",
        "v1.2.0: `deformers.json` 에 `overall_warp` (전체 평행이동/회전) 과 `cloth_warp` 를 추가해야 합니다.",
        "v1.2.0: `physics/physics.json` 을 4 setting → 9 setting 으로 확장 (sway L/R 분리 + Fuwa 5). `physics_setting_count` · `total_input_count` · `total_output_count` · `vertex_count` 를 실제 설정에 맞게 재계산.",
      );
      return todos;
    },
  },
];

const V1_1_0_NEW_PARAMETERS = [
  {
    id: "arm_pose_variant",
    display_name: { en: "Arm Pose Variant", ko: "팔 포즈 variant", ja: "腕 ポーズ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: true,
    group: "body",
    channel: "core",
    cubism: "ParamArmPoseVariant",
    notes: "0=A (중립), 1=B (교체 포즈). Pose3 mutex 로 A/B 파츠 동시 노출 방지. docs/03 §12.1 #3.",
  },
  {
    id: "arm_l_angle",
    display_name: { en: "Arm Angle (L)", ko: "왼팔 각도", ja: "左腕 角度" },
    unit: "degree",
    range: [-30, 30],
    default: 0,
    required: true,
    group: "body",
    channel: "core",
    cubism: "ParamArmLAngle",
    notes: "캐릭터 왼팔 회전. arm_l_warp 의 주 입력. greet.wave 포함 제스처 모션에서 사용.",
  },
  {
    id: "arm_r_angle",
    display_name: { en: "Arm Angle (R)", ko: "오른팔 각도", ja: "右腕 角度" },
    unit: "degree",
    range: [-30, 30],
    default: 0,
    required: true,
    group: "body",
    channel: "core",
    cubism: "ParamArmRAngle",
  },
];

const V1_2_0_NEW_PARAMETERS = [
  {
    id: "cloth_main_fuwa",
    display_name: { en: "Cloth Main Fuwa", ko: "상의 부풀림", ja: "衣装 フワ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: false,
    group: "body",
    channel: "extension",
    cubism: "ParamClothMainFuwa",
    physics_output: true,
    notes: "body_breath 기반 의상 볼륨 팽창. body_angle_x 가 방향 수정자. docs/03 §12.1 #1.",
  },
  {
    id: "hair_front_fuwa",
    display_name: { en: "Hair Front Fuwa", ko: "앞머리 부풀림", ja: "前髪 フワ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: false,
    group: "hair",
    channel: "extension",
    cubism: "ParamHairFrontFuwa",
    physics_output: true,
    notes: "body_breath 기반 앞머리 볼륨.",
  },
  {
    id: "hair_side_fuwa_l",
    display_name: { en: "Hair Side Fuwa (L)", ko: "왼옆머리 부풀림", ja: "左側髪 フワ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: false,
    group: "hair",
    channel: "extension",
    cubism: "ParamHairSideFuwaL",
    physics_output: true,
  },
  {
    id: "hair_side_fuwa_r",
    display_name: { en: "Hair Side Fuwa (R)", ko: "오른옆머리 부풀림", ja: "右側髪 フワ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: false,
    group: "hair",
    channel: "extension",
    cubism: "ParamHairSideFuwaR",
    physics_output: true,
  },
  {
    id: "hair_back_fuwa",
    display_name: { en: "Hair Back Fuwa", ko: "뒷머리 부풀림", ja: "後髪 フワ" },
    unit: "normalized",
    range: [0, 1],
    default: 0,
    required: false,
    group: "hair",
    channel: "extension",
    cubism: "ParamHairBackFuwa",
    physics_output: true,
  },
];

async function main() {
  const [srcArg, outArg] = process.argv.slice(2);
  if (!srcArg || !outArg) {
    process.stderr.write(
      "usage: node scripts/rig-template/migrate.mjs <srcDir> <outDir>\n",
    );
    process.exit(2);
  }
  const srcDir = resolve(srcArg);
  const outDir = resolve(outArg);

  if (existsSync(outDir)) {
    const s = await stat(outDir);
    if (s.isDirectory()) {
      process.stderr.write(`migrate: refusing to write to existing ${outDir}\n`);
      process.exit(2);
    }
  }

  const manifestPath = join(srcDir, "template.manifest.json");
  if (!existsSync(manifestPath)) {
    process.stderr.write(`migrate: no template.manifest.json at ${srcDir}\n`);
    process.exit(2);
  }
  const srcManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const srcVersion = String(srcManifest.version ?? "");

  const plan = planMigrations(srcVersion);
  if (plan.length === 0) {
    process.stderr.write(
      `migrate: no migrators for ${srcVersion} — already latest or unsupported. Available: ${MIGRATORS
        .map((m) => `${m.from}→${m.to}`)
        .join(", ")}\n`,
    );
    process.exit(2);
  }

  await mkdir(outDir, { recursive: true });
  await cp(srcDir, outDir, { recursive: true });

  const allTodos = [];
  for (const mig of plan) {
    process.stderr.write(`migrate: applying ${mig.from} → ${mig.to}\n`);
    const todos = await mig.apply(outDir);
    allTodos.push({ from: mig.from, to: mig.to, todos });
  }

  await writeReport(join(outDir, "MIGRATION_REPORT.md"), srcVersion, allTodos);
  process.stderr.write(
    `migrate: ✅ done. target version ${plan[plan.length - 1].to}. Manual TODOs → ${join(outDir, "MIGRATION_REPORT.md")}\n`,
  );
}

function planMigrations(from) {
  const plan = [];
  let cursor = from;
  while (true) {
    const next = MIGRATORS.find((m) => m.from === cursor);
    if (!next) break;
    plan.push(next);
    cursor = next.to;
  }
  return plan;
}

async function patchJson(path, fn) {
  const raw = await readFile(path, "utf8");
  const doc = JSON.parse(raw);
  const next = fn(doc);
  const serialized = JSON.stringify(next, null, 2) + "\n";
  await writeFile(path, serialized, "utf8");
}

async function writeReport(path, srcVersion, groups) {
  const lines = [];
  lines.push(`# Migration Report`);
  lines.push("");
  lines.push(`- Source version: \`${srcVersion}\``);
  lines.push(
    `- Applied steps: ${groups.map((g) => `\`${g.from}→${g.to}\``).join(", ")}`,
  );
  lines.push("");
  lines.push(
    "이 파일은 자동 마이그레이션이 **수행하지 않은** 수동 작업 목록입니다. 파츠 spec, 물리 튜닝, deformers 트리, pose 그룹 등은 저작자 판단이 필요합니다.",
  );
  lines.push("");
  for (const g of groups) {
    lines.push(`## ${g.from} → ${g.to}`);
    lines.push("");
    if (g.todos.length === 0) {
      lines.push("- (자동 이행 항목만 있었음. 수동 작업 없음.)");
    } else {
      for (const t of g.todos) lines.push(`- [ ] ${t}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(
    "마이그레이션 후 `pnpm run validate:schemas` 와 `pnpm run test:golden` 을 실행해 회귀를 확인하세요.",
  );
  lines.push("");
  await writeFile(path, lines.join("\n"), "utf8");
}

main().catch((err) => {
  process.stderr.write(`migrate: ${err.stack ?? err}\n`);
  process.exit(1);
});
