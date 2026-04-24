# Session 52 — fullbody family 실 저작 착수 검토

- **날짜**: 2026-04-19
- **범위**: 기획/검토 세션 (docs-only)
- **산출물**: [`progress/plans/fullbody-v1-authoring.md`](../plans/fullbody-v1-authoring.md)
- **상태**: 완료
- **선행**: 세션 49 (`FAMILY_OUTPUT_RULES` 도입), 세션 31 (halfbody v1.3.0 authored), 세션 40/49 (physics-lint family 지원)
- **후행**: 세션 55~59 (실 저작 5단계 시리즈)

---

## 1. 배경

세션 49 에서 `scripts/rig-template/physics-lint.mjs` 에 **`FAMILY_OUTPUT_RULES`** 테이블을 도입하면서 schema 의 family enum 6종(`halfbody` / `masc_halfbody` / `chibi` / `fullbody` / `feline` / `custom`) 을 모두 등록하되, fullbody/chibi/feline/custom 은 `forbiddenPrefixes: []` 로 **접미사/접두사 확장을 실 저작 세션의 몫**으로 남겨두었다. 즉 세션 49 는 "아키텍처 슬롯은 비워뒀으니, 실제로 어떤 접미사/파츠가 필요한지는 저작 착수 시점에 결정" 이라는 계약이었다.

docs/14 §9 로드맵 상 fullbody 는 halfbody 다음 base family 후보이므로, 실 저작 세션 시리즈(55~59) 를 시작하기 **전에** 설계 공간을 한 번 훑어 다음 두 질문에 답할 필요가 있었다:

1. `FAMILY_OUTPUT_RULES.fullbody` 의 `pattern` / `forbiddenPrefixes` 를 **바꿔야 하는가**? 바꾼다면 무엇을, 왜?
2. fullbody 가 halfbody 대비 **추가해야 하는 파츠/파라미터/물리 설정/모션** 의 1차 목록은 무엇인가?

이 세션은 "저작 전 preflight" 이다 — 코드/스키마/lint 를 건드리지 않고 **결정과 근거를 문서로 고정**해, 세션 55~59 실 저작자가 재고민 없이 착수할 수 있도록 한다.

---

## 2. 설계 결정

### D1. FAMILY_OUTPUT_RULES.fullbody 는 **유지** — 접미사/접두사 확장 없음

- **결정**: 현재 상태(`pattern: /_(sway|phys|fuwa)(_[lr])?$/`, `forbiddenPrefixes: []`) 그대로 둔다.
- **근거**: fullbody 가 추가로 다루는 모든 하반신 2차 흔들림(치마/케이프/다리/엉덩이 물리)이 기존 3 접미사로 커버된다:
  - 치마/케이프 흔들림 → `_sway` (halfbody 의 hair 와 동일 카테고리)
  - 치마 Fuwa (부풀림) → `_fuwa` (halfbody v1.2.0 에서 이미 검증된 접미사)
  - 엉덩이/호흡/골반 물리 → `_phys`
- **기각 대안**:
  - `_wave` (치마 파도) → `_sway` 가 이미 "진동성 2차 흔들림" 을 총칭. 치마 파도 역시 `cloth_skirt_sway` 로 자연스럽게 표현됨.
  - `_breath` (호흡) → halfbody v1.3.0 의 `body_breath_phys` 선례에 따라 `_phys` 로 충분.
  - `_layer` (레이어링) → 파라미터가 아니라 deformer 트리 구조의 문제. physics output 접미사의 책임 범위 밖.
- **함의**: 실 저작 세션 55 에서 `FAMILY_OUTPUT_RULES` 테이블 엔트리를 **수정하지 않고** fullbody 템플릿만 추가하면, physics-lint `--family fullbody` 가 자동으로 동작한다.

### D2. 하반신 파츠 인벤토리 — 8 슬롯

halfbody v1.3.0 의 상반신 30 파츠에 **8 파츠 추가**하여 fullbody v1.0.0 기준선을 38 파츠로 잡는다:

