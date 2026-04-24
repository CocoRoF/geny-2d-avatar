# 03. 베이스 리그 템플릿 명세 (Base Rig Template Specification)

> **한 줄 요약**: "베이스 리그" 는 이 프로젝트의 **가장 중요한 재사용 자산** 이다. 파라미터·디포머·파츠 슬롯·물리·모션이 표준화된 "빈 캐릭터 뼈대". AI는 이 뼈대 위에 텍스처만 교체한다.

---

## 1. 왜 리그 템플릿이 존재하는가

### 1.1 문제

1. 리거마다 파츠 구조/네이밍/파라미터 범위가 달라 **캐릭터 간 재사용이 불가능**.
2. 애니메이션 파일 (motion3.json) 이 **파라미터 이름에 바인딩**되어 있어, 네이밍이 다르면 완전히 못 씀.
3. 새 캐릭터마다 처음부터 "blink를 어떻게 표현할까" 를 결정하면 생산성이 사망.

### 1.2 해법

- **"이 파라미터 이름과 범위를 쓰면, 모든 모션·표정·립싱크 에셋이 그대로 호환된다."** 를 보장하는 표준을 제공.
- 템플릿은 **카테고리 + 버전** 으로 관리한다.
- 모든 AI 생성 아바타는 **어떤 템플릿의 어느 버전을 기반으로 하는지** 를 메타에 박아둔다.

---

## 2. 템플릿 카탈로그 (Template Catalog)

### 2.1 초기 릴리스 (β 시점)

| ID | 이름 | 대상 | 비율 | 특징 |
|---|---|---|---|---|
| `tpl.base.v1.chibi` | Chibi Basic | 숏폼/챗봇 | 머리:몸 = 1:1.2 | 얼굴 표정 중심, 상반신 위주 |
| `tpl.base.v1.halfbody` | Half Body Standard | VTuber 기본 | 머리:몸 = 1:2.5 | 상반신, 손 제스처 일부, 립싱크 전체 |
| `tpl.base.v1.fullbody` | Full Body Standard | 게임 NPC | 머리:몸 = 1:6.5 | 전신, 하반신 스윙 물리 |
| `tpl.base.v1.masc_halfbody` | Masculine Half Body | VTuber (남성형) | 머리:몸 = 1:2.7 | 어깨/턱 라인 강조, 골격 프리셋 차이 |
| `tpl.base.v1.feline` | Animal Feline | 마스코트 | 커스텀 | 귀/꼬리 추가 슬롯, 귀 물리 |

### 2.2 템플릿 성장 전략

- β까지 **4–5 템플릿** 만 공식 지원. 더 늘리면 QA 폭증.
- GA 이후 **커뮤니티 템플릿** 을 별도 네임스페이스(`tpl.community.*`) 로 공개.
- 각 템플릿은 **"호환 모션 팩"** 이 명시된 카탈로그를 가진다.

---

## 3. 표준 파라미터 세트 (Standard Parameter Set)

### 3.1 파라미터 네이밍 규칙

- 전부 소문자, 스네이크 케이스.
- 접두사로 그룹: `face_`, `eye_`, `mouth_`, `brow_`, `head_`, `body_`, `hair_`, `cloth_`, `acc_`, `phys_`.
- `_l`, `_r` 는 좌/우. 관찰자 기준이 아니라 **캐릭터 기준**.
- 범위는 기본 `[-1.0, 1.0]` 혹은 `[0.0, 1.0]`. 각도는 도(degree), 선형은 정규화값.

### 3.2 필수 파라미터 (Core — 모든 템플릿 공통)

