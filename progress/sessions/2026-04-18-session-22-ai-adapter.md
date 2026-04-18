# 세션 22 — AI 어댑터 계약 + nano-banana skeleton

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 22
- 워크스트림: **AI Generation** (docs/14 §9 — `⚪ 미착수` → `🟡 skeleton`)
- 로드맵: Foundation `docs/14 §3`, 다음 3세션 예고 (`progress/INDEX.md §8`) 의 (a) 항목 — "nano-banana AI adapter skeleton"

## 1. 목표

docs/05 AI Generation Pipeline 의 계약을 데이터로 고정하고, 첫 어댑터(nano-banana) 의 skeleton 을 돌려 provenance `ai_generated` 경로가 실제로 동작함을 증명한다.

세션 14 에서 열어둔 "AI 생성물 감사 경로" 의 최종 소비자를 이제 완성:

```
NanoBananaAdapter.generate(task) → GenerationResult
    ↓ buildProvenancePartEntry(task, result)
provenance.parts[].ai_generated           ← schema/v1/provenance.schema.json
    ↓ sign (Ed25519 fixture key)
    ↓ @geny/license-verifier.verifyProvenance(registry)
    ✅ pass
```

## 2. 산출물 체크리스트

- [x] `schema/v1/ai-adapter-task.schema.json` — docs/05 §2.2 GenerationTask 입력 계약 (prompt/mask/seed/budget/idempotency/capability_required)
- [x] `schema/v1/ai-adapter-result.schema.json` — docs/05 §2.2 GenerationResult 출력 계약 (image_sha256/vendor/seed/prompt_sha256/cost/latency)
- [x] `samples/ai-adapters/hair_front.task.json` · `.result.json` — 결정론적 Mock 출력을 박아둔 1쌍 fixture
- [x] `@geny/ai-adapter-core` v0.1.0 — `AIAdapter`/`AdapterRegistry`/`AdapterError`/`deterministicSeed`/`promptSha256`/`buildProvenancePartEntry` (14 tests)
- [x] `@geny/ai-adapter-nano-banana` v0.1.0 — `NanoBananaAdapter` + `MockNanoBananaClient` + `NanoBananaClient` 교체 지점 (11 tests, 그 중 1 건이 license-verifier 서명/검증 round-trip)
- [x] `scripts/validate-schemas.mjs` — ai-adapter-task/result validator + task↔result 쌍 cross-check (checked 134 → 136)
- [x] `scripts/test-golden.mjs` — step 8 `ai-adapter-core tests`, step 9 `ai-adapter-nano-banana tests` (총 9 step)
- [x] `schema/README.md` — 신규 2 스키마 엔트리 추가
- [x] `progress/INDEX.md` — 세션 22 row + AI Generation stream `⚪ → 🟡` + §8 다음 세션 재정렬

## 3. 설계 결정 (D1–D7)

### D1. 이미지 원문은 스키마 밖, 해시만 계약에 포함

`GenerationTask.reference_image_sha256` · `GenerationResult.image_sha256` 등 모든 픽셀 데이터는 별도 저장소(S3 예정) 의 sha256 만 교환한다. JSON Schema 가 이미지 바이너리를 끌어안지 않도록 함 — 번들 포맷(docs/11) 과 동일 원칙.

### D2. 시드는 "null 이면 idempotency_key 에서 도출"

docs/05 §7.1: 같은 idempotency_key → 같은 결과. `seed=null` 이 흔하므로 어댑터가 `deterministicSeed(key)` 로 도출하고 **실제 사용한 시드를 result 에 반드시 기록**. provenance 는 result.seed 를 그대로 복사하므로 재현 가능.

### D3. 벤더 에러 → 9 코드로 축약 (`AdapterError`)

`CAPABILITY_MISMATCH` / `BUDGET_EXCEEDED` / `DEADLINE_EXCEEDED` / `UNSAFE_CONTENT` / `VENDOR_ERROR_4XX` / `VENDOR_ERROR_5XX` / `INVALID_OUTPUT` / `PROBE_FAILED` / `NO_ELIGIBLE_ADAPTER`. 라우터는 `retryable` (5XX/DEADLINE/PROBE) 판정만으로 폴백 결정. 세션 23+ 에서 벤더 HTTP 구현이 나오면 에러 매핑 테이블을 각 어댑터 내부에 고정한다.

