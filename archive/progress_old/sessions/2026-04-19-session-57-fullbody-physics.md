# Session 57 — fullbody v1.0.0 실 저작 3단계 (physics.json 17 PhysicsSetting + mao_pro_mapping)

- **날짜**: 2026-04-19
- **범위**: 세션 52 저작 계획 §7 의 X+2 단계 (5단계 중 3). **ADR 0005 L2 게이트 활성화 = 물리 저작 완결 신호**.
- **산출물**: `rig-templates/base/fullbody/v1.0.0/physics/{physics.json, mao_pro_mapping.md}` + INDEX 갱신.
- **상태**: 완료
- **선행**: 세션 55 (manifest/parameters), 세션 56 (parts/deformers)
- **후행**: 세션 58 (motions), 59 (E2E 번들)

---

## 1. 배경

세션 55 의 parameters 에서 하반신 10 파라미터가 선언되고, 세션 56 의 deformer 트리(29 노드)에 하반신 subtree 가 세워졌다. 이번 세션 57 은 그 파라미터를 **2차 흔들림으로 구동**하는 물리 팩을 저작한다.

핵심 목표: `physics-lint --family fullbody` 를 통과시키는 것 = ADR 0005 L2 게이트 활성화 = 물리 저작이 기계 검증된 상태.

플래너(세션 52 §5)는 17 settings 목표를 잡았으나 실 저작에서 저자가 결정해야 할 지점이 하나 남아있었다: **`cloth_cape_sway` 출력을 어디에 연결할 것인가**.

---

## 2. 설계 결정

### D1. halfbody v1.3.0 physics.json 을 복사 베이스로 사용

- `cp rig-templates/base/halfbody/v1.3.0/physics/physics.json rig-templates/base/fullbody/v1.0.0/physics/physics.json`.
- 상반신 12 settings 의 모든 파라미터 튜닝(mobility/delay/acceleration/radius/scale/weight) 을 그대로 상속 — halfbody v1.0.0→v1.3.0 3 리마스터 동안 자리잡은 값이라 건드릴 이유 없음.
- 수정 범위는 (a) top-level notes (b) meta 카운트 (c) physics_dictionary +5 (d) Setting11 output +1 (e) physics_settings 말미 +5.

### D2. 5 신규 setting 디자인 — 하반신 특성 반영

| ID | 이름 | 입력 | 출력 | mobility/delay/radius | 근거 |
|---|---|---|---|---|---|
| 13 `skirt_sway_phys` | 치마 흔들림 | body_angle_x(50) · z(40) · leg_l_angle(25) · leg_r_angle(25,reflect) | cloth_skirt_sway | 0.9/0.8/10 | 걸음걸이 = L/R 비대칭. reflect 로 `leg_l - leg_r` 효과 생성 → 다리가 대칭으로 움직일 때 sway 소거, 비대칭일 때 강조. radius 10 중간 체인 (짧으면 튕김, 길면 밀림). |
| 14 `skirt_fuwa_phys` | 치마 부풀림 | body_breath(100) · body_angle_x(20) | cloth_skirt_fuwa | 0.5/0.6/6 | cloth_main Fuwa(Setting9) 와 형식 동일하되 chain 약간 짧게(9=8, 14=6) — 치마는 허리에서 떨어져 있어 응답 지연이 좀 덜. |
| 15 `leg_sway_phys_l` | 왼다리 2차 흔들림 | body_angle_x(40) · leg_l_angle(60) | leg_sway_l | 0.85/0.75/12 | radius 12 긴 체인 = 관절 말단 효과. leg_l_angle 이 주입력이라 weight 60. |
| 16 `leg_sway_phys_r` | 오른다리 2차 흔들림 | body_angle_x(40,reflect) · leg_r_angle(60,reflect) | leg_sway_r | 0.85/0.75/12 | Setting15 좌우 대칭. **독립 시뮬** — 공유 시 좌우 대칭 걸음이 상쇄됨. |
| 17 `hip_phys` | 골반 2차 오프셋 | body_angle_x(60) · body_angle_z(40) | hip_phys | 0.7/0.8/8 | body_breath_phys(12)의 하반신 축. delay 0.8 · weight 70 으로 **은은하게** — 과하면 하체가 따로 놀아 보임. scale 0.7 축소. |

