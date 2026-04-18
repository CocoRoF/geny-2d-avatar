# 세션 28 — AI 어댑터 3차 (routeWithFallback + HttpSDXL/HttpFluxFill + SafetyFilter)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 28
- 워크스트림: **AI Generation** (`docs/05 §8.1 / §9`) — 오케스트레이터 층 착수
- 로드맵: `progress/INDEX.md §8` 세션 28 예고 · docs/05 §8.1 라우팅 폴백 · docs/05 §9 안전성

## 1. 목표

세션 22/25 에서 어댑터 계약과 Mock/HTTP 클라이언트 껍데기를 만들었다. 세션 28 은 **사용하는 쪽
(상위 orchestrator)** 의 진입점을 정의한다:

```ts
routeWithFallback(registry, task, { cache, safety, maxAttempts })
  → { result, primary, used, attempts, cached }
```

이 한 함수만으로 캐시 lookup → 1순위 어댑터 시도 → 실패 시 다음 후보 → 안전 필터 → 캐시 저장 →
결과 반환이 결정론적으로 묶인다. 벤더 어댑터(nano-banana, sdxl, flux-fill) 를 늘릴 때 이 함수는
변경되지 않는다 — `AdapterRegistry` 에 `.register()` 만 추가.

병행해서 SDXL/Flux-Fill 의 **실 HTTP 클라이언트 껍데기** (`HttpSDXLClient` / `HttpFluxFillClient`)
를 nano-banana HTTP 와 대칭 규약으로 노출. 벤더 API 스펙이 확정되면 `toVendorRequest` 와 응답
파싱만 교체하면 된다.

## 2. 산출물 체크리스트

- [x] `packages/ai-adapter-core/src/route-with-fallback.ts` — `routeWithFallback()` + 타입들
  (`RouteWithFallbackOptions`, `RouteWithFallbackOutcome`, `FallbackAttemptTrace`).
- [x] `packages/ai-adapter-core/src/safety.ts` — `SafetyFilter` 인터페이스 + `SafetyVerdict`
  (`allowed`/`reason`/`categories?`) + `NoopSafetyFilter` 기본 구현.
- [x] `packages/ai-adapter-core/src/index.ts` — 신규 API exports (route-with-fallback + safety).
- [x] `packages/ai-adapter-core/tests/route-with-fallback.test.ts` — 14 tests:
  - 1순위 성공 / 5xx 폴백 / 4xx 즉시 throw / CAPABILITY_MISMATCH 즉시 throw / DEADLINE 폴백 /
    비-AdapterError 네트워크 5xx 폴백 / 모든 후보 실패 rethrow / NoopSafetyFilter 통과 /
    safety block 시 다음 후보 / 모든 후보 safety block UNSAFE_CONTENT / 캐시 hit /
    캐시 key = primary 기준 / maxAttempts=1 폴백 금지 / NO_ELIGIBLE_ADAPTER 전파.
- [x] `packages/ai-adapters-fallback/src/http-sdxl-client.ts` — `HttpSDXLClient`.
  `HttpNanoBananaClient` 와 대칭(5xx/4xx/Abort/non-JSON/bad sha/bbox → AdapterError).
- [x] `packages/ai-adapters-fallback/src/http-flux-fill-client.ts` — `HttpFluxFillClient`.
  mask 전용 파라미터 매핑(reference_image/mask sha256) 포함.
- [x] `packages/ai-adapters-fallback/src/index.ts` — HTTP 클라이언트 exports 추가.
- [x] `packages/ai-adapters-fallback/tests/http-sdxl.test.ts` (13) / `http-flux-fill.test.ts` (9).
  모두 `fetch` mock 주입으로 네트워크 없이 검증.
- [x] `scripts/test-golden.mjs` — 기존 step 8/12 의 헤더 주석을 routeWithFallback + HTTP
  clients 포함으로 갱신. (별도 step 추가 불필요 — 같은 패키지의 test 러너가 모든 파일 pick up.)
