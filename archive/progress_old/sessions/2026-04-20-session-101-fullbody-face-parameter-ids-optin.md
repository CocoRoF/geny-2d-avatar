# 세션 101 — fullbody v1.0.0 Face 14 파츠 `parameter_ids` opt-in 2차 (halfbody 대칭 복제)

**일자**: 2026-04-20
**워크스트림**: Rig & Parts + Frontend / UX
**선행 세션**: 세션 98 (`parameter_ids` schema + `parametersForPart` Rule 0), 세션 99 (physics-lint C11), 세션 100 (halfbody v1.3.0 Face 14 opt-in 1차)

---

## 1. 문제

세션 100 이 halfbody v1.3.0 Face 14 파츠에 `parameter_ids` 를 opt-in 했지만 fullbody v1.0.0 은 미처리. halfbody 에디터에선 `eye_iris_l` 선택 시 7 슬라이더로 narrow 되지만, **fullbody 템플릿으로 전환하면 여전히 60 파라미터 중 face/eyes/brows/mouth 그룹 전부가 노출**(세션 95 category-group fallback). INDEX.md §4/§3 에서 halfbody/fullbody 가 동등한 Foundation 템플릿임을 명시하는 이상 Face UX narrow 도 대칭이어야 한다.

세션 100 D1 에서 "fullbody 대칭 복제" 를 2차 후보로 명시적으로 예약했고, 파라미터 이름 공간이 halfbody v1.3.0 과 동일(세션 52 §4 `idle.default@1.2.0` remaster 설계상 body_angle_y 만 추가된 superset)이라 복제가 기계적으로 성립한다.

---

## 2. 변경

### 2.1 `rig-templates/base/fullbody/v1.0.0/parts/` — 14 파츠 `parameter_ids` 추가

세션 100 표 그대로 복제(파라미터 id 공간이 halfbody v1.3.0 과 동일 — fullbody 는 `body_angle_y`/`leg_*`/`foot_*`/`cloth_*`/`hip_phys` 10 파라미터 superset, Face 파츠가 바인딩하는 19 id 는 완전 동일).

| 파츠 (slot_id) | parameter_ids | 노트 |
|---|---|---|
| `eye_iris_l` | `eye_ball_x, eye_ball_y, eye_ball_form, eye_open_l` | 시선 XY + 동공 축소 + 왼눈 개폐 |
| `eye_iris_r` | `eye_ball_x, eye_ball_y, eye_ball_form, eye_open_r` | 대칭 |
| `eye_white_l` | `eye_open_l, eye_smile_l, eye_form_l` | 개폐·웃음·형태 |
| `eye_white_r` | `eye_open_r, eye_smile_r, eye_form_r` | 대칭 |
| `eye_lash_upper_l` | `eye_open_l, eye_smile_l, eye_form_l` | blink 추종 |
| `eye_lash_upper_r` | `eye_open_r, eye_smile_r, eye_form_r` | 대칭 |
| `eye_lash_lower_l` | `eye_open_l, eye_smile_l, eye_form_l` | 하 속눈썹 (옵션 파츠, `required:false`) |
| `eye_lash_lower_r` | `eye_open_r, eye_smile_r, eye_form_r` | 대칭 |
| `mouth_base` | `mouth_vowel_{a,i,u,e,o}, mouth_up, mouth_down` | 립싱크 5 + 입꼬리 |
| `mouth_inner` | `mouth_vowel_{a,i,u,e,o}` | 혀·치아 레이어 — 5 모음만 |
| `face_base` | `head_angle_x, head_angle_y, head_angle_z` | 머리 회전만 |
| `face_shadow` | `head_angle_x, head_angle_y, head_angle_z` | 음영 |
| `nose` | `head_angle_x, head_angle_y, head_angle_z` | 코 |
| `cheek_blush` | `head_angle_x, head_angle_y, head_angle_z` | 뺨 |

**brow_l/brow_r 제외** — 세션 100 D2 와 동일 논리. substring 규칙이 fullbody parameters.json 의 `brow_l_angle`/`brow_l_shape_angry`/…를 이미 정확 매칭(halfbody 와 동일 id).

세션 100 과 달리 fullbody 쪽은 모든 14 파츠에서 `parameter_ids` 필드가 `undefined` 상태였음(halfbody 는 face_base/face_shadow/nose/cheek_blush 에 기존 `head_angle_{x,y,z}` 바인딩 존재, 세션 100 에서 값 변경 없이 Rule 0 활성만). 14 파일 모두 1줄 추가(위치: `dependencies` 이후, `validation` 이전 — 스키마 순서).

### 2.2 physics-lint 실측 헤더 변화

