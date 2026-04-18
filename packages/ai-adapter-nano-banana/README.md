# @geny/ai-adapter-nano-banana

docs/05 §3 nano-banana(Gemini 2.5 Flash Image) 1차 어댑터 skeleton.

- `NanoBananaAdapter` — `@geny/ai-adapter-core` 의 `AIAdapter` 계약 구현. `capability = {edit, style_ref, mask}`.
- `MockNanoBananaClient` — 네트워크 없이 결정론적 해시를 반환. Foundation 단계 전 테스트 경로.
- `NanoBananaClient` 인터페이스 — 실제 HTTP 구현이 이 인터페이스를 구현하면 어댑터 본체 변경 없이 프로덕션 교체.
- `HttpNanoBananaClient` — Gemini 2.5 Flash Image HTTP 클라이언트 (세션 25). `AbortController` 기반
  deadline, Bearer auth, x-idempotency-key 헤더, 5xx/4xx/Abort/non-JSON/잘못된 sha → `AdapterError`
  매핑 (`VENDOR_ERROR_5XX`/`VENDOR_ERROR_4XX`/`DEADLINE_EXCEEDED`/`INVALID_OUTPUT`). 테스트는 12 건
  — `fetch` 주입으로 네트워크 없이 모든 분기 검증.

## 보장

- **결정론적**: `idempotency_key` 만으로 시드/해시/이미지 결정 — 같은 task 두 번 호출하면 `image_sha256`/`seed`/`prompt_sha256` 동일.
- **예산·타임아웃 준수**: `estimateCost > budget_usd` → `BUDGET_EXCEEDED`, 응답이 `deadline_ms` 초과 시 `DEADLINE_EXCEEDED`.
- **계약 검증**: 벤더 응답의 `image_sha256` 포맷을 검증하고, 실패 시 `INVALID_OUTPUT`.
- **Provenance 연결**: `buildProvenancePartEntry(task, result)` 로 바로 `provenance.schema.json` 의 `ai_generated` 엔트리 생성. round-trip 테스트가 `@geny/license-verifier` 로 서명/검증 통과를 보장.

## 빌드

```bash
pnpm -F @geny/ai-adapter-core build          # 사전 빌드 필수
pnpm -F @geny/ai-adapter-nano-banana test    # 23 tests (capability + provenance + http-client)
```

## 프로덕션 교체 계획

- [x] `HttpNanoBananaClient` — Gemini 2.5 Flash Image HTTP 호출 + 벤더 에러 매핑 (세션 25).
- [x] `SDXLAdapter` + `FluxFillAdapter` 폴백 skeleton — `@geny/ai-adapters-fallback` (세션 25).
- [x] 캐시 레이어 — `buildCacheKey` + `InMemoryAdapterCache` (`@geny/ai-adapter-core`, 세션 25).
- [ ] 안전 필터 + NSFW 재검사 (docs/05 §9, 세션 26+).
- [ ] 라우터 헬퍼: `routeWithFallback(registry, task, { maxAttempts, cache })` — 5xx 시 다음 후보로, 캐시 히트 시 즉시 반환.
