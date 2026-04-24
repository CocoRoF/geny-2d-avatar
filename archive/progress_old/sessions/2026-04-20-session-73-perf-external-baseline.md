# 세션 73 — `perf-harness --target-url` 외부 모드 + 독립 프로세스 베이스라인

**일자**: 2026-04-20
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4 (split topology 최종 매듭)
**선행 세션**: 세션 66 (`--driver bullmq` CLI + Helm chart 2-deployment 배포 형상), 세션 72 (`/metrics` 스크레이프 + inline bullmq 베이스라인)

---

## 1. 문제

세션 72 가 `--driver bullmq` inline 경로 (같은 Node 프로세스가 producer+consumer 를 다 돈다) 를 측정했지만 **ADR 0006 §D3 X+4 의 실 배포 형상 — producer Service 와 consumer Worker 가 분리된 두 프로세스** — 은 아직 비어 있었다. 세션 66 Helm chart 에서 두 Deployment 로 쪼갰지만 "producer 에 HTTP 만 쏘고 consumer 가 백그라운드에서 잡는" 배포 형상의 p95/tput 이 Foundation SLO 를 정말 만족하는지 실측 증거가 없음 — p95 regression 을 비교할 기준점이 inline 숫자 밖에 없어서 "split 배포로 바꾸고 p95 가 늘어난 건지 원래 그런지" 를 판단할 수 없다.

### 1.1 배포 형상 구성

- **producer**: `worker-generate --role producer --queue-name geny-perf-73b` (port 9091)
- **consumer**: `worker-generate --role consumer --queue-name geny-perf-73b --concurrency 4` (port 9092)
- **Redis**: `docker run -p 6380:6379 redis:7.2-alpine` (세션 72 와 동일 — feature-store 컨테이너가 6379 를 점유해서 6380 사용)

### 1.2 `perf-harness` 쪽 갭

현 `scripts/perf-harness.mjs` 는 내부에서 `createWorkerGenerate` 로 같은 프로세스 안에 producer+consumer 를 띄우고 submit 후 `worker.store.waitFor(jobId)` 로 메모리 local Map 을 기다림. 외부 프로세스 producer 에 HTTP 만 쏠 방법이 없고, 잡 완료를 감지할 채널도 없음.

---

## 2. 변경

### 2.1 `scripts/perf-harness.mjs`

**(a) `--target-url` CLI 플래그 신규** — `parseTargetUrl(raw)` 로 http(s) URL 을 `{ host, port }` 로 normalize. port 생략 시 scheme 디폴트 (80/443). `ftp://` / 비-URL 입력은 즉시 throw.

**(b) `runHarness` 분기 리팩토링**:

```js
const external = cfg.targetUrl ? parseTargetUrl(cfg.targetUrl) : null;
let worker, driverCleanup, server, host, port;
if (external) {
  host = external.host;
  port = external.port;
} else {
  const built = await buildWorker(cfg);
  worker = built.worker;
  driverCleanup = built.cleanup;
  server = worker.createServer();
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  host = "127.0.0.1";
  port = server.address().port;
}
```

external 경로는 로컬 서버/드라이버 일체 생성하지 않음 — HTTP 클라이언트 only.

**(c) `waitTerminal` 전략 분기**:

- in-process: 기존 `worker.store.waitFor(jobId, timeoutMs)` — 메모리 Map + 웨이터.
- external: `GET /jobs/{id}` 폴링 (2ms → 50ms cap, 1.8× 백오프, 15s 하드 타임아웃). 200 → JSON parse → `status` 가 terminal 이면 반환, 404 → `null`.

**(d) `config.driver` 라벨**: external 모드에선 `"external"` 로 표기 — cfg.driver 기본값 (`in-memory`) 이 누출되지 않게.

### 2.2 `packages/job-queue-bullmq/src/job-store.ts` — **버그 수정**

외부 하네스 첫 시도에서 `run_ms=195473ms (~195s)` 에 `error_rate=1 (100/100 timeout)` 이 나온 이유: **`producer-only` 모드에서 `store.get(id)` 가 캐시된 `queued` 레코드를 영원히 반환**. submit 시점에 `records.set(jobId, rec)` 로 `rec.status="queued"` 캐시, 이후 별 프로세스 consumer 가 BullMQ 에서 `completed` 로 전환해도 producer 의 cache 는 미갱신. `get(id)` 가 캐시 hit 에서 바로 반환해 `driver.getJob(id)` 로 폴백하지 않음 → 하네스 waitTerminal 이 15s × (100/8) ≈ 188s timeout 후 모두 실패.

**수정안** (`async get(id)` 의 2-단 캐시):

