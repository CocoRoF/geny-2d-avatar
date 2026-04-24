# 세션 107 — fullbody v1.0.0 ahoge + acc_belt `parameter_ids` opt-in + 잔여 23 파츠 opt-in 완결 선언

**날짜**: 2026-04-20
**커밋**: (이 세션)
**스트림**: Rig & Parts + Pipeline (2 축)

## 1. 문제 — 세션 106 후속 감사로 발견된 2 개 substring-overlap

세션 106 이 halfbody v1.3.0 `ahoge` 의 role="hair_front" substring-overlap 을 Rule 0 로 해결한 뒤, 세션 107 는 본래 **잔여 25 파츠 (halfbody 12 + fullbody 13) 에 대한 opt-in 최종 판단** 을 예고한 정리 세션이었다.

감사 절차: 각 파츠의 role 텍스트로 `parameters.json` 을 grep 해 실제 substring 매칭 집합을 추출 → 파츠의 "편집 의도 파라미터" 와 비교. 대부분 (23/25) 은 깨끗 — `hair_front` role 이 `hair_front_sway`/`hair_front_fuwa` 를 정확히 매칭, `arm_l` 이 `arm_l_angle` 을, `brow_l` 이 `brow_l_*` 4 파라미터를 정확히 매칭. 중복 선언(Rule 0 명시) 은 rig 저자에게 "두 진실 공급원" 을 만드므로 세션 100 D2 · 102 D1 "중복 선언 회피" 원칙 하에 **opt-in 불필요** 결론.

**그러나 2 개 예외 발견**:

1. **`fullbody v1.0.0/parts/ahoge.spec.json`** — role="hair_front" (halfbody 와 동일). 세션 106 이 halfbody 의 동일 구조 버그를 고쳤지만 fullbody 미러 수정은 누락. substring 은 `hair_front_sway`/`hair_front_fuwa` 를 ahoge 선택 시 함께 노출 — ahoge 자신의 파라미터는 `ahoge_sway` 단 하나.

2. **`fullbody v1.0.0/parts/acc_belt.spec.json`** — role="accessory". substring "accessory" 는 `accessory_back_sway`/`accessory_front_sway` 를 매칭하는데 이 둘은 `accessory_back`/`accessory_front` 파츠의 파라미터. acc_belt 자신은 **독립 파라미터가 없다** (spec.notes: "acc_belt_warp 는 hip_warp 자식이며 독립 params_in 없음 — hip 이동만 상속"). 즉 acc_belt 선택 시 에디터는 무관한 2 개 파라미터를 보여주고, 사용자가 조작해도 acc_belt 는 반응 안 함 (accessory_back/front 메시만 반응).

ahoge (1.) 는 세션 106 의 halfbody 기준에 비춰 **누락된 미러 수정** (명백한 버그), acc_belt (2.) 는 세션 102 감사 시 "substring 정확" 으로 분류됐던 것이 **오분류** 였음 — role 의 영어 일반명사(accessory) 가 파라미터 접두사(accessory_back/front) 와 부분 겹침.

## 2. 수정 — 2 파일 + 골든 2 개 + 테스트 2 줄

(1) **`rig-templates/base/fullbody/v1.0.0/parts/ahoge.spec.json`**: `dependencies` 와 `validation` 사이에 `"parameter_ids": ["ahoge_sway"]` 추가 (halfbody 세션 106 미러).

(2) **`rig-templates/base/fullbody/v1.0.0/parts/acc_belt.spec.json`**: 동일 위치에 `"parameter_ids": []` 추가 — **빈 배열 = overall-only 명시 선언** (세션 98 D2). acc_belt 는 자신의 파라미터가 없고 hip 이동을 deformer 계층으로 상속하므로 에디터에 노출할 것은 `overall_*` 3 개뿐. 세션 98 D4 "overall 자동 포함" 규칙에 따라 Rule 0 빈 배열 + overall 합집합 → 3 파라미터.

