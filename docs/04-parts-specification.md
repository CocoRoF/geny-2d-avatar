# 04. 파츠 명세 (Parts Specification)

> **한 줄 요약**: 파츠는 **"예쁘게" 가 아니라 "변형 단위" 로** 자른다. 모든 파츠는 슬롯 ID, 앵커, UV 박스, 메타데이터를 갖는 **규격화된 오브젝트**다. AI 는 이 규격을 벗어나면 거부된다.

---

## 1. 파츠 분할 철학 (Partitioning Philosophy)

### 1.1 3가지 분할 기준

파츠는 아래 **3 축의 교집합** 으로 자른다:

1. **움직임 단위(Deformation unit)**: 독립적으로 변형/회전하는가?
2. **표현 단위(Expression unit)**: 독립적으로 교체·재생성되는가? (예: 의상 교체 시)
3. **AI 재생성 단위(AI redesign unit)**: AI 가 독립적으로 다시 그려도 주변과 호환되는가?

세 축 모두에서 **독립적** 이어야 하나의 파츠다. 두 축만 만족하면 한 파츠로 합친다.

### 1.2 너무 잘게 쪼갠 예 (Anti-example)

```
❌ 나쁨: 앞머리를 16개 다발로 자름
   - 움직임 단위: 다발별 독립 (O)
   - 표현 단위: 교체는 보통 "앞머리 전체" 단위 (X)
   - AI 재생성: 인접 다발과 그라디언트/그림자 이어붙이기 지옥 (X)
   → 한 다발만 교체해도 경계 붕괴. 검수 폭증.

✅ 낫다: 앞머리를 3–4 묶음으로
   - 가운데 뭉치, 좌 사이드 다발, 우 사이드 다발(+ 길면 추가 1개)
```

### 1.3 너무 크게 쪼갠 예 (Anti-example)

```
❌ 나쁨: 얼굴을 "face_all" 한 덩어리로
   - 눈/입을 따로 변형할 수 없음
   - blink, mouth open 이 메쉬 한계에 막힘
   - AI 가 얼굴 전체를 다시 그리면 정체성이 날아감

✅ 낫다: face_base + eye_l/r + mouth + brows + nose + face_shadow
```

---

## 2. 파츠 슬롯 카탈로그 (Part Slot Catalog)

### 2.1 Half Body 템플릿의 공식 24 슬롯

> 다른 템플릿은 이 목록을 기반으로 추가/제거. 명칭은 전 템플릿 공통.

| # | slot_id | required | deformation_parent | category |
|---|---|---|---|---|
| 1 | `face_base` | ✅ | `head_pose_rot` | face |
| 2 | `face_shadow` | ✅ | `head_pose_rot` | face |
| 3 | `neck` | ✅ | `neck_warp` | face |
| 4 | `cheek_blush` | ⭕ | `head_pose_rot` | face |
| 5 | `eye_white_l` | ✅ | `eye_l_warp` | eye |
| 6 | `eye_white_r` | ✅ | `eye_r_warp` | eye |
| 7 | `eye_iris_l` | ✅ | `eye_l_warp` | eye |
| 8 | `eye_iris_r` | ✅ | `eye_r_warp` | eye |
| 9 | `eye_lash_upper_l` | ✅ | `eye_l_warp` | eye |
| 10 | `eye_lash_upper_r` | ✅ | `eye_r_warp` | eye |
| 11 | `eye_lash_lower_l` | ⭕ | `eye_l_warp` | eye |
| 12 | `eye_lash_lower_r` | ⭕ | `eye_r_warp` | eye |
| 13 | `brow_l` | ✅ | `head_pose_rot` | brow |
| 14 | `brow_r` | ✅ | `head_pose_rot` | brow |
| 15 | `mouth_base` | ✅ | `mouth_warp` | mouth |
| 16 | `mouth_inner` | ⭕ | `mouth_warp` | mouth |
| 17 | `nose` | ✅ | `head_pose_rot` | face |
| 18 | `hair_front` | ✅ | `hair_front_warp` | hair |
| 19 | `hair_side_l` | ✅ | `hair_side_warp_l` | hair |
| 20 | `hair_side_r` | ✅ | `hair_side_warp_r` | hair |
| 21 | `hair_back` | ✅ | `hair_back_warp` | hair |
| 22 | `torso` | ✅ | `body_visual` | body |
| 23 | `arm_l` | ✅ | `body_visual` | body |
| 24 | `arm_r` | ✅ | `body_visual` | body |
| 25 | `cloth_main` | ✅ | `body_visual` | cloth |
| 26 | `accessory_front` | ⭕ | `accessories_layer` | accessory |
| 27 | `accessory_back` | ⭕ | `accessories_layer` | accessory |