- [x] `packages/ai-adapter-core/README.md` + `packages/ai-adapters-fallback/README.md` — 사용법 +
  테스트 개수(37 / 53).
- [x] `progress/INDEX.md` — AI Generation 스트림 라인, Platform/Infra CI 라인, 세션 28 row,
  Gate 라인, §8 next sessions 재정렬(세션 29 Post-Processing Stage 3, 30 orchestrator,
  31 rig v1.3.0 실 저작).

## 3. 설계 결정 (D1–D6)

### D1. `routeWithFallback` 은 `@geny/ai-adapter-core` 에 둔다 (어댑터 패키지가 아님)

`AdapterRegistry` 와 함께 쓰이는 헬퍼이고, 하류 어댑터(nano-banana / sdxl / flux-fill) 에 대한
의존이 전혀 없다 — 어댑터 계약(`AIAdapter`) 과 `AdapterError.retryable` 만 사용. 따라서 core 에
두어야 순환 의존이 생기지 않고 외부 어댑터도 같은 오케스트레이터를 쓸 수 있다.

근거: `@geny/ai-adapters-fallback` 이 core 를 의존하는 방향은 이미 세션 25 에서 굳어졌다.
routeWithFallback 이 fallback 패키지에 있으면 nano-banana 만 쓰는 소비자도 fallback 패키지를
깔아야 하는 모순.

### D2. 4xx / CAPABILITY_MISMATCH / BUDGET_EXCEEDED / INVALID_OUTPUT 은 폴백 금지

docs/05 §12.3 — 이 코드들은 "입력이 잘못되었다" 는 의미이므로 다른 벤더도 같은 입력을 같은
방식으로 거부할 가능성이 매우 높다. 폴백하면 사용자 응답 지연 + 벤더 비용만 늘어남.

반면:
- `VENDOR_ERROR_5XX` / `DEADLINE_EXCEEDED` / `PROBE_FAILED` → `AdapterError.retryable=true`
- `UNSAFE_CONTENT` → 다른 벤더가 안전한 결과를 낼 수 있으므로 폴백 허용 (D3 참조)
- 비(非) AdapterError (네트워크 throw, 파싱 오류 등) → 5xx 와 등가로 간주

근거: 세션 22 `AdapterError.retryable` 계약과 일치. orchestrator 가 어떤 에러를 폴백할지 별도
계산하지 않고 그대로 위임 → 한 곳(errors.ts) 만 수정하면 오케스트레이터 동작이 따라감.

### D3. Safety block 은 "다음 후보로 폴백" 하되, 모든 후보 block 이면 `UNSAFE_CONTENT` throw

한 벤더의 모델이 부적합 결과를 냈다고 다른 벤더도 그럴 거라고 단정할 수 없다. 예: nano-banana 가
의료/폭력 오분류로 걸렀지만 SDXL 은 통과시키는 케이스. 반대로 정말 위험 입력이면 모든 벤더가
비슷하게 걸러야 정상 — 그 때 마지막에 `UNSAFE_CONTENT` throw.

attempts 트레이스에는 어느 후보가 어떤 이유로 block 됐는지 `errorCode=UNSAFE_CONTENT` 로 남아,
provenance 기록 시 어느 벤더가 거부했는지 추적 가능.

근거: docs/05 §9 "Safety hook 은 거부를 결정, 오케스트레이터가 폴백 정책을 결정" 분리.

### D4. 캐시 키는 **primary 어댑터 기준** 으로 고정 — 폴백이 일어나도 키는 안 바뀜

같은 task 의 재시도는 같은 결과를 주는 게 우선. 만약 폴백 일어날 때마다 키가 바뀌면:
- 1차: nano-banana 5xx → SDXL 성공 → sdxl 키로 저장 → 다음 호출 sdxl 키 맞힘? 아닐 수도
- 유저 입장에서 "재시도했는데 왜 다시 AI 호출이 가느냐" 문제

대신 primary 키로만 저장 → 벤더는 provenance.vendor 로 추적. 다음 호출 시 primary 키 hit →
폴백 여부와 무관하게 같은 결과 반환. "어느 벤더가 만들었는지" 는 provenance 가 기록.

