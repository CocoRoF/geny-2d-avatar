# Session 42 — `@geny/orchestrator-service` HTTP 팩토리 주입

- 날짜: 2026-04-19
- 스트림: AI Generation · Platform/Infra
- 선행: 세션 25 (`HttpNanoBananaClient` 도입) · 28 (`HttpSDXLClient`/`HttpFluxFillClient` 대칭) · 30 (adapter-catalog + `buildRegistryFromCatalog`) · 39 (`@geny/orchestrator-service` Mock bootstrap)
- 후속: 세션 43 (ADR 0005+) · 44 (`apps/worker-generate/` skeleton)

## 1. 왜 이번 세션을 열었는가

세션 39 에서 `@geny/orchestrator-service` 를 도입할 때 실제 HTTP 벤더 교체는 **"호출자가 `factories` 를 부분 override 하면 된다"** 는 가능성으로 남겼다. 가능성은 열려 있었지만 실제 HTTP 팩토리를 빌드해 본 세션이 없었고, 이 경로를 실제로 시도하는 순간 숨어 있던 버그가 드러났다:

`HttpNanoBananaClient.modelVersion` 는 **두 가지 역할을 동시에 맡고 있었다**:
1. `adapter.meta.version` 으로 노출 → `buildRegistryFromCatalog` 의 strict 매치용(카탈로그 `entry.version` 과 같아야 함 — "0.1.0").
2. 벤더 HTTP 요청 body 의 `model` 필드 값 → 벤더가 기대하는 실제 API 모델 식별자("gemini-2.5-flash-image").

이 두 개는 근본적으로 다른 식별자다. 팩토리에서 레지스트리 매치를 위해 `modelVersion: entry.version` 을 주입하는 순간 벤더 request 바디의 `model` 이 "0.1.0" 으로 덮어써져 실제 API 는 바로 4xx 를 낼 것이다. Mock 클라이언트는 네트워크에 내보내지 않으니 이 버그를 숨긴 채 통과했다.

→ HTTP 팩토리 주입을 **실사용 수준으로** 올리려면 이 두 역할을 분리해야 한다.

## 2. 산출물

### 2.1 HTTP 클라이언트 3종: `apiModel` 분리

세 HTTP 클라이언트 모두 동일한 패턴으로 옵션 추가:

```ts
export interface HttpNanoBananaClientOptions {
  endpoint: string;
  apiKey: string;
  modelVersion?: string;   // 어댑터 계약(카탈로그) 버전 — adapter.meta.version 으로 노출
  apiModel?: string;       // 벤더 API 의 실제 모델 식별자 — request body 의 `model` 필드
  costPerCallUsd?: number;
  fetch?: typeof fetch;
  defaultTimeoutMs?: number;
}
```

- `apiModel` 생략 시 `modelVersion` 으로 폴백(backward compat — 기존 직접 생성자 호출 테스트는 무수정).
- 구현: 생성자에서 `this.apiModel = opts.apiModel ?? this.modelVersion`; `toVendorRequest(req, this.apiModel)` 로 HTTP 바디 구성.
- 같은 수정: `http-client.ts`(nano-banana) / `http-sdxl-client.ts` / `http-flux-fill-client.ts`.

### 2.2 `createHttpAdapterFactories(catalog, { apiKeys, fetch? })`

```ts
export function createHttpAdapterFactories(
  catalog: AdapterCatalog,
  opts: { apiKeys: Record<string, string>; fetch?: typeof fetch },
): Record<string, AdapterFactory>;
```

동작:
- 카탈로그 엔트리 루프 — 각 엔트리 `e` 에 대해:
  - `opts.apiKeys[e.name]` 없거나 `e.config.endpoint` 없으면 skip (결과에서 제외).
  - name 이 `nano-banana`/`sdxl`/`flux-fill` 이면 해당 HTTP 클라이언트 + Adapter 빌드.
  - `modelVersion: e.version` (레지스트리 매치) + `apiModel: e.config.model` (벤더 wire) + `defaultTimeoutMs: e.config.timeout_ms` + `costPerCallUsd: e.cost_per_call_usd`.
- 명시하지 않은 name 은 조용히 skip — 새 벤더를 카탈로그에 추가해도 팩토리는 **명시적으로** 확장해야 등록. "데이터가 있으면 코드가 알아서" 는 하지 않는다.

### 2.3 `loadApiKeysFromCatalogEnv(catalog, env?)`

```ts
export function loadApiKeysFromCatalogEnv(
  catalog: AdapterCatalog,
  env: NodeJS.ProcessEnv = process.env,
): Record<string, string>;
```

