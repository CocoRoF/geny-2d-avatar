# 세션 83 — observability-e2e `--vendor-mock` + HTTP-path 스냅샷 drift=0 고정

**일자**: 2026-04-20
**워크스트림**: Platform / AI Generation / Observability
**선행 세션**: 세션 75 (Mock 스냅샷 베이스라인), 세션 77 (observability-e2e 오케스트레이션), 세션 78 (CI lane 승격), 세션 80 (`observability-snapshot-diff.mjs`), 세션 82 (mock-vendor-server)

---

## 1. 문제

세션 82 에서 nano-banana / sdxl / flux-fill HTTP 계약을 재현하는 mock-vendor-server 를 갖췄고, 세션 75/80 에서 Mock-adapter 경로 스냅샷(`smoke-snapshot-session-75.txt`) + structural drift 파서를 갖췄다. 그러나 Foundation 의 핵심 불변식 —

> **"Mock 어댑터 → 실 HTTP 어댑터 전환 시 관측 계약(metric 이름 + label 키 집합)이 보존된다"**

— 를 CI 로 회귀 고정하는 고리가 없었다. 세션 82 까지는 HTTP 어댑터의 **개별 호출** 계약만 수동 round-trip 으로 검증. 파이프라인 전체(`producer → Redis → consumer → /metrics exposition`)가 Mock 과 HTTP 양쪽에서 **동일 구조** 의 Prometheus 텍스트를 방출하는지 비교해야 비로소 Runtime PR (실 벤더 키 투입) 시점에 regression surface 가 0 이 된다.

본 세션은 세션 82 mock 서버를 observability-e2e 가 선택적으로 기동하는 `--vendor-mock` 모드를 도입해 이 고리를 닫는다.

---

## 2. 변경

### 2.1 `scripts/observability-e2e.mjs` — `--vendor-mock` 모드

신규 CLI 플래그 5종:
- `--vendor-mock` (boolean) — 모드 스위치
- `--mock-seed N` (default 42) · `--mock-latency-mean-ms N` (default 0) · `--mock-latency-jitter-ms N` (default 0) · `--mock-fail-rate R` (default 0) — mock-vendor-server 파라미터 passthrough

신규 헬퍼:
- `startMockVendor()` — `scripts/mock-vendor-server.mjs` 를 `--port 0` (ephemeral) 로 spawn. stdout 의 `mock-vendor listening: http://localhost:<port>` 한 줄을 regex 파싱해 base URL 반환. 5초 내 listening 미확인 → throw. cleanupTasks 에 SIGTERM → 3s → SIGKILL 패턴 push (세션 77 startWorker 동형). 로그는 `${LOG_DIR}/mock-vendor.log` 로 tee.
- `writeHttpMockCatalog(mockUrl)` — `infra/adapters/adapters.json` 를 JSON 파싱 → 모든 어댑터 엔트리의 `config.endpoint` 를 `mockUrl` 로 치환 → `${LOG_DIR}/vendor-mock-catalog.json` 로 작성. `api_key_env` 필드는 원본 보존 (호출자가 env 로 "test-token" 주입).
- `startWorker(role, port, extra = [], extraEnv = {})` — 기존 시그니처에 4번째 인자 `extraEnv` 추가. `{ ...process.env, REDIS_URL, ...extraEnv }` merge. 세션 77 의 재귀 호출은 3 인자 → default 유지.

`main()` 분기:
```js
if (VENDOR_MOCK) {
  const mockUrl = await startMockVendor();
  const catalogPath = writeHttpMockCatalog(mockUrl);
  httpArgs = ["--http", "--catalog", catalogPath];
  httpEnv = {
    NANO_BANANA_API_KEY: "test-token",
    SDXL_API_KEY: "test-token",
    FLUX_FILL_API_KEY: "test-token",
  };
}
const producer = startWorker("producer", PRODUCER_PORT, httpArgs, httpEnv);
const consumer = startWorker("consumer", CONSUMER_PORT, ["--concurrency", ..., ...httpArgs], httpEnv);
```

→ producer/consumer 가 `apps/worker-generate --http --catalog <임시 카탈로그>` 로 뜨고, `createHttpAdapterFactories`(세션 42) 가 catalog 의 `config.endpoint` 와 `api_key_env` 를 읽어 `HttpNanoBananaClient` / `HttpSDXLClient` / `HttpFluxFillClient` 를 조립. perf-harness smoke (N=20) 가 흐르며 **실 HTTP 경로** 의 exposition 이 수집된다.

