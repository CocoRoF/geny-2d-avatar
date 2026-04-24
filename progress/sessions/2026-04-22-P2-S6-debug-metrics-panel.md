# P2-S6 — `?debug=metrics` dev 패널: generate 이벤트 실시간 집계 (2026-04-22)

## 1. 트리거

P2-S4 가 `emitMetric` + `__genyMetricsSink` fan-out 경로를 뚫었고 P2-S5 가
이벤트 스키마 14 개를 `buildGenerateMetricEvents` 순수 함수 + node:test 로
고정했다. 그러나 개발 중 실제로 "budget 5000ms 를 지금 몇 % 넘기고 있는가",
"ingest phase 평균 ms 가 얼마인가" 를 육안 확인하려면 **매 generate 마다
devtools Console 을 스크롤**해야 했다. P5 staging 의 Grafana 가 준비되기
전까지, 로컬 브라우저에서 **한 번 보고 판단** 할 수 있는 가벼운 패널이 없다.

β 제품 정의 §7 "≤5000ms prompt→preview" 예산은 P2-S3 에서 total timing 표시만
있고, 누적 rate 는 기록되지 않는다. 여러 번 Generate 돌려보며 "프롬프트 길이
/ 템플릿 교체가 예산 초과율에 어떤 영향을 주는가" 를 빠르게 감지하려면
budget_ok rate + p95 + phase 평균을 실시간 집계해야 한다.

## 2. 산출물

### 2.1 순수 집계 함수 — `summarizeMetricHistory`

`packages/web-editor-logic/src/metrics.ts` 에 신설:

```ts
export interface MetricRunSummary {
  readonly ts: number;
  readonly ok: boolean;
  readonly totalMs: number;
  readonly promptLen: number;
  readonly template: string;
  readonly trigger: string;
  readonly budgetMs: number;
  readonly budgetOk: boolean;
}

export interface MetricHistorySnapshot {
  readonly eventCount: number;
  readonly runCount: number;
  readonly budgetOkCount: number;
  readonly budgetOverCount: number;
  readonly budgetOkRate: number | null;
  readonly phaseAverages: Readonly<Record<string, number>>;
  readonly avgTotalMs: number | null;
  readonly p95TotalMs: number | null;
  readonly lastRun: MetricRunSummary | null;
}

export function summarizeMetricHistory(
  events: readonly GenerateMetricEvent[],
): MetricHistorySnapshot;
```

- **한 번 iterate** 로 phase 별 sum/count · total 배열 · budget_ok/over 카운트
  · lastRun 메타 수집.
- `budgetOkRate = null` when `runCount=0` — "0 % ok" (실패 100%) 와 "데이터
  없음" 을 UI 가 구분하도록.
- `p95TotalMs` — sort + `Math.ceil(0.95·n) - 1` index. 정식 Prometheus
  histogram 은 P5, β 는 상대 추세 파악용.
- `phaseAverages` — 관측 phase 만 키 포함. 미관측 phase (예: auto-preview 의
  ingest=0) 도 value=0 으로 들어와 평균에 반영되는 것은 의도.

### 2.2 package export

`packages/web-editor-logic/src/index.ts`:

```ts
export {
  buildGenerateMetricEvents,
  METRIC_PHASE_LABELS,
  summarizeMetricHistory,
} from "./metrics.js";
export type {
  BuildGenerateMetricsInput,
  GenerateMetricEvent,
  GenerateMetricKind,
  MetricHistorySnapshot,
  MetricRunSummary,
} from "./metrics.js";
```

### 2.3 단위 테스트 — 9 신규 (총 80)

`packages/web-editor-logic/tests/metrics.test.ts`:

- 빈 입력 → runCount=0, `budgetOkRate=null`, `avgTotalMs=null`,
  `phaseAverages={}`, `lastRun=null`.
- phase 만 있고 total 없음 → runCount=0 + phaseAverages 는 채워짐.
- 단일 Generate (6 이벤트) → runCount=1, phaseAverages 각 phase 단일값,
  avgTotalMs=150, p95=150, lastRun 메타 전 필드 매칭.
- 3 회 집계 (ok/ok/over) → rate=2/3, avgTotalMs = 합계/3, ingest/paint 평균.
- lastRun 은 마지막 total event 기준 — trigger/template 바뀌면 마지막 것
  반영.
