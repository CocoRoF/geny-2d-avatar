# @geny/worker-generate

Foundation 워커 skeleton (세션 44). `@geny/orchestrator-service` 를 binding 해 `POST /jobs` 큐 훅 + `orchestrate(task)` 체인을 잇는 얇은 consumer. docs/02 §4 JobRunner → worker 분리 실험의 참조 구현.

## 엔드포인트

같은 포트에 다음이 동시에 실린다 (orchestrator-service 의 `metricsServerFallback` 슬롯에 잡 라우터를 끼움):

| Method | Path | 동작 |
|---|---|---|
| GET/HEAD | `/metrics` | Prometheus 0.0.4 text exposition (orchestrator registry) |
| GET/HEAD | `/healthz` | `ok\n` 반환 |
| POST | `/jobs` | body=GenerationTask JSON → 202 + `{job_id, status:"queued", ...}` |
| GET/HEAD | `/jobs/{id}` | 상태 + result/error 요약 |
| GET/HEAD | `/jobs` | 전체 잡 요약 |

## 상태 전이

`queued` → `running` → (`succeeded` | `failed`).

백그라운드 루프가 `queueMicrotask` 로 깨어 한 번에 하나씩 처리 (Foundation 직렬). 큐/영속성은 Runtime 단계의 Redis/BullMQ 로 교체 예정.

## CLI

```bash
pnpm --filter @geny/worker-generate start -- --port 9091 [--catalog path] [--http]
```

`--http` 를 켜면 `@geny/orchestrator-service` 와 동일한 규약대로 카탈로그의 `config.api_key_env` 에서 API 키를 수집해 HTTP 팩토리로 빌드한다 (세션 42, ADR 0005 L4 `apiModel` 분리).

## 라이브러리 사용

```ts
import { createWorkerGenerate } from "@geny/worker-generate";

const worker = createWorkerGenerate();

// 프로그램 방식으로 제출 — HTTP 없이도 동일한 경로
const rec = worker.store.submit({
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
const done = await worker.store.waitFor(rec.job_id);
console.log(done.status, done.outcome?.result.vendor);

// HTTP 서버
const server = worker.createServer();
server.listen(9091, "0.0.0.0");
```

## 관련 세션 / ADR

- 세션 39: `createOrchestratorService` bootstrap.
- 세션 42: HTTP 팩토리 주입 + `apiModel` 분리.
- [ADR 0005](../../progress/adr/0005-rig-authoring-gate.md) L4 파이프라인 불변식 — `apiModel` vs `modelVersion` 분리 계약은 이 워커의 실 벤더 호출에서 재검증된다.
