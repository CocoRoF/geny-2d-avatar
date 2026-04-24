# 02 — Golden Step 카탈로그 (`pnpm run test:golden`)

`scripts/test-golden.mjs` 가 실행하는 **30 단계** 의 의도·보장·의존성 색인.

- 각 step 은 **"무엇을 보장하는지"** 한두 문장으로 기록 — 실행 로직이 아니라 불변식(invariant) 을 박는 축.
- Foundation → Runtime 전환 시 step 재배치 / 삭제 / 병합 판단의 기준 문서. "이 step 이 사라지면 어떤 계약이 느슨해지는가" 를 빠르게 확인.
- 진입: `pnpm run test:golden` (루트) 또는 `node scripts/test-golden.mjs`. 한 step 실패 시 non-zero exit + 나머지 step 은 계속 실행(실패 목록 집계).

---

## 0. 분류 (30 = 1 + 3 + 16 + 8 + 2)

| 분류 | 단계 수 | step # |
|---|---|---|
| **스키마 검증** | 1 | 1 |
| **CLI 번들 골든 diff** | 3 | 3·4·5 |
| **패키지 단위 테스트** | 16 | 2·7·8·9·10·12·13·14·15·16·17·19·21·24·25·26 |
| **스크립트·infra 회귀** | 8 | 11·18·20·22·23·28·29·30 |
| **앱 e2e** | 2 | 6·27 |

> **참고**: INDEX `§1 CI 게이트` 의 "11 패키지 테스트 + 5 e2e" 는 초기 표기가 남은 것으로, 현 실제는 16 패키지 / 2 e2e. 본 문서가 현재 상태의 권위(claims) — INDEX 는 다음 메타 점검 세션에서 동기화 후보.

---

## 1. 스키마 검증

### Step 1 — `validate-schemas`

- **보장**: `schema/v1/*.schema.json` 22 종 전부 Ajv 2020 로 compile + rig-templates 5 종 (halfbody v1.0.0~v1.3.0 + fullbody v1.0.0) 의 parts/deformers/parameters/physics/manifest 가 스키마 통과 + samples/avatars 의 license/provenance Ed25519 서명 + bundle.json sha 교차 일치 (`checked=244`).
- **실행**: `node scripts/validate-schemas.mjs`
- **의존성**: 없음 (스키마 파일 + 샘플 데이터만).
- **도입**: 세션 초기. ADR 0002 (schema-first) 의 CI 축.

---

## 2. CLI 번들 골든 diff (byte-equal)

### Step 3 — `bundle golden diff`

- **보장**: `packages/exporter-core/dist/cli.js bundle --template rig-templates/base/halfbody/v1.2.0` 출력 snapshot 이 `packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json` 과 **byte-equal**. Cubism 번들 조립 로직의 결정론.
- **실행**: 임시 디렉터리에 번들 조립 → stdout snapshot 저장 → 골든과 `===` 비교 → 다르면 `tmp/diff.txt` 에 인라인 diff.
- **의존성**: Step 2 (exporter-core 빌드 포함) 가 `dist/cli.js` 를 만들어야 함.
- **도입**: 세션 09 (CLI 분리) / 세션 13 (골든 확정).

### Step 4 — `avatar bundle golden diff`

- **보장**: `exporter-core/dist/cli.js avatar --spec samples/avatars/sample-01-aria.export.json` 가 `samples/avatars/sample-01-aria.bundle.snapshot.json` 과 byte-equal. 아바타 스펙→번들 변환(참조형 아바타, ADR 0004) 의 결정론.
- **실행**: 위와 동일 패턴, CLI 서브커맨드만 `avatar`.
- **의존성**: Step 2 (exporter-core dist). rig-templates + samples.
- **도입**: 세션 11.

### Step 5 — `web-avatar bundle golden diff`

- **보장**: `exporter-core/dist/cli.js web-avatar --template rig-templates/base/halfbody/v1.2.0` 출력이 `halfbody_v1.2.0.web-avatar-bundle.snapshot.json` 과 byte-equal. web-avatar 번들(`parts[]` + `WebAvatarPart` 타입) 포맷 의 결정론.
- **실행**: 위와 동일 패턴, CLI 서브커맨드 `web-avatar`.
- **의존성**: Step 2 (exporter-core dist).
- **도입**: 세션 15. 세션 105 로 halfbody v1.3.0 + fullbody v1.0.0 으로 확장된 파일 4 개 골든도 같은 step 에서 검증.