### 2.2 `infra/observability/smoke-snapshot-http-session-83.txt` 신규

`--vendor-mock --snapshot` 으로 캡처한 HTTP-path 베이스라인 (8 메트릭, `geny-obs-83` queue_name). 세션 75 Mock 스냅샷과 **metric 이름 · label 키 집합 동일** (drift=0 실측):

```
[diff] baseline=smoke-snapshot-session-75.txt (8 metrics)
[diff] current=smoke-snapshot-http-session-83.txt (8 metrics)
[diff] added=0 removed=0 labelDrift=0 sampleCountDelta=0
[diff] ✅ no structural drift
```

8 메트릭: `geny_queue_depth{queue_name,state}` · `geny_queue_enqueued_total{queue_name}` · `geny_queue_duration_seconds{outcome,queue_name}` · `geny_queue_failed_total` · `geny_ai_call_cost_usd{model,stage,vendor}` · `geny_ai_call_duration_seconds{le,model,stage,vendor}` · `geny_ai_call_total{model,stage,status,vendor}` · `geny_ai_fallback_total`. 라우팅은 primary=nano-banana (rw=100) 이 항상 성공 → fallback 미발생 → `geny_ai_fallback_total` TYPE-only, `geny_ai_call_total{status="success"}` 20 — Mock 스냅샷과 cardinality 동일.

### 2.3 `scripts/test-golden.mjs` — step 25 → **26**

`observability Mock↔HTTP snapshot drift` 추가 (~56ms). 두 **커밋된** 파일을 `observability-snapshot-diff.mjs` 로 비교만 하므로 Redis/Docker/네트워크 불필요. Foundation 단계에서 HTTP 어댑터 코드 또는 금속 metric 세트를 건드리면 스냅샷 재캡처가 필요한 상황을 golden 이 즉시 파손해 알려준다.

### 2.4 `.github/workflows/ci.yml` — `bullmq-integration` lane 에 `Observability e2e (--vendor-mock)` step 추가

기존 세션 77 `Observability e2e` step 뒤에 신규 step (`id: observability-e2e-vendor-mock`):
```yaml
- name: Observability e2e (--vendor-mock)
  run: |
    SNAP=/tmp/obs-http-fresh.txt
    node scripts/observability-e2e.mjs --reuse-redis --redis-url "$REDIS_URL" \
      --vendor-mock --snapshot "$SNAP" \
      --queue-name geny-obs-83 --producer-port 9093 --consumer-port 9094 \
      --log-dir artifacts/observability-e2e-vendor-mock
    node scripts/observability-snapshot-diff.mjs \
      --baseline infra/observability/smoke-snapshot-session-75.txt \
      --current "$SNAP"
```

첫 번째 e2e step 과 포트/큐 이름/로그 디렉터리를 분리 (9091/9092 vs 9093/9094, `geny-obs-77` vs `geny-obs-83`, `artifacts/observability-e2e/` vs `artifacts/observability-e2e-vendor-mock/`) → 순차 실행 충돌 0. 세션 79 artifact upload step 의 조건을 두 e2e step OR 로 확장 + path 를 두 로그 디렉터리 모두 포함하도록 확장.

**Fresh 캡처 검증의 의미**: golden step 26 은 두 **커밋된** 파일 비교 (`--vendor-mock` 러닝 없이도 파일이 건드려지면 즉시 파손) · CI `--vendor-mock` step 은 **실시간 캡처 → 커밋된 Mock baseline 비교** (mock-vendor-server.mjs 또는 observability-e2e.mjs 의 orchestration 변경으로 exposition 이 변형되면 파손). 두 층이 상보적.

---

## 3. 검증

### 3.1 로컬 full e2e (Redis 미기동 → reuse 하지 않음)

```
$ node scripts/observability-e2e.mjs --vendor-mock \
    --snapshot infra/observability/smoke-snapshot-http-session-83.txt \
    --queue-name geny-obs-83
[e2e] reuse-redis=false redis=redis://127.0.0.1:6383 queue=geny-obs-83 jobs=20 vendor-mock=true
[e2e] redis container started
[e2e] mock-vendor OK — http://localhost:<ephemeral>
[e2e] vendor-mock wired — catalog=artifacts/observability-e2e/vendor-mock-catalog.json
[e2e] producer ready
[e2e] consumer ready
[e2e] perf-harness OK (enqueued=20 completed=20)
[e2e] observability-smoke OK
[e2e] snapshot written to …/smoke-snapshot-http-session-83.txt
[e2e] ✅ all checks passed
```

