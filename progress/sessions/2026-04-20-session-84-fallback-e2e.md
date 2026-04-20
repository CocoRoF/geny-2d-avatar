# 세션 84 — per-endpoint fail rate + 결정론적 fallback e2e + `geny_ai_fallback_total` 샘플 CI 고정

**일자**: 2026-04-20
**워크스트림**: Platform / AI Generation / Observability
**선행 세션**: 세션 30 (`routeWithFallback` / `orchestrate`), 세션 33 (MetricsHook/`geny_ai_fallback_total` counter), 세션 75 (Mock 스냅샷 — fallback TYPE-only), 세션 82 (mock-vendor-server), 세션 83 (`--vendor-mock` observability-e2e + HTTP 스냅샷 drift=0)

---

## 1. 문제

세션 83 에서 Mock→HTTP 관측 계약 drift=0 을 CI 로 고정했지만, **fallback 경로가 실제로 동작하는지** 는 여전히 회귀 불능:

- 세션 75 Mock 스냅샷: primary=nano-banana(rw=100) 항상 성공 → `geny_ai_fallback_total` TYPE-only (sample 없음).
- 세션 83 HTTP 스냅샷: 동일 조건 → 동일 shape.
- 즉, "`routeWithFallback` 이 실제로 폴백을 발동할 수 있다" 와 "그 때 metric 이 흐른다" 는 unit test (`route-with-fallback.test.ts`) 로만 보증. 파이프라인 전체 (producer → Redis → consumer → `/metrics` 스크레이프) 의 fallback 경로는 관측 불가.

본 세션은 mock-vendor 에 per-endpoint fail rate override 를 도입해 **결정론적** fallback e2e 를 구성하고, fallback 경로의 metric 방출을 CI 2층 (golden + bullmq-integration) 에서 회귀 고정한다.

"Foundation 'Mock → HTTP 전환이 관측 계약을 보존' (세션 83) 옆에 'fallback 경로가 관측 상 없었던 일이 되지 않는다' (세션 84) 를 나란히 세운다."

---

## 2. 변경

### 2.1 `scripts/mock-vendor-server.mjs` — 엔드포인트별 fail rate

기존 단일 `--fail-rate` 에 추가로 3 플래그:
- `--fail-rate-generate` — `/v1/generate` (nano-banana) 전용.
- `--fail-rate-edit` — `/v1/edit` (sdxl) 전용.
- `--fail-rate-fill` — `/v1/fill` (flux-fill) 전용.

구현: `pickRate(v) = Number.isFinite(v) ? clamp01(v) : failRate` — 각 엔드포인트별 override 가 있으면 사용, 없으면 전역 `failRate` 상속 (세션 82 호환). handler 내부에서 `kindFailRate[kind]` 로 분기. RNG 는 단일 mulberry32(seed) 공유 — 엔드포인트별 별도 rng 를 두지 않아 시드 하나로 전체 실패 시퀀스가 결정된다.

**nano-banana=1.0 / sdxl=0 / flux=0 조합의 효과**: 라우터가 매 호출에서
1. nano-banana HTTP 500 수신 → `AdapterError("VENDOR_ERROR_5XX")` → `mapErrorToStatus` → `"5xx"` → `metrics.onCall({status:"5xx", vendor:"nano-banana"})` + `metrics.onFallback({fromVendor:"nano-banana", toVendor:"sdxl", reason:"5xx"})` 방출.
2. sdxl HTTP 200 수신 → success → `metrics.onCall({status:"success", vendor:"sdxl", costUsd})`.
3. 결과 반환, `attempts=[{nano-banana, ok:false, errorCode:"VENDOR_ERROR_5XX"}, {sdxl, ok:true}]`.

20 잡 전부 이 경로 → 결정론적 exposition.

### 2.2 `scripts/mock-vendor-server.test.mjs` — +2 tests (13 → **15**)

- `per-endpoint fail-rate: generate=1.0 → 500, edit=0 → 200` — override 경로 검증.
- `per-endpoint fail-rate: undefined → inherits global fail-rate` — 전역 failRate=1 + failRateEdit=0 override → generate/fill=500, edit=200 (상속 + 개별 override 혼합).
- `parseArgv` 테스트도 신규 3 플래그 포함하도록 확장.

### 2.3 `scripts/observability-e2e.mjs` — 3 신규 passthrough 플래그

