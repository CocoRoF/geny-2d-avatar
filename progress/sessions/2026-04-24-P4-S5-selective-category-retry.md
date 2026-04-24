# P4-S5 — 카테고리별 selective retry (partial 복구 경로)

**날짜**: 2026-04-24
**Phase**: β P4 (5 슬롯 자동 조립) — S5
**산출물**: `partial-retry.ts` 순수 모듈 + 16 node:test + Mock 의 retryAttempt/canvas 옵션 + fault injection 확장 (`{firstOnly, always}`) + runGenerateAttempt selective retry wire + auto-preview selective retry + "🔄 재시도 복구" UX

---

## 왜 필요한가?

P4-S4 에서 partial failure 격리를 완성했지만, 현재는 partial 이 발생하면 **그대로 부분 성공을 확정** — 실패한 1 카테고리는 placeholder 로 남고 run 전체가 끝난다. 실 nano-banana (P3) 에선 1 카테고리의 transient 실패 (네트워크 스파이크, 일시 quota) 가 흔해질 것이라 partial = 최종이 되면 사용자는 "Hair 만 엉망" 인 아바타를 매번 봐야 한다. 반면 run 전체를 재시도하면 이미 성공한 3 카테고리의 벤더 호출을 또 지불 — 비용/latency 낭비.

**partial 만 선택적 재시도**가 정답. 실패한 카테고리의 plan 만 골라 벤더 재호출, 성공한 카테고리의 픽셀(canvas) 은 보존. 본 세션은 β 뼈대 단계에서 이 경로의 정책(어떤 plan 을 retry, outcome 을 어떻게 merge, UX 는 어떻게 구분)을 pure function 으로 고정해 P3 합류 시 어댑터 반환값만 그대로 연결하면 끝나게 한다.

## 구현 요약

### `partial-retry.ts` 순수 모듈 (`packages/web-editor-logic/src/`)

```ts
export function selectPlansForRetry(
  plans: readonly SlotGenerationPlan[],
  outcomes: readonly CategoryOutcome[],
): SlotGenerationPlan[];

export function mergeCategoryOutcomes(
  first: readonly CategoryOutcome[],
  retry: readonly CategoryOutcome[],
): CategoryOutcome[];
```

- **`selectPlansForRetry`**: outcomes 에서 ok=false 카테고리를 찾아 해당 카테고리의 plan 만 반환. 입력 plans 순서 보존 (벤더 호출 순서가 UX 에 영향 주므로). outcome 카테고리가 plans 에 없으면 무시 (방어적).
- **`mergeCategoryOutcomes`**: first + retry 결과 병합. 같은 카테고리는 **retry 가 우선** (retry 가 최종 상태), 원래 순서는 first 기준. retry 로 결정된 outcome 에는 `retried: true` 표시 — Grafana 가 first-try success 와 retry-success 를 분리할 수 있도록.
- **`CategoryOutcome.retried` 필드 추가**: 기존 4 필드 (category/ok/error) 에 옵션 `retried?: boolean` 1 개 부가. 기존 `summarizeCategoryOutcomes` 는 retried 를 무시 — 역호환 유지.

### 16 node:test 회귀

- **`selectPlansForRetry`** 6개:
  - 빈 outcomes / 모두 성공 / 1 실패 / 2 실패 (순서 보존) / 존재하지 않는 카테고리 무시 / plans 불변성.
- **`mergeCategoryOutcomes`** 10개:
  - 빈 retry 는 first 복제 (deep equal + 참조 다름) / retry 가 성공 override 시 retried=true / retry 도 실패 시 retried=true + ok=false / first 순서 보존 / retry only append / 원본 불변성 / error 덮어쓰기 / 성공 카테고리도 retried=true / summarizeCategoryOutcomes 조합 (partial→success) / summarizeCategoryOutcomes 조합 (partial 유지).

### `mockGenerateTextureFromPlans` retry-aware 옵션

