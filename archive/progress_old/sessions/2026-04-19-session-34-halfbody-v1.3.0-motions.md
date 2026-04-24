# 세션 34 — halfbody v1.3.0 파생 모션 (ahoge_bounce + accessory_greet + idle.default 리마스터)

- 날짜: 2026-04-19
- 브랜치/커밋: main · 세션 34
- 워크스트림: **Rig & Parts** (`docs/14 §9`)
- 로드맵: docs/03 §6.2 · `progress/INDEX.md §8` 세션 34 예고

## 1. 목표

세션 31 에서 halfbody v1.3.0 이 저작 완료됐다. 12 PhysicsSetting 이 입력 파라미터
(head_angle_x/y, body_angle_x/y/z, body_breath 등) 로부터 확장 출력 4종
(`ahoge_sway`/`accessory_back_sway`/`accessory_front_sway`/`body_breath_phys`) 을 생성한다.

하지만 물리 체인을 **실제로 구동하는 저작된 모션 커브가 없었다** — 기존 7 모션 팩
(idle.default@1.0.0, idle.sleepy, blink.auto, greet.wave, nod.yes, shake.no, lipsync.mock) 은
v1.2.0 시절 제작되어 확장 파라미터를 의도적으로 자극하지 않는다. 특히 `body_breath_phys`
는 `body_angle_y` 를 2차 입력으로 받는데, 기존 idle.default 는 body_angle_y 를
건드리지 않아 Cubism 기본 breath 와 구분되지 않았다.

이번 세션은 v1.3.0 의 **3 새 PhysicsSetting 각각을 데모하는 모션 3종** 을 추가한다.
핵심 원칙: **모션 커브는 물리 입력 파라미터만 구동** — 확장 출력 4종은 어떤 모션도
직접 키잉하지 않는다. PhysicsSetting 이 2차 흔들림을 전적으로 생성한다.

```
PhysicsSetting          입력 (motion drives)        출력 (physics generates)
─────────────────────────────────────────────────────────────────────────
ahoge_sway_phys         head_angle_x/y + body_angle_x  → ahoge_sway
accessory_sway_phys     body_angle_x + body_angle_z    → accessory_back/front_sway
body_breath_phys        body_breath + body_angle_y     → body_breath_phys
```

## 2. 산출물 체크리스트

- [x] `rig-templates/base/halfbody/v1.3.0/motions/ahoge_bounce.motion.json` — `pack_id=ahoge.bounce@1.0.0`. duration 1.5s, fade_in 0.15s, fade_out 0.2s, loop=false. curves[2]: `head_angle_x` 완만 (0→8→-4→0, 3 segs) + `head_angle_y` 빠른 3회 끄덕 (0→-15→-10→-6→0, 4 segs). curve_count=2 / total_segment_count=7 / total_point_count=9.
- [x] `rig-templates/base/halfbody/v1.3.0/motions/accessory_greet.motion.json` — `pack_id=accessory.greet@1.0.0`. duration 2s, fade_in 0.25s, fade_out 0.35s, loop=false. curves[3]: `body_angle_z` 좌→우→좌 (0→6→-4→4→0, 4 segs) + `body_angle_x` 앞으로 살짝 (0→5→0, 2 segs) + `arm_r_angle` 2회 웨이브 (0→25→5→25→0, 4 segs). curve_count=3 / total_segment_count=10 / total_point_count=13.
- [x] `rig-templates/base/halfbody/v1.3.0/motions/idle_default.motion.json` — `pack_id=idle.default` **1.0.0 → 1.1.0** 리마스터. duration 4s 유지. curves[3→4]: 기존 body_breath/head_angle_x/head_angle_y 유지 + **`body_angle_y` 2 cycle 추가 (±1.5°)**. curve_count 3→4 / total_segment_count 9→13 / total_point_count 12→17. notes 에 "body_breath_phys 유도" 명시.
- [x] `rig-templates/base/halfbody/v1.3.0/template.manifest.json` — `compat.motion_packs` +2: `"ahoge.bounce@^1"` + `"accessory.greet@^1"` (7→9).
- [x] `progress/INDEX.md` — Rig & Parts 행 (모션 팩 9종 명시) · Platform/Infra 행 (세션 34 추가, checked=186) · §4 세션 34 row · §6 릴리스 게이트 (checked=184→186) · §8 다음 3세션 갱신 (34 제거, 37 추가).

## 3. Done 정의 / 검증

| 지표 | 값 |
|---|---|
| `validate-schemas` | **checked=186 / failed=0** (+2 motion fixture, 184→186) |
| `pnpm run test:golden` | **14 step 전부 pass** |
| 기존 회귀 | halfbody v1.2.0 Cubism/web-avatar/bundle-manifest golden · aria 번들 · license-verifier · ai-adapters-fallback · post-processing 85 · ai-adapter-core 68 · rig-template migrate 전부 불변 |

```
$ node scripts/validate-schemas.mjs | tail
[validate] checked=186 failed=0
[validate] ✅ all schemas + rig templates valid

$ pnpm run test:golden | tail
[golden] ✅ all steps pass
```

## 4. 설계 결정 (D1–D5)

