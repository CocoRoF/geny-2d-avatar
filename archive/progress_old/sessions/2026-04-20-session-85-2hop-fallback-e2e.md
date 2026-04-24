# 세션 85 — 2-hop fallback e2e + `observability-fallback-validate --expect-hops 2` CI 고정

**일자**: 2026-04-20
**워크스트림**: Platform / AI Generation / Observability
**선행 세션**: 세션 30 (`routeWithFallback`), 세션 33 (MetricsHook — `onFallback` label=`from_vendor,to_vendor,reason`), 세션 73 (perf-harness `--target-url`), 세션 82 (mock-vendor-server), 세션 84 (per-endpoint fail-rate + 1-hop fallback e2e + `observability-fallback-validate` 5 축)

---

## 1. 문제

세션 84 로 1-hop fallback (nano→sdxl, 5xx) 를 CI 고정했지만 **2-hop 은 여전히 증명 불능**:

- `geny_ai_fallback_total` 은 `{from_vendor,to_vendor,reason}` 3 라벨. 1-hop 스냅샷(세션 84) 에는 label-set `(nano,sdxl,5xx)` 한 줄만 존재.
- `routeWithFallback` 의 hop 수에 따라 **서로 다른 label-set 이 독립 샘플**로 방출돼야 한다는 계약은 unit test (`route-with-fallback.test.ts`) 만 보증.
- 파이프라인 전체(producer → Redis → consumer → `/metrics` 스크레이프) 에서 "hop2 fallback 이 hop1 과 분리된 label 조합으로 관찰 가능"은 회귀 불능.
- 또한 세션 84 는 destination 이 sdxl 인 **단일 도착지** 시나리오. "도착지 flux-fill" (가장 낮은 routing_weight) 까지 내려가는 체인이 실제로 동작하는지도 검증 불능.

본 세션은 `nano=1.0 / sdxl=1.0 / flux=0` + `capability_required=[]` + `reference_image_sha256/mask_sha256` 조합으로 **결정론적 2-hop** 체인을 구성해 fallback 계약을 7 축으로 CI 에 고정한다.

> "세션 84 'fallback 경로가 보인다' → 세션 85 'fallback **체인** 전체가 보인다' — hop 수에 관계없이 각 단계가 관측 상 분리돼 기록된다."

---

## 2. 변경

### 2.1 `scripts/perf-harness.mjs` — `buildTask()` + 2 신규 플래그

기존 `buildTask(i)` 는 `capability_required: ["edit"]` 하드코딩이었다. 이 제한은 `registry.route()` 에서 다음을 의미:
- nano-banana (caps: `[edit, style_ref, mask]`) ✓
- sdxl (caps: `[edit, style_ref]`) ✓
- flux-fill (caps: `[mask]`) ✗ — `"edit"` 미지원 → 라우트 리스트에서 제외.

즉 **1-hop max**. 3 체인 전체를 eligible 로 만들려면 `capability_required: []` 필요 (빈 집합 ⊆ 모든 집합 → 3 어댑터 전부 통과). 추가로 flux-fill 의 `generate()` 는 `reference_image_sha256` + `mask_sha256` 을 요구 (없으면 `CAPABILITY_MISMATCH` throw → `shouldFallback(err)=false` → 체인 조기 종료 + terminal failure).

신규 CLI:
- `--capability-required <comma-list>` — 기본 `"edit"`. 빈 문자열 `""` → 빈 배열 → 3 어댑터 전부 eligible.
- `--with-mask` — flux-fill 검증 통과용 deterministic 64-hex 주입 (`sha256("ref|"+idem)`, `sha256("mask|"+idem)`). mock-vendor 는 값 자체를 검증하지 않으므로 형식만 유효하면 충분.

`buildTask` 는 이제 `(i, cfg=CONFIG)` 2 인자. cfg 는 perf-harness CONFIG 또는 test 에서 직접 주입. 빈 `"edit, style_ref"` 같은 공백·콤마 리스트도 trim + filter 로 안전 처리.

