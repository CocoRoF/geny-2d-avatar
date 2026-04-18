# @geny/ai-adapters-fallback

docs/05 §2.3 폴백 AI 어댑터 skeleton.

nano-banana 가 5xx/DEADLINE 으로 실패하면 `AdapterRegistry.route()` 가 다음 후보로 내려가며, 이
패키지가 그 "다음 후보" 를 제공한다. 세션 28 부터 실제 HTTP 클라이언트 (`HttpSDXLClient` /
`HttpFluxFillClient`) 를 함께 제공 — 라우팅/폴백/캐시/안전 필터 오케스트레이션은
`@geny/ai-adapter-core` 의 `routeWithFallback()` 이 담당.

## 어댑터

| 어댑터       | capability           | routing_weight | cost (base)  | 용도                                         |
| ------------ | -------------------- | -------------: | -----------: | -------------------------------------------- |
| `sdxl`       | `edit`, `style_ref`  | 80             | $0.008/call  | nano-banana edit/style_ref 의 2차 후보       |
| `flux-fill`  | `mask`               | 70             | $0.012/call  | nano-banana mask 의 유일한 폴백              |
| `nano-banana`| `edit/style_ref/mask`| 100            | $0.015/call  | 동일 capability 시 항상 1순위 (다른 패키지)  |

routing 정렬은 `(routing_weight desc, estimate_cost asc, name asc)` — deterministic.

## 라우팅 폴백 순서

```
capability=[edit]         → [nano-banana(100), sdxl(80)]
capability=[style_ref]    → [nano-banana(100), sdxl(80)]
capability=[mask]         → [nano-banana(100), flux-fill(70)]   // sdxl 제외
capability=[edit, mask]   → [nano-banana(100)]                  // sdxl/flux-fill 둘 다 부족
capability=[upscale]      → NO_ELIGIBLE_ADAPTER
```

## 검증

```bash
pnpm -F @geny/ai-adapter-core build
pnpm -F @geny/ai-adapter-nano-banana build
pnpm -F @geny/ai-adapters-fallback test
```

53 tests (Mock SDXL 11 + Mock Flux-Fill 11 + Router 9 + HttpSDXLClient 13 + HttpFluxFillClient 9).
Mock 테스트는 네트워크 없이, HTTP 테스트는 `fetch` mock 주입으로 전부 오프라인에서 돈다.

## Mock vs 실제 HTTP

- Foundation 단계 Mock: `SDXLMockClient`/`FluxFillMockClient` 가 `sha256(vendor|seed|...)` 로 결정적 이미지 해시를 반환. 테스트/로컬 개발용.
- 실제 HTTP: `HttpSDXLClient({ endpoint, apiKey, fetch? })` / `HttpFluxFillClient({ endpoint, apiKey, fetch? })`. 에러 매핑 규칙은 `HttpNanoBananaClient` 와 대칭:
  - HTTP 5xx → `VENDOR_ERROR_5XX` (retryable, 폴백 허용)
  - HTTP 4xx → `VENDOR_ERROR_4XX` (non-retryable, 폴백 금지)
  - AbortError / timeout → `DEADLINE_EXCEEDED`
  - 비(非) JSON / 잘못된 sha / 잘못된 bbox → `INVALID_OUTPUT`
- 벤더 API 스펙이 확정되면 `toVendorRequest` 와 응답 파싱 부분만 교체. 어댑터 본체·라우터·provenance 는 재작성 불필요.

## `routeWithFallback()` 통합

`@geny/ai-adapter-core` 의 `routeWithFallback()` 헬퍼가 이 패키지의 어댑터들을 아래와 같이 묶어 쓴다:

```ts
const registry = new AdapterRegistry();
registry.register(new NanoBananaAdapter({ client: new HttpNanoBananaClient({...}) }));
registry.register(new SDXLAdapter({ client: new HttpSDXLClient({...}) }));
registry.register(new FluxFillAdapter({ client: new HttpFluxFillClient({...}) }));

const out = await routeWithFallback(registry, task, { cache, safety });
```

nano-banana 가 5xx 로 실패하면 자동으로 SDXL/Flux-Fill 로 내려간다. 4xx (예: 입력 스키마 위반) 는
폴백하지 않고 즉시 throw — 다른 벤더도 같은 입력을 같은 방식으로 거부할 것이기 때문.

## 주의

- `flux-fill` 은 `reference_image_sha256` 과 `mask_sha256` 이 모두 필요하며, 둘 중 하나라도 없으면 `CAPABILITY_MISMATCH` 로 실패
- `sdxl` 은 mask 를 지원하지 않으므로, mask 필요 작업에서 nano-banana 가 실패하면 flux-fill 하나만 남는다 — 그것도 실패하면 `NO_ELIGIBLE_ADAPTER`
