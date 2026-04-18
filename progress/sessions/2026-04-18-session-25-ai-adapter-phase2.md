# 세션 25 — AI 어댑터 2차 (HTTP + 캐시 + 폴백 skeleton)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 25
- 워크스트림: **AI Generation** (`docs/14 §9`) — nano-banana 1차 skeleton(세션 22) 를 프로덕션 경로로 확장
- 로드맵: 세션 22 의 "실제 HTTP 구현은 세션 23+" 잔여 + `progress/INDEX.md §8` 세션 25 예고

## 1. 목표

docs/05 §2.3 의 "동등 capability 면 nano-banana 우선, 5xx/DEADLINE 시 폴백 후보 리스트로 내려감" 을 **Foundation 이 끝나기 전에 계약(test) 으로 고정**. 즉:

1. nano-banana 1차 어댑터에 실제 HTTP 경로를 붙여 `NanoBananaClient` 인터페이스만 갈아끼우면 프로덕션으로 교체되게.
2. 5xx/4xx/Abort/non-JSON/bad sha 등 모든 벤더 에러를 `AdapterError` 9 코드 중 하나로 단일 매핑.
3. SDXL(edit/style_ref) + Flux-Fill(mask) Mock skeleton 을 등록하면 `AdapterRegistry.route()` 가 자동으로 폴백 순서를 deterministic 하게 돌려주는 것을 회귀로 박제.
4. 캐시 키는 세션 22 의 `deterministicSeed`/`promptSha256` 과 같은 "결정론" 보장이 동일 입력에 대해 캐시 히트로 이어지도록 설계.

## 2. 산출물 체크리스트

- [x] `@geny/ai-adapter-core/src/cache.ts` — `buildCacheKey(input)` + `InMemoryAdapterCache` (TTL + auto-expiry) + `AdapterCache`/`CacheKeyInput` 타입
- [x] `@geny/ai-adapter-core/src/index.ts` — cache exports 추가
- [x] `@geny/ai-adapter-core/tests/cache.test.ts` — 9 tests (determinism, seed/prompt/model_version variance, style_reference 정렬 불변, set/get, miss=null, TTL 만료, clear). core 총 23 tests
- [x] `@geny/ai-adapter-nano-banana/src/http-client.ts` — `HttpNanoBananaClient` (AbortController deadline, Bearer + x-idempotency-key 헤더, `fetch` 주입, endpoint/apiKey 생성자 검증). 에러 매핑:
  - `AbortError` → `DEADLINE_EXCEEDED`
  - 네트워크 throw → `VENDOR_ERROR_5XX`
  - res.ok=false, status ≥ 500 → `VENDOR_ERROR_5XX` (retryable)
  - res.ok=false, status < 500 → `VENDOR_ERROR_4XX` (non-retryable)
  - non-JSON body / bad sha(`/^[0-9a-f]{64}$/`) / bbox 4-number 아님 → `INVALID_OUTPUT`
- [x] `@geny/ai-adapter-nano-banana/src/index.ts` — HttpNanoBananaClient 노출
- [x] `@geny/ai-adapter-nano-banana/tests/http-client.test.ts` — 12 tests (200 parse, 500/400/429, network throw, Abort, non-JSON, bad sha, missing bbox, headers/body 구조, health 3 분기, 생성자 검증). nano-banana 총 23 tests
- [x] `packages/ai-adapters-fallback/` 신설 (`@geny/ai-adapters-fallback` v0.1.0)
  - `src/sdxl-adapter.ts` — `SDXLAdapter` (capability `[edit, style_ref]`, routing_weight 80, max_parallel 4, Mock `sdxl-1.0-mock` cost $0.008)
  - `src/flux-fill-adapter.ts` — `FluxFillAdapter` (capability `[mask]`, routing_weight 70, max_parallel 2, Mock `flux-fill-1.0-mock` cost $0.012, `reference_image + mask` 필수)
  - `src/index.ts` — 두 어댑터 + Mock + 타입 exports
  - `tests/sdxl.test.ts` (11) / `tests/flux-fill.test.ts` (11) / `tests/router-fallback.test.ts` (9)