| 파라미터 | 범위 | 의미 | 기본값 | 비고 |
|---|---|---|---|---|
| `head_angle_x` | [-30, 30] deg | 좌우 회전(고개 돌리기) | 0 | Cubism `ParamAngleX` 매핑 |
| `head_angle_y` | [-30, 30] deg | 상하 회전(끄덕임) | 0 | `ParamAngleY` |
| `head_angle_z` | [-30, 30] deg | 기울기(갸웃) | 0 | `ParamAngleZ` |
| `body_angle_x` | [-10, 10] deg | 상반신 좌우 회전 | 0 | 전신 템플릿은 ±15 |
| `body_breath` | [0, 1] | 호흡 | 0 | 자동 루프 바인딩 |
| `eye_open_l` | [0, 1] | 왼쪽 눈 개폐 | 1 | 1=완전 열림 |
| `eye_open_r` | [0, 1] | 오른쪽 눈 개폐 | 1 | |
| `eye_smile_l` | [0, 1] | 왼쪽 눈웃음 | 0 | |
| `eye_smile_r` | [0, 1] | 오른쪽 눈웃음 | 0 | |
| `eye_ball_x` | [-1, 1] | 시선 좌우 | 0 | |
| `eye_ball_y` | [-1, 1] | 시선 상하 | 0 | |
| `brow_l_y` | [-1, 1] | 왼 눈썹 상하 | 0 | |
| `brow_r_y` | [-1, 1] | 오 눈썹 상하 | 0 | |
| `brow_l_angle` | [-1, 1] | 왼 눈썹 기울기 | 0 | |
| `brow_r_angle` | [-1, 1] | 오 눈썹 기울기 | 0 | |
| `mouth_open` | [0, 1] | 입 개폐 | 0 | 립싱크 주입력 |
| `mouth_form` | [-1, 1] | 입 모양 (미소–찌푸림) | 0 | |
| `mouth_vowel_a` | [0, 1] | 모음 A | 0 | 립싱크용 |
| `mouth_vowel_i` | [0, 1] | 모음 I | 0 | |
| `mouth_vowel_u` | [0, 1] | 모음 U | 0 | |
| `mouth_vowel_e` | [0, 1] | 모음 E | 0 | |
| `mouth_vowel_o` | [0, 1] | 모음 O | 0 | |

### 3.3 확장 파라미터 (Extension — 템플릿별로 추가 가능)

| 파라미터 | 범위 | 적용 템플릿 | 용도 |
|---|---|---|---|
| `hair_front_sway` | [-1, 1] | all | 앞머리 흔들림 |
| `hair_side_sway_l` | [-1, 1] | all | 옆머리 왼쪽 |
| `hair_side_sway_r` | [-1, 1] | all | 옆머리 오른쪽 |
| `hair_back_sway` | [-1, 1] | halfbody/fullbody | 뒷머리 |
| `cloth_chest_phys` | [-1, 1] | halfbody/fullbody | 가슴/옷자락 물리 |
| `cloth_skirt_sway` | [-1, 1] | fullbody | 치마 |
| `acc_earring_l` | [-1, 1] | optional | 귀걸이 물리 |
| `acc_tail_sway` | [-1, 1] | feline | 꼬리 |
| `acc_ear_angle_l` | [-30, 30] deg | feline | 왼쪽 동물 귀 |
| `acc_ear_angle_r` | [-30, 30] deg | feline | 오른쪽 동물 귀 |
| `cheek_blush` | [0, 1] | all | 뺨 홍조 |
| `face_shadow` | [0, 1] | all | 얼굴 음영 (각도용) |

### 3.4 금기 파라미터 (Anti-patterns)

다음 네이밍은 **금지**:
- 일본어/한국어 원문 네이밍 (`顔X`, `얼굴각도X`) — 국제화/검색성 문제.
- 대문자/캐멀 케이스 (`EyeOpenL`) — 외부 SDK 연동 시 혼동.
- 단수 표기 누락 (`eye_open` 대신 `eye_open_l/r` 분리 강제).
- 1:1 비례가 아닌 범위 (`[0, 100]`) — 정규화 깨짐.

---

## 4. 디포머 계층 (Deformer Hierarchy)

### 4.1 표준 계층 구조

```
root
├── breath_warp              (body_breath)
│   └── body_pose_warp       (body_angle_x)
│       ├── body_visual       (상반신 파츠 묶음)
│       │   ├── arm_l
│       │   ├── arm_r
│       │   ├── torso
│       │   └── cloth_main
│       └── neck_warp
│           └── head_pose_rot  (head_angle_x/y/z)
│               └── head_visual
│                   ├── face_base
│                   ├── face_shadow
│                   ├── cheek_layer
│                   ├── eyes_group
│                   │   ├── eye_l_warp   (eye_open_l, eye_ball_*)
│                   │   └── eye_r_warp   (eye_open_r, eye_ball_*)
│                   ├── brows_group
│                   ├── mouth_warp       (mouth_*)
│                   ├── nose_layer
│                   ├── hair_front_warp  (hair_front_sway + head pose)
│                   ├── hair_side_warp_l
│                   ├── hair_side_warp_r
│                   └── accessories_layer
└── hair_back_warp           (하반신과 같은 좌표계, 뒤에 배치)
```