범례: ✅ 필수 · ⭕ 선택

### 2.2 확장 슬롯 (카테고리/템플릿별)

- **Full body**: `leg_l`, `leg_r`, `skirt` (또는 `pants`), `foot_l`, `foot_r`.
- **Feline**: `ear_l`, `ear_r`, `tail`.
- **Glasses**: `glasses_frame`, `glasses_lens`.
- **Mask**: `mask_base`.
- **Props**: `prop_handheld_l`, `prop_handheld_r` (악기, 마법봉 등).

### 2.3 효과(FX) 슬롯 — 별도 채널

캐릭터 본체와 분리되는 마법/빛/연기/소환물 등은 **FX 채널** 로 관리한다. 기본 템플릿에는 포함되지 않으며, 선택적 `fx_pack.*` 로 부착.

| slot_id | 역할 | 노트 |
|---|---|---|
| `fx.aura` | 전신 아우라/오라 | 색 변수 2채널 |
| `fx.light_heart` | 하트형 빛 | on/off + 크기 |
| `fx.light_heal` | 회복 마법 빛 | 녹색 변주 |
| `fx.light_strengthen` | 강화 이펙트 | 이동 파라미터 |
| `fx.smoke` | 연기 | 지속 파라미터 |
| `fx.explosion` | 폭발(charge → burst) | 3단계 |
| `fx.ink_drop` / `fx.wand_ink` | 잉크 낙하/지팡이 잉크 | 색 변주 |
| `fx.summon_rabbit` | 토끼(or 서먼) | 출현/소멸/위치 |

FX 슬롯은 **검수 렌더 기본 포즈셋에서 제외** 되며(08 §4), 별도 `fx_poses` 로 검증한다. Draw order 는 `z_order ≥ 9000` 영역을 예약.

> **레퍼런스**: Cubism 공식 샘플 `mao_pro` 의 FX 구성을 직접 참고했다. 샘플 자체는 저장소에 포함하지 않는다(.gitignore).

### 2.4 mao_pro → 본 프로젝트 슬롯 매핑 (Half Body 기준)

| mao_pro `Part.Id` | mao_pro `Name` | 본 프로젝트 slot_id | 비고 |
|---|---|---|---|
| `PartFace` | 얼굴 | `face_base` | |
| `PartCheek` | 뺨 | `cheek_blush` | |
| `PartNose` | 코 | `nose` | |
| `PartEye` | 눈 | `eye_lash_*`, `eye_white_*` | 눈꺼풀/흰자 분리 |
| `PartEyeBall` | 눈알 | `eye_iris_l/r` | |
| `PartBrow` | 눈썹 | `brow_l/r` | |
| `PartMouth` | 입 | `mouth_base`, `mouth_inner` | 분리 |
| `PartEar` | 귀 | (halfbody 생략) / `ear_l/r` (feline) | |
| `PartNeck` | 목 | `neck` | |
| `PartHairFront` | 앞머리 | `hair_front` | |
| `PartHairSide` | 옆머리 | `hair_side_l/r` | 좌우 분리 강제 |
| `PartHairBack` | 뒷머리 | `hair_back` | |
| `PartHat` | 모자 | `accessory_front` (headwear 서브타입) | |
| `PartHoodie` | 파커 | `cloth_main` | |
| `PartRobe` | 로브 | `cloth_outer` (확장) | |
| `PartLeg` | 다리 | `leg_l/r` (fullbody) | |
| `PartArmLA/LB` | 왼팔 A/B | `arm_l[variant=A|B]` | Pose 3 mutex |
| `PartArmRA/RB` | 오른팔 A/B | `arm_r[variant=A|B]` | |
| `PartWandA/B` | 지팡이 A/B | `prop_handheld_r[variant=A|B]` | |
| `PartHeart` / `PartLight` / `Partaura` / `PartInk` / `PartSmoke` / `PartExplosionLight` / `Part(토끼)` | 하트/빛/아우라/잉크/연기/폭발/토끼 | `fx.*` (§2.3) | 별도 채널 |
| `PartCore` | 코어 | (그룹핑용, 슬롯 없음) | 상위 컨테이너 |
| `PartSketch` | [밑그림] | — | 작업용, 배포 금지 |

