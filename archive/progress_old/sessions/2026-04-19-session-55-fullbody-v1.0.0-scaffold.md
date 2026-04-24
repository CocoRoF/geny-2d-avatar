# Session 55 — fullbody v1.0.0 실 저작 1단계 (디렉터리/manifest/parameters 스캐폴딩)

- **날짜**: 2026-04-19
- **범위**: rig 저작 세션 시리즈 시작 — 세션 52 계획 §7 의 X 단계 (5단계 중 1).
- **산출물**: `rig-templates/base/fullbody/v1.0.0/{template.manifest.json, parameters.json, README.md}`
- **상태**: 완료
- **선행**: 세션 49 (`FAMILY_OUTPUT_RULES` fullbody 엔트리), 세션 52 (저작 계획 수립)
- **후행**: 세션 56 (파츠 + deformers), 57 (physics authoring), 58 (motions), 59 (E2E 번들)

---

## 1. 배경

세션 52 가 fullbody v1.0.0 저작 설계 공간을 도출했다 — 하반신 8 파츠 + 10 파라미터 + 5 PhysicsSetting + `FAMILY_OUTPUT_RULES.fullbody` 유지. 세션 52 §7 이 실 저작을 **5 세션 시리즈**로 분해했는데, 각 세션이 독립적인 lint gate (validate-schemas / physics-lint / golden) 를 통과하는 단위가 되도록 설계되었다.

세션 55 (= X 단계) 는 그 시리즈의 1단계 — **골격만 세우고 내용은 비워둔다**. 핵심 목표:

- `rig-templates/base/fullbody/v1.0.0/` 디렉터리 신설 (schema 의 family enum 중 빈 슬롯 점유).
- `template.manifest.json` 에서 `family: "fullbody"` 를 선언해 physics-lint `--family fullbody` 가 활성화될 수 있는 상태로 만든다.
- `parameters.json` 을 halfbody v1.3.0 의 49 파라미터에 하반신 10 을 추가해 **59** 로 확장.
- 파츠/deformers/physics/motions/expressions/test_poses/textures 는 **모두 비어있는 채로** 남겨 validate-schemas 의 ENOENT skip 동작을 활용한다 (이 디렉터리들은 세션 56~59 에서 1개씩 채워진다).

왜 한 세션에 몰아넣지 않는가: 각 단계가 서로 다른 lint / 테스트 경로를 건드려서, 하나의 커밋에 묶으면 실패 원인 특정이 어려워진다. ADR 0005 L2 게이트(physics-lint C1~C10) 는 physics.json 이 완성되어야 활성되므로 세션 57 에 귀속; L1 migrator 는 fullbody 가 **새 family** 이라 N/A (halfbody→fullbody migrator 없음); L4 파이프라인 불변식은 exporter-core 의 family=fullbody 분기가 필요해 세션 59 에 귀속.

---

## 2. 설계 결정

### D1. halfbody v1.3.0 parameters 를 베이스로 사용 (+ 하반신 10)

- `parameters.json` 을 halfbody v1.3.0 에서 그대로 복사 → 새 그룹 `lower_body` + `clothing` 추가 → 10 파라미터 append.
- **근거**: halfbody 의 상반신 49 파라미터(얼굴/눈/눈썹/입/몸/머리카락/overall + ahoge/accessory/breath_phys) 는 fullbody 도 전부 사용 — 저자가 다시 타이핑할 이득 없음. copy-paste 가 drift 방지의 최선.
- **기각 대안**: halfbody parameters 를 **import 하는 공유 파일**로 리팩터 → 추가 스키마 계층이 필요, YAGNI. 지금 2 family (halfbody + fullbody) 밖에 없고 4 family 에 도달한 뒤 검토.

### D2. 그룹 세분화 — `lower_body` + `clothing` 분리

- 하반신 파라미터를 단일 `lower_body` 그룹에 몰지 않고 `lower_body`(다리/발/골반) + `clothing`(치마/망토) 으로 분리.
- **근거**: 에디터 UI 에서 "옷" 과 "몸" 은 다른 panel 로 노출되어야 한다 — 사용자가 "치마만 바꿔보기" / "다리 각도만 조정" 을 독립적으로 수행. 그룹은 UX 기준의 분류.
- halfbody 의 `body` 그룹과 계층 충돌 없음 — fullbody 의 `clothing` 은 `cloth_skirt_*`/`cloth_cape_*` 전용.

### D3. `foot_l/r_angle` 은 `physics_input` 이 아님

- `foot_*_angle` 은 정적 pose 전용 — 다리 물리와 연동 안 함.
- **근거**: 발 흔들림은 다리 물리(`leg_sway_phys_*`) 의 말단 효과로 자연스럽게 나타남. 발을 별도 물리 입력으로 두면 출력이 불필요하게 복잡 (저자 튜닝 난이도 ↑, 시각적 이득 낮음).
- halfbody 에도 `arm_pose_variant`/`arm_*_angle` 은 `physics_input` 이 아닌 선례 있음.

### D4. `compat.motion_packs` 을 **3종으로 축소**

