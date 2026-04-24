import { join } from "node:path";

import { appendIfMissing, patchJson, writeIfAbsent } from "../io.js";
import type { Migrator } from "../types.js";
import {
  V1_3_0_ACCESSORIES_LAYER_NOTES,
  V1_3_0_AHOGE_PART,
  V1_3_0_MAO_PRO_APPENDIX,
  V1_3_0_NEW_DEFORMERS,
  V1_3_0_NEW_PARAMETERS,
} from "./data/v1-3-0.js";

export const migratorV120ToV130: Migrator = {
  from: "1.2.0",
  to: "1.3.0",
  async apply(outDir: string): Promise<string[]> {
    const todos: string[] = [];
    await patchJson(join(outDir, "template.manifest.json"), (m: any) => {
      m.version = "1.3.0";
      m.cubism_mapping = {
        ...m.cubism_mapping,
        ahoge_sway: "ParamAhogeSway",
        accessory_back_sway: "ParamAccessoryBackSway",
        accessory_front_sway: "ParamAccessoryFrontSway",
      };
      return m;
    });
    await patchJson(join(outDir, "parameters.json"), (p: any) => {
      const existing = new Set(p.parameters.map((x: any) => x.id));
      for (const def of V1_3_0_NEW_PARAMETERS) {
        if (!existing.has(def.id)) p.parameters.push(def);
      }
      return p;
    });

    // 세션 37 — mechanical patches (구조적 결정론).
    await writeIfAbsent(
      join(outDir, "parts", "ahoge.spec.json"),
      JSON.stringify(V1_3_0_AHOGE_PART, null, 2) + "\n",
    );
    await patchJson(
      join(outDir, "parts", "accessory_back.spec.json"),
      (p: any) => {
        if (p.deformation_parent === "accessories_layer") {
          p.deformation_parent = "accessory_back_warp";
        }
        return p;
      },
    );
    await patchJson(
      join(outDir, "parts", "accessory_front.spec.json"),
      (p: any) => {
        if (p.deformation_parent === "accessories_layer") {
          p.deformation_parent = "accessory_front_warp";
        }
        return p;
      },
    );
    await patchJson(join(outDir, "deformers.json"), (d: any) => {
      const existingIds = new Set(d.nodes.map((x: any) => x.id));
      for (const node of d.nodes) {
        if (node.id === "accessories_layer") {
          node.notes = V1_3_0_ACCESSORIES_LAYER_NOTES;
        }
      }
      const insertAt = d.nodes.findIndex(
        (x: any) => x.id === "hair_back_warp",
      );
      const toInsert = V1_3_0_NEW_DEFORMERS.filter(
        (n) => !existingIds.has(n.id),
      );
      if (toInsert.length > 0) {
        if (insertAt >= 0) {
          d.nodes.splice(insertAt, 0, ...toInsert);
        } else {
          d.nodes.push(...toInsert);
        }
      }
      return d;
    });
    await appendIfMissing(
      join(outDir, "physics", "mao_pro_mapping.md"),
      "## 6. v1.3.0 추가분",
      V1_3_0_MAO_PRO_APPENDIX,
    );

    // 물리 튜닝만 저자 개입 (세션 37 D1).
    todos.push(
      "v1.3.0: `physics/physics.json` 을 9 setting → 12 setting 으로 확장 — 이것이 **유일한 저자 개입 지점**입니다. 추가할 3 setting: `ahoge_sway_phys` (입력: head_angle_x 70w + head_angle_y 30w + body_angle_x 20w → `ahoge_sway`, mobility 1.0, delay 0.55, radius 5) / `accessory_sway_phys` (입력: body_angle_x 60w + body_angle_z 40w → 공유 출력 `accessory_back_sway` scale=1 weight=80 + `accessory_front_sway` scale=0.8 weight=70) / `body_breath_phys` (입력: body_breath 100w + body_angle_y 20w → `body_breath_phys` weight=60 Y). 저작 후 `meta.physics_setting_count=12` / `meta.total_input_count=31` / `meta.total_output_count=13` / `meta.vertex_count=24` 로 갱신. 참고: `rig-templates/base/halfbody/v1.3.0/physics/physics.json` (세션 31 authored 결과).",
    );
    return todos;
  },
};
