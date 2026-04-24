# Session 58 — fullbody v1.0.0 실 저작 4단계 (motions 9종 + idle.default@1.2.0 리마스터 + compat 복구)

- **날짜**: 2026-04-19
- **범위**: 세션 52 저작 계획 §7 의 X+3 단계 (5단계 중 4). 모션 팩 호환성 회귀 + `idle.default` 리마스터.
- **산출물**: `rig-templates/base/fullbody/v1.0.0/motions/{idle_default@1.2.0, 8 승계}.motion.json` + `template.manifest.json.compat.motion_packs` 3→9 복구.
- **상태**: 완료
- **선행**: 세션 55 (manifest conservative 3) · 세션 57 (physics 17 settings)
- **후행**: 세션 59 (expressions + test_poses + textures + exporter 분기 + E2E 번들)

---

## 1. 배경

세션 55 에서 fullbody manifest 의 `compat.motion_packs` 를 보수적으로 `idle.default`/`blink.auto`/`lipsync.mock` 3종만 선언해 두었다 — 하반신 파라미터가 아직 존재하지 않던 시점에 상반신 전용 팩이 런타임에서 어떻게 동작할지 판단을 미뤘기 때문.

세션 56 (파츠 + deformers) · 세션 57 (physics 17 settings) 로 하반신 계약이 안정화된 지금, 이번 세션은 (a) `idle.default` 를 `1.2.0` 으로 올려 **`body_angle_x` 를 곡선에 추가 → PhysicsSetting13 `skirt_sway_phys` / Setting17 `hip_phys` 자동 유도** 하고, (b) 상반신 전용 팩 6종(nod/shake/greet/idle_sleepy/ahoge/accessory)을 회귀 검증해 `compat.motion_packs` 를 halfbody v1.3.0 수준(9종) 으로 복구한다.

---

## 2. 설계 결정

### D1. `idle.default@1.2.0` 리마스터 — `body_angle_x` 신규 커브

- halfbody v1.3.0 `idle.default@1.1.0` 의 4 커브(`body_breath` / `body_angle_y` / `head_angle_x` / `head_angle_y`) 는 전량 그대로 승계 — 상반신 연출 퀄리티는 이미 자리잡은 값.
- **추가**: `body_angle_x` 커브, `body_angle_y` 와 동일 **진폭 ±1.5° · 2 cycle / 4s** · 피크 1.0s / 3.0s (= body_angle_y 와 위상 동일). segments = `[0,0, 0,1.0,1.5,0, 2.0,0,0, 3.0,-1.5,0, 4.0,0]` (x / y 부호만 반대) → x-y 중첩으로 원형 sway 근사.
- **effect chain**:
  - Setting13 `skirt_sway_phys` input `body_angle_x` weight=50 → `cloth_skirt_sway` 출력 → `skirt_warp` 변형.
  - Setting17 `hip_phys` input `body_angle_x` weight=60 → `hip_phys` 출력 → `hip_warp` 변형 (하반신 전반 2차 오프셋).
  - Setting11 `accessory_sway_phys` (세션 57 D3) input `body_angle_x` → `cloth_cape_sway` (망토 sway 은은 유도).
- `leg_l_angle`/`leg_r_angle` 은 **idle 에선 0 유지** — 걸음걸이 모션은 별도 `walk.*` 팩에서 다룰 것(Foundation 범위 밖). Setting13 의 `leg_*_angle` weight 는 0 입력이어도 물리 정적 — idle 단계에선 sway 가 `body_angle_x` 만으로 구동됨.

### D2. meta 카운트 재계산

| 필드 | halfbody v1.1.0 | 신규 커브 | fullbody v1.2.0 |
|---|---|---|---|
| `curve_count` | 4 | +1 | **5** |
| `total_segment_count` | 13 | +4 | **17** |
| `total_point_count` | 17 | +5 | **22** |