**교훈**: mao_pro 는 32개 Part 중 약 11개가 FX 계열이다(전체의 1/3). 효과 비중이 높은 VTuber/마법소녀 프리셋을 지원하려면 FX 채널이 **1급 시민** 이어야 한다.

---

## 3. 파츠 스펙 파일 (Part Spec File) — 예시

각 슬롯은 다음과 같은 spec 파일을 가진다. 이 파일은 AI 생성·후처리·검수 모두가 참조하는 **계약서**다.

```json
// parts/hair_front.spec.json
{
  "slot_id": "hair_front",
  "role": "hair_front",
  "required": true,
  "template": "tpl.base.v1.halfbody",
  "template_version": "^1",
  "deformation_parent": "hair_front_warp",
  "uv_box_px": { "x": 384, "y": 120, "w": 1280, "h": 760 },
  "canvas_px": { "w": 2048, "h": 2048 },
  "anchor": {
    "type": "head_top_center",
    "x_frac": 0.5,
    "y_frac": 0.22,
    "detect_method": "hair_parting_centroid"
  },
  "z_order": 92,
  "visual": {
    "alpha_edge_policy": "feather_2px",
    "line_weight_hint_px": 2.5,
    "color_context": "hair"
  },
  "generation": {
    "prompt_scope": ["hair_style", "hair_color", "bangs_shape"],
    "negative_prompt": ["face", "eyes", "background"],
    "reference_mask": "hair_front_mask.png",
    "max_iter": 3
  },
  "dependencies": ["face_base"],
  "validation": {
    "must_cover_anchor": true,
    "min_alpha_area_frac": 0.05,
    "max_alpha_area_frac": 0.45
  },
  "notes": "앞머리는 고개를 돌릴 때 얼굴보다 살짝 늦게 따라오므로 물리가 관여함."
}
```

### 3.1 스펙 필드 설명

| 필드 | 의미 | 필수 |
|---|---|---|
| `slot_id` | 전역 고유 슬롯 ID | ✅ |
| `template_version` | 이 스펙이 보장하는 템플릿 major 버전 범위 | ✅ |
| `uv_box_px` | AI 생성 결과가 들어가야 할 캔버스 내 박스 | ✅ |
| `anchor` | 자동 정렬에 쓰이는 기준점 (type + 위치 + 탐지 방식) | ✅ |
| `z_order` | 기본 Z 순서 (파라미터로 ±10 내 조정 가능) | ✅ |
| `visual.alpha_edge_policy` | 알파 경계 처리 규칙 | ✅ |
| `visual.color_context` | 후처리 그룹 ID (아래 §5) | ✅ |
| `generation.prompt_scope` | AI 프롬프트에 반영되는 사용자 입력 필드 화이트리스트 | ✅ |
| `generation.negative_prompt` | 이 파츠에서 절대 나오면 안 되는 개념 | ✅ |
| `validation.*` | 검수 자동 거부 조건 | ✅ |

---

## 4. 앵커(Anchor) 시스템

### 4.1 왜 앵커가 핵심인가

AI 는 파츠를 **대략적인 위치** 에 그린다. 같은 "앞머리" 라도 매번 몇 픽셀씩 어긋난다. 리그의 디포머는 **정확한 좌표 기대값**으로 바인딩되어 있으므로, 어긋난 파츠는 움직일 때 "떠 있는" 느낌을 만든다.

해법: 각 파츠에 **"여기가 기준이다"** 앵커를 정의하고, 자동 적합 단계에서 모든 파츠를 해당 앵커 기준으로 재정렬한다.

