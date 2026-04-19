# @geny/orchestrator-service

Foundation 단계의 **최초 서비스 bootstrap** (세션 39). `@geny/ai-adapter-core` 의 `orchestrate()` + `@geny/metrics-http` 의 `createMetricsServer` + `@geny/exporter-pipeline` 의 `runWebAvatarPipeline` 을 하나의 얇은 엔트리포인트로 묶는다. docs/02 §4 초기 내부 JobRunner 의 자리.

## CLI

```bash
pnpm --filter @geny/orchestrator-service start -- --port 9090 [--catalog path]
```

기본 카탈로그: `infra/adapters/adapters.json`. 벤더 호출은 Foundation 범위에서 전부 Mock.

## 라이브러리 사용

```ts
import { createOrchestratorService } from "@geny/orchestrator-service";

const svc = createOrchestratorService();
// 하나의 task 를 orchestrate — Mock 어댑터로 즉시 성공, 메트릭 자동 방출
const outcome = await svc.orchestrate({
  schema_version: "v1",
  task_id: "t1",
  slot_id: "hair_front",
  prompt: "soft fluffy hair",
  negative_prompt: "blurry",
  size: [512, 512],
  deadline_ms: 5000,
  budget_usd: 0.1,
  idempotency_key: "k1",
  capability_required: ["edit"],
});

// /metrics 서버 열기 (exposition 문자열은 svc.renderMetrics() 로 직접 뽑아도 됨)
const server = svc.createMetricsServer();
server.listen(9090, "0.0.0.0");

// e2e 익스포트 pipeline (exporter-pipeline 위임)
const tpl = svc.loadTemplate("rig-templates/base/halfbody/v1.2.0");
svc.runWebAvatarPipeline(tpl, "out/bundle");
```

## 실제 벤더 HTTP 붙이기

`factories` 를 부분 override 하면 된다:

```ts
import {
  createMockAdapterFactories,
  createOrchestratorService,
} from "@geny/orchestrator-service";
import { HttpNanoBananaClient, NanoBananaAdapter } from "@geny/ai-adapter-nano-banana";

const svc = createOrchestratorService({
  factories: {
    ...createMockAdapterFactories(),
    "nano-banana": (entry) =>
      new NanoBananaAdapter({
        client: new HttpNanoBananaClient({
          endpoint: entry.config?.endpoint ?? "",
          apiKey: process.env["NANO_BANANA_API_KEY"] ?? "",
        }),
        routingWeight: entry.routing_weight,
        maxParallel: entry.max_parallel,
      }),
  },
});
```

## 메트릭 훅 chain

`extraMetricsHook` 로 사용자 훅을 등록하면 내부 registry 훅 *뒤에* 직렬 호출된다 — OTEL span 기록, 샘플 로거 등.

```ts
createOrchestratorService({
  extraMetricsHook: {
    onCall(ev) { logger.info({ ev }, "ai call"); },
    onFallback(ev) { logger.warn({ ev }, "ai fallback"); },
  },
});
```

## /metrics 외 경로 위임

`metricsServerFallback` 으로 같은 포트에 도메인 라우트도 함께 실을 수 있다:

```ts
createOrchestratorService({
  metricsServerFallback(req, res) {
    if (req.url === "/api/ping") {
      res.statusCode = 200;
      res.end("pong");
      return;
    }
    res.statusCode = 404;
    res.end();
  },
});
```