### 4.2 원칙

- **디포머의 자식은 하나의 기능 단위**. "얼굴" 하위에 팔이 들어오지 않는다.
- **좌우 대칭은 별도 디포머**. `eye_l_warp`, `eye_r_warp` 를 섞지 않는다. 립싱크 같은 대칭 동작도 파라미터 레벨에서 합산.
- **머리 pose warp 이 모든 머리 파츠의 조상**. 고개를 돌리면 머리 전체가 따라온다.
- **뒷머리는 머리 pose warp 의 자식이 아니다**. 몸 좌표계 근처에 두고 별도 물리로 처리 (회전 시 지연).

### 4.3 디포머 타입 규약

| 타입 | 용도 | 파라미터 수 제한 |
|---|---|---|
| Rotation Deformer | 회전 축 (머리, 어깨, 귀 등) | 1–2 |
| Warp Deformer | 자유 변형 (얼굴 각도, 립싱크 혼합) | 1–4 |
| Glue (연결점) | 인접 메쉬 연결 | 0 |

---

## 5. 메쉬(Mesh) 규약

### 5.1 기본선

- 각 파츠는 **자기 고유 메쉬** 를 가진다. 공용 메쉬 금지 (AI 재설계 교체 단위와 불일치).
- 메쉬 정점 수 가이드:
  - 얼굴 베이스: 120–180
  - 눈알/홍채: 30–60
  - 입: 80–140
  - 앞머리 다발: 다발당 40–80
  - 옷 주요 영역: 100–200
- 정점이 너무 많으면 AI 생성물의 경계 노이즈가 메쉬에 그대로 각인된다.

### 5.2 UV & 해상도

- 표준 캔버스: **2048×2048** (HD), **4096×4096** (마켓 프리미엄).
- 캔버스 좌표계 원점: 좌상단, Y 아래 양수 (PSD 관례와 일치).
- 각 파츠의 UV는 템플릿이 미리 정의한 **고정 박스** 안에 위치. AI 생성 시 이 박스를 벗어나면 거부.

### 5.3 레이어 Z-순서 (Draw Order)

```
  (뒤)                                                 (앞)
  hair_back → body_back → arm_back → torso →
  cloth_main → arm_front → neck → face_shadow →
  face_base → cheek → eyes → brows → nose →
  mouth → hair_side → hair_front → accessories_front
```

각 레이어는 파라미터로 Z 인덱스를 **+/-10 범위 내로만** 미세 조정 가능.

---

## 6. 모션·물리 표준 (Motion & Physics Standard)

### 6.1 공통 제공 모션 팩

모든 템플릿은 아래 모션 팩을 기본 제공하고, 파라미터 이름이 일치하므로 **모든 아바타에 그대로 적용된다**.

| 팩 | 길이 | 내용 |
|---|---|---|
| `idle.default` | 4s loop | 호흡, 미세한 고개 흔들림 |
| `idle.sleepy` | 6s loop | 느린 호흡, 눈 반쯤 감김 |
| `blink.auto` | 트리거 | 3–6초 랜덤 간격으로 blink |
| `greet.wave` | 2s | 손 흔들기 (half/full body만) |
| `nod.yes` | 1s | 끄덕임 |
| `shake.no` | 1s | 좌우 흔들기 |
| `lipsync.mock` | 가변 | 데모용 입 모양 시퀀스 |

### 6.2 물리 파일 규약

