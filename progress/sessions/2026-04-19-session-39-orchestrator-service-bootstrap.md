# Session 39 — `@geny/orchestrator-service` v0.1.0: 최초 서비스 bootstrap

- 날짜: 2026-04-19
- 스트림: AI Generation · Pipeline · Platform/Infra
- 선행: 세션 22/25/28/30/33 (어댑터 계약/캐시/fallback/catalog/orchestrate/metrics) · 36 (metrics-http) · 35 (exporter-core `textureOverrides`) · 38 (exporter-pipeline PNG e2e)
- 후속: 세션 42 (HTTP 팩토리 주입 / worker skeleton 으로 확장)

## 1. 왜 이번 세션을 열었는가

`docs/14 §9` 로드맵의 Foundation 마지막 구간은 "지금까지 조각낸 라이브러리 층을 **하나의 서비스 엔트리포인트** 로 접합"하는 작업이다. 이전 세션까지 쌓인 라이브러리는

- `@geny/ai-adapter-core` — orchestrate(task) + MetricsHook
- `@geny/ai-adapter-nano-banana` / `@geny/ai-adapters-fallback` — 어댑터 구현
- `@geny/metrics-http` — Prometheus exposition + fallback 라우팅 서버
- `@geny/exporter-pipeline` — runWebAvatarPipeline(tpl, outDir)

5개지만, **이들을 실제 프로세스 하나로 묶은 곳은 아직 없었다.** 테스트 파일 안에서만 임시로 묶이고 있었다.

docs/02 §4 "초기 내부 JobRunner" 자리를 `services/orchestrator/` 로 열어,
운영 배포의 형태와 무관하게 "한 프로세스를 띄우면 `orchestrate` 가능 + `/metrics` scrape 가능 + 번들 emit 가능" 을 보장한다.

## 2. 산출물

### 2.1 `services/orchestrator/` 신설

- `package.json` (workspace deps 6개 + zero external; `start` / `build` / `build:test` / `test` scripts)
- `tsconfig.{,build,test}.json` — `dist/` 와 `dist-test/` 분리 (테스트는 한 번 더 깊은 경로)
- `src/index.ts` — 순수 wiring 라이브러리 (아래 §3)
- `src/main.ts` — CLI 엔트리. `--port/--host/--catalog/--help` 파싱 + `createOrchestratorService` + `createMetricsServer().listen(port, host)` + SIGTERM/SIGINT graceful shutdown
- `tests/service.test.ts` — 7 tests (아래 §4)
- `README.md` — CLI / 라이브러리 / 실 HTTP 교체 / `extraMetricsHook` / `metricsServerFallback` 네 가지 사용 예시

### 2.2 `scripts/test-golden.mjs` step 17 추가

```js
async function runOrchestratorServiceTests() {
  // 의존 7개 패키지 순차 빌드 → orchestrator-service 테스트 실행
  await run("pnpm", ["-F", "@geny/ai-adapter-core", "build"], { cwd: repoRoot });
  // ... (nano-banana, adapters-fallback, metrics-http, post-processing, exporter-core, exporter-pipeline)
  await run("pnpm", ["-F", "@geny/orchestrator-service", "test"], { cwd: repoRoot });
}
```

- step 17 로 `16 → 17`. 헤더 주석 업데이트.

### 2.3 `progress/INDEX.md` 갱신

- §3 AI Generation 행: 세션 39 + `@geny/orchestrator-service` 엔트리 추가.
- §3 Pipeline 행: `runWebAvatarPipeline` 의 서비스 위임 경로 보강.
- §3 Platform/Infra 행: `test:golden` 16→17 step 으로 bump.
- §4: 세션 39 로그 row 추가.
- §6: 릴리스 게이트 골든셋 회귀 17 step + orchestrator 7 tests 표기.
- §8: 세션 39 제거, 40/41 유지, 42 신규 (HTTP 팩토리/worker binding).

## 3. 설계 결정

### D1. 새 패키지가 아니라 `services/orchestrator/`

