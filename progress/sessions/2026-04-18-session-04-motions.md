# Session 04 — Halfbody v1 Motion Packs + Test Poses

- **Date**: 2026-04-18
- **Workstreams**: Rig & Parts, Data
- **Linked docs**: `docs/03 §6.1`, `docs/08 §3`
- **Linked ADRs**: `progress/adr/0002`, `progress/adr/0003`

---

## 1. 목표 (Goals)

- [x] `schema/v1/motion-pack.schema.json` 신규 — Cubism `motion3.json` 구조의 snake_case 화, segments 는 수치 배열.
- [x] `schema/v1/test-poses.schema.json` 신규 — `validation_set.json` 구조 정의 (poses[] = id + 파라미터 맵).
- [x] 모션 팩 7종 (`motions/*.motion.json`) — 매니페스트 `compat.motion_packs` 와 1:1. 각 파일 schema 통과.
- [x] 표준 20 포즈 `test_poses/validation_set.json` — docs/08 §3.1 16 행(모음 5개 전개 포함) 에 맞춰 halfbody 파라미터로 정합.
- [x] `validate-schemas.mjs` 확장 — 모션/테스트 포즈 로드, pack_id ↔ 매니페스트 compat, 포즈 param ∈ parameters.json range.

## 2. 사전 맥락 (Context)

- docs/03 §6.1: 공통 모션 팩 7종(`idle.default` / `idle.sleepy` / `blink.auto` / `greet.wave` / `nod.yes` / `shake.no` / `lipsync.mock`). 매니페스트의 `compat.motion_packs` 에 이미 이 7종이 선언됨.
- docs/08 §3.1: 표준 테스트 포즈 16 행(모음 5개 포함 시 20 포즈). 검수 렌더러의 기본 입력.
- mao_pro `mtn_01.motion3.json` 구조 : Version=3, Meta(duration/fps/fade/loop/count), Curves[].Segments 는 Cubism segment encoding(초기점 + 세그먼트 타입별 가변 길이 숫자 배열).
- 현재 템플릿 `parameters.json` 에 `mouth_form`·`mouth_open` 은 없음 — docs/08 의 해당 포즈는 `mouth_up` / `mouth_vowel_a` 로 대체. 차후 v1.1.0 에서 포즈 ID 그대로 두고 파라미터명 정합.
- 매니페스트 파일: `motions_dir: "motions/"`, `test_poses_file: "test_poses/validation_set.json"` (경로 선언만 존재, 파일 부재).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 모션 스키마 | `schema/v1/motion-pack.schema.json` | Cubism motion3 snake_case. curves 의 target ∈ {parameter, part_opacity}. | ✅ |
| 테스트 포즈 스키마 | `schema/v1/test-poses.schema.json` | poses[] = {id, description?, params} 구조. | ✅ |
| 모션 7종 | `rig-templates/base/halfbody/v1.0.0/motions/*.motion.json` | 각 파일 schema 통과, pack_id 가 매니페스트 compat 에 있음, curve param_id 가 파라미터에 존재. | ✅ |
| 테스트 포즈 | `rig-templates/base/halfbody/v1.0.0/test_poses/validation_set.json` | 20 포즈(common 16 행 + mouth vowel 5 전개). 각 param 이 파라미터에 존재하고 range 내. | ✅ |
| 검증기 확장 | `scripts/validate-schemas.mjs` | 모션 + 포즈 로드 · 교차 검증 추가. | ✅ |

## 4. 결정 (Decisions)

