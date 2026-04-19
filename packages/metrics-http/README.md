# `@geny/metrics-http`

Prometheus `/metrics` Node http 얇은 층. worker/api 서비스가 `@geny/ai-adapter-core`
의 `InMemoryMetricsRegistry` 를 두 줄로 스크레이프 가능하게 만든다.

## 연결 (세션 36)

```ts
import {
  InMemoryMetricsRegistry,
  createRegistryMetricsHook,
  orchestrate,
} from "@geny/ai-adapter-core";
import { createMetricsServer } from "@geny/metrics-http";

const registry = new InMemoryMetricsRegistry();
const metrics = createRegistryMetricsHook(registry);

// orchestrate(...) 호출 시 metrics 주입 → geny_ai_* 자동 채움
await orchestrate({ task, registry: adapters, metrics, stage: "ideation" });

// 스크레이프 서버 (9100 은 Prometheus 권장 worker-node port 범위)
createMetricsServer(registry).listen(9100, "0.0.0.0");
```

## 엔드포인트

| 경로 | 메서드 | 응답 |
|---|---|---|
| `/metrics` | GET, HEAD | 200, `text/plain; version=0.0.4; charset=utf-8`, exposition body |
| `/healthz` | GET, HEAD | 200, `text/plain`, `ok\n` |
| `/metrics` | 기타 | 405 + `Allow: GET, HEAD` |
| 그 외 | * | 404 (기본) 또는 `fallback` 에 위임 |

`createMetricsServer(reg, { fallback })` 로 `/metrics|/healthz` 이외 경로는 worker/api
자체 라우터로 넘길 수 있다 — 두 포트를 열 필요가 없다.

## 계약

- Content-Type: Prometheus text exposition **0.0.4** (catalog §3 고정).
- `Cache-Control: no-store` — scraper 가 항상 fresh 값을 받게.
- Body 는 `registry.renderPrometheusText()` 결과와 byte-equal. 메트릭 이름 / 시리즈 키
  오름차순으로 deterministic.
- `Content-Length` 는 GET/HEAD 모두 정확한 UTF-8 byte 길이.
- 외부 의존성 0 — Node built-in `http` + `@geny/ai-adapter-core` 타입만.

## 관련 문서

- `infra/observability/metrics-catalog.md` §3 — 방출 메트릭 4종 계약
- `progress/sessions/2026-04-19-session-33-ai-adapter-metrics.md` — 라이브러리 층
- `progress/sessions/2026-04-19-session-36-metrics-http-endpoint.md` — 서비스 층 결선