- `physics3.json` 의 물리 입력은 `head_angle_*`, `body_angle_*`, `body_breath` 만 사용.
- 출력 파라미터는 `*_sway`, `*_phys`, `*_fuwa` 접미사만. 좌우 분리 시 `_l` / `_r` 뒤붙임 허용. (`_fuwa` 는 halfbody v1.2.0 / 세션 07 부터 공식 도입 — Live2D 의 볼륨 파라미터 명칭에서 차용.)
- **Base family 별 추가 제약 (세션 49, ADR 0005 L2)** — rig-template-lint C10 은 family 별 rule 테이블 (`scripts/rig-template/rig-template-lint.mjs` `FAMILY_OUTPUT_RULES`, 세션 110 이전 이름 `physics-lint.mjs`) 을 적용:
  - `halfbody` / `masc_halfbody`: 접두사 `leg_`, `foot_`, `skirt_`, `tail_` **금지** (상반신 템플릿에 하반신 물리는 불일치 증거). C10-forbidden 으로 기계 차단.
  - `chibi` / `fullbody` / `feline` / `custom`: 금지 접두사 없음. 접미사는 동일(`_(sway|phys|fuwa)(_[lr])?$`).
  - 새 family 추가 시 lint 는 explicit error — 반드시 rule 등록 PR 수반.
- 진동 감쇠(damping), 바람(wind) 프리셋 3단계 제공: `light / normal / heavy`.
- 커스텀 물리는 템플릿 파생(fork)에서만 허용, 원본 템플릿 수정 금지.

#### 물리 설정 벤치마크 (mao_pro 기준)

mao_pro 의 `physics3.json` 은 **16개 PhysicsSetting, 43 입력 / 20 출력 / 33 정점, 30 fps, 중력 (0, -1)** 구성이다. 이를 halfbody v1 표준 물리 팩의 **상한 기준선** 으로 삼는다:

| 범주 | 설정 수 | 예시 이름 |
|---|---|---|
| 머리 흔들림 | 4 | 앞 / 가로 / 뒤 / 뒤 L-R |
| 머리 볼륨 (Fuwa) | 3 | 앞 / 옆 / 뒤 |
| 머리 메쉬 | 1 | 메쉬 흔들림 |
| 모자/헤드웨어 | 4 | 창 / 리본 / 깃털 / 위 |
| 넥웨어 | 2 | 파카끈 / 목 장식 |
| 아우터 (로브/치마) | 2 | 로브 흔들림 / 로브 볼륨 |

표준 `normal` 프리셋은 이 16개 중 **머리 8 + 옷 4 = 12개** 를 기본 on 으로, 나머지는 템플릿 파생에서 활성화한다.

**현재 구현 진행(halfbody v1.x)**:

| 버전 | PhysicsSetting 수 | 커버 범주 | 남은 범주 |
|---|---|---|---|
| v1.0.0 / v1.1.0 | 3 | 머리 sway(front / side 공유 / back) | Fuwa, cloth, ahoge, accessory, body_breath_phys |
| **v1.2.0 (세션 07)** | **9** | 머리 sway 4(side L/R 분리) + Fuwa 5(hair 4 + cloth_main) | ahoge_sway, accessory_sway, body_breath_phys |
| v1.3.0 migrator (세션 27) | 9 → 12 목표 | 자동 parameters/cubism_mapping 확장 (`ahoge_sway`, `accessory_back_sway`, `accessory_front_sway`) | 실 PhysicsSetting 저작 + `ahoge.spec.json` + deformers — `MIGRATION_REPORT.md` TODO |
| **v1.3.0 authored (세션 31)** | **12** ✅ | + `ahoge_sway_phys` / `accessory_sway_phys`(출력 2 공유) / `body_breath_phys`. `ahoge` 파츠 + `ahoge_warp` + `accessory_{back,front}_warp` 분기 + `body_breath_phys` 파라미터 추가 | — (mao_pro 12/12 달성) |

### 6.3 립싱크 표준

- 실시간 입력: 마이크 → vowel estimator → `mouth_vowel_a/i/u/e/o + mouth_open`.
- 오프라인 입력: TTS 포넘/phoneme 타임라인 → 매핑표.
- 매핑표는 `lipsync_mapping.v1.json` 로 외부화, 언어별 지역화 가능.

---

## 7. 템플릿 버전 관리 (Versioning)

### 7.1 규칙