근거: 세션 25 `buildCacheKey` 가 `adapter_name + model_version` 을 포함한다는 설계와 일치.

### D5. HTTP 클라이언트는 벤더 스펙 placeholder — 계약만 고정, 바디 포맷은 교체 가능

`HttpSDXLClient` / `HttpFluxFillClient` 는 `POST /v1/edit` · `POST /v1/fill` 엔드포인트에
`{ model, prompt, negative_prompt, size: {w,h}, seed, ... }` JSON 을 보내는 "일반적 벤더 API
가정". 실 벤더 스펙이 확정되면:

- `toVendorRequest(req, model)` 함수 하나 교체 → 요청 본문 변경
- `VendorBody` 파싱부 하나 교체 → 응답 해석 변경
- 에러 매핑(`mapHttpStatus`), Abort 처리, fetch 주입, 검증 규칙 — **변경 없음**

즉 "HTTP 레이어의 규약" 은 이번 세션에 굳어지고, "벤더별 디테일" 만 후속 세션에서 메꾼다.

근거: 세션 25 D3 `HttpNanoBananaClient` 와 같은 전략. 테스트는 `fetch` mock 주입으로 벤더 스펙
확정 전에도 regression 가능.

### D6. test-golden 에 별도 step 추가 안 함 — step 8/12 가 이미 패키지 전체 러너

`pnpm -F @geny/ai-adapter-core test` 가 `dist-test/tests/**/*.test.js` 를 positional glob 으로
돌리므로, 새 테스트 파일(route-with-fallback.test.ts, http-sdxl.test.ts, http-flux-fill.test.ts)
은 step 8/12 에 자동으로 포함된다. 불필요하게 step 수를 늘리면 로그만 길어짐.

근거: 세션 25 `ai-adapters-fallback` 도 단일 step 에 11+11+9 테스트 다 돌린다. 회귀 단위는
"패키지" 가 자연스럽다.

## 4. 검증 로그

```bash
$ pnpm -F @geny/ai-adapter-core test
ℹ tests 37  pass 37  fail 0

$ pnpm -F @geny/ai-adapters-fallback test
ℹ tests 53  pass 53  fail 0

$ pnpm run test:golden
… 14 steps … ✅ all steps pass
```

세션 25 → 28 증분:
- ai-adapter-core: 23 → 37 (+14 routeWithFallback)
- ai-adapters-fallback: 31 → 53 (+22, SDXL HTTP 13 + Flux-Fill HTTP 9)

## 5. 위험·후속

- **HTTP 바디 포맷 가정**: 실 SDXL/Flux-Fill 벤더 API 스펙과 다를 수 있음. 세션 30 "AI 4차" 에서
  실 벤더 계약 확정 시 `toVendorRequest`/응답 파싱만 교체 (adapter/router/provenance 무영향).
- **Safety filter 실 구현 없음**: `NoopSafetyFilter` 만 제공. 실제 필터는 이미지 분석 서비스
  (Cloud Vision Safe Search, 자체 모델) 필요 — `SafetyFilter.check()` 구현만 주입하면 됨.
- **attempts 트레이스의 provenance 연결**: 현재 `routeWithFallback` 이 `attempts[]` 를 돌려주지만,
  `buildProvenancePartEntry` 에 이어 쓰는 회귀는 아직 없음. 세션 30 에서 round-trip 추가 예정.
- **캐시 공유**: `InMemoryAdapterCache` 는 단일 프로세스. 분산 환경은 Redis 등 외부 스토리지로
  교체 (`AdapterCache` 인터페이스 구현). orchestrator 배포 전에 필요.

## 6. 다음 세션 예고

세션 29 는 Post-Processing Stage 3 (color normalize) skeleton — per-part 색 통계 + 목표 색 재맵.
docs/06 §6 의 결정론적 경로만 먼저. 세션 30 은 `adapters.yaml` 카탈로그 + orchestrator 진입점 +
provenance `attempts[]` round-trip. `progress/INDEX.md §8` 참조.
