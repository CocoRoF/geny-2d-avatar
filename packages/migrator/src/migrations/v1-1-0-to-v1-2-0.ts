import { join } from "node:path";

import { patchJson } from "../io.js";
import type { Migrator } from "../types.js";
import { V1_2_0_NEW_PARAMETERS } from "./data/v1-2-0.js";

export const migratorV110ToV120: Migrator = {
  from: "1.1.0",
  to: "1.2.0",
  async apply(outDir: string): Promise<string[]> {
    const todos: string[] = [];
    await patchJson(join(outDir, "template.manifest.json"), (m: any) => {
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
    await patchJson(join(outDir, "parameters.json"), (p: any) => {
      const existing = new Set(p.parameters.map((x: any) => x.id));
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
};