- p95 index — 5 샘플 `[10..50]` → 50; 20 샘플 `[1..20]` → 19.
- label 누락된 total event → runCount 에는 포함되지만 budgetOkCount/
  OverCount 둘 다 +0 (rate=0).
- phase label 누락된 phase event → `phaseAverages` 에서 skip.

### 2.4 index.html 오버레이 — `?debug=metrics`

`apps/web-editor/index.html`:

- `debugFlagSet.has("metrics")` → `debugMetricsEnabled` 플래그.
- 활성 시 `div#debug-metrics-panel` 을 `position:fixed` 우하단에 부착
  (320px × 50vh max, 반투명 darkslate, monospace, `z-index: 9999`).
- ring buffer `ring[]` — capacity 200. Generate 1 회 6 이벤트 → 약 33 run
  분량. overflow 시 `splice(0, excess)` 로 앞쪽 drop.
- `globalThis.__genyMetricsSink` 를 패널 자체의 push 함수로 설정. P2-S4 의
  `emitMetric` 은 sink 가 설치돼 있으면 fan-out 하도록 이미 배선돼 있음.
- 매 sink 호출마다 `summarizeMetricHistory(ring)` → `rerender()` 가 6 노드
  (event-count, runs, budget, avg/p95, phases, last-run) 텍스트 갱신.
- 테스트 훅 `globalThis.__genyDebugMetrics`: `getEvents()` / `getSnapshot()` /
  `clear()`. e2e/dev tool 이 패널 내용 확인 가능.

### 2.5 zero-cost 기본 경로

`debugMetricsEnabled === false` 시 — 패널 DOM 생성 없음, sink 설치 없음,
ring buffer 없음. `emitMetric` 은 `console.info` 만 호출. P2-S4 기존 경로
회귀 없음.

## 3. 판단 근거

- **왜 순수 함수로 분리?** `summarizeMetricHistory` 는 reducer 로직이 전부
  — DOM 없이 node:test 로 9 테스트 고정 가능. 패널 렌더 변경이 집계
  정확성을 깨뜨리는 회귀를 차단. P5 log scraper 가 동일 함수로 staging
  metric 을 server-side 집계할 때 재사용 가능.
- **왜 `budgetOkRate=null`?** runCount=0 일 때 0 을 리턴하면 "0% ok" (항상
  실패) 로 오인. `null` ↔ "—" UI 표시 로 명시적으로 "데이터 없음" 을 분리.
- **왜 p95 를 rudimentary index 로?** 정확한 percentile (linear interp) 은
  샘플 적을 때 쓸모없음. β 단계 dev 패널은 "최근 33 run 중 worst-5 %
  보고싶다" 수준 → `ceil(0.95n)-1` index 면 충분. 정식 SLO 는 P5 Prometheus
  histogram_quantile.
- **왜 ring buffer 200?** Generate 1 회 = 6 이벤트, 200 / 6 ≈ 33 run.
  5000ms 예산 기준 33 run × 5s = 165s 세션 길이 — dev inspection 1 회에
  충분. 메모리 footprint 는 200 개 레퍼런스로 무시 가능. overflow drop 은
  head 쪽이라 `lastRun` 은 보존.
- **왜 ring 을 `summarizeMetricHistory` 가 아니라 패널 내부에 두나?** 집계
  함수는 "배열을 받는다" 만 책임. ring / overflow 정책은 UI 계약. P5 에서
  서버가 window-based 집계할 땐 다른 정책을 쓸 수 있어야 함.
- **왜 `__genyDebugMetrics` 훅을 노출?** 향후 e2e 테스트가 "Generate 1 회
  → 패널에 runCount=1 보이는가" 를 happy-dom 에서 검증할 때 DOM 스크래핑
  대신 `getSnapshot()` 을 호출 가능. 현재 test 는 작성 안 함 (DOM 패널
  렌더는 실 브라우저 시나리오라 과잉) — hook 만 준비.
- **왜 우하단 고정?** TopBar / Generate-bar / Inspector 와 안 겹치는 유일한
  남는 영역. `z-index:9999 + pointer-events:auto` 로 stage interaction 에
  영향 없음. 투명도 0.92 는 뒤 픽셀 어렴풋이 비치게 해 "가린 부분이
  뭐지?" 불안 해소.