- **D2 근거**: 실 뼈대 물리학이 아닌 **저자 감각의 근사**. halfbody 선례(Setting 1-12) 의 파라미터 범위(mobility 0.5-1.0, delay 0.6-1.0, radius 4-12) 내에서 "치마는 응답 빠르게(mobility ↑)", "다리는 길게 흔들리게(radius ↑)", "hip 은 은은하게(weight ↓)" 의 직관을 코드화. 실 렌더 후 L3 저자 개입으로 재조정.

### D3. `cloth_cape_sway` 는 Setting11 accessory_sway_phys 에 편승 (별도 setting 미생성)

- 세션 55 README §2.3 에서 "세션 57 에서 accessory_sway_phys 공유 or 별도 setting 결정" 으로 남겨둔 지점.
- **결정**: **공유**. Setting11 output 에 3rd 엔트리 `cloth_cape_sway` 추가 (scale 1.3, weight 75, type Angle).
- **근거**:
  - `cape_warp` 과 `accessories_layer` 둘 다 deformer 트리에서 body_visual/head_pose_rot 언저리 — 같은 physics input(body_angle_x/z) 을 공유하는 게 자연스러움.
  - 별도 Setting18 을 만들면 17 설정 상한을 넘음 → mao_pro 벤치마크 대비 복잡도 증가 ⇒ 첫 저작 버전에선 회피.
  - scale 1.3 으로 cape 가 accessory 보다 약간 더 크게 흔들려 **망토 특성**(긴 fabric) 을 시각적으로 근사. 물리 simulation 파라미터(radius/mobility) 는 못 분리하는 한계 있음 — L3 저자 튜닝에서 cape 가 너무 뻣뻣하면 Setting18 분리로 승격 예정(README §2 메모).
- **기각 대안 (별도 Setting18)**: 지금 저작하기엔 scale/weight 외에 radius/mobility/delay 까지 저자가 즉시 판단할 수 있는 근거가 부족. accessory 와 같이 간다고 가정한 뒤 **실 motion 팩으로 검증**하는 게 순서 (ADR 0005 L3 의 정신).

### D4. meta 카운트 재계산

| 필드 | halfbody v1.3.0 | 신규 | fullbody v1.0.0 |
|---|---|---|---|
| `physics_setting_count` | 12 | +5 | **17** |
| `total_input_count` | 31 | +4 (Setting13) +2 (14) +2 (15) +2 (16) +2 (17) = +12 | **43** |
| `total_output_count` | 13 | +1 (Setting11 cape) +1 (13) +1 (14) +1 (15) +1 (16) +1 (17) = +6 | **19** |
| `vertex_count` | 24 (12×2) | +10 (5×2) | **34** |

- **D4 근거**: physics-lint C1-C4 가 meta ↔ settings 합계 정확 일치를 요구 (fatal). 오차 발생 시 전체 팩 거부.

### D5. `normalization.position` 범위는 입력 weight 총합에 맞춰 확장

- Setting13 (skirt_sway): inputs weight 합 140. position range -10~10 유지 (body_angle_x/z/leg_*의 개별 범위와 정합).
- Setting15/16 (leg_sway): inputs weight 합 100. position range **-12~12** 로 확대 (radius 12 반영).
- Setting17 (hip_phys): inputs weight 합 100. position range -8~8 (radius 8 반영).
- **근거**: normalization.position.max 는 내부 시뮬레이션 공간 스케일. radius 가 클수록 position 범위도 확장해 클램핑 artifact 방지.

### D6. physics-lint 규칙 전부 pass — 추가 저자 개입 없음

