# 세션 44 — `apps/worker-generate/` Foundation 워커 skeleton

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: AI Generation · Pipeline · Platform (docs/14 §9)
- **관련 세션**: 36 (`@geny/metrics-http` 엔드포인트), 39 (orchestrator-service bootstrap), 42 (HTTP 팩토리 + `apiModel` 분리), 43 (ADR 0005 저작 게이트 — L4 `apiModel` 분리 계약)
- **관련 ADR**: [0005](../adr/0005-rig-authoring-gate.md) L4 파이프라인 불변식 (`apiModel` vs `modelVersion`)
- **산출물**: `apps/worker-generate/` 신규 (src/job-store.ts, src/router.ts, src/index.ts, src/main.ts, README, tsconfig × 3, package.json), tests/ 3종, `scripts/test-golden.mjs` step 19 추가

---

## 배경

세션 39 의 `createOrchestratorService()` + 세션 42 의 HTTP 팩토리 주입은 "한 프로세스에서 `orchestrate()` + `/metrics`" 까지 끝냈으나 **큐 엔드포인트** 는 없었다. docs/02 §4 의 JobRunner 가 장기적으로 worker 프로세스로 분리되는 경로를 Foundation 범위에서 최소한으로 실측하기 위해, orchestrator-service 를 binding 한 얇은 consumer 를 `apps/worker-generate/` 로 신설.

Foundation 범위 결정:
- **큐 백엔드는 인-메모리 FIFO** — Redis/BullMQ 교체는 Runtime 단계 이후. 지금은 JobStore 인터페이스만 확정.
- **동시성 = 1** — 직렬 처리로 실패 경로/상태 전이 확인. 동시성은 backpressure 정책이 생긴 후 확장.
- **영속성 없음** — 프로세스 죽으면 대기중 잡 유실. graceful shutdown 은 in-flight 드레인만.

## 설계 결정

### D1. `metricsServerFallback` 슬롯 재사용 (별도 포트 분리 거부)

orchestrator-service 가 이미 `createMetricsServer({ fallback })` 슬롯을 세션 36 부터 제공. 잡 라우터를 거기에 꽂으면 `/metrics` · `/healthz` · `/jobs*` 가 **같은 포트** 에 실린다. Prometheus scrape 포트를 API 포트와 분리하지 않는 이 선택은 Foundation 의 단일 프로세스 단순성 우선. Runtime 에서 웹·워커가 분리되면 각자 `/metrics` 를 노출 (prom-agent side-car 없이 scrape).

### D2. 순환 wiring 을 "ref 한 단계" 로 해결

`JobStore.orchestrate` 는 `service.orchestrate` 를 불러야 하고, `service` 의 fallback 은 store 를 품은 router 이다. 순환. 해법은:

```
const ref = { current: null };
const store = createJobStore({ orchestrate: (t) => ref.current!.orchestrate(t) });
const router = createJobRouter({ store });
const service = createOrchestratorService({ metricsServerFallback: router });
ref.current = service;
```

외부 DI 컨테이너 없이 한 함수에서 끝난다. 만약 service 가 외부 주입되면 그 service 의 fallback 은 **외부 소유** 이므로 건드리지 않음 (문서화).

### D3. `JobStore` 는 submit 동기 반환 + queueMicrotask 로 루프 kick

HTTP `POST /jobs` 핸들러는 202 를 빨리 돌려줘야 한다. `submit()` 이 즉시 `{job_id, status:"queued"}` 를 반환하고 `queueMicrotask` 로 백그라운드 루프를 깨우는 구조. 테스트에서 `waitFor(id)` 가 resolve 되는 지점이 실제 처리 완료와 일치.

### D4. 검증 규칙 — `negative_prompt` 만 빈 문자열 허용

초기 구현에서 필수 문자열 필드 5종을 일괄 non-empty 로 만들었더니 `negative_prompt: ""` 케이스(정상 기본값)가 터짐. docs/05 §2.2 의 기본값이 빈 문자열이므로 검증 루프에서 제외. 다른 필드(task_id/slot_id/prompt/idempotency_key)는 여전히 non-empty.

