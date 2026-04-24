# P4-S3 — 카테고리별 vendor latency 메트릭

**날짜**: 2026-04-24
**Phase**: β P4 (5 슬롯 자동 조립) — S3
**산출물**: `generate.category` 이벤트 + `summarizeMetricHistory` 카테고리 집계 + dev 패널 cats 행 + 10 새 테스트

---

## 왜 필요한가?

P4-S2 에서 `mockGenerateTextureFromPlans` 가 카테고리당 한 번씩 vendor call 을 흉내내도록 바뀌었다. 하지만 텔레메트리는 **phase 총합 + total** 두 축뿐이라 "Hair 카테고리만 느림" 같은 분포는 로그만 봐선 알 수 없다. P3 합류 후 실 nano-banana 가 카테고리마다 다른 latency 를 보일 때 SLO 회귀를 **Grafana 에서 즉시** 잡으려면 metric 축이 지금 있어야 한다.

반대로 모든 것을 phase_ms 에 섞어 두면 "Hair 벤더가 살짝 느려짐" 을 "phase 2 전체가 느려짐" 으로만 보여 주어 근본 원인 추적이 지연된다. P5 스크레이퍼가 붙을 때 스키마를 바꾸면 Grafana 쿼리 + alert rule 이 깨지므로 β 단계에서 **먼저** 축을 고정한다.

## 구현 요약

### 스키마 확장 (`packages/web-editor-logic/src/metrics.ts`)

- `GenerateMetricKind` 유니온에 `"generate.category"` 추가.
- 새 타입 `GenerateCategoryMetric = { category, ms, slotCount, ok }` — 카테고리 한 번의 측정 단위.
- `BuildGenerateMetricsInput` 에 옵셔널 `categories?: readonly GenerateCategoryMetric[]`.
- `buildGenerateMetricEvents` 가 `categories` 가 있으면 N 개의 이벤트를 **total 뒤에** append. 각 이벤트는 `name: "geny_generate_category_duration_ms"`, `labels: { ...baseLabels, category, slot_count, category_ok }`. `prompt_len` / `budget_*` 는 total 전용이라 category 에는 없음.

### 집계 확장

- `MetricHistorySnapshot` 에 `categoryAverages`, `categoryCounts`, `categoryOkCounts` 세 필드 추가.
  - `categoryCounts` — 분모 복구용.
  - `categoryOkCounts` — 성공 회수 (`category_ok="true"`). `categoryCounts - categoryOkCounts` = 실패 회수.
- `summarizeMetricHistory` 에 `categorySums` 버킷을 추가하고 `generate.category` 이벤트를 phase 와 동일한 패턴으로 처리. `category` 라벨이 누락된 이벤트는 집계에서 제외 (phase 처리와 동일 규약).

### index.html wiring

- `runGenerateAttempt(prompt, atlas, t0, phaseMs, getCancelState, categoryMetrics)` — 6번째 파라미터로 out-array 주입.
- phase 2 내부 `onPlanStart(plan)` 에서 `planStartAt.set(plan.category, performance.now())`, `onPlanEnd(plan)` 에서 `categoryMetrics.push({ category, ms = now - startedAt, slotCount, ok: true })`.
- `runGenerate` 에서 `categoryMetrics = []` 을 선언, attempt retry 시 reset.
- `emitGenerateMetrics` 가 옵셔널 `categories` 를 받아 builder 에 전달. 빈 배열은 스킵 (기존 auto-preview 호출자는 변경 없음).
- 성공 경로: `categories: categoryMetrics` 로 emit.
- 취소 경로: 완료된 카테고리까지의 ms 를 그대로 emit — "어디까지 진행됐는지" 진단용.
- 에러 경로: 이미 누적된 카테고리는 `ok: false` 로 오버라이드 — 벤더 실패 분포의 맥락 보존.
- auto-preview 도 같은 훅 구조로 emit — 초기 화면 렌더의 카테고리 분포도 관측.

### dev 패널 (`?debug=metrics`)

- `cats:` 줄 추가. `Face 22ms · Hair 40ms · Body 18ms · Accessory 10ms!1` 형식 — 뒤의 `!N` 은 실패 회수.
- 카테고리가 관측되기 전에는 `cats: —`.
- 표시 순서는 `PROMPT_CATEGORY_ORDER` 고정 (관측된 것만 필터).