| slot_id | role | 비고 |
|---|---|---|
| `hip` | body_core | 골반/엉덩이 ribbon (deformer trunk) |
| `leg_l` / `leg_r` | body_limb | 좌우 다리 |
| `foot_l` / `foot_r` | body_limb | 좌우 발 (신발 포함) |
| `cloth_skirt` | clothing | 치마 (hip deformer 하위) |
| `cloth_cape` | clothing | 망토 (back_layer 하위) |
| `acc_belt` | accessory | 벨트/허리띠 (hip 하위) |

- **근거**: docs/04 §2.2 lower-body 스펙이 이미 제시한 기본 구성을 따름.
- **기각 대안**: hands (손 개별 파츠) → halfbody v1.1.0 A/B variant 로 해결됨, fullbody 스코프 중복. `cloth_pants` → 저작 중 수요가 생기면 v1.1.0 bump 로 추가.

### D3. 파라미터 +10 — core 4 + physics_output 4 + physics_input 2

halfbody v1.3.0 49 파라미터 → fullbody v1.0.0 **59 파라미터** (+10):

**Core (저자가 키잉)**:
- `leg_l_angle`, `leg_r_angle` (다리 회전, 정적 pose)
- `foot_l_angle`, `foot_r_angle` (발/신발 ankle bend)

**Physics output (물리가 덮어씀, `physics_output: true`)**:
- `leg_sway_l`, `leg_sway_r` (다리 2차 흔들림, body_angle_* 입력)
- `cloth_skirt_sway` (치마 흔들림, body_angle_x + leg_l/r_angle 입력)
- `cloth_skirt_fuwa` (치마 부풀림, body_breath 입력)
- `cloth_cape_sway` (망토 흔들림, body_angle_z + body_angle_x 입력)
- `hip_phys` (골반 이동 보정, body_angle_* + body_breath 입력)

**참고**: 위 리스트는 7 출력이지만 5 physics setting 으로 묶임 — 좌/우 다리 2종은 `leg_sway_phys_l`/`leg_sway_phys_r` 두 PhysicsSetting 공유(halfbody v1.3.0 의 `accessory_sway_phys` 패턴 재사용). §5 참조.

### D4. PhysicsSetting +5 — 12→17

halfbody v1.3.0 12 setting → fullbody v1.0.0 **17 setting**:

| id 슬롯 | 이름 | 입력 | 출력 | 비고 |
|---|---|---|---|---|
| 13 | `skirt_sway_phys` | body_angle_x · leg_l_angle · leg_r_angle (3) | cloth_skirt_sway (1) | mobility 1.0, delay 0.55 |
| 14 | `skirt_fuwa_phys` | body_breath · body_angle_y (2) | cloth_skirt_fuwa (1) | Fuwa 계수 halfbody v1.2.0 값 재사용 |
| 15 | `leg_sway_phys_l` | body_angle_z · body_angle_x (2) | leg_sway_l (1) | weight 60 |
| 16 | `leg_sway_phys_r` | body_angle_z · body_angle_x (2) | leg_sway_r (1) | weight 60 (좌/우 대칭) |
| 17 | `hip_phys` | body_angle_x · body_breath (2) | hip_phys (1) | weight 50 |

- **근거**: 각 setting 이 **1~3 입력 · 1~2 출력** 의 halfbody 관습을 준수 → C1~C4 meta 카운트 / C5 1:1 / C6 physics_input / C7 physics_output / C10 접미사 규약 전부 기존 lint 로 검증 가능.
- `cloth_cape_sway` 는 별도 setting 없이 `accessory_sway_phys` (halfbody v1.3.0 의 13 번) 를 공유하도록 cape 를 accessory_back 자매 파츠로 취급 — lint C6/C7 기준에 부합 (입력 source_param 중복 허용).

### D5. 모션 팩 호환 — `idle.default@1.2.0` remaster 필요

halfbody v1.3.0 의 `idle.default@1.1.0` 는 body_angle_y 를 구동하지만, fullbody 는 **`body_angle_x` 추가 키잉**이 있어야 `skirt_sway_phys` 가 자연스럽게 유도됨. 따라서:

- `idle.default@1.2.0` (fullbody 전용 remaster) 추가 — curve 3→4 (body_angle_x 추가)
- halfbody 는 여전히 `idle.default@1.1.0` 사용 (`compat.motion_packs` 에서 family 별 분기는 향후 ADR 대상)
- `greet.wave`/`ahoge.bounce`/`accessory.greet` 는 fullbody 에서도 그대로 동작(상반신만 건드림).

