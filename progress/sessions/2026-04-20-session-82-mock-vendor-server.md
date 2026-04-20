# 세션 82 — Mock vendor HTTP server + golden step 25 (실 HTTP 경로 End-to-End 준비)

**일자**: 2026-04-20
**워크스트림**: AI Generation / Platform
**선행 세션**: 세션 22 (nano-banana HTTP 클라이언트), 세션 25/28 (SDXL + Flux-Fill HTTP 클라이언트), 세션 42 (`createHttpAdapterFactories` + `loadApiKeysFromCatalogEnv`), 세션 80 (`observability-snapshot-diff.mjs`)

---

## 1. 문제

Foundation §8 §82 후보의 목표는 "실 벤더 HTTP 어댑터(nano-banana/sdxl/flux) 투입 후 `geny_ai_call_duration_seconds`/`geny_ai_call_cost_usd` 실 분포 캡처". 그러나 본 세션 시점 (a) 실 벤더 API 키 없음 (b) egress 제한 (c) 운영 환경 미확보 — 어느 축도 실측 불가.

대신 세션 80 의 "locally verifiable prep" 패턴을 반복: 실 HTTP **경로** 는 로컬에서 전부 탐색 가능하므로, 벤더 API 를 흉내내는 dependency-zero 목(mock) 서버를 도입해

1. `HttpNanoBananaClient` / `HttpSDXLClient` / `HttpFluxFillClient` 의 요청/응답 계약이 실제로 맞물리는지 증명,
2. 장래 세션 83 (observability-e2e `--vendor-mock` 모드) 의 실 HTTP 스냅샷 캡처 기반 확보,
3. 장애 주입 `--fail-rate` 로 `VENDOR_ERROR_5XX` 경로 / 라우터 폴백을 CI 회귀로 승격 가능.

실 벤더 키 없이도 HTTP 계약 drift 를 탐지할 수 있는 유일한 방법.

---

## 2. 변경

### 2.1 `scripts/mock-vendor-server.mjs` 신규

- Node 내장 `http` 만 사용, 의존성 0 (runtime deps 제로 유지).
- 4 엔드포인트:
  - `POST /v1/generate` — nano-banana 계약
  - `POST /v1/edit` — SDXL 계약
  - `POST /v1/fill` — flux-fill 계약
  - `GET  /v1/health` — 공통 헬스
- **응답 결정론**: `image_sha256 = sha256(task_id || "|" || seed || "|" || kind)` hex, `bbox = [0, 0, size.width, size.height]`, `latency_ms = 실 서버측 sleep` 반영. 동일 입력 → 동일 출력, 재현 가능.
- **인증**: `Authorization: Bearer <non-empty>` 헤더 누락/빈값 → 401. 키 값 일치는 검사 안 함 (mock 의 책임은 HTTP 계약 재현이지, 키 검증이 아님).
- **CLI 파라미터**: `--port N` (default 0 = ephemeral) · `--latency-mean-ms N --latency-jitter-ms N` · `--fail-rate R` (0~1, 1=항상 500) · `--seed N` (mulberry32 PRNG 초기화).
- **장애 주입**: `rng() < failRate` → 500. sleep **이후** roll — 클라이언트 `DEADLINE_EXCEEDED` abort 와 타이밍 섞이지 않게 (timeout 앞에서 실패 주입하면 테스트가 플레이키).
- **fileURLToPath(import.meta.url) === process.argv[1] 가드** — 세션 76/80 관행 상속 (import 시 main 미실행).
- **export**: `createMockVendorServer(opts)`, `parseArgv(argv)` — 테스트에서 동일 인자 스페이스 재사용.

### 2.2 `scripts/mock-vendor-server.test.mjs` 신규