### 4.2 앵커 타입

| type | 설명 | 탐지 방법 |
|---|---|---|
| `bbox_center` | 바운딩박스 중심 | 알파>0 영역의 중심 |
| `alpha_centroid` | 알파 가중 무게중심 | Σ α·xy / Σ α |
| `eye_pupil_center_l/r` | 눈동자 중심 | 키포인트 모델 |
| `mouth_center` | 입술 중앙 | 키포인트 모델 |
| `nose_tip` | 코 끝 | 키포인트 모델 |
| `head_top_center` | 머리 꼭대기 중앙 | 알파 상한 + 수평 중앙 |
| `hair_parting_centroid` | 앞머리 갈래 중심 | 세그 + 수직 에지 |
| `neck_top_center` | 목 상단 중앙 | 얼굴 하단과 접하는 알파 경계 |
| `shoulder_l/r` | 어깨 꼭지점 | 키포인트 모델 |

### 4.3 앵커 저장 포맷 (Per-Avatar)

```json
// avatars/{id}/anchors.json
{
  "version": 1,
  "canvas": { "w": 2048, "h": 2048 },
  "anchors": {
    "face_base.bbox_center": { "x": 1024, "y": 740 },
    "eye_pupil_center_l": { "x": 900, "y": 720, "confidence": 0.92 },
    "eye_pupil_center_r": { "x": 1148, "y": 720, "confidence": 0.90 },
    "mouth_center": { "x": 1024, "y": 880, "confidence": 0.88 },
    "head_top_center": { "x": 1024, "y": 380, "confidence": 0.95 }
  }
}
```

### 4.4 앵커 보정 로직 (개요)

1. 기대 위치 (템플릿이 말하는 이상적 위치) 로드.
2. 각 파츠의 앵커를 탐지.
3. 탐지 신뢰도 < 0.7 → 자동 적합 실패 → 인간 리뷰 큐.
4. 탐지 성공 → 파츠 PNG 를 기대 위치로 평행이동/스케일 보정.
5. 보정량이 `max_px_shift` 또는 `max_scale_delta` 초과 → 재생성 요청.

상세는 [07-auto-fitting-system.md](./07-auto-fitting-system.md).

---

## 5. 색 문맥(Color Context) 그룹

**같은 context 에 속한 파츠는 함께 색/광원이 통일**되어야 한다. 후처리 [06](./06-post-processing-pipeline.md) 이 이 그룹을 단위로 통계를 맞춘다.

| context | 포함 파츠 |
|---|---|
| `skin` | `face_base`, `neck`, `arm_l`, `arm_r`, `torso` (노출 영역) |
| `hair` | `hair_front`, `hair_side_l/r`, `hair_back` |
| `eye` | `eye_white_l/r`, `eye_iris_l/r`, `eye_lash_*` |
| `mouth` | `mouth_base`, `mouth_inner` |
| `cloth_main` | `cloth_main` (+ 모든 부속 의상) |
| `accessory` | `accessory_*`, `glasses_*`, etc. |
| `shadow` | `face_shadow`, `cheek_blush` |

같은 context 내에서의 **색 통계 목표**:
- 평균 색조(hue) 편차 ≤ 5°
- 채도(saturation) 편차 ≤ 8%
- 그림자 방향(일관 광원각) 오차 ≤ 15°

---

## 6. 명명 규칙 (Naming Conventions)

### 6.1 파츠 파일명

```
parts/{slot_id}.{variant}.{ext}
예)
  parts/hair_front.default.png
  parts/hair_front.v2.png
  parts/cloth_main.uniform_school.png
  parts/cloth_main.uniform_school.alpha.png
```

- `slot_id` 는 스펙과 완전히 일치.
- `variant` 는 같은 슬롯의 대안. "머리만 바꾸기" 같은 시나리오 지원.
- `.alpha.png` 접미사는 **알파 마스크 전용** (후처리 결과 저장용).

### 6.2 식별자 충돌 방지

- 슬롯 ID는 글로벌 유니크.
- 사용자 커스텀 파츠는 네임스페이스: `custom.{org_id}.{slot_id}`.

---

## 7. 파츠 제약 (Part Constraints)