- 카탈로그 각 엔트리의 `config.api_key_env` 가 가리키는 env 변수에서 키 수집.
- env 에 없거나 빈 문자열이면 그 어댑터는 결과 맵에 포함되지 않음 → Mock 으로 폴백.
- 테스트용으로 `env` 주입 가능 (`process.env` 는 기본값).

### 2.4 CLI `--http` 플래그

`services/orchestrator/src/main.ts`:

```
node dist/main.js --port 9090 --http [--catalog path]
```

동작:
1. 카탈로그 파싱.
2. `--http` 없으면 Mock 만 사용(세션 39 기본 동작 유지).
3. `--http` 있으면:
   - `loadApiKeysFromCatalogEnv(catalog)` 로 env 수집.
   - `createHttpAdapterFactories(catalog, { apiKeys })` 로 HTTP 팩토리 구성.
   - `{ ...createMockAdapterFactories(), ...httpFactories }` — HTTP 가 있는 어댑터는 덮어쓰고, 없는 어댑터는 Mock 그대로.
4. 기동 로그: `HTTP: [nano-banana] / Mock: 나머지` — 운영자가 어느 벤더로 실제 트래픽이 나가는지 즉시 확인.

### 2.5 테스트 5종 신규 — 총 12 tests

| 테스트 | 검증 |
|---|---|
| `loadApiKeysFromCatalogEnv` | env 에 있는 키만 수집, 없거나 빈 문자열 skip |
| `createHttpAdapterFactories: apiKeys 에 있는 어댑터만 빌드` | nano/flux-fill 키만 주면 결과 맵은 그 둘만 |
| `createHttpAdapterFactories: orchestrate e2e` | 주입된 fakeFetch 로 실제 HTTP 경로 → `outcome.result.image_sha256` 일치 + **request body 의 `model=gemini-2.5-flash-image` 확인** (apiModel 분리 증명) |
| `partial override` | SDXL 만 HTTP, 나머지는 Mock 으로 병합해 3 어댑터 모두 등록 |
| `apiKey 없으면 skip` | 빈 `apiKeys` → 빈 object 반환 |

세션 39 의 기존 7 tests 는 무수정.

### 2.6 `progress/INDEX.md`