C1~C10 전부 green:
- C1~C4: meta 카운트 (D4) 일치.
- C5: dictionary 17 entries ↔ settings 17 entries id 1:1.
- C6: 모든 input `source_param` 이 parameters.json 존재 + `physics_input: true`. 신규 inputs (leg_l_angle, leg_r_angle, body_breath, body_angle_x/z) 전부 해당.
- C7: 모든 output `destination_param` 이 parameters.json 존재 + `physics_output: true`. 신규 outputs (cloth_skirt_sway, cloth_skirt_fuwa, leg_sway_l/r, hip_phys, cloth_cape_sway) 전부 해당.
- C8: 모든 `vertex_index=1` 이 `vertices.length(2)` 범위 내.
- C9: 모든 output destination 이 template.manifest.json.cubism_mapping 에 등록됨 (세션 55 에서 +6 entry).
- C10-suffix: 모든 output 이 `_(sway|phys|fuwa)(_[lr])?$` 매치 (fullbody FAMILY_OUTPUT_RULES).
- C10-forbidden: fullbody 는 forbidden prefix 없음(세션 49 FAMILY_OUTPUT_RULES) — 하반신 접두사 `leg_`/`foot_`/`skirt_` 허용.

---

## 3. 변경 산출물

**신규 파일** (3):
- `rig-templates/base/fullbody/v1.0.0/physics/physics.json` (halfbody 복사 + 확장)
- `rig-templates/base/fullbody/v1.0.0/physics/mao_pro_mapping.md` (§1 halfbody 12 승계 표 + §2 신규 5 표 + §3 프리셋 권고 + §4 deformer 바인딩 + §5 L3 튜닝 포인트)
- `progress/sessions/2026-04-19-session-57-fullbody-physics.md` (본 파일)

**수정 파일** (1):
- `progress/INDEX.md` — row 57 추가, §3 checked=227→228 세션 57 physics +1 메시지, §6 `checked=228`, §8 rotate(57 제거, 60 후보 신규).

**변경 없음 (명시)**:
- `scripts/rig-template/physics-lint.mjs` — FAMILY_OUTPUT_RULES.fullbody 이미 세션 49 에서 등록. 수정 없음.
- `schema/v1/physics.schema.json` — 신규 필드 불필요 (halfbody 와 동일 구조). 수정 없음.
- `scripts/rig-template/migrate.mjs` — halfbody→fullbody migrator 없음. 수정 없음.
- `rig-templates/base/fullbody/v1.0.0/parameters.json` / `template.manifest.json` / `deformers.json` / `parts/` — 세션 55/56 에서 확정된 계약 변경 없음.

---

## 4. 검증

- `node scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → **✓ all checks pass** (family=fullbody settings=17 in=43 out=19 verts=34). **ADR 0005 L2 게이트 활성화** — fullbody 물리 저작이 기계 검증된 상태로 진입.
- `node scripts/validate-schemas.mjs` → **checked=228 failed=0** (+1 physics.json).
- `node scripts/rig-template/physics-lint.test.mjs` → 13/13 pass (세션 49 의 family override / schema enum coverage 테스트 무영향).
- `node scripts/rig-template/migrate.test.mjs` → 3/3 pass (halfbody 체인 무영향).
- `pnpm run test:golden` → **20/20 step pass**.

---

## 5. 커밋

단일 커밋:

```
feat(rig): fullbody v1.0.0 physics 17 settings — 하반신 5 + cape 편승 (세션 57)
```

포함:
- `rig-templates/base/fullbody/v1.0.0/physics/physics.json` (신규)
- `rig-templates/base/fullbody/v1.0.0/physics/mao_pro_mapping.md` (신규)
- `progress/sessions/2026-04-19-session-57-fullbody-physics.md` (신규)
- `progress/INDEX.md` (row 57 + §3/§6 checked=228 + §8 rotate)

---

## 6. 다음 세션

§8 새 순서:

- **세션 58**: `motions/idle.default.motion.json@1.2.0` 리마스터 (body_angle_x 추가 → skirt_sway_phys 유도) + 상반신 전용 팩 3종(ahoge.bounce/accessory.greet/greet.wave) 호환성 회귀 + `compat.motion_packs` 복구.
- **세션 59**: expressions 3종 + `test_poses/validation_set.json` + `textures/base.png` + exporter-core `family=fullbody` 분기 + aria 번들 생성 + sha256 golden 고정.
- **세션 60 후보**: BullMQ 드라이버 실장 X — `@geny/job-driver-bullmq` v0.1.0 + Redis 연결 래퍼 + `idempotency_key` → `jobId` pass-through.