`services/` 는 docs/13 §13 에서 **"장기 실행 서비스"** 로 약속된 자리다. `packages/` 는 라이브러리, `apps/` 는 UI/웹, `services/` 는 JobRunner/Worker 류.

라이브러리를 하나 더 만들면 "누가 어떻게 부트스트랩하는지" 가 또 빠진다. 진짜 필요한 건 "CLI 한 방으로 `node dist/main.js --port 9090`" 이므로 **서비스** 로 시작했다.

### D2. `createOrchestratorService` 는 순수 wiring; 포트 바인딩은 호출자

서비스 내부에서 `.listen(port)` 까지 해버리면 테스트하기 어렵다. 대신 `createMetricsServer()` 메서드가 **바인딩 전의** `http.Server` 를 돌려주고, `main.ts` 에서 `server.listen(port, host, cb)` 를 호출한다.

- 테스트에서는 `listen(0, "127.0.0.1")` 으로 ephemeral port 바인딩 가능 → 테스트 5 (HTTP e2e).
- 운영에서는 `main.ts` 가 `.listen(port, host)` + graceful shutdown 까지.

### D3. Mock default + 팩토리 override 로 실 HTTP 교체

`createMockAdapterFactories()` 를 export. 호출자는

```ts
createOrchestratorService({
  factories: {
    ...createMockAdapterFactories(),
    "nano-banana": (entry) => new NanoBananaAdapter({
      client: new HttpNanoBananaClient({ endpoint: entry.config?.endpoint, apiKey: process.env.NANO_BANANA_API_KEY }),
      routingWeight: entry.routing_weight,
      maxParallel: entry.max_parallel,
    }),
  },
});
```

처럼 부분 override 가능. "Foundation 단계에서는 전부 Mock" + "실 벤더 붙일 때는 팩토리만 교체" 라는 전이 경로를 명시적으로 남긴다. 서비스 코드를 수정할 필요 없음.

### D4. `aliasClient()` — Mock 클라이언트 `modelVersion` 과 catalog `version` 의 불일치 해소

`buildRegistryFromCatalog` 는 strict 하게 `adapter.meta.version === entry.version` 을 검증한다 (세션 30 결정).

문제: Mock 클라이언트들은 `modelVersion = "mock-2026.04.18"`, `"sdxl-1.0-mock"`, `"flux-fill-1.0-mock"` 을 하드코드한다. 반면 catalog `infra/adapters/adapters.json` 은 각 어댑터를 `"version": "0.1.0"` 으로 통일.

세 가지 선택지:
- (a) catalog 를 mock 버전에 맞추기 → 실 HTTP 로 붙일 때마다 catalog 수정해야 함
- (b) Mock 클라이언트에 `modelVersion` 를 매번 생성자로 주입하도록 리팩터 → 다른 테스트 스위트 7개 깨짐
- (c) **orchestrator-service 층에서만 `Object.create` 로 override**

(c) 선택. `aliasClient(client, version)` 는 prototype chain 유지하면서 `modelVersion` 한 필드만 덮어쓴다 — 원본 클라이언트를 변형하지 않고, 검증을 통과시킨다. 실 HTTP 클라이언트는 이미 생성자에서 `modelVersion` 를 받으므로 이 헬퍼가 필요 없다.

### D5. `findRepoRoot()` — `dist/` vs `dist-test/src/` 깊이 차이 흡수

`DEFAULT_CATALOG_PATH` 는 `infra/adapters/adapters.json` 을 가리킨다. 하지만 실행 시 `__dirname` 이

- `services/orchestrator/dist/` → 레포 루트까지 `../../..` (3 depth)
- `services/orchestrator/dist-test/src/` → `../../../..` (4 depth)

두 가지 경로에서 모두 동작해야 한다. 고정 상대 경로로는 둘 다 맞출 수 없으므로,

```ts
function findRepoRoot(start: string): string | null {
  let cur = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(cur, "pnpm-workspace.yaml"))) return cur;
    const parent = dirname(cur);
    if (parent === cur) return null;
    cur = parent;
  }
  return null;
}
```

