# P4-S4 — 카테고리별 partial failure 격리 + 부분 성공 UX

**날짜**: 2026-04-24
**Phase**: β P4 (5 슬롯 자동 조립) — S4
**산출물**: `category-outcome.ts` 순수 모듈 + 13 node:test + Mock per-category try/catch + fault injection dev 훅 + partial 성공 UI/metric 경로

---

## 왜 필요한가?

P4-S3 에서 per-category metric 축이 fix 되었지만, 현재 Mock `mockGenerateTextureFromPlans` 는 **카테고리 하나라도 throw 하면 run 전체 실패** — P3 실 nano-banana 합류 시 벤더 4 개 중 1 개만 블립이 와도 전체가 죽는 상태. β 제품 §7 의 "5초 내 프리뷰" SLO 는 "일부 슬롯이 placeholder 여도 avatar 는 뜬다" 로 해석해야 현실적이다. 이번 세션은 "Hair 만 실패 → 나머지 3 카테고리는 그려지고, 사용자에게 ⚠ 부분 성공 표시" 라는 business case 를 skeleton 단계에서 고정한다.

partial failure 를 P3 합류 시 처음 만나면 (a) 비즈니스 의미 (atlas 교체 vs 유지), (b) UI 문구, (c) metric ok 라벨 분기 세 가지를 동시에 결정해야 해 regression 비용이 크다. 지금 Mock 에서 fault inject 로 먼저 경로를 만들어 두고 node:test 로 규약을 고정하면, P3 에선 어댑터 반환값을 그대로 꽂기만 하면 된다.

## 구현 요약

### `category-outcome.ts` 순수 모듈 (`packages/web-editor-logic/src/`)

```ts
export type CategoryRunStatus = "success" | "partial" | "failed" | "empty";

export interface CategoryOutcome {
  readonly category: string;
  readonly ok: boolean;
  readonly error?: string;
}

export interface CategoryOutcomeSummary {
  readonly status: CategoryRunStatus;
  readonly total: number;
  readonly okCount: number;
  readonly failedCount: number;
  readonly successCategories: readonly string[];
  readonly failedCategories: readonly string[];
  readonly displayMessage: string;
}

export function summarizeCategoryOutcomes(outcomes): CategoryOutcomeSummary;
export function hasRenderableResult(summary): boolean;
```

- **4 상태 분류**:
  - `success` — 모든 카테고리 ok.
  - `partial` — 1+ 성공 AND 1+ 실패.
  - `failed` — 모든 카테고리 실패.
  - `empty` — 카테고리 0개 (atlas 에 알려진 role 이 없을 때 — 다른 경로).
- **displayMessage**: UI status 바에 그대로 쓸 1줄 한글 문구. `status` 별로 prefix (`✓ / ⚠ / ✗`) + 카테고리 이름 조합.
- **`hasRenderableResult(summary)`**: success/partial 은 atlas 교체, failed/empty 는 placeholder 유지 — runGenerate 와 auto-preview 에서 동일 규약으로 사용.
- **순서 보존**: `successCategories` / `failedCategories` 는 입력 순서 유지 (정렬 X) — Grafana 축에 카테고리 등장 순서를 보존.
- **error 필드는 진단 전용**: metric cardinality 를 늘리므로 요약 카운트에는 영향 없음. 테스트 `error 필드는 요약 카운트에 영향 없음` 으로 고정.

### 13 node:test 회귀

- 경계 (빈 배열 / 단일 성공 / 단일 실패) 3개.
- 4 카테고리 분포 (4/4 성공, 1 실패 partial, 4/4 실패, 2+2 partial) 4개.
- 순서/라벨 (입력 순서 보존, error 영향 없음) 2개.
- `hasRenderableResult` 4 status 2개.
- 불변성 (입력 배열 변경 없음, 반환 배열 비공유) 2개.

### `mockGenerateTextureFromPlans` per-category try/catch

- 각 카테고리 루프를 `try { ... } catch (err) { ... }` 로 감싼다. 실패 시 해당 카테고리 슬롯은 fallback prompt 로 그려 "Hair 만 placeholder" 시각적 단서를 남김.
- `categoryOutcomes: [{category, ok, error?}, ...]` 을 반환값에 추가 — runGenerate 가 요약 근거.
- **fault injection dev 훅**: `window.__genyInjectCategoryFault = "Hair"` (문자열) 또는 `["Hair", "Body"]` (배열) 이면 해당 카테고리는 강제로 `throw new Error("[fault-inject] ...")`. 이 훅은 **프로덕션 UI 에 노출 X** — DevTools console 에서 직접 설정해야 작동하는 진단용.

### runGenerateAttempt wire-through

