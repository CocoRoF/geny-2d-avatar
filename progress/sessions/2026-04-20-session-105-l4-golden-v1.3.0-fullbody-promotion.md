# 세션 105 — L4 golden 승격 (halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들)

**날짜**: 2026-04-20
**커밋**: (이 세션)
**스트림**: Pipeline + Rig & Parts (2 축)

## 1. 사후 pivot — 왜 "legacy 복제" 가 아니라 golden 승격인가

세션 103 D6 / 세션 104 D1 에서 본래 103 후보였던 "halfbody legacy v1.0.0~v1.2.0 Face opt-in 복제 vs migrator 확장" 은 세션 105 로 계속 밀려 있었다. 그러나 실제로 105 를 시작해 판단 근거를 점검한 결과, 실질 블로킹 조건들이 다음과 같다:

- `migrator/` 코드 자체가 **아직 존재하지 않음** — docs/03 §7.3 "자동 마이그레이션 제공" 계약은 문서 상 약속이지만 구현 인프라가 zero. migrator 확장(b) 은 먼저 migrator 를 만드는 큰 작업이 선행.
- docs/03 §7.3 디프리케이션 정책은 "새 major 공개 후 기존 major 는 18 개월 유지" — v1.0.0~v1.3.0 은 **같은 major** 로, 디프리케이션 창이 열리지 않음. 즉 "공식 폐기"(a) 도 현 문서 정책에 맞지 않음.
- 실 소비자 없음 — editor 는 세션 104 에서 v1.3.0 으로 bump 됐고, 외부 SDK 가 legacy 를 직접 쓰는 경로 아직 없음.

정리: (a) 도 (b) 도 지금 결정할 근거 부족. 반면 세션 103 D5 에서 명시적으로 예고한 **L4 "의도된 drift" 최종 종결** 은 세션 104 editor bump 이후 자연스럽게 다음 단계다 — editor 가 v1.3.0 + fullbody v1.0.0 을 실 assembly 하기 시작했으므로 이 번들들이 **실 사용자 경로** 가 됐다. 회귀 방어 대상 승격이 이 시점에서 가장 우선순위가 높다.

## 2. 수정 — 4 golden 파일 + 4 regression tests

(1) **`packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar.json`** 신규 — 30 파츠, 그중 `parameter_ids` 18 회 (세션 100 Face 14 + 세션 102 비-Face 4), 15028 bytes.
(2) **`packages/exporter-core/tests/golden/halfbody_v1.3.0.web-avatar-bundle.snapshot.json`** 신규 — files[] 매니페스트 + 각 파일 sha256/bytes, 653 bytes.
(3) **`packages/exporter-core/tests/golden/fullbody_v1.0.0.web-avatar.json`** 신규 — 38 파츠, 그중 `parameter_ids` 25 회 (세션 101 Face 14 + 세션 102 비-Face 11), 17933 bytes.
(4) **`packages/exporter-core/tests/golden/fullbody_v1.0.0.web-avatar-bundle.snapshot.json`** 신규 — 653 bytes.

(5) **`packages/exporter-core/tests/web-avatar-bundle.test.ts`** 에 4 테스트 추가:
- `halfbody v1.3.0 bundle snapshot matches golden (세션 105)`
- `halfbody v1.3.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)` — `parts.length == 30` · `withParameterIds.length == 18` 이중 어서트
- `fullbody v1.0.0 bundle snapshot matches golden (세션 105)`
- `fullbody v1.0.0 web-avatar.json byte-for-byte + parameter_ids 전파 (세션 105)` — `parts.length == 38` · `withParameterIds.length == 25` 이중 어서트

Generator 는 임시 스크립트로 1 회 실행 — `loadTemplate` → `assembleWebAvatarBundle` → `snapshotBundle` 3-step 을 기존 v1.2.0 테스트 패턴 그대로 재사용.

## 3. 검증

- exporter-core tests **98→102 pass** (+4 회귀): halfbody v1.3.0 골든 2 종 · fullbody v1.0.0 골든 2 종 전부 byte-for-byte 매칭 + 파츠/opt-in 카운트 이중 검증.
- 기존 halfbody v1.2.0 web-avatar 골든 **0 바이트 변화 유지** — `grep -c parameter_ids halfbody_v1.2.0.web-avatar.json` = 0 (v1.2.0 spec 에 필드 부재 → 번들에도 부재, 세션 103 D5 "기존 spec 에 parameter_ids 부재로 L4 불변 유지" 확인).
- `pnpm run test:golden` 29/29 pass (exporter-core 외 골든 파이프라인 전부 불변).
- 신규 골든들의 parameter_ids 출현 분포:
    - `halfbody_v1.3.0.web-avatar.json`: 18 occurrences
    - `fullbody_v1.0.0.web-avatar.json`: 25 occurrences
    - `halfbody_v1.2.0.web-avatar.json`: 0 occurrences (불변 확인)

이 시점부터 halfbody v1.3.0 / fullbody v1.0.0 의 `parameter_ids` 변경은 **반드시 golden sha256 drift 를 유발** 한다. 세션 106 에서 ahoge 에 `parameter_ids: ["ahoge_sway"]` 를 넣거나, 잔여 substring-정확 파츠에 opt-in 을 추가하면 바로 이 golden 파일이 업데이트돼야 한다. 이는 세션 103 D5 에서 예고한 "의도된 drift" 의 실 작동이다.

