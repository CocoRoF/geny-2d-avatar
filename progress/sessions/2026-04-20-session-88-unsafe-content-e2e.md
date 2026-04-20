# 세션 88 — UNSAFE_CONTENT fallback e2e + `--expect-unsafe` validator CI 고정

**일자**: 2026-04-20
**워크스트림**: Platform / AI Generation / Observability
**선행 세션**: 세션 65 (`processWithMetrics` + `queue_failed_total{reason}`), 세션 83 (`--vendor-mock` HTTP 실경로 e2e), 세션 84 (per-endpoint fail-rate + 1-hop 5xx fallback), 세션 85 (2-hop 5xx), 세션 86 (터미널 5xx + `listSamples` + `--expect-terminal-failure`)

---

## 1. 문제

세션 84/85/86 으로 `routeWithFallback` 의 **5xx 계열 fallback** 3 변종(1-hop / 2-hop / terminal) 은 관측 CI 에 고정됐다. 그러나 `routeWithFallback` 은 하나의 축을 더 가진다: **`SafetyFilter` 가 결과를 `allowed=false` 로 차단한 경로**.

- `route-with-fallback.ts:142-178` — `opts.safety?.check(result, task)` 가 `verdict.allowed === false` 면 `UNSAFE_CONTENT` 코드의 `AdapterError` 를 생성 후 **call_total{status="unsafe"}** + **fallback_total{reason="unsafe"}** label-set 으로 메트릭 emit 후 다음 후보로 폴백.
- 이 경로는 **5xx 와 문자열 하나만 다를 뿐 관측 계약이 완전히 독립**. `status="unsafe"` / `reason="unsafe"` label-set 이 오염되면 온콜이 5xx 대시보드로 잘못 해석.
- 단위 테스트(`route-with-fallback.test.ts`) 는 `NoopSafetyFilter` / mock 으로 경계 케이스만 증명. 전체 파이프라인(producer → Redis → consumer → `/metrics`) 에서 "SafetyFilter 가 차단하면 **차단 카운트가 카탈로그 §3 에 정확히 기록**" 은 회귀 불능.
- Foundation 단계는 실 안전성 판정 모델을 Runtime 의 외부 서비스로 미뤘지만 (docs/05 §9), **주입점 자체의 관측 계약** 은 지금 고정해야 Runtime 전환 시 회귀 탐지 가능.

본 세션은 consumer 워커에 CLI 로 주입 가능한 결정론적 SafetyFilter 프리셋(`block-vendors:NAME`) 을 도입해 UNSAFE fallback 경로 **5 축** 을 CI 에 고정한다.

> "세션 86 '5xx 소진 후 실패 분포가 보인다' → 세션 88 'UNSAFE_CONTENT 로 차단된 결과도 관측 상 **없었던 일이 되지 않는다**' — Foundation 이 고정할 네 번째 fallback 변종."

---

## 2. 변경

### 2.1 `services/orchestrator/src/index.ts` — `safety?` 옵션 패스스루

`CreateOrchestratorServiceOptions` 에 `safety?: SafetyFilter` 필드 추가. `createOrchestratorService` 의 `orchestrate()` 가 이 필드를 `opts.safety` 로 `routeWithFallback` 에 전달. 기존 호출자(미지정) 는 `NoopSafetyFilter` 등가 동작 유지.

이유: `ai-adapter-core` 의 `orchestrate()` 는 이미 `opts.safety` 를 받도록 돼 있었고(세션 33 이후), 서비스 layer 가 이를 투명하게 전달할 수 있다는 사실만 재확인 + 타입 노출.

### 2.2 `apps/worker-generate/src/safety-preset.ts` — 신규 모듈

두 export:

- `parseSafetyPreset(raw: string): SafetyPresetSpec` — `"noop"` / `"block-vendors:NAME[,NAME...]"` 를 엄격 파싱. 알 수 없는 kind / 빈 목록 / 중복 벤더 → throw. CI 에서 오타가 silent 하게 noop 으로 흘러내리지 않도록.
- `createSafetyFilterFromPreset(spec: SafetyPresetSpec): SafetyFilter` — `noop` 은 모든 결과 통과, `block-vendors` 는 `result.vendor` 가 목록에 있으면 `allowed=false` + `reason="safety preset: vendor <name> is blocked"` + `categories=["test-preset"]`.

분리 원리: 파서(pure) + 팩토리(pure) 로 분리해 `args.test.ts` 에서는 원문 보존만 검증하고, `safety-preset.test.ts` 에서는 파싱/필터 의미를 독립 검증.

### 2.3 `apps/worker-generate/src/args.ts` — `--safety-preset <spec>` CLI

`CliArgs.safetyPreset: string | undefined` 추가. 파서는 원문 그대로 저장 — 해석은 `main.ts` 가 `parseSafetyPreset` 호출. 이유: CLI 파서는 side-effect 최소화(unit test 가능), 의미 해석은 main() 의 책임.

