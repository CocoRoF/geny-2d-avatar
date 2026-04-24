# 세션 74 — Consumer `--concurrency` 스윕 + Mock 파이프라인 포화점 검증

**일자**: 2026-04-20
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4 (Runtime 튜닝 기반 데이터)
**선행 세션**: 세션 67 (`--concurrency N` CLI flag + env fallback), 세션 72 (`--driver bullmq` inline 베이스라인), 세션 73 (`--target-url` external 베이스라인 + `producer-only` `get(id)` 버그 수정)

---

## 1. 문제

세션 67 가 `--concurrency N` CLI 플래그를 뚫어 Helm chart `GENY_WORKER_CONCURRENCY` env 를 실제 BullMQ Worker 로 흐르게 했지만, **튜닝 기준점이 없음** — 어느 C 값에서 tput 이 포화하는지, 어느 지점에서 accept/orch p95 이 degrade 시작하는지 실측 없이 dev=2/prod=8 이 경험적으로 깔려 있는 상태. 세션 66 Helm chart 는 dev=2/prod=8 을 깔았지만 "Mock 벤더에서 8 이 의미 있나?" 를 검증한 적 없음.

ADR 0006 §D3 X+4 의 staging 튜닝 기반 데이터를 Foundation 에서 미리 캡처해두면 (a) Runtime 단계에서 실 벤더 HTTP 어댑터로 교체한 뒤 곡선이 어떻게 변하는지 비교 가능, (b) 기본값 튜닝의 근거 기록, (c) 성능 회귀 발견 시 "원래 그 C 값에서 이 숫자였나?" 즉답 가능.

---

## 2. 변경

### 2.1 `scripts/perf-sweep-concurrency.mjs` 신규

**목적**: 같은 producer/Redis 를 고정한 상태에서 consumer 만 매 회 재기동하며 C∈{1,2,4,8,16} 스윕, 결과를 markdown 표로 출력.

**동작**:
1. `--producer-url` healthcheck (`/healthz`) 확인.
2. 각 C 에 대해:
   - Redis FLUSHALL (ioredis 사용, 이전 큐 상태 오염 방지).
   - `node apps/worker-generate/dist/main.js ... --role consumer --concurrency C` child_process spawn.
   - consumer `/healthz` 폴링 (최대 12s).
   - **warm-up run** 한 번 (결과 버림) — consumer 첫 Redis connection + BullMQ Worker 부트가 본 측정에 섞이지 않게.
   - Redis FLUSHALL.
   - 본 측정: `scripts/perf-harness.mjs --target-url ... --jobs N --concurrency H` 실행, 보고서 파싱.
   - consumer SIGTERM (5s 내 미종료 시 SIGKILL).
3. 집계 rows 를 `summary.json` + stdout markdown table 로 출력.

**주요 CLI 플래그**:
- `--producer-url` (기본 `http://127.0.0.1:9091`)
- `--consumer-port` (기본 9092)
- `--redis-url` (기본 `redis://127.0.0.1:6380`)
- `--queue-name` (기본 `geny-perf-74`)
- `--jobs N` (기본 200)
- `--harness-concurrency H` (기본 16 — 충분한 HTTP 병렬 압박으로 consumer 쪽이 bottleneck 되게)
- `--concurrencies 1,2,4,8,16` (스윕 포인트)
- `--out-dir` (기본 `/tmp/perf-sweep-<timestamp>`, 각 C 별 report JSON 저장)

### 2.2 `docs/02 §12.4`

"Consumer `--concurrency` 스윕" 서브섹션 추가 — 5-행 표 + 해석. Mock 파이프라인에서 C 와 tput 이 무관하다는 결과 + Foundation 결론 (Helm chart 기본값 유지) + Runtime 재캡처 필요성.

---

## 3. 실측 결과