## 핵심 설계 결정

### total 이후에 append — 기존 6 이벤트 순서 보존

기존 `runCount = total 이벤트 개수` 규약을 깨지 않기 위해 category 이벤트는 total **뒤** 로. 이 덕에 "runCount 가 갑자기 2 배로 부풀었다" 같은 Grafana 회귀를 방지. `summarizeMetricHistory` 도 `runCount` 는 여전히 `generate.total` 만 센다 (신규 테스트 `category 이벤트는 runCount/budget 집계에 영향 없음` 로 고정).

### `category_ok` 라벨 분리

한 Generate run 안에서 **전체는 실패했지만 Hair 만 실패** 같은 패턴이 실 벤더에서 흔하다. `ok` (run 전체) 와 `category_ok` (이 카테고리 call) 를 분리해 "run 실패율" 과 "카테고리별 실패율" 을 독립 축으로 Grafana 에서 쿼리 가능. P3 합류 시 카테고리별 partial failure 를 여기 실어 보낼 자리가 이미 있다.

### 재시도 attempt 시 `categoryMetrics` 초기화

재시도 2차가 성공하면 그때의 latency 가 실제로 사용자가 느낀 값 — 1차 실패 attempt 의 부분 측정을 같이 emit 하면 평균이 오염된다. runGenerate 의 while loop 진입 시 `categoryMetrics = []` reset.

### 카테고리 label 누락 방어

`generate.category` 이벤트에 `category` 라벨이 어떤 이유로든 없으면 집계에서 제외. phase 와 동일 규약 — 라벨 스키마가 깨진 이벤트가 평균을 오염시키지 않도록. 테스트 `category label 누락된 이벤트는 집계 제외` 로 고정.

### dev 패널에서 관측된 카테고리만 표시

`PROMPT_CATEGORY_ORDER` 전체 4개를 항상 —ms 로 렌더하면 "관측 안 됨" 과 "0ms" 가 시각적으로 구분 안 됨. 실제 이벤트 있는 것만 노출해 패널을 읽기 쉽게.

## 검증

- `pnpm --filter @geny/web-editor-logic test` → **201/201 pass** (기존 191 + 신규 10개).
  - `buildGenerateMetricEvents — categories (β P4-S3)` 5개: 역호환 (categories 생략), 빈 배열 guard, 10 이벤트 구조 + 라벨, category 전용 라벨 분리, 입력 순서 보존.
  - `summarizeMetricHistory — categories (β P4-S3)` 5개: 빈 snapshot, 단일 run 4 카테고리, 3 runs × 같은 카테고리 평균/okCount, 라벨 누락 방어, runCount 독립.
- `pnpm -r test` → 전체 workspace pass (web-editor-logic 201 + 다른 패키지 기존 count 그대로).
- `pnpm --filter @geny/web-editor run build:public` → vendor dist 재빌드 OK. index.html 이 새 스키마를 그대로 import.
- `pnpm --filter @geny/web-editor test` (e2e) → halfbody + fullbody pass. 렌더러 lifecycle 회귀 없음.
- ⚠️ **브라우저 수동 smoke 미확인** — dev 패널 cats 줄 / 실 Generate 클릭 후의 category 이벤트 emit 은 자동 회귀 경로에 포함되지 않음. 이는 P4-S2 와 동일한 gap — Playwright/happy-dom 확장에서 회귀 고정 후보.

## 다음 단계

- **P2 phase 종료 게이트 재확인**: S1~S8 + P4 wire-through 까지 모두 자동 회귀 고정 → β §7 5000ms 예산 내 category 4개 + phase 5개 모두 OK.
- **P3** (BL-VENDOR-KEY 대기): `mockGenerateTextureFromPlans` 자리에 nano-banana 어댑터 plug-in. 신규 category 스키마는 그대로 — 어댑터가 per-category ms 를 돌려만 주면 된다.
- **P5** (로그 스크레이퍼): `geny_generate_category_duration_ms` histogram 화. `category_ok="false"` counter 로 partial failure alert.

## 커밋

`feat(P4-S3): per-category metric 이벤트 + summarize 카테고리 집계 + dev 패널 cats + 10 신규 테스트`.
