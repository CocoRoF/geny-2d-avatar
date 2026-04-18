# Half Body Standard — v1.3.0 (`tpl.base.v1.halfbody`)

> VTuber·버튜버 방송에 적합한 상반신 표준 템플릿. 정면 중심, 넓은 얼굴 가동 범위, 손 제스처 일부, 립싱크 5 모음 전체. 장르 중립적인 인상을 기본으로 하고 스타일 프로파일로 개성을 부여한다.

v1.2.0 대비 **ahoge 파츠 + 물리 3 Setting 추가(ahoge_sway / accessory_sway 공유 출력 / body_breath_phys) + accessory back/front 개별 warp 분리 + 4 파라미터 신설** 가 반영됐다. mao_pro 기준 **12/12 Setting 달성**. v1.0.0·v1.1.0·v1.2.0 과 병렬로 유지되며(ADR 0003), 참조형 아바타(ADR 0004) 는 `template_version` 으로 넷 중 하나를 지정한다.

---

## Diff from v1.2.0

| 영역 | v1.2.0 | v1.3.0 |
|---|---|---|
| 파라미터 총수 | 45 | 49 (+`ahoge_sway`, `accessory_back_sway`, `accessory_front_sway`, `body_breath_phys`) |
| 파츠 | 29 | 30 (+`ahoge`) |
| 디포머 노드 | 18 | 21 (+`ahoge_warp`, `accessory_back_warp`, `accessory_front_warp`) |
| 물리 Setting | 9 | **12** (+`ahoge_sway_phys`, `accessory_sway_phys` 2 출력, `body_breath_phys`) |
| 물리 입력/출력/버텍스 | 24 / 9 / 18 | 31 / 13 / 24 |
| mao_pro 달성 | 9/12 | **12/12** |

아바타 마이그레이션은 `scripts/rig-template/migrate.mjs` 로 자동화 (세션 27 의 v1.2.0→v1.3.0 엔트리). 단, 저자 판단이 필요한 물리 튜닝/ahoge 파츠/deformers 신규 노드는 자동 이전되지 않고 `MIGRATION_REPORT.md` TODO 로 남는다 — 본 v1.3.0 디렉터리가 그 TODO 의 **정답 사본** 이다.

---

## 1. 의도한 인상 (Intended Vibe)

v1.2.0 와 동일 (상반신 표준, ±30° head / ±10° body / 립싱크 모음 5). v1.3.0 은 시각적 인상의 **ahoge(안테나 머리)** 를 명시적으로 파츠화해 캐릭터 호감도 시그널을 분리했다.

상세 근거는 [../../../../docs/03-rig-template-spec.md](../../../../docs/03-rig-template-spec.md) §2.1, §12.1 #2.

---

## 2. 구성 요소 (Composition)

| 파일 | 역할 | 스키마 |
|---|---|---|
| `template.manifest.json` | 메타·Cubism 매핑(49 entries)·HitArea·호환성 | `schema/v1/rig-template.schema.json` |
| `parameters.json` | 49 파라미터 (core 27 + extension 22), 7 그룹, CombinedAxes 2쌍 | `schema/v1/parameters.schema.json` |
| `parts/*.spec.json` | 30 파츠 (+`ahoge`) | `schema/v1/part-spec.schema.json` |
| `deformers.json` | 21 노드 (+`ahoge_warp`, accessory back/front 분기) | `schema/v1/deformers.schema.json` |
| `physics/physics.json` | **12 Setting** — 4 sway + 5 fuwa + ahoge + accessory(2 out) + body_breath_phys. mao_pro 12/12. | `schema/v1/physics.schema.json` |
| `pose.json` | 2 mutex 그룹 (arm L/R A·B) — v1.1.0 이후 불변 | `schema/v1/pose.schema.json` |
| `motions/` | 7 팩 (v1.2.0 과 동일 — ahoge/accessory 모션 확장은 후속) | `schema/v1/motion-pack.schema.json` |
| `expressions/` | 3 표정 팩 (smile/wink/neutral) — v1.2.0 과 동일 | `schema/v1/expression-pack.schema.json` |
| `test_poses/validation_set.json` | 20 포즈 (v1.0.0 동일) | `schema/v1/test-poses.schema.json` |

---

## 3. 파라미터 요약 (49개)

| 그룹 | 파라미터 | 채널 |
|---|---|---|
| face | `head_angle_x/y/z` (deg) | core |
| body | `body_angle_x/y/z` (deg), `body_breath`, `arm_pose_variant`, `arm_l_angle`, `arm_r_angle`, `cloth_main_fuwa`, **`accessory_back_sway`**, **`accessory_front_sway`**, **`body_breath_phys`** | core (7) / extension (4, physics_output) |
| eyes | `eye_open_l/r`, `eye_smile_l/r`, `eye_form_l/r`, `eye_ball_x/y`, `eye_ball_form` | core (8) + extension (1) |
| brows | `brow_l/r_y/x/angle/form` (8 ea.) | core (4) + extension (4) |
| mouth | `mouth_vowel_a/i/u/e/o`, `mouth_up`, `mouth_down` | core (5) + extension (2) |
| hair | `hair_front_sway`, `hair_side_sway_l/r`, `hair_back_sway`, `hair_front_fuwa`, `hair_side_fuwa_l/r`, `hair_back_fuwa`, **`ahoge_sway`** | extension (physics_output, 9) |
| overall | `overall_x`, `overall_y`, `overall_rotate` | extension |

