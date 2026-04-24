# halfbody v1 ↔ mao_pro Physics Mapping

`docs/03 §6.2` 의 **mao_pro 16-설정 벤치마크** 를 halfbody v1 템플릿 계열에 어떻게 매핑하는지 기록한다.
`normal` 프리셋 표준은 **머리 8 + 옷 4 = 12** 개 on 이지만, v1.0.0 은 파라미터 스펙 상 4 출력만 가진다. 나머지는 minor bump 로 순차 도입.

---

## 1. mao_pro 설정 전체 목록

| ID | 이름 (mao_pro) | 범주 | mao_pro 출력 파라미터 |
|---|---|---|---|
| PhysicsSetting1 | 머리 흔들림 앞 | Hair Sway | ParamHairFront |
| PhysicsSetting2 | 머리 흔들림 가로 | Hair Sway | ParamHairSideL, ParamHairSideR |
| PhysicsSetting3 | 머리 흔들림 뒤 | Hair Sway | ParamHairBack |
| PhysicsSetting4 | 머리 흔들림 뒤 왼쪽오른쪽 | Hair Sway | ParamHairBackL, ParamHairBackR |
| PhysicsSetting5 | 메쉬 흔들림 | Hair Mesh | ParamHairMesh |
| PhysicsSetting6 | 앞머리 볼륨 | Hair Fuwa | ParamHairFrontFuwa |
| PhysicsSetting7 | 옆머리 볼륨 | Hair Fuwa | ParamHairSideFuwa |
| PhysicsSetting8 | 뒷머리 볼륨 | Hair Fuwa | ParamHairBackFuwa |
| PhysicsSetting9 | 모자창 흔들림 | Accessory | (모자 전용) |
| PhysicsSetting10 | 모자 리본 흔들림 | Accessory | (모자 전용) |
| PhysicsSetting11 | 깃털 흔들림 | Accessory | (모자 전용) |
| PhysicsSetting12 | 모자 위 흔들림 | Accessory | (모자 전용) |
| PhysicsSetting13 | 파카끈 흔들림 | Neckwear | ParamParkaDrawstring |
| PhysicsSetting14 | 목 장식 흔들림 | Neckwear | ParamNeckOrnament |
| PhysicsSetting15 | 로브 흔들림 | Outer | ParamRobeSway |
| PhysicsSetting16 | 로브 흔들림 Y | Outer | ParamRobeSwayY |

---

## 2. halfbody v1.x 매핑 계획

| mao_pro ID | 범주 | halfbody 도입 버전 | halfbody 출력 파라미터 | 비고 |
|---|---|---|---|---|
| PhysicsSetting1 | Hair Sway 앞 | **v1.0.0** ✅ | `hair_front_sway` | 활성 |
| PhysicsSetting2 | Hair Sway 옆 L/R | **v1.0.0** ✅ | `hair_side_sway_l`, `hair_side_sway_r` | 활성, 단일 시뮬 + 2 출력 |
| PhysicsSetting3 | Hair Sway 뒤 | **v1.0.0** ✅ | `hair_back_sway` | 활성. deformer 는 root 직속(지연 회전) |
| PhysicsSetting4 | Hair Sway 뒤 L-R | 스킵 | — | mao_pro 고유. hair_back L-R 분리 파라미터는 계획 없음 |
| PhysicsSetting5 | Hair Mesh | v1.2.0 | `hair_mesh_sway` (신규) | 고급 메쉬 흔들림. 저사양 디바이스 고려해 후순위 |
| PhysicsSetting6 | Hair Fuwa 앞 | v1.1.0 | `hair_front_fuwa` (신규) | 볼륨 변동 |
| PhysicsSetting7 | Hair Fuwa 옆 | v1.1.0 | `hair_side_fuwa` (신규) | 좌우 공용 |
| PhysicsSetting8 | Hair Fuwa 뒤 | v1.1.0 | `hair_back_fuwa` (신규) | |
| PhysicsSetting9-12 | Hat Accessory | **별도 팩 (fx_pack.hat.v1)** | — | halfbody 기본 템플릿에 포함하지 않음. 모자 부착 시 별도 물리 팩 머지 (docs/04 §2.3) |
| PhysicsSetting13 | Parka Drawstring | v1.1.0 | `cloth_drawstring_sway` (신규) | 옷 장식 |
| PhysicsSetting14 | Neck Ornament | v1.1.0 | `accessory_neck_sway` (신규) | 목걸이·초커 |
| PhysicsSetting15 | Robe Sway | v1.1.0 | `cloth_main_sway_x` (신규) | 옷 주 흔들림 X |
| PhysicsSetting16 | Robe Sway Y | v1.1.0 | `cloth_main_sway_y` (신규) | 옷 주 흔들림 Y |

---

## 3. `normal` 프리셋 12 설정 도달 플랜

docs/03 §6.2 의 **머리 8 + 옷 4 = 12** 표준을 만족하려면:

- **머리 8**: v1.0.0 의 sway 3(1,2,3) + v1.1.0 의 Fuwa 3(6,7,8) + v1.2.0 의 mesh 1(5) + sway 1 추가 = 8
  - sway 1 추가는 `hair_front_sway_y`(앞머리 상하) 같은 축 분리로 채움. v1.2.0 에서 결정.
- **옷 4**: v1.1.0 의 PhysicsSetting13·14·15·16 모두 도입 = 4

**도달 지점**: `halfbody v1.2.0` 또는 v1.1.0 ~ v1.2.0 사이에서 12 설정 + normal 프리셋 기본 on 구성을 완성.

---

## 4. 파라미터 추가 체크리스트 (v1.1.0)

v1.1.0 minor bump 시 `parameters.json` 에 추가해야 할 `physics_output: true` 파라미터:

- [ ] `hair_front_fuwa` (앞머리 볼륨)
- [ ] `hair_side_fuwa` (옆머리 볼륨, 좌우 공용)
- [ ] `hair_back_fuwa` (뒷머리 볼륨)
- [ ] `cloth_drawstring_sway` (파카끈)
- [ ] `accessory_neck_sway` (목 장식)
- [ ] `cloth_main_sway_x` (로브 X)
- [ ] `cloth_main_sway_y` (로브 Y)

각 파라미터는 `cubism_mapping` 에도 `ParamHairFrontFuwa` 등 Cubism 표준 이름으로 매핑.
deformer 측에서는 `cloth_main_warp`, `hair_*_warp` 등 기존/신규 warp 노드의 `params_in` 에 등록.

---

## 5. 참고 파일

- `mao_pro_ko/runtime/mao_pro.physics3.json` — 벤치마크 원본 (repo 에 포함, 참고용).
- `rig-templates/base/halfbody/v1.0.0/physics/physics.json` — v1.0.0 실제 물리 팩 (3 설정 / 4 출력).
- `docs/03 §6.2` — 물리 파일 규약.
