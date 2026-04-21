# SUMMARY — 세션 1~123 누적 결과 심층 정리

본 문서는 5 일간(2026-04-17~04-21) 123 세션의 누적 결과를 **워크스트림 + 시간순 마일스톤** 으로 재정리한다. 원문 로그는 `progress/sessions/`, ADR은 `progress/adr/`, 탐색 노트는 `progress/notes/`, 운영 런북은 `progress/runbooks/`, 스키마 카탈로그는 `schema/README.md`. 주장(claims) 축과 세션 로그 축은 분리 — 세션 121 (메타 정합성 점검) + 세션 122 (golden step 카탈로그 작성 중 발견) + 세션 123 (schema/README 22 스키마 실측 재작성) 이후 claims 에서 발견된 드리프트는 본 문서/INDEX/memory/해당 README 에서만 수정, 세션 로그(`progress/sessions/*`) 는 역사 그대로 보존.

---

## 0. 전체 윤곽

```
2026-04-17  세션 01–02   Foundation kickoff + halfbody parts
2026-04-18  세션 03–30   Pipeline 코어 (exporter-core / web-avatar / AI 어댑터 1차)
2026-04-19  세션 31–53   v1.3.0 저작 + 관측 + ADR 0005/0006 + BullMQ 사전설계
2026-04-19  세션 55–71   fullbody v1.0.0 저작 + BullMQ 드라이버 X단계
2026-04-20  세션 72–108  관측 e2e 4-way + web-editor + parameter_ids 계약
```

**누적 성과 한 줄**:
- ADR 0005 L1~L4 게이트 활성 (migrator/lint/저자/파이프라인 불변식)
- ADR 0006 Runtime 드라이버 = Redis+BullMQ 확정 + Foundation 인터페이스 그대로 교체 가능
- Foundation Exit 게이트 4/4 + 릴리스 게이트 3/3 통과
- 5 base 템플릿 sha256 골든 고정 (halfbody v1.0.0~v1.3.0 + fullbody v1.0.0)

---

## 1. Rig & Parts (리그 템플릿)

### 1.1 base 템플릿 5종 (전부 저작 완료)

| 템플릿 | 파츠 | 디포머 | 파라미터 | PhysicsSetting | 모션 | 표정 | 골든 |
|---|---|---|---|---|---|---|---|
| halfbody v1.0.0 | 27 | 14 | 30 | 3 | 5 | — | — |
| halfbody v1.1.0 | 29 | 16 | 32 | 3 | 5 | — | — |
| halfbody v1.2.0 | 29 | 18 | 40 | 9 | 8 | 3 | ✅ aria 14 files |
| halfbody v1.3.0 | 30 (+ahoge) | 21 | 49 | 12 | 9 | 3 | ✅ web-avatar 2 files (세션 105) |
| fullbody v1.0.0 | 38 | 29 | 59 | 17 | 9 | 3 | ✅ zoe 17 files / 55KB (세션 59) |

### 1.2 v1.3.0 저작 흐름 (mao_pro 호환 12/12)

- 세션 27 — v1.0.0→v1.3.0 migrator skeleton (manifest + cubism_mapping + parameters auto-patch, physics 는 TODO).
- 세션 31 — `physics.json` 9→12 setting 저자 손 (저자 개입 단일 지점).
- 세션 34 — 모션 9종 (`ahoge.bounce@1.0.0` + `accessory.greet@1.0.0` + `idle.default@1.1.0` 리마스터).
- 세션 37 — migrator 자동패치 확장 (parts/ahoge.spec.json 신규 + accessory parent 이동 + deformers 3 warp 삽입 + mao_pro §6 appendix 자동 이식).

### 1.3 fullbody v1.0.0 저작 흐름 (5 세션 시리즈)

- 세션 52 — 사전 설계 (9 섹션 plan, 접미사 유지 결정 = `_(sway|phys|fuwa)(_[lr])?$`).
- 세션 55 — 디렉터리 + manifest + family=fullbody 등록.
- 세션 56 — parts 8 + deformers 11 신규 (hip / leg_l/r / foot_l/r / cloth_skirt/cape / acc_belt + warp 노드).
- 세션 57 — physics 5 추가 (skirt_sway · skirt_fuwa · leg_sway_l/r · hip_phys, Setting11 에 cloth_cape_sway 편승).
- 세션 58 — `idle.default@1.2.0` 리마스터 + 8 halfbody 모션 승계 + test_poses 28 (하반신 8).
- 세션 59 — zoe E2E 번들 17 files / 55KB sha256 golden 고정. ADR 0005 L1 N/A · L2 ✅ · L3 ✅ · L4 ✅.

### 1.4 `parameter_ids` opt-in 계약 (세션 95~108, 핵심 UX 완성)

**문제** — 세션 95 의 `parametersForPart` 가 substring 휴리스틱(`role.includes(p.id)`) + category-group fallback 만으로 동작. role="limb" 같은 일반명사는 매칭 0 → Body fallback 14 파라미터, role="hair_front" 은 ahoge/hair_front 양쪽이 같은 substring 후보 노출 → UX 혼란.