- [x] `scripts/test-golden.mjs` — step 12 `ai-adapters-fallback tests` (총 12 step)
- [x] `packages/ai-adapter-nano-banana/README.md` — HttpNanoBananaClient 소개 + 프로덕션 교체 계획 [x] 체크
- [x] `packages/ai-adapters-fallback/README.md` — 라우팅 매트릭스 + 검증 + 세션 26+ 계획
- [x] `progress/INDEX.md` — AI Generation 갱신 / Platform-Infra step=12 / Gate 갱신 / 세션 25 row / §8 세션 26–28 재정렬

## 3. 설계 결정 (D1–D5)

### D1. Cache key 는 "순수 입력" 만으로 계산 — `deterministicSeed` 와 같은 규칙

```
sha256(
  adapter=<name> | model=<version> | prompt=<prompt_sha> | negative=<neg_sha>
  | ref=<ref_sha or ""> | mask=<mask_sha or ""> | style=<sorted_style_shas,joined>
  | profile=<profile_id> | seed=<number> | size=WxH | guidance=<n or "">
  | strength=<n or ""> | slot=<slot_id>
)
```

- **style_reference 순서 무관**: `.slice().sort().join(",")` — 같은 레퍼런스 세트를 다른 순서로 넘겨도 같은 키.
- **negative prompt** 는 별도 해시. "" vs 실제 문자열이 충돌 나지 않도록.
- **adapter + model_version 포함**: nano-banana vs sdxl 이 "같은 프롬프트를 받아도 다른 결과" 이므로 캐시를 분리해야 함.
- `GenerationTask` 의 `deadline_ms`/`budget_usd`/`idempotency_key`/`task_id` 는 **키에 포함하지 않음** — 이것들은 "같은 작업을 다시 요청" 의 신호이고 결과에 영향을 주지 않음.

근거: 세션 22 `deterministicSeed(idempotency_key)` 와 한 쌍이 되도록. 결정론 보장이 유지되는 한 캐시 히트가 무조건 정답.

### D2. HTTP 에러 매핑은 9 코드 × 5 분기로 폐쇄

| 상황 | 매핑 | retryable |
|---|---|---|
| 네트워크 fetch throw | `VENDOR_ERROR_5XX` | ✓ |
| AbortController 취소 | `DEADLINE_EXCEEDED` | ✓ (새 deadline 으로) |
| res.status ≥ 500 | `VENDOR_ERROR_5XX` | ✓ |
| res.status < 500 (4xx) | `VENDOR_ERROR_4XX` | ✗ |
| non-JSON body | `INVALID_OUTPUT` | ✗ |
| bad sha 포맷 | `INVALID_OUTPUT` | ✗ |
| bbox 누락/형식 오류 | `INVALID_OUTPUT` | ✗ |

"retryable 여부" 는 세션 28 의 `routeWithFallback()` 이 사용할 정책 플래그 — VENDOR_ERROR_5XX/DEADLINE_EXCEEDED 만 다음 후보로 내려가고, 4xx/INVALID_OUTPUT 은 즉시 실패.

근거: docs/05 §2.3 "벤더 4xx 는 입력 문제이므로 폴백해도 같은 실패" 원칙.

### D3. 폴백 라우팅은 `AdapterRegistry.route()` 의 정렬 결과에 위임 — 별도 정책 없음

라우터 확장 대신, 기존 `(routing_weight desc, estimate_cost asc, name asc)` 정렬이 이미 "nano-banana(100) → sdxl(80) → flux-fill(70)" 을 주므로 **호출자는 리스트 순서대로 시도** 하면 됨. 이번 세션은 그 리스트가 각 capability 조합에서 예상대로 나오는 것만 테스트.

