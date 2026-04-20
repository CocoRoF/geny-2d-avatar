#!/usr/bin/env node
// scripts/rig-template/physics-lint.mjs
// 리그 템플릿 `physics/physics.json` authoring gate.
//
// CLI:
//   node scripts/rig-template/physics-lint.mjs <templateDir> [--baseline <dir>] [--family <name>]
//
// 예:
//   node scripts/rig-template/physics-lint.mjs rig-templates/base/halfbody/v1.3.0
//
// 체크 항목 (전부 fatal — 1 개라도 실패 시 exit 1):
//   C1. meta.physics_setting_count === physics_settings.length
//   C2. meta.total_input_count === Σ setting.input.length
//   C3. meta.total_output_count === Σ setting.output.length
//   C4. meta.vertex_count === Σ setting.vertices.length
//   C5. physics_dictionary 와 physics_settings 의 id 집합이 정확히 동일 (중복 없음)
//   C6. 모든 input.source_param 이 parameters.json 에 존재 + 해당 파라미터에 physics_input: true
//   C7. 모든 output.destination_param 이 parameters.json 에 존재 + physics_output: true
//   C8. 모든 output.vertex_index 가 0..vertices.length-1 범위
//   C9. 모든 output.destination_param 이 template.manifest.json.cubism_mapping 에 등록됨
//   C10. 출력 파라미터 네이밍 규약 (docs/03 §6.2). **base family 별 분리** (세션 49):
//        - C10-suffix: 각 family 의 허용 접미사 regex 에 매치.
//        - C10-forbidden: 각 family 의 forbidden prefix 에 걸리지 않음.
//        family 는 template.manifest.json.family 에서 읽으며, `--family` 로 override.
//        Family rule 테이블은 FAMILY_OUTPUT_RULES 아래 참조.
//   C11. `parts/*.spec.json` 의 `parameter_ids` (세션 98) 에 나열된 id 가 parameters.json
//        의 parameters[].id 에 실제 존재하는지 교차 검증. parameters 의 minor-bump 로 id
//        가 rename / 삭제됐을 때 드리프트를 CI 수준에서 조기 차단. 세션 98 의 silent-empty
//        런타임 정책을 CI 안전망으로 보완. `parts/` 디렉토리가 없거나 `parameter_ids` 를
//        사용하는 spec 이 0 건이면 no-op.
//
// --baseline 옵션:
//   주어지면 타겟과 baseline physics.json 사이의 structural diff 리포트 (stdout 에 human-readable).
//   purpose: v1.3.0 저자 개입 지점에서 "이전 버전 대비 어디가 새로 설정됐는지" 를 판단하기 위함.
//
// --family 옵션:
//   주어지면 manifest.family 대신 지정값 사용. 미래 family 대응 테스트 / 마이그레이션 리허설용.
//
// 의존성: Node 20.11+ built-in 만 (readFile, JSON).