`--mock-fail-rate-generate/edit/fill` 을 `startMockVendor()` 가 mock 서버 argv 로 전달. `undefined` 면 argv 에 추가하지 않음 → 세션 82/83 호환 (기본 동작 변화 없음).

### 2.4 `infra/observability/smoke-snapshot-fallback-session-84.txt` 신규

`nano-banana=1.0 / sdxl=0 / flux=0` 조합으로 캡처한 fallback 베이스라인 (9 metrics — 세션 83 8종 + 새 샘플 형태). 주요 차이:
- `geny_ai_call_total{status="5xx",vendor="nano-banana"} 20` — status=5xx 라벨 값이 **최초로** 등장 (세션 75/83 에서는 status="success" 만).
- `geny_ai_call_total{status="success",vendor="sdxl"} 20` — sdxl 이 primary 가 아님에도 call counter 에 등장 (fallback destination 근거).
- `geny_ai_fallback_total{from_vendor="nano-banana",reason="5xx",to_vendor="sdxl"} 20` — **fallback counter sample 최초 양수**.
- `geny_ai_call_duration_seconds` 는 vendor 별 2행 (nano-banana + sdxl 각각 20 samples).
- `geny_queue_failed_total` TYPE-only — 폴백으로 구제되어 터미널 실패 0.

### 2.5 `scripts/observability-fallback-validate.mjs` 신규

`observability-snapshot-diff.mjs` 가 **구조적** drift (metric 이름 + label 키) 를 보는 반면, 본 스크립트는 **label 값 + sample 값 레벨** 어서션:

1. `geny_ai_fallback_total{from_vendor=nano-banana,to_vendor=sdxl,reason=5xx} >= N` (기본 20)
2. `geny_ai_call_total{status=5xx,vendor=nano-banana} >= N`
3. `geny_ai_call_total{status=success,vendor=sdxl} >= N`
4. `geny_queue_duration_seconds_count{outcome=succeeded} >= N`
5. `geny_queue_failed_total` **TYPE-only** (sample 있으면 violation — 폴백으로 구제되어야 함)

`readSample(text, metric, wantLabels)` + `hasAnySample(text, metric)` 헬퍼 export — 테스트에서 재사용.

### 2.6 `scripts/observability-fallback-validate.test.mjs` 신규

9 assert 케이스:
- 완전 스냅샷 → violations=0 + report 정상.
- 5 violation 경로 (fallback 누락 / nano 5xx 누락 / sdxl success 누락 / queue_duration 미달 / queue_failed 에 sample 있음).
- `readSample` label exact match 만 허용 (reason 만 틀린 샘플 거부).
- `readSample` 부분 라벨 쿼리 가능 (want 에 없는 키는 무시).
- `hasAnySample` TYPE-only ↔ sample 존재 구분.

### 2.7 `scripts/test-golden.mjs` — step 26 → **27**

신규 `observability fallback validator` (~114ms): (a) 파서 회귀 9 tests (b) 커밋된 `smoke-snapshot-fallback-session-84.txt` 에 대해 실 validator 실행. Redis/Docker 불필요.

### 2.8 `.github/workflows/ci.yml` — `bullmq-integration` lane 에 fallback step 추가

세션 83 `--vendor-mock` step 뒤에 `Observability e2e (--vendor-mock fallback 경로)` step (`id: observability-e2e-fallback`):
```yaml
node scripts/observability-e2e.mjs --reuse-redis --redis-url "$REDIS_URL" \
  --vendor-mock --mock-fail-rate-generate 1 --mock-fail-rate-edit 0 --mock-fail-rate-fill 0 \
  --snapshot /tmp/obs-fallback-fresh.txt \
  --queue-name geny-obs-84 --producer-port 9095 --consumer-port 9096 \
  --log-dir artifacts/observability-e2e-fallback
node scripts/observability-fallback-validate.mjs --file /tmp/obs-fallback-fresh.txt --verbose
```

포트 9095/9096 + queue `geny-obs-84` + log-dir 분리로 세션 83 step 과 순차 실행 충돌 0. artifact upload step 의 `if:`/`path:` 를 세 e2e step 모두 커버하도록 확장.

---

## 3. 검증

### 3.1 로컬 full e2e