---

## 3. 패키지 단위 테스트 (16)

### Step 2 — `exporter-core tests`

- **보장**: exporter-core 의 102 tests — Cubism/web-avatar 번들 빌더 + CLI 라우팅 + rig-template 로더 + deformation tree/parameter 계약.
- **실행**: `pnpm -F @geny/exporter-core test` (build 포함).
- **의존성**: 없음 — 최하위 라이브러리.

### Step 7 — `license-verifier tests`

- **보장**: Ed25519 서명 검증 + registry 파서 + tamper/expiry/scope 회귀. ADR 0002 licensing 축의 CI.
- **실행**: `pnpm -F @geny/license-verifier test`.
- **의존성**: 없음.

### Step 8 — `ai-adapter-core tests`

- **보장**: 70 tests — deterministicSeed + promptSha256 + AdapterRegistry + `routeWithFallback` 5xx/4xx/safety/캐시 분기 + SafetyFilter + adapters.json catalog + `orchestrate()` + MetricsHook/InMemoryMetricsRegistry.
- **실행**: `pnpm -F @geny/ai-adapter-core build && pnpm -F @geny/ai-adapter-core test`.
- **의존성**: build 선행 — nano-banana 가 dist/ 를 import.

### Step 9 — `ai-adapter-nano-banana tests`

- **보장**: capability 매트릭스 + BUDGET/CAPABILITY/DEADLINE/INVALID_OUTPUT 에러 매핑 + adapter → provenance → license-verifier round-trip.
- **실행**: `pnpm -F @geny/license-verifier build && pnpm -F @geny/ai-adapter-nano-banana test`.
- **의존성**: license-verifier dist.

### Step 10 — `web-avatar dom lifecycle`

- **보장**: happy-dom 환경에서 `<geny-avatar>` 커스텀 엘리먼트 라이프사이클 (connect/disconnect/attribute/ready/parameterchange/motionstart/expressionchange) + loader.
- **실행**: `pnpm -F @geny/web-avatar test`.
- **의존성**: 없음.

### Step 12 — `ai-adapters-fallback tests`

- **보장**: SDXL + Flux-Fill Mock capability 매트릭스 + AdapterRegistry 통합 폴백 순서(`nano-banana → sdxl → flux-fill`) + HttpSDXLClient/HttpFluxFillClient HTTP 회귀.
- **실행**: `pnpm -F @geny/ai-adapter-nano-banana build && pnpm -F @geny/ai-adapters-fallback test`.
- **의존성**: nano-banana dist (router integration).

### Step 13 — `post-processing tests`

- **보장**: 111 tests — Stage 1 alpha sanitation (premult 라운드트립 + morph-close + feather + UV clip) + Stage 3 color normalize (RGB Reinhard + Lab*) + palette lock (k-means ΔE) + atlas hook.
- **실행**: `pnpm -F @geny/post-processing test`.
- **의존성**: 없음.

### Step 14 — `rig-template migrate tests`

- **보장**: `@geny/migrator` 단위 테스트 8 + CLI shim 3 체인 (v1.0.0→v1.1.0→v1.2.0→v1.3.0) + 결정론. ADR 0005 L1 게이트 축. CLI shim 과 패키지 dist 의 byte-equal 이 전제.
- **실행**: `pnpm -F @geny/migrator build && pnpm -F @geny/migrator test && node scripts/rig-template/migrate.test.mjs`.
- **의존성**: CLI shim 이 `packages/migrator/dist/index.js` 를 dynamic import.

### Step 15 — `metrics-http tests`

- **보장**: Node http `/metrics` + `/healthz` 핸들러 + `createMetricsServer` e2e + HEAD/405/404/query-string 회귀. `cost_usd` success-only 불변식 (세션 85 D7) 의 metric 노출 축.
- **실행**: `pnpm -F @geny/ai-adapter-core build && pnpm -F @geny/metrics-http test`.
- **의존성**: ai-adapter-core dist.

### Step 16 — `exporter-pipeline tests`

