# 세션 102 — 비-Face 파츠 substring-miss 교정 opt-in 3차 (halfbody 4 + fullbody 11)

**일자**: 2026-04-20
**워크스트림**: Rig & Parts + Frontend / UX
**선행 세션**: 세션 98 (`parametersForPart` Rule 0), 세션 99 (physics-lint C11), 세션 100 (halfbody Face opt-in 1차), 세션 101 (fullbody Face opt-in 2차)

---

## 1. 문제

세션 95 `parametersForPart` 2단계 규칙에서 **role 이 어떤 parameter id 의 substring 과도 일치하지 않는 파츠**는 Rule 1 을 건너뛰고 Rule 2 category-group 화이트리스트로 떨어진다. 비-Face 파츠 실측:

| 파츠 | role | substring hits | 기존 fallback 크기 | 문제점 |
|---|---|---|---|---|
| `neck` | `neck` | 0 | 14 (Body 그룹) | 코 주변 파라미터 無 (`body_*` 는 코가 아닌 몸통) |
| `torso` | `torso` | 0 | 14 (Body 그룹) | |
| `hair_side_l/r` | `hair_side_l/r` | 0 | 12 (Hair 그룹) | substring "hair_side_l" 은 "hair_side_sway_l" 에 없음 (중간에 "sway_" 가 끼어 분절) |
| `hip` (fullbody) | `torso` | 0 | 14 | torso 와 role 공유 → narrow 동일하게 망가짐 |
| `leg_l/r` (fullbody) | `limb` | 0 | 14 (Body) | **`leg_l_angle`/`leg_r_angle`/`leg_sway_*` 이 Body 그룹이 아닌 `lower_body` 그룹에 있어 편집 컨트롤이 아예 안 보임** |
| `foot_l/r` (fullbody) | `limb` | 0 | 14 | 동일 — `foot_l_angle`/`foot_r_angle` 이 fallback 에 미포함 |
| `cloth_skirt/cape` (fullbody) | `clothing` | 0 | 14 (Body) | `cloth_skirt_sway/fuwa`/`cloth_cape_sway` 이 `clothing` 그룹 → fallback 엉뚱 |

특히 **fullbody `leg_l`/`leg_r`/`foot_l`/`foot_r` 는 자기 자신을 회전시키는 `leg_l_angle`/`leg_r_angle`/`foot_l_angle`/`foot_r_angle` 이 에디터에 전혀 노출 안 됨** — 세션 95 의 `GROUPS_FOR_CATEGORY.Body = ["body"]` 가 `lower_body` 를 포함하지 않는 구조적 한계. 세션 95 D3 가 "Accessory→[body] rig 현실 반영" 을 택한 반면 `lower_body`/`clothing` 그룹은 fullbody 전용이라 아직 map 되지 않음.

이 세션은 두 가지 동시 해결:
1. **substring-miss 파츠 세트에 `parameter_ids` 명시** — 세션 100/101 의 Rule 0 경로로 category-group fallback 우회.
2. **세션 100 D2 원칙 재적용** — substring 이 이미 정확한 파츠(`hair_front`/`arm_l`/`cloth_main`/`ahoge`/`accessory_{back,front}` 등 9종)는 명시 제외(중복 회피).

---

## 2. 변경

### 2.1 halfbody v1.3.0 — 4 파츠

| slot_id | role | parameter_ids | narrow (before → after) |
|---|---|---|---|
| `neck` | `neck` | `head_angle_{x,y,z}, body_breath, body_breath_phys` | 14 → 8 (-43%) |
| `torso` | `torso` | `body_angle_{x,y,z}, body_breath, body_breath_phys` | 14 → 8 (-43%) |
| `hair_side_l` | `hair_side_l` | `hair_side_sway_l, hair_side_fuwa_l` | 12 → 5 (-58%) |
| `hair_side_r` | `hair_side_r` | `hair_side_sway_r, hair_side_fuwa_r` | 12 → 5 (-58%) |

### 2.2 fullbody v1.0.0 — 11 파츠

