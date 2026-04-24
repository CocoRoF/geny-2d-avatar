# Half Body Standard — v1.2.0 (`tpl.base.v1.halfbody`)

> VTuber·버튜버 방송에 적합한 상반신 표준 템플릿. 정면 중심, 넓은 얼굴 가동 범위, 손 제스처 일부, 립싱크 5 모음 전체. 장르 중립적인 인상을 기본으로 하고 스타일 프로파일로 개성을 부여한다.

v1.1.0 대비 **Fuwa(볼륨) 파라미터 5종 + 물리 9 Setting(4 sway L/R 분리 + 5 fuwa) + `overall_warp` 실 deformer 연결 + `cloth_warp` 분리** 가 반영됐다. v1.0.0·v1.1.0 과 병렬로 유지되며(ADR 0003), 참조형 아바타(ADR 0004) 는 `template_version` 으로 셋 중 하나를 지정한다.

---

## Diff from v1.1.0

| 영역 | v1.1.0 | v1.2.0 |
|---|---|---|
| 파라미터 총수 | 40 | 45 (+`hair_front_fuwa`, `hair_side_fuwa_l/r`, `hair_back_fuwa`, `cloth_main_fuwa`) |
| 디포머 노드 | 16 | 18 (+`overall_warp`, +`cloth_warp`) |
| `overall_x/y/rotate` | root 주석만 (런타임 주입) | 실제 `overall_warp.params_in` 으로 연결 |
| `hair_back_warp.parent` | `root` | `overall_warp` (docs/03 §4.2 회전 지연 유지) |
| `cloth_main.deformation_parent` | `body_visual` | `cloth_warp` |
| 물리 Setting | 3 | 9 (4 sway + 5 fuwa; 입력 24 / 출력 9 / 버텍스 18) |
| `hair_side_sway` | 단일 setting(L+R 출력 공유) | L/R 분리(독립 시뮬, R 은 reflect=true) |

mao_pro 기준 남은 3 Setting (ahoge · accessory_sway · body_breath_phys) 은 해당 파츠 도입 시점에 합류 예정.
아바타 마이그레이션은 세션 09 의 `scripts/rig-template/migrate.mjs` 로 자동화.

---

## 1. 의도한 인상 (Intended Vibe)

장르 중립, 정면 중심, 한 평 방송 셋업을 가정. 고개 가동 범위 ±30°, 상반신 ±10°, 립싱크 모음 5종을 모두 구분 가능한 입 형태. 표정 확장성은 `exp3` Blend 3모드와 `ParamEyeLForm/RForm/ParamMouthUp/Down` 으로 확보한다.

상세 근거는 [../../../../docs/03-rig-template-spec.md](../../../../docs/03-rig-template-spec.md) §2.1, §12.1.

---

## 2. 구성 요소 (Composition)

| 파일 | 역할 | 스키마 |
|---|---|---|
| `template.manifest.json` | 메타·Cubism 매핑·HitArea·호환성 | `schema/v1/rig-template.schema.json` |
| `parameters.json` | 45 파라미터 (core 27 + extension 18), 7 그룹, CombinedAxes 2쌍 | `schema/v1/parameters.schema.json` |
| `parts/*.spec.json` | 29 파츠 (arm A/B 분리 · cloth_main 의 deformation_parent=cloth_warp) | `schema/v1/part-spec.schema.json` |
| `deformers.json` | 18 노드 — overall_warp · cloth_warp 포함 | `schema/v1/deformers.schema.json` |
| `physics/physics.json` | 9 Setting — 4 sway(front/side_l/side_r/back) + 5 fuwa(동일 4 hair + cloth_main). mao_pro 9/12. | `schema/v1/physics.schema.json` |
| `pose.json` | 2 mutex 그룹 (arm L/R A·B) — v1.1.0 과 동일 | `schema/v1/pose.schema.json` |
| `motions/` | 7 팩 (v1.1.0 과 동일 — Fuwa 연출은 exporter 이후) | `schema/v1/motion-pack.schema.json` |
| `test_poses/validation_set.json` | 20 포즈 (v1.0.0 동일) | `schema/v1/test-poses.schema.json` |

> **범위 주의**: v1.2.0 는 Fuwa·물리 확장·overall 연결 세션(세션 07). mao_pro 11/12 번째 Setting(ahoge/accessory_sway/body_breath_phys) 은 각 파츠 도입 시.

---

## 3. 파라미터 요약 (45개)