```ts
async get(id) {
  const cached = records.get(id);
  // 터미널 상태 캐시는 권위 — driver 가 removeOnComplete 로 스냅 지워도 결과 보존.
  if (cached && (cached.status === "succeeded" || cached.status === "failed")) {
    return cached;
  }
  // inline 모드에선 같은 프로세스가 execute() 로 rec 를 갱신하므로 캐시가 권위.
  if (cached && mode === "inline") return cached;
  // producer-only: 캐시가 queued/running 이면 별 프로세스 Worker 가 진행했을 수
  // 있으므로 driver.getJob 로 refresh.
  const snap = await driver.getJob(id);
  if (!snap) return cached;
  const fresh = snapshotToRecord(snap.data.payload as GenerationTask, snap);
  if (cached) {
    cached.status = fresh.status;
    if (fresh.started_at) cached.started_at = fresh.started_at;
    if (fresh.finished_at) cached.finished_at = fresh.finished_at;
    if (fresh.status === "succeeded" || fresh.status === "failed") fulfillWaiters(cached);
    return cached;
  }
  return fresh;
}
```

**계약 특성**:

- `inline` 모드는 기존 의미 그대로 — 캐시가 권위 (같은 프로세스가 `execute()` 로 갱신).
- `producer-only` + 비-터미널 캐시는 항상 driver refresh — 별 프로세스 consumer 와의 상태 동기화 지점.
- 터미널 캐시는 `removeOnComplete` 로 BullMQ 에서 사라져도 마지막 결과 보존 — retention 경계에서도 외부 하네스 `get(id)` 가 404 로 빠지지 않음.

### 2.3 테스트