| slot_id | role | parameter_ids | narrow (before → after) |
|---|---|---|---|
| `neck` | `neck` | `head_angle_{x,y,z}, body_breath, body_breath_phys` | 14 → 8 (-43%) |
| `torso` | `torso` | `body_angle_{x,y,z}, body_breath, body_breath_phys` | 14 → 8 (-43%) |
| `hip` | `torso` | `body_angle_{x,y,z}, body_breath, body_breath_phys, hip_phys` | 14 → 9 (-36%) |
| `leg_l` | `limb` | `leg_l_angle, leg_sway_l` | 14 → 5 (-64%, **신규 노출**) |
| `leg_r` | `limb` | `leg_r_angle, leg_sway_r` | 14 → 5 (-64%, **신규 노출**) |
| `foot_l` | `limb` | `foot_l_angle` | 14 → 4 (-71%, **신규 노출**) |
| `foot_r` | `limb` | `foot_r_angle` | 14 → 4 (-71%, **신규 노출**) |
| `cloth_skirt` | `clothing` | `cloth_skirt_sway, cloth_skirt_fuwa` | 14 → 5 (-64%) |
| `cloth_cape` | `clothing` | `cloth_cape_sway` | 14 → 4 (-71%) |
| `hair_side_l` | `hair_side_l` | `hair_side_sway_l, hair_side_fuwa_l` | 12 → 5 (-58%) |
| `hair_side_r` | `hair_side_r` | `hair_side_sway_r, hair_side_fuwa_r` | 12 → 5 (-58%) |

### 2.3 physics-lint 헤더 변화

```
# session 101 완료 시점
physics-lint .../halfbody/v1.3.0:  family=halfbody settings=12 ... parts=30/14bind
physics-lint .../fullbody/v1.0.0:  family=fullbody settings=17 ... parts=38/14bind

# 세션 102 이후
physics-lint .../halfbody/v1.3.0:  family=halfbody settings=12 ... parts=30/18bind (+4)
physics-lint .../fullbody/v1.0.0:  family=fullbody settings=17 ... parts=38/25bind (+11)
```

halfbody 미 opt-in 잔여 12 파츠 / fullbody 미 opt-in 잔여 13 파츠 — 모두 substring rule 이 이미 정확 매칭하는 파츠(brow_l/r, ahoge, hair_front, hair_back, arm_l_{a,b}, arm_r_{a,b}, cloth_main, accessory_back, accessory_front, + fullbody acc_belt). 세션 100 D2 "중복 선언 회피" 원칙으로 **의도적 제외** — 세션 102 에서 실제 opt-in 필요 파츠는 이로써 모두 처리됨.

### 2.4 Exit 게이트 — L4 골든 sha256 불변 (3차 실증)

세션 100/101 §5 메커니즘 재확인: `parameter_ids` 는 `@geny/web-editor-logic` 단독 소비, exporter-core 는 parts spec 에서 role/template/deformation_parent/z_order/cubism_part_id/물리 관련 키만 사용. `git diff --stat samples/` 0 bytes — ADR 0005 L4 invariance 3차 실증.

---

## 3. 결정축

### D1 — substring-miss 교정 vs 전체 비-Face 파츠 opt-in

후보 접근 A: "모든 비-Face 파츠에 `parameter_ids` 명시" / B: "substring-miss 파츠만 교정". B 를 선택 — 세션 100 D2 원칙 "substring 이 이미 정확하면 명시는 중복" 을 직접 적용. substring 과 명시가 동일 결과를 내는 경우 둘 중 하나만 업데이트하면 드리프트가 쉬운데, substring 은 parameter id 쪽 변경 시 자동 추종되는 반면 명시는 수동 갱신 필요. substring 이 정확한 파츠에 명시를 넣으면 "parameters.json 에 `arm_l_angle_fine_tune` 신규 추가" 시 명시 쪽은 미업데이트로 drift. 명시는 **substring 이 실패할 때만** 추가.

### D2 — fullbody `lower_body`/`clothing` 그룹을 `GROUPS_FOR_CATEGORY` 에 추가하지 않음