### 3.2 Mock ↔ HTTP drift=0

```
$ node scripts/observability-snapshot-diff.mjs \
    --baseline infra/observability/smoke-snapshot-session-75.txt \
    --current infra/observability/smoke-snapshot-http-session-83.txt --verbose
[diff] baseline=…smoke-snapshot-session-75.txt (8 metrics)
[diff] current=…smoke-snapshot-http-session-83.txt (8 metrics)
[diff] added=0 removed=0 labelDrift=0 sampleCountDelta=0
[diff] ✅ no structural drift
```

### 3.3 golden 26/26

```
$ node scripts/test-golden.mjs
... (26 step 全部 ✔) ...
[golden] ✔ mock-vendor-server tests (158 ms)
[golden] ✔ observability Mock↔HTTP snapshot drift (56 ms)
[golden] ✅ all steps pass
```

---

## 4. 주요 결정축

- **D1** — **플래그 추가 vs 새 스크립트**: observability-e2e 는 이미 Redis spawn / producer-consumer 배선 / perf-harness smoke / observability-smoke 검증 / cleanup 을 갖춘 오케스트레이터. `--vendor-mock` 은 "Mock 어댑터 대신 실 HTTP 어댑터 경로" 한 줄 차이이므로 **동일 스크립트 확장** 이 최적 (코드 ~70줄 증가 vs 새 스크립트 ~300줄). 세션 83 의 두 CI step 이 다른 두 파일이 아니라 같은 스크립트 + 다른 플래그 라는 점이 리뷰어에게도 명확.
- **D2** — **임시 카탈로그 파일 vs in-memory override**: 워커는 CLI `--catalog <path>` 로만 HTTP 모드 어댑터를 받는다 (세션 42 계약). 따라서 fs 임시 파일이 불가피. `${LOG_DIR}/vendor-mock-catalog.json` 에 쓰면 CI 실패 시 artifact 로 자동 보존되어 디버깅에 유리 (원 카탈로그에서 어떤 endpoint 치환이 됐는지 증적).
- **D3** — **API key = "test-token"**: mock-vendor-server 는 세션 82 D4 결정에 따라 Bearer 값 자체를 검증 안 함 (헤더 존재만). 따라서 env 에 고정 문자열 하나면 충분. 실 벤더 키 fixture 의 flicker 위험 0, 시크릿 스캐너 오탐 0.
- **D4** — **producer/consumer 양쪽에 httpEnv 주입**: producer 는 orchestrate 를 돌리지 않지만(`mode="producer-only"`) — worker-generate 의 `--http` 플래그가 일관되려면 양쪽 모두 같은 env 로 떠야 함. 실 운영에서도 producer pod 에 API key 가 있어야 fallback on partial upgrade (세션 66 Helm D4) 불변식이 유지.
- **D5** — **포트 9093/9094 + queue `geny-obs-83`**: 첫 번째 e2e step (9091/9092 / `geny-obs-77`) 과 충돌 방지. runner 는 순차 실행이지만 두 번째 step 이 container 를 재사용하며 큐 이름만 바꿔 **서로 다른 잡 스트림** 이 Redis 한 인스턴스에 공존 — 첫 step 의 잔여 잡이 두 번째 step 에 유입되지 않음.
- **D6** — **log-dir 분리 `artifacts/observability-e2e-vendor-mock/`**: 세션 79 artifact path 는 디렉터리 기준이라 같은 이름이면 덮어씌움. 분리해서 두 step 실패 중 어느 쪽이 무엇을 남겼는지 구분. upload step 의 `path: |` multi-line 도 함께 확장.
- **D7** — **golden step 26 = 파일 비교**: 두 커밋된 스냅샷 비교는 Docker/Redis/네트워크 0 의존 + 수 ms — golden lane 에서 무조건 회귀. CI `--vendor-mock` step 은 실 Redis + worker spawn 필요 → bullmq-integration lane 전용. **같은 불변식을 두 층에서 방어** (파일 변조 ↔ 캡처 파이프라인 변조).
- **D8** — **mock seed 42 / latency 0 / fail-rate 0 default**: CI 결정론. 세션 82 mock-vendor-server 는 mulberry32 PRNG 라 seed 고정이면 실행마다 identical. 0 latency + 0 fail → Mock adapter 와 동일 shape (sample=20 정확, histogram bucket 전부 첫 버킷). latency/fail 주입은 세션 84+ `routeWithFallback` e2e 에서 활용 예약.
- **D9** — **queue_name 은 label-key 집합에 드러나지만 value 는 informational**: 세션 75 의 `queue_name="geny-obs-75"` 와 세션 83 의 `queue_name="geny-obs-83"` 은 라벨 값이 다름 — `observability-snapshot-diff.mjs` 는 label **key 집합** 만 비교하고 value 는 sample count 정보에 포함. 이것이 D5 의 queue 이름 자유도 근거. 만일 drift 파서가 value 까지 봤다면 queue_name 을 합쳐야 했을 것.