를 통해 `pnpm-workspace.yaml` 를 위로 거슬러 찾는다. 10 레벨 하드리밋은 무한 루프 방지용. 못 찾으면 `../../..` fallback (레거시 상대 경로 유지) — 이 경우는 lib 을 복사해 간 사용처가 레포 밖일 때만 해당.

### D6. `extraMetricsHook` → `chainMetricsHooks` 로 registry 훅 뒤에 직렬

```ts
function chainMetricsHooks(a: MetricsHook, b: MetricsHook): MetricsHook {
  return {
    onCall(ev) { a.onCall?.(ev); b.onCall?.(ev); },
    onFallback(ev) { a.onFallback?.(ev); b.onFallback?.(ev); },
  };
}
```

Registry 훅은 Prometheus counter/histogram 을 채우는 **필수 경로**. 사용자 훅은 OTEL span 기록 · 샘플 로거 등 **부가 경로**. 순서를 명시 (registry 먼저) 해서, 사용자 훅의 예외가 registry 방출을 막지 않도록 했다 — (현재 구현은 예외 격리 미포함이므로 follow-up 여지. 세션 42 에서 `try/catch` 로 감쌀 수 있음.)

## 4. 테스트 7종

1. **기본 Mock 카탈로그를 로드하고 3개 어댑터 등록** — `svc.adapters.map(a => a.meta.name).sort() === ["flux-fill","nano-banana","sdxl"]`.
2. **orchestrate → `/metrics` 반영** — `geny_ai_call_total{...,status="success",vendor="nano-banana"} 1` 정규식 매치. 라벨은 알파벳 정렬 (`{model,stage,status,vendor}`) 이므로 regex 작성 시 순서 주의.
3. **extraMetricsHook 체인** — 사용자 훅이 `call:nano-banana:success` 이벤트를 관찰, 동시에 registry 에도 반영됨 검증.
4. **HTTP e2e** — `listen(0, "127.0.0.1")` ephemeral 포트 → `GET /metrics` → body 에 `vendor="nano-banana"` 포함.
5. **`metricsServerFallback`** — `/api/ping` 경로가 fallback JSON 핸들러로 라우팅 (`/metrics` 와 공존).
6. **`runWebAvatarPipeline` 위임** — 실 `rig-templates/base/halfbody/v1.2.0` 로드 → `bundle.json` + `web-avatar.json` + `atlas.json` 모두 emit.
7. **`catalog` + `catalogPath` 동시 지정 throw** — 계약 가드.

전체 duration ~130ms (orchestrate Mock 은 즉시 성공).

## 5. 검증

- `pnpm run test:golden` — **17 step 전부 pass** (ai-adapter-core 68 tests + nano-banana 23 + fallback 53 + metrics-http 12 + exporter-core 95 + exporter-pipeline 8 + **orchestrator-service 7** + post-processing 111 + web-avatar 12 + schemas checked=186 + …).
- validate-schemas unchanged — 이 세션은 스키마 변경 없음.

## 6. 다음 단계 (세션 40+)

§8 에 따라:
- **세션 40**: physics-lint 도구화 또는 docs/03 §6.2 체크리스트 고정 (v1.3.0 physics.json authoring gate).
- **세션 41**: `applyAlphaSanitation` 을 halfbody v1.2.0 실 텍스처에 돌려 골든 비교.
- **세션 42**: orchestrator-service 의 HTTP 팩토리 주입 실사용 또는 `apps/worker-*/` skeleton.

Foundation Exit 게이트 상 아직 열린 항목:
- #1 단일 아바타 E2E 수동 테스트 — E 단계 (브라우저 시각 + Cubism Viewer) 남음.
- #3 관측 대시보드 — Helm chart 는 끝, 실 K8s install 만 남음.

이번 세션은 둘 다 직접 닫지 않지만, #1 은 "드라이버가 프로세스로 뜰 수 있다" 는 전제를 강화했고 #3 은 `/metrics` 의 실 scrape 대상이 이제 orchestrator 프로세스에 존재한다.