```
# before (session 100 이전 fullbody)
physics-lint .../fullbody/v1.0.0: family=fullbody settings=17 in=43 out=19 verts=34 parts=38/0bind

# after (세션 101)
physics-lint .../fullbody/v1.0.0: family=fullbody settings=17 in=43 out=19 verts=34 parts=38/14bind
```

세션 99 의 `parts=N/Mbind` 헤더가 halfbody v1.3.0 (30/14) · fullbody v1.0.0 (38/14) 양쪽에서 Face opt-in 진행률을 즉시 시각화. fullbody 의 `38-14=24` 미opt-in 파츠는 Hair(4) + Body(14: torso/neck/arms/hip/legs/foot/cloth_main) + Accessory(3: acc_belt/accessory_back/accessory_front) + brow_l/r + ahoge + eye_lash 공통(0) 순 — 세션 102+ 후보.

### 2.3 Exit 게이트 — L4 골든 sha256 불변

세션 100 §5 와 동일 메커니즘: `grep -r "parameter_ids" packages/` 결과 `@geny/web-editor-logic` 단일 소비, `exporter-core` 는 parts spec 에서 role/template/deformation_parent/z_order/cubism_part_id/물리 키만 읽음. `git diff --stat samples/` 결과 0 bytes. ADR 0005 L4 계약 유지.

---

## 3. 사용자 UX 영향 (실측)

`apps/web-editor` 에서 fullbody 템플릿(`public/sample/fullbody/bundle.json`) 선택 후 Face 파츠 선택 시:

| 선택 파츠 | before (세션 95 fallback) | after (세션 101 Rule 0) | narrow |
|---|---|---|---|
| `eye_iris_l` | 60 → 30 (face+eyes+brows+mouth+overall) | 60 → 7 (4 + overall 3) | **77%** |
| `mouth_base` | 60 → 30 | 60 → 10 (7 + overall 3) | **67%** |
| `mouth_inner` | 60 → 30 | 60 → 8 (5 + overall 3) | **73%** |
| `nose`/`face_shadow`/`cheek_blush` | 60 → 30 | 60 → 6 (3 + overall 3) | **80%** |
| `face_base` | 60 → 30 | 60 → 6 (3 + overall 3) | **80%** |
| `eye_white_l`/`eye_lash_*_l/r` | 60 → 30 | 60 → 6 (3 + overall 3) | **80%** |

(`overall 3` = `body_angle_x/y/z` — 세션 98 D4 "overall 자동 포함")

halfbody 와 사실상 동일한 narrow 비율 — `body_angle_y` 추가로 overall 이 3 → 3 유지(기존 halfbody 도 body_angle_x/z 존재, v1.2.0 기준 x/z 2 → v1.3.0 에서 y 추가해 3, fullbody 는 v1.0.0 부터 3 완비).

---

## 4. 결정축

### D1 — 1차(halfbody)와 2차(fullbody) 분리 커밋

세션 100 (halfbody) → 세션 101 (fullbody) 2 커밋 분리. 대안은 한 커밋 묶음이지만, (a) 세션 100 이 "에디터 UX narrow 개념 증명 + L4 불변 실험" 의 첫 실증 → 독립 검증 로그 필요, (b) fullbody 는 halfbody 패턴 기계 복제라 리뷰 부하 낮음 → 별 커밋이 리뷰 편함, (c) C11 CI 안전망이 각 커밋에서 독립 green 증명. 세션 100 §D1 (" fullbody 는 후속") 약속 이행.

### D2 — halfbody 표 그대로 복제 (해석 0 변경)

fullbody 는 `body_angle_y`/`leg_*`/`foot_*` superset 이지만 Face 파츠의 편집 의도는 템플릿과 무관. halfbody v1.3.0 에서 `eye_iris_l` 을 `[eye_ball_x/y/form, eye_open_l]` 로 정한 결정은 "홍채 = 시선 + 동공 + 해당측 개폐 클리핑" 이라는 UX 원리 기반이라 fullbody 에서도 동일하게 유지. 대칭 위반은 향후 rig 저자가 필요 시 세션 별로 추가.

### D3 — fullbody 전용 파라미터 (body_angle_y / leg_* / cloth_*) Face 파츠 바인딩 제외

Face 파츠는 `head_pose_rot` / `eye_l_warp` / `eye_r_warp` / `mouth_warp` deformer 아래에 있어 `leg_*` / `cloth_skirt_*` 등의 하반신 파라미터로 편집될 일이 없음. `body_angle_y` (세션 52 §6 fullbody idle 모션 진동 축) 는 overall 카테고리라 세션 98 D4 자동 포함 규칙으로 이미 모든 Face 파츠 슬라이더에 노출. 추가 바인딩 불필요.

