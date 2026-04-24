#!/usr/bin/env node
/**
 * scripts/rig-template/import-cubism-preset.mjs
 *
 * 3rd-party Cubism 프리셋(.moc3 기반) 을 Geny rig-template 포맷으로 변환·등재.
 *
 * 사용법:
 *   node scripts/rig-template/import-cubism-preset.mjs \
 *     --source mao_pro_ko/runtime \
 *     --out rig-templates/base/mao_pro/v1.0.0 \
 *     --template-id tpl.base.v1.mao_pro \
 *     --version 1.0.0 \
 *     --display-name-en "Mao Pro (Nijiiro)" \
 *     --display-name-ko "니지이로 마오 프로" \
 *     --moc3 mao_pro.moc3 \
 *     --cdi3 mao_pro.cdi3.json \
 *     --model3 mao_pro.model3.json \
 *     --physics3 mao_pro.physics3.json \
 *     --pose3 mao_pro.pose3.json \
 *     --texture mao_pro.4096/texture_00.png \
 *     --origin-vendor "Live2D Inc." \
 *     --origin-product "Nijiiro Mao Pro" \
 *     --license-ref mao_pro_ko/ReadMe.txt
 *
 * 수행 (docs/01-RIG-PRESET.md §6 3rd-party 절차):
 *   1) cdi3.json Parameters → parameters.json (Cubism 네이티브 ID → snake_case 변환)
 *   2) cdi3.json Parts → parts/*.spec.json (최소 wrapper spec)
 *   3) physics3.json → physics/physics.json (Cubism → snake_case 정규화)
 *   4) pose3.json → pose.json
 *   5) motions/*.motion3.json → motions/*.motion.json (wrapper, target_id snake_case)
 *   6) expressions/*.exp3.json → expressions/*.expression.json (wrapper)
 *   7) 이미지 + 바이너리 → textures/base.png + runtime_assets/*
 *   8) template.manifest.json, deformers.json, textures/atlas.json, test_poses, README 작성
 *
 * **주의**: 이 스크립트는 schema 검증 통과 수준의 **최소 wrapper** 를 생성한다.
 *          drawable 단위 atlas slot 추출은 `.moc3` 바이너리 파싱이 필요하므로
 *          후속 단계(P3 per-slot texture generation)에서 `extract-from-moc3.mjs` 와 함께 처리.
 */

import { readFile, writeFile, mkdir, cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ---------- CLI 파싱 ----------
const argv = process.argv.slice(2);
function arg(name, def) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
}

const source = arg("source");
const out = arg("out");
const templateId = arg("template-id");
const version = arg("version", "1.0.0");
const displayNameEn = arg("display-name-en", "Imported Cubism Preset");
const displayNameKo = arg("display-name-ko", displayNameEn);
const displayNameJa = arg("display-name-ja", displayNameEn);
const moc3File = arg("moc3");
const cdi3File = arg("cdi3");
const model3File = arg("model3");
const physics3File = arg("physics3");
const pose3File = arg("pose3");
const textureFile = arg("texture");
const originVendor = arg("origin-vendor", "Unknown");
const originProduct = arg("origin-product", "Unknown");
const licenseRef = arg("license-ref", "");

if (!source || !out || !templateId || !cdi3File) {
  console.error(
    "Usage: import-cubism-preset.mjs --source <dir> --out <dir> --template-id <id> --cdi3 <file> ...",
  );
  process.exit(2);
}

const SRC = resolve(source);
const OUT = resolve(out);

await mkdir(OUT, { recursive: true });
await mkdir(join(OUT, "parts"), { recursive: true });
await mkdir(join(OUT, "physics"), { recursive: true });
await mkdir(join(OUT, "motions"), { recursive: true });
await mkdir(join(OUT, "expressions"), { recursive: true });
await mkdir(join(OUT, "textures"), { recursive: true });
await mkdir(join(OUT, "test_poses"), { recursive: true });
await mkdir(join(OUT, "runtime_assets"), { recursive: true });

// ---------- 공용 유틸 ----------

