# 세션 100 — halfbody v1.3.0 Face 14 파츠 `parameter_ids` opt-in 1차

**일자**: 2026-04-20
**워크스트림**: Rig & Parts + Frontend / UX
**선행 세션**: 세션 95 (2단계 `parametersForPart` 규칙), 세션 98 (`parameter_ids` schema + Rule 0 우선 소비), 세션 99 (physics-lint C11 CI 안전망)

---

## 1. 문제

세션 95 의 `parametersForPart` 2단계 규칙에서 role 이 parameter id 와 substring 매칭되지 않는 Face 파츠는 category-group 화이트리스트 fallback 으로 떨어진다. `GROUPS_FOR_CATEGORY.Face = ["face", "eyes", "brows", "mouth"]` + `overall` 이라 **Face 카테고리 전체 파츠가 얼굴 관련 파라미터 전부를 노출**:

- `eye_iris_l` 선택 시에도 `mouth_vowel_a` / `brow_r_angle` 까지 30개 슬라이더가 보임 (halfbody v1.3.0: 3 face + 9 eyes + 8 brows + 7 mouth + 3 overall = 30).
- `mouth_base` 선택 시에도 eye 관련 파라미터 전부가 슬라이더로 노출.
- `nose` / `cheek_blush` 같은 "머리 회전만 따라가는" 파츠에도 face/eyes/brows/mouth 전부 노출 — 30개 슬라이더 중 편집 의미 있는 건 3개(head_angle).

세션 98 이 `part.parameter_ids` 명시 계약을 열었고, 세션 99 가 C11 CI 안전망으로 id 드리프트를 차단했으니, 이제 실제 rig-template 에 opt-in 을 넣어 **에디터 UX 슬라이더 노출 범위를 파츠별 의도에 맞게 좁힐 때**. 이 세션은 halfbody v1.3.0 Face 14 파츠에 대한 1차 opt-in.

---

## 2. 변경

### 2.1 `rig-templates/base/halfbody/v1.3.0/parts/` — 14 파츠 `parameter_ids` 추가

필드 위치: schema 순서대로 `dependencies` 와 `validation` 사이. 각 1줄 추가 (기존 필드 포맷 보존).

| 파츠 (slot_id) | parameter_ids | UX 의미 |
|---|---|---|
| `eye_iris_l` | `eye_ball_x, eye_ball_y, eye_ball_form, eye_open_l` | 왼눈 홍채 — 시선 XY + 동공 축소 + 개폐 클리핑 |
| `eye_iris_r` | `eye_ball_x, eye_ball_y, eye_ball_form, eye_open_r` | 오른눈 홍채 대칭 |
| `eye_white_l` | `eye_open_l, eye_smile_l, eye_form_l` | 왼눈 흰자 — 개폐·웃음·형태 |
| `eye_white_r` | `eye_open_r, eye_smile_r, eye_form_r` | 오른눈 흰자 대칭 |
| `eye_lash_upper_l` | `eye_open_l, eye_smile_l, eye_form_l` | 왼눈 윗속눈썹 — blink 추종 |
| `eye_lash_upper_r` | `eye_open_r, eye_smile_r, eye_form_r` | 오른눈 윗속눈썹 |
| `eye_lash_lower_l` | `eye_open_l, eye_smile_l, eye_form_l` | 왼눈 아랫속눈썹 |
| `eye_lash_lower_r` | `eye_open_r, eye_smile_r, eye_form_r` | 오른눈 아랫속눈썹 |
| `mouth_base` | `mouth_vowel_{a,i,u,e,o}, mouth_up, mouth_down` | 입 베이스 — 립싱크 5 모음 + 입꼬리 |
| `mouth_inner` | `mouth_vowel_{a,i,u,e,o}` | 입 내부(혀·치아) — 모음만 (입꼬리 무관) |
| `face_base` | `head_angle_x, head_angle_y, head_angle_z` | 얼굴 베이스 — 머리 회전만 |
| `face_shadow` | `head_angle_x, head_angle_y, head_angle_z` | 얼굴 음영 |
| `nose` | `head_angle_x, head_angle_y, head_angle_z` | 코 |
| `cheek_blush` | `head_angle_x, head_angle_y, head_angle_z` | 볼 홍조 |

**제외**: `brow_l` / `brow_r` 는 세션 95 substring 규칙이 이미 정확히 동작 (`brow_l_y`/`brow_l_x`/`brow_l_angle`/`brow_l_form` 4개만 매치) — opt-in 추가 시 중복성만 증가, 휴리스틱 우회 필요성 없음. 미래 C11 regression 보호 목적이면 별도 세션에서 "전 Face opt-in 완결" 이라는 의미적 단위로 묶어 추가 가능.

**자동 포함**: `overall_x, overall_y, overall_rotate` 는 세션 95 D2 / 세션 98 D4 의 불변식으로 `parametersForPart` 가 항상 append — spec 에 중복 나열 불필요.