### D4 — face_base 에 `required: true` 유지 + parameter_ids 추가 (필수성 ≠ 바인딩)

fullbody face_base 는 `required: true`/`dependencies: []` 로 모든 Face 파츠의 좌표 컨테이너. 세션 100 에서 이미 halfbody 와 동일 논리 확인 — 필수성은 번들 저작 수준 계약, 바인딩은 에디터 UX 계약으로 직교. 같은 파츠에 둘 다 유지.

### D5 — Face 14 + eye_lash_lower_l/r 포함 (옵션 파츠지만 대칭 유지)

`eye_lash_lower_{l,r}` 은 `required: false` (스타일 프로파일 생략 가능) 지만 번들에 존재할 때 에디터가 여전히 파츠 사이드바에 노출 → `parameter_ids` 바인딩 없으면 60→30 fallback 으로 돌아감. 대칭 유지 쪽이 UX 예측성 + 코드 경로 단순성 승.

### D6 — 세션 100 대비 추가 테스트 불요

세션 99 의 C11 CI 안전망이 `parameters.json` 존재성을 lint 시점 검증. 세션 100 의 `parametersForPart` 테스트 57 + web-editor-logic 50 → 57 가 Rule 0 로직 단위 테스트 완비. 세션 101 은 **데이터 변경만** (로직 0 변경) → 기존 테스트 suite 로 완전 커버. `physics-lint` 이 fullbody 38/14 를 새로 리포트하는 것 자체가 추가 회귀 증명.

---

## 5. 결과

| 축 | 값 |
|---|---|
| 수정 파일 | `rig-templates/base/fullbody/v1.0.0/parts/*.spec.json` 14건 (각 +1 line) |
| 신규 파일 | `progress/sessions/2026-04-20-session-101-fullbody-face-parameter-ids-optin.md` |
| physics-lint (fullbody) | `parts=38/14bind ✓ all checks pass` |
| physics-lint (halfbody v1.3.0) | `parts=30/14bind ✓ all checks pass` 불변 |
| physics-lint.test.mjs | 17/17 pass 불변 |
| test-golden.mjs | **29/29 pass** 불변 |
| validate-schemas | checked=244 불변 |
| `samples/*.bundle.snapshot.json` sha256 | **완전 불변** (L4 invariance 2차 실증) |
| web-editor-logic 테스트 | 57/57 pass 불변 (로직 0 변경) |

### Exit 게이트 (docs/14 §9)

- **Rig & Parts**: fullbody v1.0.0 Face UX narrow — halfbody v1.3.0 과 대칭 완료 ✅
- **Frontend**: 에디터 Face 파츠 선택 시 60→6~10 narrow — 템플릿-불문 일관 ✅
- **Platform**: physics-lint 헤더 `38/14bind` → 향후 24 미opt-in 파츠 진행률 가시화 ✅

---

## 6. 다음 후보

- **세션 102**: Hair/Body/Accessory 파츠 선별 opt-in — substring 규칙이 `hair_front_sway` / `arm_l_angle` 등을 이미 정확 매칭하므로 opt-in 가치가 있는 파츠는 **substring 실패하거나 의도-파라미터 불일치** 사례로 좁아짐. 실측 필요:
  - `torso` / `neck` / `hip` (id 공간에 대응 파라미터 없음 — overall 만? 세션 101 의 `head_angle` 패턴 적용 가능)
  - `cloth_main` / `cloth_cape` / `cloth_skirt` (substring 으로 `cloth_cape_sway` 등은 매칭되나 실제 편집 의도가 단일 파츠에 좁혀지는지 조사)
  - `acc_belt` / `accessory_{back,front}` / `ahoge` (substring 으로 각자 파라미터 정확 매칭 — 세션 100 brow 와 동일 제외 후보)
- **세션 103**: halfbody v1.0.0~v1.2.0 (legacy) 도 Face opt-in 복제할지 결정 — v1.3.0 이 mao_pro 현행 최신본이지만, migrator(세션 37) 가 v1.2.0→v1.3.0 hop 시 `parameter_ids` 를 자동 이식하도록 확장하는 쪽이 더 근본적. "legacy 저작물은 freeze" 정책 vs "모든 템플릿 UX 동등" 의 트레이드오프.
- **C12**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 — 세션 101 의 Rule 0 opt-in 이 늘수록 parts↔deformers 바인딩 drift 가 별도 검증 필요.

세션 101 은 세션 100 의 "halfbody 실증" 을 "foundation 양 템플릿 대칭" 으로 확장. 다음 2~3 세션은 **Hair/Body 로 확장 vs Runtime 전환 (세션 97 후보) 의 우선순위** 를 실제 에디터 내부 테스터 피드백으로 결정하는 단계.