### D1. 모션은 물리 **입력** 만 키잉 — 확장 출력은 절대 직접 키잉하지 않음
확장 출력 4종 (`ahoge_sway`, `accessory_back_sway`, `accessory_front_sway`, `body_breath_phys`)
은 모두 `physics_output: true` 로 parameters.json 에 선언됨. 이들은 런타임에 PhysicsSetting
이 계산하는 값이고, 모션 커브가 직접 키잉하면 물리 계산과 충돌 (Cubism SDK 는 last-write
wins 에 가까워 저작 의도와 다른 결과). 저작 규약: **physics_output 은 읽기 전용** — 저자는
입력 파라미터로 의도를 표현하고, PhysicsSetting 이 2차 흔들림을 "번역"한다.

> 바꿀 여지: 디버깅 용도로 확장 출력 직접 키잉 모션을 만들고 싶다면 별도 `motions/_debug/`
> 하위 디렉터리에 두고 compat.motion_packs 에 올리지 않는다.

### D2. head_angle_y 를 깊게 (-15°) 찍어 ahoge_sway 를 가시화
`ahoge_sway_phys` 는 head_angle_x(70w) + head_angle_y(30w) + body_angle_x(20w) 로 합성.
mobility 1.0, delay 0.55, radius 5 로 세션 31 이 저작. Delay 가 0.55 면 입력이 빠르게
변해야 penlum 이 overshoot 해서 아호게가 튄다. head_angle_x 를 완만하게 두고 head_angle_y
를 3회 연속 -15→-10→-6 (점점 얕아지는 바운스) 로 찍으면 아래→위 반동이 누적되어 시각적
"통통 튀는" 효과가 난다. 15° 는 parameters.json 의 head_angle_y range [-30, 30] 의 절반 —
Cubism 표준 VTuber 캘리브레이션 상한보다 작아 안전.

### D3. accessory_greet 은 body_angle_z (좌우 기울임) 가 주 입력
accessory_sway_phys 는 body_angle_x(60w) + body_angle_z(40w) 로 합성. 이 세팅의 교묘한 점은
**2 출력 공유** (accessory_back_sway scale=1.0/weight=80 + accessory_front_sway scale=0.8/weight=70).
body_angle_z 를 좌(6°) → 우(-4°) → 좌(4°) 로 흔들면 뒷 악세서리는 크게, 앞 악세서리는 70%
크기로 함께 흔들려 "인사할 때 리본/귀걸이가 따라 흔들림" 효과. body_angle_x 앞쪽 5° 는
허리를 살짝 숙이는 bow — arm_r_angle 25° 웨이브와 결합해 자연스러운 greet 로 읽힌다.

### D4. idle.default 1.0.0 → 1.1.0 minor bump (breaking 아님)
기존 커브 3 (body_breath, head_angle_x, head_angle_y) 는 **전부 보존** + `body_angle_y` 커브만
추가. 재생 런타임은 새 커브를 무시해도 기존 애니메이션과 동일한 시각 결과 → **semver minor**
가 맞다. pack_id 는 `idle.default` 그대로. compat.motion_packs 의 `idle.default@^1` 은
^1 이 1.x 전체를 받으므로 manifest 변경 불필요.

> 바꿀 여지: 훗날 body_angle_y 가 default idle 에서 시각적으로 과하다고 판단되면 1.2.0
> 에서 amplitude 를 ±1° 로 낮출 수 있다. ±1.5° 는 "무심코 숨쉬며 미세하게 고개 끄덕이는"
> 정도 — 30fps 환경에서 프레임당 0.05° 수준으로 과하지 않다.

### D5. 모션 팩 버전은 **각 파일의 `version`** 이 진실 — manifest 에는 major range
template.manifest.json 의 `compat.motion_packs` 는 `pack_id@^major` 로만 표기한다
(`idle.default@^1`). 실제 구체 버전은 각 `.motion.json` 의 `version` 필드. validate-schemas
는 pack_id 를 추출해 각 파일의 version 이 ^major 를 만족하는지 검사한다. 이 분리 덕분에
idle.default 가 1.0.0 → 1.1.0 으로 올라가도 manifest 는 변경 불필요 — motion 파일만 갱신.

## 5. 여파 — 나머지 세션

- **세션 35 (post-processing Stage 1 확장)**: 영향 없음. close/feather/uv-clip 은 텍스처 레이어.
- **세션 36 (worker/api /metrics)**: 영향 없음. 관측 HTTP 층은 별개.
- **세션 37 (migrator TODO 최종 소진)**: 이번 세션의 모션 추가는 v1.3.0 템플릿 내부 저작 —
  migrator 가 v1.2.0 → v1.3.0 에서 "저자 개입 필요" 로 남기는 physics 재저작 TODO 와는 별개.
  다만 "`MIGRATION_REPORT.md` TODO 최종 소진" 예고를 자연스럽게 상속할 수 있도록 §8 에 37 로 재배치.

## 6. 완료 조건

| 항목 | 상태 |
|---|---|
| ahoge.bounce 모션 저작 | ✅ head_angle_x/y 3회 바운스 |
| accessory.greet 모션 저작 | ✅ body_angle_z + body_angle_x + arm_r_angle 인사 |
| idle.default 1.1.0 리마스터 (body_angle_y 추가) | ✅ body_breath_phys 유도 |
| template.manifest 의 motion_packs +2 | ✅ ahoge.bounce@^1 / accessory.greet@^1 |
| validate-schemas checked=184 → 186 | ✅ |
| golden 14 step 전부 pass | ✅ |

세션 34 완료. 다음은 세션 35 (Post-Processing Stage 1 확장 — close/feather/uv-clip).