| 그룹 | 파라미터 | 채널 |
|---|---|---|
| face | `head_angle_x/y/z` (deg) | core |
| body | `body_angle_x/y/z` (deg), `body_breath`, `arm_pose_variant`, `arm_l_angle`, `arm_r_angle`, `cloth_main_fuwa` | core (7) / extension (1, physics_output) |
| eyes | `eye_open_l/r`, `eye_smile_l/r`, `eye_form_l/r`, `eye_ball_x/y`, `eye_ball_form` | core (8) + extension (1) |
| brows | `brow_l/r_y/x/angle/form` (8 ea.) | core (4) + extension (4) |
| mouth | `mouth_vowel_a/i/u/e/o`, `mouth_up`, `mouth_down` | core (5) + extension (2) |
| hair | `hair_front_sway`, `hair_side_sway_l/r`, `hair_back_sway`, `hair_front_fuwa`, `hair_side_fuwa_l/r`, `hair_back_fuwa` | extension (physics_output, 8) |
| overall | `overall_x`, `overall_y`, `overall_rotate` | extension |

CombinedAxes: `(head_angle_x, head_angle_y)`, `(overall_x, overall_y)` — 2D 조이스틱 UI.

전체 Cubism 매핑은 `template.manifest.json` 의 `cubism_mapping` 딕셔너리 참조.

---

## 4. 디포머 트리 (18 노드)

```
root
└── overall_warp (overall_x/y/rotate)
    ├── breath_warp (body_breath)
    │   └── body_pose_warp (body_angle_x/y/z)
    │       ├── body_visual
    │       │   ├── cloth_warp (cloth_main_fuwa) → cloth_main
    │       │   ├── arm_l_warp (arm_l_angle) → arm_l_a / arm_l_b
    │       │   └── arm_r_warp (arm_r_angle) → arm_r_a / arm_r_b
    │       └── neck_warp
    │           └── head_pose_rot (head_angle_x/y/z)
    │               ├── eye_l_warp / eye_r_warp
    │               ├── mouth_warp
    │               ├── hair_front_warp (sway + fuwa)
    │               ├── hair_side_warp_l (sway_l + fuwa_l)
    │               ├── hair_side_warp_r (sway_r + fuwa_r)
    │               └── accessories_layer
    └── hair_back_warp (sway + fuwa)
```

`hair_back_warp` 은 `head_pose_rot`/`body_pose_warp` 외부에 배치되어 회전 지연 효과를 유지하면서 `overall_warp` 의 전체 변환에는 포함됨 (docs/03 §4.2).

---

## 5. 호환성 (Compat)

- **Motion Packs**: `idle.default@^1`, `idle.sleepy@^1`, `blink.auto@^1`, `greet.wave@^1`, `nod.yes@^1`, `shake.no@^1`, `lipsync.mock@^1`
- **Physics**: `physics.v1`, preset `normal`
- **LipSync Mapping**: `lipsync_mapping.v1.*`
- **Export Targets**: `cubism@5`, `vtube_studio@1`, `web-sdk@0.1`, `psd@1`

---

## 6. HitAreas

Web SDK 에서 클릭/탭 인터랙션으로 노출되는 영역.

| id | role | 파츠 |
|---|---|---|
| `HitAreaHead` | head | `face_base` |
| `HitAreaBody` | body | `torso` |

---

## 7. 검증 (Validation)

```bash
# 저장소 루트에서
task validate:schemas
# 또는
pnpm validate:schemas
```

`scripts/validate-schemas.mjs` 가 `schema/v1/**` 와 `rig-templates/**` 를 순회하며 Ajv 2020 로 유효성 검사. 이 릴리스 후보는 현재 스크립트가 통과하는 것이 "준공 조건" 이다.

v1.2.0 부터 물리 출력 접미사 regex 가 `_(sway|phys|fuwa)(_[lr])?$` 로 확장됐다 (세션 07 D1).

---

## 8. 다음 단계 (Not Yet in v1.2.0)

- mao_pro 11/12 Setting — `ahoge_sway` (정수리 삐침 머리), `accessory_sway_*` (모자/리본 등), `body_breath_phys` (흉부 2차 호흡). 해당 파츠 파츠 팩 도입 시 함께.
- Fuwa 연출을 반영한 모션(`idle.default` 리마스터). 세션 08 exporter 이후.
- `packages/exporter-core` — 이 디렉터리를 Cubism `.moc3/.physics3.json/.motion3.json/.pose3.json/.cdi3.json` 로 변환 — 세션 08.
- 마이그레이션 스크립트 `scripts/rig-template/migrate.mjs` — 세션 09.

모두 이후 patch/minor 릴리스에서 점진 추가된다(ADR 0003).

---

## 9. 참고 문서

- [docs/03](../../../../docs/03-rig-template-spec.md) — 리그 템플릿 명세 (§4.2 디포머 계층, §6.2 물리 규약, §12.1 mao_pro 기준)
- [docs/04](../../../../docs/04-parts-specification.md) — 파츠 명세
- [docs/11](../../../../docs/11-export-and-deployment.md) — 내보내기
- [ADR 0003](../../../../progress/adr/0003-rig-template-versioning.md) — 버전·디렉터리 규약
- [ADR 0004](../../../../progress/adr/0004-avatar-as-data.md) — 참조형 아바타
- [세션 07 로그](../../../../progress/sessions/2026-04-18-session-07-fuwa-physics.md) — 본 bump 의 결정/지표