- **D1 (파일명 규약)**: `{category}-{variant}.motion.json` 대신 내부 snake_case 형태 `{category}_{variant}.motion.json` (매니페스트 pack id 의 `.` 를 `_` 로 치환) — 프로젝트 JSON 파일 naming 규약과 일치. `idle.default` → `idle_default.motion.json`.
- **D2 (segments 원본 유지)**: segments 는 Cubism 인코딩 그대로(type + time/value 숫자 배열). 스키마는 배열 크기/내용 semantic 검증을 하지 않고 number 배열로만 둠. 세맨틱 검증은 validator 의 수치 체크나 별도 도구로 뒤로 밀어 적용.
- **D3 (`greet.wave` 플레이스홀더)**: halfbody v1.0.0 파라미터에 arm 회전 축이 없으므로 손 흔들기 불가 — `body_angle_x` 로 좌우 스윙 + `mouth_up=0.8` 로 미소 조합을 대체 모션으로 사용. 파일 `notes` 에 v1.1.0 에서 교체 예정 기록.
- **D4 (Cubism segment type 제한)**: segments 의 첫 값이 (time, value) 페어로 시작하고 이후 type(0=Linear, 1=Bezier, 2=Stepped, 3=InverseStepped)별 길이로 추가된다는 Cubism 규약을 그대로 사용. v1.0.0 모션은 Linear(type=0) 만 사용해 단순화.

## 5. 변경 요약 (Changes)

- `schema/v1/motion-pack.schema.json` 신규.
- `schema/v1/test-poses.schema.json` 신규.
- `rig-templates/base/halfbody/v1.0.0/motions/` 아래 7 모션 파일.
- `rig-templates/base/halfbody/v1.0.0/test_poses/validation_set.json` 신규.
- `scripts/validate-schemas.mjs` — 모션·테스트 포즈 로드 / 교차 검증 블록 추가.

## 6. 블록 (Blockers / Open Questions)

- `mouth_form`, `mouth_open` 파라미터 부재 — docs/08 의 포즈 명과 halfbody v1 파라미터의 gap. 장기 해결은 v1.1.0 에서 `mouth_form` 을 `mouth_up`/`mouth_down` 결합 파생으로 추가하거나 docs/08 텍스트 수정.
- `greet.wave` 는 halfbody v1.0.0 에서 "절반의" 구현 — v1.1.0 arm 도입 이후 정식화.

## 7. 다음 세션 제안 (Next)

- **세션 05**: avatar-metadata 실제 샘플 1건 + Pose3 mutex · HitArea 바인딩 검증 + variant A/B 파츠 (arm).
- **세션 06**: Fuwa/옷 파라미터 추가 → halfbody v1.1.0 bump → normal 프리셋 12 설정.
- **세션 07**: `docs/09 Cubism export` 에 맞춰 export 스크립트 초판(`packages/exporter-core`).

## 8. 지표 (Metrics)

- **스키마 총합**: 9종 (motion-pack, test-poses 신규). 6 → 7 → 9 증가.
- **모션 팩**: 7/7. 총 커브 13, 총 세그먼트 50, 총 포인트 73.
  - idle.default (4s loop, 3 curves), idle.sleepy (6s loop, 3 curves)
  - blink.auto (0.3s trigger, 2 curves), nod.yes (1s, 1 curve)
  - shake.no (1s, 1 curve), greet.wave (2s, 2 curves, arm placeholder)
  - lipsync.mock (2s, 5 vowel curves)
- **테스트 포즈**: 20개 (docs/08 §3.1 의 16 행을 mouth vowel 5 개별 전개).
  - category 분포: baseline 1, eyes 3, mouth 6, head 6, body 1, brow 2, combo 1.
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=39 failed=0` (세션 03 의 31 + 모션 7 + 포즈 1).
- **검증기 확장**: motion segments 인코딩 자체 파서(Linear/Bezier/Stepped/InverseStepped 인식), meta.*_count 실측값 일치.

## 9. 인용 (Doc Anchors)

- [docs/03 §6.1 공통 제공 모션 팩](../../docs/03-rig-template-spec.md#61-공통-제공-모션-팩)
- [docs/08 §3 표준 포즈 세트](../../docs/08-validation-and-rendering.md#3-표준-포즈-세트-standard-test-pose-set)
