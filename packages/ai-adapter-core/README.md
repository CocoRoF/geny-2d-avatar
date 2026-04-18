# @geny/ai-adapter-core

docs/05 AI 생성 파이프라인의 어댑터 계약.

- `Capability` / `GenerationTask` / `GenerationResult` / `AdapterMeta` — TS 미러 (권위 정의는 `schema/v1/ai-adapter-task.schema.json` · `ai-adapter-result.schema.json`).
- `AdapterRegistry.route(task)` — capability + budget 필터링 + `routing_weight desc, cost asc, name asc` 결정론적 정렬.
- `AdapterError` (`CAPABILITY_MISMATCH`/`BUDGET_EXCEEDED`/`DEADLINE_EXCEEDED`/`VENDOR_ERROR_4XX|5XX`/`INVALID_OUTPUT`/`NO_ELIGIBLE_ADAPTER`/`PROBE_FAILED`/`UNSAFE_CONTENT`) + `retryable` 힌트 — 벤더별 에러는 어댑터에서 여기로 매핑.
- `deterministicSeed(idempotency_key)` · `promptSha256(prompt)` — docs/05 §7.1 재현 보증.
- `buildProvenancePartEntry(task, result)` — `schema/v1/provenance.schema.json` 의 `parts[].ai_generated` 엔트리로 직변환. `@geny/license-verifier` round-trip 통과 (`@geny/ai-adapter-nano-banana` 테스트).
- `buildCacheKey(input)` / `InMemoryAdapterCache` — docs/05 §8.2 결과 캐시.
- `SafetyFilter` / `NoopSafetyFilter` — docs/05 §9 결과 안전성 훅.
- **`routeWithFallback(registry, task, { cache?, safety?, maxAttempts? })`** — docs/05 §8.1 폴백 오케스트레이터.
  - 1순위 성공 → 결과 반환
  - 5xx/DEADLINE/UNSAFE_CONTENT/네트워크 에러 → 다음 후보로 폴백
  - 4xx/CAPABILITY_MISMATCH/BUDGET_EXCEEDED/INVALID_OUTPUT → 즉시 throw (다른 벤더도 같은 입력에 같은 응답)
  - 캐시 hit → 어댑터 호출 없이 즉시 반환 (키는 **primary 어댑터 기준**; 폴백이 일어나도 저장 키는 고정)
  - `attempts[]` 트레이스 반환 — 누가 어떻게 실패했는지 provenance 로 이어 쓸 수 있음

```ts
import { AdapterRegistry, routeWithFallback, InMemoryAdapterCache } from "@geny/ai-adapter-core";

const registry = new AdapterRegistry();
registry.register(new NanoBananaAdapter({ client: httpNano }));
registry.register(new SDXLAdapter({ client: httpSDXL }));

const cache = new InMemoryAdapterCache();
const out = await routeWithFallback(registry, task, { cache });
// out.result : GenerationResult
// out.primary: "nano-banana" (최상위 후보)
// out.used   : 실제로 성공한 어댑터 이름
// out.attempts: [{ adapter, modelVersion, ok, errorCode? }, ...]
```

## 빌드

```bash
pnpm -F @geny/ai-adapter-core build
pnpm -F @geny/ai-adapter-core test
```

37 tests (deterministic seed 5 + provenance builder 4 + registry routing 5 + cache 4 + routeWithFallback 14 + 기타).
