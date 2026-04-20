# 세션 104 — editor prepare.mjs halfbody v1.2.0 → v1.3.0 bump

**날짜**: 2026-04-20
**커밋**: (이 세션)
**스트림**: Frontend + Rig & Parts (2 축)

## 1. 문제 — halfbody editor 가 여전히 v1.2.0

세션 103 이 wire-through (schema → loader → converter → runtime types) 를 복구해 fullbody v1.0.0 번들은 25 파츠 `parameter_ids` 를 실제로 번들 `meta.parts[]` 에 방출한다. 그러나 `apps/web-editor/scripts/prepare.mjs` 의 halfbody 템플릿 디렉터리가 `rig-templates/base/halfbody/v1.2.0` 으로 고정돼 있어:

- v1.2.0 의 어느 파츠도 `parameter_ids` 선언 없음 (세션 104 D1: legacy 복제 연기)
- 세션 100 Face 14 파츠 + 세션 102 비-Face 4 파츠 = halfbody **18 파츠 opt-in** 은 v1.3.0 에만 있음
- → 실 에디터에서 halfbody 선택 시 **에서도 여전히 Rule 1/2 fallback 만 작동**, Rule 0 narrow 는 fullbody 에만

editor 기본값을 v1.3.0 으로 bump 해야 세션 100/102 halfbody 작업이 비로소 실 UX 에 도달한다.

## 2. 수정 — 2 파일

(1) **`apps/web-editor/scripts/prepare.mjs`**:
- 헤더 주석 "halfbody v1.2.0 + fullbody v1.0.0" → "halfbody v1.3.0 + fullbody v1.0.0"
- `TEMPLATES[0]` label "Halfbody v1.2.0" → "Halfbody v1.3.0"
- `TEMPLATES[0].templateDir` 경로 `v1.2.0` → `v1.3.0`

(2) **`apps/web-editor/scripts/e2e-check.mjs`** `TEMPLATE_EXPECTATIONS.halfbody`:
- `templateVersion`: `"1.2.0"` → `"1.3.0"`
- `partsTotal`: `29` → `30` (ahoge 추가)
- `categories.Hair`: `4` → `5`
- 주석 "halfbody=29 parts" → "halfbody=30 parts (세션 104: v1.2.0→v1.3.0 ahoge 추가)"

## 3. 검증

- `pnpm --filter @geny/web-editor run test` **전체 통과**:
    - `halfbody` 번들 조립: `files=4 bytes=15993` (v1.2.0 대비 ahoge.spec 1 파츠 추가분 반영)
    - `INDEX.json templates: fullbody, halfbody` 순서 유지
    - `categorize halfbody` → `Face=16, Hair=5, Body=7, Accessory=2 (total=30)` — ahoge 가 role=`hair_front` 이므로 `categoryOf` 의 `role.startsWith("hair_")` 분기로 Hair 로 분류 (명시적 `role === "ahoge"` 분기는 fallback 방어망, 실제 사용되지 않음)
    - `manifest files=3, meta parts=30, atlas textures=1` — meta 는 여전히 3 파일(bundle/web-avatar/atlas) + 텍스처는 atlas 가 관리
    - `parametersForPart(accessory_back) narrowed 50 → 4` — Rule 0 가 accessory_back 의 `parameter_ids: ["accessory_back_sway", "accessory_back_move_x", "accessory_back_move_y", "accessory_back_angle"]` (세션 100 Face opt-in 외 기존 Accessory opt-in, 실제로는 세션 100~102 외 기존 선언) 을 소비해 50→4 narrow. halfbody v1.3.0 opt-in 이 에디터 번들에 도달 최초 실증.
    - `renderer mounted: parts=30, rotation via arm_l_angle` — SVG rect 30 개 생성 (v1.2.0 에선 29 였음)
    - 모든 템플릿 HTTP/DOM/renderer 검증 pass
- `pnpm run test:golden` 29/29 pass (exporter-core 골든은 halfbody v1.2.0 으로 유지; editor e2e 는 별도 런타임 pass)

**L4 관측** (세션 103 D5 재해석의 첫 실증): editor 가 halfbody v1.3.0 을 assemble 하면서 생성하는 번들은 **세션 103 이후 처음으로 `parameter_ids` 를 실 번들에 방출**한다. halfbody v1.3.0 + v1.0.0 golden 이 **아직** exporter-core tests/golden/ 에 없어 L4 drift 가 관측되지 않지만, 그 golden 이 추가되는 시점부터 byte-level 변경이 **의도된 drift** 로 나타날 예정. 세션 103 에서 폐기된 "parameter_ids 는 번들 영향 0" 클레임의 최종 종결은 golden 추가 커밋에서 이뤄진다.

## 4. 주요 결정축

