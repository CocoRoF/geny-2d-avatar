import type { DeformerNodeDef, ParameterDef } from "../../types.js";

export const V1_3_0_NEW_PARAMETERS: ParameterDef[] = [
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
    notes:
      "머리 상단 아호게 흔들림. head_angle_x/y + body_angle_x 를 입력으로 `ahoge_sway_phys` 가 계산. docs/03 §12.1 #2.",
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

export const V1_3_0_AHOGE_PART = {
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
} as const;

export const V1_3_0_ACCESSORIES_LAYER_NOTES =
  "머리 움직임을 따라가는 액세서리 레이어(모자, 헤드폰 등). 자식 warp: accessory_back_warp, accessory_front_warp. body-level 액세서리 분리는 후속 bump.";

export const V1_3_0_NEW_DEFORMERS: DeformerNodeDef[] = [
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

export const V1_3_0_MAO_PRO_APPENDIX = `
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