(3) **골든 갱신** — fullbody v1.0.0 만:
- `packages/exporter-core/tests/golden/fullbody_v1.0.0.web-avatar.json` +4 줄 (ahoge/acc_belt 항목에 parameter_ids 주입, 17933→18015B)
- `packages/exporter-core/tests/golden/fullbody_v1.0.0.web-avatar-bundle.snapshot.json` 4 줄 교체 (bytes/sha256 갱신)

halfbody v1.3.0 / halfbody v1.2.0 골든 **0 바이트 변화** — acc_belt 는 fullbody 전용, fullbody ahoge 는 halfbody ahoge 와 별개 파일. 세션 105 D2 "양쪽 축 고정" 의 회귀 추적 정밀도 실 작동 2 회차 증거 (세션 106 이 halfbody 전용 drift 실증, 세션 107 이 fullbody 전용 drift 실증).

(4) **테스트 카운트 어서트 갱신** — 2 지점:
- `packages/exporter-core/tests/web-avatar-bundle.test.ts` L264 — `assert.equal(withIds, 25, ...)` → `27, "fullbody v1.0.0 opt-in 27 parts (세션 101 Face 14 + 세션 102 비-Face 11 + 세션 107 ahoge 1 + acc_belt 1)"`
- `packages/exporter-core/tests/web-avatar.test.ts` L135 — `assert.equal(withIds.length, 25, ...)` → `27, "fullbody v1.0.0 has 27 parts with parameter_ids post-세션107 (+ahoge +acc_belt)"`

세션 105 D3 + 세션 106 의 "세션 번호를 메시지에 명시" 철학 2 회차 적용.

## 3. 검증