- **보장**: PNG decode/encode 라운드트립 + 결정론 + 실 템플릿(halfbody v1.2.0 base.png) e2e + `assembleWebAvatarBundle` textureOverrides 훅 + path 보존 가드.
- **실행**: `pnpm -F @geny/exporter-core build && pnpm -F @geny/post-processing build && pnpm -F @geny/exporter-pipeline test`.
- **의존성**: exporter-core + post-processing dist (NodeNext type import).

### Step 17 — `orchestrator-service tests`

- **보장**: `infra/adapters/adapters.json` 로딩 + Mock 어댑터 3 종 wiring + orchestrate→/metrics registry 반영 + extraMetricsHook chain + HTTP 바인딩 + fallback 라우팅 + `runWebAvatarPipeline` 위임.
- **실행**: 7 개 runtime 워크스페이스 dist 를 **개별 빌드 → 캐시 활용 후** `pnpm -F @geny/orchestrator-service test`.
- **의존성**: ai-adapter-core / -nano-banana / -adapters-fallback / metrics-http / post-processing / exporter-core / exporter-pipeline dist.

### Step 19 — `worker-generate tests`

- **보장**: 45 tests — JobStore FIFO + stop guard + list ordering + HTTP router (POST /jobs 202 · GET /jobs/{id} · 400/415/405/404) + wiring e2e + `createHttpAdapterFactories` 주입(ADR 0005 L4 apiModel 분리).
- **실행**: `pnpm -F @geny/orchestrator-service build && pnpm -F @geny/job-queue-bullmq build && pnpm -F @geny/worker-generate test`.
- **의존성**: orchestrator-service + job-queue-bullmq dist.

### Step 21 — `job-queue-bullmq tests`

- **보장**: 28 tests — `BullMQDriver` 인터페이스 계약 + `createBullMQJobStore` 팩토리 (idempotency_key → jobId 패스스루 + 128-char 경계 + state 매핑 + drain/stop 멱등). 실 bullmq/ioredis 는 `bullmq-integration` lane 에서 검증(본 step 은 mock 경로만).
- **실행**: `pnpm -F @geny/job-queue-bullmq test`.
- **의존성**: ai-adapter-core dist (Step 8 에서 빌드됨).

### Step 24 — `web-editor-logic tests`

- **보장**: 39 tests — `categoryOf` / `categorize` / `parametersForPart` 단일 소스. index.html + e2e-check.mjs + web-editor-renderer 가 모두 이 dist 를 import → 카테고리/파라미터 규칙 drift 구조적 차단.
- **실행**: `pnpm -F @geny/web-editor-logic test`.
- **의존성**: 없음.

### Step 25 — `web-avatar-renderer contracts tests`

- **보장**: 21 tests — 계약 5 타입 + 가드 2 (shape-only, semantic 은 JSON Schema 에 위임) + `Renderer` 베이스 + `createNullRenderer` (6) + `createLoggingRenderer` (5). ADR 0007 Decision 불변 구현체.
- **실행**: `pnpm -F @geny/web-avatar-renderer build && pnpm -F @geny/web-avatar-renderer test` — **build 필수** (downstream web-editor-renderer 가 `dist/*.d.ts` 를 type import).
- **의존성**: 없음.

### Step 26 — `web-editor-renderer tests`

- **보장**: `<geny-avatar>` ready + parameterchange 를 구독해 SVG 구조 프리뷰 grid 를 만드는 `createStructureRenderer` 회귀 (duck-typed EventTarget, happy-dom + CustomEvent dispatch).
- **실행**: `pnpm -F @geny/web-editor-renderer test`.
- **의존성**: web-avatar-renderer dist (Step 25).

---

## 4. 스크립트·infra 회귀 (8)

### Step 11 — `observability chart verify`

- **보장**: `infra/helm/observability` chart configs sync + 구조 검증 (Chart.yaml / values / templates / `.Files.Get` 참조 일치). `sync-observability-chart.mjs` 의 canonical 결과와 커밋된 차트 파일이 동일해야 함.
- **실행**: `node scripts/verify-observability-chart.mjs`.
- **의존성**: 없음.

### Step 18 — `rig-template-lint`

- **보장**: 34 tests — C1~C14 (meta/dict/params/vertex/cubism-map/family/parts↔params/deformers↔params/tree/parts↔deformers) + halfbody v1.0.0~v1.3.0 + fullbody v1.0.0 전부 clean + 변조 negative + baseline diff. ADR 0005 L2 저자 게이트 축.
- **실행**: `node scripts/rig-template/rig-template-lint.test.mjs`.
- **의존성**: 없음.