### 2.2 `scripts/rig-template/physics-lint.test.mjs` — C11 회귀 테스트 자기완결화

세션 99 의 C11 테스트 2l/2m/2n/2o 가 "copyV13 후 ahoge.spec.json 만 수정" 패턴으로 작성돼 있어, **v1.3.0 에 opt-in 이 추가되면 `parts_with_bindings` 절대값이 변동**. 구체적으로 세션 100 이후 copy 직후 상태가 `parts_with_bindings=14` 라서, 기존 `assert.equal(parts_with_bindings, 1)` 이 실패.

해결: `stripAllParameterIds(dir)` 헬퍼 신설 — 테스트 시작 전 scratch dir 의 모든 `*.spec.json` 에서 `parameter_ids` 필드를 제거해 "opt-in 0건 베이스라인" 으로 정규화. 테스트가 **template 진화에 불변**. 테스트 2l/2m/2n 에 strip 호출 추가.

테스트 2o (공식 halfbody v1.3.0 lint) 는 `parts_with_bindings=0` 하드코딩을 제거하고 "`parts_with_bindings ∈ [0, parts_checked]` 범위 + C11 오류 0" 만 확인. "공식 템플릿은 C11 를 통과한다" 축만 보존하고 구체 카운트는 template 진화에 위임 — 세션 100+ 에서 opt-in 이 늘어나도 테스트 자연스러움.

### 2.3 영향 범위 실측

- **에디터 UX**: `eye_iris_l` 선택 시 슬라이더 30 → **7** (4 explicit + 3 overall). `mouth_inner` 선택 시 20 → **8** (5 vowels + 3 overall). `nose` 선택 시 20 → **6** (3 head_angle + 3 overall). 불필요 슬라이더 70~80% 감소.
- **physics-lint**: CLI summary `parts=30/14bind` (이전 `30/0bind`) — opt-in 진행률 직관 노출. C11 오류 0.
- **L4 golden sha256**: **불변** — exporter-core 는 `parameter_ids` 를 읽지 않음 (`parameters.json` + deformers/physics/pose/motion/expression 만 번들). `samples/avatars/sample-01-aria.bundle.snapshot.json` / `sample-02-zoe-fullbody.bundle.snapshot.json` 전부 touch 없음, validate-schemas checked=244 불변.
- **`parametersForPart` 단위 테스트**: 57/57 그대로 pass — 세션 98 Rule 0 경로가 이미 이 케이스를 커버 중.
- **e2e-check**: halfbody probe part 가 `hair_front` 우선 매칭되어 세션 95 의 `49→X` narrow 로그는 동일. Face 파츠가 probe 로 뽑히는 경로가 있으면 narrow 폭이 더 커지지만 assertion 은 `subset.length > 0 && subset.length < total` 만 요구 → 더 강하게 pass.

---

## 3. 결정 축 (D1–D6)

### D1. halfbody v1.3.0 만 opt-in — 하위 버전 (v1.0.0~v1.2.0) / fullbody v1.0.0 미포함
- **결정**: v1.3.0 단일 버전만 이번 세션에 포함.
- **이유**: v1.0.0~v1.2.0 는 **archived baseline** — `test-golden` 이 diff 회귀(v1.2.0→v1.3.0 = +3 physics settings) 를 고정하기 위해 유지하는 골든 고정점. parameter_ids 같은 UX-축 확장은 최신 버전에만 선행 적용하고, 하위 버전은 리그레이션 회귀 역할을 유지하는 게 도메인 규약. fullbody v1.0.0 은 38 파츠(halfbody 30 + 하반신 8)라 별도 세션에서 일관된 scope 로 다루는 편이 리뷰 단위가 깨끗 — 하반신 8 파츠는 별도 parameter 세트(leg_sway, cloth_skirt_fuwa 등)라 Face opt-in 과 결정 축이 다름.

### D2. `brow_l`/`brow_r` 제외
- **결정**: 이번 세션에서 opt-in 안 함.
- **이유**: 세션 95 substring 규칙(`p.id.includes(role)`)이 `role="brow_l"` 에 대해 `brow_l_y`/`brow_l_x`/`brow_l_angle`/`brow_l_form` 4개를 정확히 매치. category-group fallback 으로 떨어지지 않아 UX narrow 이미 달성. opt-in 추가는 *정확성* 향상 없이 C11 회귀 lane 만 넓히는 순효과 — YAGNI. 미래 "휴리스틱을 완전히 걷어낸다" 라는 의미적 전환이 있으면 그때 추가.