- **왜 `prompt_len` 을 lastRun 에 포함?** 프롬프트 길이 ↔ 예산 초과 상관
  관계가 있는지 devtool 레벨에서 한 눈에 보고 싶을 때 유용. 긴 prompt
  (100+ 자) + budget over 조합이 반복되면 이미 Mock 단계에서 drawing cost
  가 slot 개수에 비례함을 암시.

## 4. 검증

- `pnpm --filter @geny/web-editor-logic test` — **80/80 pass** (71 기존
  + 9 신규 P2-S6).
- `pnpm --filter @geny/web-editor run build:public` — vendored
  `public/vendor/web-editor-logic/index.js` 에 `summarizeMetricHistory`
  export 포함 확인.
- `pnpm --filter @geny/web-editor test` — halfbody + fullbody e2e **green**.
  기존 `?debug=logger` 경로 회귀 없음 (LoggingRenderer 이벤트 스트림 3/3).
- `pnpm -r test` — 전 패키지 **fail 0**. pixi 44, exporter-core 107,
  web-editor-logic 80, worker-generate 45 등 전부 통과.
- `?debug=metrics` URL 확인 (수동, dev 서버) — 패널이 우하단에 뜨고 runs
  카운트 / budget rate / phase 평균이 Generate 버튼 클릭할 때마다 갱신.
  auto-preview 트리거로도 runCount=1 즉시 표시.

## 5. 알려진 한계

- **ring buffer 회전 시 평균 왜곡** — 33 run 초과로 오래된 이벤트가 drop
  되면 평균이 "최근 창" 기준으로 자동 이동. 이는 의도된 sliding window
  동작이지만, "세션 전체 누적" 이 필요한 dev 시나리오엔 부족. "pause" /
  "clear" 버튼 미구현. 현재는 `__genyDebugMetrics.clear()` 수동 호출.
- **패널 스타일 고정** — light/dark 테마 비연동. 반투명 darkslate 로 양쪽
  대비 확보했지만, light 모드에서 투명도가 강해 읽기 힘들 수 있음.
  dev 도구 priority 라서 허용.
- **마우스 인터랙션 없음** — 드래그 이동 / resize / 접기 미구현. 우하단
  고정 320px 로 Inspector 오른쪽 끝과 살짝 겹침 (z-index 로 패널이 위).
  Inspector 스크롤은 영향 없음 (width 320 << inspector 위치).
- **phase 평균이 0 포함** — auto-preview 의 ingest=0 은 phaseAverages.ingest
  에 그대로 반영돼 "평균이 user 단독 때보다 낮게 보임". trigger 별 분리는
  향후 후보 (snapshot 에 trigger filter 옵션).
- **p95 가 20 샘플 미만일 때 불안정** — ceil 기반 index 라 5 샘플에선 그대로
  최댓값. SLO 용이 아니라 인정.

## 6. 다음 후보

1. **pivot 레이블 + 슬롯 ID 표시** — P1-S9 의 pivot 오버레이에 slot_id 텍스트
   첨부, 밀집 영역 가독성 개선.
2. **pixi motion ticker 테스트** — breath fade_in/out 램프 공식 회귀 고정.
3. **패널 접기 / clear 버튼** — metrics 패널 UX 개선 (현재 dev tool 수준).
4. **trigger 별 분리 스냅샷** — `summarizeMetricHistory` 에 `filter` 옵션
   추가 → auto vs user 구분 표시.
5. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-22-P1-S9-debug-pivots-overlay.md`
  (pivot 오버레이 — P2-S6 과 동일한 `?debug=<flag>` 네임스페이스 패턴)
- 선행 계약: `packages/web-editor-logic/src/metrics.ts` 의
  `buildGenerateMetricEvents` (P2-S5 에서 도입한 이벤트 스키마)
- 이번 세션 변경:
  - `packages/web-editor-logic/src/metrics.ts`
    (`summarizeMetricHistory` + `MetricRunSummary` + `MetricHistorySnapshot`
    인터페이스 신설)
  - `packages/web-editor-logic/src/index.ts` (새 export)
  - `packages/web-editor-logic/tests/metrics.test.ts` (9 신규)
  - `apps/web-editor/index.html` (`?debug=metrics` flag + ring buffer
    sink 설치 + 우하단 DOM 패널 + `__genyDebugMetrics` 훅)
- β 문서: `docs/PRODUCT-BETA.md §7` (5000ms 예산 — 본 세션이 rate 가시화)
