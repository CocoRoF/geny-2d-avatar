# 세션 106 — halfbody v1.3.0 ahoge `parameter_ids` opt-in (의도된 drift 첫 데모)

**날짜**: 2026-04-20
**커밋**: (이 세션)
**스트림**: Rig & Parts + Pipeline (2 축)

## 1. 문제 — ahoge 의 role="hair_front" substring 오버랩

세션 104 D3 에서 분리했던 마지막 잔재. `rig-templates/base/halfbody/v1.3.0/parts/ahoge.spec.json` 은 `role: "hair_front"` 로 선언돼 있다 — 아호게(antenna hair) 가 앞머리와 같은 축으로 움직이기 때문에 역할(role) 레벨에서 공유한다는 저작 의도.

그러나 세션 95 `parametersForPart` 의 2 단계 규칙 중 **Rule 1 substring 매칭** 은 role 필드 텍스트를 파라미터 id 부분 문자열로 비교한다. ahoge 의 role 이 `"hair_front"` 인 한 `hair_front_sway` / `hair_front_fuwa` 같은 파라미터가 **앞머리 전용 파라미터인데도 ahoge 선택 시 함께 노출** 된다. ahoge 자신의 파라미터는 단일 — `ahoge_sway` 뿐이다.

이 오버랩은 기능적으로 치명적이지 않지만 (파라미터를 건드려도 ahoge 메시는 반응 안 함, 앞머리만 반응) UX 상 혼란. 세션 95 의 substring 규칙은 원래 neck/torso 류의 간단한 케이스용 2 단계였고, ahoge 처럼 role 공유가 의도된 슬롯에서는 Rule 0 explicit declaration 이 올바른 수단이다.

세션 105 에서 golden 이 고정된 이후이므로, 이 변경은 세션 103 D5 메커니즘의 첫 **"의도된 drift"** 사례가 된다.

## 2. 수정 — 1 파일 + 골든 2 개 + 테스트 1 줄

(1) **`rig-templates/base/halfbody/v1.3.0/parts/ahoge.spec.json`**: `dependencies` 와 `validation` 사이에 `"parameter_ids": ["ahoge_sway"]` 추가 (hair_side_l/r 등 기존 opt-in 위치 패턴 계승).

(2) **골든 갱신** — halfbody v1.3.0 만:
- `packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar.json` +3 줄 (ahoge 항목에 `parameter_ids: ["ahoge_sway"]` 주입)
- `packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar-bundle.snapshot.json` 4 줄 변경 (web-avatar.json 의 bytes/sha256 갱신)

fullbody v1.0.0 / halfbody v1.2.0 기존 골든은 **0 바이트 변화** — ahoge 는 halfbody v1.3.0 전용 파츠.

(3) **테스트 카운트 갱신** — `packages/exporter-core/tests/web-avatar-bundle.test.ts` 의 halfbody v1.3.0 byte-for-byte 테스트에서:
- `assert.equal(withIds, 18, ...)` → `assert.equal(withIds, 19, ...)`
- 메시지: `"세션 100 Face 14 + 세션 102 비-Face 4"` → `"세션 100 Face 14 + 세션 102 비-Face 4 + 세션 106 ahoge 1"`

세션 105 D3 카운트 이중 어서트 철학 — **세션 번호를 메시지에 명시** — 가 여기서 작동한다. 리뷰어가 `18 → 19` drift 를 볼 때 메시지만으로 "아 세션 106 의 의도된 변경이구나" 를 파악 가능.

## 3. 검증

- `scripts/rig-template/physics-lint.mjs rig-templates/base/halfbody/v1.3.0` → `parts=30/19bind` (세션 105 시점 `18bind` 에서 +1 정확히 반영, C11 파라미터 존재 검증 통과 — `ahoge_sway` 가 `parameters.json` 에 선언돼 있음).
- `scripts/rig-template/physics-lint.test.mjs` 전체 pass (C11 단위 테스트 포함).
- `pnpm --filter @geny/exporter-core run test` **102 pass** (전 세션 105 에서 추가한 4 회귀 테스트 포함):
    - halfbody v1.3.0 snapshot byte-for-byte **재매칭** (drift 후 갱신된 골든)
    - halfbody v1.3.0 web-avatar.json byte-for-byte **재매칭** + `withIds == 19` 재어서트
    - fullbody v1.0.0 2 테스트 모두 **불변 pass** (ahoge 와 무관)
- `pnpm run test:golden` **29/29 pass**.
- `pnpm --filter @geny/web-editor run test` **10 단계 모두 pass**:
    - `categorize halfbody: Face=16, Hair=5, Body=7, Accessory=2 (total=30)` — ahoge 카테고리 Hair 유지
    - `parametersForPart(accessory_back) narrowed 50 → 4` — Rule 0 halfbody narrow 유지
    - 렌더러 mount parts=30 pass

**실 wire-through 확인** — halfbody v1.3.0 golden 내 ahoge 항목:
```json
{
  "parameter_ids": ["ahoge_sway"],
  "role": "hair_front",
  "slot_id": "ahoge"
}
```

세션 95 Rule 0 가 ahoge 선택 시 이 배열을 그대로 소비 → `parametersForPart(ahoge)` 가 1 파라미터(ahoge_sway) 만 반환. 이전 (Rule 1 substring) 에선 `hair_front_sway` + `hair_front_fuwa` + `ahoge_sway` 3 파라미터가 노출됐을 것 → **3→1, -67% narrow**.