### D3. `mouth_base` 에 `mouth_up/down` 포함 / `mouth_inner` 는 제외
- **결정**: base 는 입꼬리 포함(7 ids), inner 는 모음만(5 ids).
- **이유**: `mouth_up/down` 은 입꼬리 올림·내림으로 **입 외형 윤곽** 변형 — mouth_base 소관. `mouth_inner` 는 입 열림 시 노출되는 혀/치아 레이어로 입꼬리 변형에 무관(혀는 올라가지 않음). 저자 의도를 세밀히 구분해 UX 에서도 "base 편집 = 입꼬리 포함" vs "inner 편집 = 모음 변형만" 로 자연스러운 역할 분리. 세션 98 의 "명시 바인딩 = 저자 intent 의 1차 소스" 원칙 적용.

### D4. `face_shadow`/`nose`/`cheek_blush` 를 `head_angle_{x,y,z}` 3개만으로 제한
- **결정**: 머리 회전 + overall 만, face 그룹의 3 head_angle 외 나머지 Face 파라미터 불포함.
- **이유**: 이 파츠들은 **머리 회전을 따라 평행이동하는 정적 레이어** (스타일 선택이 끝난 뒤 애니메이션에 수동적 참여). eye/brow/mouth 그룹 파라미터는 파츠 자체를 변형하지 않아 슬라이더 노출이 혼동만 유발. 3 head_angle + 3 overall = 6 슬라이더로 "이 파츠는 머리 방향만 결정한다" 는 의미를 UX 에 즉각 전달.

### D5. L4 골든 sha256 불변 — 사전 검증 방식
- **결정**: exporter-core + post-processing + exporter-pipeline 소스를 grep("parameter_ids") 해 필드 소비처가 `web-editor-logic` 뿐임을 확인 → 스펙 수정 → golden 29/29 로 재확인.
- **이유**: `part-spec.schema.json` 은 저자 계약 스키마, Cubism 출력(cdi3/model3/physics3/pose3/expressions/motions) 파이프라인은 parameters.json + deformers.json + physics/ + motions/ + expressions/ + textures/ 만 읽음. part spec 의 metadata 확장은 bundle 바이트에 영향 없음. 이를 커밋 전 grep 으로 증명해 "L4 재생성 커밋 필요 여부" 불확실성을 제거 — 세션 98 §5 후속에서 지목된 "실 실험 필요" 를 사전 결정으로 닫음.

### D6. C11 회귀 테스트 리팩터 — 베이스라인 결정화
- **결정**: `stripAllParameterIds(dir)` 헬퍼 + 테스트 2o 의 `parts_with_bindings=0` 하드코딩 제거.
- **이유**: 세션 99 C11 테스트는 "copyV13 직후 parameter_ids 필드 없음" 가정 위에 `parts_with_bindings=1 (ahoge 만)` 을 assertion. 세션 100 이 14 파츠에 opt-in 을 추가하면서 이 가정이 깨짐 — `parts_with_bindings=15` (14 + 1). 해결 옵션 둘: (a) 하드코딩을 14+1=15 로 bump — template 진화마다 테스트 업데이트 필요. (b) 테스트 시작 전 베이스라인 정규화 — template 진화에 불변. (b) 선택. 테스트 의도("copy 직후 옵트인 없음 → ahoge 만 1 bindings") 가 원래 암묵적으로 strip 동작을 기대했음을 명시적으로 구현. 미래 세션 101+ 에서 추가 opt-in 이 들어와도 테스트 재수정 불필요.

---

## 4. 후속 (세션 101+)

- **fullbody v1.0.0 Face 대칭 opt-in** — halfbody v1.3.0 과 동일한 Face 14 파츠 매핑을 fullbody 에도 적용 (하반신 8 파츠는 `leg_sway_phys_l/r`, `cloth_skirt_fuwa` 등과 분리해 별도 세션).
- **Hair / Body / Accessory opt-in** — hair_front/side/back sway 파츠는 substring 매칭이 이미 정확하지만 `cloth_main_fuwa`, `body_breath_phys` 등 bridge 파라미터가 body 카테고리 전 파츠에 섞여 노출 — cloth/body/arm 파츠별 narrow 가 유의미.
- **C12 deformers↔parameters 교차 검증** — 세션 99 §4 에서 지명된 축. `deformers.json` 의 warp 노드가 가리키는 parameter id 검증. physics-lint C11 파일 스캔 패턴 그대로.
- **세션 96 (staging) / 세션 97 (Runtime)** — 대기 유지. 세션 100 은 L4 sha256 불변 + 스키마 호환 확장이라 배포 경로 0 영향.

---

## 5. 인덱스 갱신

- `progress/INDEX.md` §4 세션 로그 세션 100 행 추가 (newest-first).
- §3 Rig & Parts 축에 "halfbody v1.3.0 Face 14 파츠 parameter_ids opt-in (L4 골든 불변)" 추가.
- §3 Frontend 축에 "Face 파츠 선택 시 슬라이더 30→6~8 narrow" 실측 추가.
- §8 다음 3세션 후보 — 세션 101 후보 (fullbody Face 대칭 opt-in 또는 C12 deformers 교차) 롤.