## 4. 주요 결정축

**D1 — legacy 복제 판단은 인프라 블로킹 + 소비자 부재로 최종 연기**: (a) 공식 폐기는 docs/03 §7.3 "같은 major 내 minor 유지" 과 충돌, (b) migrator 확장은 migrator 자체가 없는 선행 블로커, (c) 실 소비자 없음. 세 조건이 겹친 상태에서 "결정 보류" 가 최선. 세션 106+ 에서 외부 SDK 사용자가 생기거나, runtime 전환(세션 97 후보) 중 migrator 가 저작되면 자연 재개될 것.

**D2 — golden 을 bundle-snapshot + web-avatar.json 양쪽으로 고정**: v1.2.0 기존 패턴과 동일. snapshot 은 files[] 매니페스트/sha256 fingerprint 를 한 파일에 요약, web-avatar.json 은 parts/parameters 트리를 byte-for-byte 고정. 두 축이 겹치지만 depth 가 다르다 — snapshot 깨지면 "어느 파일이 어떻게 달라졌는지" 가 먼저 보이고, web-avatar.json 깨지면 "어느 파츠/파라미터 필드가 어떻게 달라졌는지" 가 diff 에 드러난다. 회귀 원인 추적에 양쪽 다 가치 있음.

**D3 — 카운트 이중 어서트**: `got == want` byte-for-byte 에 더해 `parts.length` 과 `withParameterIds.length` 두 숫자를 별도 assert 로 재검증. Golden drift 시 메시지가 "halfbody v1.3.0 opt-in 18 parts (세션 100 Face 14 + 세션 102 비-Face 4)" 처럼 **의도된 숫자의 출처를 세션 번호와 함께 드러내므로**, PR 리뷰어가 drift 가 "의도된 것인지" 판단하기 쉬워진다. 세션 87 e2e `TEMPLATE_EXPECTATIONS` 와 동일 철학.

**D4 — 테스트 삽입 위치**: `textureOverrides path throw` 테스트 직전. 세션 35 textureOverrides 테스트가 파일 말미 이므로, 시간순(세션 35 → 105) 으로 해석하면 마지막 직전이 자연스러움. 향후 세션들이 파일 말미에 계속 덧붙이는 패턴 유지.

**D5 — Generator 는 1 회용 스크립트로, 커밋 안 함**: `node --input-type=module -e "..."` 한 줄로 4 golden 을 생성한 뒤 버림. 다시 빌드해야 할 때는 세션 105 doc 이나 이전 세션 생성 스크립트를 참고. golden 은 의도적으로 "손으로 관리되는 회귀 기준" 이라 자동 갱신 스크립트를 리포에 커밋하면 실수로 drift 를 허용할 위험 → `regen-goldens.mjs` 같은 파일은 명시적으로 **만들지 않는다**.

## 5. 결과 요약

| 축 | 변화 |
|---|---|
| golden 파일 | +4 신규 (halfbody v1.3.0 2 + fullbody v1.0.0 2), halfbody v1.2.0 기존 3 불변 |
| exporter-core tests | 98→**102 pass** (+4 회귀) |
| halfbody v1.3.0 `parameter_ids` 카운트 | **18/30 파츠 고정** (세션 100 Face 14 + 세션 102 비-Face 4) |
| fullbody v1.0.0 `parameter_ids` 카운트 | **25/38 파츠 고정** (세션 101 Face 14 + 세션 102 비-Face 11) |
| L4 drift 실증 | 세션 103 D5 "의도된 drift" 첫 상수 고정 — 앞으로 `parameter_ids` 관련 변경은 이 golden 을 반드시 갱신해야 함 |
| 기타 골든 | `halfbody_v1.2.0.web-avatar.json` 0 바이트 변화 유지 확인 (parameter_ids 출현 0 회) |

## 6. 다음 세션 후보

- **세션 106 후보**: halfbody v1.3.0 `ahoge.spec.json` 에 `parameter_ids: ["ahoge_sway"]` opt-in 추가 — 세션 104 D3 분리 항목. 효과: 현재 substring 규칙으로 `ahoge` role 이 `"hair_front"` 이라 `hair_front_*` 파라미터가 덤으로 노출되는 소폭 위험을 narrow. 이 변경은 **세션 105 golden 에 의도된 drift 를 유발** → halfbody_v1.3.0.web-avatar-bundle.snapshot.json + halfbody_v1.3.0.web-avatar.json 양쪽 갱신 필요. 세션 103 D5 의 "의도된 drift" 메커니즘 실 작동 첫 데모 사례가 된다.
- **세션 107 후보 (구 세션 105)**: legacy v1.0.0~v1.2.0 opt-in 결정 — D1 의 세 블로커(docs/03 §7.3 충돌 / migrator 부재 / 소비자 없음) 중 어느 하나라도 해소되면 재개. 그렇지 않으면 세션 120+ 까지 자연 연기 후 runtime 전환(세션 97) 합류 시점에 재평가.
- **C12 후보**: `deformers.json` warp/rotation 노드 parameter id ↔ `parameters.json` 교차 검증 (세션 99~104 지속 후보). Runtime 전환(세션 97 후보) 착수 전 방어망 1 단계 승격.
