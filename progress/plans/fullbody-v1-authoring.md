# Fullbody v1 저작 선행 검토 (Pre-authoring review)

- **상태**: 계획 (실 저작 착수 전)
- **세션**: 52 (2026-04-19) 초안
- **목표 버전**: `tpl.base.v1.fullbody@v1.0.0`
- **연관 문서**: docs/03 §2 템플릿 카탈로그, §3.3 확장 파라미터, §6.2 물리 규약 · docs/04 §2.2 fullbody 확장 슬롯 · docs/14 §9 α 에 fullbody 예고

> 본 문서는 **실 저작 전 합의 문서** 다. 실제 `rig-templates/base/fullbody/v1.0.0/` 생성은 별도 세션 시리즈에서 수행. 결정 사항 중 일부는 실 저작 도중 조정 가능.

---

## 1. 범위와 제외

**범위 (세션 52 이후)**:
- `rig-templates/base/fullbody/v1.0.0/` 디렉터리 및 15+ 파일 스캐폴딩.
- 하반신 파츠 6+ (leg/foot/skirt/hip/cape?) spec.
- 전용 파라미터 8+ 추가 (`leg_*`, `cloth_skirt_*`, `cloth_cape_*`).
- 전용 PhysicsSetting 5~8 신규 (치마/다리 흔들림/케이프).
- `scripts/rig-template/migrate.mjs` 는 **건들지 않음** — halfbody→fullbody 는 **다른 family** 이므로 migration hop 이 아님 (family 전환은 사용자 의도의 큰 변경; 자동 이식 없음).

**제외 (상위 마일스톤)**:
- `masc_halfbody`/`feline`/`chibi` 는 β/α 로 이후 세션.
- 실 부츠/의상 베리에이션은 Stage 2+ (파츠 카탈로그/ variants) 의 역할.

---

## 2. FAMILY_OUTPUT_RULES.fullbody 재평가 (세션 49 follow-up)

세션 49 에서 fullbody 엔트리는 halfbody 의 regex 를 그대로 재사용 — `_(sway|phys|fuwa)(_[lr])?$` + 금지 접두사 없음. 실 저작 전 이 choice 가 충분한지 재검토.

### 2.1 기존 접미사로 커버되는 fullbody 물리

| 부위 | 접미사 예 | 판정 |
|---|---|---|
| 치마 흔들림 | `cloth_skirt_sway` / `cloth_skirt_sway_l/r` | ✅ `_sway` |
| 롱 케이프 뒤쪽 | `cloth_cape_sway` | ✅ `_sway` |
| 짧은 밑단 출렁 | `cloth_hem_phys` | ✅ `_phys` |
| 볼륨 치마 (플레어) | `cloth_skirt_fuwa` / `cloth_skirt_fuwa_l/r` | ✅ `_fuwa` — 세션 07 의 Fuwa 규약이 fullbody 에도 확장 |
| 다리 sway (전신 idle) | `leg_sway_l` / `leg_sway_r` | ✅ `_sway` — 세션 49 의 halfbody forbidden 은 fullbody 에서 해제 |
| 부츠 리본 | `acc_boot_ribbon_sway_l/r` | ✅ `_sway` |
| 엉덩이/허리 출렁 | `hip_phys` | ✅ `_phys` |
| 벨트 끝자락 | `acc_belt_end_sway` | ✅ `_sway` |

### 2.2 기존 접미사로 어색한 케이스 (가설)

| 부위 | 고민 | 결론 |
|---|---|---|
| 코트 헴라인 파도 | `_wave` 접미사 (슬로우 주기) 이 `_sway` 보다 의미 명확? | **기각**: `_sway` 로 충분. 주기·진폭은 PhysicsSetting 의 `mobility`/`delay` 에서 표현. 접미사 증가는 lint 복잡도만 증가. |
| 가슴 호흡 2차 효과 | `_breath` 접미사? | **기각**: 이미 `cloth_chest_phys` 로 `_phys` 사용. `body_breath` 입력 → `cloth_chest_phys` 출력 체인은 halfbody v1.3.0 `body_breath_phys` 와 동일 패턴. |
| 속치마 (레이어) | `_layer`/`_inner` 접미사? | **기각**: 물리 출력 이름이 아니라 파츠 z_order 의 역할. 파츠 slot_id 에 `cloth_skirt_inner` 같은 이름만 쓰고, 물리 출력은 여전히 `_sway`. |

### 2.3 결정

**`FAMILY_OUTPUT_RULES.fullbody` 는 세션 49 설정 그대로 유지**:

```js
fullbody: {
  pattern: /_(sway|phys|fuwa)(_[lr])?$/,
  forbiddenPrefixes: [],
}
```

