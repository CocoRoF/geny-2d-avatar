# P2-S5 — metrics sink 단위테스트: emit 회귀 고정 (2026-04-22)

## 1. 트리거

P2-S4 에서 `emitMetric` / `emitGenerateMetrics` 를 `apps/web-editor/index.html`
인라인 스크립트 안에만 두었다. 이 위치의 단점:

- node:test 대상 밖. 스키마/라벨 drift 가 CI 에서 잡히지 않음.
- Grafana 쿼리 + P5 staging log scraper 는 metric name/label 스냅샷을 굳히고
  싶은데, 현재는 스냅샷이 없다.
- 향후 dev metrics panel(`?debug=metrics`) 같은 consumer 가 이벤트를 직접
  import 해 재사용하려 해도, HTML 인라인이라 import 불가.

β §7 의 "프롬프트→프리뷰 p95 지연" 지표를 Grafana 로 집계하려면 frontend
emit 스키마가 **불변 계약** 이어야 한다. Foundation 에 이미 있는
`@geny/web-editor-logic` 패키지가 이 목적에 적격 — index.html 이 이미 이
패키지를 쓰므로 추가 vendor 설정 없이 바로 공유 가능.

## 2. 산출물

### 2.1 `@geny/web-editor-logic/metrics` 신규 모듈

`packages/web-editor-logic/src/metrics.ts` 에 순수 이벤트 빌더 도입:

```ts
export const METRIC_PHASE_LABELS = ["ingest", "synth", "atlas", "swap", "paint"] as const;

export interface GenerateMetricEvent {
  readonly ts: number;
  readonly kind: "generate.phase" | "generate.total";
  readonly name: string;
  readonly value: number;
  readonly labels: Readonly<Record<string, string>>;
  readonly prompt_len?: number;
}

export function buildGenerateMetricEvents(input: BuildGenerateMetricsInput): GenerateMetricEvent[]
```

- **side-effect 없음**. phase 배열 + total → 6 이벤트 배열. 호출자가
  `for (const e of events) sinkOrConsole(e)` 로 소비.
- 반환 순서 고정: phase 0~4 → total. 스냅샷/alert rule 안정성 확보.
- `value` 는 Math.round 로 정수화 (Prometheus histogram bucket 과 자연 매핑).
- `prompt_len` 은 total event 에만 붙이고 phase 에는 생략.
- 라벨 카디널리티 최소화: trigger / template / ok / phase / budget_ms /
  budget_ok 만. 프롬프트 값 자체는 라벨로 실지 않음 (cardinality 폭발 방지).

`src/index.ts` 에 export 추가 — `buildGenerateMetricEvents` +
`METRIC_PHASE_LABELS` + 3 타입.

### 2.2 `tests/metrics.test.ts` — 14 테스트

Suite 6 개로 분해:

1. **이벤트 개수 + 순서** (2 tests) — phase 5 + total 1 고정, 순서 고정.
2. **Prometheus metric names** (2 tests) — `geny_generate_phase_duration_ms`,
   `geny_generate_total_duration_ms` 이름 스냅샷.
3. **라벨 의미** (3 tests) — trigger/template/ok 공통성, budget_* 가 total
   전용, 예산 초과 시 budget_ok=false.
4. **value 정수화** (2 tests) — Math.round, 짧은 배열 fill 0.
5. **prompt_len** (3 tests) — total 에만 존재, 빈 문자열 0, 문자 수 매칭.
6. **sink fan-out 시뮬레이션** (2 tests) — 6 이벤트 iterate, auto/user
   trigger 분리.

pnpm --filter @geny/web-editor-logic test → 71 테스트 pass (이전 57 + 14
신규).

### 2.3 index.html refactor — 중복 제거

`emitGenerateMetrics` 내부 루프를 날리고 `buildGenerateMetricEvents` 호출로
대체:

```js
function emitGenerateMetrics({ trigger, prompt, phaseMs, totalMs, budgetMs, ok }) {
  const events = buildGenerateMetricEvents({
    ts: Date.now(),
    trigger,
    template: document.querySelector("#template-picker")?.value ?? "unknown",
    prompt, phaseMs, totalMs, budgetMs, ok,
  });
  for (const e of events) emitMetric(e);
}
```