13 assert/strict 케이스 — 계약 전 축 커버:
1. `/v1/health` ok:true
2. `/v1/generate` 결정론적 `image_sha256` (pre-computed hex 와 정확히 일치)
3. 3 엔드포인트 서로 다른 `image_sha256` (같은 task_id+seed 라도 kind 차이로 분기)
4. Authorization 누락 → 401
5. `Bearer ` (토큰 비어있음) → 401
6. non-JSON 바디 → 400
7. task_id 누락 → 400
8. size 누락 → 400
9. unknown 엔드포인트 → 404
10. latency-mean=30ms → 응답 `latency_ms ∈ [25, 35]` (±jitter 검증)
11. fail-rate=1.0 → 3회 연속 500
12. fail-rate=0 → 3회 연속 200
13. `parseArgv` 모든 플래그 + unknown arg 거부

### 2.3 `scripts/test-golden.mjs` — step 24 → **25**

`mock-vendor-server tests` 추가 (~154ms, @geny/* 빌드 의존 없음). Node http 기반이라 CI 환경 추가 설정 불필요.

---

## 3. 검증

```
$ node scripts/mock-vendor-server.test.mjs
[mock-vendor-test] start
  ✓ health returns ok:true
  ✓ generate returns deterministic image_sha256
  ✓ edit + fill differ in image_sha256 for same task_id
  ✓ missing Authorization → 401
  ✓ malformed Authorization (Bearer without token) → 401
  ✓ non-JSON body → 400
  ✓ missing task_id → 400
  ✓ missing size → 400
  ✓ unknown endpoint → 404
  ✓ latency-mean=30ms → response latency_ms ≈ 30 (±jitter)
  ✓ fail-rate=1.0 → 500 on every call
  ✓ fail-rate=0 → 200 on every call
  ✓ parseArgv accepts all flags + rejects unknown
[mock-vendor-test] passed=13 failed=0
```

**실 HTTP 클라이언트 round-trip 수동 검증** (세션 22/25/28 의 컴파일된 dist 와 mock 서버 직접 연결):

```
$ node -e 'import …'
health: { ok: true, latencyMs: 0 }
invoke: { image_sha256: "dcf93ea26999ee84…", bbox: [0, 0, 512, 768], latency_ms: 10, vendor_metadata: {...} }

sdxl: 8641506aa951af9d
flux: ca3d0fcd4c489814
sdxl.health: true  flux.health: true
```

→ `HttpNanoBananaClient` / `HttpSDXLClient` / `HttpFluxFillClient` 모두 mock 과 **실제로** round-trip. 응답 `image_sha256` hex64 포맷 + `bbox` 4-tuple + `latency_ms` 정수 조건을 클라이언트 어서션이 수락 (세션 22 §계약 그대로).

```
$ node scripts/test-golden.mjs
... (25 step 全部 ✔) ...
[golden] ✔ mock-vendor-server tests (154 ms)
[golden] ✅ all steps pass
```

---

## 4. 주요 결정축

- **D1** — **별도 `@geny/mock-vendor` 패키지 대신 scripts/ 단일 파일**: 의존성 0 + Node 내장 http 로 충분 + 재사용자는 dev/CI 만. 별도 패키지로 승격하려면 `src/` + TypeScript + build 파이프라인 추가 — 이득 대비 비용 큼. 세션 83 에서 `observability-e2e` 가 import 해도 `scripts/mock-vendor-server.mjs` 에서 직접 로드.
- **D2** — **응답 결정론 = sha256(task_id|seed|kind)**: mock 의 `image_sha256` 은 "가짜 이미지 해시" — 진짜 이미지가 없으므로 어떻게든 hex64 를 반환해야 클라이언트가 `INVALID_OUTPUT` 을 던지지 않음. 입력 기반 hash 로 하면 (a) 재현 가능 (b) 클라이언트의 provenance 경로가 실제처럼 동작 (c) 엔드포인트별 서로 다른 출력(kind 를 hash 에 섞어 generate/edit/fill 구분).
- **D3** — **sleep 이후 fail roll**: timeout 근처에서 fail 을 주입하면 `DEADLINE_EXCEEDED` 와 `VENDOR_ERROR_5XX` 가 레이스 — 테스트가 플레이키. sleep 은 무조건 완료 → roll → 200/500 분기로 **순서를 고정**.
- **D4** — **Bearer 값 검증 안 함**: mock 의 책임은 HTTP 계약 재현. 실 벤더가 403 을 반환하는 상황 시뮬은 범위 밖 (403 은 `VENDOR_ERROR_4XX` 매핑 테스트에서 fetch 스텁으로 이미 커버, 세션 22 §7). 401 은 "인증 헤더 자체가 빠졌는가" 만 검사.
- **D5** — **mulberry32 결정론 PRNG**: fail injection 순서가 seed 로 고정되어야 CI 가 회귀마다 같은 결과. `Math.random()` 은 사용 거부 (암호학적 성질 불필요 + 재현성 중요).
- **D6** — **golden 승격**: fs 접근 없음 + 네트워크 없음(localhost only) + 의존성 0 — 가장 저렴한 step 중 하나 (~154ms). 도입 비용 무시.
- **D7** — **scripts/*.mjs 관행 유지**: `fileURLToPath(import.meta.url) === process.argv[1]` 가드 (세션 76/80) + stdout 에 "listening: URL" 한 줄 (web-preview/web-editor `serve.mjs` 와 동형 — orchestration 이 readline 으로 기동 대기 가능).

---

## 5. 남긴 숙제

- **세션 83 `observability-e2e --vendor-mock`**: mock 서버 기동 + 임시 카탈로그 JSON (endpoint → `http://localhost:<port>`) 작성 + `NANO_BANANA_API_KEY`/`SDXL_API_KEY`/`FLUX_FILL_API_KEY` env 주입 + producer/consumer `--http` 로 스폰. `--snapshot <path>` 로 HTTP-path 스냅샷 캡처 → `infra/observability/smoke-snapshot-http-session-83.txt` 로 커밋 → `smoke-snapshot-session-75.txt` (Mock adapter) 대비 structural drift **0** 어서션 (sample 값은 informational). Foundation 의 "Mock → HTTP 전환이 관측 계약을 보존" 불변식 CI 고정.
- **폴백 라우팅 CI 회귀**: `--fail-rate 0.5` 로 mock 가동 → `routeWithFallback` 이 nano-banana → sdxl → flux 로 폴백하는 attempts[] 트레이스를 provenance 에 기록하는지 e2e 검증. 세션 30 의 `orchestrate` catalog §4 대안 경로.
- **실 벤더 분포 캡처**: cluster access + API 키 확보 시점. 세션 83 의 Mock-HTTP 스냅샷과 diff 해 벤더별 `geny_ai_call_duration_seconds` 실 분포 그래프 유도.
- **Helm `GENY_WORKER_CONCURRENCY` 재튜닝**: 세션 74 는 Mock 파이프라인에서 concurrency 무의미라 결론 (처리시간 ~0.1ms 라 단일 슬롯도 큐 즉시 비움). Mock-HTTP 는 latency-mean 30ms 로 더 현실적 → C∈{1,2,4,8,16} 재스윕으로 concurrency-tput 곡선 재 유도 가능. 세션 83 후보.
- **TS 전용 모듈 승격**: mock-vendor 가 세션 83 이후 여러 곳(web-editor, perf-harness) 에서 쓰이게 되면 `packages/mock-vendor-server/` 로 추출 고려. 현재는 YAGNI.

---

## 6. 결과

- `scripts/mock-vendor-server.mjs` 신규 — nano-banana/sdxl/flux-fill HTTP 계약 재현 서버 (4 엔드포인트 + 결정론적 응답 + 장애 주입 + mulberry32 PRNG, Node 내장 http 기반, 의존성 0).
- `scripts/mock-vendor-server.test.mjs` 신규 — 13 계약 회귀 (결정론 + 인증 + body 검증 + latency/fail injection + argv 파서).
- `scripts/test-golden.mjs` 24 → **25 step** (`mock-vendor-server tests`, ~154ms).
- `HttpNanoBananaClient` / `HttpSDXLClient` / `HttpFluxFillClient` 세 어댑터가 mock 서버와 round-trip 됨을 수동 검증 완료 — 세션 83 `observability-e2e --vendor-mock` 기반 확보.
- Foundation Exit 마감 잔여: 세션 83 HTTP-path 스냅샷 캡처 / 세션 84 실 staging + 실 벤더 분포.
