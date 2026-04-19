# 세션 72 — `perf-harness --driver bullmq` 실측 베이스라인 + `/metrics` 스크레이프

**일자**: 2026-04-20
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4 (staging 경로)
**선행 세션**: 세션 66 (perf-harness `--driver bullmq` CLI), 세션 68 (`geny_queue_duration_seconds` enqueue→terminal 정밀화), 세션 71 (retention 경계 고정)

---

## 1. 문제

세션 66 가 `scripts/perf-harness.mjs` 에 `--driver bullmq` CLI 를 뚫었지만 **실 Redis 에서 돌려 기록한 베이스라인이 없었다**. `docs/02 §12.4` 는 Foundation SLO 임계 (`orch_p95 ≤ 500ms`, `tput ≥ 10/s`) 만 명문화 돼 있고 "bullmq 경로가 실제로 어느 수준에서 달리는지" 는 비어 있음. Runtime 튜닝 단계에 들어섰을 때 p95 regression 을 비교할 기준점이 없으면 "Redis 바꾸고 p95 가 늘어난 건지 원래 그런지" 를 판단할 수 없다.

추가로 perf-harness 의 bullmq 경로가 `createBullMQJobStore` 를 만들지만 `onEnqueued` 훅을 wiring 하지 않아서 `geny_queue_enqueued_total` counter 가 0 으로 고정됐다 — 보고서가 "bullmq 드라이버로 N 잡 투하됐다" 를 증명하지 못하는 상태. `apps/worker-generate/src/main.ts` 에는 이미 이 counter 배선 패턴이 있지만 perf-harness 는 `createWorkerGenerate({ storeFactory })` 만 쓰므로 별도 배선 필요.

---

## 2. 변경

### 2.1 `scripts/perf-harness.mjs`

**(a) `buildWorker(cfg)` bullmq 브랜치에 counter 배선** — `apps/worker-generate/src/main.ts` 와 동일한 closure ref 늦 바인딩 패턴:

```js
let enqueueInc;
const onEnqueued = () => {
  enqueueInc?.({ queue_name: cfg.queueName });
};
const storeFactory = (orchestrate) =>
  createBullMQJobStore({ driver, orchestrate, mode: "inline", onEnqueued });
const worker = createWorkerGenerate({ storeFactory });
const counter = worker.service.registry.counter(
  "geny_queue_enqueued_total",
  "큐에 투입된 누적 잡 수 (catalog §2.1)",
);
enqueueInc = (labels) => counter.inc(labels);
```

순환 의존: `onEnqueued` 는 store 생성 이전에 필요한데 counter 는 `worker.service.registry` 가 만들어진 **이후** 등록 가능. closure ref 로 해결(`apps/worker-generate/src/main.ts:130-135` 와 동일 설계).

**(b) run end 에서 `/metrics` 스크레이프 (bullmq only)**:

```js
if (cfg.driver === "bullmq") {
  try {
    const text = await fetchMetrics(port);
    queueMetrics = parseMetrics(text, { queueName: cfg.queueName });
  } catch (err) {
    queueMetrics = { error: String(err?.message ?? err) };
  }
}
```

`report.queue` 서브섹션에 주입 (in-memory 에서는 필드 자체 생략).

**(c) `parseMetrics(text, { queueName })` 신규 export** — 범위 한정 Prometheus text 파서:

- `geny_queue_enqueued_total{queue_name="<q>"}` → `enqueued_total: number`
- `geny_queue_depth{queue_name="<q>",state="<s>"}` → `depth: { state: number }`
- label-필터 regex, queueName 이스케이프. 매치 없으면 해당 필드 생략.

### 2.2 `scripts/perf-harness.test.mjs`

+1 case — parser 계약 고정. 동일 `queue_name` 이 섞인 sample text 에서 정확한 라벨로 분기됨을 확인 (`other` 큐 값 혼입 금지).

### 2.3 `docs/02 §12.4`

