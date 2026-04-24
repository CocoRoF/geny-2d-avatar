# 세션 86 — 터미널 실패 e2e + `observability-fallback-validate --expect-terminal-failure` CI 고정

**일자**: 2026-04-20
**워크스트림**: Platform / AI Generation / Observability
**선행 세션**: 세션 65 (`processWithMetrics` + `defaultClassifyQueueError` + `queue_failed_total{reason}` + `queue_duration_seconds{outcome=succeeded|failed}`), 세션 84 (per-endpoint fail-rate + 1-hop fallback e2e), 세션 85 (`--expect-hops {1|2}` 2-hop validator + `--harness-capability-required ""` + `--with-mask`)

---

## 1. 문제

세션 85 로 `nano→sdxl→flux-fill` **체인 전체의 관측 가시성** 은 증명했지만 남은 한 축이 있다: **체인 소진 후의 터미널 실패 경로**.

- `routeWithFallback` 이 3 후보 전부 5xx 로 소진하면 마지막 `AdapterError`(code=`VENDOR_ERROR_5XX`) 를 rethrow. consumer `processWithMetrics` 가 `defaultClassifyQueueError` 로 `reason=ai_5xx` 분류 → `queue_failed_total{reason=ai_5xx}` 증가 + `queue_duration_seconds{outcome=failed}` 관측.
- 단위 테스트(`processor-metrics.test.ts`, `route-with-fallback.test.ts`) 는 개별 경계 케이스만 검증.
- 전체 파이프라인(producer → Redis → consumer → `/metrics`) 에서 "3 후보 전부 실패 시 **실패 분포가 카탈로그 §2.1 + §3 에 정확히 기록**" 은 회귀 불능.
- 실패 시 관측 계약이 오염되면 (예: `reason` 라벨이 `other` 로 분류되거나, duration 이 `outcome=succeeded` 로 잘못 라벨링) 온콜 대시보드가 무용지물. **CI 고정 필요**.

본 세션은 `nano=sdxl=flux=1.0` 조합으로 결정론적 3-hop 터미널 실패를 구성해 fallback **소진 경로** 의 9 축을 CI 에 고정한다.

> "세션 85 'fallback 체인이 보인다' → 세션 86 'fallback **소진 후 실패 분포** 가 보인다' — 폴백이 실패할 때도 관측 계약은 정확하다."

---

## 2. 변경

### 2.1 `scripts/perf-harness.mjs` — `--ignore-errors` SLO bypass

기존 perf-harness 는 `SLO.error_rate_ratio_max = 0.01` (1%) 로 하드코딩. 터미널 실패 e2e 는 **100% 실패** 가 정상 — 하네스가 SLO 위반으로 exit 1 하면 관측 단계(`observability-smoke`, `observability-fallback-validate`) 에 도달 못 함.

신규 CLI:
- `--ignore-errors` — 부울 플래그. 파싱 후 `SLO.error_rate_ratio_max = 1.0` 로 오버라이드. 실패 분포 검증은 후속 관측 경로가 담당, SLO 는 관심 밖.

분리 원리: 새 smoke 모드 만들기 대신 기존 플래그 확장. 하네스는 "잡 수용/완료 대기" 역할만, **관측 검증은 observability-fallback-validate `--expect-terminal-failure`** 가 전담.

### 2.2 `scripts/observability-smoke.mjs` — `--expect-terminal-failure` 플래그

기존 smoke 는 `geny_queue_duration_seconds_count{outcome="succeeded"}` 를 하드코딩. 터미널 모드는 succeeded sample 이 0 이고 failed sample 만 존재 → 기존 assertion 이 `null < expected` 로 실패.

신규 CLI:
- `--expect-terminal-failure` — 부울 플래그. `queueDurationOutcome = EXPECT_TERMINAL_FAILURE ? "failed" : "succeeded"` 로 label value 분기. 다른 어서션(enqueued, ai_call success 샘플) 은 호출자(`observability-e2e.mjs`) 가 터미널 모드에서 비활성화.

원리: 기존 8 메트릭 union 검증(catalog §2.1 + §3 존재) 은 터미널 모드에서도 유효. outcome label value 만 1 비트 스위치.

