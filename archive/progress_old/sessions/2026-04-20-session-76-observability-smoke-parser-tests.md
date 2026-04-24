# 세션 76 — observability-smoke 파서 단위 테스트 + golden step 승격

**일자**: 2026-04-20
**워크스트림**: Platform / Observability
**선행 세션**: 세션 75 (`scripts/observability-smoke.mjs` 신규 — producer+consumer `/metrics` union 검증 + snapshot)

---

## 1. 문제

세션 75 의 `scripts/observability-smoke.mjs` 는 **실 Redis + producer + consumer + 스모크 부하** 가 모두 올라가 있어야 end-to-end 검증이 가능 — CI 승격 의 첫 단계로 옮기려면 오케스트레이션 인프라 (docker service + 프로세스 spawn 라이프사이클) 가 수반된다.

하지만 스크립트의 **핵심 로직 (Prometheus exposition 파서)** 는 pure function 으로 단위 테스트가 가능하다: `extractMetricNames(text)` 가 `# TYPE` 라인 + 샘플 라인을 둘 다 수집하고 히스토그램 접미사 (`_bucket`/`_sum`/`_count`) 를 base name 으로 축약하는 로직, 그리고 `readSampleValue(text, name, labelFilter)` 가 레이블 조건에 맞는 첫 샘플 value 를 읽는 로직이 실 구동 없이 충분히 검증 가능.

세션 75 D7 ("CI 승격은 오케스트레이션 복잡도로 별도 세션") 중 **오케스트레이션이 필요 없는 절반** 을 먼저 도려내 golden step 으로 승격 → 파서 버그가 향후 회귀되는 경로를 차단.

---

## 2. 변경

### 2.1 `scripts/observability-smoke.mjs` — pure function export + CLI 가드

```js
export function extractMetricNames(exposition) { ... }
export function readSampleValue(exposition, metricName, labelFilter = {}) { ... }

// CLI 가 직접 실행될 때만 main() — import 는 pure.
const entryPath = process.argv[1] ? fileURLToPath(import.meta.url) : null;
if (entryPath && process.argv[1] === entryPath) {
  main().catch((err) => { ... });
}
```

세션 75 에선 두 함수가 모듈 내부(`function ...`) 였음 → `export` 로 승격, `main()` 은 `process.argv[1] === fileURLToPath(import.meta.url)` 가드 하에 CLI 직접 실행 시에만 호출되게. 테스트 스크립트가 import 해도 `fetch(/metrics)` 가 돌지 않는다.

### 2.2 `scripts/observability-smoke.test.mjs` 신규

7 테스트 케이스 (Node assert/strict 로 dependency-free):

1. **TYPE-only 라인이 노출로 간주** — `geny_queue_failed_total` 처럼 0 건 counter 도 선언만 있으면 집합에 포함되는지 확인. 카탈로그 계약은 "이름 노출" 기준이므로.
2. **`_bucket`/`_sum`/`_count` 접미사 축약** — 5 라인(bucket 2개 + sum + count + TYPE) 이 `geny_queue_duration_seconds` 1 개 base name 으로 축약.
3. **Label filter exact match** — 같은 메트릭이 `status=success` 20, `status=5xx` 3 두 샘플일 때 필터가 정확히 구분.
4. **Label filter 불일치 시 null** — `queue_name=q-a` 만 있는 exposition 에서 `queue_name=q-b` 필터 → null.
5. **부재 메트릭은 null** — `geny_does_not_exist` 는 exposition 에 없으면 null.
6. **다중 샘플 — 첫 매치 반환** — `queue_name=q-a` 10 / `queue_name=q-b` 20 두 샘플에서 필터 미지정 시 첫 샘플(10) 반환 (결정적 동작 보장).
7. **Producer+Consumer union 8종 커버** — 세션 75 실측 fixture 와 유사한 분할 exposition (producer: queue_depth/enqueued + ai_* TYPE / consumer: duration sample + failed TYPE + ai_* sample) 에서 union 이 카탈로그 §2.1 + §3 8 메트릭 모두 포함.

실행: `node scripts/observability-smoke.test.mjs` → `✅ all checks pass`.

### 2.3 `scripts/test-golden.mjs` step 22 추가

`runObservabilitySmokeParserTests` → golden 21→**22 step**. `@geny/*` 빌드 의존 없이 `node scripts/observability-smoke.test.mjs` 만 실행 — 가장 가벼운 step 중 하나(~55ms).

---

## 3. 주요 결정축