- Semantic Versioning: `tpl.base.v{major}.{minor}.{patch}`
  - `major`: 파라미터 이름/축 의미 변경 (호환 깨짐).
  - `minor`: 파라미터 추가, 기본값 변경 등 상위 호환.
  - `patch`: 버그 수정, 물리 튜닝.
- 동일 major 내에서만 **기존 아바타를 새 템플릿으로 "업그레이드"** 가능.
- major 가 바뀌면 마이그레이션 스크립트가 필요.

### 7.2 호환성 테이블

각 템플릿은 호환 테이블을 `compatibility.json` 에 게시:

```json
{
  "template_id": "tpl.base.v1.halfbody",
  "version": "1.3.2",
  "motion_packs": ["idle.default@^1", "blink.auto@^1"],
  "physics": "physics.v1",
  "lipsync_mapping": "lipsync_mapping.v1.*",
  "export_targets_supported": ["cubism@5", "web-sdk@0.3", "unity@2022lts"]
}
```

### 7.3 디프리케이션 정책

- 새 major 공개 후 기존 major 는 **18개월** 유지.
- 그 사이 자동 마이그레이션 제공. 수동 확인 단계 포함.

---

## 8. 템플릿 저장소 구조 (Repository Layout)

템플릿은 일반 코드 저장소처럼 버전 관리된다.

```
rig-templates/
└── base/
    └── halfbody/
        └── v1.3.2/
            ├── template.manifest.json       ← 메타
            ├── parameters.json              ← 파라미터 스펙
            ├── deformers.json               ← 디포머 트리
            ├── parts/
            │   ├── face_base.spec.json
            │   ├── eye_l.spec.json
            │   └── ... (24 파츠)
            ├── mesh/
            │   ├── face_base.mesh.json
            │   └── ...
            ├── physics/
            │   └── physics.json
            ├── motions/
            │   ├── idle.default.json
            │   └── ...
            ├── test_poses/
            │   └── validation_set.json      ← 검수 렌더 입력
            └── README.md
```

---

## 9. 파츠 슬롯 표준 (Part Slot Standard)

파츠 슬롯은 "템플릿이 기대하는 파츠 자리" 이다. AI 생성 결과는 반드시 이 슬롯에 맞춰 생성되어야 한다.

### 9.1 Half Body 템플릿 기준 슬롯 (24개)

> 상세 명세/앵커는 [04-parts-specification.md](./04-parts-specification.md).

```
[얼굴]
  face_base, face_shadow, neck
[눈]
  eye_white_l, eye_white_r
  eye_iris_l, eye_iris_r
  eye_lash_upper_l, eye_lash_upper_r
  eye_lash_lower_l, eye_lash_lower_r
[눈썹]
  brow_l, brow_r
[입 & 코]
  mouth_base, mouth_inner, nose
[머리]
  hair_front, hair_side_l, hair_side_r, hair_back
[몸]
  torso, arm_l, arm_r, cloth_main
[선택]
  accessory_front, accessory_back
```

### 9.2 슬롯 메타

각 슬롯은 다음을 가진다:

- **역할(role)**: `face_base`, `hair_front`, ...
- **필수여부(required)**: true/false
- **앵커(anchor)**: 정렬 기준점 (정중앙 / 눈동자 중심 / 입 중앙 등)
- **UV 박스**: 이 파츠가 차지할 캔버스 영역
- **변형 규약**: 어떤 디포머의 자식인지
- **의존(depends)**: 예) `eye_iris_l` 은 `eye_white_l` 없으면 무의미

---

## 10. 기대 품질 지표 (Template Quality SLOs)

모든 공식 템플릿은 릴리스 전 아래 검증을 통과해야 한다.

| 검증 | 방법 | 합격선 |
|---|---|---|
| blink 양끝 자연스러움 | `eye_open_* ∈ {0, 1}` 시각 평가 + 메쉬 자가교차 탐지 | 자가교차 0, 주관 평가 ≥ 4/5 |
| 고개 회전 30° 한계 | `head_angle_x = ±30` 에서 옆머리 겹침/얼굴 뚫림 | 뚫림 0 |
| 립싱크 모음 5종 | 다섯 모음 전부 구분 가능 | 주관 평가 ≥ 4/5 |
| 모션 팩 상호작용 | idle + blink + lipsync 동시 | 끊김/점프 0 |
| 물리 복원 | head_angle_x 30 → 0 후 옆머리가 1.5s 내 정지 | 만족 |

