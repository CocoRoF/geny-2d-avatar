# 세션 30 — AI 어댑터 4차 (adapter catalog + orchestrator + provenance attempts)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 30
- 워크스트림: **AI Generation** (`docs/14 §9`) — 4차 skeleton
- 로드맵: docs/05 §12.6 (adapter catalog) + §8.1 (fallback orchestrator) + provenance `parts[]` round-trip · `progress/INDEX.md §8` 세션 30 예고

## 1. 목표

세션 22/25/28 까지 "어댑터 하나" 를 HTTP 로 부르는 길은 만들었다. 남은 2가지가 있다:

1. **"어느 어댑터들이 이 배포에서 쓰일 수 있는가"** 를 선언적으로 박제. `AdapterRegistry.register()`
   는 코드에 하드코딩되어 있어서, 새 벤더 붙일 때마다 부팅 로직을 바꿔야 했다. 운영 환경에서
   토글(A/B, disable) 하려면 JSON 으로 분리.
2. **"한 slot 에 대해 어댑터 고르기 → 호출 → provenance 남기기"** 를 하나의 진입점으로. 지금은
   `routeWithFallback()` 결과에서 호출측이 직접 `buildProvenancePartEntry()` 를 돌려야 했고,
   폴백이 일어났을 때 `attempts[]` 가 provenance 에 남지 않았다 — 이게 사후 감사 빈 공간.

이번 세션은 docs/05 §12.6 을 스펙 대로 박제. YAML 대신 JSON 선택(ADR 0002 schema-first — js-yaml
의존성을 들일 이유가 없음, `infra/adapters/adapters.json` 이 adapter-catalog.schema.json 으로
직접 Ajv 검증 가능).

```
infra/adapters/adapters.json       ← "무엇을" (JSON, 스키마 강제)
       +
{ "nano-banana": (entry) => new NanoBananaAdapter({...}), ... }   ← "어떻게" (코드, 비밀 주입)
       ↓  parseAdapterCatalog → buildRegistryFromCatalog
       ↓
orchestrate(task, { catalog, factories, cache?, safety? })
       ↓  routeWithFallback → attempts[] 누적
       ↓  buildProvenancePartEntry(task, result, { attempts })
       ↓
provenance.parts[].ai_generated  (attempts 포함, license-verifier round-trip 여전히 통과)
```

## 2. 산출물 체크리스트