### D5. ADR 0005 L4 `apiModel` 재검증을 wiring e2e 에 포함

세션 42 에서 orchestrator-service 테스트로 이미 고정한 "벤더 request body `model=config.model` 전달" 을, 이제 **워커 포트를 거친 e2e 경로** 에서 한 번 더 검증. 이는 ADR 0005 L4 가 "워커 쪽 HTTP 실호출에서 재검증" 을 follow-up 으로 둔 항목의 첫 완료. 테스트명에 `ADR 0005 L4 apiModel 분리 재검증` 명시.

## 실제 변경

- `apps/worker-generate/` 신규:
  - `src/job-store.ts` — `createJobStore({ orchestrate, jobIdFn?, now? })`: submit/get/list/waitFor/drain/stop. queueMicrotask 기반 백그라운드 루프, 직렬 1 잡씩.
  - `src/router.ts` — `createJobRouter({ store, logger? })` + `validateTask()`: POST/GET /jobs, GET /jobs/:id, 4 KB body 상한, 415/400/404/405 매핑.
  - `src/index.ts` — `createWorkerGenerate()`: ref-기반 순환 해소 wiring + createServer 위임.
  - `src/main.ts` — CLI (`--port` 기본 9091, `--host`, `--catalog`, `--http`). orchestrator CLI 와 동일한 `--http` 규약.
  - `README.md` — 엔드포인트 표 + 상태 전이 + CLI/라이브러리 예시 + ADR 0005 링크.
  - `package.json` — `@geny/orchestrator-service` 에만 의존 (타입은 `@geny/ai-adapter-core` 로 재노출).
  - `tsconfig*.json` 3종 — orchestrator 와 동일 규약.
- `tests/job-store.test.ts` — 5 tests: 제출→성공, throw→failed(error.code 보존), 2 잡 FIFO 직렬, stop 후 submit throw, list 순서 보존.
- `tests/router.test.ts` — 9 tests: `validateTask` 단위 6 케이스 + HTTP 라우터 202/400/415/404/405.
- `tests/wiring.test.ts` — 2 tests: Mock 기본 경로 e2e(`/metrics` 반영 확인), HTTP 팩토리 주입 e2e(ADR 0005 L4 apiModel 재검증).
- `scripts/test-golden.mjs` — step 19 `worker-generate tests` 추가 (18→**19 step**).
- `progress/INDEX.md` — §3 AI Generation/Pipeline/Platform 행 갱신, §4 row 44, §6 step 19, §8 세션 43 제거 후 45/46/47 rotate.

## 검증

- `pnpm -F @geny/worker-generate test` → 16/16 pass (3 파일).
- `pnpm run test:golden` → **19/19 step pass**. validate-schemas checked=186 불변.
- 실행 결과에서 확인한 L4 재검증 증거: `calls[0].model === "gemini-2.5-flash-image"` (카탈로그 `config.model`), request URL = `https://nano-banana.test/v1/generate`. 만약 `apiModel` 분리가 깨지면 `model` 필드에 `0.1.0` (카탈로그 version) 이 실려 이 단언이 실패.

## Follow-ups

- 세션 45 (Foundation Exit #1 자동화): `apps/web-preview/` E 단계 브라우저 스냅샷. worker-generate 와는 독립이지만 같은 Foundation Exit 축.
- 세션 47 (큐 영속성): JobStore 인터페이스가 Redis/BullMQ/SQLite 드라이버 교체에 충분한지 점검. `submit`/`waitFor` 계약이 분산 큐 의미와 맞는지 재검토 (현재는 단일 프로세스 미의).
- docs/02 §4 JobRunner 인터페이스 초안에 `JobStore` 의 `submit/waitFor/drain` 계약을 올릴지 결정 — 지금은 코드로만 존재.

## 커밋

- `apps/worker-generate/**` (신규 전체)
- `scripts/test-golden.mjs` (step 19)
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-44-worker-generate-skeleton.md`
