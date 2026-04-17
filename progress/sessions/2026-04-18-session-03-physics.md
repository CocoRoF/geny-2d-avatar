# Session 03 — Halfbody v1 Physics + mao_pro Benchmark Mapping

- **Date**: 2026-04-18
- **Workstreams**: Rig & Parts, Data
- **Linked docs**: `docs/03 §6.2`, `docs/04 §11`
- **Linked ADRs**: `progress/adr/0002`, `progress/adr/0003`

---

## 1. 목표 (Goals)

- [x] `schema/v1/physics.schema.json` 신규 — Cubism `physics3.json` 구조를 snake_case 로 채택.
- [x] `rig-templates/base/halfbody/v1.0.0/physics/physics.json` 초판 (v1.0.0 은 3 설정 / 4 출력 — 기존 파라미터 정합).
- [x] `physics/mao_pro_mapping.md` — mao_pro 16 설정과 halfbody v1.x 의 12-설정 표준 프리셋 로드맵.
- [x] `scripts/validate-schemas.mjs` — 물리 로드 + 입출력 파라미터 교차 검증.

## 2. 사전 맥락 (Context)

- docs/03 §6.2: 물리 입력은 `head_angle_*`, `body_angle_*`, `body_breath`. 출력은 `*_sway`, `*_phys`. 프리셋 `light/normal/heavy` 3단. mao_pro 벤치마크 16 설정이 상한 기준선이며 **머리 8 + 옷 4 = 12** 가 `normal` 프리셋 표준.
- v1.0.0 `parameters.json` 에 현재 `physics_output: true` 는 4 개(hair front/side_l/side_r/back sway). 나머지 8(Fuwa 3 + mesh 1 + 옷 4)은 v1.1.0+ 에서 파라미터·디포머 확장 필요.
- mao_pro `physics3.json` 은 16 설정 × 43 입력 × 20 출력 × 33 정점, 30 fps, 중력 (0, -1). 각 설정은 Input/Output/Vertices/Normalization 4 블록.
- 템플릿 매니페스트는 이미 `physics_file: "physics/physics.json"` 으로 경로를 선언했고 `physics_preset: "normal"` 기본값. 파일만 누락.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 물리 스키마 | `schema/v1/physics.schema.json` | meta/physics_dictionary/physics_settings 구조 정의. Cubism v3 호환. | ✅ |
| 물리 파일 | `rig-templates/base/halfbody/v1.0.0/physics/physics.json` | 3 설정 / 4 출력. meta 카운트 일치. vertex ≥ 2 per setting. | ✅ |
| mao_pro 매핑 | `rig-templates/base/halfbody/v1.0.0/physics/mao_pro_mapping.md` | 16 설정을 v1.0.0 / v1.1.0 / v1.2.0 로 분기. 파라미터 추가 플랜 포함. | ✅ |
| 검증기 확장 | `scripts/validate-schemas.mjs` | 입력 = physics_input 허용 파라미터, 출력 = physics_output 허용 파라미터. 메타 카운트 교차검증. | ✅ |

## 4. 결정 (Decisions)

- **D1 (snake_case)**: 프로젝트 JSON 파일 전반의 컨벤션(parameters.json, deformers.json, template.manifest.json)과 일치하도록 physics 파일도 snake_case. Cubism export 시 exporter 가 PascalCase 변환.
- **D2 (v1.0.0 = 4 설정)**: 기존 파라미터가 4 개 sway 출력만 가지므로 v1.0.0 물리는 4 설정으로 **일관성** 유지. Fuwa/옷 물리는 파라미터 추가가 전제 — v1.1.0 minor bump 에서 일괄 처리.
- **D3 (입력 표준 4종)**: 각 sway 설정의 입력은 mao_pro 와 동일한 `head_angle_x/z + body_angle_x/z` 4 종 (Weight=60/60/40/40). `body_breath` 는 v1.0.0 에서 물리 입력 비사용 (idle.default 애니메이션 채널로만 충분).
- **D4 (정점 = 2)**: 각 설정 2 정점(고정 루트 + 자유 말단) — mao_pro PhysicsSetting1 의 최소 구조를 그대로 따름. 더 복잡한 다단 체인은 v1.1.0+ 에서 개별 튜닝.

## 5. 변경 요약 (Changes)

- `schema/v1/physics.schema.json` 신규.
- `rig-templates/base/halfbody/v1.0.0/physics/physics.json` 신규 (4 설정).
- `rig-templates/base/halfbody/v1.0.0/physics/mao_pro_mapping.md` 신규 (매핑·로드맵).
- `scripts/validate-schemas.mjs` — 물리 로드·스키마 검증·파라미터 교차 검증 추가.
- `rig-templates/base/halfbody/v1.0.0/parameters.json` — `body_breath` 에 `physics_input: true` 이미 세션 01 에서 설정. head_angle_x/z, body_angle_x/z 에 `physics_input: true` 추가 필요 여부 확인.

## 6. 블록 (Blockers / Open Questions)

- `presets/{light,normal,heavy}.json` 은 v1.0.0 에서 별도 파일로 분리할지 physics.json 내부 객체로 둘지 미결 — 일단 내부 `presets` 필드로 최소 스텁. 별도 파일 분리는 v1.1.0.
- 입력 Weight(60/40) 는 mao_pro 값을 그대로 차용. halfbody 비율(1:2.5) 에 맞춘 재튜닝은 골든 1 아바타 테스트 후 v1.0.1.

## 7. 다음 세션 제안 (Next)

- **세션 04**: `motions/` 기본 7 팩 스키마 + `idle.default`, `blink.auto`, `lipsync.mock` 초판. `test_poses/validation_set.json`.
- **세션 05**: avatar-metadata 실제 샘플 1건 + Pose3 mutex · HitArea 바인딩 검증. variant A/B 파츠.
- **세션 06**: Fuwa/옷 파라미터 추가 → halfbody v1.1.0 bump → 12-설정 물리.

## 8. 지표 (Metrics)

- **스키마**: 7종(avatar-metadata, common/ids, deformers, parameters, part-spec, physics, rig-template). physics 신규.
- **물리 설정**: 3개(앞머리·옆머리·뒷머리 sway). 총 입력 12(4×3), 출력 4(front 1 + side 2 + back 1), 정점 6(2×3).
- **파라미터 변경**: `head_angle_x/z`, `body_angle_x/z` 에 `physics_input: true` 추가 (4건). 물리 입력 5개 총 (+ `body_breath`).
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=31 failed=0` (세션 02 의 30 + 물리 1).
- **mao_pro 매핑**: 16 설정 중 v1.0.0 에 3 이식(1,2,3). 4(뒤 L-R)는 스킵, 9–12(모자)는 fx_pack 으로 분리, 나머지 8은 v1.1.0+ 로 스케줄링.
- **normal 프리셋 진행률**: 12 중 3 구현 → **25%** (v1.0.0). v1.1.0 에서 7 추가 예정(→ 10/12, 83%).

## 9. 인용 (Doc Anchors)

- [docs/03 §6.2 물리 파일 규약](../../docs/03-rig-template-spec.md#62-물리-파일-규약)
- [docs/03 §7 버전 관리](../../docs/03-rig-template-spec.md#7-템플릿-버전-관리-versioning)
