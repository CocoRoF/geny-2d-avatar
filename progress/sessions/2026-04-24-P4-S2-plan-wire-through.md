# P4-S2 — planSlotGenerations → runGenerate wire-through + Mock per-category

**날짜**: 2026-04-24
**Phase**: β P4 (5 슬롯 자동 조립) — S2
**산출물**: `mockGenerateTextureFromPlans` + phase 2 per-category UX + auto-preview 동기화

---

## 왜 필요한가?

P4-S1 에서 `planSlotGenerations` 순수 모듈은 37 node:test 로 고정됐다. 하지만 runGenerate 는 여전히 **single Mock call** 로 동작 — β §3 (5 슬롯 자동 조립) 흐름이 런타임에 드러나지 않았다.

P3 (실 nano-banana) 합류 시 이 wire-through 자리에 벤더 어댑터만 꽂으면 끝. **지금 이 자리를 비워두면** P3 PR 은 "벤더 연결" + "per-category 구조" 두 가지를 한 번에 밀어넣어야 해 regression 찾기가 어려워진다.

## 구현 요약

### `mockGenerateTextureFromPlans(plans, atlas, onPlanStart?, onPlanEnd?)`

- `plans` = `planSlotGenerations(prompt, atlas.slots)` 반환.
- 카테고리 순서대로 iterate. 각 카테고리에서:
  1. `onPlanStart(plan)` — UX progress + cancel checkpoint 훅.
  2. 20ms 대기 (실 벤더 호출 시뮬레이션).
  3. 카테고리 focused prompt 로 `mockThemeFromPrompt` → theme 추출.
  4. `plan.slots` 의 slot 들만 draw (hue 도 focused prompt 로 파생).
  5. `onPlanEnd(plan)` — cancel checkpoint 재확인.
- 플랜 어디에도 속하지 않은 슬롯 (unknown role, Other) 은 마지막에 fallback prompt 로 그림 — 누락 방지.
- 4 카테고리 × 20ms ≈ 80ms 추가. β §7 5000ms 예산 안에서 충분 (phase 2 기존 < 100ms + 80ms = < 200ms).

### runGenerateAttempt phase 2 수정

```js
setPillPhase(2, "active");
genStatusEl.textContent = "텍스처 합성";
const slotPlans = planSlotGenerations(prompt, atlas.slots);
const mock = await mockGenerateTextureFromPlans(
  slotPlans,
  atlas,
  (plan) => {
    checkpoint();                                           // cancel per category
    genStatusEl.textContent = `${plan.category} 합성 (${plan.slots.length} 슬롯)`;
  },
  () => { checkpoint(); },
);
```

사용자가 보는 status 전이: "프롬프트 해석" → "텍스처 합성" → "Face 합성 (3 슬롯)" → "Hair 합성 (5 슬롯)" → ... → "atlas 재구성".

### auto-preview 동기화

초기 로드 시의 `runAutoPreview` 도 `planSlotGenerations` + `mockGenerateTextureFromPlans` 로 교체. "사용자가 Generate 를 안 눌러도 카테고리 flow 가 동작" — 일관성 확보.

## 핵심 설계 결정

### Mock 재사용 vs 별도 구현

기존 `mockGenerateTexture(prompt, atlas)` 는 보존. 두 가지 이유:
1. 이미 동작하는 single-call 경로를 지우면 P4-S2 외 다른 곳에서 regression 가능.
2. `mockGenerateTextureFromPlans` 는 plans 가 비었거나 slot 이 전부 unknown 이면 fallback 경로를 타야 — single-call 과 출력 parity 유지.

### per-category 20ms 지연

실 벤더는 카테고리당 수백 ms. Mock 에서 **너무 짧으면** 사용자가 "아 여러 호출이 일어나는구나" 를 체감 못 함. **너무 길면** β §7 5000ms 예산 박스 안에 압박. 4 × 20ms = 80ms 는 체감 가능 + 예산 여유의 균형.

### cancel checkpoint per-category

onPlanStart/onPlanEnd 에서 `cancelCheckpoint(state)` 호출. 사용자가 Hair 생성 중 Cancel 을 누르면 Body/Accessory 는 진입하지 않고 즉시 AbortError. 이는 실 벤더에서 더 중요 — 한 카테고리가 5초 먹으면 전체 flow 가 마비됨.

## 검증

- `pnpm --filter @geny/web-editor test` (e2e) — halfbody + fullbody pass. 렌더러 mount + structure renderer + LoggingRenderer 모두 회귀 없음.
- `pnpm -r test` 전체 workspace pass (web-editor-logic 191 + pixi 83 + 기타 전부 green).
- `node --check` 모듈 스크립트 syntax OK.
- ⚠️ **브라우저 수동 smoke 미확인** — runGenerate 클릭 시의 per-category status 전이는 자동 테스트 경로에 포함되지 않음. e2e 는 HTTP/DOM lifecycle 만 검증. 실 사용자 클릭 path 는 다음 기회에 Playwright/happy-dom 확장으로 회귀 고정 후보.

## 다음 단계

- **P2 phase 종료 게이트**: S1~S8 자동 회귀 + runGenerate 5000ms 내 완결 확인 → Phase P2 ✅ 전환 후보.
- **P4-S3** (후보): 카테고리별 metric (`category_attempts_total`, `category_ms` 분리) — 벤더 latency 분포 진단용. 현재 total event 한 개만.
- **P3** (BL-VENDOR-KEY 대기): `mockGenerateTextureFromPlans` 자리에 실 nano-banana 어댑터 plug-in. plans 구조 불변.

## 커밋

`feat(P4-S2): planSlotGenerations 을 runGenerate + auto-preview 에 wire + per-category Mock + 취소 checkpoint`.