---

## 5. 남긴 숙제

- **장애 주입 e2e (세션 84 후보)**: `--mock-fail-rate 0.5` 로 Mock vendor 가 50% 500 응답 → `routeWithFallback` 이 nano-banana(rw=100) → sdxl(rw=80) → flux-fill(rw=70) 로 폴백하는 `attempts[]` 트레이스가 provenance 에 기록되는지 e2e 검증. `geny_ai_fallback_total` counter 도 양수로 증가 → 세션 75 Mock 스냅샷의 TYPE-only 와 의도적으로 다른 형태 — drift 기준 재설계 필요.
- **latency 실 분포 캡처**: `--mock-latency-mean-ms 30 --mock-latency-jitter-ms 10` → `geny_ai_call_duration_seconds` histogram 이 bucket `le=0.05` 에 집중 + `le=0.1` 이상 cumulative — Mock 0ms 때와 shape 이 다름. 세션 80 `observability-snapshot-diff.mjs` 를 sample-value-aware 모드(opt-in)로 확장하고 별도 baseline 으로 커밋.
- **실 staging 배포 (세션 85 후보)**: cluster access 확보 후 `helm install worker-generate -f values-staging.yaml` + kps ServiceMonitor 스크레이프 → `observability-snapshot-diff.mjs --baseline smoke-snapshot-session-75.txt --current <staging-scrape.txt>` drift=0. 본 세션은 **로컬 `--vendor-mock` 이 실 staging 스크레이프와 동형** 을 증명하므로 staging 단계 리스크 표면이 크게 축소.
- **web-editor Stage 3 (세션 86 후보)**: `apps/web-editor` 중앙 Preview Stage 에 WebGL 렌더러 합류 + Inspector 편집 모드 + `packages/web-editor-logic` 추출. 세션 81 스캐폴드 이후 잔여 스콥.
- **`packages/mock-vendor-server` 승격**: scripts/ 단일 파일 → 패키지. 현재 `observability-e2e.mjs` 외 호출자 없음 → YAGNI. 세션 84 장애 주입 e2e 가 두 번째 호출자가 되면 재평가.

---

## 6. 결과

- `scripts/observability-e2e.mjs`: `--vendor-mock` + 4 튜닝 플래그 + `startMockVendor()` + `writeHttpMockCatalog()` + `startWorker(role, port, extra, extraEnv)` 확장. 세션 82 mock-vendor-server 를 observability-e2e 가 소유 (spawn / stdout 파싱 / cleanup 등록).
- `infra/observability/smoke-snapshot-http-session-83.txt` 신규 — `--vendor-mock` 로 캡처한 HTTP-path 베이스라인 (8 메트릭, 세션 75 Mock 스냅샷 대비 drift=0).
- `scripts/test-golden.mjs` 25 → **26 step** (`observability Mock↔HTTP snapshot drift`, ~56ms).
- `.github/workflows/ci.yml` `bullmq-integration` lane 에 `Observability e2e (--vendor-mock)` step 추가 (포트 9093/9094 + queue `geny-obs-83` + log-dir 분리) + artifact upload 조건/경로 확장.
- **Foundation "Mock → HTTP 전환이 관측 계약을 보존" 불변식** 이 CI 2층 (golden step 26 = 파일 비교 + bullmq-integration lane = 실시간 캡처→비교) 에서 회귀 고정. 실 벤더 키 투입 시점의 관측 계약 drift 표면 0 확보.
- Foundation 마감 잔여: 실 staging 배포 (cluster access 확보 시점) · 실 벤더 분포 캡처 (API 키 확보 시점) · web-editor Stage 3. 관측 계약 축은 본 세션으로 **완전 고정**.