export 추가: `buildTask` 를 test 에서 직접 쓸 수 있도록 export.

### 2.2 `scripts/perf-harness.test.mjs` — +1 buildTask 회귀 (7 → **8**)

신규 check:
- `capability_required: "edit"` → `["edit"]`.
- 빈 문자열 → `[]` (all 3 adapters eligible).
- `"edit, style_ref"` → `["edit", "style_ref"]` (trim + 콤마 분리).
- `--with-mask` → 64-hex SHA 주입 + 같은 `i` 는 결정론적으로 같은 값 (idempotency_key 기반).

### 2.3 `scripts/observability-e2e.mjs` — 2 신규 passthrough 플래그 + parseArgv 버그 수정

신규 플래그 (perf-harness 로 전달):
- `--harness-capability-required "<list>"` — `--capability-required` 로 변환.
- `--harness-with-mask` — `--with-mask` 부울 플래그.

**parseArgv 버그 수정**: 기존 `if (!next || next.startsWith("--"))` 는 `next === ""` 를 falsy 로 취급해 **value 를 잃고 boolean `true` 로 덮어씀**. 세션 85 에서 `--harness-capability-required ""` 로 "capability=[]" 를 명시하려 했는데 ARGS 에서는 `true` 로 바뀌어 `String(true)=="true"` 가 perf-harness 로 전달 → 실제로는 `capability_required=["true"]` 로 빌드 → registry.route 에서 `"true"` 는 Capability 가 아니므로 어느 어댑터도 match 하지 않음 → `NO_ELIGIBLE_ADAPTER` → 20 잡 전부 terminal failure. 진단 시간 낭비 큰 제보.

수정: `!next` → `next === undefined`. 빈 문자열 value 보존. 기존 호출부 (boolean-only 플래그 `--reuse-redis`, `--vendor-mock` 등) 는 next 가 `--` 로 시작하거나 undefined 인 경우를 여전히 boolean 으로 처리하므로 영향 없음.

### 2.4 `scripts/observability-fallback-validate.mjs` — `--expect-hops` 모드 확장

같은 validator 가 1-hop / 2-hop 을 `--expect-hops {1|2}` 로 분기. 공통 5 축 + 2-hop 추가 2 축 = **7 축**:

| 축 | 1-hop | 2-hop |
| --- | --- | --- |
| 1. `fallback_total{nano→sdxl,5xx} ≥ N` | ✓ | ✓ |
| 2. `call_total{5xx,nano-banana} ≥ N` | ✓ | ✓ |
| 3. `call_total{success,<dest>} ≥ N` | dest=sdxl | dest=flux-fill |
| 4. `queue_duration_count{succeeded} ≥ N` | ✓ | ✓ |
| 5. `queue_failed_total` TYPE-only | ✓ | ✓ |
| 6. `fallback_total{sdxl→flux-fill,5xx} ≥ N` | — | ✓ |
| 7. `call_total{5xx,sdxl} ≥ N` | — | ✓ |

시그니처 변경: `validateFallbackSnapshot(text, expectJobs, hops=1)` — 3 번째 인자 기본값 1 로 후방호환.

report 구조: 1-hop 용 `call_total_sdxl_success` alias 유지 + 새 공통 필드 `call_total_dest_success` + `dest_vendor`. 2-hop 전용 `fallback_sdxl_to_flux_5xx`, `call_total_sdxl_5xx` 추가.

### 2.5 `scripts/observability-fallback-validate.test.mjs` — +5 tests (9 → **14**)

신규 2-hop 회귀:
- `2-hop full snapshot → 0 violations` — FULL_2HOP fixture (7 축 충족) 로 clean run 검증.
- `hop2 fallback_total 누락 → violation`.
- `sdxl 5xx call_total 누락 → violation`.
- `flux-fill success 누락 (dest=flux-fill) → violation`.
- `1-hop baseline(FULL)을 2-hop 모드로 돌리면 3 위반` — **모드 분리가 실제로 독립 axis 를 강제**함을 cross-check (FULL 에 hop2 샘플 없으므로 hop2 axis 전부 miss).

