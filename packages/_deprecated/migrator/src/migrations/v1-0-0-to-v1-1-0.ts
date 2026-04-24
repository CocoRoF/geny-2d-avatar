import { join } from "node:path";

import { patchJson } from "../io.js";
import type { Migrator } from "../types.js";
import { V1_1_0_NEW_PARAMETERS } from "./data/v1-1-0.js";

export const migratorV100ToV110: Migrator = {
  from: "1.0.0",
  to: "1.1.0",
  async apply(outDir: string): Promise<string[]> {
    const todos: string[] = [];
    await patchJson(join(outDir, "template.manifest.json"), (m: any) => {
      m.version = "1.1.0";
      m.cubism_mapping = {
        ...m.cubism_mapping,
        arm_pose_variant: "ParamArmPoseVariant",
        arm_l_angle: "ParamArmLAngle",
        arm_r_angle: "ParamArmRAngle",
      };
      return m;
    });
    await patchJson(join(outDir, "parameters.json"), (p: any) => {
      const existing = new Set(p.parameters.map((x: any) => x.id));
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
};