- [x] `schema/v1/adapter-catalog.schema.json` — `schema_version=v1` + `adapters[]` (name pattern `^[a-z][a-z0-9-]{1,63}$`, semver, capability enum = docs/05 §4, cost/max_parallel/routing_weight 범위 가드, `config.api_key_env` 만 허용 — 비밀은 env 이름만 JSON 에, 값은 코드 주입).
- [x] `infra/adapters/adapters.json` — 3 엔트리 (`nano-banana` rw=100 / `sdxl` rw=80 / `flux-fill` rw=70). routing_weight 내림차순 선언 = 라우터 의도 명확.
- [x] `packages/ai-adapter-core/src/catalog.ts` — `parseAdapterCatalog(raw)` (schema_version 가드 · 빈 배열 throw · 중복 `name@version` throw · capability enum · enabled 기본 true) + `buildRegistryFromCatalog(catalog, factories)` (enabled=true 만 register, factory 미제공 throw, factory 가 돌려준 meta 가 entry 와 다르면 throw) + `entryToMeta(entry)`.
- [x] `packages/ai-adapter-core/src/orchestrator.ts` — `orchestrate(task, { catalog, factories, cache?, safety?, maxAttempts?, registry? })` → `OrchestrateOutcome { primary, used, attempts, result, cached, provenance }`. `catalog+factories` 또는 `registry` 중 하나만 주면 됨. 반환된 `provenance` 는 `schema/v1/provenance.schema.json` 의 `parts[].ai_generated` 로 그대로 삽입 가능.
- [x] `packages/ai-adapter-core/src/provenance.ts` — `ProvenancePartAttempt { adapter, model_version, ok, error_code?, error_message? }` 타입 + `buildProvenancePartEntry(task, result, opts={ attempts? })` — attempts 배열이 비어있으면 필드 자체 생략 (캐시 hit 시 깔끔). `error_message` 는 512 자 truncate.
- [x] `packages/ai-adapter-core/src/index.ts` — `parseAdapterCatalog`, `buildRegistryFromCatalog`, `entryToMeta`, `orchestrate`, `OrchestrateOptions`, `OrchestrateOutcome`, `AdapterCatalog`, `AdapterCatalogEntry`, `AdapterCatalogConfig`, `AdapterFactory`, `ProvenancePartAttempt`, `ProvenancePartOptions` 재노출.
- [x] `schema/v1/provenance.schema.json` — `parts[]` item 에 optional `attempts[]` (maxItems 16) 확장. 기존 샘플들 (preset/uploaded) 은 그대로 통과.
- [x] `samples/avatars/sample-01-aria.provenance.json` — hair_front 에 `attempts: [{adapter: nano-banana, ok: false, error_code: VENDOR_ERROR_5XX}, {adapter: sdxl, ok: true}]` 기록 + `scripts/sign-fixture.mjs` 로 재서명.
- [x] `scripts/validate-schemas.mjs` — section 8 `adapter-catalog` 단독 검증 + name@version 유일성 교차 확인. 전체 checked 130→137.
- [x] `packages/ai-adapter-core/tests/catalog.test.ts` — 9 tests (정상 JSON / schema_version 오류 / 빈 배열 / 중복 / 잘못된 capability / canonical `infra/adapters/adapters.json` 파싱 + rw 내림차순 / enabled=false 필터 / factory 누락 throw / factory meta 불일치 throw).
- [x] `packages/ai-adapter-core/tests/orchestrator.test.ts` — 6 tests (1차 성공 attempts=[ok] / 1차 5xx → 2차 성공 attempts=[fail,ok] + used=sdxl / 4xx 즉시 throw / 캐시 hit → cached=true + attempts 필드 생략 + vendor 복원 / 모든 후보 5xx → rethrow / `maxAttempts=1` 폴백 금지).
- [x] `scripts/test-golden.mjs` — step 8 헤더 주석 52 tests 반영.
- [x] `packages/ai-adapter-core/README.md` — catalog + `orchestrate()` 섹션 추가 + 사용 예 (catalog → factories → cache → `outcome.provenance` 삽입). 37→52 tests.
- [x] `progress/INDEX.md` — AI Generation 스트림 "1~4차 skeleton" + ai-adapter-core 52 tests + attempts[] 추적. Platform/Infra 세션 30 추가, Data 스키마 21종 + 샘플 변경 기록. Release Gate step 8 52. 세션 30 row in §4. §8 재정렬 (세션 31/32/33).

## 3. Design decisions

### D1 — YAML 대신 JSON 카탈로그
docs/05 §12.6 은 `adapters.yaml` 로 예시를 썼지만, 이 레포는 ADR 0002 "스키마-우선 계약" 을 따른다.
JSON Schema 2020-12 은 YAML 에 바로 Ajv2020 를 붙이기 어렵고, `js-yaml` 의존성을 새로 끌어들이면
부팅 경로에 추가 attack surface 가 생긴다. JSON 으로 두면 `validate-schemas.mjs` 가 그대로 검증
하고, git diff 가 정렬/따옴표 규약을 강제한다. 스펙 문구 해석만 다를 뿐 의도는 동일.

### D2 — Factory 주입: JSON 은 "무엇을", 코드는 "어떻게"
JSON 에 비밀(API key)이나 생성자 로직을 담지 않는다. 엔트리는 `name/version/capability/routing_weight/max_parallel/cost/config`
만 선언하고, 코드에서 `{"nano-banana": (entry) => new NanoBananaAdapter({...})}` 맵을 주입.
- `enabled: false` 는 JSON 만으로 토글 (A/B, 벤더 장애 우회).
- `enabled: true` 인데 factory 가 없으면 **부팅 시 throw**. 운영 시점에 "어댑터가 없다" 로 번지지
  않게 빠르게 실패. factory 가 돌려준 `meta` 가 엔트리와 불일치해도 부팅 시 throw.

### D3 — `orchestrate()` 단일 진입점
호출 측은 task + catalog + factories 만 주면 된다. 내부적으로 `buildRegistryFromCatalog` →
`routeWithFallback` → `buildProvenancePartEntry` 를 이어, `outcome.provenance` 를 곧바로
`provenance.schema.json` 의 `parts[].ai_generated` 로 끼워 넣을 수 있다. `cached: true` 면
`attempts: []` → provenance 에는 해당 필드 자체가 생략 (캐시 hit 인데 `[]` 를 기록하면 의미가
흐려짐). `registry` 를 직접 주입할 수 있는 오버로드도 열어 단위 테스트에서 factory 맵을 우회
가능.