- `scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → `parts=38/27bind` (세션 106 이후 25bind 에서 +2 정확히 반영, C11 통과 — `ahoge_sway` 존재 / acc_belt 는 빈 배열이라 id 검사 대상 없음).
- `scripts/rig-template/physics-lint.mjs rig-templates/base/halfbody/v1.3.0` → `parts=30/19bind` (세션 106 이후 불변 — 이 세션은 fullbody 만 touch).
- `pnpm --filter @geny/exporter-core run test` **102 pass** (세션 105 회귀 4 테스트 + 세션 103 2 테스트가 갱신된 골든과 카운트 27 에 재매칭).
- `pnpm run test:golden` **29/29 pass**.
- `pnpm --filter @geny/web-editor run test` **10 단계 모두 pass**:
  - `categorize fullbody: Face=16, Hair=5, Body=14, Accessory=3 (total=38)` — 카테고리 집계 불변
  - `parametersForPart(accessory_back) narrowed 60 → 4` — Rule 0 narrow 정상 (이 파츠는 세션 102 opt-in)
  - `renderer mounted: parts=38, rotation via arm_l_angle, selection round-trip (acc_belt → accessory_back → null)` — acc_belt 선택/해제 round-trip 통과 (빈 parameter_ids 가 에디터 lifecycle 을 깨지 않음 확인)

**실 wire-through 확인** — fullbody v1.0.0 golden 내:
```json
// ahoge
{ "parameter_ids": ["ahoge_sway"], "role": "hair_front", "slot_id": "ahoge" }
// acc_belt
{ "parameter_ids": [], "role": "accessory", "slot_id": "acc_belt" }
```

세션 95/98 `parametersForPart` 로직이 두 배열을 그대로 소비:
- `parametersForPart(ahoge)`: 기존 (Rule 1 substring) 3(`hair_front_sway`+`hair_front_fuwa`+`ahoge_sway`) → **1(`ahoge_sway`), -67%**. halfbody 세션 106 과 동일 narrow.
- `parametersForPart(acc_belt)`: 기존 (Rule 1 substring) 2(`accessory_back_sway`+`accessory_front_sway`) → **0 직접 + overall 3 자동 포함 = 3**. 사용자는 acc_belt 선택 시 `overall_x/y/rotate` 만 보고 "이 파츠는 자체 조절 파라미터 없음" 을 UX 로 즉각 인지.

## 4. 주요 결정축

**D1 — 잔여 25 파츠의 94% (23/25) 는 opt-in 불필요, 6% (2/25) 만 수정**: 세션 100 D2 · 102 D1 "중복 선언 회피" 원칙 상위 유지. substring 이 정확히 매칭되는 파츠에 Rule 0 를 명시하면 rig 저자가 parameters.json 리네임 시 두 곳을 갱신해야 하고, 세션 99 C11 lint 도 중복 선언 drift 를 잡지 못한다 (존재 여부만 검증). 중복 선언 증가는 rig 저작 유지보수 비용 증가 + opt-in 의 "**수정이 필요한 곳에만**" 시그널을 희석. 예외는 substring 오분류(ahoge role 공유) 또는 일반명사 role(acc_belt "accessory") 에 한정.

**D2 — acc_belt 는 `[]` (빈 배열) vs `["overall_x","overall_y","overall_rotate"]` 명시 vs 수정 안 함**: (a) `[]` = "이 파츠는 overall 외 자체 파라미터 없음" 명시 선언 — 세션 98 D2 정의와 일치, 세션 98 D4 overall 자동 포함과 조합해 에디터 결과 동일 3 파라미터 노출. (b) overall 3 개 명시 = 중복 (overall 은 어차피 자동). (c) 수정 안 함 = substring-overlap 지속(2 무관 파라미터 노출) 상태 유지 = UX 혼란. 최선은 (a) — 시맨틱 가장 명확 + 번들 바이트 최소 (3 id 대신 빈 배열). 에디터 경로에서도 사용자가 "acc_belt 는 조절 파라미터가 설계상 없다" 는 의도를 overall-only 노출로 학습.

**D3 — role 을 `"accessory"` → `"acc_belt"` / `"waistband"` 등으로 바꾸지 않음**: 세션 106 D3 와 동일 논리. role 은 motion pack / physics binding 저작 단계에서 공유되는 키 (docs/03 §9.1 슬롯 표준 제약). 세션 107 범위는 Rule 0 계약 해결에 한정. 미래 role 재명명은 별도 판단 (역사적 일관성 vs 시맨틱 정확도 tradeoff).

**D4 — 세션 106 halfbody ahoge 수정 시 fullbody ahoge 를 같이 수정하지 않은 이유 재평가**: 세션 106 은 halfbody v1.3.0 의 "첫 의도된 drift" 실증을 **고립 증명** 하는 것이 목표였음. fullbody 를 동시 수정했으면 (a) 2 템플릿 동시 golden drift 가 세션 105 D2 "양쪽 축 고정" 의 정밀도(어느 템플릿이 drift 하는지 명확해야 함) 를 증명할 기회를 놓침, (b) 커밋 단위가 커져 리뷰 부하 증가. 세션 107 에서 fullbody 전용 drift 를 독립 증명함으로써 메커니즘이 2 템플릿 모두에서 예상대로 작동함이 확증 — 세션 105 + 106 + 107 3 세션 연쇄로 회귀 추적 축이 실제로 **방향성** 을 유지함을 실증.

**D5 — "opt-in 완결 선언" 이라는 세션의 문서 역할**: 세션 107 이후 halfbody/fullbody 두 템플릿의 잔여 un-opt-in 23 파츠는 **모두 substring-정확** 이며 중복 선언 회피 원칙 하에 opt-in 대상 아님. 미래 세션이 추가 opt-in 을 고려한다면 반드시 "substring 정확 매칭인데도 opt-in 하는 이유" 를 명시해야 한다 (e.g., parameters.json 리네임이 임박했고 opt-in 이 저자 의도를 고정시키는 용도 등). 이 원칙은 본 세션 doc 과 INDEX §3 Rig & Parts 축 요약이 기록한다.

**D6 — `withIds` 테스트 카운트 이중 어서트가 세션별로 누적 증명**: 세션 100(14) → 102(18) → 106(19 halfbody) / 101(14) → 102(25) → 107(27 fullbody) 로 양 템플릿의 opt-in 카운트가 세션 번호 trail 을 메시지에 그대로 남긴다. PR 리뷰어가 `25→27` drift 를 볼 때 "세션 107 ahoge + acc_belt" 라는 정확한 출처를 메시지만으로 파악 — 의도된 drift 의 해석 비용 최소화 (세션 105 D3).

## 5. 결과 요약

| 축 | 변화 |
|---|---|
| `fullbody/v1.0.0/parts/ahoge.spec.json` | `parameter_ids: ["ahoge_sway"]` 추가 (+1 줄) |
| `fullbody/v1.0.0/parts/acc_belt.spec.json` | `parameter_ids: []` 추가 (+1 줄, overall-only 명시) |
| fullbody v1.0.0 web-avatar.json golden | +4 줄 (17933→18015B, 두 파츠 주입) |
| fullbody v1.0.0 snapshot golden | 4 줄 교체 (bytes/sha256 갱신) |
| halfbody v1.3.0 / halfbody v1.2.0 golden | **0 바이트 변화** (fullbody 전용 변경) |
| test 카운트 어서트 | `withIds 25 → 27` (2 지점: web-avatar-bundle.test + web-avatar.test) + 세션 107 메시지 명시 |
| physics-lint fullbody | `parts=38/25bind → 38/27bind` (C11 자동 반영) |
| physics-lint halfbody v1.3.0 | `parts=30/19bind` 불변 |
| exporter-core tests | 102 pass (불변) |
| golden 29/29 / web-editor e2e | 모두 pass (10 단계 불변, acc_belt selection round-trip 정상) |
| fullbody ahoge narrow | 3(`hair_front_sway` + `hair_front_fuwa` + `ahoge_sway`) → **1, -67%** (세션 106 halfbody 미러) |
| fullbody acc_belt narrow | 2(`accessory_back_sway` + `accessory_front_sway`) → **3 overall 자동 (acc_belt 무관 2 제거 + overall 3)** |
| 잔여 23 파츠 opt-in 완결 선언 | substring-정확 파츠 전원 opt-in 불필요 — D5 원칙 기록 |

## 6. 다음 세션 후보

- **세션 108 후보 (구 세션 105)**: legacy v1.0.0~v1.2.0 opt-in 복제 vs migrator 확장 — 세션 105 D1 3 블로커(docs/03 §7.3 충돌 / migrator 부재 / 소비자 없음) 중 어느 하나 해소 시 재개. 세션 107 의 opt-in 완결 선언은 v1.3.0 + fullbody v1.0.0 범위에 한정, legacy 는 여전히 별도 판단.
- **migrator 인프라 선행 후보**: 세션 105 D1 블로커 (b) 해소를 위해 `packages/migrator/` skeleton + `v1.2.0-to-v1.3.0.mjs` 스캐폴드. 세션 107 의 "의도된 drift 메커니즘이 2 템플릿에서 작동" 실증 이후 migrator 가 legacy 자동 이식에 착수할 기반 갖춰짐.
- **C12 후보**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 (세션 99~107 지속 후보). physics-lint 확장 또는 `rig-template-lint` 리브랜딩. Runtime 전환(세션 97 후보) 착수 전 방어망 1 단계 승격.
- **세션 97 후보 (Runtime 전환)**: 세션 94 motion/expression 이벤트 계약 + 세션 95 parametersForPart + 세션 100~107 opt-in 완결 위에 실 Cubism/WebGL 렌더러 합류. 별도 패키지 `@geny/web-avatar-runtime` 혹은 `@geny/web-editor-renderer` 확장.