### 2.3 `scripts/observability-e2e.mjs` — terminal 모드 orchestration

신규 passthrough:
- `--harness-ignore-errors` → perf-harness `--ignore-errors`.
- `--expect-terminal-failure` → observability-smoke `--expect-terminal-failure`. 추가로 smoke 의 `--expect-ai-calls` (success 샘플 기대값) 호출을 **터미널 모드에서 생략** — 모든 호출이 5xx 이므로 success 샘플 0 이 정답.

이 두 플래그가 합쳐져야 터미널 e2e 가 돈다: harness 는 SLO 무력화, smoke 는 failed label 에서 duration 측정.

### 2.4 `scripts/observability-fallback-validate.mjs` — `--expect-terminal-failure` 모드

기존 `--expect-hops {1|2}` 와 **배타적** 인 제 3 모드. CLI 충돌 가드: 두 플래그 동시 지정 시 throw.

신규 export `listSamples(text, metric, wantLabels)` — `readSample` 과 달리 **모든 matching sample 열거**. "success 샘플이 하나도 없음" 같은 부정 어서션에 필요.

신규 `validateTerminalFailureSnapshot(text, expectJobs)` — **9 터미널 축**:

| T# | 축 | 값 |
| --- | --- | --- |
| T1 | `fallback_total{nano→sdxl,5xx}` | ≥ N |
| T2 | `fallback_total{sdxl→flux-fill,5xx}` | ≥ N |
| T3 | `call_total{5xx,nano-banana}` | ≥ N |
| T4 | `call_total{5xx,sdxl}` | ≥ N |
| T5 | `call_total{5xx,flux-fill}` | ≥ N |
| T6 | `call_total{success,*}` | 0 (any vendor) |
| T7 | `queue_duration_count{outcome=failed}` | ≥ N |
| T8 | `queue_duration_count{outcome=succeeded}` | absent or 0 |
| T9 | `queue_failed_total{reason=ai_5xx}` | ≥ N |

T1-T5 는 세션 85 2-hop 과 공유 개념(벤더 실패 + 2-hop fallback). 세션 86 고유 축은 T6 (success 전면 부재), T7/T8 (duration outcome 반전), T9 (queue_failed counter sample).

report 의 `mode` 필드 추가(`"hops-1" | "hops-2" | "terminal-failure"`) — 세 경로 구분.

### 2.5 `scripts/observability-fallback-validate.test.mjs` — +9 tests (14 → **23**)

신규 FULL_TERMINAL fixture + 9 회귀:
- `terminal full snapshot → 0 violations` — clean run.
- `terminal: flux-fill 5xx 누락 → violation` (nano/sdxl 있음, flux 만 빠짐 → T5 detect).
- `terminal: queue_failed_total{ai_5xx} 누락 → violation` (T9).
- `terminal: success 샘플 있으면 violation` — listSamples 로 다중 벤더 success 열거 (T6).
- `terminal: queue_duration_count{failed} 미달 → violation` (T7).
- `terminal: queue_duration_count{succeeded}>0 → violation` — 반전 assertion (T8).
- `terminal: hop1 fallback 누락 → violation` (T1).
- `listSamples: partial label 로 multi-vendor success 샘플 열거` — 새 helper 단위 검증.
- `terminal: 2-hop baseline 을 terminal 모드로 돌리면 flux-fill 5xx / failed / ai_5xx 전부 violation` — **모드 분리 cross-check**. 2-hop 스냅샷(flux-fill success + outcome=succeeded) 을 터미널 모드로 돌리면 다수 축 위반 → 모드 간 assertion 이 **실제로 독립**임을 검증.

### 2.6 `infra/observability/smoke-snapshot-terminal-session-86.txt` 신규 베이스라인 (92 lines)

실 `nano=1.0 / sdxl=1.0 / flux=1.0` + `capability_required=[]` + `--with-mask` + `--harness-ignore-errors` + `--expect-terminal-failure` 로 dedicated Redis(port 6392) 에서 캡처. 핵심 샘플:

- `geny_ai_call_total{status="5xx",vendor="nano-banana"} 20`
- `geny_ai_call_total{status="5xx",vendor="sdxl"} 20`
- `geny_ai_call_total{status="5xx",vendor="flux-fill"} 20` — **세션 85 대비 신규 label set**.
- `geny_ai_fallback_total{nano-banana→sdxl,5xx} 20` + `{sdxl→flux-fill,5xx} 20` — 세션 85 와 동일.
- `geny_ai_call_total{status="success",...}` — **전면 부재** (T6 핵심).
- `geny_queue_duration_seconds_count{outcome="failed",queue_name="geny-obs-86"} 20` — **outcome 반전**.
- `geny_queue_duration_seconds_count{outcome="succeeded",...}` — 부재.
- `geny_queue_failed_total{queue_name="geny-obs-86",reason="ai_5xx"} 20` — counter sample (세션 84/85 에서는 TYPE-only).
- `geny_ai_call_cost_usd{...}` — 부재 (success-only 계약, 세션 85 D7 재확인).

### 2.7 `scripts/test-golden.mjs` — step 27 3-way 확장

기존 step 27 (1-hop + 2-hop 두 validator) 에 **3번째 validator 실행** 추가:
```
node scripts/observability-fallback-validate.mjs \
  --file infra/observability/smoke-snapshot-terminal-session-86.txt \
  --expect-terminal-failure
```
파서 회귀도 23 tests (1-hop 9 + 2-hop 5 + terminal 9) 전부 본 step 에서 실행.

### 2.8 `.github/workflows/ci.yml` — `bullmq-integration` lane 5번째 e2e step

세션 85 의 `Observability e2e (--vendor-mock 2-hop fallback)` 뒤에 **`Observability e2e (--vendor-mock terminal failure)`** 스텝 추가:
- id=`observability-e2e-terminal`, ports producer=9099/consumer=9100, queue=`geny-obs-86`, log-dir=`artifacts/observability-e2e-terminal/`.
- `--harness-ignore-errors --expect-terminal-failure` 조합 + `--mock-fail-rate-generate 1 --edit 1 --fill 1`.
- fresh snapshot 캡처 → `--expect-terminal-failure --verbose` 검증.
- artifact upload 조건/경로를 4-way → **5-way** 확장.

실행 순서는 session 번호 오름차순으로 정렬 (83 vendor-mock → 84 fallback → 85 2hop → 86 terminal). 기존 step 과 포트/큐/로그 디렉토리 모두 분리.

---

## 3. 검증

### 3.1 Unit

```
node scripts/observability-fallback-validate.test.mjs   # 23/23 pass (+9 terminal)
```

### 3.2 E2E (로컬 Docker Redis at :6392)

```
node scripts/observability-e2e.mjs --reuse-redis --redis-url redis://127.0.0.1:6392 \
  --vendor-mock --mock-fail-rate-generate 1 --mock-fail-rate-edit 1 --mock-fail-rate-fill 1 \
  --harness-capability-required "" --harness-with-mask \
  --harness-ignore-errors --expect-terminal-failure \
  --snapshot /tmp/obs-terminal-fresh.txt \
  --queue-name geny-obs-86 --producer-port 9099 --consumer-port 9100 \
  --log-dir artifacts/observability-e2e-terminal
```

결과: `[e2e] ✅ observability e2e pass` — 20 enqueued / 0 success / 20 queue_duration{failed} / 20 queue_failed{ai_5xx}.

Validator:
```
[fallback-validate] ✅ fallback path observable (terminal-failure) — {
  "mode": "terminal-failure",
  "fallback_nano_to_sdxl_5xx": 20,
  "fallback_sdxl_to_flux_5xx": 20,
  "call_total_nano_banana_5xx": 20,
  "call_total_sdxl_5xx": 20,
  "call_total_flux_fill_5xx": 20,
  "call_total_success_sample_count": 0,
  "queue_duration_failed_count": 20,
  "queue_duration_succeeded_count": null,
  "queue_failed_total_ai_5xx": 20
}
```

### 3.3 Golden 회귀

`node scripts/test-golden.mjs` — **27/27 단계 전부 pass**. step 27 내부에 1-hop + 2-hop + terminal validator 3 종 모두 green.

---

## 4. 주요 결정축

### D1. 왜 `--ignore-errors` 를 perf-harness 에 추가 — 새 smoke 모드 대안?