### 2.4 `apps/worker-generate/src/main.ts` — safety 주입 배선

`args.safetyPreset` 가 있으면 `createSafetyFilterFromPreset(parseSafetyPreset(args.safetyPreset))` 로 필터 생성 후 `runProducerOrBoth` / `runConsumer` 양쪽에 옵션 전달. `createOrchestratorService` / `createWorkerGenerate.orchestratorOptions` 양자에 `safety` 가 투명하게 흘러들어감.

producer 모드는 `orchestrate()` 를 부르지 않으므로 safety 는 사실상 no-op 이지만, `--role both` 인라인 경로에서는 consumer 와 동일하게 필터가 작동.

### 2.5 `scripts/observability-e2e.mjs` — `--safety-preset` passthrough

신규 CLI `--safety-preset <spec>` → consumer 워커 spawn 시 `--safety-preset <spec>` 인자로 주입 (producer 는 orchestrate 안 타므로 주입 불필요). `--expect-unsafe` 는 기존 `--expect-terminal-failure` 와 달리 observability-smoke 의 success 축 어서션을 **그대로** 쓴다 — unsafe fallback 은 최종적으로 sdxl 이 성공을 반환하므로 `status=success`/`outcome=succeeded` 가 N 으로 여전히 성립.

### 2.6 `scripts/observability-fallback-validate.mjs` — `--expect-unsafe` 모드

`--expect-hops {1|2}` / `--expect-terminal-failure` 와 **상호 배타** 한 제 4 모드. 신규 `validateUnsafeSnapshot(text, expectJobs)` — **5 UNSAFE 축**:

| U# | 축 | 값 |
|----|----|----|
| U1 | `geny_ai_fallback_total{from_vendor="nano-banana", to_vendor="sdxl", reason="unsafe"}` | `>= N` |
| U2 | `geny_ai_call_total{status="unsafe", vendor="nano-banana"}` | `>= N` |
| U3 | `geny_ai_call_total{status="success", vendor="sdxl"}` | `>= N` |
| U4 | `geny_queue_duration_seconds_count{outcome="succeeded"}` | `>= N` |
| U5 | `geny_queue_failed_total` | TYPE-only (sample 없음) |

5xx 1-hop(세션 84, 5 축) 과 **구조 동형**이되 `reason`/`status` 라벨이 `"5xx"` → `"unsafe"` 로 교체된 형태. 별도 함수로 분리한 이유: 의미론적 구별(`5xx` = HTTP 장애 / `unsafe` = 정책 차단) 을 테스트 레벨에서 보존.

### 2.7 `apps/worker-generate/tests/safety-preset.test.ts` — 신규 10 케이스

- `parseSafetyPreset`: noop / block-vendors 단일 / 다중+공백 / 알 수 없는 preset throw / 빈 값 throw / 빈 벤더 목록 throw / 중복 벤더 throw (7 케이스).
- `createSafetyFilterFromPreset`: noop 모든 결과 통과 / block-vendors 매칭만 차단 (reason/categories 확인) / 다중 벤더 블록 (3 케이스).

### 2.8 `apps/worker-generate/tests/args.test.ts` — +3 케이스

- `--safety-preset` 기본값 `undefined`.
- `--safety-preset block-vendors:nano-banana` → 원문 보존.
- `--safety-preset` 값 누락 → throw.

### 2.9 `scripts/observability-fallback-validate.test.mjs` — +6 unsafe 케이스

- `FULL_UNSAFE` 베이스라인(nano unsafe=20 / sdxl success=20 / fallback_unsafe=20 / queue_succeeded=20 / queue_failed TYPE-only) → 0 violations.
- 각 4 축 개별 누락 → violation (U1~U4).
- `queue_failed_total` sample 존재 → violation (U5).
- `FULL` (hop1 5xx baseline) 을 `validateUnsafeSnapshot` 으로 돌리면 reason/status 두 축 missing violation → **5xx ↔ unsafe 라벨 교차 오염 회귀 방지**.

### 2.10 `infra/observability/smoke-snapshot-unsafe-session-88.txt` — 신규 baseline

로컬 `observability-e2e.mjs --vendor-mock --safety-preset block-vendors:nano-banana --expect-unsafe --snapshot ...` 로 캡처한 실 Prometheus exposition. 20 잡 전부 nano-banana 가 차단되고 sdxl 이 성공해 5 축 전부 N=20. `test-golden.mjs` step 27 이 파일-레벨로 validator 어서션.

### 2.11 `scripts/test-golden.mjs` step 27 — 4 baseline × validator

기존 3 개(1-hop/2-hop/terminal) 에 unsafe 베이스라인 validator 호출 추가. 커멘트 업데이트: "29 tests (1-hop 9 + 2-hop 5 + terminal 9 + unsafe 6)" + "4-way 고정".

### 2.12 `.github/workflows/ci.yml` bullmq-integration — 17번째 step

