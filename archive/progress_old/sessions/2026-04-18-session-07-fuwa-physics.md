# Session 07 — halfbody v1.2.0 bump: Fuwa/cloth volumes + physics 3→9 + overall wiring

- **Date**: 2026-04-18
- **Workstreams**: Rig & Parts
- **Linked docs**: `docs/03 §4.2`, `docs/03 §6.2`, `docs/03 §12.1` (#1 Fuwa, #6 overall), `docs/04` (cloth_main)
- **Linked ADRs**: `progress/adr/0003`, `progress/adr/0004`

---

## 1. 목표 (Goals)

- [x] `rig-templates/base/halfbody/v1.2.0/` 신규 — v1.1.0 의 전체 자산을 mirror 후 수정.
- [x] Fuwa/볼륨 파라미터 5 추가: `hair_front_fuwa`, `hair_side_fuwa_l`, `hair_side_fuwa_r`, `hair_back_fuwa`, `cloth_main_fuwa`. (channel=extension, physics_output=true, range=[0,1])
- [x] `overall_warp` 디포머 신규 — `root` 와 `breath_warp` 사이 삽입, `overall_x/y/rotate` 를 실제 params_in 으로 연결. `hair_back_warp` 은 `overall_warp` 직속으로 이동(docs/03 §4.2 의 "머리/상반신 pose 와 무관" 유지하면서 전체 평행이동만 따라가도록).
- [x] `cloth_warp` 디포머 신규 — `body_visual` 하위. `cloth_main_fuwa` 를 params_in 으로 받고 `cloth_main` 의 `deformation_parent` 를 여기로 재지정.
- [x] 헤어 warp 4종(`hair_front_warp`, `hair_side_warp_l`, `hair_side_warp_r`, `hair_back_warp`) 의 params_in 에 해당 `*_fuwa` 추가.
- [x] `physics/physics.json` 3 → 9 settings 확장. 구조: 4 sway(hair_front, hair_side_l, hair_side_r, hair_back) + 5 fuwa(동일 5종). side_sway 는 기존 단일 setting → L/R 분리(각 1 출력) 로 L/R 비대칭 시뮬 확장성 확보.
- [x] `validate-schemas.mjs` 물리 출력 접미사 정규식 확장: `_(sway|phys)(_[lr])?$` → `_(sway|phys|fuwa)(_[lr])?$`. docs/03 §6.2 업데이트 주석 갱신.
- [x] `template.manifest.json` — `version=1.2.0`, `cubism_mapping` 에 Fuwa 5종 추가.
- [x] `README.md` — v1.2.0 헤더 + Diff from v1.1.0 섹션.
- [x] 검증: `node scripts/validate-schemas.mjs` → `failed=0`.

## 2. 사전 맥락 (Context)

- v1.1.0 README "Not Yet" 섹션 약속: Fuwa 볼륨 + overall 연결 + 12-setting 확장을 세션 07 로 예고 (arm A/B variant 세션 직후).
- docs/03 §12.1 #1 (Fuwa): "mao_pro 는 머리·옷 각 부분에 볼륨 파라미터를 둬 호흡/체형에 따라 부풀어 오르는 효과. `*_fuwa` 접미사 규약. 주 입력은 `body_breath`." → 세션 07 가 이 규약을 처음 구현.
- docs/03 §4.2: "뒷머리는 머리 pose warp 의 자식이 아니다. 별도 물리로 회전 지연 효과." → `hair_back_warp` 은 body_pose_warp/head_pose_rot 외부에 둬야 함. v1.0.0–1.1.0 에서는 `root` 직속. 세션 07 에서 `overall_warp` 를 root 와 나머지 사이에 삽입하므로, 뒷머리도 이에 맞춰 `overall_warp` 직속으로 재배치 (평행이동은 따라가되 상반신 회전과 독립 유지).
- ADR 0003 (SemVer): v1.1.0 은 불변. v1.2.0 는 병렬 minor. 이번 변화는 파라미터 추가 + 디포머 확장으로 **기존 v1.1.0 에 대해 additive** — avatar 측에서는 v1.1.0 호환성이 유지되지만, template 디렉터리는 불변 규약으로 분리.
- ADR 0004: pose3, 파라미터 range 등은 템플릿이 소유. avatar 는 값만 전달. 세션 07 은 avatar 파일을 건드리지 않는다 (sample-01-aria 는 여전히 v1.0.0 을 참조).
- 세션 06 의 `arm_pose_variant` + arm A/B 구조는 v1.2.0 에 그대로 유지(pose.json 포함).

### 범위 경계

다음은 의도적으로 **세션 08+ 로 미룸**:
- `packages/exporter-core` 초판 — 템플릿 → Cubism deterministic 변환 (세션 08).
- 아바타 마이그레이션 스크립트(`scripts/rig-template/migrate.mjs`) — v1.0.0 → v1.2.0 일괄 업그레이드 (세션 09). 현 `samples/avatars/sample-01-aria` 는 v1.0.0 참조 유지.
- mao_pro 12 Setting 완성 — 세션 07 는 9 까지. 남은 3(ahoge, accessory_sway, body_breath_phys) 는 해당 파츠/파라미터 도입 시점(미정) 에 추가. 이유는 §4 D5 참조.
- Fuwa 모션 팩 시연 — `idle.default` 에 `cloth_main_fuwa` 연동은 모션 재생성 문맥이 필요하므로 세션 08 exporter 후속.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| v1.2.0 디렉터리 | `rig-templates/base/halfbody/v1.2.0/` | v1.1.0 전체 복사 + 본 세션 수정. validator 통과. | ✅ |
| Fuwa 파라미터 5 | `v1.2.0/parameters.json` | `hair_front_fuwa`, `hair_side_fuwa_l/r`, `hair_back_fuwa`, `cloth_main_fuwa`. physics_output=true, [0,1], default 0. | ✅ |
| 매니페스트 갱신 | `v1.2.0/template.manifest.json` | `version=1.2.0`, `cubism_mapping` 에 Fuwa 5종 (`ParamHairFrontFuwa` 등) 추가. | ✅ |
| 디포머 확장 | `v1.2.0/deformers.json` | `overall_warp` · `cloth_warp` 신규, `hair_back_warp` parent=overall_warp, hair/cloth warps 의 params_in 에 fuwa 추가. 총 18 노드. | ✅ |
| cloth_main 재지정 | `v1.2.0/parts/cloth_main.spec.json` | `deformation_parent: cloth_warp`. | ✅ |
| Physics 9 Settings | `v1.2.0/physics/physics.json` | sway 4 (hair_front, side_l, side_r, back) + fuwa 5 (동일 5종). 입력 24 / 출력 9 / 버텍스 18. | ✅ |
| validator 정규식 확장 | `scripts/validate-schemas.mjs` | `/_(sway\|phys\|fuwa)(_[lr])?$/` + 주석 갱신. | ✅ |
| README 갱신 | `v1.2.0/README.md` | 헤더 v1.2.0, Diff from v1.1.0 섹션, 파라미터/디포머/물리 요약 갱신. | ✅ |

## 4. 결정 (Decisions)

- **D1 (Fuwa 접미사 `*_fuwa` 정규 도입)**: docs/03 §12.1 #1 의 규약대로 `_fuwa` 를 `_sway`·`_phys` 와 동급의 물리 출력 접미사로 승격. 의미: "호흡/체형에 의한 볼륨 팽창". `_sway` 가 회전성 흔들림이라면 `_fuwa` 는 축 변형이 없는 스칼라 부풀림. validator 정규식을 `_(sway|phys|fuwa)(_[lr])?$` 로 갱신.
- **D2 (hair_side sway 를 단일 → 좌우 분리 setting 으로)**: v1.0.0/1.1.0 은 PhysicsSetting2 하나에 2 출력(L+R) 을 물려 단일 시뮬레이션을 공유했다. 세션 07 부터는 L/R 각각 독립 setting 으로 분리 — 이유 ①: Fuwa 가 L/R 비대칭(머리 회전 방향에 따라 한쪽만 부풀어 오르는 표현) 을 허용하려면 sway 측도 같은 분리 기준이 깔려야 함. 이유 ②: mao_pro 원본도 2 side 를 별도 PhysicsSetting 으로 두는 것이 표준에 가깝다. 이유 ③: damping/acceleration 을 좌우 다르게 튜닝 가능. 비용: input 중복 4+4=8 (단일 때는 4). 그래도 런타임 비용은 무시 가능.
- **D3 (hair_side_sway_r 의 reflect=true 로 대칭)**: L 은 기본 방향, R 은 모든 input 의 `reflect=true` 로 거울 반사. 동일 vertices/mobility 를 쓰면서 축만 반대로. 별도 vertices 튜닝 없이 좌우 대칭 보장.
- **D4 (overall_warp 를 root 와 breath_warp 사이에 삽입)**: 기존 root 주석은 "overall_x/y/rotate 는 런타임에서 루트 변환으로 주입" 이라고 적었으나, Cubism 내보내기 시 deformer 체인에 매핑되지 않으면 `.cdi3.json` 의 파라미터 연결이 누락된다. 세션 08 exporter 가 deformer 기반으로 구축되므로, 지금 실제 노드로 고정해 두는 편이 단순하다. `overall_warp` 는 root 의 유일한 자식이며 body/head/hair_back 모든 서브트리를 감싼다. 근거: docs/03 §12.1 #6 "overall_* 는 파이널 스크린 변환에 가깝다 — 모델 전체 트리에 적용".
- **D5 (hair_back_warp parent 를 root → overall_warp 로)**: docs/03 §4.2 의 "hair_back 은 head_pose_rot 외부" 원칙은 유지. 단 overall_* 의 평행이동·회전은 모든 가시 파츠에 적용되어야 하므로 hair_back 도 overall_warp 의 자식으로 이동. 결과: hair_back 의 회전 지연 특성(head/body 회전과 무관)은 보존되며 overall_* 는 함께 적용.
- **D6 (cloth_warp 를 body_visual 하위에 추가)**: `cloth_main_fuwa` 전용 warp. 이전에는 cloth_main 이 body_visual 직속이라 fuwa 가 어느 노드에도 들어갈 자리가 없었다. cloth_warp 를 사이에 삽입해 `cloth_main_fuwa` 를 params_in 으로 받고, cloth_main 의 `deformation_parent` 를 `cloth_warp` 로 재지정. 추후 의상 레이어 확장 시(`cloth_outer`, `cloth_inner`) 동일 warp 아래로 자연스럽게 묶을 수 있다.
- **D7 (9 Settings 로 중단, 12 까지는 연기)**: mao_pro 는 12 settings. 우리가 구현하지 못한 3종은 (ahoge=머리 정수리 삐침 머리털, accessory_sway=모자/헤드폰 리본 흔들림, body_breath_phys=흉부 호흡 2차 물리). 전부 해당 파츠가 아직 템플릿에 없다 — 선제 setting 만 추가하면 output 참조 실패. 세션 07 는 파츠가 존재하는 Fuwa 만 다룬다. 나머지는 부위별 파츠 팩(`fx_pack.hair.ahoge.v1`, `fx_pack.accessory.sway.v1`, `fx_pack.body.breath_phys.v1`) 이 도입될 때 동반 추가.
- **D8 (Fuwa input 설계 — body_breath 주축 + 방향 수정자)**: 
  - `hair_front_fuwa` / `hair_back_fuwa`: `body_breath` 단일 입력. 호흡에만 반응.
  - `hair_side_fuwa_l/r`: `body_breath` + `head_angle_x` (R 은 reflect). 머리를 오른쪽으로 돌리면 왼쪽 옆머리가 더 부풀어 오름(머리 뒤쪽 볼륨 증가).
  - `cloth_main_fuwa`: `body_breath` + `body_angle_x`. 상반신이 기울 때 한쪽 의상이 밀림.
  총 fuwa 입력 수: 1+2+2+1+2 = 8. 전체 (sway 16 + fuwa 8) = 24 inputs.
- **D9 (Fuwa 파라미터 group 배치)**: 헤어 4종은 기존 `hair` 그룹, `cloth_main_fuwa` 는 새 그룹 없이 `body` 그룹 배치 (cloth_main 이 body 가시 영역에 속함). 그룹 목록은 변경 없음.
- **D10 (Fuwa vertex delay 를 schema 상한 1.0 에 맞춤)**: 초안은 호흡 느린 응답을 표현하려고 delay 1.5–2.2 을 썼으나 `schema/v1/physics.schema.json` 의 `delay.maximum=1` 에 걸림. Cubism 의미로도 delay ∈ [0,1] 규약이므로 스키마 유지가 옳다. 느린 응답은 delay 를 0.5–0.7 로 낮추고 `mobility`·`acceleration` 을 함께 낮춰 "느린·작은" 응답으로 표현. 결과적으로 sway(delay 0.7–1.0) 대비 fuwa(0.5–0.7) 가 약 30% 더 지연된다.

## 5. 변경 요약 (Changes)

- `rig-templates/base/halfbody/v1.2.0/` 신규 (전체).
- 파라미터 총수: 40 → 45 (+5 Fuwa).
- 파츠 수: 29 (변경 없음). `cloth_main.spec.json` 의 `deformation_parent` 만 갱신.
- 디포머 노드: 16 → 18 (+`overall_warp`, +`cloth_warp`). `hair_back_warp.parent` = root → overall_warp. hair_front/side_l/side_r/back warp 의 `params_in` 에 각 fuwa 추가.
- 물리: PhysicsSetting 3 → 9. Meta: `physics_setting_count=9`, `total_input_count=24`, `total_output_count=9`, `vertex_count=18`.
- pose.json: v1.1.0 와 동일 (arm A/B mutex 2 그룹).
- 모션 7 팩: 변경 없음 (`greet.wave` 는 v1.1.0 의 `arm_r_angle` 그대로 — Fuwa 연출은 세션 08 이후).
- `scripts/validate-schemas.mjs`: regex 확장 + 관련 주석 갱신.
- `progress/INDEX.md`: 세션 07 row 추가, workstream 상태 갱신, next-sessions 재배치.

## 6. 블록 (Blockers / Open Questions)

- avatar 측 마이그레이션 도구 부재. `samples/avatars/sample-01-aria` 는 여전히 v1.0.0 을 참조 — 세션 09 의 `migrate.mjs` 까지는 수동 bump 필요.
- 12 Settings 완성 = 파츠 확장 선행. 로드맵 재평가 필요 (ahoge/accessory_sway/body_breath_phys 파츠 우선순위).
- Fuwa 출력의 UX 시각화가 에디터 부재로 불가능 — 실측은 exporter(세션 08) 이후 웹 프리뷰에서.
- `reflect=true` 대칭 전제가 mao_pro 실기와 정확히 일치하는지는 moc3 패리티 테스트(세션 08 exporter 회귀) 에서 확증.

## 7. 다음 세션 제안 (Next)

- **세션 08**: `packages/exporter-core` 초판 — template + avatar → Cubism 번들(`.moc3/.physics3.json/.motion3.json/.pose3.json/.cdi3.json`) deterministic 변환. v1.2.0 이 첫 실사용 케이스.
- **세션 09**: `scripts/rig-template/migrate.mjs` — v1.0.0 → v1.2.0 아바타 자동 업그레이드 스크립트. `samples/avatars/sample-01-aria` 재작성. 골든 회귀셋 편성.
- **세션 10**: 골든셋 회귀 CI — `pnpm test:golden` 으로 exporter 결정론 + schema 검증 동시 실행. Foundation Exit 체크리스트 2번 항목 달성.

## 8. 지표 (Metrics)

- **템플릿 버전**: halfbody v1.0.0, v1.1.0, v1.2.0 (병렬 3 버전).
- **파라미터**: v1.2.0 = 45 (v1.1.0 의 40 + 5 Fuwa).
- **파츠**: v1.2.0 = 29 (변경 없음).
- **디포머 노드**: v1.2.0 = 18 (v1.1.0 의 16 + `overall_warp` + `cloth_warp`).
- **물리 Settings**: v1.2.0 = 9 (sway 4 + fuwa 5). 입력 24 · 출력 9 · 버텍스 18.
- **pose.json**: v1.1.0 과 동일 (2 mutex 그룹, arm L/R A·B).
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=124 failed=0` (v1.0.0 39 + v1.1.0 42 + v1.2.0 42 + 아바타 샘플 1). Fuwa vertex delay 는 schema constraint `[0, 1]` 에 맞춰 0.5–0.7 범위로 튜닝 (첫 초안은 1.5–2.2 → 스키마 실패 → D10 참조).

## 9. 인용 (Doc Anchors)

- [docs/03 §4.2 뒷머리 분리](../../docs/03-rig-template-spec.md#42-디포머-계층)
- [docs/03 §6.2 물리 입출력 규약](../../docs/03-rig-template-spec.md#62-물리-파라미터-규약)
- [docs/03 §12.1 #1 Fuwa 규약](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [docs/03 §12.1 #6 overall 변환](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [ADR 0003 full-SemVer 디렉터리](../adr/0003-rig-template-versioning.md)
- [ADR 0004 참조형 아바타](../adr/0004-avatar-as-data.md)
