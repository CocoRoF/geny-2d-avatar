# P4-S1 — 프롬프트 → 슬롯별 생성 플랜 (순수 모듈 고정)

**날짜**: 2026-04-24
**Phase**: β P4 (5 슬롯 자동 조립) — 첫 세션
**산출물**: `@geny/web-editor-logic/prompt-slot-planner` 순수 모듈 + 37 node:test 회귀

---

## 왜 P3 이전에 P4 부분 착수?

`BL-VENDOR-KEY` 가 풀려 실 nano-banana 가 합류하기 전에도, **벤더에 무엇을 보낼지 결정하는 로직** 은 pure function 으로 고정 가능. 실 어댑터 wiring 한 곳만 P3 에서 바꾸고 본 모듈은 불변이 된다. 이렇게 경계를 긋지 않으면 P3 합류 시 "벤더 호출 자체" + "프롬프트 분해 규칙" 이 한 PR 에 섞여 regression 찾기가 어려워진다.

## 핵심 비즈니스 규칙 (본 모듈이 고정)

β 제품 §3: "사용자 프롬프트 1 줄 → 5 슬롯 자동 조립". Mock 은 1 prompt → 1 texture sheet 지만, 실 벤더는 카테고리별 (Face/Hair/Body/Accessory) **독립 호출** 을 병렬로 받는다. 본 모듈이 그 분해를 담당.

1. **프롬프트 파싱** (`extractPromptHints`) — 영/한 bilingual 키워드 카탈로그.
   - `blue hair` / `파란 머리` 양방향. `눈은 초록` 한글 역순 패턴도 잡음.
   - `STYLE_TAGS` 카탈로그 밖 단어는 추출하지 않음 (임의 키워드로 프롬프트 부풀리지 않기).
   - 한글 태그 (`귀여운`/`쿨한`/`전사`/`학생`...) → 영어 canonical 정규화 (벤더 프롬프트는 영어 프로밍 유리).

2. **카테고리별 포커스 프롬프트** (`buildSlotPrompt`):
   - Face: base + `<color> eyes` + `<tone> skin`
   - Hair: base + `<color> hair`
   - Body: base + `<color> outfit`
   - Accessory: base (+ 스타일 태그만)
   - **사용자 원본 프롬프트 echo 금지**. "blue hair red outfit" 을 Body 슬롯에 원본 그대로 넣으면 벤더가 머리카락을 그려버림. 구조화된 힌트로만 카테고리 격리 보장.
   - 모든 카테고리 base 에 `transparent background` 공통 — atlas 합성 시 배경 묻지 않게.

3. **슬롯 그룹화** (`planSlotGenerations`):
   - `role` prefix → `SlotCategory` 매핑 (`mapRoleToCategory`).
   - 같은 카테고리의 여러 슬롯 (예: `hair_front` / `hair_back` / `ahoge`) 은 **한 벤더 호출로 생성** — atlas-level grouping.
   - 결과 `SlotGenerationPlan[]` 은 카테고리 순서 `[Face, Hair, Body, Accessory]` 고정.
   - 해당 카테고리 슬롯이 0 개면 플랜에서 제외 (accessory 없는 템플릿 대응).

## 주요 설계 결정

### `userPrompt` echo 제거

초판에는 `buildSlotPrompt(category, userPrompt, hints)` 에서 `original: <userPrompt>` 를 프롬프트 끝에 echo 했다. 테스트 작성 중 카테고리 격리 assertion (`Body 에 blue hair 누출 금지`) 이 실패. 원본 echo 가 카테고리별 힌트 필터를 우회함을 확인.

**결정**: `userPrompt` 파라미터 제거. `buildSlotPrompt(category, hints)` 만 남김. 사용자 프롬프트는 `extractPromptHints` 가 받아 이미 카테고리별로 분해했으므로 그걸로 충분. 벤더는 structured 힌트 + stylings + base 만 받는다.

**회귀**: "원본 사용자 프롬프트 문자열이 그대로 echo 되지 않음" 테스트 (`mysterious phrase xyzzy magic-word` 가 4 카테고리 프롬프트 어느 곳에도 없음) 으로 고정.

### `mapRoleToCategory` 를 `categoryOf` 와 분리

기존 `category.ts#categoryOf` 는 UI 분류 (Head/Hair/Face/Body/Accessory/Other) 용. 본 모듈은 벤더 호출 축 (4 카테고리 — Other 제외) 이므로 coupling 금지. role key-space 확장 시 독립 튜닝.

### `extractPromptHints` 시그니처

`prompt: string | null | undefined` 로 완화. 구현은 `typeof prompt === "string" ? prompt : ""` 로 방어 — 어떤 입력도 throw 하지 않고 `styleTags: []` + `raw: ""` 반환.

## 테스트 회귀 (37)

```
▶ extractPromptHints — 14 tests (빈/non-string/영·한 color·style·skin/raw 보존/정렬·중복 제거)
▶ buildSlotPrompt — 8 tests (카테고리별 힌트 반영/격리/transparent bg/원본 echo 금지)
▶ mapRoleToCategory — 5 tests (Face/Hair/Body/Accessory prefixes + unknown)
▶ planSlotGenerations — 9 tests (end-to-end · 카테고리 순서 · slots 정렬 · 카테고리당 1 호출)
▶ 실제 halfbody/fullbody 샘플 — 2 tests (halfbody 23 파츠 + 한글 '파란 머리 귀여운 소녀')

Total: 155 (기존 118 + P4-S1 37). Pass 155/155.
```

## 다음 단계

- **P4-S2** (대기): planSlotGenerations 결과를 web-editor runGenerate 에 wire-through. 현재 Mock 은 단일 벤더 호출이므로, 카테고리별 호출을 시뮬레이트할 Mock 확장 + UI 진행률 표시 필요. 여전히 P3 실 벤더 없이 가능.
- **P3** (BL-VENDOR-KEY 대기): nano-banana 어댑터가 `planSlotGenerations(prompt, atlas.slots)` 결과를 받아 카테고리별로 실 HTTP 호출. 본 모듈은 건드리지 않음.

## 커밋

`feat(P4-S1): 프롬프트 → 5 슬롯 분배 로직 + 37 node:test 회귀` + 본 세션 문서 + tracker 갱신.
