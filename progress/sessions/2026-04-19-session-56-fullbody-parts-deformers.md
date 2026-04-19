# Session 56 — fullbody v1.0.0 실 저작 2단계 (파츠 spec 8종 + deformers.json)

- **날짜**: 2026-04-19
- **범위**: 세션 52 저작 계획 §7 의 X+1 단계 (5단계 중 2).
- **산출물**: `rig-templates/base/fullbody/v1.0.0/parts/*.spec.json` (30 복사 + 8 신규) + `deformers.json` (21 복사 + 8 신규).
- **상태**: 완료
- **선행**: 세션 55 (스캐폴딩 1단계 — manifest + parameters)
- **후행**: 세션 57 (physics authoring), 58 (motions), 59 (E2E 번들)

---

## 1. 배경

세션 55 가 fullbody v1.0.0 의 **뼈대**(디렉터리 + manifest + parameters 59) 를 세웠으나 파츠/디포머가 비어 있어 validate-schemas 의 ENOENT skip 에 기대는 상태였다. 이번 세션 56 은 그 ENOENT skip 을 **끝내고** 실 파츠/디포머를 채워 번들 어셈블리 직전까지 끌고 간다.

세션 52 §7 이 예측한 "halfbody v1.3.0 21 노드 + 하반신 warp ~7개 = 28 노드" 는 설계를 정밀화하면서 **8 노드** (foot warp 을 leg warp 아래로 분리) 로 확정 → 최종 29 노드. 파츠는 38.

---

## 2. 설계 결정

### D1. halfbody v1.3.0 parts/ 전체를 복사 베이스로 사용

- `cp -R halfbody/v1.3.0/parts fullbody/v1.0.0/parts` + `cp halfbody/v1.3.0/deformers.json fullbody/v1.0.0/deformers.json` 으로 상반신 저작을 통째로 승계.
- 30 개 spec 파일에서 `"template": "tpl.base.v1.halfbody"` → `"tpl.base.v1.fullbody"` 를 `sed` 로 일괄 치환. 다른 필드 (anchor/z_order/uv_box_px/visual/generation) 는 **무조건** 상속 — 저자가 고의로 바꿔야 할 이유가 현재 없음.
- **근거**: 파츠 spec 은 이미 성숙한 계약서 (`docs/04 §3`). halfbody 가 v1.0.0→v1.3.0 3 리마스터를 거쳐 자리잡았으니 fullbody 가 이를 재사용하지 않을 이유 없음. 새 family 가 상반신 구조를 다시 설계하는 것은 drift 만 유발.
- **기각 대안**: halfbody 파츠를 **참조**(import)로 공유 → 스키마 계층 추가 + 에디터 파일 해석 복잡도 증가. 2 family 시점에선 YAGNI.

### D2. 하반신 파츠 8종 — 관절 구조와 맞는 deformer 계층

| slot | category | deformation_parent | z_order | dependencies |
|---|---|---|---|---|
| `hip` | body | `hip_warp` | 18 | `torso` |
| `leg_l` | body | `leg_l_warp` | 16 | `hip` |
| `leg_r` | body | `leg_r_warp` | 16 | `hip` |
| `foot_l` | body | `foot_l_warp` | 14 | `leg_l` |
| `foot_r` | body | `foot_r_warp` | 14 | `leg_r` |
| `cloth_skirt` | cloth | `skirt_warp` | 25 | `hip` |
| `cloth_cape` | cloth | `cape_warp` | 12 | `torso` |
| `acc_belt` | accessory | `acc_belt_warp` | 28 | `hip`, `cloth_skirt` |

- **z_order 배치 근거**: 기존 halfbody z-order (hair_back=10 · accessory_back=15 · torso=20 · arm_*=22 · cloth_main=30) 사이에 끼워넣음. cape 는 가장 뒤(12, hair_back 과 accessory_back 사이) — 등 뒤로 펄럭. foot(14) < leg(16) < hip(18) < torso(20) — 관절 seam 커버 순서. skirt(25) 는 torso(20) 위, cloth_main(30) 아래 — 허리띠(acc_belt=28) 는 skirt 위로 덮어 웨이스트밴드 가림.
- **dependencies 체인**: 관절 연결 순서(hip → leg → foot) + 의존 아이템(belt 는 skirt 가 있어야 웨이스트밴드에 걸림) 을 선언해 AI 생성 파이프라인이 순서 강제하도록.

### D3. deformer subtree — `hip_warp` 가 하반신 컨테이너 · `cape_warp` 는 body_visual 직속