### D6. 실 저작 5 세션 분해

실 저작은 한 세션에 몰아넣지 않고 **5 세션 시리즈**로 쪼갠다 — 각 세션이 physics-lint / golden 의 특정 gate 를 통과하는 단위로 설계:

| 세션 | 범위 | 완료 기준 |
|---|---|---|
| 55 | 디렉터리 스캐폴딩 + `template.manifest.json` + `parameters.json` | schema validate pass, 59 parameters |
| 56 | 파츠 spec 8종 + `deformers.json` (+ warp 노드) | `validate-schemas` checked=186 + 파츠 수 증가분 |
| 57 | `physics/physics.json` 17 setting + `mao_pro_mapping.md` | `physics-lint --family fullbody` pass |
| 58 | 모션 팩 `idle.default@1.2.0` + 기존 3 팩 호환 검증 | 모션 픽스처 validate + curve 카운트 |
| 59 | E2E 번들 (`@geny/exporter-core` v0.7.0 family=fullbody 분기) + web-preview 회귀 | `test:golden` step 4/5/6 pass |

각 세션은 **독립 커밋 + 독립 lint gate** 이라 사고 범위가 국소화됨.

### D7. 리스크 및 완화

| 리스크 | 임팩트 | 완화 |
|---|---|---|
| bundle 크기 +30% | web-avatar 초기 로드 지연 | atlas 분할 전략(v1.1.0) 에서 해결, Foundation 은 경고만 |
| physics 튜닝 시간 과다 | 세션 57 지연 | halfbody v1.3.0 의 weight/mobility 값을 1차 근사로 차용 |
| 모션 drift (halfbody motion 이 fullbody 에서 이상 동작) | 세션 58 재작업 | `compat.motion_packs` 에 명시 버전 pin + 픽스처 회귀 |

---

## 3. 변경 산출물

**신규 파일**:
- `progress/plans/fullbody-v1-authoring.md` (9 섹션, ~180 줄)

**수정 파일**:
- `progress/INDEX.md` — 세션 로그 표 row 52 추가, §8 rotate (52 제거, 55 신규 추가)

**변경 없음 (명시)**:
- 코드 (`apps/` `packages/` `services/` `scripts/`) — 0 바이트
- 스키마 (`schema/v1/*`) — 0 바이트
- lint 테이블 (`scripts/rig-template/physics-lint.mjs` 의 `FAMILY_OUTPUT_RULES`) — 0 바이트
- golden 20 step / validate-schemas checked=186 — 전부 불변

---

## 4. 검증

- `pnpm run test:golden` — **재실행하지 않음** (코드 무변경). 세션 51 의 20-step green 결과가 그대로 유효.
- `pnpm run validate-schemas` — 재실행하지 않음 (스키마 무변경, checked=186 유지).
- docs-only 세션이므로 "build gate 없음" 이 스스로의 Done 정의.

---

## 5. 커밋

단일 커밋:

```
docs(fullbody): v1.0.0 저작 선행 검토 — FAMILY_OUTPUT_RULES 유지 + 하반신 8 파츠 + 5 PhysicsSetting 제안 (세션 52)
```

포함 파일:
- `progress/plans/fullbody-v1-authoring.md` (신규)
- `progress/sessions/2026-04-19-session-52-fullbody-authoring-review.md` (신규, 본 파일)
- `progress/INDEX.md` (row 52 + §8 rotate)

---

## 6. 다음 세션

§8 의 새 순서 기준:

- **세션 53**: BullMQ 드라이버 실장 선행 (Redis 배포 결정 + `idempotency_key`→`job.id` 매핑).
- **세션 54**: 실 벤더 staging 부하 회귀 (`perf-harness --http`).
- **세션 55**: fullbody v1.0.0 실 저작 1단계 (본 세션 §7 계획).

세션 53 을 먼저 하는 이유: ADR 0006 follow-up (세션 50 queue metrics) 의 당연한 다음 단계이며, Runtime 축은 Foundation Exit 와 직접 연결되어 있다. fullbody 저작은 base family 확장이라 Foundation 범위 **밖**이므로 Runtime 이 안정된 뒤에 착수하는 편이 안전.