```
$ docker run -d --name geny-redis-session-84 -p 6390:6379 redis:7.2-alpine redis-server --maxmemory-policy noeviction
$ pnpm -F @geny/worker-generate build
$ node scripts/observability-e2e.mjs \
    --reuse-redis --redis-url redis://127.0.0.1:6390 \
    --vendor-mock --mock-fail-rate-generate 1 --mock-fail-rate-edit 0 --mock-fail-rate-fill 0 \
    --snapshot infra/observability/smoke-snapshot-fallback-session-84.txt \
    --queue-name geny-obs-84 --producer-port 9095 --consumer-port 9096 \
    --log-dir artifacts/observability-e2e-fallback
[e2e] mock-vendor OK — http://localhost:<ephemeral>
[e2e] perf-harness OK (enqueued=20 completed=20)
[e2e] samples: enqueued=20 ai_calls=20 ai_dur_count=20 q_dur_count=20
[e2e] ✅ observability e2e pass
```

### 3.2 Fallback 스냅샷 validator

```
$ node scripts/observability-fallback-validate.mjs \
    --file infra/observability/smoke-snapshot-fallback-session-84.txt --verbose
[fallback-validate] report={"fallback_nano_to_sdxl_5xx":20,"call_total_nano_5xx":20,"call_total_sdxl_success":20,"queue_duration_succeeded_count":20,"queue_failed_has_sample":false}
[fallback-validate] ✅ fallback path observable
```

### 3.3 Golden 27/27

```
$ node scripts/test-golden.mjs
... (27 step 全部 ✔) ...
[golden] ✔ mock-vendor-server tests (158 ms)  # 세션 82 — 15 tests (+2 per-endpoint)
[golden] ✔ observability Mock↔HTTP snapshot drift (56 ms)  # 세션 83
[golden] ✔ observability fallback validator (114 ms)  # 세션 84
[golden] ✅ all steps pass
```

---

## 4. 주요 결정축

- **D1** — **per-endpoint fail rate vs uniform `--fail-rate 0.5`**: 전역 0.5 는 (a) nano-banana 10/20 성공 + 10/20 실패 (b) 실패분 중 sdxl 50% 성공 (c) 잔여 flux 50% 성공 → 약 12.5% 잡이 **3단 전부 실패 = 터미널 실패** → `observability-smoke.mjs` 의 `queue_duration_count{outcome=succeeded} >= 20` 어서션 위반 + 플레이키. per-endpoint override 는 seed 무관 **결정론** + 모든 잡이 polling-successful. 세션 82 의 `--fail-rate` 경로는 그대로 보존 (하위 호환).
- **D2** — **nano=1.0 / sdxl=0 / flux=0 조합**: 라우터 폴백 체인 첫 hop (nano→sdxl) 만 한 번 트리거. nano→sdxl→flux 2 hop 까지 타려면 `nano=1.0 sdxl=1.0 flux=0` 을 쓸 수 있으나, 이 경우 `geny_ai_fallback_total` 이 2 샘플 방출(from=nano to=sdxl + from=sdxl to=flux) 되어 assertion 이 복잡. 1 hop 만으로도 "fallback 경로 전반이 관측 가능함" 을 증명 충분. 2 hop 회귀는 세션 85+ 후보.
- **D3** — **fallback counter 의 label 값 검증 (observability-snapshot-diff 확장 대신 신규 validator)**: 세션 80 `observability-snapshot-diff.mjs` 를 sample-value-aware 모드로 확장하려면 (a) 새 CLI 플래그 (b) 기존 drift=0 어서션과 sample 값 비교 의 분리 (c) 값 tolerance 정책 — 스코프가 커진다. 작은 전용 validator (`observability-fallback-validate.mjs`) 로 분리: 관심사가 명확하고 재사용도 용이. 세션 80 의 structural drift 는 그대로 drift-only 로 유지.
- **D4** — **validator 5 축 선정**: fallback_total + nano 5xx 는 **fallback 경로 자체** 의 증거. sdxl success + queue_duration succeeded 는 **폴백이 구제되어 잡이 완수** 된 증거. queue_failed TYPE-only 는 **구제 후 터미널 실패 0** 증거. 한 축이라도 빠지면 "fallback 은 났지만 완수되지 않았다" 또는 "완수됐지만 fallback 로그 없다" 같은 실패 모드가 CI 에 숨겨질 수 있음 — 5 축이 **서로를 검증** 하는 구조.
- **D5** — **golden step 27 = 커밋된 파일 검증 / CI step = fresh 캡처**: 세션 83 과 동일한 2층 방어망. 파일 변조는 golden 이, orchestration (mock-vendor / route-with-fallback / metrics hook 배선) 변조는 bullmq-integration lane 이 잡는다.
- **D6** — **포트 9095/9096 + queue `geny-obs-84` + log-dir 분리**: 세션 83 의 9093/9094 / `geny-obs-83` 과 충돌 없이 순차 실행. Redis service container 하나를 세 lane step (기본 e2e + vendor-mock + fallback) 이 공유하되 queue 이름으로 잡 스트림 격리.
- **D7** — **readSample label exact-match + 부분 쿼리**: `want={status:"5xx", vendor:"nano-banana"}` 는 `{model, stage, status, vendor}` 전체 샘플 중 status/vendor 만 일치하는 샘플을 찾는다. 라벨 알파벳 정렬(예: `from_vendor` 가 `reason` 보다 먼저) 은 상관 안 하도록 설계 — Prometheus text exposition 에서 label 순서가 레지스트리 내부 정렬에 따라 달라질 수 있음. `matchesLabels` 는 exact match 검사지만 extra-label 존재는 허용.
- **D8** — **`geny_queue_failed_total` TYPE-only 어서션**: 폴백으로 구제된 잡이 어떤 이유로 실패 카운터에 잡히면(예: 재시도 exhaustion 버그 또는 status 잘못 분류) fallback e2e 가 거짓 성공할 수 있음. 이 assertion 으로 "fallback 도착지가 진짜로 성공했음" 을 보강.