**D1 — legacy v1.0.0~v1.2.0 opt-in 복제는 계속 연기**: 세션 103 에서 세션 105 후보로 밀렸고 금번도 유지. editor 가 v1.3.0 을 쓰기 시작하면 v1.0.0~v1.2.0 는 (a) golden 고정본 기반 회귀 검증 (b) 외부 SDK 소비자 path 두 경우에만 쓰인다. (a) 는 parameter_ids 부재가 오히려 L4 불변을 보존(세션 103 골든 시나리오 그대로), (b) 는 아직 실제 사용자 없음. 즉 editor bump 가 선행되면 legacy 복제 필요성이 실질적으로 약해지는 판단. docs/03 §12.1 freeze 정책은 여전히 legacy 의 **추가 변경 금지** 를 의미, 세션 105 에서 migrator 확장안으로 돌리거나 자연 소멸시키는 것이 선택지.

**D2 — ahoge 분류는 `startsWith("hair_")` 경로로 흡수**: `packages/web-editor-logic/src/category.ts:20` 가 `role.startsWith("hair_") || role === "ahoge"` 로 쓰여 있지만, ahoge.spec.json 의 role 은 실제로 `"hair_front"` 이므로 `startsWith("hair_")` 분기에서 이미 Hair 로 분류된다. `role === "ahoge"` 분기는 향후 role 필드를 literal `"ahoge"` 로 쓰는 변종 spec 이 등장할 경우의 방어망이며 지금은 데드 코드 비슷하지만 의도적 유지 — 범주 분기 비용 0 에 가깝고 세션 104 시점에서 리팩터 대상 아님.

**D3 — `ahoge_warp` deformer 의 parameter 바인딩은 번들 convert 대상이 아님**: `ahoge.spec.json` 의 `deformation_parent: "ahoge_warp"` + `ahoge_sway` 파라미터는 rig-template 저작 계층의 관심사고, web-avatar 번들에서는 `parts[].parameter_ids` 에 직접 선언되지 않는다 (spec 에 `parameter_ids` 필드 자체 부재). 세션 105 에서 ahoge 에 `parameter_ids: ["ahoge_sway"]` opt-in 을 추가하는 후속 작업으로 분리 — 세션 104 는 순수 bump.

**D4 — e2e 카디널리티 snapshot 의 가치**: `TEMPLATE_EXPECTATIONS` 숫자가 bump 에서 깨지는 것은 **정상** — 이 체크리스트가 세션 87 부터 준수해 온 "parts 추가 시 e2e 가 먼저 운다" 계약을 그대로 수행했다. 한 번의 편집으로 templateVersion + partsTotal + Hair 세 필드가 연동 변경됐지만 그 연동 자체가 문서화된 계약. session docs/03 §12.1 bump 문서와 병행.

## 5. 결과 요약

| 축 | 변화 |
|---|---|
| `prepare.mjs` | halfbody 경로 `v1.2.0` → `v1.3.0`, label "Halfbody v1.3.0" (+3 줄 변경, 실질 템플릿 1 bump) |
| `e2e-check.mjs` | halfbody 기대값 partsTotal 29→30, Hair 4→5, templateVersion 1.2.0→1.3.0 (+3 줄 변경) |
| editor e2e | 10 단계 모두 pass (halfbody 30 parts + fullbody 38 parts) |
| golden | 29/29 pass (exporter-core 골든은 halfbody v1.2.0 기반 유지, 드리프트 0) |
| 실 효과 | halfbody editor 번들에서 세션 100/102 18 파츠 opt-in 이 처음 사용자에게 도달. `parametersForPart` Rule 0 narrow 가 halfbody + fullbody 양쪽 실 UX 에 작동하는 최초 시점. |

## 6. 다음 세션 후보

- **세션 105 후보**: halfbody legacy v1.0.0~v1.2.0 opt-in 복제 vs migrator 확장 — 세션 103 D6 에서 밀려온 본래 103 후보. editor bump 후 v1.2.0 이 실 쓰임에서 빠지므로 우선순위가 **하향 조정**. 방안: (a) 실질 필요 없음 → 공식 폐기, (b) 외부 SDK 통합 일정 잡히면 migrator 확장으로 해결. docs/03 §12.1 freeze 정책 최종 해석 + 잔여 substring-정확 파츠(halfbody 12 + fullbody 13) 중복 선언 회피 원칙 병합.
- **세션 106 후보**: halfbody v1.3.0 ahoge 에 `parameter_ids: ["ahoge_sway"]` opt-in 추가 — 세션 104 D3 분리한 내용. ahoge 는 role=`hair_front` 이므로 substring 매칭으로 hair_front 용 파라미터 중복 노출 위험. 명시 선언으로 narrow 권장.
- **C12 후보**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 (세션 99~103 지속 후보). Runtime 전환(세션 97 후보) 착수 전 방어망 1 단계 승격.
- **L4 golden 승격 후보**: halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들을 `packages/exporter-core/tests/golden/` 에 새 golden 으로 추가 — 세션 103 D5 의 "의도된 drift" 최종 종결. editor bump 가 끝났으므로 금번 생성물이 실 사용 회귀 대상.