근거:
- 가상의 새 접미사(`_wave`/`_breath`/`_layer`) 는 실제 수요가 없음 (YAGNI).
- halfbody 에서 이미 검증된 3종 (`sway`/`phys`/`fuwa`) 이 직관적 · 국제화 안전 · 짧음.
- 새 접미사 도입은 migrate 스크립트/lint/docs 전부 업데이트 필요 — 증거 없이 과잉 설계.

단, **저작 도중 진짜 새 의미가 발생**하면 (예: 박자에 맞춰 튕기는 튀는 동작이 `_bounce` 를 강요) 그 때 세션을 하나 따로 — PR 에서 rule 테이블 확장 + 테스트 추가 + docs 업데이트를 묶어 처리.

---

## 3. 추가 파츠 목록 (Lower body)

halfbody v1.3.0 기준 30 파츠 + **fullbody 전용 추가 약 8~10 파츠**:

| slot_id | 역할 | 앵커 | 디포머 부모 | z_order 영역 |
|---|---|---|---|---|
| `hip` | 엉덩이/허리 연결 | `hip_anchor` | `body_pose_warp` | 40 |
| `leg_l` | 왼다리 | `hip_anchor_l` | `leg_l_warp` | 35 |
| `leg_r` | 오른다리 | `hip_anchor_r` | `leg_r_warp` | 35 |
| `foot_l` | 왼발 | `foot_l_anchor` | `leg_l_warp` | 30 |
| `foot_r` | 오른발 | `foot_r_anchor` | `leg_r_warp` | 30 |
| `cloth_skirt` | 치마/하의 | `hip_anchor` (상단) | `cloth_skirt_warp` | 50 |
| `cloth_cape` | (옵션) 케이프 | `body_pose_warp` 루트 | `cloth_cape_warp` | 25 (뒷배경) |
| `acc_belt` | (옵션) 벨트 | `hip_anchor` | `body_pose_warp` | 45 |

**Anchor 전략**: `hip_anchor` 는 halfbody 에도 이미 body_pose_warp 하단에 존재 (물리 peg 로 활용) — fullbody 에서는 **visual anchor** 로도 승격. 좌우 분리 `hip_anchor_l/r` 는 다리 연결점.

**디포머 신규 warp 5종**: `leg_l_warp`, `leg_r_warp`, `cloth_skirt_warp`, `cloth_cape_warp` (옵션), `hip_warp` (선택적 — 기존 body_pose_warp 의 자식으로 둠).

---

## 4. 추가 파라미터

halfbody v1.3.0 의 49 파라미터 위에 추가:

| 파라미터 | 범위 | 종류 | 물리 role | 비고 |
|---|---|---|---|---|
| `leg_l_angle` | [-15, 15] deg | core (fullbody) | `physics_input: true` | 다리 회전 입력 |
| `leg_r_angle` | [-15, 15] deg | core (fullbody) | `physics_input: true` | |
| `cloth_skirt_sway` | [-1, 1] | extension | `physics_output: true` | `_sway` |
| `cloth_skirt_fuwa` | [0, 1] | extension | `physics_output: true` | `_fuwa` |
| `cloth_cape_sway` | [-1, 1] | extension | `physics_output: true` | 옵션 |
| `leg_sway_l` | [-1, 1] | extension | `physics_output: true` | idle 흔들림 |
| `leg_sway_r` | [-1, 1] | extension | `physics_output: true` | |
| `hip_phys` | [-1, 1] | extension | `physics_output: true` | 엉덩이 출렁 |
| `foot_l_angle` | [-20, 20] deg | core (fullbody) | — | 발 회전 (pose only, 물리 입력 아님) |
| `foot_r_angle` | [-20, 20] deg | core (fullbody) | — | |

**`body_angle_x` 범위 확장**: halfbody ±10° → fullbody ±15° (docs/03 §3.2 기존 note).

---

## 5. PhysicsSetting 예상

halfbody v1.3.0 의 12 PhysicsSetting 위에 **+5 추가**:

| # | 이름 | 입력 | 출력 | mobility/delay/radius (가설) |
|---|---|---|---|---|
| 13 | `skirt_sway_phys` | `body_angle_x` (60w) + `leg_l_angle` (20w) + `leg_r_angle` (20w) | `cloth_skirt_sway` | 1.0 / 0.50 / 8 |
| 14 | `skirt_fuwa_phys` | `body_breath` (100w) | `cloth_skirt_fuwa` | 0.6 / 0.35 / 4 |
| 15 | `leg_sway_phys_l` | `body_angle_x` (80w) + `leg_l_angle` (20w) | `leg_sway_l` | 1.1 / 0.40 / 5 |
| 16 | `leg_sway_phys_r` | `body_angle_x` (80w) + `leg_r_angle` (20w) | `leg_sway_r` | 1.1 / 0.40 / 5 |
| 17 | `hip_phys` | `body_angle_x` (70w) + `body_breath` (30w) | `hip_phys` | 0.8 / 0.30 / 3 |