각 파츠는 다음 제약을 **자동 검사** 대상이다. 위반 시 거부/재생성.

### 7.1 기하 제약

- UV 박스를 벗어난 알파 픽셀 0.
- 최소 알파 영역 비율 충족.
- 앵커 위치가 UV 박스 내부.

### 7.2 알파 제약

- 외곽 에지에 "하드 1픽셀 잔여물" 0.
- `feather_2px` 정책 적용 시 2픽셀 페더 존재.
- 구멍(isolated transparent region) ≤ 허용치.

### 7.3 색 제약

- 평균 색이 context 통계 ±허용치.
- 채도가 context 상한 초과 시 경고.

### 7.4 일관성 제약 (cross-part)

- `eye_iris_l` 과 `eye_iris_r` 의 홍채 색 차이 ≤ 허용치.
- `hair_front` 과 `hair_side_*` 의 베이스 컬러 일치도 ≥ 임계.

---

## 8. 파츠 계층 (Hierarchical Relationship)

어떤 파츠들은 **다른 파츠의 존재를 전제**한다. 의존 관계를 스펙에 명시.

```
face_base
├── face_shadow  (depends: face_base)
├── cheek_blush  (depends: face_base)
├── nose         (depends: face_base)
├── brow_l       (depends: face_base)
├── brow_r       (depends: face_base)
├── eye_white_l
│   ├── eye_iris_l          (depends: eye_white_l)
│   ├── eye_lash_upper_l    (depends: eye_white_l)
│   └── eye_lash_lower_l    (optional, depends: eye_white_l)
├── eye_white_r (미러)
└── mouth_base
    └── mouth_inner          (optional, depends: mouth_base)

torso
├── cloth_main   (depends: torso)
├── arm_l        (independent, co-exists with torso)
└── arm_r
```

- 의존 파츠는 상위 파츠 없이 생성 금지.
- 상위 파츠 재생성 시 의존 파츠는 **자동 무효화** (stale 표시).

---

## 9. 변형 호환성 (Deformation Compatibility)

각 파츠는 자신의 디포머에 대해 다음을 **보장**해야 한다.

| 파츠 | 변형 입력 | 보장 |
|---|---|---|
| `eye_white_l/r` | `eye_open_l/r = 0` | 상/하 눈꺼풀이 겹치는 위치까지 변형 시 자가교차 0 |
| `eye_iris_l/r` | `eye_ball_x ∈ [-1,1]` | 흰자(white) 밖으로 나가지 않음 |
| `mouth_base` | `mouth_open = 1` | 치아/구강 보이지 않아야 할 경우 `mouth_inner` 필요 |
| `hair_front` | `head_angle_x = ±30` | 얼굴을 뚫지 않음 |
| `hair_side_*` | `hair_side_sway_* = ±1` | 인접 메쉬와 겹침은 허용하되 틈새(gap) 금지 |
| `cloth_main` | `body_breath ∈ [0,1]` | 자가교차 없이 확장/수축 |

위반은 [08 검수](./08-validation-and-rendering.md) 에서 탐지.

---

## 10. 파츠 메타데이터 스키마 (Part Metadata)

생성된 각 파츠는 다음 메타데이터를 동반한다.

```json
// avatars/{id}/parts/hair_front.meta.json
{
  "slot_id": "hair_front",
  "part_instance_id": "prt_01HXYZ...",
  "avatar_id": "av_01HXYZ...",
  "template_version": "tpl.base.v1.halfbody@1.3.2",
  "created_at": "2026-04-17T10:21:33Z",
  "source": {
    "type": "ai_generated",
    "adapter": "nano-banana@2025-09",
    "seed": 73210,
    "prompt_hash": "sha256:...",
    "reference_parts": ["face_base@v2"]
  },
  "lineage": {
    "parent_part_instance_id": "prt_01HXYY...",
    "operation": "hair_color_change",
    "diff": "cool_brown → ash_silver"
  },
  "geometry": {
    "canvas": { "w": 2048, "h": 2048 },
    "bbox_px": { "x": 380, "y": 122, "w": 1278, "h": 758 },
    "anchor_px": { "x": 1024, "y": 382 }
  },
  "color_stats": {
    "mean_rgb": [184, 162, 139],
    "mean_hsv": [32, 55, 184],
    "dominant_hex": ["#b8a28b", "#7e6a55"]
  },
  "quality": {
    "auto_score": 82,
    "gate_passed": true,
    "issues": []
  }
}
```

