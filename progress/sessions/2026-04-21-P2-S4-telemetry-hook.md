# P2-S4 — 텔레메트리 훅: phase ms 구조화 로깅 (2026-04-21)

## 1. 트리거

P1-S6 commit (`7fea0f0`) 직후. `docs/PRODUCT-BETA.md §7` 성공 지표는:

| 지표 | 목표 | 측정 경로 |
|---|---|---|
| 프롬프트→프리뷰 p95 지연 | ≤ 30s | Grafana histogram + **frontend timing** |

P2-S3 에서 UI 에 phase ms 를 표시했지만, **machine-readable 한 emit** 이 없으면
P5 staging 에서 scraper 가 집계 불가. "5000ms 내 완료" 는 로컬 체감, β 오픈
기준은 "Grafana 위에서 p95 측정 가능" 이어야 비즈니스 약속이 완성.

Foundation 스택에는 이미 server-side `geny_ai_call_duration_seconds` histogram
계약 (세션 64+) 이 있다. Client-side 는 별도 — log-based scraping 이 현실적
경로. `console.info("geny.metric", ...)` 형태로 emit 하면 Cloudflare Workers
/ gcp cloud run 등의 log aggregator 가 정규표현 1 개로 수집 가능.

## 2. 산출물

### 2.1 `emitMetric(event)` + `emitGenerateMetrics(...)` (index.html)

- `emitMetric(event)` — 단일 이벤트를 `console.info("geny.metric", event)` 로
  emit + optional `globalThis.__genyMetricsSink(event)` fan-out (dev/test).
  - try/catch 로 실 경로를 깨지 않게 방어.
- `emitGenerateMetrics({ trigger, prompt, phaseMs, totalMs, budgetMs, ok })` —
  runGenerate 한 회 결과를 **phase 별 5 이벤트 + total 1 이벤트** 로 분해 emit.
  - 각 phase event:
    ```json
    {
      ts: 1761013800000,
      kind: "generate.phase",
      name: "geny_generate_phase_duration_ms",
      value: 42,
      labels: { trigger: "user", template: "halfbody", ok: "true", phase: "synth" }
    }
    ```
  - total event:
    ```json
    {
      ts: 1761013800000,
      kind: "generate.total",
      name: "geny_generate_total_duration_ms",
      value: 211,
      labels: { trigger, template, ok, budget_ms: "5000", budget_ok: "true" },
      prompt_len: 14
    }
    ```
  - `name` 이 Prometheus metric name 그대로라 P5 scraper 가 `histogram_quantile(0.95,
    geny_generate_total_duration_ms_bucket)` 같은 쿼리를 바로 돌릴 수 있음
    (scraper 가 name/value/labels → exposition 변환).

### 2.2 runGenerate 성공·실패 양쪽에서 emit

- success 경로: 총 시간/예산 내 표시 직후 emit (trigger="user", ok=true).
- error 경로: phase timing 보존 상태로 emit (trigger="user", ok=false) —
  어디서 실패했는지 histogram 에서 역추적 가능.

### 2.3 runAutoPreview 도 phase 측정 + emit

P1-S6 에서는 timing 측정 없이 단순 실행이었는데, P2-S4 에서는 runGenerate 와
동일한 5 phase 구조로 분해:

- phase 0 "ingest": 0ms (auto 에는 사용자 입력 없음 — 항상 0).
- phase 1 "synth": mockGenerateTexture 소요.
- phase 2 "atlas": newAtlas 객체 구성.
- phase 3 "swap": URL.revokeObjectURL + regenerate 동기 호출.
- phase 4 "paint": regenerate Promise await (실 canvas swap).
- total 과 함께 emitGenerateMetrics({ trigger: "auto", ... }) 호출.

auto vs user 는 **`trigger` 라벨** 로 구분 — auto-preview 의 분포는 "첫 인상
지연" 지표, user 의 분포는 "β §7 프롬프트→프리뷰" 지표. 동일 metric 이름
공유로 alert rule 설정 용이.

### 2.4 metrics sink opt-in

`window.__genyMetricsSink` 를 설정한 코드만 이벤트를 받음. dev 환경에서:

```js
// dev console
const buf = [];
window.__genyMetricsSink = e => buf.push(e);
// ...
console.table(buf);
```

테스트에서도 이 훅으로 emission 검증 가능.

## 3. 판단 근거

- **왜 console.info?** Cloud Run / Cloudflare Workers / K8s 모두 stdout/stderr
  → log aggregator 에 들어감. 별도 HTTP 엔드포인트 구축 없이 즉시 수집.
- **왜 metric name 이 prometheus 규약?** P5 scraper 가 단순한 regexp/jq 로
  변환 가능하게. 이름 접두 `geny_` + suffix `_ms` 또는 `_seconds` 는 foundation
  의 기존 histogram 이름과 일관.
- **왜 phase + total 을 모두 emit?** total 만 있으면 병목 분석 불가. phase 별
  p95 가 있어야 "synth 가 항상 느리다" 같은 인사이트 가능 (P3 실 벤더 합류 후
  특히).
- **왜 globalThis sink fan-out?** dev 패널 / 테스트에서 console 파싱보다 sink
  주입이 훨씬 안전. try/catch 로 실패해도 실 경로 무영향.
- **왜 auto/user 를 같은 metric 에 trigger 라벨로 분리?** Prometheus 관습.
  metric name 이 같으면 같은 histogram — dashboard 에 `sum by (trigger)` 만
  추가하면 분리 뷰. 이름을 별도로 만들면 alert rule 중복 관리.

## 4. 검증

- `pnpm --filter @geny/web-editor test` → halfbody + fullbody e2e pass.
- 수동 검증: `?renderer=pixi` 로 열고 Generate 클릭 시 DevTools Console 에
  `geny.metric` 프리픽스 이벤트 6 개 (5 phase + 1 total) 이 찍혀야. 세션 외 수동.

## 5. 알려진 한계

- **자동 테스트 커버리지 밖**: happy-dom e2e 는 pixi 미초기화라 emit path 가
  실행되지 않음. emit 자체의 단위테스트는 sink 주입으로 가능하지만 본 세션은
  Wire-through 만 해둠. 향후 세션에서 metric 단위테스트 추가 가능.
- **log 파싱 의존**: stdout text log 를 scraper 가 JSON 파싱해야. Cloud Run 은
  자동, Cloudflare Workers 는 명시 wrangler.toml 설정 필요. P5 staging 합류 시점에 확정.
- **브라우저 측 buffering 없음**: 이벤트 하나마다 console.info 호출. 고빈도 user
  일 경우 콘솔 노이즈 가능 — β 에선 Generate 는 분당 수회라 문제 없음.
- **Sampling 없음**: 모든 이벤트 emit. P5 트래픽 증가 시 10~100% sampling rate
  환경변수가 필요해질 수 있으나 β 는 소규모.

## 6. 다음 후보

1. **atlas pivot_uv 확장** — hair/ahoge 실 피벗 (β P3+ 도입 예정이었지만 조기화 가능).
2. **metric 단위테스트** — `__genyMetricsSink` 를 jsdom 에서 주입해 emission 수 검증.
3. **dev metrics panel** (`?debug=metrics`) — 최근 100 이벤트를 inline 히스토그램으로.
4. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P1-S6-auto-preview-on-mount.md`
- 소스: `apps/web-editor/index.html` (emitMetric, emitGenerateMetrics, runGenerate/runAutoPreview 내 wire)
- β 기준: `docs/PRODUCT-BETA.md §7` ("frontend timing" 경로의 client-side)
- Foundation 참조: `packages/metrics-http` (server-side histogram 계약)
