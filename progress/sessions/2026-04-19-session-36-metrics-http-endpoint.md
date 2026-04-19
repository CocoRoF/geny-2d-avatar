# 세션 36 — Prometheus `/metrics` 서비스 결선 (`@geny/metrics-http`)

**날짜**: 2026-04-19
**앞선 세션**: [35 — Post-Processing Stage 1 확장](./2026-04-19-session-35-post-processing-stage1-extension.md)
**관련 문서**: `docs/02 §9`, `infra/observability/metrics-catalog.md §3`, `docs/05 §7.3`

---

## 목표

세션 33 이 남긴 라이브러리 층(`InMemoryMetricsRegistry` + `renderPrometheusText()`
+ `createRegistryMetricsHook(reg)`)을 **서비스 층**으로 1:1 승격한다. worker/api 가
두 줄로 Prometheus scrape 가능한 `/metrics` 엔드포인트를 열 수 있어야 한다.

## 산출물

### `packages/metrics-http/` 신설 (v0.1.0)

외부 의존성 0, `@geny/ai-adapter-core` 의 `InMemoryMetricsRegistry` 타입만 import.

- `src/index.ts`
  - `createMetricsRequestHandler(registry)` — `(req, res) => void`. 경로/메서드 매칭 +
    `registry.renderPrometheusText()` 응답.
  - `createMetricsServer(registry, { fallback? })` — Node `http.Server` 반환. `fallback`
    을 주면 `/metrics|/healthz` 이외 경로를 worker/api 라우터로 위임.
  - `PROMETHEUS_CONTENT_TYPE = "text/plain; version=0.0.4; charset=utf-8"` 상수 export.
- `README.md` — 연결 스니펫 + 엔드포인트 표 + 계약 정리.
- `tests/handler.test.ts` — 12 tests (ephemeral 포트 Node http 서버 실제 bind).

### 엔드포인트 계약

| 경로 | 메서드 | 응답 |
|---|---|---|
| `/metrics` | GET, HEAD | 200 + `text/plain; version=0.0.4; charset=utf-8` + `Cache-Control: no-store` + body = `registry.renderPrometheusText()` byte-equal |
| `/healthz` | GET, HEAD | 200 + `text/plain; charset=utf-8` + `ok\n` |
| `/metrics` | POST 등 | 405 + `Allow: GET, HEAD` |
| 기타 | * | 404 (기본) 또는 `fallback` 위임 |

### 테스트

12 tests 전부 pass:
1. GET `/metrics` → 200 + PROMETHEUS_CONTENT_TYPE + body contains metric 계열.
2. body 가 `registry.renderPrometheusText()` 와 byte-equal.
3. HEAD `/metrics` → 200 + 정확한 Content-Length + 빈 body.
4. POST `/metrics` → 405 + `Allow: GET, HEAD`.
5. GET `/healthz` → 200 + `ok\n`.
6. GET `/unknown` → 404.
7. `/metrics?foo=bar` — query string 무시, 200.
8. `createMetricsServer` 기본 동작 (/metrics + /healthz + 404).
9. `createMetricsServer({ fallback })` — `/api/status` → fallback 실행, `/metrics` 는 그대로.
10. e2e — `createRegistryMetricsHook(reg)` 로 onCall/onFallback 주입 → scrape body 에 반영.
11. e2e — 빈 registry 도 200 + `\n` (헤더 없는 exposition).
12. 멱등 — 동일 registry 연속 2회 scrape 결과 동일.

### `scripts/test-golden.mjs` step 15 추가

```js
async function runMetricsHttpTests() {
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  await run("pnpm", ["-F", "@geny/metrics-http", "test"], { cwd: repoRoot });
}
```

STEPS 배열에 `metrics-http tests` 엔트리 + 헤더 주석(`15)`) 갱신.

---

## 결정 (D1~D5)