**총 meta 예상**: PhysicsSetting 12→17 · input 31→41 (+10) · output 13→18 (+5) · vertex 24→39 (+15 가량).

`physics-lint` C1~C10 + C10-suffix 는 자동 pass (접미사 규약 유지), C10-forbidden 은 fullbody 에 금지 접두사 없으므로 비활성.

---

## 6. 모션 팩 호환

기존 halfbody 모션 팩 (`idle.default`/`greet.wave`/`ahoge.bounce`/`accessory.greet`) 은 **파라미터 이름 기반** 이므로 fullbody 에서도 **그대로 로드**. 단:

- `idle.default` 는 상반신만 흔들기 때문에 fullbody 가 `leg_sway_*`/`cloth_skirt_sway` 를 전혀 쓰지 않음 → 하반신 "굳은 듯" 보임. **fullbody 전용 리마스터 `idle.default@1.2.0`** 가 필요 — `body_angle_x` 추가 커브로 물리 체인 유도.
- `greet.wave` 는 상반신 모션, fullbody 에도 자연스럽게 호환.
- 신규 모션 팩 `walk.idle@1.0.0` (fullbody 전용) — 제자리 걷기 미세 흔들림 — 는 β 범위.

---

## 7. 실 저작 세션 시리즈 제안 (세션 55+)

세션 52 에서 착수 결정 후 실 저작은 4~5 세션으로 분해:

| 세션 | 범위 |
|---|---|
| **55** | 디렉터리 + manifest + parameters (core 28 + extension 12 = 40) + cubism_mapping + 빈 parts/deformers/physics/motions 스캐폴딩. validate-schemas pass. |
| **56** | 하반신 파츠 8종 spec + anchors + test_poses `leg_forward`/`walk_step` 추가. |
| **57** | deformers.json (halfbody 21 + fullbody 5 = 26 warp nodes). Cubism viewer 에서 hierarchy 눈으로 확인. |
| **58** | physics/physics.json 17 PhysicsSetting 저작. mao_pro 참조. physics-lint C1~C10 전부 pass. |
| **59** | motion 팩 `idle.default@1.2.0` 리마스터 (fullbody 전용) + `walk.idle@1.0.0` (옵션). golden fixture 갱신. |

각 세션은 **골든 테스트 pass 를 커밋 조건** — 실 저작이라도 번들 산출물/스키마/lint 는 자동 회귀.

---

## 8. 리스크

- **파츠 수 급증**: halfbody 30 → fullbody 38~40. `bundle.json` 파일 수 · 번들 bytes 가 halfbody 대비 30%+ 상승. `geny_export_bundle_bytes` 히스토그램 재보정 필요.
- **Physics 튜닝 시간**: mao_pro 참조가 halfbody 에 특화돼 있어 치마/다리 물리는 새 기준선을 직접 실험해야 함. 세션 58 이 가장 길어질 전망 (visual QA 동반 필요 — 자동 pass 외에 뷰어 눈 검증).
- **모션 호환성 drift**: 기존 halfbody 아바타가 fullbody 모션 팩을 로드하면 `leg_*` 파라미터가 없어 warn 또는 silent noop. pose3 변환기가 **fallback to body** 규칙을 명시하고 있는지 재검증 필요 (`docs/05` 매핑 표).
- **`body_angle_x` 범위 변경**: halfbody 아바타가 fullbody 모션을 로드해 ±15° 커브가 들어오면 clipping 발생 — 아바타의 family 가 halfbody 일 때는 자동 scale-down 이 들어가는지 확인해야 함. 현재 없다면 pose3 변환 시 family 가드 추가.

---

## 9. 결정 요약

| 주제 | 결정 |
|---|---|
| `FAMILY_OUTPUT_RULES.fullbody` 접미사 추가 | **안함** (증거 부족, YAGNI) |
| 금지 접두사 추가 | **안함** (fullbody 는 하반신을 허용) |
| 파츠 추가 규모 | 8~10 신규 (하반신) |
| 파라미터 추가 규모 | 10 신규 (core 4 + extension 6) |
| PhysicsSetting 추가 규모 | 5 신규 (12 → 17) |
| 모션 팩 호환 | idle.default 리마스터 필요, 나머지 호환 |
| 실 저작 분해 | 세션 55~59 (5개) |

실 저작 착수 여부는 세션 54 (실 벤더 staging 부하) 또는 β 시작 시점 재평가.