**해결 (4 단계)**:
1. **세션 98** — `part-spec.schema.json` 에 optional `parameter_ids: string[]` (uniqueItems · minLength 1) 추가 + `parametersForPart` 에 Rule 0 (explicit) 우선 분기 추가. 기존 67 파츠 spec 전부 필드 생략한 채 검증 통과 — 점진 opt-in.
2. **세션 99** — rig-template-lint(당시 physics-lint) C11 추가 (`parts/*.spec.json.parameter_ids` ↔ `parameters.json` cross-file 무결성 CI 게이트).
3. **세션 100/101/102** — Face 14 + Hair·Body 15 파츠 opt-in. fullbody `leg_l/r`·`foot_l/r` 의 lower_body 파라미터가 `GROUPS_FOR_CATEGORY.Body=["body"]` 에 미포함이라 **에디터에 완전 비노출** 이었던 critical UX 버그 발견·수정.
4. **세션 103** — exporter-core wire-through 누락 발견·복구. `web-avatar.schema.json` `parts[].items` + `WebAvatarPart` 타입 + `convertWebAvatar` spread copy + runtime types 4 지점 동시 패치. 세션 100/101/102 opt-in 이 비로소 실 번들에 도달.
5. **세션 104** — editor `prepare.mjs` halfbody v1.2.0→v1.3.0 bump. opt-in 이 실 editor UX 에 도달.
6. **세션 105** — halfbody v1.3.0 + fullbody v1.0.0 web-avatar 번들 4 골든 신규 승격 (이중 회귀 추적).
7. **세션 106** — halfbody v1.3.0 ahoge `parameter_ids: ["ahoge_sway"]` opt-in (첫 "의도된 drift" 실증, narrow 3→1 -67%).
8. **세션 107** — fullbody v1.0.0 ahoge 미러 + acc_belt `parameter_ids: []` (빈 배열 = overall-only 명시 선언). **opt-in 완결 선언** — 잔여 23 파츠는 substring-정확.
9. **세션 108** — rig-template-lint(당시 physics-lint) C12 추가 (`deformers.json.nodes[].params_in[]` ↔ `parameters.json` cross-file 무결성). C11+C12 자매 쌍.
10. **세션 109** — rig-template-lint(당시 physics-lint) C13 추가 (deformer 트리 무결성: duplicate / root-missing / root-parent / parent-missing / non-root-null-parent / cycle / orphan 7 sub-rule).
11. **세션 110** — `physics-lint` → `rig-template-lint` 리브랜딩. C11~C13 누적으로 physics 색채 옅음 임계 도달. 파일 rename + golden step name 교체 + 외부 live 참조 치환. 세션 로그 / ADR 0005 원문 보존(역사 식별자).
12. **세션 111** — `@geny/migrator@0.1.0` 신규 패키지 (Pipeline/Data 워크스트림). 세션 27/37 에 누적되던 `scripts/rig-template/migrate.mjs` 530 줄 로직을 TS 패키지 3 migrator + 3 데이터 블록 + io 헬퍼로 분해. CLI shim 은 53 줄 dynamic-import 로 축소. BL-MIGRATOR 해소 → 후보 C(legacy opt-in) 의 (b) 블로커 자체 풀림.
13. **세션 112** — C14 `parts↔deformers` 사각형 완결 (Platform 워크스트림). `rig-template-lint` 에 rule 14 추가 — `parts/*.spec.json.deformation_parent` ↔ `deformers.nodes[].id` 교차 검증. C11(parts↔parameters) + C12(deformers↔parameters) + C13(deformers 내부) 에 C14(parts↔deformers) 가 합쳐져 리그 저작 게이트 L2 포화. 테스트 30 → 34, 공식 5 템플릿 clean + `parts_checked == parts_deformation_parents_checked` 불변식 확정. self-contained lint 확장 여지 소진 — 다음 라운드는 Runtime(후보 F) 또는 외부 의존 해소.
14. **세션 113** — ADR 0007 **Draft** (Platform/Frontend 워크스트림). `progress/adr/0007-renderer-technology.md` 신규 — 브라우저 런타임 렌더러 기술 선택. 옵션 A PixiJS v8 (MIT, fit🟢 중상) / B Three.js r160+ (MIT, 2D 에 과잉, fit🟡) / C Cubism Web SDK (상용, fit🔴, 부분 채택 가능) / D 자체 WebGL2 (MIT-free, β 납기 리스크) / E 하이브리드 A→D (`docs/13 §2.2` 잠정안 공식화). **Decision 공란 유지** — 자율 모드가 프로덕트 결정을 침범하지 않도록 4 가지 확정 경로를 나열해 사용자 prompt 한 줄로 pick 가능. 번호 0007 로 통일 (`docs/13` pending 0013 이름 대체, follow-up 기록). 문서만 변경 — 코드/테스트 무영향. 세션 114 자율 모드 후보: "렌더러 인터페이스 패키지 선행 분리" Spike (Option A/D/E 공통 전제).
15. **세션 114** — `@geny/web-avatar-renderer@0.1.0` 신규 (Frontend/Platform 워크스트림). ADR 0007 Decision 이 아직 공란이어도 Option A/D/E 어디로 가도 버려지지 않는 공통 계약을 패키지화. 세션 91 에서 `packages/web-editor-renderer/src/renderer.ts:15-54` 에 인라인 정의됐던 5 duck-typed 인터페이스(`RendererPart` / `RendererBundleMeta` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` / `RendererHost`) 를 상위로 승격 + 2 타입 가드(`isRendererBundleMeta` / `isRendererParameterChangeEventDetail`) 신규 — shape-only 검사, semantic 은 JSON Schema 에 위임(ADR 0002). `@geny/web-editor-renderer` 는 첫 consumer 로 `import type` + `export type` 재정렬 — 런타임 dist 바이트 불변(grep 검증). 누적 패키지 13 → **14** (세션 114 doc 는 14→15 로 기록됐으나 세션 121 재검증 결과 베이스 13 에서 +1, 세션 89 `web-editor-logic` 이 당시 누적 카운트에 미반영이었음). golden step 29 → **30** (`web-avatar-renderer contracts tests` 신설, 10 tests). `readonly` 전파 강화: `RendererBundleMeta.parameters[].{id,default}` 도 readonly 로 승격 — consumer 쪽엔 구조적 하위호환. 기존 22 tests(web-avatar 20 + web-editor-renderer 2) 무변경 green. 세션 115 자율 모드 후보: `createNullRenderer` / `createLoggingRenderer` 추가.
16. **세션 115** — `@geny/web-avatar-renderer` 에 `createNullRenderer` + `createLoggingRenderer` 추가 (Frontend 워크스트림). ADR 0007 Decision 이 확정되지 않아도 독립 동작 가능한 **no-op / 디버그 구현체 2 개** — 계약 패키지를 "정의만 있던 타입 홀더" 에서 "소비자가 지금 쓸 수 있는 테스트 더블" 로 승격.
17. **세션 116** — `apps/web-editor` 가 `@geny/web-avatar-renderer` 의 **첫 소비자** 가 됨 (Frontend/UX 워크스트림). `?debug=logger` URL 파라미터가 있을 때만 `createLoggingRenderer` 를 dynamic import 해 `<geny-avatar>` 에 추가 attach → `console.debug("[geny-avatar/logger]", event)` 로 ready/parameterchange/destroy 3-축 이벤트 스트림을 개발자 콘솔에 흘린다. 기본 경로에선 import 안 함 → 런타임 바이트/네트워크 요청 무증가. prepare.mjs 에 `build @geny/web-avatar-renderer` + `copy dist → public/vendor/web-avatar-renderer` 단계 추가. apps/web-editor e2e 에 `runLoggingRendererDebug` 스텝 추가 — happy-dom 환경에서 LoggingRenderer 를 `<geny-avatar>` 에 attach → ready(1) → setParameter 로 parameterchange(1) → destroy(1) 의 3-event 스트림 + 카운터(readyCount/parameterChangeCount/partCount) + post-destroy silence (이벤트 발화해도 logger 추가 없음) 까지 assertion. halfbody(parts=30) + fullbody(parts=38) 양쪽 템플릿에 대해 검증. **소비 증거 확보**: 세션 114/115 의 계약+구현체가 "이론" 에서 "실 consumer 에 살아있는 코드 경로" 로 전환. golden 30 step 유지 (web-editor e2e 내 스텝 확장, 총 단계 수 불변). `contracts.ts` 에 공통 `Renderer { destroy() }` 베이스 인터페이스 추가. `NullRenderer` 는 ready/parameterchange 이벤트를 구독해 `partCount` / `lastMeta` / `lastParameterChange` / `readyCount` / `parameterChangeCount` 를 노출 (DOM 조작 0), `host.bundle` 이 이미 설정된 late-attach 경로도 1-ready 로 계산. `LoggingRenderer` 는 내부에 NullRenderer 를 두고 상태 추적을 위임하면서, 주입된 `logger(event)` 를 통해 `{kind:"ready"|"parameterchange"|"destroy"}` discriminated union 으로 각 이벤트를 보고 (console 기본값 없음 — 오염 방지). **malformed payload** (detail null / bundle 미포함 / id:number / value:string) 는 양쪽 구현체에서 drop — 가드와 동일한 shape-only 기준. 구현 파일 `src/{null-renderer,logging-renderer}.ts` + 테스트 `tests/{null-renderer,logging-renderer}.test.ts` (6 + 5) → 패키지 tests 10 → **21**. golden 30 step 유지 (단계 추가 없음) + `scripts/test-golden.mjs` `runWebAvatarRendererTests` 에 **build 선행** 추가 (downstream `web-editor-renderer` 가 `dist/*.d.ts` 를 type import — 기존엔 `pnpm test` 가 `build:test` 만 트리거해 `dist/` 가 stale/누락될 수 있었음). 회귀: web-editor-renderer / web-editor e2e 모두 green. 소비자 영향 0 — 신규 export 만 추가.

**최종 상태**: halfbody 19/30 + fullbody 27/38 파츠 opt-in. Face 슬라이더 narrow 30→4~10 / 60→6~10. critical UX 버그 0.

### 1.5 rig-template-lint 13 규칙 (세션 110 리브랜딩 — 이전 이름 `physics-lint`)

| # | 검사 | 도입 세션 |
|---|---|---|
| C1 | `meta.physics_setting_count === settings.length` | 40 |
| C2 | `meta.total_input_count === Σ input.length` | 40 |
| C3 | `meta.total_output_count === Σ output.length` | 40 |
| C4 | `meta.vertex_count === Σ vertices.length` | 40 |
| C5 | `physics_dictionary` ↔ `physics_settings` id 1:1 | 40 |
| C6 | `input.source_param` ∈ `parameters.json` + `physics_input:true` | 40 |
| C7 | `output.destination_param` ∈ `parameters.json` + `physics_output:true` | 40 |
| C8 | `vertex_index` ∈ `[0, vertices.length)` | 40 |
| C9 | `output.destination_param` ∈ `template.manifest.cubism_mapping` | 40 |
| C10 | family 별 출력 네이밍 (suffix + forbidden prefix) | 40 / **49 family split** |
| C11 | `parts/*.spec.json.parameter_ids` ↔ `parameters.json` | 99 |
| C12 | `deformers.json.nodes[].params_in[]` ↔ `parameters.json` | 108 |
| C13 | deformer 트리 무결성 (7 sub-rule) | 109 |

전부 fatal. `--baseline <dir>` 로 버전 간 structural diff. `--family <name>` override. 30 테스트 케이스.

---

## 2. Pipeline (exporter-core → orchestrator → worker)

### 2.1 exporter-core v0.6.0 (102 tests)

- 세션 08~09 — pose3 + physics3 + motion3 + cdi3 + model3 + exp3 변환기 + `assembleBundle()`.
- 세션 11~13 — `assembleAvatarBundle()` + 루트 `bundle.json` 매니페스트 (sha256 감사) + halfbody v1.2.0 13 골든.
- 세션 15·18 — `assembleWebAvatarBundle()` stage 1·2 (텍스처 PNG/WebP + atlas.json emit).
- 세션 35 — `textureOverrides?` 옵션 (호출자 post-processing 결과 주입, 경로 보존 가드 = ADR 0005 L4 첫 인스턴스).
- 세션 103 — `WebAvatarPart.parameter_ids?` 전파 (Rule 0 contract 의 번들 통과).
- 세션 105 — halfbody v1.3.0 + fullbody v1.0.0 4 신규 골든 승격.

### 2.2 exporter-pipeline v0.1.0 (10 tests)

- 세션 38·41 — `pngjs` 기반 `decodePng`/`encodePng` + `runWebAvatarPipeline(tpl, outDir, { transform?, sanitation?, bundle? })`. exporter-core 는 이미지 라이브러리에 무의존 유지.
- halfbody v1.2.0 base.png 를 `applyAlphaSanitation` 태운 4 산출물 sha256 골든 고정 + 원본 vs sanitized sha256 불일치 증거.

### 2.3 orchestrator-service v0.1.0 (12 tests)

- 세션 39·42 — catalog → registry → `orchestrate()` + `createMetricsServer` + `runWebAvatarPipeline` 위임. `createHttpAdapterFactories(catalog, {apiKeys, fetch?})` + `loadApiKeysFromCatalogEnv` + `--http` CLI flag (Mock↔HTTP partial 병합).
- `apiModel` 분리 (카탈로그 version vs 벤더 wire model 독립).

### 2.4 worker-generate v0.1.0 (21 tests)

- 세션 44 — orchestrator-service binding + 인-메모리 FIFO `JobStore` + `POST /jobs`/`GET /jobs/{id}`/`GET /jobs` + `metricsServerFallback` 슬롯 결합.
- 세션 63~67 — BullMQ 드라이버 wiring (`--driver in-memory|bullmq` + `--queue-name` + `REDIS_URL` 강제 + `--concurrency` flag + env fallback + `storeFactory` 주입).
- 세션 65 — `--role producer|consumer|both` 분리.
- 세션 66 — Helm chart `infra/helm/worker-generate/` (같은 image + 다른 role).

### 2.5 job-queue-bullmq v0.1.0 (25 tests + 5 redis skip)

- 세션 60 (ADR 0006 §D3 X 단계) — `BullMQDriver` 인터페이스 + `createBullMQJobStore` 팩토리 + `mapBullMQState()` (8 BullMQ → 4 JobStatus 단일 진실 공급원). idempotency_key passthrough.
- 세션 62 — 실 `bullmq@^5` + `ioredis@^5` deps + `createBullMQDriverFromRedis` + `tests/redis-integration.test.ts` 4 tests (env-gated `REDIS_URL` skip).
- 세션 64 — `createQueueMetricsSampler({ driver, sink, queueName, intervalMs?, scheduler? })` 가 `getJobCounts()` 폴링 → `geny_queue_depth` gauge 5 상태.
- 세션 65 — `processWithMetrics` + `QueueFailureReason` enum + `consumer-redis.ts` `createBullMQConsumer` (`geny_queue_failed_total` + `_duration_seconds`).
- 세션 68 — `geny_queue_duration_seconds` enqueue→terminal 정밀화 (`Job.timestamp` 기반).
- 세션 69 — `.github/workflows/ci.yml` `bullmq-integration` lane (redis:7.2-alpine service container).
- 세션 70~71 — BullMQ 5.x `Custom Id cannot contain :` 제약 → idempotency_key regex `:` 제거 + `removeOnComplete: true` 회귀 테스트.
- 세션 72~74 — perf-harness bullmq 베이스라인 / external split / consumer concurrency 스윕.

---

## 3. AI Adapter

### 3.1 ai-adapter-core v0.1.0 (68 tests)

- 세션 22 — `AdapterRegistry` + 결정론적 시드 + provenance 빌더.
- 세션 25 — `routeWithFallback(registry, task, opts)` + `attempts[]` 트레이스.
- 세션 28 — `parseAdapterCatalog` + `buildRegistryFromCatalog` + `orchestrate`.
- 세션 30 — `infra/adapters/adapters.json` 카탈로그 (nano-banana 100 / sdxl 80 / flux-fill 70).
- 세션 33 — `MetricsHook` + `InMemoryMetricsRegistry` + `createRegistryMetricsHook` + `mapErrorToStatus`. 4 메트릭 자동 방출 (`geny_ai_call_total` / `_duration_seconds` / `_cost_usd` / `geny_ai_fallback_total`). Prometheus 0.0.4 text exposition + 10-bucket 0.05~60s 히스토그램.
- 세션 64 — `InMemoryMetricsRegistry.gauge()` 추가 (`GaugeHandle` 덮어쓰기 시맨틱, NaN/Infinity 거부).
- `SafetyFilter` 계약 + 워커 wire-through (세션 88).

### 3.2 ai-adapter-nano-banana v0.1.0 (23 tests)

- 세션 30 — Mock + `HttpNanoBananaClient`.
- 세션 42 — `apiModel` 분리 (카탈로그 version vs 벤더 wire model).

### 3.3 ai-adapters-fallback v0.1.0 (53 tests)

- 세션 28 — SDXL rw=80 + Flux-Fill rw=70 + Http* 클라이언트 + `apiModel` 분리.

### 3.4 mock-vendor-server (세션 82)

- 세션 82 — `scripts/mock-vendor-server.mjs` (HTTP 3 엔드포인트 + 레이턴시/실패율/per-endpoint 토글 + bearer auth).
- 세션 84 — endpoint 별 `--fail-rate-{generate,edit,fill}` override.
- 세션 85 — capability + with-mask 토글 (flux-fill eligible 조건 강제).

---

## 4. Post-Processing v0.1.0 (111 tests)

| Stage | 함수 | 도입 세션 |
|---|---|---|
| Stage 1 | `premultipliedToStraight`/`straightToPremultiplied` (α=255 bit-exact) | 26 |
| Stage 1 | `cleanAlphaNoise` + `computeAlphaBbox` | 26 |
| Stage 1 | `morphCloseAlpha` (binary dilate+erode, radius 0~4) | 35 |
| Stage 1 | `featherAlpha` (2-pass separable box blur, radius 0~4) | 35 |
| Stage 1 | `clipToUvBox` (UV 박스 밖 α=0) | 35 |
| Stage 1 | `applyAlphaSanitation` 파이프라인 (threshold→close?→feather?→uvClip?→bbox) | 35 |
| Stage 3 | `computeColorStats` + `remapColorLinear` + `normalizeColor` (RGB Reinhard) | 29 |
| Stage 3 | colorSpace="lab" (CIE 1976 L\*a\*b\*, D65, ΔE76) | 32 |
| Stage 3 | `fitToPalette` (α-gate + Lab + farthest-first k-means + ΔE76 cap) | 32 |
| Stage 3 | `applyPreAtlasNormalization` atlas emit pre-hook | 32 |

`parsePaletteCatalog` + `infra/palettes/halfbody-pastel.json` (avatar 8색 + color_context hair_primary 3색).

Stage 6 (pivot) 미착수.

---

## 5. UX (web-editor)

### 5.1 web-editor 스캐폴드 (세션 81)

- docs/09 §4.3 3-column 레이아웃 (TopBar / Parts 사이드바 / Preview Stage / Inspector).
- `<geny-avatar>` ready 이벤트 → `categoryOf(role)` prefix 분류 (Face/Hair/Body/Accessory) → 사이드바 렌더.
- 선택 → Inspector read-only kv 바인딩.
- CI golden step 24 `web-editor e2e` (Other=0 enforced).

### 5.2 fullbody 템플릿 스위처 (세션 87)

- TopBar `<select>` + `public/INDEX.json.templates[]` manifest + `public/sample/{halfbody,fullbody}/` 분리 번들.
- `categoryOf` 확장 3 줄 (limb/clothing/accessory). halfbody 무영향, Other=0 양쪽 유지.
- e2e: halfbody=29 / fullbody=38 카디널리티 스냅샷 고정.

### 5.3 Inspector Parameters 패널 + write-through (세션 90)

- `<geny-avatar>.setParameter(id, value)` 실구현 (clamp + `parameterchange` CustomEvent).
- `<input type=range>` 슬라이더 그룹 + `parameterchange` readout 자동 동기.
- `paramSectionEl` 재삽입으로 슬라이더 focus/drag 보존.

### 5.4 Preview Stage SVG 구조 렌더러 (세션 91)

- `@geny/web-editor-renderer@0.1.0` `createStructureRenderer({ element, mount, rotationParameter? })` 팩토리.
- duck-typed `RendererHost extends EventTarget` (Custom Element 강제 의존 회피).
- `ready` → 5-col SVG grid (`viewBox="0 0 400 500"`) + part 1개당 `<rect>` + `<text>`.
- `parameterchange` → `id.includes("angle")` 첫 후보일 때만 `rotate(° 200 250)`.

### 5.5 파츠↔Preview 양방향 바인딩 (세션 92)

- `onSelectPart?: (part|null)=>void` + `selectedSlotId` + `setSelectedSlot(slotId|null)`.
- 프로그래매틱 setSelectedSlot 은 콜백 안 호출 = **echo 방지 라이브러리 규약**.
- 하이라이트 inline attribute 5개 (happy-dom SVG CSS 제약 회피).

### 5.6 Motions/Expressions 패널 (세션 94)

- `<geny-avatar>.playMotion`/`setExpression` 스텁 해소 (id 계약 + state + `motionstart`/`expressionchange` CustomEvent).
- 실 timeline 재생은 Cubism/WebGL 렌더러 Runtime 소관.

### 5.7 파츠-파라미터 뷰 필터 (세션 95)

- `parametersForPart(part, parameters)` 2단계 규칙: substring → category-group fallback + `OVERALL_GROUP="overall"` 항상 포함.
- 세션 98 에서 Rule 0 (explicit `parameter_ids`) 우선 분기 추가 → 3-branch.

### 5.8 web-editor-logic (세션 89)

- `categoryOf`/`categorize`/`CATEGORY_ORDER` 28 줄 복붙을 `packages/web-editor-logic/` 단일 패키지로 승격.
- 57 unit tests. browser `<script type="module">` + Node dynamic import 양쪽이 같은 dist 바이트 공유.

---

## 6. Frontend (`<geny-avatar>` 커스텀 엘리먼트)

### 6.1 web-avatar v0.1.0 (20 tests)

- 세션 15·18 — `<geny-avatar>` 스켈레톤 + `loadWebAvatarBundle()` + `ready`/`error` 이벤트.
- 세션 23 — happy-dom 라이프사이클 회귀 (실 customElement 등록 → `setAttribute("src")` → `ready` 페이로드 + `INVALID_KIND` 에러 + stale-src cancel).
- 세션 90 — `setParameter` 실구현 + `parameterchange`.
- 세션 94 — `playMotion`/`setExpression` 실구현 + `motionstart`/`expressionchange`.

### 6.2 web-preview Foundation E2E (세션 19/20/45)

- 세션 19 — Foundation E2E 드라이버.
- 세션 20 — `pnpm --filter @geny/web-preview run test` (prepare → serve → HTTP 6종 → `loadWebAvatarBundle` → 종료).
- 세션 45 — happy-dom + HTTP URL `<geny-avatar>` ready 페이로드 어서션 (Exit #1 D-시각 수동 → CI 자동 승격).

---

## 7. Platform / Infra (CI · 관측 · 보안 · 성능)

### 7.1 CI (30 step golden + bullmq-integration lane)

- `pnpm run test:golden` 30 step:
  - validate-schemas (checked=244)
  - exporter-core 102 + exporter-pipeline 10 + ai-adapter-core 70 + ai-adapter-nano-banana 23 + ai-adapters-fallback 53 + post-processing 111 + metrics-http 12 + orchestrator-service 12 + web-avatar 20 + web-editor-logic 39 + job-queue-bullmq 28 + worker-generate 45 + **migrator 8 (세션 111)** + **web-avatar-renderer 21 (세션 114 계약 10 + 세션 115 null 6 + logging 5)** (세션 121 재검증 — ai-adapter-core/web-editor-logic/job-queue-bullmq/worker-generate 드리프트 해소)
  - rig-template migrate CLI 3 + rig-template-lint 34 (세션 112 C14 확장)
  - web-preview e2e + web-editor e2e + observability e2e (Mock↔HTTP / 1-hop fallback / 2-hop fallback / terminal failure / unsafe content)
  - perf-harness smoke (Foundation Mock SLO)
- `bullmq-integration` lane: redis:7.2-alpine service container + 4 redis-integration test + observability-e2e 2 step (`--vendor-mock` Mock↔HTTP + fallback).

### 7.2 관측 4단 방어망 (세션 75~86)

| 층 | 도구 | 도입 세션 |
|---|---|---|
| Exposition | producer/consumer `/metrics` 8 메트릭 union | 65/75 |
| Snapshot | `infra/observability/smoke-snapshot-session-75.txt` 4585B 베이스라인 | 75 |
| 파서 회귀 | `observability-smoke.test.mjs` 7 케이스 | 76 |
| 로컬 e2e | `scripts/observability-e2e.mjs` (docker Redis + producer/consumer + perf-harness + smoke) | 77 |
| CI 자동 회귀 | `.github/workflows/ci.yml` `bullmq-integration` lane | 78 |
| CI 실패 artifact | `--log-dir` + `actions/upload-artifact@v4` (failure 조건) | 79 |
| Prometheus 스크레이퍼 prep | `scripts/observability-snapshot-diff.mjs` (structural drift) | 80 |
| Mock↔HTTP 불변식 | `--vendor-mock` flag + `smoke-snapshot-http-session-83.txt` | 83 |
| 1-hop fallback 증명 | `nano=1.0/sdxl=0` + `observability-fallback-validate.mjs` | 84 |
| 2-hop fallback 증명 | `nano=1.0/sdxl=1.0/flux=0` + `--expect-hops 2` | 85 |
| Terminal failure 증명 | `nano=1.0/sdxl=1.0/flux=1.0` + `--expect-terminal-failure` | 86 |
| Unsafe content 증명 | `SafetyFilter` reject → fallback 트리거 | 88 |

### 7.3 Helm chart (관측 + Redis + worker-generate)

- 세션 17/24 — Prometheus + Alertmanager (P1→PagerDuty / P2→Slack) + Grafana 3 대시보드 provisioning.
- 세션 33 — Grafana #2 panel 7/8 추가 (폴백 / p95 지연).
- 세션 50 — Job Health 대시보드 panel 3종 확장 (queue 메트릭 4종).
- 세션 66 — `infra/helm/redis/` (in-cluster `redis:7.2-alpine` StatefulSet primary + replicas / external Secret) + `infra/helm/worker-generate/` (같은 image + 다른 role, dev=2 / prod=8 concurrency).
- 세션 80 — `values-staging.yaml` (kube-prometheus-stack `release: kube-prometheus-stack` SM selector).

### 7.4 보안 + 온콜 + 성능 (세션 48 + 51)

- 세션 48 — `.gitleaks.toml` + `.github/workflows/ci.yml` `secret-scan` job + `progress/runbooks/01-incident-p1.md` 5 단계 (Detect/Triage/Mitigate/Communicate/Postmortem).
- 세션 51 — `scripts/perf-harness.mjs` worker-generate in-process + HTTP POST /jobs 부하 + p50/p95/p99/err/tput 수집. Foundation Mock SLO: accept p95 ≤ 100ms · orchestrate p95 ≤ 500ms · err ≤ 0.01 · tput ≥ 10/s. golden step 20 smoke. `docs/02 §12.4` SLO 임계 명문화.

`docs/14 §10` 릴리스 게이트 3축 (보안/성능/온콜) 전부 ✅.

---

## 8. Data (스키마 + 카탈로그)

### 8.1 JSON Schema 22종

avatar metadata/export · bundle-manifest · license · provenance · adapter-catalog · ai-adapter-task/result · palette · part-spec · parameters · physics · pose · motion-pack · expression-pack · deformers · atlas · web-avatar · rig-template · signer-registry · test-poses + common/.

- 세션 21 — `@geny/license-verifier` Ed25519 서명 검증 + 레지스트리 기반 verify.
- 세션 22 — adapter→provenance→verify round-trip.
- 세션 30 — `infra/adapters/adapters.json` 카탈로그.
- 세션 32 — `infra/palettes/halfbody-pastel.json`.
- 세션 98 — `part-spec.schema.json.parameter_ids?: string[]` (uniqueItems · minLength 1, optional).
- 세션 103 — `web-avatar.schema.json.parts[].items.parameter_ids?` 전파.

DB/S3 미착수 (Runtime).

---

## 9. ADR (의사결정 6건)

| # | 결정 | 핵심 함의 |
|---|---|---|
| [0001](../progress/adr/0001-monorepo-layout.md) | Monorepo + pnpm + Taskfile | 멀티언어 (TS+Py) 공존, 한 커밋에 릴리스 묶기 |
| [0002](../progress/adr/0002-schema-first-contract.md) | JSON Schema 2020-12 단일 진실 공급원 | TS+Py 양쪽 어긋남 차단, validate-schemas CI 강제 |
| [0003](../progress/adr/0003-rig-template-versioning.md) | Full-SemVer 디렉터리 (`v1.3.0/`) | 정확 버전 고정 + 병렬 보존 + AI 재현성 |
| [0004](../progress/adr/0004-avatar-as-data.md) | 참조형 아바타 (메타 + PartInstance) | 템플릿/파츠는 별도 엔터티, avatar 는 메타 + 버전 스냅샷 |
| [0005](../progress/adr/0005-rig-authoring-gate.md) | 리그 저작 게이트 L1~L4 | L1 migrator auto-patch · L2 lint fatal · L3 저자 · L4 파이프라인 불변식 |
| [0006](../progress/adr/0006-queue-persistence.md) | Runtime 큐 = Redis + BullMQ | Foundation `JobStore` 인터페이스 그대로, 7 gap 은 드라이버 교체 1 커밋 |

---

## 10. Foundation Exit 게이트 4/4 ✅

| # | 항목 | 충족 세션 |
|---|---|---|
| 1 | 단일 아바타 생성 → 프리뷰 → Cubism export | 19 (드라이버) + 20 (E2E 자동) + 23 (DOM lifecycle) + 45 (HTTP URL 승격) |
| 2 | CI 골든 1 아바타 회귀 자동 | 10 + 20 + 23 (`.github/workflows/ci.yml`) |
| 3 | 관측 대시보드 3종 기본 동작 | 17 (config) + 24 (Helm) — 실 K8s 배포는 Helm install 만 |
| 4 | 개발자 온보딩 1일 | 16 (README quickstart + 9 CLI 표 + troubleshooting 7종 + scripts/Taskfile) |

**E 단계 (실 브라우저 육안 + Cubism Viewer)** 는 선택 항목으로 문서화 — Foundation 기준에서 제외.

---

## 11. 릴리스 게이트 3/3 ✅ (`docs/14 §10`)

- ✅ 골든셋 회귀 통과 — `pnpm run test:golden` 30 step CI
- ✅ 성능 SLO 초과 없음 — perf-harness Foundation Mock SLO + perf-sweep-concurrency 스윕
- ✅ 보안 스캔 P0/P1 0건 — Gitleaks CI
- ✅ 문서 업데이트 — 세션별로 관리
- ✅ 온콜/롤백 플랜 — `progress/runbooks/01-incident-p1.md`

---

## 12. 핵심 결정축 누적 (세션 별 D-항목 중 재인용 가치)

- **세션 49 D**: rig-template-lint C10 (당시 physics-lint) 을 family 별로 분리 (`FAMILY_OUTPUT_RULES` 6 family enum 전부 등록). halfbody/masc_halfbody 에 한해 하반신 prefix 차단.
- **세션 65 D**: worker-generate `--role producer|consumer|both`. producer-only 는 in-process orchestrate 훅 생략.
- **세션 66 D6**: `GENY_WORKER_CONCURRENCY` env 선행 주입 (세션 67 CLI flag 도입 시 idempotent upgrade).
- **세션 85 D7**: `cost_usd` success-only — `metrics.onCall` 이 `costUsd` 를 success 경로에서만 전달. nano/sdxl 실패 샘플에는 cost 없음.
- **세션 95 D2 / 98 D2**: 빈 배열 `parameter_ids: []` = "overall-only 명시 선언" (세션 98 schema 의미 보존, undefined 와 시맨틱 분리).
- **세션 100 D2 / 102 D1 / 107 D5**: 중복 선언 회피 — substring-정확 매칭은 opt-in 불필요. 미래 추가 opt-in 시 이유 명시 의무.
- **세션 103 D5 + 105 D2 + 106 D1**: "의도된 drift" 메커니즘 — halfbody v1.3.0 + fullbody v1.0.0 골든 양쪽 축 고정으로 회귀 추적 정밀도.
- **세션 108 D5**: deformer 트리 무결성(orphan/cycle) 은 별도 C13 으로 분리 — lint catalog 의 stratified 구조 유지.

---

## 13. 미완 / 외부 의존 / 미착수

| 항목 | 상태 | 차단 원인 |
|---|---|---|
| 실 staging 배포 | 🔴 외부 의존 | cluster access 미확보 (세션 96 후보) |
| Cubism/WebGL 실 렌더러 | ⚪ 미착수 | Runtime phase, 큰 세션 (세션 97 후보) |
| 실 벤더 키 분포 캡처 | ⚪ 미착수 | Runtime phase (세션 88 D 와 묶임) |
| BullMQ `attempts>1` 베이스라인 재캡처 | ⚪ 미착수 | 세션 86 D6 — Runtime 합류 시 |
| Stage 6 (pivot) post-processing | ⚪ 미착수 | 우선순위 낮음 |
| DB (Postgres) + S3 | ⚪ 미착수 | Runtime — Foundation 범위 밖 |
| legacy v1.0.0~v1.2.0 `parameter_ids` 복제 | 🟡 (a)(c) 보류 | 세션 111 에서 (b) 블로커 해소. 나머지는 외부 정책 + Runtime 소비자 |
| `packages/migrator/` skeleton | ✅ 완료 (세션 111) | `@geny/migrator@0.1.0` — 3 migrator 이식, CLI shim 53 줄 |
| C13 deformer 트리 무결성 (orphan/cycle/parent) | ✅ 완료 (세션 109) | — |
| `physics-lint` → `rig-template-lint` 리브랜딩 | ✅ 완료 (세션 110) | — |
| C14 parts↔deformers 사각형 | ✅ 완료 (세션 112) | C11~C14 사각형 완결 + 테스트 34 + 공식 5 템플릿 clean |
| ADR 0007 (렌더러 기술) Draft | 🟡 Draft (세션 113) | 5 options 비교 + Decision 공란. 사용자 리뷰 대기 — Accept 시 docs/13 §2.2 rewrite follow-up |
| 렌더러 인터페이스 패키지 선행 분리 | ✅ 완료 (세션 114) | `@geny/web-avatar-renderer@0.1.0` + 10 tests + golden step 30. Option A/D/E 공통 계약 확보 |
| Null/Logging 렌더러 구현체 | ✅ 완료 (세션 115) | `createNullRenderer` + `createLoggingRenderer` + 11 tests (6+5) → 패키지 총 21 tests. ADR 0007 Decision 불변 테스트 더블 |
| `apps/web-editor` → LoggingRenderer wire-through | ✅ 완료 (세션 116) | `?debug=logger` URL 스위치 + dynamic import. e2e assertion (ready→parameterchange→destroy 스트림) halfbody+fullbody 양쪽 고정 |
| `@geny/web-avatar-renderer` README | ✅ 완료 (세션 117) | package.json `files` 가 이미 참조하던 빈 자리를 채움 — 계약/가드/팩토리/consumer attachment pattern/ADR 0007 경로별 예상 귀결 정리. doc-only |
| 인접 프론트엔드 3 패키지 README 점검 | ✅ 완료 (세션 118) | `@geny/web-editor-logic` (신규) + `@geny/web-editor-renderer` (신규) + `@geny/web-avatar` (세션 90/94/114 반영 갱신). 세션 117 6 블록 패턴 재사용, doc-only. 프론트엔드 4 패키지 문서 축 완결 |
| 나머지 10 패키지 README triage | ✅ 완료 (세션 119) | `@geny/job-queue-bullmq` (신규, 8 함수 + `bullmq`/`ioredis` 경계 규약 표) + `@geny/post-processing` (재작성, §6.4 Palette + §6.5 Atlas Hook 누락 해소). 8 패키지 FRESH 판정 skip. **Foundation 14 패키지 문서 축 완결** (세션 121 재검증 — 최초 "15" 표기는 세션 89 `web-editor-logic` 누적 미반영에서 파생된 off-by-one) |
| ADR 0007 Option 별 diff 노트 | ✅ 완료 (세션 120) | `progress/notes/adr-0007-option-diffs.md` 신규 (278 줄). 5 옵션(A/B/C/D/E) 각각 (1) 신규 패키지, (2) 기존 파일 touch, (3) golden step 변경, (4) 타입 계약 BC, (5) 리스크, (6) Critical path sequence. 공통 기반(§1) + 옵션 간 공통 touch 8 항목(§7) + Open Questions 영향(§8) 분리. 사용자 pick 후 즉시 Spike 진입 가능한 pre-decision prep. doc-only, 코드 변경 0 |
| progress_0420 메타 정합성 점검 | ✅ 완료 (세션 121) | 6 건 드리프트 해소 — (1) INDEX 패키지 카운트 `15→14` (세션 89 `web-editor-logic` 누적 미반영에서 파생된 off-by-one, 세션 111/114 도 동일 베이스 밀림 — Delta 는 매번 정확) / (2) backend 카운트 `11→10` (세션 119 doc 자체 모순이 memory 로 전파) / (3~6) CI §7.1 테스트 수 `ai-adapter-core 68→70` · `web-editor-logic 57→39` · `job-queue-bullmq 25→28` · `worker-generate 21→45` (실측 기반 재캡처). 정책: 현재 상태 claims 만 수정, 세션 로그 역사 보존. doc-only, 코드 변경 0 |
| Golden step 카탈로그 | ✅ 완료 (세션 122) | `progress/runbooks/02-golden-step-catalog.md` 신규 (~240 줄). `scripts/test-golden.mjs` STEPS 배열 30 step 을 5 분류(schema 1 / CLI 번들 3 / 패키지 16 / 스크립트·infra 8 / 앱 e2e 2) × 각 step 4-라인 고정(보장·실행·의존성·도입) 으로 색인. §6 운영 팁 (골든 드리프트 대응 / build 필수 패키지 6 곳 / bullmq-integration lane / step 추가 규약) 포함. 인접 드리프트 해소: INDEX §2 Platform "29 step→30", INDEX §1 CI 게이트 "11+5→16+2" 로 실측 분류 교체, scripts/README.md `checked=131→244` + "5-step→30 step" 갱신. runbook README 에 02 entry 추가. doc-only, 코드 변경 0 |
| schema/README 실측 카탈로그 | ✅ 완료 (세션 123) | `schema/README.md` 재작성 — v1 22 계약(21 `.schema.json` + 1 `common/ids.json`) 을 7 그룹(리그·파츠 5 / 모션·표정·포즈 4 / 번들 5 / AI 3 / 라이선스 3 / 후처리 1 / 공용 1) × 각 항목 4-라인(보장/소비자/Docs/도입) 으로 색인. placeholder 2 제거(`style-profile` · `export-job` — git log 에 이력 없음), 미존재 `schema/examples/` 언급 제거, 누락 8 스키마 추가(adapter-catalog / deformers / motion-pack / palette / parameters / physics / pose / test-poses). 검증 블록 `checked=244 failed=0` 실측 반영 + golden step 1 pointer. doc-only, 코드 변경 0, 골든 영향 0 |