### D1 — 왜 `/metrics` 를 별 패키지로 뽑았나
세션 33 이 `InMemoryMetricsRegistry` 를 `@geny/ai-adapter-core` 에 두었다. 하지만
`ai-adapter-core` 는 AI 어댑터 계약을 소유하는 "도메인" 패키지다. Node `http` 바인딩은
서비스 바인딩이므로 같은 패키지에 두면 브라우저/워커 타겟에서 불필요한 표면이 된다.
`@geny/metrics-http` 로 빼면:
- 브라우저에서 `ai-adapter-core` 타입만 쓰고 싶을 때 http 종속성 없음.
- worker/api 외에 다른 메트릭 레지스트리(`@geny/license-verifier` 등이 장차
  레지스트리를 쓰기 시작해도) 가 동일 handler 를 재사용 가능.

### D2 — Prometheus content-type 0.0.4 고정
Prometheus exposition format 은 0.0.4 (text) 와 1.0.0 (OpenMetrics) 둘. catalog §3
가 0.0.4 로 못박혀 있고 `renderPrometheusText()` 구현도 0.0.4 (`# HELP` + `# TYPE`
+ bucket/sum/count) 을 준수한다. `version=0.0.4; charset=utf-8` 을 상수로 export 해
서 외부에서 검증 시 문자열 비교 가능.

### D3 — `fallback` 옵션은 왜
docs/02 는 worker/api 를 별 서비스로 본다. 하지만 초기 Foundation 에서 서비스 하나가
메트릭 + 도메인 라우트를 동시에 실을 수 있어야 포트/Helm ingress 가 단순해진다.
`fallback?` 을 쓰면 `/metrics|/healthz` 는 본 패키지가 먹고 그 외는 상위 레이어
라우터에 넘길 수 있다. `fallback` 미지정 시 404 — 순수 metrics-only 서비스 모드.

**Why:** 포트 하나에 메트릭 + 도메인 라우트 공존 지원.
**How to apply:** worker/api 서비스 엔트리에서 `createMetricsServer(reg, { fallback: domainRouter })`.

### D4 — HEAD 지원
Prometheus scraper 는 기본적으로 GET 만 쓰지만, 일부 curl 기반 health probe 나
Kubernetes probe 가 HEAD 로 상태만 확인하는 경우가 있어 지원. GET 과 동일 헤더/상태
+ 빈 body. Content-Length 는 실제 body length 와 일치시켜 HTTP/1.1 규약 준수.

### D5 — 테스트는 실제 ephemeral 포트 bind
모킹 없이 `server.listen(0, "127.0.0.1")` 로 랜덤 포트 받아 `node:http` 클라이언트로
실제 요청. 이유: 본 패키지의 가치는 `http` 바인딩 자체이므로 handler 를 직접 호출하는
테스트는 계약(content-type / status / Allow 헤더)이 실제로 wire 에 흘러가는지 못
잡는다. 127.0.0.1 + port 0 은 CI 격리에도 안전.

**Why:** http wire behavior (content-type 헤더, HEAD 처리, status code) 를 실제로 검증.
**How to apply:** 새 엔드포인트 추가 시에도 ephemeral 포트 bind + `node:http` 클라이언트 패턴 유지.

---

## 메트릭 / 카운트 요약

| 항목 | 이전 | 이후 | 비고 |
|---|---|---|---|
| test:golden 단계 수 | 14 | **15** | `metrics-http tests` 추가 |
| metrics-http tests | — | **12** | 신규 패키지 |
| validate-schemas checked | 186 | 186 | 스키마 변경 없음 |
| exporter-core tests | 95 | 95 | — |
| post-processing tests | 111 | 111 | — |
| ai-adapter-core tests | 68 | 68 | 재사용만, 증설 없음 |

---

## 다음

세션 36 완료. 다음은 §8 예고:
- 세션 37: halfbody v1.3.0 MIGRATION_REPORT TODO 소진.
- 세션 38: `textureOverrides` 훅 실제 PNG 디코드/재인코드 e2e.
- 세션 39: 최초 서비스 bootstrap — `createMetricsServer` 를 `services/orchestrator/`
  또는 `apps/worker-*/` 에 연결.
