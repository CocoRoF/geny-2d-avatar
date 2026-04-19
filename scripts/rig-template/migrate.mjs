#!/usr/bin/env node
// scripts/rig-template/migrate.mjs
// 공식 `halfbody` 계열 리그 템플릿 순방향 마이그레이션.
//
// CLI:
//   node scripts/rig-template/migrate.mjs <srcDir> <outDir>
//
// 예:
//   node scripts/rig-template/migrate.mjs rig-templates/base/halfbody/v1.0.0 /tmp/migrated-v1.3.0
//
// 동작:
//   1) <srcDir> 를 <outDir> 로 전체 복사 (outDir 비어 있어야 함).
//   2) template.manifest.json 의 version 을 읽어 현재 버전 감지.
//   3) migrators 레지스트리 순서대로 적용 (v1.0.0 → v1.1.0 → v1.2.0 → v1.3.0).
//   4) 각 migrator 는 mechanical transform (manifest/parameters 필드 추가·버전 bump) 만 안전하게 수행.
//      파츠 추가/분할, 물리 튜닝, deformers 트리 변경은 <outDir>/MIGRATION_REPORT.md 에 TODO 로 기록.
//
// 의존성: Node 20.11+ built-in 만.
// 결정: migrator 는 보수적 (세션 10 D1). 데이터 손실 없음. downgrade 없음.