---

## 11. 템플릿 파생(Fork) 규약

유료 사용자/엔터프라이즈는 공식 템플릿을 파생해 내부 전용으로 쓸 수 있다.

### 11.1 허용되는 변경

- 파츠 슬롯 추가 (예: 안경 슬롯).
- 파라미터 확장 (필수 파라미터는 유지).
- 물리 튜닝.

### 11.2 금지되는 변경

- 필수 파라미터 이름 변경.
- 기존 슬롯 제거.
- 표준 모션 팩 깨뜨리기.

파생 템플릿은 `tpl.custom.{orgId}.{name}.v{…}` 네임스페이스.

---

## 12. 외부 포맷과의 매핑

- **Cubism**: 파라미터는 1:1 매핑, 네이밍만 `Param` 접두어 추가 (`ParamAngleX`).
- **Spine**: 본 중심 구조라 매핑이 일부 손실. 우선순위 낮음. 필요 시 별도 어댑터.
- **Web SDK (`@geny/web-avatar`)**: 그대로 사용 (내부 SDK이므로 강제 매핑).
- **Unity/Unreal**: Cubism 네이티브 플러그인 경유. 우리 리그는 그대로 보존.

### 12.1 Cubism 공식 샘플 (`mao_pro`) 를 기준선으로

Live2D 공식 샘플 **`니지이로 마오 (Pro Version)`** 은 우리 `halfbody` 템플릿의 **실측 기준선(benchmark reference)** 이다. 공개 라이선스상 상용 배포는 불가하므로 **저장소에 포함되지 않는다(.gitignore)**. 사내 개발/검수에서만 외부 설치로 참조한다.

#### 매핑 테이블 (핵심 파라미터)

| 본 프로젝트 (snake_case) | Cubism (`ParamXxx`) | 범위 예 | 비고 |
|---|---|---|---|
| `head_angle_x` | `ParamAngleX` | [-30, 30] | 2D 조이스틱 대응 쌍 |
| `head_angle_y` | `ParamAngleY` | [-30, 30] | 상동 |
| `head_angle_z` | `ParamAngleZ` | [-30, 30] | |
| `body_angle_x/y/z` | `ParamBodyAngleX/Y/Z` | [-10, 10] | |
| `body_breath` | `ParamBreath` | [0, 1] | |
| `eye_open_l/r` | `ParamEyeLOpen` / `ParamEyeROpen` | [0, 1] | EyeBlink 그룹 |
| `eye_smile_l/r` | `ParamEyeLSmile` / `ParamEyeRSmile` | [0, 1] | |
| `eye_form_l/r` | `ParamEyeLForm` / `ParamEyeRForm` | [-1, 1] | 눈 모양 차분 |
| `eye_ball_x/y` | `ParamEyeBallX` / `ParamEyeBallY` | [-1, 1] | |
| `eye_ball_form` | `ParamEyeBallForm` | [0, 1] | 동공 축소 |
| `brow_l/r_y` | `ParamBrowLY` / `ParamBrowRY` | [-1, 1] | |
| `brow_l/r_x` | `ParamBrowLX` / `ParamBrowRX` | [-1, 1] | |
| `brow_l/r_angle` | `ParamBrowLAngle` / `ParamBrowRAngle` | [-1, 1] | |
| `brow_l/r_form` | `ParamBrowLForm` / `ParamBrowRForm` | [-1, 1] | 차분 형상 |
| `mouth_vowel_a/i/u/e/o` | `ParamA` / `ParamI` / `ParamU` / `ParamE` / `ParamO` | [0, 1] | |
| `mouth_up/down` | `ParamMouthUp` / `ParamMouthDown` | [0, 1] | 입꼬리 |
| `mouth_angry` | `ParamMouthAngry` | [0, 1] | 부은 입 |
| `hair_front_sway` | `ParamHairFront` | [-1, 1] | 물리 출력 |
| `hair_side_sway_l/r` | `ParamHairSideL` / `ParamHairSideR` | [-1, 1] | |
| `hair_back_sway` | `ParamHairBack` | [-1, 1] | |
| `hair_front_fuwa` | `ParamHairFrontFuwa` | [0, 1] | 볼륨(세션 07, v1.2.0~) |
| `hair_side_fuwa_l/r` | `ParamHairSideFuwaL` / `ParamHairSideFuwaR` | [0, 1] | |
| `hair_back_fuwa` | `ParamHairBackFuwa` | [0, 1] | |
| `cloth_main_fuwa` | `ParamClothMainFuwa` | [0, 1] | 의상 볼륨 |
| `overall_x/y` | `ParamOverallX` / `ParamOverallY` | [-1, 1] | 프레이밍 변환 |
| `overall_rotate` | `ParamOverallRotate` | [-30, 30] | |