라우팅 헬퍼(`routeWithFallback`) 는 retryable 판정 + 캐시 통합이 얽혀 있어 **세션 28 로 미룸**. 지금은 integration test 에서 "candidates[0] 가 실패하면 candidates[1] 로 내려간다" 를 직접 for-loop 로 구현해 polyfill.

근거: 정책 코드를 두 번 쓰지 않는다 — 세션 28 의 헬퍼가 이 세션의 integration test 패턴과 정확히 같은 모양일 것이므로, 그 때 중앙화.

### D4. `@geny/ai-adapters-fallback` 는 별도 패키지 — nano-banana 와 분리

한 패키지에 모든 벤더를 합치고 싶었지만:

- nano-banana 만 쓰는 소비자는 SDXL/Flux 의존성을 끌고 올 이유가 없음
- 라우터 integration test 가 nano-banana + sdxl + flux-fill 세 개를 동시에 필요로 함 — 한쪽이 다른 쪽을 dep 으로 들이면 순환

결국 `@geny/ai-adapters-fallback` 를 별도 package 로 만들고, **integration test 만 nano-banana 를 devDep 으로 소환**. 런타임 소비자(orchestrator) 는 원하는 벤더 패키지들을 개별 설치.

근거: docs/05 §12 "벤더 추가 가이드" 의 "각 어댑터는 자기 패키지를 가진다" 원칙.

### D5. Mock client 는 `sha256(vendor|seed|prompt|slot)` 로 결정적 이미지 해시 생성

- SDXL: `sdxl:v0|seed|prompt|slot` 해시
- Flux-Fill: `flux-fill:v0|seed|mask_sha|prompt|slot` 해시 (mask 가 결과를 좌우하므로 키에 포함)
- bbox 는 고정 규칙 (SDXL: 92% 중앙, Flux-Fill: 전체)

같은 입력 → 같은 이미지 해시를 보장해 router-fallback test 에서 "flux-fill 가 실제로 다른 결과를 냄" 을 확인 가능. 실제 벤더 호출이 없으므로 CI 가 네트워크 없이 완주.

근거: 세션 22 의 Mock nano-banana 와 같은 디자인. "Mock 은 production 과 같은 계약을 지키되 결정론만 추가한다."

## 4. 검증 로그

```bash
$ pnpm -F @geny/ai-adapter-core test
ℹ tests 23  pass 23  fail 0

$ pnpm -F @geny/ai-adapter-nano-banana test
ℹ tests 23  pass 23  fail 0

$ pnpm -F @geny/ai-adapters-fallback test
ℹ tests 31  pass 31  fail 0
```

`pnpm run test:golden` 12 step 전 단계 ✔.

## 5. 위험·후속

- **실 HTTP 엔드포인트 미확정**: `HttpNanoBananaClient` 의 `POST /v1/generate` · `GET /v1/health` 는 가정형. Gemini 2.5 Flash Image 공식 스펙이 확정되면 경로/페이로드 조정이 필요하나, 인터페이스와 에러 매핑은 유지된다.
- **cache 전략**: `InMemoryAdapterCache` 는 프로세스 단위. Orchestrator 가 스케일되면 Redis/PG 백엔드가 필요 — `AdapterCache` 인터페이스만 구현하면 교체 가능.
- **routeWithFallback 미구현**: 세션 28 에서 retryable 매핑(VENDOR_ERROR_5XX/DEADLINE_EXCEEDED만 폴백) + 캐시 통합 + `maxAttempts` 정책을 한 번에 중앙화.
- **SDXL/Flux-Fill HTTP 클라이언트 미구현**: 같은 이유로 세션 28.

## 6. 다음 세션 예고

세션 26 은 Post-Processing Stage 1 (alpha cleanup) skeleton 으로 스트림 전환. `progress/INDEX.md §8` 참조.