### 2.6 `infra/observability/smoke-snapshot-fallback-session-85-2hop.txt` 신규 베이스라인

`nano=1.0 / sdxl=1.0 / flux=0` + `capability_required=[]` + `--with-mask` 조합으로 캡처. 세션 84 스냅샷 대비 주요 차이:

- `geny_ai_call_total{status="5xx",vendor="nano-banana"} 20` — 세션 84 와 동일.
- `geny_ai_call_total{status="5xx",vendor="sdxl"} 20` — **신규 라벨 조합**. 세션 84 에서는 sdxl=success 만.
- `geny_ai_call_total{status="success",vendor="flux-fill"} 20` — **도착지가 flux-fill 로 이동**.
- `geny_ai_fallback_total` **2 label-set**:
  - `{from_vendor="nano-banana",reason="5xx",to_vendor="sdxl"} 20`
  - `{from_vendor="sdxl",reason="5xx",to_vendor="flux-fill"} 20`
- `geny_ai_call_cost_usd{vendor="flux-fill"}` 만 집계 (nano/sdxl 은 실패라 cost 없음) — success-only 계약 검증 부산물.
- `geny_queue_duration_seconds_count{outcome="succeeded"} 20` — 2-hop 후 성공도 succeeded 로 분류 (terminal 계약).
- `geny_queue_failed_total` TYPE-only — 폴백 끝에서 flux-fill 이 구제 → terminal failure 0.

### 2.7 `scripts/test-golden.mjs` — step 27 확장

기존 step 27 (`observability-fallback-validate` + session-84 베이스라인) 에 **2 번째 validator 실행** 추가:
```
node scripts/observability-fallback-validate.mjs \
  --file infra/observability/smoke-snapshot-fallback-session-85-2hop.txt \
  --expect-hops 2
```

파서 회귀 14 tests 도 본 step 에서 실행 (1-hop 9 + 2-hop 5).

### 2.8 `.github/workflows/ci.yml` — `bullmq-integration` lane 에 2-hop 스텝 추가

세션 84 의 `Observability e2e (--vendor-mock fallback 경로)` 아래에 **`Observability e2e (--vendor-mock 2-hop fallback)`** 스텝 추가:
- ports: producer=9097, consumer=9098, queue=`geny-obs-85`, log-dir=`artifacts/observability-e2e-2hop` — 기존 스텝들과 충돌 없음.
- fresh snapshot 캡처 → `--expect-hops 2 --verbose` 로 검증.
- 실패 시 artifact 업로드 대상에 `observability-e2e-2hop/` 추가.

golden step 27 은 **커밋된 파일 검증** (orchestration drift 가 베이스라인을 오염시키지 못함), bullmq-integration lane 은 **fresh 캡처 검증** (라우팅/exporter/scraping 파이프라인 변조 탐지). 세션 84 와 동일한 2 층 방어.

---

## 3. 검증

### 3.1 Unit

```
node scripts/observability-fallback-validate.test.mjs    # 14/14 pass (+5 2-hop)
node scripts/perf-harness.test.mjs                       # 8/8 pass (+1 buildTask)
```

### 3.2 E2E (로컬 Docker Redis at :6391)

```
node scripts/observability-e2e.mjs --reuse-redis --redis-url redis://127.0.0.1:6391 \
  --vendor-mock --mock-fail-rate-generate 1 --mock-fail-rate-edit 1 --mock-fail-rate-fill 0 \
  --harness-capability-required "" --harness-with-mask \
  --snapshot /tmp/obs-2hop-fresh.txt \
  --queue-name geny-obs-85 --producer-port 9097 --consumer-port 9098 \
  --log-dir artifacts/observability-e2e-2hop
```

결과: `[e2e] ✅ observability e2e pass` — 20 enqueued / 20 ai_calls (success, flux-fill) / 20 queue_duration{succeeded}.