#### mao_pro 에서 학습한 추가 패턴 (템플릿에 흡수)

1. **파라미터 그룹(Parameter Groups)**: Cubism 은 CDI 파일로 파라미터를 UI 그룹(`얼굴`, `눈`, `눈썹`, `입`, `몸`, `왼팔A/B`, `오른팔A/B`, `전체`, `흔들림`) 으로 묶는다. 우리 `parameters.json` 에 `group_id` 필드를 추가해 동일한 그룹핑을 편집기에 노출한다.
2. **CombinedParameters (2D 조이스틱)**: mao_pro 는 `(AngleX, AngleY)` / `(AllX, AllY)` 를 2D 짝으로 선언한다. 우리 스펙에도 `combined_axes: [["head_angle_x","head_angle_y"], ["overall_x","overall_y"]]` 필드를 추가.
3. **A/B 팔 세트 (대체 포즈)**: mao_pro 는 왼팔/오른팔에 A/B 두 세트를 둔다 (포즈 교체용). 우리 템플릿은 `arm_l` / `arm_r` 를 두되, **`arm_pose_variant` (0=A, 1=B)** 를 도입해 향후 슬롯 `arm_l[variant=A|B]` 로 확장한다. Pose3 의 **mutex 그룹** 을 활용해 동시 노출을 막는다.
4. **볼륨(Fuwa) 파라미터**: `ParamHairFrontFuwa`, `ParamHairSideFuwa`, `ParamHairBackFuwa`, `ParamRobeFuwa` 는 머리/옷의 볼륨을 동적으로 부풀리는 차분. 우리 확장 세트는 **`*_fuwa` 접미사를 그대로 채택** 하며(halfbody v1.2.0 / 세션 07 부터), 범위는 `[0, 1]`, `physics_output=true`, 주 입력은 `body_breath` + 방향 수정자. 현재 구현: `hair_front_fuwa`, `hair_side_fuwa_l/r`, `hair_back_fuwa`, `cloth_main_fuwa` (5종).
5. **효과(FX) 파라미터 채널**: mao_pro 는 마법/잉크/폭발/토끼/아우라/빛 같은 **연출 효과** 를 별도 파라미터·파츠로 관리한다. 우리 템플릿은 **`fx.*` 네임스페이스** (예: `fx.heart.on`, `fx.aura.color1`) 를 예약하고, `parameters.json` 에서 `channel: "effect"` 로 태깅해 기본 검수 렌더에서 제외한다.
6. **오버올(Overall) 변환**: `ParamAllX/Y/Rotate` 로 아바타 전체 이동/회전을 지원. 우리 표준에도 `overall_x`, `overall_y`, `overall_rotate` 를 공통 확장으로 추가(카메라워크 없이 런타임에서 화면 내 프레이밍).
7. **HitAreas**: Cubism 은 `HitAreaHead`, `HitAreaBody` 같은 히트 영역 메타를 선언한다. 우리 `template.manifest.json` 에 `hit_areas: [{id, role, bound_to_part}]` 필드를 추가해 Web SDK 의 인터랙션 이벤트로 노출.
8. **표정(exp3) Blend 모드**: `Add` / `Multiply` / `Overwrite` 3종. 우리 표정 포맷(`expression.v1.json`) 에 `blend` 필드를 동일하게 지원.
9. **LipSync 그룹의 대표 입력**: Cubism 샘플은 `LipSync` 그룹에 `ParamA` 단 하나만 연결한다(간이 립싱크). 우리 표준은 **정밀 모드(5 모음)** 를 기본으로 하되, 간이 모드 호환을 위해 **`mouth_open = max(a,i,u,e,o) × k`** 변환기를 SDK 에 포함한다.