### Step 20 — `perf-harness smoke`

- **보장**: Foundation 성능 SLO (`docs/14 §10`) 하네스 회귀. worker-generate in-process 기동 후 HTTP POST /jobs 20 건을 concurrency 4 로 투하 → accept/orchestrate latency p50/p95/p99 + 에러율 + throughput 수집, smoke 완화 SLO 대비 pass. SLO 강제 위반 path + jobs=0 경계 3 케이스.
- **실행**: `pnpm -F @geny/worker-generate build && node scripts/perf-harness.test.mjs`.
- **의존성**: worker-generate main dist (test 명령은 `build:test→dist-test/` 만 만들므로 명시 빌드).

### Step 22 — `observability-smoke parser tests`

- **보장**: Prometheus exposition 파서 (`extractMetricNames` + `readSampleValue`) 의 histogram `_bucket/_sum/_count` suffix 축약 + escape label value 방어.
- **실행**: `node scripts/observability-smoke.test.mjs`.
- **의존성**: 없음 (기동 없이 파서 순수 회귀).

### Step 23 — `observability-snapshot-diff parser tests`

- **보장**: 8 tests — exposition 파서 확장(label key 집합) + diff 알고리즘(added/removed/labelDrift/sampleCountDelta) + `smoke-snapshot-session-75.txt` self-diff = 0 drift freeze guard.
- **실행**: `node scripts/observability-snapshot-diff.test.mjs`.
- **의존성**: 없음.

### Step 28 — `mock-vendor-server tests`

- **보장**: 13 tests — nano-banana/sdxl/flux-fill HTTP 계약 재현 서버(3 엔드포인트 결정론적 `image_sha256` + 401/400/404 + latency/fail 주입 + argv 파서). 실 벤더 키 없이 HTTP 경로 e2e 를 두드리는 dev/CI 도구.
- **실행**: `node scripts/mock-vendor-server.test.mjs`.
- **의존성**: 없음.

### Step 29 — `observability Mock↔HTTP snapshot drift`

- **보장**: `smoke-snapshot-session-75.txt` (Mock 어댑터 경로) ↔ `smoke-snapshot-http-session-83.txt` (`--vendor-mock` HTTP 경로) 두 스냅샷의 metric 이름 + label 키 집합이 동일. **Mock → HTTP 전환이 관측 계약을 보존한다** 는 Foundation 불변식.
- **실행**: `node scripts/observability-snapshot-diff.mjs --baseline … --current …`.
- **의존성**: 커밋된 스냅샷 파일 2 개 (Redis/Docker 불필요, fs 로만 비교).

### Step 30 — `observability fallback validator`

- **보장**: 4-way 관측 불변식 — (a) 파서 회귀 29 tests (1-hop 9 + 2-hop 5 + terminal 9 + unsafe 6) + (b) 4 베이스라인(fallback-84 1-hop / fallback-85-2hop / terminal-86 / unsafe-88) 각각 validator 실행. "fallback / terminal 실패 / unsafe 가 관측상 없었던 일이 되지 않는다" 불변식.
- **실행**: `node scripts/observability-fallback-validate.test.mjs` + 베이스라인 4 회 invocation (`--expect-hops 2` / `--expect-terminal-failure` / `--expect-unsafe`).
- **의존성**: 커밋된 스냅샷 4 개.

---

## 5. 앱 e2e (2)

### Step 6 — `web-preview e2e`

- **보장**: `apps/web-preview` prepare → serve(:port) → fetch → `loadWebAvatarBundle` 체인. Foundation Exit #1 의 무인 e2e 축.
- **실행**: `pnpm -F @geny/web-preview test`.
- **의존성**: web-avatar + exporter-core 런타임.

### Step 27 — `web-editor e2e`

- **보장**: `apps/web-editor` prepare → serve → HTTP 200×6 + loader 체인(`avatar_id=avt.editor.halfbody.demo`) + categorize 4 카테고리 카디널리티 + `<geny-avatar>` happy-dom ready + web-editor-renderer SVG mount + `?debug=logger` LoggingRenderer wire-through assertion (halfbody parts=30 / fullbody parts=38 각각 ready→parameterchange→destroy 3-event 스트림).
- **실행**: `pnpm -F @geny/web-editor test`.
- **의존성**: web-avatar-renderer dist (prepare 단계가 `public/vendor/` 로 copy).