- segments schema: `[t0, v0, type, t1, v1, type, t2, v2, ...]` → body_angle_x 5 points / 4 segments (body_angle_y 와 동일 형식). motion-pack.schema C 검증은 숫자 길이만 보지만 exporter-core motion3 변환기는 실 point 수를 계산해 대조 — 카운트 불일치 시 run-time mismatch 발생 가능.

### D3. 상반신 전용 팩 6종 **무수정 승계**

회귀 대상:
- `nod.yes@1.0.0` — `head_angle_y` 단일 곡선.
- `shake.no@1.0.0` — `head_angle_x` 단일 곡선.
- `greet.wave@1.1.0` — `arm_r_angle` + `mouth_up`.
- `idle.sleepy@1.0.0` — `body_breath` + `eye_open_l/r`.
- `ahoge.bounce@1.0.0` — `head_angle_x/y` (ahoge 물리 Setting10 자동 유도).
- `accessory.greet@1.0.0` — `body_angle_x/z` + `arm_r_angle` (accessory 물리 Setting11 자동 유도 — 세션 57 D3 로 이제 cape 도 함께 흔들림).

- **결정**: `cp rig-templates/base/halfbody/v1.3.0/motions/{각 파일}.motion.json fullbody/v1.0.0/motions/` 로 **파일 단위 복제만**.
- **근거**: 6 팩 전부 fullbody parameters.json 에 존재하는 상반신 파라미터(head_angle_x/y, arm_r_angle, body_angle_x/z, body_breath, eye_open_l/r, mouth_up) 만 참조. fullbody 파라미터 범위/중립값은 halfbody 와 동일 (세션 55 README §2 — halfbody 49 승계 + 10 신규). 런타임 회귀 없음.
- **`accessory.greet` 특기사항**: 세션 57 D3 에서 Setting11 이 `cloth_cape_sway` 를 3rd output 으로 받게 되면서, accessory.greet 가 이제 망토까지 미세하게 흔들림 — 의도된 확장 (cape 가 accessory 집합에 속한다는 계약). 별도 모션 수정 불필요.

### D4. `compat.motion_packs` 3→9 복구 + `idle.default@^1.2` 핀

| Slot | 세션 55 | 세션 58 |
|---|---|---|
| 1 | `idle.default@^1` | **`idle.default@^1.2`** (메이저 범위 유지하면서 마이너 하한 고정 — 1.1.x 는 body_angle_x 없어 물리 유도 불가) |
| 2 | `blink.auto@^1` | 동일 |
| 3 | `lipsync.mock@^1` | 동일 |
| 4 | — | `nod.yes@^1` |
| 5 | — | `shake.no@^1` |
| 6 | — | `greet.wave@^1` |
| 7 | — | `idle.sleepy@^1` |
| 8 | — | `ahoge.bounce@^1` |
| 9 | — | `accessory.greet@^1` |

- **`idle.default@^1.2` 근거**: SemVer `^1.2` 는 `>=1.2.0 <2.0.0`. halfbody v1.3.0 이 배포한 `idle.default@1.1.0` 은 만족하지 않음 → fullbody 전용으로 업그레이드된 `1.2.0` 이상만 수락. 런타임이 실수로 halfbody pack 1.1.0 을 fullbody 에 물릴 가능성을 계약 수준에서 차단.
- **나머지 `@^1` 유지**: 상반신 전용 팩은 halfbody/fullbody 공유 의미 — family 간 이식 가능한 **범용 팩** 이라는 기획 원칙 유지(docs/03 §6.1 의 pack_id 네임스페이스 규약).

### D5. 모션 팩 전용 lint 없음 — motion-pack.schema 에 위임

- 세션 40 physics-lint 같은 family-aware lint 는 모션에 대해서는 없음 (motion-pack.schema 가 pack_id/version/format/meta 구조와 Linear segment 인코딩을 이미 검증).
- **추후 필요 시**: exporter-core 의 motion3 변환기가 segments 숫자 길이 vs meta.total_point_count 일치를 런타임에 assert — 현재 세션에선 직접 육안 계산 + validate-schemas 로 충분.
- **교차검증 위임**: `target_id` 가 parameters.json 에 존재하는지는 현재 schema 엄격 체크 없음. 세션 59 에서 exporter-core `family=fullbody` 분기와 함께 `validate-rig-template` 에 포함 여부 판단.