- `hip_warp` (parent=`body_visual`, params_in=[`hip_phys`]) 하위:
  - `leg_l_warp` (params_in=[`leg_l_angle`, `leg_sway_l`]) → `foot_l_warp` (params_in=[`foot_l_angle`])
  - `leg_r_warp` (params_in=[`leg_r_angle`, `leg_sway_r`]) → `foot_r_warp` (params_in=[`foot_r_angle`])
  - `skirt_warp` (params_in=[`cloth_skirt_sway`, `cloth_skirt_fuwa`])
  - `acc_belt_warp` (params_in=[])
- `cape_warp` (parent=`body_visual`, params_in=[`cloth_cape_sway`]) — 망토는 **힙 바깥**.

- **왜 cape 는 hip_warp 의 형제가 아닌 body_visual 직속**: 망토는 어깨에 고정되어 상반신 회전(=body_pose_warp)에 묶이되, 하반신 골반 이동(hip_phys)에 끌려다녀선 안 된다. 다리 회전 시 망토가 같이 돌면 어색. hip_warp 외부에 두어 상반신 sway 만 받도록.
- **왜 skirt 는 hip_warp 자식**: 치마는 골반에 고정 — hip_phys 이동 + leg_angle 변화가 skirt_sway_phys 를 유도해야 자연스러움. hip_warp 하위에 두면 이 상속이 자동.
- **왜 foot_warp 은 leg_warp 하위**: 발은 다리 말단이므로 leg_angle + leg_sway 를 상속받아야 발목 seam 이 어긋나지 않음.
- **왜 acc_belt_warp params_in 이 비어있음**: 벨트는 hip 이동만 따라가면 되고 독립 물리는 없음 (belt_sway 같은 건 YAGNI).

### D4. schema enum 확장 거부 — 기존 값으로 맞춤

첫 validate-schemas 실행에서 8 failure — 내가 의도한 의미 있는 enum 값들이 schema 에 없었다:
- `anchor.type`: `pelvis_center`/`hip_joint_l`/`ankle_l`/`waist_band_center`/`shoulder_center` — 전부 존재 안 함 (유효값: bbox_center/alpha_centroid/eye_*/mouth_center/nose_tip/head_top_center/hair_parting_centroid/neck_top_center/shoulder_l/r).
- `visual.color_context`: `fabric`/`leather`/`shoe` — 없음 (유효값: skin/hair/eye/mouth/shadow/cloth_main/cloth_accent/accessory/metal/glass/fx).
- `visual.alpha_edge_policy`: `feather_3px`/`hard_1px` — 없음 (유효값: hard/feather_1px/feather_2px/feather_4px).
- `category`: `clothing` — 없음 (유효값: face/eye/brow/mouth/hair/body/cloth/accessory/fx).

**결정**: schema 를 확장하지 않고 **기존 enum 으로 맞췄다**. 최종 매핑:
- 하반신 anchors → `alpha_centroid` (x_frac/y_frac 로 세부 위치 지정). cape 는 `shoulder_l` (일종의 shoulder_center 대용 — shoulder_r 도 가능하나 대칭성 기준 `shoulder_l`).
- foot color_context → `accessory` (신발은 accessory 계열). 벨트도 `accessory`. 치마 → `cloth_main`, 망토 → `cloth_accent` (main 이 기본 cloth → 망토는 보조).
- feather → `feather_4px` (드레이프 큰 천), belt → `hard`.
- 치마/망토 category → `cloth` (`clothing` 철자 오류).

**근거**: schema 확장은 schema 호환성·docs/04 §2.1 갱신·migrate 스크립트 영향·다른 family 재검증 등 부수 작업이 따른다. 세션 56 의 스코프는 "parts + deformers" 이고 schema 확장은 **별도 PR** 로 처리해야 깨끗. 실 저작이 누적된 뒤(fullbody + chibi + feline) 공통 패턴이 보이면 그때 확장 ADR 을 쓴다.
- **기각 대안**: 즉시 schema 에 `pelvis_center`/`hip_joint_l/r`/`ankle_l/r` 추가 → 이번 세션이 "parts + deformers + schema 확장" 3 축이 되어 실패 원인 특정이 어려워짐. ADR 0005 의 "각 단계 독립 커밋" 원칙과 충돌.

### D5. body_visual 노트만 갱신 · 나머지 21 노드 불변

