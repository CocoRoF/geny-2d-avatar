# Half Body Standard — v1.1.0 (`tpl.base.v1.halfbody`)

> VTuber·버튜버 방송에 적합한 상반신 표준 템플릿. 정면 중심, 넓은 얼굴 가동 범위, 손 제스처 일부, 립싱크 5 모음 전체. 장르 중립적인 인상을 기본으로 하고 스타일 프로파일로 개성을 부여한다.

v1.0.0 대비 **팔 A/B variant 도입 + 첫 `pose.json` + `greet.wave` 정식화** 가 반영됐다. v1.0.0 과 병렬로 유지되며(ADR 0003), 참조형 아바타(ADR 0004) 는 `template_version` 으로 양쪽 중 하나를 지정한다.

---

## Diff from v1.0.0

| 영역 | v1.0.0 | v1.1.0 |
|---|---|---|
| 파라미터 총수 | 37 | 40 (+`arm_pose_variant`, `arm_l_angle`, `arm_r_angle`) |
| 팔 파츠 | `arm_l`, `arm_r` (2) | `arm_l_a`, `arm_l_b`, `arm_r_a`, `arm_r_b` (4) |
| 디포머 노드 | 14 | 16 (+`arm_l_warp`, `arm_r_warp` under `body_visual`) |
| `pose.json` | 부재 | 2 mutex 그룹 (arm L/R A·B) |
| `greet.wave` 모션 | `body_angle_x` 플레이스홀더 | `arm_r_angle` sway + `mouth_up` |
| 물리 설정 | 3 (`hair_front/side/back_sway`) | 3 (변경 없음 — Fuwa/cloth 12 Setting 은 차기 bump) |

구 아바타 마이그레이션은 `packages/exporter-core` + `scripts/rig-template/migrate.mjs` (세션 08+) 에서 자동화.

---

## 1. 의도한 인상 (Intended Vibe)

장르 중립, 정면 중심, 한 평 방송 셋업을 가정. 고개 가동 범위 ±30°, 상반신 ±10°, 립싱크 모음 5종을 모두 구분 가능한 입 형태. 표정 확장성은 `exp3` Blend 3모드와 `ParamEyeLForm/RForm/ParamMouthUp/Down` 으로 확보한다.

상세 근거는 [../../../../docs/03-rig-template-spec.md](../../../../docs/03-rig-template-spec.md) §2.1, §12.1.

---

## 2. 구성 요소 (Composition)

| 파일 | 역할 | 스키마 |
|---|---|---|
| `template.manifest.json` | 메타·Cubism 매핑·HitArea·호환성 | `schema/v1/rig-template.schema.json` |
| `parameters.json` | 40 파라미터 (core 27 + extension 13), 7 그룹, CombinedAxes 2쌍 | `schema/v1/parameters.schema.json` |
| `parts/*.spec.json` | 29 파츠 (arm A/B 분리 반영) | `schema/v1/part-spec.schema.json` |
| `deformers.json` | 16 노드 — arm_l/r_warp 포함 | `schema/v1/deformers.schema.json` |
| `physics/physics.json` | 3 Setting (hair front/side/back). 12 Setting 확장은 차기 bump. | `schema/v1/physics.schema.json` |
| `pose.json` | 2 mutex 그룹 (arm L/R A·B) | `schema/v1/pose.schema.json` |
| `motions/` | 7 팩 (`greet.wave` v1.1.0, 나머지 v1.0.0 동일) | `schema/v1/motion-pack.schema.json` |
| `test_poses/validation_set.json` | 20 포즈 (v1.0.0 동일) | `schema/v1/test-poses.schema.json` |

> **범위 주의**: v1.1.0 은 구조적 팔 variant 전환(세션 06). Fuwa/cloth 볼륨·물리 12 Setting·overall deformer 연결은 **세션 07** 로 이월. `progress/sessions/` 의 세션 로그를 참조.

---

## 3. 파라미터 요약 (37개)

| 그룹 | 파라미터 | 채널 |
|---|---|---|
| face | `head_angle_x/y/z` (deg) | core |
| body | `body_angle_x/y/z` (deg), `body_breath`, `arm_pose_variant`, `arm_l_angle`, `arm_r_angle` | core / core+physics_input |
| eyes | `eye_open_l/r`, `eye_smile_l/r`, `eye_form_l/r`, `eye_ball_x/y`, `eye_ball_form` | core (8) + extension (1) |
| brows | `brow_l/r_y/x/angle/form` (8 ea.) | core (4) + extension (4) |
| mouth | `mouth_vowel_a/i/u/e/o`, `mouth_up`, `mouth_down` | core (5) + extension (2) |
| hair | `hair_front_sway`, `hair_side_sway_l/r`, `hair_back_sway` | extension (physics_output) |
| overall | `overall_x`, `overall_y`, `overall_rotate` | extension |

CombinedAxes: `(head_angle_x, head_angle_y)`, `(overall_x, overall_y)` — 2D 조이스틱 UI.

전체 Cubism 매핑은 `template.manifest.json` 의 `cubism_mapping` 딕셔너리 참조.

---

## 4. 호환성 (Compat)

- **Motion Packs**: `idle.default@^1`, `idle.sleepy@^1`, `blink.auto@^1`, `greet.wave@^1`, `nod.yes@^1`, `shake.no@^1`, `lipsync.mock@^1`
- **Physics**: `physics.v1`, preset `normal`
- **LipSync Mapping**: `lipsync_mapping.v1.*`
- **Export Targets**: `cubism@5`, `vtube_studio@1`, `web-sdk@0.1`, `psd@1`

---

## 5. HitAreas

Web SDK 에서 클릭/탭 인터랙션으로 노출되는 영역.

| id | role | 파츠 |
|---|---|---|
| `HitAreaHead` | head | `face_base` |
| `HitAreaBody` | body | `torso` |

---

## 6. 검증 (Validation)

```bash
# 저장소 루트에서
task validate:schemas
# 또는
pnpm validate:schemas
```

`scripts/validate-schemas.mjs` 가 `schema/v1/**` 와 `rig-templates/**` 를 순회하며 Ajv 2020 로 유효성 검사. 이 릴리스 후보는 현재 스크립트가 통과하는 것이 "준공 조건" 이다.

---

## 7. 다음 단계 (Not Yet in v1.1.0)

- Fuwa/cloth 볼륨 파라미터 (`hair_*_fuwa`, `cloth_main_fuwa`) — 세션 07
- `overall_x/y/rotate` 의 deformer 연결 — 세션 07
- `normal` 물리 프리셋 12 Setting 확장 (세분화된 hair · cloth 체인) — 세션 07
- `packages/exporter-core` — 이 디렉터리를 Cubism `.moc3/.physics3.json/.motion3.json/.pose3.json/.cdi3.json` 로 변환 — 세션 08

모두 이후 patch/minor 릴리스에서 점진 추가된다(ADR 0003).

---

## 8. 참고 문서

- [docs/03](../../../../docs/03-rig-template-spec.md) — 리그 템플릿 명세
- [docs/04](../../../../docs/04-parts-specification.md) — 파츠 명세
- [docs/11](../../../../docs/11-export-and-deployment.md) — 내보내기
- [ADR 0003](../../../../progress/adr/0003-rig-template-versioning.md) — 버전·디렉터리 규약