### D4 — provenance `attempts[]` 은 optional, 기존 샘플 호환
`schema/v1/provenance.schema.json` 에 필수로 넣으면 세션 22/29 샘플이 다 깨진다. optional 로
두고 nano-banana 한 번에 성공한 케이스는 기록 생략, 폴백 발생 케이스만 기록. 대신 최대 16
엔트리로 캡 (`maxItems: 16`, 무한 재시도 감지 목적). `error_message` 는 `maxLength: 512` — 벤더
에러 원문을 그대로 담기보다 truncate 해서 provenance 부피 감당.

### D5 — 캐시 키는 primary 어댑터 기준 (기존 유지)
세션 25 에서 정한 invariant 그대로: 캐시 키는 `buildCacheKey()` 로 **primary 어댑터(routing 1순위)**
의 name + model_version 으로 만든다. 폴백이 일어나도 저장 키는 동일 — 다음 호출에서 primary 가
회복되면 캐시 hit 이 되고, 회복 안 되면 또 폴백. orchestrate 의 cache hit 경로에서는 attempts 를
비워서 provenance 가 "이 결과는 과거 호출로부터 나왔음" 을 명확히 표현.

## 4. 검증

```
pnpm -F @geny/ai-adapter-core build   # dist
pnpm -F @geny/ai-adapter-core test    # 52 tests pass
node scripts/validate-schemas.mjs     # ✅ checked=137 (+adapter-catalog)
pnpm run test:golden                  # 14 steps 전부 pass
```

- catalog.test (9): `infra/adapters/adapters.json` 실 파일이 v1 스키마 + pattern 을 만족하고 routing_weight 가 내림차순.
- orchestrator.test (6): 1차 성공 / 폴백 / 4xx 즉시 실패 / 캐시 hit / all-5xx / maxAttempts=1.
- aria provenance: fixture key 로 재서명 → `license-verifier verify` 통과 확인.

## 5. 남겨진 것 / 다음

- **metric hook 미연결** — docs/02 §9 의 `ai_adapter_latency_ms`/`ai_adapter_cost_usd`/`ai_adapter_5xx_total`
  는 orchestrator 내부에서 측정할 지점이 생겼지만 Prometheus exporter 연결은 세션 33 으로 미룸.
  `attempts[]` 가 Grafana "Cost & Quality" 대시보드 패널로 떨어지는 end-to-end 가 그 세션 목표.
- **실 HTTP factory 샘플** — `apps/orchestrator/` 가 아직 없어서 catalog + factories 를 "실서비스에서
  이렇게 묶는다" 는 end-to-end 가 README 예시 수준에 머문다. Pipeline 스트림이 orchestrator 서비스를
  만들 때 합류.
- **rate limit/semaphore** — `max_parallel` 값은 엔트리에 들어있지만 actual throttling 은 orchestrator
  에 아직 없음 (routeWithFallback 은 1 task 씩만 봄). 동시 다수 task 를 받는 진입점이 생길 때 추가.
- **세션 31**: rig v1.3.0 실 저작(물리 9→12 Setting 저작 + `ahoge.spec.json` + deformers).
- **세션 32**: Post-Processing Stage 3 확장 (Lab* + fit-to-palette + atlas emit 통합).

## 6. 커밋

- `feat(ai-adapter): catalog + orchestrator + provenance attempts (세션 30)`
  - `schema/v1/adapter-catalog.schema.json` 신설
  - `infra/adapters/adapters.json` 신설 (nano-banana/sdxl/flux-fill)
  - `@geny/ai-adapter-core`: `catalog.ts` + `orchestrator.ts` + provenance `attempts[]` 옵션
  - `schema/v1/provenance.schema.json` `parts[].attempts[]` optional
  - `samples/avatars/sample-01-aria.provenance.json` 폴백 트레이스 + 재서명
  - `scripts/validate-schemas.mjs` adapter-catalog 단독 검증 (checked=137)
  - `scripts/test-golden.mjs` step 8 헤더 bump (52 tests)
  - `packages/ai-adapter-core/README.md` catalog/orchestrate 섹션
  - `progress/INDEX.md` (세션 30 row + §8 재정렬)