- 7번째 파라미터 `outcomeRef` 추가 — `{ summary: null }` 객체로 운영 경로에 요약 전달.
- phase 2 종료 후:
  - `mock.categoryOutcomes` 와 `categoryMetrics` cross-reference 해 metric entry 의 `ok` 플래그를 실제 실패 카테고리만 `false` 로 보정.
  - `summarizeCategoryOutcomes(outcomes)` 호출 + `outcomeRef.summary` 에 스토어.
  - `summary.status === "failed"` 면 `CategoryRunFailedError` throw — 재시도 루프가 처리.

### runGenerate UI + metric 분기

- 성공 path 에서 `outcomeRef.summary?.status === "partial"` 이면:
  - status bar: `✓ 123ms · ⚠ 부분 성공 — 실패: Hair` (기존 `✓` 뒤에 suffix).
  - metric `ok: false` + `stopReason: "partial_success"` — Grafana 에서 "avatar 는 교체되었지만 일부 카테고리 실패" 축을 success 와 분리해 볼 수 있음.
- auto-preview 도 동일 요약 사용. partial 이면 metric ok=false + console.info 에 `· displayMessage` 추가.

## 핵심 설계 결정

### partial 은 "success + warning" 이 아닌 **별도 ok=false 축**

실 SLO 의미론에서 "avatar 가 화면에 떴다" ≠ "모든 벤더가 성공했다". partial 을 ok=true 로 넣으면 "벤더 안정성 99.9%" 같은 쿼리가 현실을 과장. 대신:
- Grafana success rate = `count(ok=true) / count(*)` → 벤더 안정성.
- UX success rate = `count(budget_ok=true AND atlas 교체) / count(*)` → 사용자 체감.
두 축을 분리해야 P5 장기 관찰에서 의사결정이 깨끗해진다.

### failed 만 throw, partial 은 return

`hasRenderableResult` 는 partial 도 true — 이 경우 atlas 는 교체된 블롭으로 **일부 카테고리 placeholder + 성공 카테고리 혼합**. 사용자가 "아무것도 안 바뀌었다" 고 오해하지 않도록 화면 업데이트는 발생. failed (모든 카테고리 실패) 만 throw 하면 retry plan 이 자동으로 한 번 더 시도.

### Mock 에서의 fault injection 은 opt-in dev 훅

`__genyInjectCategoryFault` 는 URL query param 이 아닌 **console 에서 직접 설정하는 global**. 이유:
- URL 기반이면 실수로 링크 공유 시 사용자에게 artifact 노출.
- 개발자/QA 가 브라우저 devtools 로 `window.__genyInjectCategoryFault = "Hair"; await runGenerate(...)` 실행 → partial UX 즉시 검증 가능.
- 프로덕션 코드 경로에는 `faultSet.has(plan.category)` 한 if 만 있어 zero cost.

### Failed 카테고리도 fallback prompt 로 그린다

실 벤더에선 "vendor 실패 → slot 비어있음" 이 시각적 회귀 (투명 hair 슬롯). Mock 에서도 같은 규약 — fallback prompt 로 placeholder 를 그려 "Hair 가 없어서 Face 가 뚫렸다" 같은 혼란을 막는다. P3 어댑터에선 "fallback image URL" 을 반환해 같은 경로를 재사용 가능.

### `error` 필드는 message 문자열만

stack trace 를 담으면 metric cardinality 폭발. `err?.message ?? String(err)` 로 짧게 고정. 요약 카운트에는 영향 없음 (테스트로 고정).

## 검증

- `pnpm --filter @geny/web-editor-logic test` → **214/214 pass** (기존 201 + 신규 13).
- `pnpm -r test` → 전체 workspace 녹색.
- `pnpm --filter @geny/web-editor run build:public` → vendor dist 재빌드 OK.
- `pnpm --filter @geny/web-editor test` (e2e) → halfbody + fullbody pass.
- ⚠️ **브라우저 수동 smoke 미확인** — fault injection 훅 설정 후 실제 partial UX 는 자동 회귀에 없음. DevTools console 에서 `window.__genyInjectCategoryFault = "Hair"` 설정 후 Generate 클릭 → "⚠ 부분 성공 — 실패: Hair" 문구 + 3 카테고리 정상 렌더 + metric ok=false 확인이 후속 (Playwright 확장 후보).

## 다음 단계

- **P3** (BL-VENDOR-KEY 대기): 실 어댑터의 `CategoryResult` → `CategoryOutcome` 매핑. 본 세션의 규약/UI/metric 모두 불변.
- **P4-S5** (후보): partial failure 시 **부분 재시도** — 실패한 카테고리만 선택적으로 재시도. 현재는 run 전체 재시도만.
- **P2 phase 종료 게이트 재확인**: S1~S8 + P4-S1~S4 자동 회귀 + 5000ms 예산 내 partial 경로 유지 확인 → Phase P2 ✅ 전환.

## 커밋

`feat(P4-S4): 카테고리별 partial failure 격리 + 부분 성공 UX + 13 신규 회귀`.