// Cubism Id (ParamAngleX / PartHairFront) → snake_case (angle_x / hair_front).
// 충돌 방지 / regex 대응:
//   - "Param" / "Part" 접두사 stripe 후 CamelCase → snake_case
//   - 1 글자 결과 (ParamA/E/I/O/U) 는 `phoneme_` prefix 추가
//   - regex `^[a-z][a-z0-9_]{1,60}$` 를 항상 만족.
function cubismParamIdToSnake(id) {
  let s = id;
  if (s.startsWith("Param")) s = s.slice(5);
  if (!s) s = id; // fallback if "Param" only
  // CamelCase → snake_case
  s = s.replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c : "_" + c));
  s = s.toLowerCase();
  // 선행 underscore 제거 (있을 수 있음)
  s = s.replace(/^_+/, "");
  // 1 글자 phoneme 특수 처리
  if (s.length === 1) s = `phoneme_${s}`;
  return s;
}

function cubismPartIdToSnake(id) {
  let s = id;
  if (s.startsWith("Part")) s = s.slice(4);
  if (!s) s = "core";
  s = s.replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c : "_" + c));
  s = s.toLowerCase().replace(/^_+/, "");
  if (s.length === 0) s = "core";
  if (s.length === 1) s = `part_${s}`;
  return s;
}

// Cubism 그룹 ID (ParamGroupFace) → our ID (face).
function cubismGroupIdToSnake(id) {
  let s = id;
  if (s.startsWith("ParamGroup")) s = s.slice(10);
  else if (s.startsWith("Param")) s = s.slice(5);
  s = s.replace(/([A-Z])/g, (m, c, i) => (i === 0 ? c : "_" + c));
  s = s.toLowerCase().replace(/^_+/, "");
  if (s.length === 0) s = "other";
  return s;
}

