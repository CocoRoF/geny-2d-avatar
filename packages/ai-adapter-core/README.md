# @geny/ai-adapter-core

docs/05 AI 생성 파이프라인의 어댑터 계약.

- `Capability` / `GenerationTask` / `GenerationResult` / `AdapterMeta` — TS 미러 (권위 정의는 `schema/v1/ai-adapter-task.schema.json` · `ai-adapter-result.schema.json`).
- `AdapterRegistry.route(task)` — capability + budget 필터링 + `routing_weight desc, cost asc, name asc` 결정론적 정렬.
- `AdapterError` (`CAPABILITY_MISMATCH`/`BUDGET_EXCEEDED`/`DEADLINE_EXCEEDED`/`VENDOR_ERROR_4XX|5XX`/`INVALID_OUTPUT`/`NO_ELIGIBLE_ADAPTER`/`PROBE_FAILED`/`UNSAFE_CONTENT`) + `retryable` 힌트 — 벤더별 에러는 어댑터에서 여기로 매핑.
- `deterministicSeed(idempotency_key)` · `promptSha256(prompt)` — docs/05 §7.1 재현 보증.
- `buildProvenancePartEntry(task, result)` — `schema/v1/provenance.schema.json` 의 `parts[].ai_generated` 엔트리로 직변환. `@geny/license-verifier` round-trip 통과 (`@geny/ai-adapter-nano-banana` 테스트).

Foundation 단계는 인터페이스만 제공. 실제 프로덕션 라우팅(벤더 헬스, 사용자 등급, 쿼터, 캐시)은 세션 23+ 에서 확장한다.

## 빌드

```bash
pnpm -F @geny/ai-adapter-core build
pnpm -F @geny/ai-adapter-core test
```

14 tests (deterministic seed 5 + provenance builder 4 + registry routing 5).