굵게 표시한 4 파라미터가 v1.3.0 신규.

---

## 4. 디포머 트리 (21 노드)

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
    │               ├── ahoge_warp (ahoge_sway) → ahoge              ★ v1.3.0
    │               └── accessories_layer
    │                   ├── accessory_back_warp  (accessory_back_sway)  → accessory_back   ★ v1.3.0
    │                   └── accessory_front_warp (accessory_front_sway) → accessory_front  ★ v1.3.0
    └── hair_back_warp (sway + fuwa)
```

`ahoge_warp` 은 `head_pose_rot` 자식으로 붙어 머리 회전을 따라가되 자체 sway 물리로 지연/오버슈트가 가장 큼 (radius 5, mobility 1.0). `accessories_layer` 는 이제 컨테이너로만 남고, 실제 변형은 `accessory_back_warp`·`accessory_front_warp` 가 각각의 sway 파라미터를 소비한다.

---

## 5. 물리 설정 (12 Setting)

| ID | 이름 | 범주 | 입력 | 출력 |
|---|---|---|---|---|
| 1 | Hair Front Sway | Sway | head/body angle × z | `hair_front_sway` |
| 2 | Hair Side Sway (L) | Sway | head/body angle × z | `hair_side_sway_l` |
| 3 | Hair Side Sway (R) | Sway | head/body angle × z (reflect=true) | `hair_side_sway_r` |
| 4 | Hair Back Sway | Sway | head/body angle × z | `hair_back_sway` |
| 5 | Hair Front Fuwa | Fuwa | body_breath | `hair_front_fuwa` |
| 6 | Hair Side Fuwa (L) | Fuwa | body_breath + head_angle_x (reflect=true) | `hair_side_fuwa_l` |
| 7 | Hair Side Fuwa (R) | Fuwa | body_breath + head_angle_x | `hair_side_fuwa_r` |
| 8 | Hair Back Fuwa | Fuwa | body_breath | `hair_back_fuwa` |
| 9 | Cloth Main Fuwa | Fuwa | body_breath + body_angle_x | `cloth_main_fuwa` |
| **10** | **Ahoge Sway** | Secondary | head_angle_x/y + body_angle_x | **`ahoge_sway`** |
| **11** | **Accessory Sway** | Secondary | body_angle_x + body_angle_z | **`accessory_back_sway` + `accessory_front_sway`** (2 출력 공유) |
| **12** | **Body Breath Phys** | Secondary | body_breath + body_angle_y | **`body_breath_phys`** |

**Totals**: input 31 · output 13 · vertex 24 · fps 30. mao_pro 매핑 상세는 `physics/mao_pro_mapping.md`.

---

## 6. 호환성 (Compat)

- **Motion Packs**: v1.2.0 과 동일 (7 팩). ahoge/accessory 전용 모션은 v1.3.1+ 에서.
- **Expression Packs**: v1.2.0 과 동일 (3 팩).
- **Physics**: `physics.v1`, preset `normal`
- **LipSync Mapping**: `lipsync_mapping.v1.*`
- **Export Targets**: `cubism@5`, `vtube_studio@1`, `web-sdk@0.1`, `psd@1`

---

## 7. HitAreas

v1.2.0 와 동일.

| id | role | 파츠 |
|---|---|---|
| `HitAreaHead` | head | `face_base` |
| `HitAreaBody` | body | `torso` |

---

## 8. 검증 (Validation)

```bash
task validate:schemas    # 또는 pnpm validate:schemas
```

`scripts/validate-schemas.mjs` 가 v1.3.0 도 v1.0.0~v1.2.0 과 동일하게 순회. 물리 출력 접미사 regex `_(sway|phys|fuwa)(_[lr])?$` 는 v1.2.0 과 동일 — `body_breath_phys` 가 `_phys` 접미사로 규약 만족.

---

## 9. 다음 단계 (Not Yet in v1.3.0)

- `motions/ahoge_bounce.motion.json` — ahoge 강조 모션 (exporter 이후).
- `motions/accessory_greet.motion.json` — 모자 리본 흔들림 강조.
- Fuwa·ahoge 통합 `idle.default` 리마스터.
- 물리 프리셋별 튜닝 (`light`/`heavy` 기준 damping 재측정).

모두 이후 patch/minor 릴리스에서 점진 추가된다(ADR 0003).

---

## 10. 참고 문서

- [docs/03](../../../../docs/03-rig-template-spec.md) — 리그 템플릿 명세 (§4.2 디포머 계층, §6.2 물리 규약, §12.1 mao_pro 기준)
- [docs/04](../../../../docs/04-parts-specification.md) — 파츠 명세
- [docs/11](../../../../docs/11-export-and-deployment.md) — 내보내기
- [ADR 0003](../../../../progress/adr/0003-rig-template-versioning.md) — 버전·디렉터리 규약
- [ADR 0004](../../../../progress/adr/0004-avatar-as-data.md) — 참조형 아바타
- [세션 31 로그](../../../../progress/sessions/2026-04-18-session-31-rig-v1.3.0-authored.md) — 본 bump 의 결정/지표