### D4. `AdapterRegistry.route()` 정렬 키는 결정론적

`(routing_weight desc, estimate_cost asc, name asc)` — 테스트에서 순서가 바뀌지 않는다. 프로덕션 라우팅(벤더 헬스/쿼터/사용자 등급) 은 세션 23+ 에서 이 기본 정렬 위에 덧붙인다. 지금 단계는 "capability + budget + deterministic" 으로 충분.

### D5. nano-banana 어댑터는 `NanoBananaClient` 를 생성자 주입

Mock 과 실제 HTTP 구현을 같은 인터페이스 뒤에 둔다. 테스트는 `MockNanoBananaClient` 로 네트워크 없이 돌리고, 프로덕션 전환 시 어댑터 본체 코드 변경 `0 LOC`. docs/05 §12 "벤더 추가 가이드" 에 정확히 대응.

### D6. Provenance 엔트리 빌더는 core 에 — 어댑터 독립

`buildProvenancePartEntry(task, result)` 는 `@geny/ai-adapter-core` 에 두어 SDXL/Flux-Fill 등 모든 미래 어댑터가 같은 helper 를 쓰도록 강제. 슬롯/태스크 불일치를 throw 해 provenance 위조를 차단.

### D7. round-trip 테스트로 "계약 → 서명 → 검증" 3단 보장

`ai-adapter-nano-banana/tests/provenance-roundtrip.test.ts` 는:
1. `NanoBananaAdapter.generate(task)` 로 결과 생성
2. `buildProvenancePartEntry` 로 aria 샘플 provenance 의 `hair_front` 엔트리 교체
3. RFC 8032 Test 1 fixture 키로 재서명
4. `@geny/license-verifier.verifyProvenance` 로 검증

이 경로 하나가 세션 14(스키마) / 세션 21(검증기) / 세션 22(어댑터) 를 end-to-end 연결한다. 앞으로 다른 어댑터가 등장해도 이 round-trip 을 통과해야 합류 허용.

## 4. 검증 로그

```
$ pnpm run test:golden
[golden] ▶ validate-schemas          ✔   (checked=136)
[golden] ▶ exporter-core tests        ✔
[golden] ▶ bundle golden diff          ✔
[golden] ▶ avatar bundle golden diff   ✔
[golden] ▶ web-avatar bundle golden diff ✔
[golden] ▶ web-preview e2e             ✔
[golden] ▶ license-verifier tests      ✔  (18 tests)
[golden] ▶ ai-adapter-core tests       ✔  (14 tests)
[golden] ▶ ai-adapter-nano-banana tests ✔  (11 tests, incl. round-trip)
[golden] ✅ all steps pass
```

Fixture sha 계산 (validation cross-check 대상):

```
idem-hair-front-sample → seed 715659833
prompt "aria hair_front test" → prompt_sha256 9f9f46cd…1f37
MockNanoBananaClient invoke → image_sha256 3817a9e9…f7d6
```

## 5. 교차 레퍼런스

- docs/05 §2.2 (Adapter interface) · §7.1 (재현 보증) · §8 (라우팅) · §12 (벤더 추가 가이드) · §13.1 (capability matrix test)
- docs/11 §9.2 provenance `ai_generated` 엔트리 규약 — `vendor`/`model_version`/`seed`/`prompt_sha256` 4필드가 본 계약의 결과물임
- 세션 14 — license/provenance 스키마 정립
- 세션 21 — `@geny/license-verifier` (이 세션 round-trip 의 검증자)
- 세션 23+ 에서 확장: (a) SDXL/Flux-Fill 어댑터 추가 (b) 실제 HTTP nano-banana client (c) 캐시/쿼터/헬스 라우터

## 6. 다음 3세션 재정렬

`progress/INDEX.md §8` 업데이트:

- **세션 23**: happy-dom/jsdom 기반 `<geny-avatar>` DOM lifecycle 테스트 — Exit #1 "실 DOM" 공백.
- **세션 24**: Observability Helm chart — Exit #3 실 배포.
- **세션 25**: rig 확장 (v1.3 body) 또는 Post-Processing Stage 1 (alpha cleanup) skeleton.
