# 세션 33 — AI 어댑터 5차 (orchestrator metric hook + Prometheus exporter)

- 날짜: 2026-04-19
- 브랜치/커밋: main · 세션 33
- 워크스트림: **AI Generation** (`docs/14 §9`) + **Platform / Infra** (관측)
- 로드맵: docs/02 §9 / docs/05 §7.3 · `progress/INDEX.md §8` 세션 33 예고

## 1. 목표

세션 30 에서 `orchestrate()` 단일 진입점이 세워졌고, 세션 28 에서 `routeWithFallback()`
이 `attempts[]` 트레이스를 남긴다. 하지만 **메트릭은 방출되지 않고** 있었다 —
`infra/observability/grafana/dashboards/02-cost.json` 은 `geny_ai_call_*` / `geny_ai_fallback_total`
쿼리를 이미 준비해 뒀지만 **방출 원천이 없으면 panel 은 영원히 빈다**.

이번 세션은 orchestrator/fallback 경로에 **플러그형 MetricsHook** 을 꽂고, 의존성
없는 **In-process Prometheus registry** 를 제공해 `/metrics` 엔드포인트에 즉시 붙일 수
있도록 한다. `catalog §3` 의 4 메트릭을 1:1 로 채워 Grafana 대시보드 #2 가 즉시 렌더
가능해진다.

```
orchestrate(task, {catalog, factories, metrics: hook, stage, now})
  └─ routeWithFallback(..., {metrics, stage, now})
       ├─ per-attempt: hook.onCall({vendor, model, stage, status, durationSeconds, costUsd?})
       └─ on-fallback: hook.onFallback({fromVendor, toVendor, reason})

createRegistryMetricsHook(InMemoryMetricsRegistry) →
  geny_ai_call_total{vendor, model, stage, status}    (counter)
  geny_ai_call_duration_seconds{vendor, model, stage}  (histogram, 10 buckets)
  geny_ai_call_cost_usd{vendor, model, stage}          (counter, success only)
  geny_ai_fallback_total{from_vendor, to_vendor, reason} (counter)
  → renderPrometheusText()  (0.0.4 text exposition format)
```

## 2. 산출물 체크리스트

- [x] `packages/ai-adapter-core/src/metrics.ts` — `MetricsHook` 인터페이스 + `NoopMetricsHook` 기본 + `AdapterCallEvent`/`AdapterFallbackEvent`/`AdapterCallStatus` 타입 + `mapErrorToStatus(err)` 매트릭스(AdapterError code → status 레이블) + `InMemoryMetricsRegistry` (counter/histogram + Prometheus 0.0.4 text exposition) + `CounterHandle`/`HistogramHandle` + `createRegistryMetricsHook(registry)` (catalog §3 4 메트릭 자동 바인딩) + `DEFAULT_DURATION_BUCKETS_SECONDS` [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 20, 60].
- [x] `packages/ai-adapter-core/src/route-with-fallback.ts` — `RouteWithFallbackOptions` 에 `metrics?`/`stage?`/`now?` 추가. 시도 시작 시 `callStart = now()`, 성공/실패/unsafe/safety-block 각 분기에서 `hook.onCall({vendor, model, stage, status, durationSeconds, costUsd?})` 방출. 폴백이 다음 후보로 넘어갈 때(5xx/timeout/unsafe/네트워크) `hook.onFallback({fromVendor, toVendor, reason})` 방출. 4xx 즉시 throw 는 fallback 없으므로 onCall(4xx) 만.
- [x] `packages/ai-adapter-core/src/orchestrator.ts` — `OrchestrateOptions` 는 `RouteWithFallbackOptions` 상속 → `metrics`/`stage`/`now` 자동 승계. pass-through 조건부 세팅(exactOptionalPropertyTypes).
- [x] `packages/ai-adapter-core/src/index.ts` — 심볼 재노출 (`MetricsHook`, `NoopMetricsHook`, `InMemoryMetricsRegistry`, `createRegistryMetricsHook`, `mapErrorToStatus`, `CounterHandle`, `HistogramHandle`, `DEFAULT_DURATION_BUCKETS_SECONDS` + 이벤트 타입).
- [x] `tests/metrics.test.ts` — 16 tests. (1) Registry unit 5 (counter inc + getCounter / histogram bucket·sum·count / Prometheus text format / 동일 이름 타입 충돌 throw / 음수 delta throw) (2) `mapErrorToStatus` 매트릭스 1 test (9 case) (3) routeWithFallback + metrics 6 (1순위 성공 / 5xx 폴백 / 4xx 즉시 throw / safety block→unsafe 폴백 / 캐시 hit → onCall 0 / stage 전달) (4) `createRegistryMetricsHook` catalog 2 (4 레이블 조합 누적 / Prometheus text 4 메트릭 모두) (5) orchestrate parity 1 (attempts[] ↔ onCall 1:1) (6) `NoopMetricsHook` default 1.
- [x] `infra/observability/grafana/dashboards/02-cost.json` — panel 7 "AI 폴백 발생" (rate by from→to, reason) + panel 8 "AI 호출 p95 지연 (벤더별)" (histogram_quantile over duration_seconds_bucket). 기존 6 panel 불변.
- [x] `infra/observability/metrics-catalog.md` §3 — "방출 지점" 문구 추가 (세션 33), `status` 라벨 enum 에 `unsafe|other` 추가, `cost_usd` 가 **성공 호출에서만** 누적됨을 명시, `fallback` reason 값 나열.
- [x] `infra/helm/observability/configs/dashboards/02-cost.json` — `scripts/sync-observability-chart.mjs` 로 재동기 (chart-verify drift 검증 통과).
- [x] `scripts/test-golden.mjs` step 8 헤더 갱신 (`52 → 68 tests`, + MetricsHook 언급).

