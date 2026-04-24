import type { ParameterDef } from "../../types.js";

export const V1_1_0_NEW_PARAMETERS: ParameterDef[] = [
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
    notes:
      "0=A (중립), 1=B (교체 포즈). Pose3 mutex 로 A/B 파츠 동시 노출 방지. docs/03 §12.1 #3.",
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
    notes:
      "캐릭터 왼팔 회전. arm_l_warp 의 주 입력. greet.wave 포함 제스처 모션에서 사용.",
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