`Observability e2e (--vendor-mock UNSAFE_CONTENT fallback)` — fresh orchestration 캡처 → `--expect-unsafe` validator. 포트 9099/9100, 큐 `geny-obs-88`, 로그 `artifacts/observability-e2e-unsafe/`. `Upload observability-e2e artifacts on failure` 에 신규 step id 추가.

---

## 3. 검증

### 3.1 단위

- `pnpm -F @geny/worker-generate test` → **45 pass / 0 fail** (기존 32 + safety-preset 10 + args +3).
- `node scripts/observability-fallback-validate.test.mjs` → **29 pass / 0 fail** (기존 23 + unsafe 6).

### 3.2 로컬 e2e

```
node scripts/observability-e2e.mjs --vendor-mock \
  --safety-preset block-vendors:nano-banana --expect-unsafe \
  --snapshot infra/observability/smoke-snapshot-unsafe-session-88.txt \
  --log-dir artifacts/observability-e2e-unsafe \
  --container-name geny-obs-88 --queue-name geny-obs-88 \
  --redis-url redis://127.0.0.1:6388 --producer-port 9099 --consumer-port 9100
```
결과:
- perf-harness: 20 잡 성공 (sdxl 폴백), p50=9.31ms, p95=30.25ms, 에러 0/20.
- observability-smoke: enqueued=20, ai_calls{status=success}=20, ai_dur_count=20, q_dur_count{succeeded}=20 → pass.
- `observability-fallback-validate --file ... --expect-unsafe` → `fallback_nano_to_sdxl_unsafe=20, call_total_nano_unsafe=20, call_total_sdxl_success=20, queue_duration_succeeded_count=20, queue_failed_has_sample=false` → ✅ pass.

### 3.3 Golden

`node scripts/test-golden.mjs` → **27/27 pass** (step 27 "observability fallback validator" 가 4 baseline × validator 로 확장됨에도 282ms).

---

## 4. D-axes (도메인 축)

- **D1 (Adapter/Safety 계약)**: SafetyFilter 가 consumer worker CLI 로 주입 가능. Runtime 전환 시 실 서비스 필터로 교체만 하면 됨 (Foundation 은 preset 으로 결정론성 확보).
- **D2 (Observability)**: `status="unsafe"` / `reason="unsafe"` label-set 의 Prometheus exposition 이 CI 회귀 고정. 온콜 대시보드가 5xx 와 정책 차단을 label value 로 분리 가능.
- **D3 (Fallback 4-way)**: `routeWithFallback` 의 4 변종 fallback 경로(1-hop 5xx / 2-hop 5xx / terminal 5xx / unsafe) 전부 관측 CI 에 고정 — "fallback 경로가 없었던 일이 되지 않는다" 불변식 완결.
- **D4 (Worker CLI)**: `--safety-preset` 로 결정론적 주입. `block-vendors:NAME[,NAME...]` + `noop` 두 kind. 파서 엄격 — CI 에서 오타가 silent noop 으로 흘러내리지 않음.
- **D5 (Validator 4-way)**: `observability-fallback-validate` 가 4 모드 상호 배타 (`--expect-hops` / `--expect-terminal-failure` / `--expect-unsafe` + 기본 1-hop).
- **D6 (CI 분할)**: golden step 27 은 **커밋된** baseline 4개를 파일-레벨로(수 ms), bullmq-integration lane 은 **fresh 캡처** 로 orchestration 변조 탐지(Docker+Redis 필요).
- **D7 (Runtime 준비)**: Runtime 의 외부 안전성 서비스는 `SafetyFilter` 인터페이스만 만족하면 drop-in 교체 가능. 관측 계약은 이미 검증됨.

---

## 5. Exit 게이트 / 진척

- **§8 Foundation Exit 로드맵**: 세션 88 UNSAFE_CONTENT fallback e2e DONE → 세션 89 staging / 웹에디터 상태 머신 / Runtime prep 으로 전진.
- **카탈로그 §3**: `geny_ai_call_total{status=unsafe}` + `geny_ai_fallback_total{reason=unsafe}` label-set 이 exposition 샘플로 CI 고정. (이전까지는 단위 테스트만.)
- **Runtime 전환 대비**: `SafetyFilter` 를 실 서비스(docs/05 §9) 로 교체할 때, preset 기반 CI 테스트는 여전히 결정론적 주입점으로 남음. 실 서비스 경로는 별도 lane (staging) 에서 검증.

---

## 6. 후속

- Session 89 후보:
  - Staging 배포 (클러스터 접근 복구 시).
  - 웹에디터 상태 머신 (선택 → mask → 미리보기 → export 4-스테이지).
  - Runtime 모듈 초기 scaffold (`services/runtime-core`).
- 실 safety 서비스 인터페이스 합의 (MCP? HTTP? gRPC?) — Runtime 합류 시점에.
- `block-vendors` 외에 `block-categories` / `block-hash` 프리셋 추가 여지 — 필요 증명 시.