- `body_visual.notes` 만 "fullbody v1.0.0 에서 하반신 컨테이너 hip_warp 와 cape_warp 를 추가 자식으로 받는다" 문장 append.
- 다른 halfbody 노트는 전부 원문 유지 — halfbody 동작 설명으로 여전히 정확.
- **근거**: halfbody 서술이 틀려서 바꾸는 게 아니라 **fullbody 가 확장된다**는 사실만 명시하면 됨. 최소 변경으로 diff 가독성 최대.

### D6. cubism_part_id 신규 6 — `PartHip`/`PartLegL/R`/`PartFootL/R`/`PartClothSkirt`/`PartClothCape`/`PartAccBelt`

- halfbody 네이밍 컨벤션 (`PartTorso`/`PartArmL`/`PartClothMain` 등) 답습. PascalCase + slot 의미.
- **근거**: 기존 템플릿의 일관성 유지. Cubism Editor 에서 load 될 때 네이밍이 친숙.

---

## 3. 변경 산출물

**신규 파일** (8):
- `rig-templates/base/fullbody/v1.0.0/parts/hip.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/leg_l.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/leg_r.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/foot_l.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/foot_r.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/cloth_skirt.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/cloth_cape.spec.json`
- `rig-templates/base/fullbody/v1.0.0/parts/acc_belt.spec.json`
- `progress/sessions/2026-04-19-session-56-fullbody-parts-deformers.md` (본 파일)

**복사 + 수정 파일** (31):
- `rig-templates/base/fullbody/v1.0.0/parts/*.spec.json` 30 파일 — halfbody v1.3.0 복사 후 template 필드 치환
- `rig-templates/base/fullbody/v1.0.0/deformers.json` — halfbody v1.3.0 복사 + `body_visual.notes` 갱신 + 하반신 8 노드 append (21→29)

**수정 파일** (1):
- `progress/INDEX.md` — row 56 추가, §3/§6 `checked=188→227`, §8 rotate (56 제거, 59 신규)

**변경 없음 (명시)**:
- `schema/v1/part-spec.schema.json` — enum 확장 거부(D4). 향후 공통 패턴 누적 시 별도 ADR.
- `scripts/rig-template/physics-lint.mjs` — FAMILY_OUTPUT_RULES 이미 세션 49 에서 fullbody 등록. 수정 없음.
- `scripts/rig-template/migrate.mjs` — halfbody→fullbody migrator 없음(별도 family). 수정 없음.
- `docs/03 §6.2` 파생 표 fullbody 행 — 여전히 세션 57 에서 physics 완성 후 추가(세션 55 결정 유지).

---

## 4. 검증

- `node scripts/validate-schemas.mjs` → **checked=227 failed=0**. 파츠 38 + 템플릿 + parameters + deformers 교차확인 전부 pass. ENOENT skip: physics / test_poses 2종 (세션 57/59 범위).
- `node scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → physics.json 없음 error (의도 — 세션 57 활성).
- `node scripts/rig-template/migrate.test.mjs` → 3/3 pass (halfbody 체인 무영향).
- `node scripts/rig-template/physics-lint.test.mjs` → 13/13 pass (세션 49 의 `--family fullbody` 오버라이드 테스트 무영향).
- `pnpm run test:golden` → **20/20 step pass**. worker-generate 16 + perf-harness smoke 3 전부 green.

---

## 5. 커밋

단일 커밋:

```
feat(rig): fullbody v1.0.0 파츠 38 + deformers 29 — 하반신 subtree (세션 56)
```

포함:
- `rig-templates/base/fullbody/v1.0.0/parts/*.spec.json` (30 복사 + 8 신규, 총 38)
- `rig-templates/base/fullbody/v1.0.0/deformers.json` (21 복사 + 8 신규, 총 29)
- `progress/sessions/2026-04-19-session-56-fullbody-parts-deformers.md` (신규, 본 파일)
- `progress/INDEX.md` (row 56 + §3/§6 checked=227 + §8 rotate)

---

## 6. 다음 세션

§8 새 순서:

- **세션 57**: `physics/physics.json` 17 PhysicsSetting 저작 + `mao_pro_mapping.md` §7 신설 + ADR 0005 L2 게이트(`physics-lint --family fullbody`) 활성화 = 저작 완결 신호.
- **세션 58**: `motions/idle.default.motion.json@1.2.0` 리마스터 (body_angle_x 추가) + 상반신 전용 팩 호환성 회귀 + `compat.motion_packs` 복구.
- **세션 59**: expressions 3종 + `test_poses/validation_set.json` + `textures/base.png` + exporter-core family=fullbody 분기 + 번들 sha256 golden.