---

## 3. 변경 산출물

**신규 파일** (9):
- `rig-templates/base/fullbody/v1.0.0/motions/idle_default.motion.json` (1.2.0 리마스터, 5 커브)
- `rig-templates/base/fullbody/v1.0.0/motions/blink_auto.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/lipsync_mock.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/nod_yes.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/shake_no.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/greet_wave.motion.json` (1.1.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/idle_sleepy.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/ahoge_bounce.motion.json` (1.0.0 승계)
- `rig-templates/base/fullbody/v1.0.0/motions/accessory_greet.motion.json` (1.0.0 승계)
- `progress/sessions/2026-04-19-session-58-fullbody-motions.md` (본 파일)

**수정 파일** (2):
- `rig-templates/base/fullbody/v1.0.0/template.manifest.json` — `compat.motion_packs` 3→9, `idle.default@^1`→`idle.default@^1.2` 핀.
- `progress/INDEX.md` — row 58 추가, §3 checked=228→237, §6 `checked=237`, §8 rotate(58 제거, 61 후보 신규).

**변경 없음 (명시)**:
- `rig-templates/base/fullbody/v1.0.0/{parameters.json, deformers.json, physics/}` — 세션 55/56/57 에서 확정된 계약. 모션은 기존 파라미터만 구동.
- `packages/exporter-core/` — 모션3 변환기는 이미 halfbody v1.3.0 9 팩 처리 중. fullbody 도 동일 로직.
- `schema/v1/motion-pack.schema.json` — 스키마 변화 없음.

---

## 4. 검증

- `node scripts/validate-schemas.mjs` → **checked=237 failed=0** (228→237, +9 motion pack).
- `node scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → **✓ all checks pass** (family=fullbody settings=17 in=43 out=19 verts=34) — 세션 57 결과 불변.
- `pnpm run test:golden` → **20/20 step pass**.
- `node scripts/rig-template/physics-lint.test.mjs` → 13/13 pass (모션 추가 무영향).
- `node scripts/rig-template/migrate.test.mjs` → 3/3 pass.

**육안 카운트** (motion-pack.schema meta vs segments):
- idle.default@1.2.0: curves=5 · segments 합 = 4(breath) + 4(body_angle_x) + 4(body_angle_y) + 2(head_x) + 3(head_y) = **17** ✓ · points 합 = 5+5+5+3+4 = **22** ✓.

---

## 5. 커밋

단일 커밋:

```
feat(rig): fullbody v1.0.0 motions 9 — idle.default@1.2.0 리마스터 + compat 복구 (세션 58)
```

포함:
- `rig-templates/base/fullbody/v1.0.0/motions/*.motion.json` (9 신규)
- `rig-templates/base/fullbody/v1.0.0/template.manifest.json` (compat.motion_packs 3→9)
- `progress/sessions/2026-04-19-session-58-fullbody-motions.md` (신규)
- `progress/INDEX.md` (row 58 + §3/§6 checked=237 + §8 rotate)

---

## 6. 다음 세션

§8 새 순서:

- **세션 59**: fullbody v1.0.0 실 저작 5단계 (최종) — `expressions/{smile,wink,neutral}.expression.json@1.0.0` + `test_poses/validation_set.json` + `textures/base.png` (halfbody v1.3.0 복제 또는 임시 컬러 맵) + `exporter-core` `family=fullbody` 분기 (없으면 halfbody 로직 재사용) + aria 번들 생성 + sha256 golden 고정. **ADR 0005 L4 파이프라인 불변식 활성**.
- **세션 60 후보**: BullMQ 드라이버 실장 — `@geny/job-driver-bullmq` v0.1.0 + Redis 연결 래퍼 + JobStore 인터페이스 호환 + `idempotency_key` → `jobId` pass-through.
- **세션 61 후보**: orchestrator-service `--driver bullmq` flag + perf-harness `--driver bullmq` 대조 런.