대안: `GROUPS_FOR_CATEGORY.Body = ["body", "lower_body", "clothing"]` 로 확장하면 leg/foot/cloth 파츠도 Rule 2 fallback 으로 자연스럽게 narrow. 거부 이유:
- (a) halfbody 에는 `lower_body`/`clothing` 그룹이 없어 추가해도 무해하지만, 에디터 카테고리 의도("Body 를 편집하면 몸통 관련")와 Rig parameters.json 그룹("lower_body 는 하반신") 이 서로 다른 차원이라 섞으면 의도 희석.
- (b) 세션 95 D3 "Accessory→[body] rig 현실 반영" 은 `accessory_back_sway` 가 `body` 그룹에 있다는 실측 합치였지만, `leg_l_angle` 을 Body 로 묶는 건 "Body 는 몸통/팔 + 다리 + 옷까지 전부" 라는 막연한 집합으로 확대.
- (c) Rule 0 명시 경로가 **파츠별 편집 의도** 를 표현 가능(예: `hip` 과 `torso` 는 같은 role 이지만 hip 은 `hip_phys` 추가, cloth_skirt 는 cloth_cape 와 같은 role 이지만 `fuwa` 포함 여부 다름). 세션 100 mouth_base vs mouth_inner 와 동일 패턴.
- (d) 세션 95 순수 휴리스틱의 미니멀리즘 유지: 카테고리 → 그룹 map 은 Face/Hair/Body/Accessory 4 카테고리 × 1~4 그룹 이하, `lower_body`/`clothing` 추가는 map 엔트리 확장.

### D3 — `neck` 에 `head_angle_*` 명시 vs `body_angle_*`

neck 은 `neck_warp` 디포머의 자식으로 head 와 torso 사이 브리지. 정답은 "둘 다 의존" 이지만, head_angle 은 Cubism Editor 에서 neck 의 주요 편집 컨트롤(머리를 돌리면 목이 따라감). body_breath + body_breath_phys 는 torso 호흡을 neck 하단에서도 반영. **head_angle_{x,y,z} + body_breath + body_breath_phys** 조합 — 상위 body_angle 까지 포함하면 slider 가 넓어져 neck 고유 편집 의미가 흐려짐. rig 저자가 body_angle 영향도 확인이 필요하다 판단되면 `torso` 파츠 선택으로 전환.

### D4 — `hip`/`torso` 를 role 공유로 두되 `parameter_ids` 로 분기

fullbody spec 실측: `hip.spec.json` 과 `torso.spec.json` 모두 `role: "torso"`. 원래는 role 구분해야 했지만 현재 저작 상태. Rule 0 이 각 파츠 spec 에서 `parameter_ids` 를 읽기 때문에 **role 공유 + 명시 분기** 로 현재 설계 유지하며 UX narrow 달성. `torso` 는 상반신만, `hip` 은 상반신 + `hip_phys` 추가. 세션 95 → 세션 98 Rule 0 의 "파츠별 의도 > role" 설계가 이 쪽에서 또 한 번 입증.

### D5 — `leg_l/r`·`foot_l/r` 이 공유하는 `role: "limb"` 는 유지

대칭 파츠 4종이 같은 role 을 공유하는 현재 저작은 `parametersForPart` substring 경로에서 모두 동일 결과(0 match → Body fallback)라 UX 상 구분 불가였음. 이번 세션에서 각자 `parameter_ids` 명시로 **side 인지** 가능(left vs right 에 따라 다른 파라미터 바인딩). role 자체 분리("limb_l" / "limb_r" 등) 로 승격하려면 deformers.json / physics.json cross-ref 재작업 필요 → 범위 초과. Rule 0 명시가 충분.

### D6 — `cloth_skirt` 에 `sway` + `fuwa` 둘 다 / `cloth_cape` 에 `sway` 만

실측: halfbody v1.3.0 + fullbody v1.0.0 공통으로 `cloth_skirt_sway` + `cloth_skirt_fuwa` 2 파라미터 존재(치마는 수평 흔들림 + 볼륨 팽창 2 차원 물리). `cloth_cape` 는 `cloth_cape_sway` 1 파라미터만(망토는 평면 천이라 fuwa 미저작). rig 저자 의도 그대로 반영. 세션 100 mouth_base vs mouth_inner 의 "레이어 의도 → 파라미터 세트" 패턴 연장.

---

## 4. 결과