## 4. 주요 결정축

**D1 — 의도된 drift 메커니즘 실 작동 첫 사례**: 세션 103 D5 에서 "halfbody v1.3.0 / fullbody v1.0.0 이 golden 에 들어오는 시점부터 L4 drift 가 의도된 변경으로 나타날 것" 이라고 예고했고, 세션 105 가 골든을 고정했으며, 세션 106 이 **그 첫 실증** 을 수행. 앞으로 세션 107+ 에서 잔여 substring-정확 파츠(halfbody 12 + fullbody 13) 또는 신규 opt-in 이 추가될 때마다 같은 3 단계 플로우가 반복된다 — (a) spec 수정 (b) 골든 regen (c) 테스트 카운트/메시지 갱신.

**D2 — ahoge 의 opt-in 은 `["ahoge_sway"]` 단일**: 세션 100/102 에선 neck 처럼 overall/body 파라미터(`body_breath`, `head_angle_*`)를 포함시킨 경우가 있었지만 ahoge 는 머리 상단의 단일 안테나 메시고, 고개 각도(head_angle_x/y/z) 로 인한 회전은 `ahoge_warp` 디포머 부모 계층에서 자동 상속 → 에디터 UI 에서 별도 노출할 이유 없음. `hair_side_l/r` 이 `[sway, fuwa]` 쌍인 것과 달리 ahoge 는 fuwa 파라미터 자체가 파라미터 목록에 없으므로 단일.

**D3 — role 을 `"ahoge"` 로 바꾸지 않고 Rule 0 로 해결**: 이론상 ahoge.spec.json 의 role 을 `"hair_front"` → `"ahoge"` 로 바꾸면 substring 규칙 하에서도 자연 narrow 가능. 그러나 (a) role 은 모션/물리 엔진이 저작 단계에서 참조하는 공유 키 — 변경 시 motion packs / physics bindings 전반을 재검토해야 하고 (b) docs/03 §9.1 슬롯 표준은 role 값에 제약 있음 (c) session 104 D2 에서 `categoryOf` 의 `role === "ahoge"` 분기가 방어망으로 유지되는 것과 일관 — 현재는 데드 경로. 세션 106 범위는 **Rule 0 계약으로 해결** 에 한정, role 자체의 시맨틱 조정은 미래 별도 판단.

**D4 — "golden drift 가 정확히 예상한 만큼만" 발생**: `git diff --stat packages/exporter-core/tests/golden/` 결과가 정확히 halfbody v1.3.0 의 2 파일만 표시 (총 7 줄 insertions / 4 줄 deletions, web-avatar.json 3 줄 + snapshot 4 줄 교체). fullbody v1.0.0 golden 은 0 바이트 변화 — ahoge 의 영향 범위가 halfbody-only 라는 저작 의도가 golden 변경 범위로도 정확히 반영. 이는 세션 105 D2 "snapshot + web-avatar.json 양쪽 고정" 의 2 축 회귀 추적이 실 작동하는 증거이기도 하다.

## 5. 결과 요약

| 축 | 변화 |
|---|---|
| `ahoge.spec.json` | `parameter_ids: ["ahoge_sway"]` 추가 (+1 줄) |
| halfbody v1.3.0 web-avatar.json golden | +3 줄 (ahoge 항목에 parameter_ids 주입) |
| halfbody v1.3.0 snapshot golden | 4 줄 교체 (바이트/sha256 갱신) |
| fullbody v1.0.0 / halfbody v1.2.0 골든 | **0 바이트 변화** (ahoge 무관) |
| test 카운트 어서트 | `withIds 18 → 19` (세션 106 ahoge 1 메시지 명시) |
| physics-lint | `parts=30/18bind → parts=30/19bind` (C11 자동 반영, 세션 99 통계 축) |
| exporter-core tests | 102 pass (불변) |
| golden 29/29 / web-editor e2e | 모두 pass |
| ahoge parameter narrow | 3(hair_front_sway + hair_front_fuwa + ahoge_sway) → **1(ahoge_sway), -67%** |

## 6. 다음 세션 후보

- **세션 107 후보**: 잔여 substring-정확 파츠 opt-in 최종 판단 — halfbody 12 + fullbody 13 파츠. 세션 102 에서 "중복 선언 회피 vs 명시 계약 일관성" 원칙 정리 필요. ahoge 처럼 "substring 은 작동하지만 의미가 부정확" 한 case vs "substring 이 정확히 일치" 한 case 를 분리. 후자 카테고리를 opt-in 에 포함할지 여부 (단순 일관성 vs 중복 방지). 세션 106 이 의도된 drift 메커니즘을 실증했으므로 이후 opt-in 확장 시 프로토콜이 확립됨.
- **세션 108 후보 (구 세션 107)**: legacy v1.0.0~v1.2.0 opt-in 판단 — 세션 105 D1 3 블로커 미해소 시 runtime 전환 합류까지 연기.
- **C12 후보**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 (세션 99~106 지속 후보).
- **migrator 인프라 선행 후보**: 세션 105 D1 블로커 해소를 위해 `packages/migrator/` skeleton + `v1.2.0-to-v1.3.0.mjs` 스캐폴드 — legacy 판단에 현실적 옵션 (b) 제공. Runtime 전환(세션 97 후보) 중 저작물 업그레이드 수요가 생기면 선행 가치.
