# fullbody v1 ↔ mao_pro Physics Mapping

`docs/03 §6.2` 의 **mao_pro 16-설정 벤치마크** 대비 fullbody v1.0.0 매핑. 상반신 12 는 `rig-templates/base/halfbody/v1.3.0/physics/mao_pro_mapping.md` 와 동일 (halfbody 계보 직접 승계).

## 1. halfbody v1.3.0 → fullbody v1.0.0 승계 (PhysicsSetting1~12)

| ID | 이름 | 변경 |
|---|---|---|
| PhysicsSetting1 `hair_front_sway_phys` | 앞머리 흔들림 | 동일 |
| PhysicsSetting2 `hair_side_sway_phys_l` | 왼옆머리 흔들림 | 동일 |
| PhysicsSetting3 `hair_side_sway_phys_r` | 오른옆머리 흔들림 | 동일 |
| PhysicsSetting4 `hair_back_sway_phys` | 뒷머리 흔들림 | 동일 |
| PhysicsSetting5 `hair_front_fuwa_phys` | 앞머리 볼륨 | 동일 |
| PhysicsSetting6 `hair_side_fuwa_phys_l` | 왼옆머리 볼륨 | 동일 |
| PhysicsSetting7 `hair_side_fuwa_phys_r` | 오른옆머리 볼륨 | 동일 |
| PhysicsSetting8 `hair_back_fuwa_phys` | 뒷머리 볼륨 | 동일 |
| PhysicsSetting9 `cloth_main_fuwa_phys` | 상의 부풀림 | 동일 |
| PhysicsSetting10 `ahoge_sway_phys` | 아호게 흔들림 | 동일 |
| PhysicsSetting11 `accessory_sway_phys` | 액세서리/망토 흔들림 | **+1 output `cloth_cape_sway`** (세션 57 D3 편승). accessory_back/front + cloth_cape 3 출력 동일 버텍스 파생. scale=1.3 으로 cape 가 약간 더 크게 흔들림. |
| PhysicsSetting12 `body_breath_phys` | 호흡 2차 오프셋 | 동일 |

---

## 2. fullbody v1.0.0 신규 5 (PhysicsSetting13~17)

| ID | 이름 | 입력 | 출력 | 목적 |
|---|---|---|---|---|
| PhysicsSetting13 `skirt_sway_phys` | 치마 흔들림 | body_angle_x (50) · body_angle_z (40) · leg_l_angle (25) · leg_r_angle (25, reflect) | `cloth_skirt_sway` | 걸음걸이/몸기울기 반응. L/R 다리 비대칭(leg_r reflect) 로 걸을 때만 sway. mobility 0.9 / radius 10 / delay 0.8. |
| PhysicsSetting14 `skirt_fuwa_phys` | 치마 부풀림 | body_breath (100) · body_angle_x (20) | `cloth_skirt_fuwa` | 호흡 주축 + 몸기울기 쏠림. cloth_main Fuwa 와 유사 파라미터화 (응답 지연 약간 더 — radius 6). |
| PhysicsSetting15 `leg_sway_phys_l` | 왼다리 2차 흔들림 | body_angle_x (40) · leg_l_angle (60) | `leg_sway_l` | 다리 말단 리얼리즘. radius 12 (긴 체인 = 관절 끝단). L/R 독립 시뮬. |
| PhysicsSetting16 `leg_sway_phys_r` | 오른다리 2차 흔들림 | body_angle_x (40, reflect) · leg_r_angle (60, reflect) | `leg_sway_r` | Setting15 좌우 대칭. 공유 시 대칭 걸음이 상쇄되므로 **반드시 분리**. |
| PhysicsSetting17 `hip_phys` | 골반 2차 오프셋 | body_angle_x (60) · body_angle_z (40) | `hip_phys` | body_breath_phys(Setting12)의 하반신 축. 상/하체 연결 유연화. weight 70 · delay 0.8 (은은함). |

mao_pro 와의 관계: **신규 5 전부 mao_pro 16 벤치마크에 직접 대응 없음** — fullbody 가 상반신/하반신 분리 리깅을 위해 추가한 독자 secondary. docs/03 §6.2 의 base 규약은 상반신 8 + 옷 4 = 12 고정이므로 fullbody 의 하반신 5 는 **base 12 를 넘는 family-specific extension**.

---

## 3. `normal` 프리셋 17 설정 기본 on

halfbody 와 같은 `damping_multiplier=1.0` 기준 17 전부 `enabled_by_default=true`. Cubism Editor import 시 저자가 저사양 프리셋(`light`) 구분 필요하면:

- `light`: body_breath_phys(12) + hip_phys(17) + skirt_fuwa(14) off 가 자연스러움 (미세 2차 오프셋이 저사양에서 가시 대비 비용 큼).
- `heavy`: 전부 on + damping_multiplier 1.4 (fabric 감속 강화).

v1.1.0 bump 시 프리셋별 on/off 표를 명시 규격화.

---

## 4. deformer 바인딩 요약

| PhysicsSetting output | deformer warp (params_in) | deformer 트리 위치 |
|---|---|---|
| cloth_skirt_sway · cloth_skirt_fuwa | `skirt_warp` | hip_warp 자식 (골반 이동 상속) |
| leg_sway_l | `leg_l_warp` | hip_warp 자식 |
| leg_sway_r | `leg_r_warp` | hip_warp 자식 |
| hip_phys | `hip_warp` | body_visual 자식 |
| cloth_cape_sway | `cape_warp` | body_visual 직속 (hip_warp 외부 — 상반신 sway 전용) |

---

## 5. 저자 개입 유도 (ADR 0005 L3)

`rig-template-lint --family fullbody` (세션 110 이전 이름 physics-lint) 가 기계 체크 C1~C13 을 통과하나, **다음 값은 실 렌더 검증 후 튜닝 필요**:

- Setting13 `leg_l_angle` / `leg_r_angle` weight 25 는 걸음걸이 sway 강도 영향 — 실제 motion 팩(`idle.default@1.2.0`) 돌린 후 약함/강함 판단.
- Setting11 `cloth_cape_sway.scale` 1.3 은 accessory 기준 상대값. cape 가 너무 출렁이면 1.0 으로 축소, 그래도 약하면 별도 Setting18 로 분리.
- Setting17 `hip_phys.scale` 0.7 / `delay` 0.8 은 body_breath_phys(12) 대비 약하게 시작 — 상/하체 연결 어색함 보이면 scale 1.0 · delay 0.6 로 승격.

실 튜닝은 세션 58 이후 motion 팩과 함께 판단. 이 세션은 "전 파이프라인 lint 통과 + 번들 생성 가능 상태" 까지.