---

## 6. 운영 팁

### 6.1 골든 드리프트 발생 시

`test-golden.mjs` 는 실패 시 다음 경로를 출력:

```
packages/exporter-core/tests/golden/halfbody_v1.2.0.*.json
packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar*.json
samples/avatars/sample-01-aria.bundle.snapshot.json
```

**의도된 변경** 이면 해당 파일을 새 결과로 덮어쓴 뒤 PR 설명에 "골든 갱신" 명시. **의도치 않은 변경** 이면 직전 커밋에서 무엇이 바뀌었는지 추적 (보통 rig-template / exporter-core / post-processing / web-avatar 쪽).

halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들 추가 골든 (세션 105) 은 step 5 안에서 같이 검증되므로 별도 step 은 없음.

### 6.2 build 필수 패키지

downstream 이 `dist/*.d.ts` 를 type import 하는 패키지는 `pnpm test` 이전에 `pnpm build` 가 명시돼야 함. 본 step 목록에서:

- Step 8 ai-adapter-core (→ nano-banana, adapters-fallback, metrics-http, orchestrator-service)
- Step 9 license-verifier build (→ nano-banana)
- Step 14 migrator (→ scripts/rig-template/migrate.test.mjs)
- Step 19 orchestrator-service + job-queue-bullmq (→ worker-generate)
- Step 20 worker-generate (→ perf-harness)
- Step 25 web-avatar-renderer (→ web-editor-renderer)

CI runner 는 dist/ 캐시가 없으므로 명시 빌드 순서가 보존돼야 함. `pnpm test` 만 돌리면 `build:test` 가 `dist-test/` 만 만들고 공개 `dist/` 는 stale → TS2307 연쇄 실패. 세션 115 D6 규칙 (provider 가 type import 대상이면 build→test 2 단 명시).

### 6.3 `bullmq-integration` lane

본 카탈로그 30 step 외에 CI 에는 별도 lane `bullmq-integration` 이 있음. redis:7.2-alpine 서비스 컨테이너 + 4 redis-integration test + observability-e2e 2 step (`--vendor-mock` Mock↔HTTP + fallback). ADR 0006 의 실 Redis 바인딩 경계.

### 6.4 step 추가 규약

새 패키지 / 신규 lint 축을 추가할 때:

1. `scripts/test-golden.mjs` 의 `STEPS` 배열에 `{ name, run }` append.
2. `run<Foo>` 함수 본문에 간단한 주석(무엇을 보장하는지, 세션 번호). 이 주석이 본 카탈로그 §1~§5 의 1차 소스.
3. 본 카탈로그에 해당 step 섹션 append — 4 고정 라인(보장 / 실행 / 의존성 / 도입).
4. `progress_0420/INDEX.md §1` 의 "CI 게이트" 셀 + `progress_0420/SUMMARY.md §7.1` 의 단계 수 / 테스트 수 갱신.
5. INDEX §1 "누적 스크립트" + §2 Platform 워크스트림의 step 카운트 동기화 (세션 121 에서 CI step "29→30" 드리프트 사례).

---

## 7. 참고 문서

- [`scripts/test-golden.mjs`](../../scripts/test-golden.mjs) — 구현.
- [`progress_0420/SUMMARY.md §7.1`](../../progress_0420/SUMMARY.md) — 테스트 수 누적 (세션 121 재캡처).
- [`progress_0420/INDEX.md §1`](../../progress_0420/INDEX.md) — CI 게이트 축.
- [`progress/adr/0005-rig-authoring-gate.md`](../adr/0005-rig-authoring-gate.md) — L1(migrator, step 14) / L2(lint, step 18) / L4(파이프라인, step 3/4/5).
- [`progress/adr/0006-queue-persistence.md`](../adr/0006-queue-persistence.md) — BullMQ mock 축(step 21) + integration lane(§6.3).
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — renderer 계약 축(step 25·26·27).
- [`progress/runbooks/01-incident-p1.md`](./01-incident-p1.md) — P1 인시던트 대응 런북 (본 카탈로그는 정상 경로 검증, 01 은 비상 경로).
