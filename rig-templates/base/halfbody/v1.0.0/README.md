# Half Body Standard — v1.0.0 (`tpl.base.v1.halfbody`)

> VTuber·버튜버 방송에 적합한 상반신 표준 템플릿. 정면 중심, 넓은 얼굴 가동 범위, 손 제스처 일부, 립싱크 5 모음 전체. 장르 중립적인 인상을 기본으로 하고 스타일 프로파일로 개성을 부여한다.

이 디렉터리는 `halfbody` 베이스 리그의 첫 공식 릴리스 후보다. 모든 AI 생성 아바타·모션 팩·물리 프리셋·검수 포즈셋은 이 템플릿을 **한 번의 커밋 단위**로 참조한다.

---

## 1. 의도한 인상 (Intended Vibe)

장르 중립, 정면 중심, 한 평 방송 셋업을 가정. 고개 가동 범위 ±30°, 상반신 ±10°, 립싱크 모음 5종을 모두 구분 가능한 입 형태. 표정 확장성은 `exp3` Blend 3모드와 `ParamEyeLForm/RForm/ParamMouthUp/Down` 으로 확보한다.

상세 근거는 [../../../../docs/03-rig-template-spec.md](../../../../docs/03-rig-template-spec.md) §2.1, §12.1.

---

## 2. 구성 요소 (Composition)

| 파일 | 역할 | 스키마 |
|---|---|---|
| `template.manifest.json` | 메타·Cubism 매핑·HitArea·호환성 | `schema/v1/rig-template.schema.json` |
| `parameters.json` | 37 파라미터 (core 24 + extension 13), 7 그룹, CombinedAxes 2쌍 | `schema/v1/parameters.schema.json` |
| `parts/*.spec.json` | 파츠 슬롯 계약서 — v1.0.0 기준 **샘플 3종** (`face_base`, `hair_front`, `eye_iris_l`) | `schema/v1/part-spec.schema.json` |
| `deformers.json` | (pending) 디포머 트리 docs/03 §4.1 반영 | — |
| `physics/physics.json` | (pending) 물리 프리셋 `normal` 12 Setting | `physics.v1` 외부 포맷 |
| `motions/` | (pending) `idle.default`, `blink.auto` 등 7 팩 | — |
| `test_poses/validation_set.json` | (pending) 검수 렌더 입력 | — |

> **범위 주의**: v1.0.0 은 *제품화 가능한 최소 계약 세트* 를 검증하는 릴리스 후보다. 전체 24 파츠 스펙 / 물리 / 모션 구현은 세션 02 이후의 작업이다. `progress/sessions/` 의 세션 로그를 참조.

---

## 3. 파라미터 요약 (37개)

| 그룹 | 파라미터 | 채널 |
|---|---|---|
| face | `head_angle_x/y/z` (deg) | core |
| body | `body_angle_x/y/z` (deg), `body_breath` | core / core+physics_input |
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

## 7. 다음 단계 (Not Yet in v1.0.0)

세션 로그(`progress/sessions/`)에 따라 순차 구현:

1. 나머지 21 파츠 스펙 (`parts/*.spec.json`)
2. `deformers.json` — docs/03 §4.1 계층 구조
3. `physics/physics.json` — mao_pro 벤치마크 기준 `normal` 프리셋 12 Setting
4. `motions/` — 기본 7 팩
5. `test_poses/validation_set.json` — 검수 렌더 입력

모두 v1.1.0 이전 마이너 릴리스에서 점진 추가된다(ADR 0003).

---

## 8. 참고 문서

- [docs/03](../../../../docs/03-rig-template-spec.md) — 리그 템플릿 명세
- [docs/04](../../../../docs/04-parts-specification.md) — 파츠 명세
- [docs/11](../../../../docs/11-export-and-deployment.md) — 내보내기
- [ADR 0003](../../../../progress/adr/0003-rig-template-versioning.md) — 버전·디렉터리 규약
