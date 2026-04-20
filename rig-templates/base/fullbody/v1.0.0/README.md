# `tpl.base.v1.fullbody@1.0.0` (Foundation 스캐폴딩)

> **상태**: 세션 55 스캐폴딩 — `template.manifest.json` + `parameters.json` 만 확정. 파츠 spec / deformers / physics / motions / expressions / test_poses / textures 는 세션 56~59 에서 실 저작.

## 1. 개요

`halfbody v1.3.0` 의 상반신 저작을 승계하고 **하반신 파츠 + 관련 2차 흔들림 물리 + 걸음걸이 모션** 을 추가하는 전신 표준 템플릿. 코스튬 프리뷰 / 댄스 / 트레일러 등 전신 노출이 필요한 장면에 사용.

## 2. 변경점 (halfbody v1.3.0 대비)

### 2.1 Parameters: 49 → **59** (+10)

추가된 그룹 2종: `lower_body`, `clothing`.

| id | group | channel | physics_input | physics_output | 비고 |
|---|---|---|---|---|---|
| `leg_l_angle` | lower_body | core | ✅ | | 정적 pose + `leg_sway_phys_l` / `skirt_sway_phys` 입력 |
| `leg_r_angle` | lower_body | core | ✅ | | 정적 pose + `leg_sway_phys_r` / `skirt_sway_phys` 입력 |
| `foot_l_angle` | lower_body | core | | | 정적 pose 전용 |
| `foot_r_angle` | lower_body | core | | | 정적 pose 전용 |
| `leg_sway_l` | lower_body | extension | | ✅ | `leg_sway_phys_l` 출력 |
| `leg_sway_r` | lower_body | extension | | ✅ | `leg_sway_phys_r` 출력 |
| `hip_phys` | lower_body | extension | | ✅ | `hip_phys` 출력 |
| `cloth_skirt_sway` | clothing | extension | | ✅ | `skirt_sway_phys` 출력 |
| `cloth_skirt_fuwa` | clothing | extension | | ✅ | `skirt_fuwa_phys` 출력 |
| `cloth_cape_sway` | clothing | extension | | ✅ | 세션 57 에서 `accessory_sway_phys` 공유 or 별도 setting 결정 |

### 2.2 Manifest 변경

- `family: "fullbody"` — schema enum 기존 값 재사용, `FAMILY_OUTPUT_RULES.fullbody`(세션 49) 자동 적용.
- `canvas: 2048×4096` — 상반신 2048² 에서 세로 2배 확장.
- `ratio.head_to_body: "1:6"` — 전신 기준.
- `compat.motion_packs` 감축 (`idle.default` / `blink.auto` / `lipsync.mock` 만 — 상반신 전용 팩 3종은 세션 58 에서 호환성 재검증 후 복구).
- `cubism_mapping` +10 (하반신 core 4 + physics_output 6).
- `hit_areas` +1 (`HitAreaHip` bound_to_part=`hip` — 파츠 저작은 세션 56).

### 2.3 아직 없는 것 (세션 56~59)

- `parts/` — 상반신 30 + 하반신 8 = 38 파츠 예상 (`hip`/`leg_l`/`leg_r`/`foot_l`/`foot_r`/`cloth_skirt`/`cloth_cape`/`acc_belt` 신규).
- `deformers.json` — halfbody v1.3.0 21 노드 + 하반신 deformer subtree (예상 28~30 노드).
- `physics/physics.json` — 12 → **17** PhysicsSetting (+5: `skirt_sway_phys` / `skirt_fuwa_phys` / `leg_sway_phys_l` / `leg_sway_phys_r` / `hip_phys`).
- `motions/` — `idle.default@1.2.0` 리마스터 (body_angle_x 추가로 `skirt_sway_phys` 유도).
- `expressions/` — halfbody 3종 그대로 승계 예상.
- `test_poses/validation_set.json`, `textures/base.png` — 세션 59.

## 3. 저작 게이트 진행 상황 (ADR 0005)

| Gate | 세션 | 상태 |
|---|---|---|
| L1 Migrator (v1.3.0 halfbody → v1.0.0 fullbody 는 없음 — 별도 family) | — | N/A (새 family) |
| L2 rig-template-lint `--family fullbody` (세션 110 이전 이름 physics-lint) | 57 | 파츠/물리 저작 후 활성 |
| L3 저자 판단 (physics tuning) | 57 | 세션 57 에서 `_sway/_phys/_fuwa` 계수 결정 |
| L4 파이프라인 불변식 | 59 | `@geny/exporter-core` family=fullbody 분기 후 byte-equal golden |

## 4. 관련 문서

- 계획: [`progress/plans/fullbody-v1-authoring.md`](../../../../progress/plans/fullbody-v1-authoring.md)
- 세션 52 (계획 수립): [`progress/sessions/2026-04-19-session-52-fullbody-authoring-review.md`](../../../../progress/sessions/2026-04-19-session-52-fullbody-authoring-review.md)
- FAMILY_OUTPUT_RULES: [`scripts/rig-template/rig-template-lint.mjs`](../../../../scripts/rig-template/rig-template-lint.mjs) (세션 49, 세션 110 리브랜딩)