---

## 5. 남긴 숙제

- **2 hop fallback e2e (세션 85+ 후보)**: `nano=1.0 sdxl=1.0 flux=0` 으로 전체 체인 트리거 → `geny_ai_fallback_total` 2 label-set (nano→sdxl + sdxl→flux) 검증. validator 를 expect-hops=2 모드로 확장하거나 별도 스크립트.
- **터미널 실패 e2e (세션 86+ 후보)**: `nano=1.0 sdxl=1.0 flux=1.0` → 모든 잡 실패 → `geny_queue_failed_total{reason=vendor_error_5xx} >= 20` 검증. 현재 validator 는 반대 방향 (실패 없음) 을 보장하므로 별도 validator 필요.
- **latency 분포 실측**: `--mock-latency-mean-ms 30 --mock-latency-jitter-ms 10` → `geny_ai_call_duration_seconds` histogram bucket 분포가 0 근처 → 10~50ms 로 이동. snapshot-diff sample-value-aware 모드 도입 시점에 활용 (세션 80 잔여 TODO).
- **실 staging 배포 (세션 85 후보)**: cluster access 확보 시점.
- **web-editor Stage 3 (세션 86 후보)**: WebGL 렌더러 + Inspector 편집 모드.

---

## 6. 결과

- `scripts/mock-vendor-server.mjs`: per-endpoint `--fail-rate-generate/edit/fill` 추가 (pickRate helper, kindFailRate table). 전역 `--fail-rate` 는 기본값으로 하위 호환.
- `scripts/mock-vendor-server.test.mjs`: 13 → **15 tests** (+per-endpoint + 전역 상속 경로).
- `scripts/observability-e2e.mjs`: 3 신규 passthrough 플래그 (`--mock-fail-rate-generate/edit/fill`), startMockVendor 가 undefined 가 아닐 때만 argv 추가.
- `infra/observability/smoke-snapshot-fallback-session-84.txt` 신규: nano=1.0/sdxl=0 결정론적 fallback 베이스라인 (`geny_ai_fallback_total{from=nano,to=sdxl,reason=5xx} 20`, `call_total{status=5xx,vendor=nano} 20`, `call_total{status=success,vendor=sdxl} 20`).
- `scripts/observability-fallback-validate.mjs` 신규: 5 축 validator + `readSample`/`hasAnySample` export.
- `scripts/observability-fallback-validate.test.mjs` 신규: 9 tests (violation 경로 5 + 파서 회귀 4).
- `scripts/test-golden.mjs` 26 → **27 step** (`observability fallback validator`, ~114ms).
- `.github/workflows/ci.yml`: `Observability e2e (--vendor-mock fallback 경로)` step 추가 (id=`observability-e2e-fallback`, 포트 9095/9096 + queue `geny-obs-84` + log-dir 분리) + artifact upload 조건/경로 3-way 확장.
- **Foundation "fallback 경로가 관측 상 없었던 일이 되지 않는다" 불변식** CI 2층 (golden step 27 + bullmq-integration lane) 고정. 세션 83 Mock↔HTTP drift=0 과 나란히 "관측 계약 보존" + "fallback 경로 증명" 두 축이 Foundation 마감 전 CI 에 자리잡음.