**조건**: darwin 25.3.0, Node 22.x, N=200, harness_C=16, Mock 파이프라인, Redis 7.2-alpine docker (port 6380), producer `apps/worker-generate --role producer` (port 9091), consumer `--role consumer --concurrency C` (port 9092), 각 C 별 warm-up 1회 + 본 측정 1회, 각 본 측정 전 FLUSHALL.

| consumer C | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | err | enqueued_total |
|---|---|---|---|---|---|---|---|
| 1 | 45 | 6.71 | 7.81 | 7.92 | 4444.44 | 0 | 200 |
| 2 | 46 | 6.36 | 7.47 | 7.58 | 4347.83 | 0 | 200 |
| 4 | 46 | 6.16 | 7.38 | 7.65 | 4347.83 | 0 | 200 |
| 8 | 48 | 6.40 | 7.44 | 7.84 | 4166.67 | 0 | 200 |
| 16 | 47 | 6.82 | 8.04 | 8.14 | 4255.32 | 0 | 200 |

### 3.1 해석

- **tput 은 C 와 무관** (범위 4166~4444/s, 편차 ±3%). Mock 어댑터 처리 시간이 너무 짧아(~0.1ms 수준) 단일 Worker 슬롯도 큐를 즉시 비움 → 병렬 슬롯이 대기 잡을 못 찾아 효과 없음.
- **accept/orch p95 도 C 와 무관** (범위 6.16~8.04ms, 편차 ±1ms). Redis enqueue roundtrip + HTTP submit 오버헤드가 dominant.
- `enqueued_total=200 === jobs=200` 모든 C 에서 — 세션 72 의 `geny_queue_enqueued_total` counter 배선이 재확인.
- **bottleneck 은 harness HTTP 압박** (`harness_C=16` 이 producer 라우터 + Redis enqueue 에 던지는 부하). Mock 파이프라인에서의 4400/s 는 "consumer 처리량" 이 아니라 "producer+Redis 수용량" ceiling.

### 3.2 Foundation 결론

- Helm chart `GENY_WORKER_CONCURRENCY` 기본값 (dev=2, prod=8) **유지** — Mock 파이프라인에서 regression 없음이 실증됨.
- 실 벤더 어댑터(nano-banana/sdxl/flux, 수백 ms ~ 수 s 처리) 투입 시 이 곡선이 비로소 의미를 가짐. Runtime 튜닝 단계에서 `scripts/perf-sweep-concurrency.mjs` 재사용해 실측 후 기본값 재조정.

---

## 4. 주요 결정축

- **D1** — **스윕 오케스트레이터를 script 로 외재화** (perf-harness 내부 플래그로 통합 아님): 하네스는 "단일 run 측정" 에 집중하고, 스윕은 "N run + consumer 재기동" 이라는 다른 관심사. 섞으면 하네스 테스트 로직이 child_process / healthcheck / Redis FLUSH 같은 외부 I/O 에 오염돼 단위 테스트 시 mock 부담 급증. 외재 script 는 orchestration only, 하네스는 측정 only — SoC.
- **D2** — **warm-up run 필수**: 첫 run 은 (a) consumer 프로세스 Node.js JIT warm-up (b) BullMQ Worker 첫 Redis connection + `waitUntilReady()` (c) ioredis pipelining 버퍼 warm — 이걸 본 측정에 섞으면 C=1 행만 편향된다. warm-up 으로 소거 후 본 측정.
- **D3** — **매 C 전 FLUSHALL**: removeOnComplete 가 있어도 완료된 job id set 은 잠시 Redis 에 남음 — 같은 `jobId` 패턴(`perf-N-HASH`) 재사용 시 dedupe 될 위험. FLUSHALL 로 clean slate 보장 (스윕이 연구자의 "새 실험" 단위로 끝까지 결정적이게).
- **D4** — **harness_C=16 고정**: harness 쪽 병렬도도 같이 올리면 두 축 교차 그리드가 필요(최소 25 run). 이번 세션 관심은 consumer 포화점이므로 harness 는 충분히 큰 압박 (16) 으로 고정하고 consumer 만 스윕. 실 벤더에선 consumer 처리가 훨씬 느려 harness_C=16 이 계속 producer 라우터에 큐잉되므로 consumer 처리량이 ceiling 로 드러남.
- **D5** — **Mock 포화점 = enqueue 경로의 ceiling** 이라는 해석 기록: 이 숫자를 "BullMQ 가 이만큼 빠르다" 로 오해하면 Runtime 튜닝이 엉뚱한 곳(consumer 병렬도 증가)으로 빠질 수 있음. docs/02 §12.4 에 "Mock 파이프라인에서는 ~ 포화점과 무관" 명시.
- **D6** — **관찰치 범위 ±3% 는 noise 선언 안 함**: 곡선이 평평하다는 주장의 근거로 사용. 본격 편차는 실 벤더에서 드러날 것 — Foundation 에선 증거 부재가 결론.

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
  ✓ parseTargetUrl — http(s) + port 디폴트 + 오입력 throw (세션 73)