Validator:
```
[fallback-validate] ✅ fallback path observable (hops=2) — {
  "hops": 2,
  "fallback_nano_to_sdxl_5xx": 20,
  "fallback_sdxl_to_flux_5xx": 20,
  "call_total_nano_5xx": 20,
  "call_total_sdxl_5xx": 20,
  "call_total_dest_success": 20,
  "dest_vendor": "flux-fill",
  "queue_duration_succeeded_count": 20,
  "queue_failed_has_sample": false
}
```

### 3.3 Golden 회귀

`pnpm run test:golden` — 27/27 단계 전부 pass. step 27 내부에 1-hop + 2-hop validator 모두 green.

---

## 4. 주요 결정축

### D1. 왜 `capability_required=[]` 로 3 어댑터를 eligible 로 만드는가 — 다른 대안?

대안 A (거부): nano/sdxl/flux-fill 의 `capability` 선언을 확장 (예: flux-fill 에 `edit` 추가). 프로덕션 catalog 의 **capability 정의** 를 테스트 목적으로 흔드는 건 Foundation 계약 변조 — 채택 불가.

대안 B (거부): 새로운 task capability `mask` 만으로 flux-fill 단독 eligible → 2-hop 불가 (nano 도 mask 지원).

**채택**: 빈 capability 리스트. 라우터 계약상 `∅ ⊆ S` 이므로 모든 adapter 가 match → routing_weight desc 정렬 [nano, sdxl, flux-fill] → 3-hop 라우트 자연스럽게 형성. **catalog/라우터 계약을 건드리지 않고** task 쪽만으로 체인을 구성.

### D2. 왜 `flux=0` 으로 flux-fill 에서 성공하게 하는가 — "전부 실패" 대안?

대안 (미채택, 세션 86+ 로 스케줄): `flux=1.0` → 20 잡 전부 terminal failure. `queue_failed_total{reason=vendor_error_5xx} ≥ 20` + `queue_duration_count{failed} ≥ 20` 축으로 validate. 의미는 있지만 별도 시나리오 — 본 세션은 "2-hop 체인이 성공으로 수렴" 을 focus.

이유: "2-hop 이 관측 가능" + "2-hop 이 실제로 구제한다" 두 계약을 하나에 묶으면 검증 범위 모호. 세션 85 는 전자만, 후자 (terminal failure) 는 세션 86 후보.

### D3. 왜 perf-harness 에 `--with-mask` 를 추가했는가 — task-level mock 대안?

대안 A (거부): flux-fill adapter 를 "mask 없이도 OK" 로 변경. Foundation 계약 변조.

대안 B (거부): mock-vendor 가 mask 없이도 받도록 (이미 그러함). 문제는 **adapter-level validation** — `FluxFillAdapter.generate()` 가 `CAPABILITY_MISMATCH` 로 조기 종료. mock-vendor 가 이걸 알 리 없음 (서버 쪽).

**채택**: perf-harness 에서 task 에 deterministic SHA 주입. Foundation 계약(adapter validation) 을 존중하면서 테스트 경로만 통과. SHA 값은 idempotency_key 기반이라 cache key 일치가 필요한 재시도 시나리오에서도 안정.

### D4. 왜 단일 validator 로 1-hop / 2-hop 분기 — 별도 스크립트 대안?

대안 (거부): `observability-fallback-validate-2hop.mjs` 를 새로 만든다. 중복 코드 + 지식 파편화 (readSample/matchesLabels/hasAnySample 동일).

**채택**: 동일 validator + `--expect-hops` 플래그. 공통 5 축은 공유, 2-hop 전용 2 축은 if-branch. report 구조도 통합 (`hops` 필드 + 공통 `call_total_dest_success`+`dest_vendor` + mode 전용 필드들). 독자 입장에서 "fallback 관측 계약" 이 한 파일에 있다는 게 이해 비용 낮음.

### D5. 왜 parseArgv 버그 수정인가 — 우회 대안?