// Cubism 표준 파라미터 ID → 기본 range/default 추정 (convention).
// .moc3 실제 값이 권위이지만 파싱 없이 합리적 기본값 제공.
// 출처: Live2D Cubism 표준 파라미터 규약.
function guessParamRange(cubismId) {
  const id = cubismId;
  // Angle 계열 (±30°)
  if (/Angle[XYZ]$/.test(id)) return { range: [-30, 30], default: 0, unit: "degree" };
  if (/^ParamBodyAngle[XYZ]$/.test(id)) return { range: [-10, 10], default: 0, unit: "degree" };
  // Breath
  if (id === "ParamBreath") return { range: [0, 1], default: 0, unit: "normalized" };
  // Eye Open / Smile (0..1)
  if (/Eye.*Open$/.test(id)) return { range: [0, 1], default: 1, unit: "normalized" };
  if (/Eye.*Smile$/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  if (/EyeBall[XY]$/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  if (/EyeBallForm$/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  // Brow (±1)
  if (/^ParamBrow[LR][XY]$/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  if (/^ParamBrow[LR](Angle|Form)$/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  // Mouth
  if (/^ParamMouthOpen/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  if (/^ParamMouthForm$/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  if (/^ParamMouth/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  // Lipsync mora
  if (/^Param[AEIOU]$/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  // Cheek
  if (/^ParamCheek/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  // Hair / Hat / Accessory sway/fuwa
  if (/(Sway|Fuwa|Mesh)/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  // Body / Arm / Leg angle
  if (/Arm[LR]/.test(id)) return { range: [-1, 1], default: 0, unit: "normalized" };
  // On/Off / toggle
  if (/(On|Off|Enable|Show|Hide|Display)$/.test(id)) return { range: [0, 1], default: 0, unit: "normalized" };
  // 안전한 기본값
  return { range: [-1, 1], default: 0, unit: "normalized" };
}

function writeJson(path, obj) {
  return writeFile(path, JSON.stringify(obj, null, 2) + "\n");
}

// motion-pack segment 포맷(우리 schema 기준) 의 segment/point 수 계산.
// validate-schemas.mjs 와 동일 규칙 — type 1(Bezier) = step 7, type 0/2/3 = step 3,
// pointCount = segCount + 1. 참고: Cubism motion3 의 TotalPointCount 는 제어점 포함이라 다름.
function countMotionSegments(segments) {
  let i = 2;
  let segCount = 0;
  while (i < segments.length) {
    const type = segments[i];
    const step = type === 1 ? 7 : type === 0 || type === 2 || type === 3 ? 3 : -1;
    if (step === -1) return null;
    if (i + step > segments.length) return null;
    i += step;
    segCount += 1;
  }
  return { segCount, pointCount: segCount + 1 };
}

// ---------- 1. cdi3.json 로드 + 추가 param ID 수집 ----------

const cdi3 = JSON.parse(await readFile(join(SRC, cdi3File), "utf8"));

// motion3/exp3 는 cdi3 에 없는 Cubism 파라미터도 참조할 수 있음 (Live2D 모델 고유 특성).
// 파라미터 ID 전수 수집 — parameters.json 이 target_id 해석을 100% 커버해야 함.
async function collectExtraCubismIds(srcDir) {
  const ids = new Set();
  const motionsDir = join(srcDir, "motions");
  if (existsSync(motionsDir)) {
    for (const f of await readdir(motionsDir)) {
      if (!f.endsWith(".motion3.json")) continue;
      const m3 = JSON.parse(await readFile(join(motionsDir, f), "utf8"));
      for (const c of m3.Curves ?? []) {
        if (c.Target === "Parameter" && c.Id) ids.add(c.Id);
      }
    }
  }
  const expDir = join(srcDir, "expressions");
  if (existsSync(expDir)) {
    for (const f of await readdir(expDir)) {
      if (!f.endsWith(".exp3.json")) continue;
      const e3 = JSON.parse(await readFile(join(expDir, f), "utf8"));
      for (const p of e3.Parameters ?? []) {
        if (p.Id) ids.add(p.Id);
      }
    }
  }
  return ids;
}
const extraCubismIds = await collectExtraCubismIds(SRC);

// physics3 의 input/output 에 쓰이는 파라미터 ID 수집 → parameters.json 의 physics_input/output 플래그.
const physicsInputIds = new Set();
const physicsOutputIds = new Set();
if (physics3File && existsSync(join(SRC, physics3File))) {
  const p3 = JSON.parse(await readFile(join(SRC, physics3File), "utf8"));
  for (const s of p3.PhysicsSettings ?? []) {
    for (const inp of s.Input ?? []) {
      if (inp.Source?.Id) physicsInputIds.add(inp.Source.Id);
    }
    for (const outp of s.Output ?? []) {
      if (outp.Destination?.Id) physicsOutputIds.add(outp.Destination.Id);
    }
  }
}

// ---------- 2. parameters.json + groups ----------

const groupIdMap = new Map(); // cubism group id → our id
const seenGroups = new Set();
const groupsArr = [];
for (const pg of cdi3.ParameterGroups ?? []) {
  const ourId = cubismGroupIdToSnake(pg.Id);
  if (seenGroups.has(ourId)) continue;
  seenGroups.add(ourId);
  groupIdMap.set(pg.Id, ourId);
  groupsArr.push({
    id: ourId,
    display_name: { en: pg.Name || ourId, ko: pg.Name || ourId, ja: pg.Name || ourId },
  });
}
// "other" 그룹이 없으면 추가 (fallback group)
if (!seenGroups.has("other")) {
  groupsArr.push({ id: "other", display_name: { en: "Other", ko: "기타", ja: "その他" } });
}

const paramIdMap = new Map(); // cubism id → our id (dedup safeguard)
const ourIdSet = new Set(); // dedup our ids
const paramsArr = [];
function addParam(cubismId, name, groupId) {
  if (paramIdMap.has(cubismId)) return;
  let ourId = cubismParamIdToSnake(cubismId);
  // 매우 드물지만 snake 변환 후 충돌 가능 — suffix 로 분리.
  let uniqId = ourId;
  let n = 2;
  while (ourIdSet.has(uniqId)) uniqId = `${ourId}_${n++}`;
  ourId = uniqId;
  ourIdSet.add(ourId);
  paramIdMap.set(cubismId, ourId);
  const group = groupId ? groupIdMap.get(groupId) || "other" : "other";
  const { range, default: def, unit } = guessParamRange(cubismId);
  const entry = {
    id: ourId,
    display_name: { en: name || ourId, ko: name || ourId, ja: name || ourId },
    unit,
    range,
    default: def,
    required: false,
    group,
    channel: "core",
    physics_input: physicsInputIds.has(cubismId),
  };
  // cubism field 는 strict regex (^Param[A-Z]...) 통과 시에만 포함.
  // mao 등 실 모델은 ParamoHairMesh (5th char lowercase) · Param5 (5th char digit) 같은
  // 비표준 ID 를 쓸 수 있음 — 그런 경우 cubism 필드 생략 + notes 에만 기록.
  if (/^Param[A-Z][A-Za-z0-9]{0,60}$/.test(cubismId)) {
    entry.cubism = cubismId;
  }
  if (physicsOutputIds.has(cubismId)) entry.physics_output = true;
  paramsArr.push(entry);
}
// 1차: cdi3 documented parameters
for (const p of cdi3.Parameters ?? []) {
  addParam(p.Id, p.Name, p.GroupId);
}
// 2차: motions / expressions 에만 나오는 undocumented ID
for (const cubismId of extraCubismIds) {
  if (!paramIdMap.has(cubismId)) {
    addParam(cubismId, cubismId, undefined);
  }
}

const parametersFile = {
  schema_version: "v1",
  groups: groupsArr,
  parameters: paramsArr,
};
await writeJson(join(OUT, "parameters.json"), parametersFile);
console.log(`✓ parameters.json — ${paramsArr.length} params, ${groupsArr.length} groups`);

// ---------- 3. parts/*.spec.json ----------

const partsDir = join(OUT, "parts");
const partIdMap = new Map();
for (const p of cdi3.Parts ?? []) {
  const ourSlot = cubismPartIdToSnake(p.Id);
  if (partIdMap.has(p.Id)) continue;
  partIdMap.set(p.Id, ourSlot);
  // 최소 스펙 — schema 필수 필드만 충족, 정확한 구조는 .moc3 파싱 이후 보강.
  // category/anchor/visual 은 enum 기반 — 3rd-party wrapper 는 `fx` 로 통일 (가장 중립).
  const spec = {
    schema_version: "v1",
    slot_id: ourSlot,
    role: ourSlot,
    required: false,
    template: templateId,
    template_version: "^1",
    deformation_parent: "root",
    category: "fx",
    canvas_px: { w: 4096, h: 4096 },
    uv_box_px: { x: 0, y: 0, w: 4096, h: 4096 },
    anchor: { type: "bbox_center", x_frac: 0.5, y_frac: 0.5, detect_method: "bbox" },
    z_order: 0,
    visual: {
      alpha_edge_policy: "feather_2px",
      line_weight_hint_px: 1,
      color_context: "fx",
    },
    generation: {
      prompt_scope: ["wrapper_placeholder"],
      negative_prompt: [],
      reference_mask: "wrapper_mask_placeholder.png",
      max_iter: 1,
    },
    dependencies: [],
    validation: {
      must_cover_anchor: false,
      min_alpha_area_frac: 0,
      max_alpha_area_frac: 1,
    },
    notes: `3rd-party wrapper spec (${originVendor}). drawable 단위 spec 은 .moc3 파싱 후 보강. Cubism Part Id='${p.Id}'.`,
  };
  // cubism_part_id 는 엄격 regex (^Part[A-Z0-9]...). mao 등 실 모델은 "Partaura" · "Part" 같은
  // 비표준 ID 를 쓸 수 있으므로 regex 통과 시에만 포함, 아니면 notes 에만 기록.
  if (/^Part[A-Z0-9][A-Za-z0-9]{0,60}$/.test(p.Id)) {
    spec.cubism_part_id = p.Id;
  }
  await writeJson(join(partsDir, `${ourSlot}.spec.json`), spec);
}
console.log(`✓ parts/ — ${partIdMap.size} spec files`);

// ---------- 4. deformers.json (최소 root) ----------

const deformersFile = {
  schema_version: "v1",
  root_id: "root",
  nodes: [
    {
      id: "root",
      type: "warp",
      parent: null,
      params_in: [],
      notes: "3rd-party wrapper — drawable 단위 디포머 계층은 .moc3 에 내재.",
    },
  ],
};
await writeJson(join(OUT, "deformers.json"), deformersFile);
console.log("✓ deformers.json (root only)");

// ---------- 5. physics/physics.json ----------

if (physics3File && existsSync(join(SRC, physics3File))) {
  const p3 = JSON.parse(await readFile(join(SRC, physics3File), "utf8"));
  // Cubism upper → our snake_case. 단, 이 변환은 간단 형식 유지 + parameter_id 만 변환.
  // 실 Cubism physics3.json 의 구조를 우리 schema 에 대응:
  //   p3.Meta.PhysicsSettingCount → meta.physics_setting_count
  //   p3.PhysicsSettings[].Input[].Source.Id → physics_settings[].input[].source_param (id 변환)
  //   p3.PhysicsSettings[].Output[].Destination.Id → physics_settings[].output[].destination_param (id 변환)
  function lowerXY(p) {
    if (!p) return { x: 0, y: 0 };
    return { x: p.X ?? p.x ?? 0, y: p.Y ?? p.y ?? 0 };
  }
  const meta = {
    physics_setting_count: p3.Meta.PhysicsSettingCount,
    total_input_count: p3.Meta.TotalInputCount,
    total_output_count: p3.Meta.TotalOutputCount,
    vertex_count: p3.Meta.VertexCount,
    effective_forces: p3.Meta.EffectiveForces
      ? {
          gravity: lowerXY(p3.Meta.EffectiveForces.Gravity),
          wind: lowerXY(p3.Meta.EffectiveForces.Wind),
        }
      : { gravity: { x: 0, y: -1 }, wind: { x: 0, y: 0 } },
    fps: p3.Meta.Fps || 30,
  };

  // dictionary — schema: id 는 "PhysicsSetting<N>" 규약, name.ko 필수.
  const dict = p3.PhysicsDictionary ?? [];
  function normalizeSettingId(id, idx) {
    if (/^PhysicsSetting[0-9]+$/.test(id || "")) return id;
    return `PhysicsSetting${idx + 1}`;
  }
  const physicsDictionary = [];
  for (let i = 0; i < p3.PhysicsSettings.length; i++) {
    const d = dict[i] || {};
    const ourId = normalizeSettingId(d.Id, i);
    const name = d.Name || ourId;
    physicsDictionary.push({ id: ourId, name: { ko: name, en: name, ja: name } });
  }

  // Cubism Type ↔ schema enum (X/Y/Angle).
  const TYPE_ENUM = new Set(["X", "Y", "Angle"]);
  function coerceType(t) {
    return TYPE_ENUM.has(t) ? t : "X";
  }

  const physicsSettings = p3.PhysicsSettings.map((s, i) => ({
    id: physicsDictionary[i].id,
    input: (s.Input ?? []).map((inp) => ({
      source_param: paramIdMap.get(inp.Source?.Id) || cubismParamIdToSnake(inp.Source?.Id || ""),
      weight: Math.max(0, Math.min(100, inp.Weight ?? 100)),
      type: coerceType(inp.Type),
      reflect: inp.Reflect ?? false,
    })),
    output: (s.Output ?? []).map((outp) => ({
      destination_param: paramIdMap.get(outp.Destination?.Id) || cubismParamIdToSnake(outp.Destination?.Id || ""),
      vertex_index: outp.VertexIndex ?? 0,
      scale: outp.Scale ?? 1,
      weight: Math.max(0, Math.min(100, outp.Weight ?? 100)),
      type: coerceType(outp.Type),
      reflect: outp.Reflect ?? false,
    })),
    vertices: (s.Vertices ?? []).map((v) => ({
      position: lowerXY(v.Position),
      mobility: Math.max(0, Math.min(1, v.Mobility ?? 0.95)),
      delay: Math.max(0, Math.min(1, v.Delay ?? 0.9)),
      acceleration: v.Acceleration ?? 1,
      radius: Math.max(0, v.Radius ?? 10),
    })),
    normalization: s.Normalization
      ? {
          position: {
            minimum: s.Normalization.Position?.Minimum ?? -100,
            default: s.Normalization.Position?.Default ?? 0,
            maximum: s.Normalization.Position?.Maximum ?? 100,
          },
          angle: {
            minimum: s.Normalization.Angle?.Minimum ?? -60,
            default: s.Normalization.Angle?.Default ?? 0,
            maximum: s.Normalization.Angle?.Maximum ?? 60,
          },
        }
      : {
          position: { minimum: -100, default: 0, maximum: 100 },
          angle: { minimum: -60, default: 0, maximum: 60 },
        },
  }));

  const physicsFile = {
    schema_version: "v1",
    version: 3,
    meta,
    physics_dictionary: physicsDictionary,
    physics_settings: physicsSettings,
  };
  await writeJson(join(OUT, "physics", "physics.json"), physicsFile);
  console.log(`✓ physics/physics.json — ${physicsSettings.length} settings`);
}

// ---------- 6. pose.json ----------

if (pose3File && existsSync(join(SRC, pose3File))) {
  const pose3 = JSON.parse(await readFile(join(SRC, pose3File), "utf8"));
  const groups = (pose3.Groups ?? []).map((g) =>
    g.map((part) => ({
      slot_id: partIdMap.get(part.Id) || cubismPartIdToSnake(part.Id),
      link: (part.Link ?? []).map((l) => partIdMap.get(l) || cubismPartIdToSnake(l)),
    })),
  );
  const poseFile = {
    schema_version: "v1",
    format: 3,
    type: "live2d_pose",
    fade_in_time: pose3.FadeInTime ?? 0.5,
    groups: groups.length > 0 ? groups : [
      // pose3 에 groups 없으면 최소 1개 (schema minItems=1)
      [
        { slot_id: "root_a", link: [] },
        { slot_id: "root_b", link: [] },
      ],
    ],
  };
  await writeJson(join(OUT, "pose.json"), poseFile);
  console.log(`✓ pose.json — ${poseFile.groups.length} groups`);
}

// ---------- 7. motions/*.motion.json ----------

const motionsSrcDir = join(SRC, "motions");
if (existsSync(motionsSrcDir)) {
  const motionFiles = await readdir(motionsSrcDir);
  const motionPacks = [];
  for (const f of motionFiles) {
    if (!f.endsWith(".motion3.json")) continue;
    const m3 = JSON.parse(await readFile(join(motionsSrcDir, f), "utf8"));
    const stem = f.replace(/\.motion3\.json$/, "");
    const packId = `mao.${stem.replace(/[^a-z0-9_]/g, "_").toLowerCase()}`; // mao 프리픽스로 충돌 방지
    motionPacks.push(packId);
    const curves = (m3.Curves ?? []).map((c) => {
      const targetId =
        c.Target === "Parameter"
          ? paramIdMap.get(c.Id) || cubismParamIdToSnake(c.Id)
          : partIdMap.get(c.Id) || cubismPartIdToSnake(c.Id);
      return {
        target: c.Target === "PartOpacity" ? "part_opacity" : "parameter",
        target_id: targetId,
        ...(c.FadeInTime !== undefined ? { fade_in_sec: c.FadeInTime } : {}),
        ...(c.FadeOutTime !== undefined ? { fade_out_sec: c.FadeOutTime } : {}),
        segments: c.Segments,
      };
    });
    // Cubism TotalPointCount 는 제어점 포함 — validate-schemas 기준으로 재계산.
    let segTotal = 0;
    let pointTotal = 0;
    for (const c of curves) {
      const r = countMotionSegments(c.segments);
      if (r) {
        segTotal += r.segCount;
        pointTotal += r.pointCount;
      }
    }
    const packFile = {
      schema_version: "v1",
      pack_id: packId,
      version: "1.0.0",
      format: 3,
      meta: {
        duration_sec: m3.Meta.Duration,
        fps: m3.Meta.Fps === 60 ? 60 : 30,
        fade_in_sec: m3.Meta.FadeInTime ?? 0,
        fade_out_sec: m3.Meta.FadeOutTime ?? 0,
        loop: !!m3.Meta.Loop,
        curve_count: curves.length,
        total_segment_count: segTotal,
        total_point_count: pointTotal,
      },
      curves,
      notes: `Imported from ${originVendor}/${originProduct} (${f}).`,
    };
    await writeJson(join(OUT, "motions", `${stem}.motion.json`), packFile);
  }
  console.log(`✓ motions/ — ${motionPacks.length} packs`);
  globalThis.__motion_packs = motionPacks;
}

// ---------- 8. expressions/*.expression.json ----------

const expSrcDir = join(SRC, "expressions");
if (existsSync(expSrcDir)) {
  const expFiles = await readdir(expSrcDir);
  const expIds = [];
  for (const f of expFiles) {
    if (!f.endsWith(".exp3.json")) continue;
    const e3 = JSON.parse(await readFile(join(expSrcDir, f), "utf8"));
    const stem = f.replace(/\.exp3\.json$/, "");
    // stem 을 expression_id 형식으로 (regex ^expression\.[a-z][a-z0-9_]{1,40}$).
    const safeStem = stem.replace(/[^a-z0-9_]/gi, "_").toLowerCase();
    const expId = `expression.${safeStem}`;
    expIds.push(expId);
    const blends = (e3.Parameters ?? []).map((p) => ({
      target_id: paramIdMap.get(p.Id) || cubismParamIdToSnake(p.Id),
      value: p.Value,
      blend: p.Blend, // Add / Multiply / Overwrite 그대로
    }));
    const expFile = {
      schema_version: "v1",
      expression_id: expId,
      version: "1.0.0",
      format: 3,
      name: { en: stem, ko: stem, ja: stem },
      notes: `Imported from ${originVendor}/${originProduct} (${f}).`,
      fade_in_sec: e3.FadeInTime ?? 0.5,
      fade_out_sec: e3.FadeOutTime ?? 0.5,
      blends,
    };
    await writeJson(join(OUT, "expressions", `${safeStem}.expression.json`), expFile);
  }
  console.log(`✓ expressions/ — ${expIds.length} packs`);
  globalThis.__expression_ids = expIds;
}

// ---------- 9. textures/atlas.json + base.png ----------

const atlasFile = {
  schema_version: "v1",
  format: 1,
  textures: [
    {
      path: "textures/base.png",
      width: 4096,
      height: 4096,
      format: "png",
      premultiplied_alpha: false,
    },
  ],
  slots: [],
};
await writeJson(join(OUT, "textures", "atlas.json"), atlasFile);
if (textureFile && existsSync(join(SRC, textureFile))) {
  await cp(join(SRC, textureFile), join(OUT, "textures", "base.png"));
}
console.log("✓ textures/atlas.json + base.png");

// ---------- 10. test_poses/validation_set.json (minimal) ----------

const validationSet = {
  schema_version: "v1",
  poses: [
    {
      id: "neutral",
      description: "Neutral baseline — all params at default.",
      category: "baseline",
      params: {},
    },
  ],
};
await writeJson(join(OUT, "test_poses", "validation_set.json"), validationSet);
console.log("✓ test_poses/validation_set.json");

// ---------- 11. runtime_assets/ (copy originals, 전체 디렉토리 - Cubism Framework 가 직접 로드) ----------
// model3.json 의 FileReferences 는 상대경로 (textures/, motions/, expressions/, *.4096/ 등) 를
// 가리키므로 source 전체를 recursive 복사. 이렇게 해야 브라우저에서 Live2DModel.from(model3URL)
// 이 모든 참조 파일 (moc3, texture, physics, pose, cdi, motions, expressions) 을 fetch 가능.

await cp(SRC, join(OUT, "runtime_assets"), { recursive: true });

// 편의를 위해 파일명은 원본 유지 (mao_pro.moc3 등). model3.json 내부 FileReferences 는 원본 상대경로 그대로 동작.
console.log("✓ runtime_assets/ (source 전체 recursive 복사)");

// ---------- 12. template.manifest.json ----------

// cubism_mapping — 우리 ID → Cubism ID 매핑 (역방향).
const cubismMapping = {};
for (const p of paramsArr) {
  if (p.cubism) cubismMapping[p.id] = p.cubism;
}

const manifest = {
  schema_version: "v1",
  id: templateId,
  version,
  display_name: { en: displayNameEn, ko: displayNameKo, ja: displayNameJa },
  intended_vibe: `${originProduct} (${originVendor}) 의 Cubism 모델을 wrapper 로 편입한 3rd-party 프리셋. 런타임 렌더링은 원본 .moc3 를 Cubism Framework 가 직접 해석. texture 교체 + 파라미터 I/O 는 wrapper 메타데이터로 수행.`,
  family: "custom",
  canvas: { width: 4096, height: 4096 },
  ratio: { head_to_body: "1:1" },
  parameters_file: "parameters.json",
  parts_dir: "parts/",
  deformers_file: "deformers.json",
  physics_file: "physics/physics.json",
  motions_dir: "motions/",
  expressions_dir: "expressions/",
  test_poses_file: "test_poses/validation_set.json",
  lipsync_mapping: "../../shared/lipsync_mapping.v1.json",
  physics_preset: "normal",
  authoring: {
    authors: [{ name: originVendor, role: "artist", contact: "n/a" }],
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    tool: "import-cubism-preset.mjs@0.1.0",
  },
  compat: {
    motion_packs: (globalThis.__motion_packs || []).map((p) => `${p}@^1`),
    expression_packs: (globalThis.__expression_ids || []).map((id) => `${id}@^1`),
    physics: "physics.v1",
    export_targets_supported: ["cubism@3"],
  },
  cubism_mapping: cubismMapping,
  origin: {
    kind: "third-party",
    vendor: originVendor,
    product: originProduct,
    source_path: source,
    license_ref: licenseRef || null,
    runtime_assets_dir: "runtime_assets/",
  },
};
await writeJson(join(OUT, "template.manifest.json"), manifest);
console.log(`✓ template.manifest.json — id=${templateId} version=${version}`);

// ---------- 13. README.md ----------

const readme = `# ${displayNameEn} (${templateId}@${version})

3rd-party Cubism 프리셋 wrapper. 원본: ${originVendor} / ${originProduct}.

2026-04-24 P1.A — \`scripts/rig-template/import-cubism-preset.mjs\` 로 자동 생성.
원본 파일은 \`runtime_assets/\` 에 보존되어 Cubism Framework 가 직접 로드 (texture 만 교체 가능).

## 구성

- \`template.manifest.json\` — origin=third-party / family=custom
- \`parameters.json\` — ${paramsArr.length} params (Cubism 네이티브 ID → snake_case 변환, cubism 필드에 원본 ID 보존)
- \`parts/*.spec.json\` — ${partIdMap.size} 파츠 wrapper (anatomical 분해 X, Cubism Part 그룹만 참조)
- \`deformers.json\` — root-only placeholder (드로어블 단위 디포머 계층은 .moc3 내재)
- \`physics/physics.json\` — 원본 \`physics3.json\` 을 snake_case 로 정규화
- \`pose.json\` — 원본 \`pose3.json\` 정규화
- \`motions/\`, \`expressions/\` — 원본 motion3/exp3 wrapper (target_id 만 snake_case)
- \`textures/atlas.json\` + \`textures/base.png\` — 1 texture, slots=[] (drawable 단위 slot 은 P3+)
- \`runtime_assets/\` — 원본 \`.moc3\` + JSON 4종 (Cubism Framework 가 직접 로드)

## 제한

- **drawable 단위 atlas slot 추출 미제공**. per-slot 텍스처 생성이 필요하면 \`.moc3\` 파서 구현 후 재생성.
- **parameter range/default 는 convention 기반 추정**. 정확한 값은 .moc3 권위.
- **parts anatomical role 미부여**. 3rd-party 프리셋은 카테고리만 'other' 로 wrapper.

## 라이선스

${licenseRef ? `원본 라이선스: \`${licenseRef}\` 참조.` : "라이선스 정보 미지정."}
`;
await writeFile(join(OUT, "README.md"), readme);
console.log("✓ README.md");

// ---------- 14. physics/design_notes.md ----------

const designNotes = `# ${displayNameEn} Physics Design Notes

이 프리셋은 3rd-party wrapper 이므로 physics 구조는 원본 ${originVendor}/${originProduct} 의
\`physics3.json\` 을 그대로 보존하며, snake_case 정규화만 수행한다.

- parameter_id: Cubism 표준 ID → snake_case 변환 (상위 template.manifest.cubism_mapping 참조)
- PhysicsSetting 수: 원본 그대로
- normalization / vertices / input / output 구조: schema 변환 없이 1:1

derived preset (halfbody/v1.3.0 등) 의 \`mao_pro_mapping.md\` 와는 성격이 다르다 —
여기는 "원본 그대로", 거기는 "원본을 참고해서 재구성한 매핑".
`;
await writeFile(join(OUT, "physics", "design_notes.md"), designNotes);
console.log("✓ physics/design_notes.md");

console.log(`\n[import-cubism-preset] ✅ 프리셋 생성 완료 → ${OUT}`);