`emitMetric(event)` 만 HTML 에 잔존 (브라우저 sink + console.info wrap).
`PHASE_LABELS` 상수는 timing pill UI 에서 계속 사용하므로 유지.

### 2.4 검증

- `pnpm --filter @geny/web-editor-logic test` — **71/71 pass**.
- `pnpm --filter @geny/web-editor test` — halfbody + fullbody e2e pass
  (index.html refactor 무영향 확인).
- `pnpm -r test` — 전체 workspace green.

## 3. 판단 근거

- **왜 분리했는가?** 이벤트 스키마가 비즈니스 관측성의 core contract.
  HTML 안에 있으면 CI 에서 깨지지 않아도 Grafana 가 조용히 깨진다. node:test
  로 스냅샷 고정이 필수.
- **왜 `@geny/web-editor-logic` 에 넣었는가?** 이미 index.html 이 vendor 로
  쓰고 있어 추가 bundler 설정 없음. 이 패키지의 목적이 "web-editor 인라인
  스크립트와 node 테스트가 공유하는 순수 로직" 이라 정합.
- **왜 side-effect 와 pure 를 분리?** emit 은 환경 의존(console, globalThis
  sink) 이라 타입 안전하게 테스트하기 어렵고 iso 환경마다 다름. 반면
  스키마 빌더는 입력-출력 매핑이라 스냅샷 테스트에 이상적.
- **왜 phase_ms 배열이 짧으면 0 으로 채우나?** 에러 경로에서 일부 phase 만
  측정되고 나머지는 undefined 일 수 있는데, NaN/missing 은 Prometheus 에서
  histogram 버킷을 깨뜨린다. 0 으로 defaulting 이 관측성 측면에서 안전.
- **왜 value = Math.round?** Prometheus histogram bucket 은 float 을 그대로
  받아도 동작하지만, 정수 ms 가 bucket boundary 와 깔끔히 맞는다. 0.4/0.6
  같은 submillisecond 는 구분 가치 낮음 — 대부분 phase 는 > 1ms 단위.

## 4. 검증

§2.4 참조. 71 + e2e green + 전 패키지 green.

## 5. 알려진 한계

- **emit 경로(`emitMetric`) 자체의 단위테스트 없음**. console.info/globalThis
  sink 양쪽 path 를 node 에서 mock 하려면 글로벌 덮어쓰기가 필요한데 인접
  테스트 오염 위험이 있어 보류. 향후 `emitMetric` 을 logic 패키지로 밀고
  fake sink 주입 pattern 이 적합.
- **웹 e2e 테스트는 index.html 의 실제 emit 경로를 아직 커버하지 않음**.
  happy-dom + pixi 가 실제로 Generate 를 누를 수 없어 `__genyMetricsSink`
  주입 경로는 수동 검증. P5 staging 실 트래픽이 공식 회귀 경로.
- **label cardinality 한도 없음**. template 필드가 halfbody/fullbody 2 종으로
  현재는 안전하지만, 사용자 정의 템플릿이 합류하면 (P4+) cardinality 제한
  규칙 명시 필요.

## 6. 다음 후보

1. **dev metrics panel** (`?debug=metrics`) — 최근 100 이벤트를 inline
   히스토그램 패널로 (`buildGenerateMetricEvents` 결과를 reuse).
2. **실 atlas 에 pivot_uv 주입** — halfbody ahoge/hair 먼저 시범 (P1-S7
   계약 활용).
3. **emit 경로 커버리지** — `emitMetric` 을 logic 패키지로 밀고 fake sink 주입 테스트.
4. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-22-P1-S7-atlas-pivot-uv.md`
- 소스: `packages/web-editor-logic/src/metrics.ts` (순수 함수)
- 테스트: `packages/web-editor-logic/tests/metrics.test.ts` (14 신규)
- 호출자: `apps/web-editor/index.html` (`emitGenerateMetrics` refactor)
- 선행: `progress/sessions/2026-04-21-P2-S4-telemetry-hook.md`
- β 기준: `docs/PRODUCT-BETA.md §7` ("프롬프트→프리뷰 p95 지연")