`!next` → `next === undefined` 변경은 observability-e2e 로컬 parseArgv 만 영향. 하지만 "빈 문자열 인자 값을 보존" 은 명확히 옳은 의도 — 그리고 발견된 버그(세션 85 시나리오가 silent fail 로 수렴) 는 **같은 함정에 또 걸릴 사람이 생긴다**.

대안 (거부): `--harness-capability-required` 를 `""` 가 아닌 `none` 같은 sentinel 로 받기. 인터페이스 오염 + 매직 값.

**채택**: parseArgv 수정 + 커멘트 (세션 85 발견 히스토리) 로 미래의 silent-fail 재발 방지.

### D6. 왜 ports 9097/9098 + queue geny-obs-85?

세션 83 (9093/9094, geny-obs-83, vendor-mock base), 세션 84 (9095/9096, geny-obs-84, 1-hop fallback) 와 완전 분리. bullmq-integration lane 은 세 스텝이 **순차**로 실행되지만 queue/port 충돌 방지는 hygienic. 로컬 `--reuse-redis` 시에도 DB flush 없이 나란히 스냅샷 캡처 가능.

### D7. 왜 cost_usd 가 flux-fill 만 집계되는가 — 버그?

`metrics.onCall` 의 `costUsd` 파라미터는 **success only** 전달 (`route-with-fallback.ts:192` `costUsd: result.cost_usd`). 실패 경로 (`catch` 블록, line 220-226) 에서는 `costUsd` 인자 생략. `InMemoryMetricsRegistry.onCall` 은 costUsd undefined 면 `geny_ai_call_cost_usd` sample 방출 안 함.

2-hop 에서 nano/sdxl 둘 다 실패 → cost sample 없음. flux-fill 만 success → cost sample 존재. **의도된 계약** — "실패 호출은 과금 없음". 스냅샷에 `cost{vendor="flux-fill"}` 만 있는 이유.

### D8. 왜 `call_total_sdxl_success` alias 를 유지하는가

세션 84 테스트가 `report.call_total_sdxl_success` 를 직접 참조. 1-hop 의 dest 는 sdxl 이라 이 값이 곧 `call_total_dest_success`. backward-compat 을 위해 alias 유지 (새 필드 `call_total_dest_success` 병행). 테스트 drift 최소화.

---

## 5. 남긴 숙제

- **세션 86 후보**: 터미널 실패 e2e — `nano=sdxl=flux=1.0` → 20 잡 전부 실패 → `queue_failed_total{reason=vendor_error_5xx} ≥ 20` + `queue_duration_count{failed} ≥ 20` + 모든 call_total 이 5xx status 로만 기록. validator 에 `--expect-terminal-failure` 모드 추가.
- **세션 87 후보**: 실 staging 배포 + Prometheus 스크레이퍼. 세션 80 prep + 세션 83/84/85 3 종 베이스라인 승격.
- **세션 88+ 후보**: UNSAFE_CONTENT fallback (safety filter trigger) 경로 — `reason="unsafe"` fallback label 이 따로 기록되는지. `shouldFallback(UNSAFE_CONTENT)=true` 분기가 e2e 로 관측되는지.

---

## 6. 결과

- `pnpm run test:golden` → 27/27 pass (step 27 내부 1-hop + 2-hop validator 둘 다 green).
- 로컬 e2e (Redis container at :6391) `[e2e] ✅ observability e2e pass` — 7 축 전부 20 sample.
- Foundation 관측 계약 2-way 증명 축 **완전 커버**:
  - (세션 83) Mock ↔ HTTP 구조적 drift=0.
  - (세션 84) 1-hop fallback 경로 가시성.
  - (세션 85) 2-hop fallback 체인 가시성.
- 파이프라인 변경이 fallback hop 수에 영향을 주면 bullmq-integration lane 이 **즉시** 실패. 베이스라인은 golden step 27 이 파일 레벨로, fresh 캡처는 CI lane 이 e2e 로 — 2 층 방어.

**landing**: 커밋 + 푸시 (다음 단계). CI 4 스텝 (observability-e2e base / vendor-mock / fallback / 2hop) + golden lane 모두 green 기대.