- halfbody v1.3.0: 9 packs — fullbody v1.0.0 초기: 3 packs (`idle.default@^1`, `blink.auto@^1`, `lipsync.mock@^1`).
- **근거**: 상반신 전용 팩(`nod.yes`, `shake.no`, `greet.wave`, `idle.sleepy`, `ahoge.bounce`, `accessory.greet`) 은 fullbody 에서 **시각적으로 동작하긴 하지만 하반신 덜렁거림 없음** → 일단 제거하고 세션 58 모션 단계에서 하나씩 회귀 검증하며 복구. YAGNI + 명시적.
- `idle.default` 는 유지 — 세션 58 에서 `@1.2.0` 로 리마스터해 `body_angle_x` 커브 추가 → `skirt_sway_phys` 구동.

### D5. `hit_areas` +1 `HitAreaHip`

- halfbody 는 `HitAreaHead` + `HitAreaBody` 2종. fullbody 에 `HitAreaHip` 추가 — UX 에서 "허리 잡아 돌리기" 제스처 슬롯.
- validate-schemas 의 `bound_to_part` 슬롯 교차확인은 **slotIds.size > 0** 가드에 의해 이번 세션에서 건너뜀 (파츠 없음). 세션 56 에서 `hip.spec.json` 추가 시 자동 활성.

### D6. 빈 디렉터리 미생성

- `parts/`, `deformers.json`, `physics/`, `motions/`, `expressions/`, `test_poses/`, `textures/` 전부 **생성하지 않음**.
- **근거**: validate-schemas 는 ENOENT 를 명시적으로 skip (line 272, 372, 383, 452) 하므로 빈 디렉터리는 필요 없음. 빈 디렉터리에 `.gitkeep` 을 두면 git diff 가 "실제로 뭘 했는지" 가 모호해진다. 각 디렉터리는 해당 세션의 첫 저작물과 함께 생성.

---

## 3. 변경 산출물

**신규 파일**:
- `rig-templates/base/fullbody/v1.0.0/template.manifest.json` (115 줄)
- `rig-templates/base/fullbody/v1.0.0/parameters.json` (714 줄 — halfbody 597 + 하반신 117)
- `rig-templates/base/fullbody/v1.0.0/README.md` (60 줄)
- `progress/sessions/2026-04-19-session-55-fullbody-v1.0.0-scaffold.md` (본 파일)

**수정 파일**:
- `progress/INDEX.md` — row 55 추가, §3/§6 `checked=186→188`, §8 rotate (55 제거, 56/57/58 신규).

**변경 없음 (명시)**:
- `scripts/rig-template/physics-lint.mjs` — `FAMILY_OUTPUT_RULES.fullbody` 이미 세션 49 에서 등록 → 수정 없음.
- `schema/v1/*` — family enum 에 fullbody 이미 포함 → 수정 없음.
- `docs/03 §6.2` 파생 표에 fullbody 행 추가는 세션 57 (physics 완성 후) 로 미룸 — 지금 추가하면 "authored" 주장이 빈 파츠/물리로 거짓.
- `scripts/rig-template/migrate.mjs` — halfbody→fullbody migrator 없음 (새 family). 수정 없음.

---

## 4. 검증

- `node scripts/validate-schemas.mjs` → **checked=188 failed=0**. fullbody manifest + parameters 가 스키마 통과 + groups 교차확인 + combined_axes 교차확인 전부 pass. ENOENT skip 3종 (deformers/physics/test_poses) 정상 로깅.
- `node scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → physics.json 없음 error (의도 — 세션 57 에서 활성).
- `node scripts/rig-template/migrate.test.mjs` → 3/3 pass (halfbody v1.0.0→v1.3.0 체인 무영향).
- `node scripts/rig-template/physics-lint.test.mjs` → 13/13 pass (세션 49 의 `--family fullbody` 오버라이드 테스트 무영향).
- `pnpm run test:golden` → **20/20 step pass**. worker-generate 16 tests + perf-harness smoke 3 cases 포함 전체 green.

---

## 5. 커밋

단일 커밋:

```
feat(rig): fullbody v1.0.0 스캐폴딩 — manifest + parameters 59 (+하반신 10) (세션 55)
```

포함:
- `rig-templates/base/fullbody/v1.0.0/template.manifest.json` (신규)
- `rig-templates/base/fullbody/v1.0.0/parameters.json` (신규)
- `rig-templates/base/fullbody/v1.0.0/README.md` (신규)
- `progress/sessions/2026-04-19-session-55-fullbody-v1.0.0-scaffold.md` (신규, 본 파일)
- `progress/INDEX.md` (row 55 + §3/§6 checked=188 + §8 rotate)

---

## 6. 다음 세션

§8 새 순서 기준:

- **세션 56**: 파츠 spec 8종 (`parts/hip.spec.json` · `leg_l`/`leg_r` · `foot_l`/`foot_r` · `cloth_skirt` · `cloth_cape` · `acc_belt`) + `deformers.json` 신설 (halfbody v1.3.0 21 노드 + 하반신 warp ~7개 예상). validate-schemas 의 slot 교차확인 활성.
- **세션 57**: `physics/physics.json` 17 PhysicsSetting 저작 + `mao_pro_mapping.md` 신설 — ADR 0005 L2 게이트(physics-lint C1~C10) 활성화 = 저작 완결 신호.
- **세션 58**: `motions/idle.default.motion.json@1.2.0` 리마스터 + 기존 motion 팩 호환성 회귀 + `compat.motion_packs` 복구.