import { cp, mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
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
  {
    from: "1.2.0",
    to: "1.3.0",
    async apply(outDir) {
      const todos = [];
      await patchJson(join(outDir, "template.manifest.json"), (m) => {
        m.version = "1.3.0";
        m.cubism_mapping = {
          ...m.cubism_mapping,
          ahoge_sway: "ParamAhogeSway",
          accessory_back_sway: "ParamAccessoryBackSway",
          accessory_front_sway: "ParamAccessoryFrontSway",
        };
        return m;
      });
      await patchJson(join(outDir, "parameters.json"), (p) => {
        const existing = new Set(p.parameters.map((x) => x.id));
        for (const def of V1_3_0_NEW_PARAMETERS) {
          if (!existing.has(def.id)) p.parameters.push(def);
        }
        return p;
      });

      // 세션 37 — mechanical patches (구조적으로 결정론적, 저자 판단 불필요).
      // 1) parts/ahoge.spec.json 신규 파일 — 기존 파일 있으면 보존.
      await writeIfAbsent(
        join(outDir, "parts", "ahoge.spec.json"),
        JSON.stringify(V1_3_0_AHOGE_PART, null, 2) + "\n",
      );
      // 2) parts/accessory_back|front.spec.json 의 deformation_parent 를 각 전용 warp 로 이동.
      await patchJson(join(outDir, "parts", "accessory_back.spec.json"), (p) => {
        if (p.deformation_parent === "accessories_layer") {
          p.deformation_parent = "accessory_back_warp";
        }
        return p;
      });
      await patchJson(join(outDir, "parts", "accessory_front.spec.json"), (p) => {
        if (p.deformation_parent === "accessories_layer") {
          p.deformation_parent = "accessory_front_warp";
        }
        return p;
      });
      // 3) deformers.json — accessories_layer notes 갱신 + 3 warp 삽입(`hair_back_warp` 앞).
      await patchJson(join(outDir, "deformers.json"), (d) => {
        const existingIds = new Set(d.nodes.map((x) => x.id));
        for (const node of d.nodes) {
          if (node.id === "accessories_layer") {
            node.notes = V1_3_0_ACCESSORIES_LAYER_NOTES;
          }
        }
        const insertAt = d.nodes.findIndex((x) => x.id === "hair_back_warp");
        const toInsert = V1_3_0_NEW_DEFORMERS.filter((n) => !existingIds.has(n.id));
        if (toInsert.length > 0) {
          if (insertAt >= 0) {
            d.nodes.splice(insertAt, 0, ...toInsert);
          } else {
            d.nodes.push(...toInsert);
          }
        }
        return d;
      });
      // 4) physics/mao_pro_mapping.md — §6 appendix 추가(없을 때만).
      await appendIfMissing(
        join(outDir, "physics", "mao_pro_mapping.md"),
        "## 6. v1.3.0 추가분",
        V1_3_0_MAO_PRO_APPENDIX,
      );

      // 5) 유일하게 남는 authoring gate — physics.json 9→12 setting 재구성.
      //    counts/vertices/weights 는 물리 튜닝 결정이므로 migrator 가 자동 패치하지 않는다
      //    (세션 37 D1 — docs/03 §12.1 #2 에 고정).
      todos.push(
        "v1.3.0: `physics/physics.json` 을 9 setting → 12 setting 으로 확장 — 이것이 **유일한 저자 개입 지점**입니다. 추가할 3 setting: `ahoge_sway_phys` (입력: head_angle_x 70w + head_angle_y 30w + body_angle_x 20w → `ahoge_sway`, mobility 1.0, delay 0.55, radius 5) / `accessory_sway_phys` (입력: body_angle_x 60w + body_angle_z 40w → 공유 출력 `accessory_back_sway` scale=1 weight=80 + `accessory_front_sway` scale=0.8 weight=70) / `body_breath_phys` (입력: body_breath 100w + body_angle_y 20w → `body_breath_phys` weight=60 Y). 저작 후 `meta.physics_setting_count=12` / `meta.total_input_count=31` / `meta.total_output_count=13` / `meta.vertex_count=24` 로 갱신. 참고: `rig-templates/base/halfbody/v1.3.0/physics/physics.json` (세션 31 authored 결과).",
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

// 세션 37 — v1.2.0 → v1.3.0 mechanical patches 데이터.
// 물리 튜닝은 여전히 저자 개입이지만, 파츠 spec / deformers 트리 / mao_pro 매핑 문서 블록은
// 구조적으로 결정론이므로 migrator 가 직접 이식한다.

const V1_3_0_AHOGE_PART = {
  schema_version: "v1",
  slot_id: "ahoge",
  role: "hair_front",
  required: false,
  template: "tpl.base.v1.halfbody",
  template_version: "^1",
  deformation_parent: "ahoge_warp",
  category: "hair",
  canvas_px: { w: 2048, h: 2048 },
  uv_box_px: { x: 864, y: 32, w: 320, h: 240 },
  anchor: {
    type: "head_top_center",
    x_frac: 0.5,
    y_frac: 0.05,
    detect_method: "alpha_bbox_center_v1",
  },
  z_order: 94,
  visual: {
    alpha_edge_policy: "feather_2px",
    line_weight_hint_px: 2.0,
    color_context: "hair",
  },
  generation: {
    prompt_scope: ["ahoge_shape", "hair_color", "hair_texture"],
    negative_prompt: ["face", "eyes", "background", "text", "watermark"],
    reference_mask: "masks/ahoge_mask.png",
    max_iter: 2,
  },
  dependencies: ["hair_front"],
  validation: {
    must_cover_anchor: false,
    min_alpha_area_frac: 0.002,
    max_alpha_area_frac: 0.05,
  },
  cubism_part_id: "PartAhoge",
  notes:
    "머리 상단 아호게(antenna hair). 앞머리와 별도 warp 로 분리되어 더 가볍고 빠른 2차 흔들림을 가진다. `ahoge_sway` 파라미터 바인딩. docs/03 §12.1 #2.",
};

const V1_3_0_ACCESSORIES_LAYER_NOTES =
  "머리 움직임을 따라가는 액세서리 레이어(모자, 헤드폰 등). 자식 warp: accessory_back_warp, accessory_front_warp. body-level 액세서리 분리는 후속 bump.";

const V1_3_0_NEW_DEFORMERS = [
  {
    id: "accessory_back_warp",
    type: "warp",
    parent: "accessories_layer",
    params_in: ["accessory_back_sway"],
    notes:
      "v1.3.0 — 뒷악세서리 2차 흔들림 warp. `accessory_sway_phys` 의 출력 중 accessory_back_sway 바인딩. 자식 파츠: accessory_back.",
  },
  {
    id: "accessory_front_warp",
    type: "warp",
    parent: "accessories_layer",
    params_in: ["accessory_front_sway"],
    notes:
      "v1.3.0 — 앞악세서리 2차 흔들림 warp. `accessory_sway_phys` 의 출력 중 accessory_front_sway 바인딩. 자식 파츠: accessory_front.",
  },
  {
    id: "ahoge_warp",
    type: "warp",
    parent: "head_pose_rot",
    params_in: ["ahoge_sway"],
    notes:
      "v1.3.0 — 머리 상단 아호게. head_pose_rot 자식으로 붙어 머리 회전을 따라가되 sway 물리로 지연/오버슈트. 자식 파츠: ahoge. docs/03 §12.1 #2.",
  },
];

const V1_3_0_MAO_PRO_APPENDIX = `
## 6. v1.3.0 추가분 (자동 이식, 세션 37)

| halfbody ID | 매핑한 mao_pro 계열 | 입력 | 출력 | 메모 |
|---|---|---|---|---|
| PhysicsSetting10 \`ahoge_sway_phys\` | mao_pro #1 계열(Hair Sway 앞) 의 파생 — 머리 상단 antenna 전용 | head_angle_x · head_angle_y · body_angle_x | \`ahoge_sway\` | radius 5 체인, mobility 1 — 가볍고 반응 빠름 |
| PhysicsSetting11 \`accessory_sway_phys\` | mao_pro #9–12 (Hat Accessory) 의 일반화 — 하나의 시뮬로 back/front 공용 | body_angle_x · body_angle_z (머리 회전 분리) | \`accessory_back_sway\` · \`accessory_front_sway\` | 2 출력 동일 버텍스 파생. scale/weight 는 출력별 차등 |
| PhysicsSetting12 \`body_breath_phys\` | mao_pro #15 (Robe Sway) 의 breath 변형 — 호흡 2차 오프셋 | body_breath · body_angle_y | \`body_breath_phys\` (신규 파라미터) | Cubism 기본 breath warp 위에 레이어. 낮은 weight (60) |

\`deformers.json\` 측 변화:
- \`accessories_layer\` → **\`accessory_back_warp\`·\`accessory_front_warp\`** 로 분기(각 sway 파라미터 바인딩). 기존 accessory_{back,front} 파츠의 \`deformation_parent\` 가 새 warp 로 이동.
- \`head_pose_rot\` 아래 **\`ahoge_warp\`** 신규 — \`ahoge_sway\` 바인딩, 자식 파츠 \`ahoge\`.

\`body_breath_phys\` 은 deformer 에 직접 바인딩하지 않음 — 외부 Cubism 리그에서 선택적으로 소비 (기본 breath warp 와 중복 적용 방지를 위해).
`;

const V1_3_0_NEW_PARAMETERS = [
  {
    id: "ahoge_sway",
    display_name: { en: "Ahoge Sway", ko: "아호게 흔들림", ja: "アホ毛 揺れ" },
    unit: "normalized",
    range: [-1, 1],
    default: 0,
    required: false,
    group: "hair",
    channel: "extension",
    cubism: "ParamAhogeSway",
    physics_output: true,
    notes: "머리 상단 아호게 흔들림. head_angle_x/y + body_angle_x 를 입력으로 `ahoge_sway_phys` 가 계산. docs/03 §12.1 #2.",
  },
  {
    id: "accessory_back_sway",
    display_name: { en: "Accessory Back Sway", ko: "뒷악세서리 흔들림", ja: "背面アクセ 揺れ" },
    unit: "normalized",
    range: [-1, 1],
    default: 0,
    required: false,
    group: "body",
    channel: "extension",
    cubism: "ParamAccessoryBackSway",
    physics_output: true,
    notes: "accessory_back 부착물의 2차 흔들림. `accessory_sway_phys` 의 출력.",
  },
  {
    id: "accessory_front_sway",
    display_name: { en: "Accessory Front Sway", ko: "앞악세서리 흔들림", ja: "前面アクセ 揺れ" },
    unit: "normalized",
    range: [-1, 1],
    default: 0,
    required: false,
    group: "body",
    channel: "extension",
    cubism: "ParamAccessoryFrontSway",
    physics_output: true,
    notes: "accessory_front 부착물의 2차 흔들림. `accessory_sway_phys` 의 출력.",
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

async function writeIfAbsent(path, content) {
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function appendIfMissing(path, sentinel, appendix) {
  if (!existsSync(path)) return;
  const cur = await readFile(path, "utf8");
  if (cur.includes(sentinel)) return;
  const sep = cur.endsWith("\n") ? "" : "\n";
  await writeFile(path, cur + sep + appendix, "utf8");
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