대안 (거부): `scripts/perf-harness-terminal.mjs` 같은 새 CLI 추가. 하네스는 잡 수용/완료 대기 외에 로직이 없고, 새 스크립트는 SLO 하나만 바꾸는 중복.

**채택**: `--ignore-errors` 로 SLO.error_rate_ratio_max 을 1.0 으로 오버라이드. 최소 surface, 하네스 책임 단일 유지. 관측 검증은 후속 단계(`observability-fallback-validate`) 전담.

### D2. 왜 `--expect-terminal-failure` 를 observability-fallback-validate 에 통합 — `--expect-hops 3` 대안?

대안 (거부): hops=3 을 "모두 실패" 로 의미 확장. `hops===3` 이면 success 축 → failure 축으로 assertion 반전. 이름이 모호 (3 은 "3 단계 폴백 후 성공" 일 수도 있음) + 기존 `--expect-hops` 의미(도착지 성공) 와 일관성 손상.

**채택**: `--expect-terminal-failure` 를 배타 플래그로 분리. `mode` 필드 3 값(`hops-1 | hops-2 | terminal-failure`) 로 모드 명시. CLI dispatch 에서 mutual-exclusion 가드(둘 다 지정 시 throw). 독자 입장에서 "어떤 경로를 검증하는가" 가 플래그 이름으로 즉시 전달.

### D3. 왜 observability-smoke 에 outcome label 분기 한 줄만 추가 — 별도 smoke 스크립트 대안?

대안 (거부): `observability-smoke-terminal.mjs`. 8 메트릭 union 검증은 동일, outcome label value 하나 차이로 script 복제는 DRY 위반.

**채택**: `EXPECT_TERMINAL_FAILURE` 플래그 + `queueDurationOutcome = ... ? "failed" : "succeeded"`. 1 비트 스위치. 기존 success 샘플 기대(`--expect-ai-calls`) 는 호출자가 터미널 모드에서 생략하는 쪽으로 분리 (observability-e2e.mjs).

### D4. 왜 `listSamples` 를 신규 export — 기존 `readSample` 확장 대안?

대안 (거부): `readSample` 이 optional multi-match 로 동작하도록 옵션 추가. 시그니처 오염, 단일 사용 케이스만을 위한 복잡도 증가.

**채택**: `listSamples` 는 **독립 helper**. 부정 어서션 (T6: "success 샘플 총 0") 에 필요한 "모든 매치 열거" 만 수행. partial label filter (세션 85 의 `matchesLabels`) 재사용.

### D5. 왜 `defaultClassifyQueueError` 가 `ai_5xx` 로 분류하는가 — 재확인

`defaultClassifyQueueError(err)` (processor-metrics.ts) 은 err.code 나 err.message 에 `"5XX"` 또는 `"VENDOR_ERROR"` substring 이 있으면 `ai_5xx` 리턴. `routeWithFallback` 의 terminal throw 는 `AdapterError(code="VENDOR_ERROR_5XX")` → substring "VENDOR_ERROR" + "5XX" 모두 매치 → `ai_5xx`.

**의도**: 카탈로그 §2.1 vocabulary 7 종(`ai_5xx`, `ai_4xx`, `timeout`, `unsafe`, `invalid_input`, `cancelled`, `other`) 중 실 벤더 5xx 실패의 표준 분류. 세션 86 베이스라인은 이 분류가 파이프라인 끝까지 보존됨을 fresh 캡처로 증명.

### D6. 왜 BullMQ retry 가 1회 일어났는지 확인 — 20 잡 → 20 failed 일치?

BullMQ `defaultJobOptions` 에 `attempts` 를 설정하지 않음 → 기본값 1 (재시도 없음). `queue_failed_total` 는 터미널 실패 시 1 증가 → 20 잡 × 1 = 20. 세션 85 에서는 flux-fill 성공으로 구제 → `queue_failed_total` TYPE-only. 본 세션 베이스라인의 `geny_queue_failed_total{...reason="ai_5xx"} 20` 은 이 계약이 정확히 동작함을 보여준다.

**주의**: Runtime 에서 `attempts > 1` 을 설정하면 같은 잡이 N 번 실패 시 `queue_failed_total` 가 N 증가 → 본 베이스라인의 "20 잡 = 20 failed" 상수는 Foundation 한정. Runtime 세션에서 retry 정책이 바뀌면 베이스라인 재캡처 필요.

