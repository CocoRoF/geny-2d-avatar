# Session 06 — halfbody v1.1.0 bump: arm A/B variants + first pose.json

- **Date**: 2026-04-18
- **Workstreams**: Rig & Parts
- **Linked docs**: `docs/03 §7`, `docs/03 §12.1` (#3 A/B 팔 세트), `docs/11 §3.2.1`
- **Linked ADRs**: `progress/adr/0003`, `progress/adr/0004`

---

## 1. 목표 (Goals)

- [x] `rig-templates/base/halfbody/v1.1.0/` 신규 — v1.0.0 의 전체 자산을 mirror 후 수정.
- [x] 파라미터 3종 추가: `arm_pose_variant` (0=A, 1=B), `arm_l_angle`, `arm_r_angle` (각도 범위 [-30, 30]).
- [x] 파츠 교체: `arm_l`, `arm_r` 삭제 → `arm_l_a`, `arm_l_b`, `arm_r_a`, `arm_r_b` 4종 신규. symmetry 쌍은 L/R 같은 variant 끼리.
- [x] 디포머 갱신: `arm_l_warp`, `arm_r_warp` 2개 추가 (parent=`body_visual`). 변형 축은 `arm_l_angle`·`arm_r_angle`.
- [x] `pose.json` 신규 — 2 mutex 그룹 (`{arm_l_a, arm_l_b}`, `{arm_r_a, arm_r_b}`).
- [x] `greet.wave` 정식 버전 — `arm_r_angle` 기반 sway + `mouth_up` smile 조합. v1.0.0 의 `body_angle_x` 대체 플레이스홀더 해소.
- [x] `template.manifest.json` — `version=1.1.0`, `cubism_mapping` 에 arm 3종 추가, compat 는 동일.
- [x] `README.md` — v1.1.0 로 헤더 업데이트, Diff from v1.0.0 섹션 추가.
- [x] `validate-schemas.mjs` 무수정 — 기존 cross-check 가 신규 구조(파츠 교체·pose.json·variant 파라미터) 를 그대로 커버.

## 2. 사전 맥락 (Context)

- docs/03 §12.1 #3: "mao_pro 는 왼팔/오른팔에 A/B 두 세트를 둔다. 우리 템플릿은 `arm_pose_variant` (0=A, 1=B) 를 도입해 향후 슬롯 `arm_l[variant=A|B]` 로 확장한다. Pose3 의 mutex 그룹 활용."
- ADR 0003: 버전 디렉터리는 한 번 푸시되면 이동·삭제 불가. 따라서 v1.0.0 은 그대로 유지하고 v1.1.0 을 병렬로 추가.
- ADR 0004: Pose3 는 템플릿 측 소유 (mutex 는 구조적 제약). avatar 는 `arm_pose_variant` 값만 저장.
- session 05 에서 정의한 `pose.schema.json` 은 이번 세션의 첫 실사용 대상.
- v1.0.0 `greet.wave` 의 `body_angle_x` 플레이스홀더는 "arm 파라미터 도입 후 교체" 를 `notes` 에 예고 — 이번 세션이 그 약속 이행.

### 범위 경계

다음은 의도적으로 **session 07 로 미룸**:
- Fuwa/cloth 볼륨 파라미터(`hair_front_fuwa`, `hair_side_fuwa`, `hair_back_fuwa`, `cloth_main_fuwa`).
- `overall_x/y/rotate` 의 실제 deformer 연결 (파라미터는 v1.0.0 에 이미 선언, v1.1.0 도 유지).
- `normal` 물리 프리셋 12 Setting 완성 (v1.0.0 3 Setting 유지).
- 이들은 구조적으로 서로 맞물리므로 한 세션에 묶어 처리할 계획.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| v1.1.0 디렉터리 | `rig-templates/base/halfbody/v1.1.0/` | v1.0.0 의 모든 파일 복사 + 필요 수정. validator 통과. | ✅ |
| 파라미터 3종 | `v1.1.0/parameters.json` | `arm_pose_variant`·`arm_l_angle`·`arm_r_angle` 추가 (core/body 그룹). | ✅ |
| 파츠 4종 | `v1.1.0/parts/arm_{l,r}_{a,b}.spec.json` | 기존 arm_l/r 삭제. 4 파일 각각 schema + symmetry + deformer 참조 정합. | ✅ |
| 디포머 갱신 | `v1.1.0/deformers.json` | `arm_l_warp`·`arm_r_warp` 추가. body_visual.note 갱신. | ✅ |
| pose.json | `v1.1.0/pose.json` | 2 mutex 그룹, 각 arm L/R variant pair. pose.schema.json 통과. | ✅ |
| greet.wave v2 | `v1.1.0/motions/greet_wave.motion.json` | arm_r_angle 주 입력, 2s, 4 seg, 5 pt. notes 에서 v1.0.0 placeholder 해소 서술. | ✅ |
| 매니페스트 갱신 | `v1.1.0/template.manifest.json` | version=1.1.0, cubism_mapping 추가. | ✅ |
| README 갱신 | `v1.1.0/README.md` | 헤더 v1.1.0, Diff from v1.0.0 섹션 | ✅ |

## 4. 결정 (Decisions)

- **D1 (arm_pose_variant 를 float 로)**: 실제로는 0 또는 1 두 값만 쓰지만 Cubism 파라미터는 float 공간이 자연스럽고, 런타임에서 `≥ 0.5 → B` 한도로 라운딩. docs/03 §3.1 의 파라미터 포맷(`unit: normalized`) 에 맞춤.
- **D2 (arm 각도 범위 [-30, 30])**: docs/03 §12.1 의 mao_pro 기준. 손 흔들기·악수·상체 제스처 범위 커버. v1.1.0 은 단일 축(팔 회전) 만 지원 — 팔꿈치 굽힘·손가락은 별도 파츠 팩(`fx_pack.hand.v1`) 주제.
- **D3 (symmetry pair 는 variant 일치)**: arm_l_a ↔ arm_r_a, arm_l_b ↔ arm_r_b. 이유: 동일 포즈 세트 내에서의 L/R 대칭이 자연스럽다. variant 교차(A↔B) 는 의미가 없음(포즈 자체가 다름).
- **D4 (pose.json 파일 존재 = variant 사용 선언)**: validator 는 pose.json 이 있으면 모든 참조 slot 이 parts/ 에 존재하는지 검증. 없으면 skip. → v1.1.0 에서 첫 등장.
- **D5 (v1.0.0 의 `arm_l/arm_r` 는 v1.1.0 에 없음)**: variant 도입은 **파괴적 변경**. v1.0.0 과 v1.1.0 모두 유지되고(ADR 0003), v1.0.0 을 참조하는 avatar 는 v1.0.0 파츠 그대로 쓰면 된다. 업그레이드는 수동 마이그레이션(세션 08+ exporter 에서 다룸).
- **D6 (greet.wave 필드 업데이트)**: 원본은 `body_angle_x` + `mouth_up`. 신규는 `arm_r_angle` + `mouth_up`. pack_id `greet.wave` 는 유지(compat 호환), 내용만 교체. 세맨틱 버전은 motion 파일 내부의 `version: "1.1.0"` 으로 표시.

## 5. 변경 요약 (Changes)

- `rig-templates/base/halfbody/v1.1.0/` 신규 (전체).
- 파라미터 3종 추가(v1.0.0 의 37 → v1.1.0 은 40).
- parts: v1.0.0 의 27개에서 arm 2개 삭제 + arm 변이 4개 추가 = v1.1.0 은 29개.
- deformers: v1.0.0 의 14 노드에서 arm_l_warp / arm_r_warp 2개 추가 = 16 노드.
- pose.json: 신규.
- motions/greet_wave.motion.json: 재작성.
- README: 헤더·구성·Diff 섹션 갱신.

## 6. 블록 (Blockers / Open Questions)

- v1.0.0 아바타를 v1.1.0 로 마이그레이션하는 스크립트가 없음 — exporter 와 동일 주제라 session 07 또는 08 에서 다룬다. 현재 `samples/avatars/sample-01-aria.avatar.json` 은 여전히 v1.0.0 을 참조.
- `arm_pose_variant` 의 에디터 UX(토글 vs 슬라이더) 는 frontend 주제로 이월.
- pose3 의 `Link` 배열은 현재 전부 빈 배열. 팔 본체 ↔ 소매 링크처럼 실제 사용은 cloth_main 분할 시점(session 07).

## 7. 다음 세션 제안 (Next)

- **세션 07**: Fuwa/cloth/overall 파라미터 + 물리 12 Setting 확장. v1.1.0 내에서 patch bump 또는 v1.2.0. 판단은 세션 시작 시.
- **세션 08**: `packages/exporter-core` 초판 — template + avatar → Cubism 번들(`.moc3/.physics3.json/.motion3.json/.pose3.json/.cdi3.json`) deterministic 변환.
- **세션 09**: 마이그레이션 스크립트(`scripts/rig-template/migrate.mjs`) — v1.0.0 → v1.1.0 아바타 자동 업그레이드. `samples/avatars/sample-01-aria` 실사용 케이스.

## 8. 지표 (Metrics)

- **템플릿 버전**: halfbody v1.0.0, v1.1.0 (병렬 2 버전).
- **파라미터**: v1.1.0 기준 40개 (v1.0.0 의 37 + 3).
- **파츠**: v1.1.0 기준 29개 (v1.0.0 의 27 + 4 − 2).
- **디포머 노드**: v1.1.0 기준 16 (v1.0.0 의 14 + 2).
- **스키마 인스턴스**: pose.json 첫 등장 (v1.1.0 에만).
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=82 failed=0` (v1.0.0 40 + v1.1.0 42; pose.json 1 추가).

## 9. 인용 (Doc Anchors)

- [docs/03 §7 템플릿 버저닝](../../docs/03-rig-template-spec.md#7-버저닝)
- [docs/03 §12.1 #3 A/B 팔 세트](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [docs/11 §3.2.1 Pose3 mutex 그룹](../../docs/11-export-and-deployment.md#321-pose3-대체-포즈-그룹)
- [ADR 0003 full-SemVer 디렉터리](../adr/0003-rig-template-versioning.md)
- [ADR 0004 참조형 아바타](../adr/0004-avatar-as-data.md)