"성능 SLO 측정 하네스" 섹션에 **드라이버 베이스라인 표** 추가. `in-memory` vs `bullmq` 의 실측 수치 2행. SLO 임계는 그대로 유지 — 베이스라인 은 "현재 여유가 얼마나 있는가" 를 보여주는 정보성 층.

### 2.4 `package.json` (root)

```diff
   "devDependencies": {
     "ajv": "^8.17.1",
     "ajv-formats": "^3.0.1",
+    "ioredis": "^5"
   }
```

이유: `scripts/perf-harness.mjs` 가 `await import("ioredis")` 하는데 pnpm 은 `@geny/job-queue-bullmq` 의 워크스페이스 의존인 `ioredis` 를 루트 `node_modules` 에 hoist 하지 않는다. `scripts/` 는 루트에서 실행되므로 루트 node_modules 에 `ioredis` 가 있어야 resolve 가능.

---

## 3. 실측 결과

**조건**: 개발 맥북 (darwin 25.3.0), Node 22.x, N=100, C=8, Mock 어댑터 파이프라인, Redis 7.2-alpine docker 컨테이너 (port 6380, `maxmemory-policy noeviction`).

| 드라이버 | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | queue.enqueued_total |
|---|---|---|---|---|---|---|
| `in-memory` | 21 | 8.1 | 8.1 | 10.47 | 4761.9 | — (생략) |
| `bullmq` (local Redis) | 43 | 18.08 | 18.08 | 18.72 | 2325.58 | 100 |

두 결과 모두 Foundation SLO 임계 (`accept_p95≤100`, `orch_p95≤500`, `tput≥10`) 대비 1 order-of-magnitude 이상 여유. bullmq 는 Redis hop 때문에 대략 2배 지연, 절반 tput — **예상 범위 내**. `queue.enqueued_total=100 === config.jobs=100` 으로 counter 가 누출/중복 없이 작동함을 보고서 한 필드로 assert 가능.

---

## 4. 주요 결정축

- **D1** — **parseMetrics 는 전체 Prometheus 파서 아니라 2-메트릭 label-필터 regex**: 목적 범위가 "perf 실행 중 큐 counter 확인" 이고, exposition 문법 전체(`_bucket{le=...}`, `# TYPE` 주석, escape quoting) 는 `@geny/ai-adapter-core` 의 기존 `/metrics` 테스트가 이미 계약 수준에서 보증. 여기선 perf 하네스가 필요한 2 메트릭만 추출하는 최소 파서로 충분 — YAGNI.
- **D2** — **`queue.enqueued_total === jobs` 는 assert 아닌 정보성 필드**: SLO gate 는 기존 5개 (세션 51) 로 고정. 보고서 consumer (사람 또는 미래 CI) 가 스스로 assert — perf-harness 가 계약을 확장하면 세션 51 의 golden step 20 smoke 가 부서질 위험. 정보성 필드로 유지해 누출/중복 탐지의 데이터는 제공하되 실패 조건은 이번 세션에 추가하지 않음.
- **D3** — **로컬 Redis 포트 6380**: 사용자의 다른 프로젝트 `redis-feature-store` 컨테이너가 이미 6379 를 점유 — 충돌 회피용. CI lane (세션 69) 과 staging (`docker-compose.staging.yml`) 은 여전히 표준 6379 이므로 세션 72 의 포트 선택이 배포 형상에 누출되지 않음.
- **D4** — **`ioredis` 를 루트 devDep 으로 hoist**: 대안은 `scripts/perf-harness.mjs` 가 `./node_modules/.pnpm/ioredis@5.10.1/node_modules/ioredis/built/index.js` 같은 pnpm store 경로를 직접 import — 버전 pin 되어 fragile. 루트 devDep 은 `package.json` 1줄로 scripts 가 workspace resolution 없이 ioredis 를 쓸 수 있게 한다.
- **D5** — **베이스라인 은 `docs/02 §12.4` 에 embed**: 별도 `infra/perf/baseline.json` artifact 를 만들지 않은 이유 — 베이스라인 수치가 "Runtime 튜닝 시 비교할 기준점" 이지 "CI 회귀 detect" 는 아님. docs 본문에 표로 박아 두면 ADR 0006 follow-up 을 읽는 사람이 즉시 참조 가능. 실 배포 후 재측정 시 표만 갱신.
- **D6** — **perf-harness 의 counter 배선이 `apps/worker-generate/src/main.ts` 와 **같은 패턴**** — 여기서만 inline 하는 것이 아닌 Runtime 배포 메인 엔트리 와 동일한 closure ref 늦 바인딩을 씀. 향후 registry-scoped counter 를 registry 에서 노출하는 방식으로 단순화하면 두 곳이 **동시** 단순화될 수 있음.