## 3. Done 정의 / 검증

| 지표 | 값 |
|---|---|
| ai-adapter-core 테스트 | **68 pass / 0 fail** (52 → 68, +16 metrics) |
| validate-schemas | **checked=184 / failed=0** (스키마 변경 없음) |
| `pnpm run test:golden` | **14 step 전부 pass** (step 8/11 검증 포함) |
| 기존 회귀 | halfbody v1.2.0 Cubism/web-avatar/bundle-manifest golden · aria 번들 · license-verifier · ai-adapters-fallback · post-processing 85 전부 불변 |

```
$ pnpm --filter @geny/ai-adapter-core run test | tail
ℹ tests 68  ℹ pass 68  ℹ fail 0

$ node scripts/validate-schemas.mjs | tail
[validate] checked=184 failed=0

$ pnpm run test:golden | tail
[golden] ✅ all steps pass
```

## 4. 설계 결정 (D1–D5)

### D1. MetricsHook 플러그 인터페이스 — prom-client 의존성 회피
`prom-client` 를 dep 으로 추가하면 간편하지만, `@geny/ai-adapter-core` 는 브라우저/worker/
CLI 어디서든 동작해야 한다. Hook 인터페이스만 고정하고 **기본 구현은 no-op**, 별도로 `InMemoryMetricsRegistry` 를 끼우고 싶은 호출자만 `createRegistryMetricsHook(reg)` 를 쓰면 된다. Prometheus 를 끌지 않는 환경(예: 로컬 CLI)에서는 hook 자체를 생략 가능.

> 바꿀 여지: OpenTelemetry export 가 필요하면 `otelMetricsHook(meter)` 를 추가로 공급하면 된다 — 인터페이스가 동일하므로 orchestrator 쪽 코드는 변경 없음.

### D2. In-process Prometheus registry — 최소 구현
text exposition format 0.0.4 만 지원. `# HELP` / `# TYPE` / counter `name{labels} value` / histogram `_bucket{le="..."}` / `_sum` / `_count`. 레이블은 알파벳 정렬(결정론적). 히스토그램 버킷은 [0.05..60]s 10 단계 — docs/02 §9 의 "어댑터 지연" 분포에 맞춤 (대부분 0.5~10s, timeout 은 60s 초반).

비지원: summary (quantile 은 Grafana `histogram_quantile` 로 대체), labels without name (전역 태그), gauge — 필요하면 추가.

### D3. `stage` 저카디널리티 레이블
catalog §0: "저카디널리티 only". 따라서 `stage` 는 orchestrator 호출자가 `"generation"`/`"refine"`/`"upscale"` 등 5~10 가지 고정값만 전달. 기본값 `"generation"`. 호출자가 custom 문자열을 주입할 수 있으나, 카디널리티 폭주는 호출자의 책임 (스키마 게이트가 없다 — prom-client 동일).

### D4. cost_usd 는 성공 호출에서만 누적
실패한 호출은 대부분 벤더가 과금하지 않는다(4xx) 또는 거부된 generation(5xx)이므로 **cost 집계에 포함하면 회계가 부정확**. `InvalidOutput` 처럼 벤더가 처리하고 실패로 판정한 경우도 있지만 이는 드물고 overshoot 에 가까움 — 현 버전에서는 단순히 success 에서만 누적. 필요 시 `geny_ai_call_partial_cost_usd` 를 별도 메트릭으로 추가.

### D5. safety-block 도 폴백 이벤트로 기록
`UNSAFE_CONTENT` 는 `shouldFallback(err)` 가 true 를 반환 — 다음 후보로 넘어간다. 그런데
safety 는 어댑터 성공 **후** 결과에 대한 검사이므로 "generate 는 200 이지만 가드레일이 차단"
케이스. `onCall(status="unsafe")` + `onFallback(reason="unsafe")` 둘 다 발행하면 Grafana
상 벤더 성공률과 불안전 컨텐츠 비율이 분리되어 보인다. (docs/05 §9.4)

## 5. 여파 — 나머지 세션

- **세션 34**: 영향 없음. halfbody v1.3.0 파생 모션은 별개.
- **세션 35 (기존 예고)**: 영향 없음. Stage 1 close/feather/uv-clip 및 exporter-core 의 pre-atlas hook 결합은 별개.
- **세션 후속 (비예정)**: worker/api 에서 `/metrics` 엔드포인트를 노출하여 `createRegistryMetricsHook` + `renderPrometheusText()` 를 HTTP 응답에 꽂아야 실제 Grafana 에 데이터가 흐른다. 현재는 라이브러리 레벨만 완성 — HTTP scrape 는 worker 패키지에서 수행할 몫. 상위 인프라 구축 시에 자연스럽게 연결.

## 6. 완료 조건

| 항목 | 상태 |
|---|---|
| MetricsHook 인터페이스 + 기본 NoopHook | ✅ |
| 시도별 onCall + 폴백별 onFallback | ✅ `route-with-fallback` 모든 분기 |
| In-process Prometheus 레지스트리 + 텍스트 출력 | ✅ 10-bucket 히스토그램 |
| catalog §3 4 메트릭 자동 등록 | ✅ `createRegistryMetricsHook` |
| Grafana 대시보드 #2 에 폴백/지연 panel | ✅ panel 7/8 |
| 카탈로그 문서 갱신 | ✅ 방출 지점 + status enum 확장 |
| 52 → 68 tests | ✅ +16 metrics |

세션 33 완료. 다음은 세션 34 (halfbody v1.3.0 파생 모션).