- §3 AI Generation: 세션 42 추가, `apiModel` 분리 명시, orchestrator-service 에 HTTP 팩토리 주입 문구 추가, tests 7→12.
- §3 Platform/Infra: step 17 orchestrator-service 7→12 tests + HTTP 팩토리 문구.
- §4: 세션 42 row (chronological).
- §6: step 17 헤더 bump 12 tests + `apiModel` 분리 언급.
- §8: 세션 42 제거, 43/44 유지(44 는 worker skeleton 으로 확정), 45 신규(Exit #1 브라우저 자동화).

## 3. 설계 결정

### D1. `apiModel` 을 신규 옵션으로 추가 — 기존 `modelVersion` 재해석하지 않음

두 가지 선택지:

(a) `modelVersion` 의 의미를 "벤더 wire model 에만 쓴다" 로 좁히고, 카탈로그 매치용으론 별도 필드(e.g. `contractVersion`) 를 추가.
(b) `modelVersion` 을 그대로 "어댑터 계약 버전" 으로 두고, 벤더 wire 용으로 **`apiModel` 을 추가**.

(b) 를 택한 이유:
- `adapter.meta.version = client.modelVersion` 관계(어댑터 본체에서 이미 코드로 고정됨)가 이미 (b) 방향 — `modelVersion` 을 "어댑터 버전" 으로 읽는 게 자연스럽다.
- 기존 tests/README 가 `modelVersion` 을 "Foundation skeleton의 계약 버전"으로 해석하는 문장을 이미 쓰고 있음.
- `apiModel` 생략 시 폴백이 `modelVersion` → 기존 HTTP 클라이언트 직접 사용 경로(`new HttpNanoBananaClient({ endpoint, apiKey })` 같은 축소형) 가 테스트에서 여전히 작동.

### D2. 카탈로그 `config.*` 를 팩토리 빌드의 유일한 데이터 소스로

`createHttpAdapterFactories` 는 `opts` 로 apiKeys/fetch 만 받고, 나머지(endpoint, model, timeout, cost) 는 **전부 카탈로그에서 읽는다**. 이유:

- 운영 시 endpoint 교체는 카탈로그 파일만 고치면 되는 흐름이 바람직 (코드 재배포 X).
- CLI `--http` 와 library 사용 모두 동일한 카탈로그 진실 소스를 쓰도록 강제 — 두 경로가 서로 다른 값을 읽는 일이 없음.
- 비밀(apiKey) 은 env 에서, 나머지는 카탈로그에서 — docs/05 §12.6 의 "비밀은 env 변수 참조키만 둔다" 원칙과 정렬.

### D3. apiKey 없는 어댑터는 결과 맵에 포함하지 않음 — 호출자가 Mock 과 명시적 병합

대안: HTTP 팩토리가 "apiKey 없으면 내부적으로 Mock 으로 폴백". 거부한 이유:

- 호출자가 어느 어댑터가 HTTP 인지/Mock 인지 **코드에서 또는 기동 로그에서 보이지 않게** 된다. 운영 모호성.
- 팩토리 함수의 계약이 "HTTP 팩토리만 반환" → 호출자는 `...spread` 로 Mock 위에 덮어쓰기만 하면 되며, 덮어쓰인 name 이 무엇인지는 `Object.keys(httpFactories)` 로 바로 확인 가능.
- 기동 로그에 `HTTP: [nano-banana, sdxl] / Mock: 나머지` 식으로 출력 가능 — 확신성.

### D4. 새 벤더 name 은 조용히 skip — 에러 throw 하지 않음

`if (entry.name === "nano-banana") ... else if (sdxl) ... else if (flux-fill) ...` 체인을 else throw 로 닫지 않았다. 이유:

- 카탈로그에 새 벤더가 추가되고 HTTP 팩토리 코드 업데이트가 아직 안 된 상황에서, Mock 팩토리는 카탈로그 new entry 를 커버할 수 있어야 서비스가 계속 뜬다.
- 예를 들어 카탈로그에 `dall-e-3` 가 추가되고 `createMockAdapterFactories` 에도 그 이름이 있으면, `--http` 모드에서도 해당 어댑터는 Mock 으로 폴백(HTTP 팩토리 쪽에서 지원 안 되니) — 서비스 전체가 죽지 않음.
- 진짜 확성이 필요하면 `buildRegistryFromCatalog` 가 이미 "카탈로그 엔트리에 대응하는 factory 없음" 을 throw 한다 — 이중 가드 불필요.

### D5. `fetch` 주입은 팩토리 옵션 한 곳에서 — 클라이언트별로 따로 받지 않음

테스트에서 3 개 HTTP 클라이언트 모두에 동일한 fakeFetch 를 주입하고 싶을 때, `createHttpAdapterFactories(catalog, { apiKeys, fetch: fakeFetch })` 한 번으로 전 벤더 커버. 클라이언트별로 다른 fetch 가 필요한 시나리오는 Foundation 범위에 없음 — 필요해지면 `{ fetchByAdapter: Record<string, typeof fetch> }` 로 확장.

## 4. 검증

- `pnpm --filter @geny/orchestrator-service run test` — 12 tests 전부 pass (~140ms).
- `pnpm run test:golden` — **18 step 전부 pass**. step 17 만 7→12 tests 로 확장.
- HTTP e2e 테스트가 request body 의 `model` 필드를 직접 assert — `apiModel` 분리가 실제로 벤더에 올바른 모델명을 보낸다는 것을 증명. (`modelVersion` 분리 전이었으면 `model: "0.1.0"` 이 나와 이 단언이 실패했을 것.)

## 5. 남은 항목

- HttpNanoBananaClient/HttpSDXLClient/HttpFluxFillClient 각각에 현재 `apiModel` 단독 주입 테스트는 없음 — 팩토리 e2e 테스트가 간접 커버. 필요해지면 각 패키지의 http-client 테스트에 `apiModel` specific 1 개씩 추가.
- `--http` 로 기동 후 실제 나노바나나 HTTP 에 쏴보는 수동 pass-through 는 endpoint + key 가 생기면 그때. Foundation 단계 Exit 게이트에는 포함되지 않음(체크리스트는 브라우저 경로만 남음).
- 다음 consumer 는 worker skeleton(세션 44). `@geny/orchestrator-service` 가 라이브러리 수준의 wiring 을 이미 제공하므로, worker 는 큐 → `service.orchestrate(task)` 체인만 얇게 잇는다.

## 6. 다음 단계

§8 roadmap:
- **세션 43**: ADR 0005+ — physics-lint + migrator auto-patch 경계 명문화.
- **세션 44**: `apps/worker-generate/` skeleton (큐 → `createOrchestratorService` binding).
- **세션 45**: Foundation Exit #1 E 단계 자동화.