- **D1** — **오케스트레이션 전/후 분리**: 세션 75 D7 이 "CI 승격은 별도 세션" 이라고 했지만 `e2e 검증` 과 `파서 검증` 은 실제로 분리 가능한 축. 파서는 pure function 이라 도커 없이 검증 가능, e2e 는 여전히 세션 77 이후로 유예. **부분 승격** 이 CI 무게 증가 없이 회귀 방지를 확보.
- **D2** — **CLI 실행 가드**: `process.argv[1] === fileURLToPath(import.meta.url)` 관용구. Node 22 의 `import.meta.main` 은 아직 standard 가 아니고 실험적. 이 관용구는 ESM + CJS 어디서나 동작.
- **D3** — **assert/strict only, 테스트 프레임워크 미채택**: 기존 `scripts/perf-harness.test.mjs` 와 동일한 패턴 유지 (dep-free, 단일 스크립트). Vitest/mocha 도입은 `scripts/` 전체 규약 변경이라 범위 밖.
- **D4** — **union 케이스 포함**: 순수 단위 테스트만으로 채울 수도 있지만, 세션 75 의 "union 8종 커버" 가 핵심 계약이므로 producer/consumer 분할 fixture 를 재현하는 통합형 케이스 1 개 추가 — 파서만 돌고 네트워크는 없으므로 여전히 pure.
- **D5** — **e2e 오케스트레이션 세션으로 분리 보존**: `scripts/observability-e2e.mjs` (Redis docker + producer/consumer spawn + perf-harness smoke + observability-smoke validation 오케스트레이션) 는 별도 세션. Foundation CI 무게는 현재도 22 step 에서 안정적이므로, 도커 dependency 도입은 확실한 수요가 있을 때.
- **D6** — **snapshot 파일은 테스트에 포함하지 않음**: `infra/observability/smoke-snapshot-session-75.txt` 를 읽어 비교하는 테스트도 가능하지만 snapshot 은 "Runtime 비교 기준" 역할이지 "파서 계약 고정" 역할이 아님. 계약은 inline fixture 로 표현하는 게 명확.

---

## 4. 검증

```
$ node scripts/observability-smoke.test.mjs
  ✓ TYPE-only 라인이 노출로 간주
  ✓ _bucket/_sum/_count 접미사 축약
  ✓ label filter exact match
  ✓ label filter 불일치 시 null
  ✓ 부재 메트릭은 null
  ✓ 다중 샘플 — 첫 매치 반환
  ✓ producer+consumer union 8종 커버 (카탈로그 §2.1 + §3)
[obs-smoke-test] ✅ all checks pass

$ node scripts/test-golden.mjs
... (21 기존 step 통과) ...
[golden] ✔ observability-smoke parser tests (55 ms)
[golden] ✅ all steps pass  (22 step)

$ node scripts/validate-schemas.mjs
[validate] checked=244 failed=0
[validate] ✅ all schemas + rig templates valid
```

---

## 5. 남긴 숙제

- **세션 77 후보 (e2e 오케스트레이션)**: `scripts/observability-e2e.mjs` 신규 — Redis docker(`docker run --rm -d redis:7.2-alpine --maxmemory-policy noeviction`) + producer/consumer spawn (세션 74 `perf-sweep-concurrency.mjs` 패턴) + `perf-harness --target-url` smoke + `observability-smoke --expect-enqueued N --expect-ai-calls N` 을 한 번에. CI 에선 ubuntu runner 에 Redis service 가 이미 붙어 있으므로 golden lane 이 아닌 `bullmq-integration` lane 에 승격 고려.
- **세션 78 후보 (실 Prometheus 스냅샷)**: staging cluster `kube-prometheus-stack` + ServiceMonitor → `infra/observability/smoke-snapshot-session-75.txt` 와 diff.
- **카탈로그 §1/§2/§4~§10 union 확장**: 현재 파서는 §2.1 + §3 이름만 검증. Job lifecycle (§1) · Worker health (§2) · Cost (§4) · Cache (§5) · Quality (§6) · API RED (§7) · Export (§8) 도 Foundation 시점에 일부 노출되므로 세션 78 이후로 확장 가능 — 단, 어떤 메트릭이 어느 role 소유인지 카탈로그 갱신이 선행되어야.

---

## 6. 결과

- `scripts/observability-smoke.mjs` — `extractMetricNames` + `readSampleValue` export + CLI 실행 가드.
- `scripts/observability-smoke.test.mjs` 신규 — 7 단위 테스트 케이스.
- `scripts/test-golden.mjs` 21→**22 step** (observability-smoke parser tests).
- **Foundation 회귀 방어망 확장**: 파서 버그가 세션 75 의 union 계약을 깨면 CI 가 즉시 탐지. e2e 오케스트레이션 승격은 세션 77 로 분리 보존.
- golden 22/22, validate-schemas checked=244, perf-harness test 7/7, job-queue-bullmq 26/31 pass (+5 skip) 불변.