```js
mockGenerateTextureFromPlans(plans, atlas, onPlanStart, onPlanEnd, options);
// options: { canvas?: HTMLCanvasElement, retryAttempt?: number }
```

- `retryAttempt > 0` 이면 **기존 canvas 재사용** (clearRect / resize 건너뜀), plans 카테고리만 덧그림, "plans 밖 슬롯" fallback 루프도 skip.
- 반환값에 `canvas` 참조 추가 — 호출자가 retry 시 두번째 호출의 options 로 전달.
- **fault injection 확장**:
  - 기존: `"Hair"` / `["Hair", "Body"]` — 항상 실패 (backward compat 유지).
  - 신규: `{ always: [...], firstOnly: [...] }` — `firstOnly` 는 첫 시도에만 실패, retry 에선 성공.
- `firstOnly` 덕분에 devtools 에서 `window.__genyInjectCategoryFault = { firstOnly: ["Hair"] }` 로 설정하고 Generate → first attempt partial → selective retry → success 경로를 즉시 재현 가능.

### runGenerateAttempt selective retry wire

- 첫 mock 호출 → `firstOutcomes` + `firstSummary`.
- `firstSummary.status === "partial"` 이면:
  1. 실패 카테고리 plan subset 을 `selectPlansForRetry` 로 선별.
  2. `retryMetrics` 별도 배열로 onPlanEnd 에서 누적 (초기 ok=true).
  3. `mockGenerateTextureFromPlans(retryPlans, atlas, ..., { canvas: mock.canvas, retryAttempt: 1 })` 호출.
  4. retry 결과로 retryMetrics 의 ok 보정.
  5. `categoryMetrics` 엔트리를 retry 값으로 **in-place 교체** — Grafana 에서 run 당 카테고리 1개 유지 (double-count 회피).
  6. `mergeCategoryOutcomes(first, retry)` 로 최종 outcomes 산출.
  7. `URL.revokeObjectURL(firstBlob)` + retry mock 의 textureUrl 을 mockResult 로 채택.
- `outcomeRef.retriedCategories` 에 `retried: true` 인 카테고리 목록 저장 — UI/metric 분기용.

### partial 복구 UX

- **success (첫 시도 성공)**: `✓ 123ms`
- **partial_recovered (retry 로 복구)**: `✓ 145ms · 🔄 재시도 복구 (Hair)`
- **partial_success (retry 후에도 부분 실패)**: `✓ 167ms · ⚠ 부분 성공 — 실패: Hair`
- 메트릭 `stopReason` 도 3 분기: `success` / `partial_recovered` / `partial_success`. `ok` 축은 partial 만 false (recovered 는 true — 최종 avatar 완전 성공).
- auto-preview 도 같은 경로: partial 시 selective retry + 재시도 복구 suffix 를 `console.info` 에.

## 핵심 설계 결정

### 한 run 당 selective retry 는 최대 1회

retry 에서도 partial 이 나오면 그대로 accept — 2차 retry 는 없다. 이유:
- partial 이 반복되는 카테고리는 정책적 문제 (벤더 품질 저하, safety trip) 일 가능성 높음. 무한 루프 금지.
- β §7 5000ms 예산 안에서 Mock 1차+2차 = 160ms 로 충분하지만, 실 벤더에선 2차 retry 가 budget over 위험.
- 반복 실패 카테고리는 Grafana 에서 `category_ok=false AND stopReason=partial_success` 로 필터해 정책 개입 대상으로 구분.

### `categoryMetrics` 는 in-place 교체 (append X)

retry 가 새 metric 엔트리를 push 하면 run 당 카테고리 엔트리가 N → N+1 이 돼 Grafana 가 `avg(geny_generate_category_duration_ms)` 를 query 할 때 double-count. `categoryMetrics[i] = { ...r }` 로 덮어쓰면 run 당 카테고리 1개 유지 + retry 의 ms 가 최종 관측 latency 로 기록.

### `retried` 필드는 `CategoryOutcome` 에만, `GenerateCategoryMetric` 엔 아직 추가 X