[perf-harness] ✅ all checks pass

$ node scripts/perf-sweep-concurrency.mjs \
    --producer-url http://127.0.0.1:9091 \
    --redis-url redis://127.0.0.1:6380 \
    --queue-name geny-perf-74 \
    --jobs 200 --harness-concurrency 16 --concurrencies 1,2,4,8,16
[sweep] producer OK — redis=redis://127.0.0.1:6380 queue=geny-perf-74
[sweep] ── concurrency=1 ──
[sweep] C=1 run=45ms accept_p95=6.71ms orch_p95=7.81ms tput=4444.44/s err=0
[sweep] ── concurrency=2 ──
[sweep] C=2 run=46ms accept_p95=6.36ms orch_p95=7.47ms tput=4347.83/s err=0
... (위 표 참조)

$ node scripts/test-golden.mjs
[golden] ✅ all steps pass

$ node scripts/validate-schemas.mjs
[validate] checked=244 failed=0
[validate] ✅ all schemas + rig templates valid
```

---

## 6. 남긴 숙제

- **실 벤더 HTTP 어댑터 스윕**: staging cluster 에 nano-banana / sdxl / flux HTTP 어댑터를 연결한 상태에서 `perf-sweep-concurrency.mjs --producer-url <staging>` 재실행. 실 곡선에서 포화점 도출 + Helm chart 기본값 튜닝. Runtime 단계 과업.
- **harness_C 스윕**: 두 축 교차 grid (consumer_C × harness_C) 로 "producer 라우터 ceiling" 을 분리 측정. 이번 세션 관심 밖이었으므로 별도 후속.
- **network hop 비용 측정**: 로컬 loopback 은 네트워크 오버헤드 ~0. 실 k8s pod-to-pod latency 가 추가되면 accept/orch 가 수 ms 이상 증가 예상 — staging 실측 후 비교.

---

## 7. 결과

- `scripts/perf-sweep-concurrency.mjs` 신규 — consumer concurrency 스윕 오케스트레이터 (warm-up + FLUSHALL + markdown table 출력).
- `docs/02 §12.4` — "Consumer `--concurrency` 스윕" 서브섹션 (5-행 표 + Foundation 결론).
- **Foundation 실측**: Mock 파이프라인에서 consumer C ∈ {1,2,4,8,16} 전 구간 tput ~4200-4400/s, p95 ±1ms 편차 — `GENY_WORKER_CONCURRENCY` 기본값 유지 정당성 확보.
- ADR 0006 §D3 X+4 Runtime 튜닝 기반 데이터 Foundation 에서 선확보. 실 벤더 투입 시 `perf-sweep-concurrency.mjs` 재사용으로 곡선 재캡처.
- golden 21/21, validate-schemas checked=244, perf-harness test 7/7, job-queue-bullmq 26/31 pass (+5 skip) 불변.