---

## 5. 검증

```
$ node scripts/perf-harness.test.mjs
  ✓ smoke 20 jobs / concurrency 4 → pass
  ✓ 강제 SLO 위반 → pass=false + violations 정확히 감지
  ✓ jobs=0 경계 — error_rate=0, p* 전부 0, throughput 위반만 발생
  ✓ config.driver=in-memory 기본값 (세션 66)
  ✓ driver=bullmq + REDIS_URL 미설정 → 가드 동작 (세션 66)
  ✓ parseMetrics — enqueued_total + depth{state=*} label 필터링 (세션 72)
[perf-harness] ✅ all checks pass

$ node scripts/test-golden.mjs
... 21/21 step pass (tests 30 / pass 25 / skipped 5 in bullmq lane)

$ node scripts/validate-schemas.mjs
[validate] checked=244 failed=0
[validate] ✅ all schemas + rig templates valid
```

로컬 Redis 베이스라인은 본문 §3 에 기록 — CI 에선 `bullmq-integration` lane (세션 69) 이 tests 만 돌리므로 perf 하네스를 실행하지 않는다. 실 배포 성능은 `docs/02 §12.4` 표의 수치로 참조.

---

## 6. 남긴 숙제

- **`--target-url` 외부 하네스 모드**: 현재 perf-harness 는 같은 프로세스 안에서 producer+consumer 를 inline 으로 돌리므로 "producer Service + consumer Worker 독립 프로세스" 배포 형상 (세션 66 Helm chart) 의 실측은 아직. 외부 클라이언트가 producer Service 에 HTTP 만 날리는 모드가 ADR 0006 §D3 X+4 의 최종 매듭 — 세션 73 후보.
- **`--concurrency` 스윕**: 세션 67 `GENY_WORKER_CONCURRENCY` 가 Worker 로 흐른 이후 bullmq 경로에서 C=1/4/8/16 스윕 해 tput 포화점 탐색 — 세션 74 후보.
- **`queue.depth`** (현재 세션에서는 in-process inline 모드라 sampler 미배선 → 파싱돼도 비어 있음). 세션 66 Helm chart 배포 형상에서는 sampler 가 돌아가므로 `report.queue.depth` 가 실 데이터로 채워짐.

---

## 7. 결과

- `scripts/perf-harness.mjs` — `queue.enqueued_total` + 옵션 `queue.depth` 를 보고서에 주입, bullmq 경로에서 `geny_queue_enqueued_total` counter 자동 배선.
- `scripts/perf-harness.test.mjs` — 5 → **6 pass** (+parseMetrics).
- `docs/02 §12.4` — 드라이버 베이스라인 표 + `parseMetrics` 훅 설명 추가.
- `package.json` (root) — devDep `ioredis: ^5` hoist.
- golden 21/21 step 불변, validate-schemas checked=244 불변, `@geny/job-queue-bullmq` tests 30 / pass 25 / skipped 5 불변.
- ADR 0006 follow-up: Foundation SLO 임계 + Runtime 베이스라인 두 층이 docs/02 §12.4 에 공존.