metric 라벨에 `category_retried` 를 붙이면 기존 `generate.category` 이벤트 구조 변경 + P4-S3 테스트의 label 비교가 깨짐. 본 세션은 비즈니스 로직 (재시도 경로 + UX) 에 집중하고, metric 라벨 확장은 **P4 phase 종료 직전** 의 별도 슬라이스로 분리. `outcomeRef.retriedCategories` 는 emit 시점에 retry 유무를 외부에서 알 수 있는 경로 (stopReason=partial_recovered 로 충분).

### Canvas 재사용은 Mock 최적화, 실 벤더 합류 시에도 유효

실 nano-banana 어댑터에서도 "이미 성공한 카테고리의 결과 이미지" 를 로컬 canvas 에 composite 한 채로, 실패 카테고리만 새 벤더 이미지로 덧그리는 경로가 동일. Mock 의 canvas 재사용 규약이 P3 wiring 에서도 그대로 재사용되도록 설계.

### partial_recovered 는 `ok: true`, partial_success 는 `ok: false`

- `partial_recovered`: retry 로 모든 카테고리 성공 = 최종 avatar 완전. 사용자/벤더 모두 "성공" 이 맞음. 하지만 `stopReason=partial_recovered` 로 retry 가 있었다는 신호는 남김 → Grafana 에서 "silent retry 비율" 추적 가능.
- `partial_success`: 2차 시도도 1+ 실패 = avatar 는 placeholder 포함. run 레벨 `ok=false` 로 벤더 안정성 축에서 분리.

### fault injection 의 `firstOnly` 는 P3 이후에도 유용

실 벤더 환경에서도 "transient 실패 재현" 은 E2E 테스트에 필요. `firstOnly: ["Hair"]` 는 어댑터 테스트에서도 같은 의미 (첫 호출 fail, 두번째 호출 success) 로 재활용 가능. 본 훅이 Mock 전용이 아닌 generic pattern 으로 남음.

## 검증

- `pnpm --filter @geny/web-editor-logic test` → **230/230 pass** (214 + 16 신규).
- `pnpm -r test` → 전체 workspace 녹색.
- `pnpm --filter @geny/web-editor run build:public` → vendor dist 재빌드 OK.
- `pnpm --filter @geny/web-editor test` (e2e) → halfbody + fullbody pass.
- ⚠️ **브라우저 수동 smoke 미확인** — 다음 수동 검증 경로:
  1. `window.__genyInjectCategoryFault = { firstOnly: ["Hair"] }` + Generate → `✓ Nms · 🔄 재시도 복구 (Hair)` 표시되고 atlas 완전 성공.
  2. `window.__genyInjectCategoryFault = { always: ["Body"] }` + Generate → `✓ Nms · ⚠ 부분 성공 — 실패: Body` 표시되고 Body 만 placeholder.
  3. `window.__genyInjectCategoryFault = { always: ["Face", "Hair", "Body", "Accessory"] }` + Generate → CategoryRunFailedError → 재시도 루프 → 최종 실패.

## 다음 단계

- **P4-S6 후보**: P4 phase 종료 게이트 — S1~S5 자동 회귀 + Mock 5000ms 내 (1 run + 1 partial retry 포함) 예산 검증 + 누적 session doc 합본 → Phase P4 🟢→✅ 전환.
- **P2 phase 종료 게이트 재확인**: 본 슬롯 retry 이후 β §7 5000ms 예산이 1 partial 재시도까지 포함했을 때도 유지되는지 측정.
- **P3** (BL-VENDOR-KEY 대기): 실 어댑터의 `CategoryResult` → `CategoryOutcome` 매핑 + 본 세션의 selective retry 규약 불변.
- **P4-S3+S5 metric 확장 슬라이스** (후보): `category_retried` 라벨 추가 — `geny_generate_category_duration_ms{category_retried}` 로 first-try vs retry 분리 가능.

## 커밋

`feat(P4-S5): 카테고리별 selective retry + partial 복구 UX + 16 신규 회귀`.
