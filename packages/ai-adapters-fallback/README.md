# @geny/ai-adapters-fallback

docs/05 §2.3 폴백 AI 어댑터 skeleton.

nano-banana 가 5xx/DEADLINE 으로 실패하면 `AdapterRegistry.route()` 가 다음 후보로 내려가며, 이
패키지가 그 "다음 후보" 를 제공한다. 세션 25 까지는 Mock 클라이언트 로만 검증 — 실제 HTTP 는
세션 26+.

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

31 tests (SDXL 11 + Flux-Fill 11 + Router 9) — 전부 Mock 기반이라 네트워크 불필요.

## Mock vs 실제 HTTP

- Foundation 단계: `SDXLMockClient`/`FluxFillMockClient` 가 `sha256(vendor|seed|...)` 로 결정적 이미지 해시를 반환
- 세션 26+: `HttpSDXLClient`/`HttpFluxFillClient` 을 추가하고 `routeWithFallback()` 헬퍼로 5xx 폴백 체인을 묶는다 (HttpNanoBananaClient 와 같은 에러 매핑 규칙 사용)

## 주의

- `flux-fill` 은 `reference_image_sha256` 과 `mask_sha256` 이 모두 필요하며, 둘 중 하나라도 없으면 `CAPABILITY_MISMATCH` 로 실패
- `sdxl` 은 mask 를 지원하지 않으므로, mask 필요 작업에서 nano-banana 가 실패하면 flux-fill 하나만 남는다 — 그것도 실패하면 `NO_ELIGIBLE_ADAPTER`