| 축 | 값 |
|---|---|
| 수정 파일 | halfbody v1.3.0 4 + fullbody v1.0.0 11 = **15 파츠** spec |
| 신규 파일 | `progress/sessions/2026-04-20-session-102-non-face-substring-miss-optin.md` |
| physics-lint (halfbody v1.3.0) | `parts=30/18bind ✓ all checks pass` (14→18) |
| physics-lint (fullbody v1.0.0) | `parts=38/25bind ✓ all checks pass` (14→25) |
| physics-lint.test.mjs | 17/17 pass 불변 |
| test-golden.mjs | **29/29 pass** 불변 |
| validate-schemas | checked=244 불변 |
| `samples/*.bundle.snapshot.json` sha256 | **완전 불변** (L4 invariance 3차 실증) |
| web-editor-logic 테스트 | 57/57 pass 불변 (로직 0 변경) |
| Foundation 누적 opt-in | halfbody 18/30 · fullbody 25/38 = **전체 43/68 (63%)** |

### Exit 게이트 (docs/14 §9)

- **Rig & Parts**: halfbody + fullbody 양 템플릿의 substring-miss 파츠 전부 교정 ✅ (나머지 25 파츠는 substring rule 이 이미 정확)
- **Frontend**: fullbody `leg_l/r`·`foot_l/r` 파츠 선택 시 **자기 회전 파라미터 신규 노출** (이전엔 Body fallback 에 lower_body 그룹 미포함으로 leg_l_angle 이 에디터에서 편집 불가). 에디터 완결성 승격 ✅
- **Platform**: physics-lint 헤더로 opt-in 진행률 63% 가시화 ✅

---

## 5. 남은 opt-in 잔여 25 파츠 (substring rule 정확 매칭 — 의도적 제외)

| 파츠 | 매칭되는 parameter id | narrow (현재 substring 경로) |
|---|---|---|
| halfbody `ahoge` / fullbody 동일 | `ahoge_sway` | 4 (1 + overall 3) |
| `brow_l` / `brow_r` | `brow_l_y/x/angle/form` / r 동등 (4종) | 7 (4 + overall 3) |
| `hair_front` | `hair_front_sway`, `hair_front_fuwa` | 5 (2 + overall 3) |
| `hair_back` | `hair_back_sway`, `hair_back_fuwa` | 5 (2 + overall 3) |
| `arm_l_a` / `arm_l_b` (role `arm_l`) | `arm_l_angle` | 4 (1 + overall 3) |
| `arm_r_a` / `arm_r_b` (role `arm_r`) | `arm_r_angle` | 4 |
| `cloth_main` | `cloth_main_fuwa` | 4 |
| `accessory_back` | `accessory_back_sway` | 4 |
| `accessory_front` | `accessory_front_sway` | 4 |
| fullbody `acc_belt` (role `accessory`) | `accessory_back_sway`, `accessory_front_sway` | 5 |

substring 매칭이 rig parameters.json 네이밍 규약 `<role>_<dim>` 또는 `<role>_<feature>` 을 정확 추종하는 한 Rule 1 경로로 충분. parameter 이름이 변경되면 자동 추종(명시는 수동 갱신 필요) — 향후 rig v1.4.x migrator hop 에서도 유지.

---

## 6. 다음 후보

- **세션 103**: legacy halfbody v1.0.0~v1.2.0 Face/비-Face opt-in 복제 vs migrator 확장 — v1.3.0 이 mao_pro 현행 최신본이지만 legacy 저작물이 쓰이는 상황에서 UX 비대칭. (a) legacy 3 버전에 동일 opt-in 표 3 커밋 복제(보수적, L4 불변) vs (b) `migrator/v*-to-v*.mjs` 가 `parameter_ids` 를 hop 시 자동 이식(근본적, legacy read-only). docs/03 §12.1 freeze 정책과 대조 후 선택.
- **C12**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 — Runtime 전환(세션 97) 전 Cubism SDK 지연 실패를 lint 시점으로 당김. C11 과 동일 `paramById` Map 재사용.
- **세션 97** Runtime 전환 — 세션 100~102 의 3 커밋으로 halfbody + fullbody 양 템플릿 Foundation Face + 비-Face UX narrow 가 모두 닫힘. 렌더러 합류 전 에디터 UX 준비 완료 상태.