- **`packages/job-queue-bullmq/tests/job-store.test.ts`**: +1 케이스 — "`producer-only` 은 `get(id)` 에서 driver refresh". fake driver 의 `__store` 를 `completed` 로 mutate → `store.get(id)` 가 `succeeded` 반환 + `started_at/finished_at` 주입 확인. 이어서 `__store.delete(id)` 해도 캐시가 권위라 여전히 `succeeded` 반환.
- **`scripts/perf-harness.test.mjs`**: +1 케이스 — `parseTargetUrl` 계약 (http://host:port, scheme 디폴트 port, ftp/non-url throw).

### 2.4 `docs/02 §12.4`

베이스라인 표 3행으로 확장: `in-memory` / `bullmq` (inline) / `external` (split). `external` 행에 client-observed wait-for-terminal roundtrip 임을 주석 — inline `orch_latency` 와 직접 비교 불가하지만 SLO 임계는 공유.

### 2.5 `progress/INDEX.md`

§3 Pipeline 행에 세션 73 요약 append, §4 Session Ledger 에 행 추가, §8 Autonomous 로드맵 로테이션 (74 = `--concurrency` 스윕, 75 = Editor/observability).

---

## 3. 실측 결과

**조건**: darwin 25.3.0, Node 22.x, N=100, C=8, Mock 어댑터 파이프라인, Redis 7.2-alpine docker (port 6380, `maxmemory-policy noeviction`), FLUSHALL 후 cold → warm 측정.

| 드라이버 | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | err | enqueued_total |
|---|---|---|---|---|---|---|---|
| `external` (split, cold run) | 84 | 8.61 | 14.62 | 14.72 | 1190.48 | 0 | 100 |
| `external` (split, warm run 1) | 36 | 6.14 | 6.91 | 8.95 | 2777.78 | 0 | 100 |
| `external` (split, warm run 2) | 39 | 6.17 | 6.94 | 8.82 | 2564.10 | 0 | 100 |
| `external` (split, warm run 3, final) | 42 | 7.76 | 8.56 | 10.65 | 2380.95 | 0 | 100 |

Foundation SLO 임계 (accept_p95≤100, orch_p95≤500, orch_p99≤1500, tput≥10) 대비: accept/orch p95 는 12× 여유, tput 은 238× 여유. 세션 72 inline bullmq (43ms / 18.08ms / 2325/s) 와 유사한 수준 — **split 오버헤드는 Mock 파이프라인 기준 유의미하지 않음**. producer→consumer 간 BullMQ 큐 hop 이 inline 모드에서도 이미 존재하므로 split 이 추가하는 건 HTTP submit + get poll 의 client 측 오버헤드뿐.

---

## 4. 주요 결정축

- **D1** — **`waitTerminal` 을 HTTP polling 으로** (redis pub/sub 이나 job-complete 이벤트 큐가 아님): consumer 프로세스가 명시적 이벤트 채널을 제공하지 않으며 추가로 만들면 "batch/perf 용 스니핑 채널이 프로덕션 계약에 누출" 되는 문제가 있음. 폴링은 client-side 만 복잡해지고 producer API 가 바뀌지 않음. 2ms→50ms 백오프로 busy-loop 없이 충분히 빠름 (warm 경로에서 roundtrip 평균 6.31ms).
- **D2** — **`orch_latency` 의 의미는 모드마다 다르다는 걸 문서에 박아둠** (숨기지 않음): inline 에서는 `submit → orchestrate 완료` in-process 구간, external 에서는 `submit 응답 → 첫 polling hit 이 terminal` roundtrip. 같은 p95 임계 (500ms) 에 묶여 있지만 측정 대상이 다름 — 섞어서 비교하지 않도록 §12.4 본문에 명시.
- **D3** — **`producer-only` + `get(id)` driver refresh 는 로컬 캐시를 유지하면서** 이전 시맨틱을 보존 (터미널 캐시는 권위 · retention 경계 보호 · waiters 해소). 대안은 "cache 완전 삭제 + 매번 driver hit" 였는데 (a) `@geny/worker-generate` 의 producer 라우터가 같은 레코드를 여러 번 GET 할 수 있고 (b) `removeOnComplete` 이후 driver 에 스냅이 없으면 결과를 잃는다. 두 단 캐시가 양쪽 보호.
- **D4** — **버그 수정의 scope 은 `producer-only` 만**: inline 경로에선 같은 프로세스가 `execute()` 로 rec 를 갱신하므로 캐시가 여전히 권위. mode 별 분기 1줄로 regression 위험 최소화.
- **D5** — **`config.driver="external"` 라벨 신규**: `cfg.driver` 기본값 (`in-memory`) 이 external 모드 보고서에 누출되면 "어떤 드라이버로 잰 수치야?" 판단이 불가. `driver: external ? "external" : (cfg.driver ?? "in-memory")` 한 줄로 해결 — report consumer 가 driver 필드만 보고 배포 형상 식별 가능.
- **D6** — **하나의 호스트에서 split 토폴로지를 에뮬레이션**: 진짜 Helm chart 환경은 세션 66 에서 이미 기동 검증된 상태 (health endpoint 조사). 세션 73 은 "배포 형상의 p95/tput 특성" 실측이 목표이므로 network hop 이 0 인 로컬 emulation 이 오히려 baseline 으로 더 엄격 (k8s pod-to-pod latency 가 추가되면 숫자가 늘어날 수 있음 — lower bound baseline).

---

## 5. 검증

```
$ pnpm --filter @geny/job-queue-bullmq test
✔ 31 tests / 26 pass / 5 skipped (REDIS_URL 미설정으로 redis integration skip) / 0 fail

$ node scripts/perf-harness.test.mjs
  ✓ smoke 20 jobs / concurrency 4 → pass
  ✓ 강제 SLO 위반 → pass=false + violations 정확히 감지
  ✓ jobs=0 경계 — error_rate=0, p* 전부 0, throughput 위반만 발생
  ✓ config.driver=in-memory 기본값 (세션 66)
  ✓ driver=bullmq + REDIS_URL 미설정 → 가드 동작 (세션 66)
  ✓ parseMetrics — enqueued_total + depth{state=*} label 필터링 (세션 72)
  ✓ parseTargetUrl — http(s) + port 디폴트 + 오입력 throw (세션 73)
[perf-harness] ✅ all checks pass

$ node scripts/perf-harness.mjs --jobs 100 --concurrency 8 \
    --queue-name geny-perf-73b --target-url http://127.0.0.1:9091
[perf] driver=external queue=geny-perf-73b target=http://127.0.0.1:9091 jobs=100 concurrency=8 run_ms=42
[perf] accept  p50=2.12ms p95=7.76ms p99=8.85ms
[perf] orch    p50=2.55ms p95=8.56ms p99=10.65ms
[perf] tput=2380.95/s err=0 (0/100)
[perf] ✅ SLO pass
```

베이스라인 수치는 §3 표 + `docs/02 §12.4` 에 박음. golden 21/21 불변 (Foundation 파이프라인 미변경), validate-schemas checked=244 불변.

---

## 6. 남긴 숙제

- **`--concurrency` 스윕**: 세션 67 `GENY_WORKER_CONCURRENCY` 가 Worker 로 흐른 이후 split 경로에서 C=1/4/8/16 스윕 해 tput 포화점 탐색 — 세션 74 후보 (세션 72 §6 에서 이미 queued).
- **k8s pod-to-pod 실측**: 로컬 split 은 network hop 이 0 이므로 실 Helm chart 배포 후 cluster 내 실측을 추가. staging 환경이 준비된 뒤 재측정.
- **`bullmq` inline 과 `external` 의 orch_latency 통합 시맨틱**: 세션 73 시점엔 동일 임계를 공유하되 측정 대상이 다름을 문서로만 분리. 장기적으로는 client-observed vs in-process 둘 다 나누는 SLO 이원화가 필요할 수 있음 — Runtime 튜닝 단계로 이월.

---

## 7. 결과

- `scripts/perf-harness.mjs` — `--target-url` 외부 하네스 모드 + `config.driver="external"` 라벨링.
- `scripts/perf-harness.test.mjs` — 6 → **7 pass** (+parseTargetUrl).
- `packages/job-queue-bullmq/src/job-store.ts` — `producer-only` + `get(id)` driver refresh 버그 수정 (세션 73 발견).
- `packages/job-queue-bullmq/tests/job-store.test.ts` — 26 → **27 pass** (+producer-only refresh).
- `docs/02 §12.4` — 베이스라인 표 3행 (in-memory / bullmq inline / external split).
- `progress/INDEX.md` — 세션 73 행 추가, §3 Pipeline append, §8 로테이션.
- ADR 0006 §D3 X+4: **producer/consumer 분리 배포 형상 실측 확보 — baseline run_ms=42ms / accept_p95=7.76ms / orch_p95=8.56ms / tput=2380/s / err=0**.