### D7. 왜 별도 Redis container(:6392) 로 캡처하는가 — 기존 :6391 재사용 대안?

대안 (거부): 세션 85 에서 썼던 :6391 재사용 + FLUSHALL. FLUSHALL 은 제거가 아니라 clear 이므로 queue_* 메트릭이 **세션 85 잔여치와 합산된 채로 노출**될 수 있다 (worker 가 Redis 재연결 시점에 counter reset 여부는 BullMQ 정책 의존).

**채택**: dedicated port 6392 + container 이름 `geny-redis-session-86`. 베이스라인은 clean slate 에서만 유의미 — 잔여치가 섞이면 "20 sample" 수치가 의도를 반영한다는 보증이 깨진다. 캡처 후 `docker rm -f geny-redis-session-86` 으로 정리.

### D8. 왜 CI 5-way 방어망을 유지 (vendor-mock base + fallback 1-hop + 2-hop + terminal + baseline smoke)?

각 스텝이 covering 하는 invariant 가 다르다:
- **observability-e2e (base)**: Mock 경로 baseline (세션 75 스냅샷과 structural drift=0).
- **--vendor-mock (HTTP)**: Mock → HTTP 전환이 메트릭 이름/라벨 키 집합 보존 (세션 83).
- **fallback (1-hop)**: 단일 hop fallback 이 관측 가능 (세션 84).
- **2-hop**: 다중 hop 체인이 독립 label-set 으로 기록 (세션 85).
- **terminal**: fallback 소진 후 실패 분포가 catalog §2.1 + §3 에 정확 (세션 86).

하나라도 빠지면 CI 가 "관측 계약" 의 특정 축 오염을 놓친다. lane 내 순차 실행(5 step × ~10s) 은 비용 선택 가능한 범위.

---

## 5. 남긴 숙제

- **세션 87 후보**: 실 staging 배포 (cluster access 확보 후) — `helm install worker-generate -f values-staging.yaml` + kps ServiceMonitor → `/metrics` 수집 → `observability-snapshot-diff.mjs --baseline ... --current staging-scrape.txt` drift 0 확인 + fallback 트리거 시 `observability-fallback-validate.mjs --expect-hops {1|2}` / `--expect-terminal-failure` 도 staging capture 로 실증. 세션 83/84/85/86 로컬 파이프라인 4 축 고정 → staging 리스크 표면 큰 폭 축소.
- **세션 88 후보**: web-editor 기능 확장 (Stage 3 kick-off) — 중앙 Preview Stage 렌더러(WebGL/Canvas2D) 합류 + Inspector 편집 모드 + `packages/web-editor-logic` 추출. 또는 관측 축 보강 — `UNSAFE_CONTENT` fallback reason e2e (`reason="unsafe"` label 이 따로 기록되는지, `shouldFallback(UNSAFE_CONTENT)=true` 분기가 e2e 로 관측되는지).

---

## 6. 결과

- `node scripts/test-golden.mjs` → **27/27 pass** (step 27 내부 1-hop + 2-hop + terminal validator 3 종 모두 green, 23 파서 tests 포함).
- 로컬 e2e (Redis container at :6392) `[e2e] ✅ observability e2e pass` — 9 축 전부 20 sample (또는 0, T6/T8).
- Foundation 관측 계약 **4-way 증명 축** 완전 커버:
  - (세션 83) Mock ↔ HTTP 구조적 drift=0.
  - (세션 84) 1-hop fallback 경로 가시성.
  - (세션 85) 2-hop fallback 체인 가시성.
  - (세션 86) **터미널 실패 분포 가시성** (새 축).
- CI 5 스텝 방어망 (observability-e2e base + vendor-mock + fallback + 2hop + **terminal**) + golden lane 모두 green 기대. 파이프라인 변경이 fallback hop 수 또는 실패 분포에 영향을 주면 lane 이 즉시 실패.

**landing**: 본 세션 결과 커밋 + push → CI monitor. 베이스라인은 golden step 27 이 파일 레벨, fresh 캡처는 CI lane 이 e2e — 2 층 방어 유지.