---

## 11. 파츠 수명 주기 (Part Lifecycle)

```
  pending ──▶ generating ──▶ generated ──▶ post_processed ──▶ fitted
                                  │                    │
                                  ▼                    ▼
                               failed              needs_review
                                                       │
                                                       ▼
                                                  human_fixed
                                                       │
                                                       ▼
                                                   approved
```

각 상태 전이는 이벤트 브로커로 팬아웃 → 진행상황 스트림.

---

## 12. 파츠 재사용 (Part Reuse)

### 12.1 같은 아바타 내 재사용

- `eye_white_l` 과 `eye_white_r` 은 **같은 소스 + 좌우 반전** 이 기본.
- 완전 대칭이 아닌 캐릭터(상처, 헤테로크로미아)는 `symmetry: false` 플래그로 독립 생성.

### 12.2 아바타 간 재사용 (Library)

- 잘 나온 파츠는 **파츠 라이브러리** 에 등록 (사용자 내부 / 조직 / 퍼블릭).
- 재사용 시 새 아바타의 `face_base` 색 문맥에 맞춰 자동 리컬러.

### 12.3 라이선스 처리

- 파츠는 라이선스 메타를 갖고, 파생 시 상속.
- 상세는 [16-monetization-licensing-ip.md](./16-monetization-licensing-ip.md).

---

## 13. 파츠 에디터(Part Editor)가 기대하는 것

[09-user-interface-ux.md](./09-user-interface-ux.md) 에서 상세. 여기서는 파츠 스펙이 에디터 UX 에 걸려야 하는 약속만 선언:

- 각 슬롯은 사이드바에서 "탭" 으로 등장.
- 각 슬롯마다 **프롬프트 입력창 + 레퍼런스 업로더 + 프리뷰** 가 표준.
- "이 파츠만 재생성" 버튼은 **항상** 보인다.
- 의존 파츠는 상위 파츠 변경 시 "stale" 배지가 뜬다.
- 앵커는 **시각적으로 표시** 되며, 사용자가 수동 조정 가능 (보정 파이프라인의 초기값으로 사용).

---

## 14. 파츠 스펙 버전 & 마이그레이션

- 파츠 스펙도 **SemVer** 를 따른다 (`spec_version`).
- 스펙 필드 추가는 minor, 의미 변경은 major.
- major 변경 시 기존 아바타 파츠는 **다시 검사** (재생성은 아님) 하고, 위반 시 migration 제안.

---

## 15. 파츠 디자인 체크리스트 (For Template Authors)

새 템플릿의 파츠 구성을 짤 때 사용.

- [ ] 각 파츠가 움직임/표현/AI 재생성 3축 모두에서 독립적인가?
- [ ] 같은 역할인데 카테고리가 다른 것은 없는가? (예: 머리끈을 `hair` 대신 `accessory` 로 분리)
- [ ] 모든 필수 파츠에 앵커 타입이 지정되었는가?
- [ ] 대칭 파츠가 선명히 쌍으로 선언되었는가?
- [ ] 의존 파츠가 상위 없이 생성 시도되지 않도록 선언되어 있는가?
- [ ] UV 박스가 겹치지 않는가? (겹침은 후처리 지옥)
- [ ] 테스트 포즈에서 각 파츠가 깨지지 않는지 시뮬레이션했는가?

---

## 16. 열린 질문

- 사용자 커스텀 슬롯(예: "이 캐릭터만의 날개") 허용 범위. 템플릿 파생으로만 허용할지, 파츠 레벨에서도 허용할지.
- 국제화: 파츠 슬롯 이름은 영어 고정. 사용자에게 보이는 레이블만 번역.
- 파츠 단위 저작권 라이선스의 세분화 수준: per-part vs per-avatar.

---

**다음 문서 →** [05. AI 생성 파이프라인](./05-ai-generation-pipeline.md)