import { readFile, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

// docs/03 §2.1 family enum 과 1:1. 알 수 없는 family 는 명시적 error — 미래 base 추가 시
// 저자가 반드시 rule 을 등록하도록 강제.
//
// pattern: 허용 접미사 정규식 (끝맺음 필수). 좌우 분리는 `(_[lr])?`.
// forbiddenPrefixes: 해당 family 의 해부학 / 의상 스코프에 존재하지 않는 파츠 접두사.
//   halfbody 는 상반신 전용이므로 `leg_` / `foot_` / `skirt_` / `tail_` 물리 출력이 들어오면
//   타이포 또는 잘못된 base 선택 — 기계적으로 차단.
// Foundation 단계 halfbody 만 구현되어 있으므로 halfbody 외 family 의 rule 은 "향후 저작 시
// 실제 필요 접미사 / 금지어 를 확정" 자리로만 최소 등록. 과잉 명세 금지 (ADR 0005 L2 정신).
export const FAMILY_OUTPUT_RULES = Object.freeze({
  halfbody: {
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: ["leg_", "foot_", "skirt_", "tail_"],
  },
  masc_halfbody: {
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: ["leg_", "foot_", "skirt_", "tail_"],
  },
  chibi: {
    // chibi 는 전신 비율이지만 lowerbody 물리가 최소화되는 경향. 우선 halfbody 와 동일 스타터.
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: [],
  },
  fullbody: {
    // 전신. 하반신 파츠 허용 — forbidden 없음. 접미사 확장 (예: `_wave`) 은 실 저작
    // 세션에서 발생할 때 명시적 PR 로 추가.
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: [],
  },
  feline: {
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: [],
  },
  custom: {
    // 파생 fork. 기본 규약 유지, 금지 없음 — 템플릿 작성자 책임.
    pattern: /_(sway|phys|fuwa)(_[lr])?$/,
    forbiddenPrefixes: [],
  },
});

/**
 * 단일 템플릿 lint — { errors, summary } 반환. 파일 IO 예외는 호출자에게 전파.
 * @param {string} templateDir
 * @param {{ familyOverride?: string }} [options]
 */
export async function lintPhysics(templateDir, options = {}) {
  const physicsPath = join(templateDir, "physics", "physics.json");
  const parametersPath = join(templateDir, "parameters.json");
  const manifestPath = join(templateDir, "template.manifest.json");
  if (!existsSync(physicsPath)) {
    throw new Error(`physics-lint: ${physicsPath} 없음`);
  }
  if (!existsSync(parametersPath)) {
    throw new Error(`physics-lint: ${parametersPath} 없음`);
  }
  if (!existsSync(manifestPath)) {
    throw new Error(`physics-lint: ${manifestPath} 없음`);
  }
  const physics = JSON.parse(await readFile(physicsPath, "utf8"));
  const parameters = JSON.parse(await readFile(parametersPath, "utf8"));
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

  const paramById = new Map();
  for (const p of parameters.parameters ?? []) paramById.set(p.id, p);
  const cubismMapping = manifest.cubism_mapping ?? {};

  const family = options.familyOverride ?? manifest.family;
  if (!family) {
    throw new Error(
      `physics-lint: template.manifest.json 에 family 필드가 없고 --family override 도 없음`,
    );
  }
  const rule = FAMILY_OUTPUT_RULES[family];
  if (!rule) {
    throw new Error(
      `physics-lint: family="${family}" 에 등록된 네이밍 규칙 없음 — FAMILY_OUTPUT_RULES 에 추가 필요`,
    );
  }

  const errors = [];

  const settings = physics.physics_settings ?? [];
  const meta = physics.meta ?? {};

  // C1
  if (meta.physics_setting_count !== settings.length) {
    errors.push(
      `C1 meta.physics_setting_count=${meta.physics_setting_count} 이지만 physics_settings.length=${settings.length}`,
    );
  }

  // C2/C3/C4 — sums
  let totalIn = 0;
  let totalOut = 0;
  let totalVert = 0;
  for (const s of settings) {
    totalIn += (s.input ?? []).length;
    totalOut += (s.output ?? []).length;
    totalVert += (s.vertices ?? []).length;
  }
  if (meta.total_input_count !== totalIn) {
    errors.push(
      `C2 meta.total_input_count=${meta.total_input_count} 이지만 합=${totalIn}`,
    );
  }
  if (meta.total_output_count !== totalOut) {
    errors.push(
      `C3 meta.total_output_count=${meta.total_output_count} 이지만 합=${totalOut}`,
    );
  }
  if (meta.vertex_count !== totalVert) {
    errors.push(
      `C4 meta.vertex_count=${meta.vertex_count} 이지만 합=${totalVert}`,
    );
  }

  // C5 dictionary ↔ settings
  const dictIds = (physics.physics_dictionary ?? []).map((d) => d.id);
  const settingIds = settings.map((s) => s.id);
  const dictSet = new Set(dictIds);
  const settingSet = new Set(settingIds);
  if (dictIds.length !== dictSet.size) {
    errors.push(`C5 physics_dictionary 에 중복 id 존재: ${duplicates(dictIds).join(", ")}`);
  }
  if (settingIds.length !== settingSet.size) {
    errors.push(
      `C5 physics_settings 에 중복 id 존재: ${duplicates(settingIds).join(", ")}`,
    );
  }
  for (const id of dictSet) {
    if (!settingSet.has(id)) {
      errors.push(`C5 dictionary 에는 있지만 settings 에 없음: ${id}`);
    }
  }
  for (const id of settingSet) {
    if (!dictSet.has(id)) {
      errors.push(`C5 settings 에는 있지만 dictionary 에 없음: ${id}`);
    }
  }

  // C6/C7/C8/C9/C10
  for (const s of settings) {
    const vertexCount = (s.vertices ?? []).length;
    for (const [i, inp] of (s.input ?? []).entries()) {
      const ref = paramById.get(inp.source_param);
      if (!ref) {
        errors.push(
          `C6 ${s.id}.input[${i}].source_param=${inp.source_param} 이 parameters.json 에 없음`,
        );
        continue;
      }
      if (ref.physics_input !== true) {
        errors.push(
          `C6 ${s.id}.input[${i}].source_param=${inp.source_param} 은 parameters.json 에 있지만 physics_input:true 가 아님`,
        );
      }
    }
    for (const [i, out] of (s.output ?? []).entries()) {
      const ref = paramById.get(out.destination_param);
      if (!ref) {
        errors.push(
          `C7 ${s.id}.output[${i}].destination_param=${out.destination_param} 이 parameters.json 에 없음`,
        );
      } else if (ref.physics_output !== true) {
        errors.push(
          `C7 ${s.id}.output[${i}].destination_param=${out.destination_param} 은 physics_output:true 가 아님`,
        );
      }

      if (typeof out.vertex_index !== "number" || out.vertex_index < 0 || out.vertex_index >= vertexCount) {
        errors.push(
          `C8 ${s.id}.output[${i}].vertex_index=${out.vertex_index} 이 vertices(len=${vertexCount}) 범위 밖`,
        );
      }

      if (!(out.destination_param in cubismMapping)) {
        errors.push(
          `C9 ${s.id}.output[${i}].destination_param=${out.destination_param} 이 template.manifest.cubism_mapping 에 없음`,
        );
      }

      if (!rule.pattern.test(out.destination_param)) {
        errors.push(
          `C10-suffix ${s.id}.output[${i}].destination_param=${out.destination_param} 이 family="${family}" 허용 접미사 ${rule.pattern.source} 를 따르지 않음`,
        );
      }

      for (const prefix of rule.forbiddenPrefixes) {
        if (out.destination_param.startsWith(prefix)) {
          errors.push(
            `C10-forbidden ${s.id}.output[${i}].destination_param=${out.destination_param} 이 family="${family}" 에 금지된 접두사 "${prefix}" 로 시작 (해부학 / 스코프 위반)`,
          );
        }
      }
    }
  }

  // C11 — parts/*.spec.json 의 parameter_ids 교차 검증. parts 디렉토리가 없거나 필드를
  // 쓰는 spec 이 0 건이면 no-op. schema 단계에서는 id 존재 여부를 알 수 없어 (cross-ref
  // 불가능) 이 시점이 유일한 CI 차단 지점.
  let partsChecked = 0;
  let partsWithBindings = 0;
  const partsDir = join(templateDir, "parts");
  if (existsSync(partsDir)) {
    const entries = await readdir(partsDir);
    for (const name of entries) {
      if (!name.endsWith(".spec.json")) continue;
      const specPath = join(partsDir, name);
      const spec = JSON.parse(await readFile(specPath, "utf8"));
      partsChecked += 1;
      if (!Array.isArray(spec.parameter_ids)) continue;
      partsWithBindings += 1;
      for (const [i, id] of spec.parameter_ids.entries()) {
        if (!paramById.has(id)) {
          errors.push(
            `C11 parts/${name}.parameter_ids[${i}]=${id} 이 parameters.json 에 없음 (slot_id=${spec.slot_id ?? "?"})`,
          );
        }
      }
    }
  }

  return {
    errors,
    summary: {
      family,
      setting_count: settings.length,
      total_input_count: totalIn,
      total_output_count: totalOut,
      vertex_count: totalVert,
      ids: settingIds,
      parts_checked: partsChecked,
      parts_with_bindings: partsWithBindings,
    },
  };
}

/** 두 템플릿의 physics.json 을 structural diff. 리턴: 사람이 읽을 수 있는 lines[]. */
export async function diffPhysics(baselineDir, targetDir) {
  const [baseline, target] = await Promise.all([
    readFile(join(baselineDir, "physics", "physics.json"), "utf8"),
    readFile(join(targetDir, "physics", "physics.json"), "utf8"),
  ]);
  const b = JSON.parse(baseline);
  const t = JSON.parse(target);
  const lines = [];
  const bIds = new Set((b.physics_settings ?? []).map((s) => s.id));
  const tIds = new Set((t.physics_settings ?? []).map((s) => s.id));
  for (const id of tIds) {
    if (!bIds.has(id)) {
      const s = t.physics_settings.find((x) => x.id === id);
      lines.push(`+ ${id}: 신규 — input ${s.input.length} · output ${s.output.length} · vertices ${s.vertices.length}`);
    }
  }
  for (const id of bIds) {
    if (!tIds.has(id)) {
      lines.push(`- ${id}: 제거됨`);
    }
  }
  for (const id of tIds) {
    if (!bIds.has(id)) continue;
    const bs = b.physics_settings.find((x) => x.id === id);
    const ts = t.physics_settings.find((x) => x.id === id);
    const bSig = settingSignature(bs);
    const tSig = settingSignature(ts);
    if (bSig !== tSig) {
      lines.push(`~ ${id}: 변경 (input/output/vertices 구조 차이)`);
    }
  }
  if (lines.length === 0) lines.push("no structural changes");
  return lines;
}

function settingSignature(s) {
  const ins = (s.input ?? []).map((i) => `${i.source_param}:${i.weight}:${i.type}:${i.reflect}`).join(",");
  const outs = (s.output ?? []).map((o) => `${o.destination_param}:${o.weight}:${o.type}:${o.vertex_index}`).join(",");
  return `in=${ins}|out=${outs}|verts=${(s.vertices ?? []).length}`;
}

function duplicates(arr) {
  const seen = new Set();
  const dup = new Set();
  for (const x of arr) {
    if (seen.has(x)) dup.add(x);
    else seen.add(x);
  }
  return [...dup];
}

async function main(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
    process.stderr.write(
      "Usage: node scripts/rig-template/physics-lint.mjs <templateDir> [--baseline <dir>] [--family <name>]\n",
    );
    process.exit(args.length === 0 ? 1 : 0);
  }
  const baselineIdx = args.indexOf("--baseline");
  const baseline = baselineIdx >= 0 ? args[baselineIdx + 1] : null;
  const familyIdx = args.indexOf("--family");
  const familyOverride = familyIdx >= 0 ? args[familyIdx + 1] : undefined;
  const skipIdx = new Set();
  if (baselineIdx >= 0) {
    skipIdx.add(baselineIdx);
    skipIdx.add(baselineIdx + 1);
  }
  if (familyIdx >= 0) {
    skipIdx.add(familyIdx);
    skipIdx.add(familyIdx + 1);
  }
  const positional = args.filter((x, i) => !x.startsWith("--") && !skipIdx.has(i));
  if (positional.length !== 1) {
    process.stderr.write("physics-lint: 정확히 1 개의 templateDir 이 필요\n");
    process.exit(1);
  }
  const templateDir = resolve(positional[0]);
  const res = await lintPhysics(templateDir, { familyOverride });
  const { errors, summary } = res;

  process.stdout.write(
    `physics-lint ${templateDir}: family=${summary.family} settings=${summary.setting_count} in=${summary.total_input_count} out=${summary.total_output_count} verts=${summary.vertex_count} parts=${summary.parts_checked}/${summary.parts_with_bindings}bind\n`,
  );
  for (const e of errors) process.stderr.write(`  ✗ ${e}\n`);
  if (errors.length === 0) process.stdout.write("  ✓ all checks pass\n");

  if (baseline) {
    const diff = await diffPhysics(resolve(baseline), templateDir);
    process.stdout.write("\ndiff vs baseline:\n");
    for (const line of diff) process.stdout.write(`  ${line}\n`);
  }

  process.exit(errors.length > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main(process.argv);
}