> mao_pro 의 파라미터 총 수는 **131개, 19개 그룹** 이다. 우리 `halfbody` v1 의 **필수 코어는 28개, 확장 포함 약 60–70개** 를 목표로 한다. 효과/연출 채널을 별도 팩으로 분리해 기본 템플릿의 러닝 커브를 낮춘다.

---

## 13. 템플릿 작성 가이드 (For Contributors)

템플릿 기여자(내부 아티스트, 추후 커뮤니티)를 위한 체크리스트:

1. `parameters.json` 에 **정확한 범위와 기본값**을 쓴다.
2. 파츠 슬롯마다 **샘플 PNG** 를 함께 첨부 (AI 생성 참조용).
3. `test_poses/validation_set.json` 을 만들어 검수 렌더러가 돌릴 포즈를 선언한다.
4. 물리는 **light/normal/heavy** 프리셋 3개 모두 동작해야 한다.
5. `README.md` 에 템플릿의 "의도한 인상(intended vibe)" 을 한 단락으로 기술한다 (AI 프롬프트 엔진이 이를 참조).

### 13.1 커밋 조건 — 저작 게이트 (ADR 0005)

템플릿 변경을 커밋하기 전에 **반드시 다음 lint 들이 모두 pass 되어야 한다** (ADR 0005 L2 `rig-template-lint fatal` 계층). 실패는 경고 아닌 **차단** — warning 등급은 없다.

- `pnpm run lint:rig-template -- <path>` (또는 `scripts/rig-template/rig-template-lint.mjs <path>`, 세션 110 이전 이름 `physics-lint.mjs`):
  - §6.2 물리 파일 규약의 10 규칙(C1~C10) + `parts/*.spec.json.parameter_ids` ↔ `parameters.json` (C11, 세션 99) + `deformers.json.nodes[].params_in` ↔ `parameters.json` (C12, 세션 108) + deformer 트리 무결성(C13 = duplicate / root-missing / root-parent / parent-missing / non-root-null-parent / cycle / orphan, 세션 109) + `parts/*.spec.json.deformation_parent` ↔ `deformers.json.nodes[].id` (C14, 세션 112 — C11+C12+C13 사각형 완결) 을 검증. **C10 은 base family 별 분리** (세션 49 — C10-suffix regex `_(sway|phys|fuwa)(_[lr])?$` + halfbody 계열에 한해 C10-forbidden 하반신 접두사 4종 차단). `--family <name>` 로 override 가능.
- `pnpm run test:golden` 의 `rig-template migrate` step — 새 major 시 마이그레이터 chain 이 clean run.
- 저작 판단이 들어가는 값(물리 weight/delay/mobility, 메쉬 vertex, 모션 커브 타이밍, 파츠 이미지) 은 lint 대상이 아니지만, 저작 결과물 자체가 **반드시 위 lint 를 통과한 상태**로 커밋돼야 한다.

ADR 0005 의 L1 (migrator auto-patch) / L3 (저자 판단) / L4 (파이프라인 불변식) 도 참고. L4 의 `textureOverrides` path 불변성은 [`docs/06 §4`](./06-post-processing-pipeline.md#4-stage-1--alpha-sanitation) 와 [`ADR 0005`](../progress/adr/0005-rig-authoring-gate.md) 에서 상세화.

---

## 14. 열린 질문 (Open Questions)

- 인종/체형 다양성을 "다른 템플릿" 으로 나눌지, 같은 템플릿의 "프리셋" 으로 나눌지. β 전 결정.
- 템플릿 마켓플레이스 오픈 시기와 심사 기준은 16-monetization 에서 확정.
- "템플릿 + 스타일" 을 묶은 프리셋 상품(번들)의 가격 구조.

---

**다음 문서 →** [04. 파츠 명세](./04-parts-specification.md)
