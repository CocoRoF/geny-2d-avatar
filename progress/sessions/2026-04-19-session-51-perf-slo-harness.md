# 세션 51 — 성능 SLO 측정 하네스 skeleton (Foundation 릴리스 게이트 충족)

- **날짜**: 2026-04-19
- **참여**: geny-core
- **연관 스트림**: Platform / Infra (docs/14 §9), Pipeline
- **관련 세션**: 44 (worker-generate skeleton), 47 (ADR 0006), 50 (geny_queue_* 카탈로그)
- **관련 gate**: `docs/14 §10` 릴리스 게이트 "성능 SLO 초과 없음"
- **산출물**: `scripts/perf-harness.mjs` · `scripts/perf-harness.test.mjs` · `scripts/test-golden.mjs` step 20 · `docs/02 §12.4` · INDEX §3/§4/§6/§8

---

## 배경

세션 48 에서 Foundation 릴리스 게이트 3축 중 보안 스캔 + 온콜 런북을 채웠다 (`docs/14 §10`). 남은 1축이 "성능 SLO 초과 없음" — INDEX §6 에 **"측정 인프라 부재"** 로 7주간 박혀 있던 체크박스.

세션 50 에서 `geny_queue_duration_seconds` 메트릭을 카탈로그에 고정했지만, 그 메트릭의 **수요 측 (consumer)** 이 없다. "수요 측 없는 공급" 은 메트릭이 실제로 유용한지 모른다는 뜻이다. SLO 하네스가 첫 수요자가 된다 — 단지 Foundation 수준에서는 BullMQ 드라이버가 없어 `geny_queue_duration_seconds` 자체를 방출하지 못하므로, 하네스는 **HTTP 관측** 으로 대용한다 (`POST /jobs` → `waitFor(id)` → terminal). 드라이버가 교체되면 하네스가 `geny_queue_duration_seconds` 히스토그램 버킷과 교차 검증하는 두 번째 지점이 된다 (세션 53+ 범위).

게이트가 요구하는 것은 "측정한다" 이지 "프로덕션 SLO 를 만족한다" 가 아니다. Foundation 은 실 벤더 부하도 없고 (Mock 만), K8s 클러스터도 없다 (`infra/helm/observability` 는 배포 준비 상태). 따라서:

- **측정**: 하네스가 실제로 돌아 숫자를 낸다 ✓ — 이 세션에서 달성.
- **임계 대비**: Foundation Mock 파이프라인 기준의 합리적 숫자를 SLO 로 선언, CI 에서 완화 버전으로 회귀. 실 벤더 staging SLO 는 별도 세션.

## 설계 결정

### D1. 도구 선택 — k6/autocannon 대신 pure Node

대안:

- **k6**: Go 바이너리 + ES modules 제한적 + 별도 CI setup step. 기능은 강력하지만 Foundation 의 "pure Node, no external binary" 패턴을 깬다 (sync-observability-chart.mjs · physics-lint.mjs 도 전부 mjs).
- **autocannon**: Node 기반이지만 추가 의존성 1. HTTP 만 쏘기 때문에 POST→GET polling 체인을 스스로 다시 써야 함 (waitFor 편의 없음).
- ✅ **pure Node (`scripts/perf-harness.mjs`)**: `@geny/worker-generate` 를 in-process 로 기동 → 실 HTTP 경로 유지하면서 `store.waitFor(jobId)` 편의 재사용. 추가 의존성 0, `node scripts/perf-harness.mjs` 한 줄.

부가 이점: 하네스 코드가 repo 에 살아서 **실 API 계약과 함께 리뷰** 된다. 외부 툴은 프로덕션 계약과 분기될 위험 (autocannon config 파일이 오래되어 실 엔드포인트와 어긋나는 흔한 패턴).

### D2. 측정 축 — accept vs orchestrate 분리

`POST /jobs` 가 202 로 돌아오는 순간과 잡이 terminal 에 도달하는 순간 사이에는 큐 대기 + orchestrate 전체 chain 이 있다. 둘을 **하나의 latency** 로 보면 병목이 어디인지 모른다.

- `accept_latency_ms` — POST → 202. router + submit 오버헤드만.
- `orchestrate_latency_ms` — POST → terminal. accept + 대기 + orchestrate + hook.

두 축 분리로 "라우터가 느려졌나 (accept p95 악화)" 와 "파이프라인이 느려졌나 (orchestrate p95 악화)" 를 구분 가능. docs/02 §12 의 "예상 병목" 표 (AI 벤더 쿼터 / GPU / CPU 후처리 / DB 쓰기) 중 어디가 먼저 티어지는지 측정 가능해짐.

**세션 50 의 `geny_queue_duration_seconds` 가 드라이버 구현 후** 세 번째 축(큐 대기)을 메우게 된다 — orchestrate = accept + queue + work 분해.

### D3. SLO 임계 — Foundation Mock 기준, 완화본 2종

실제 임계를 얼마나 엄격히 설정할지가 제일 어려운 결정. 접근:

| 지표 | **본 SLO** (기본 실행) | **Smoke SLO** (CI 회귀) | 근거 |
|---|---|---|---|
| `accept_latency_ms` p95 | 100ms | 500ms | 라우터 + submit 는 in-memory 작업. CI 머신 여유까지 감안. |
| `orchestrate_latency_ms` p95 | 500ms | 2000ms | Mock 어댑터의 시뮬레이션 latency(30~300ms 랜덤) + 오케스트레이션 overhead. |
| `orchestrate_latency_ms` p99 | 1500ms | 5000ms | tail — CI 의 일시 GC/스케줄링도 허용. |
| `error_rate_ratio` | 0.01 | 0.05 | Mock 은 고정 시드로 성공. 1% 는 환경 노이즈, 5% 는 CI 완화. |
| `throughput_jobs_per_s` | 10 | 1 | 개발 하드웨어 최저선. CI 러너는 더 느릴 수 있음. |

Smoke 세트는 `test:golden` step 20 에서 20 잡/concurrency 4 로 돌린다 — 1초 이내 완료, 쉽게 통과. 본 세트는 수동 (`node scripts/perf-harness.mjs`) 또는 미래의 nightly 잡.

실측 (M1 Mac, 50 jobs × C=8): accept p95 8ms, orch p95 8ms, tput 3333/s, err 0 — 본 SLO 여유로 통과.

### D4. SLO 임계 초과 대응 — exit code + violations 배열

단순 boolean pass 만 돌려주면 "어느 지표가 왜 틀어졌나" 를 또 읽어야 함. `violations: [{slo, observed, limit}]` 배열을 첨부:

- 회귀 PR 저자가 `[perf] ✖ SLO violations: - orchestrate_latency_ms_p95: observed=612 limit=500` 만 봐도 원인 축 즉시 식별.
- 미래 nightly 러너가 이 배열을 CloudWatch/Prometheus 에 푸시해 대시보드로 축적 가능.

exit code 규약: 0=pass, 1=SLO 위반, 2=하네스 자체 크래시. CI 는 1/2 모두 fail 처리.

### D5. 왜 in-process — subprocess 대비

subprocess (별도 Node 프로세스에 main.js 실행 후 localhost:PORT 로 HTTP) 가 더 "현실적" 이지만:

- 프로세스 간 jitter 가 추가돼 **오차가 더 크다** (실제 fleet 측정에선 자연스럽지만 CI 는 재현성이 우선).
- worker 내부 상태 (`store.waitFor`) 에 직접 접근 가능 → HTTP polling 오버헤드 제거.
- 실패 진단 시 스택 트레이스가 하나의 프로세스에 붙음.

subprocess 경로는 실 벤더 staging 세션 (세션 54 후보) 에서 도입. Foundation 의 in-process 하네스는 "파이프라인 오버헤드 bound" 측정에 최적화.

### D6. `jobs=0` 엣지 케이스를 계약에 포함

스모크 테스트 3번째 케이스가 `jobs=0`. 실무에선 없는 호출이지만, **0-division 방지** 와 **empty-state 보고서 shape 유지** 를 계약으로 못박는다 — 향후 누군가 "동적으로 N 을 산정해서 혹시 0 이 되는" 호출 경로를 만들어도 하네스가 깨지지 않도록.

이 케이스에서는 `throughput_jobs_per_s_min` 위반만 발생 (0 < 1) — 다른 지표는 모두 0 으로 안정적. violations 1건 = pass=false 이지만, 크래시 없이 보고서를 반환.

### D7. 임포트 경로 — 패키지 vs 상대 경로

하네스는 `scripts/` 에 있고, `scripts/` 는 workspace package 가 아니다 (`package.json` 에 workspaces 선언 없음). pnpm 워크스페이스 resolver 가 `@geny/worker-generate` 를 찾지 못함.

선택지:
- 루트 `package.json` 에 `@geny/worker-generate` 를 devDep 으로 추가 → 루트에서도 workspace: 참조 가능. 변화 작지만 scripts/ 가 "빌드된 dist 만 소비" 한다는 명시성 약해짐.
- ✅ **상대 경로 `../apps/worker-generate/dist/index.js` 직접 import** — 하네스가 "이미 빌드된 dist 를 사용한다" 는 계약을 문법으로 드러냄. `test-golden.mjs` step 20 가 step 19 (worker-generate tests, dist 빌드 포함) 뒤에 오도록 순서 고정.

## 실제 변경

- `scripts/perf-harness.mjs` (신규, 235 lines)
  - `runHarness(overrides)` 공식 export — 테스트/외부 driver 에서 재사용.
  - CLI 엔트리 `--jobs N --concurrency C --smoke --report PATH`.
  - `InMemoryMetricsRegistry` 는 쓰지 않음 (세션 36/50 의 `@geny/metrics-http` scrape 체인은 별도 — 하네스는 HTTP 관측 기반).
  - 보고서: `{schema, timestamp, config, slo, stats, violations[], pass}`.
  - `process.hrtime.bigint()` 로 nanosecond 정밀도 → ms 로 환산.
- `scripts/perf-harness.test.mjs` (신규, 60 lines)
  - case 1: 20 jobs / concurrency 4 smoke → pass + shape 검증.
  - case 2: `orchestrate_latency_ms_p95` 임계 0.001ms 강제 → violations 포함 확인.
  - case 3: `jobs=0` 엣지 → throughput 위반 1건 만.
- `scripts/test-golden.mjs`
  - STEPS 배열에 `{ name: "perf-harness smoke", run: runPerfHarnessSmoke }` 추가 (19→**20 step**).
  - `runPerfHarnessSmoke()` 가 `node scripts/perf-harness.test.mjs` 실행.
  - 파일 상단 주석의 step 목록에 20 추가.
- `docs/02-system-architecture.md`
  - §12.4 "성능 SLO 측정 하네스 (Foundation)" 신규 서브섹션 — 하네스 위치 · 측정 지표 4종 · SLO 임계 표 5행 · CI 게이트 · 실 벤더 부하 추후 경로.
- `progress/INDEX.md`
  - §3 Platform 행 말미에 perf-harness 문장 + "docs/14 §10 3축 전부 ✅".
  - §4 row 51 신규 (row 50 뒤).
  - §6 성능 SLO 체크박스 [ ] → [x], "골든셋 회귀" 라인의 step count 19→20, session 51 참조.
  - §8 rotate — 51 제거, 52/53 유지, 54 신규 (실 벤더 staging 부하).

## 검증

- `pnpm run test:golden` → **20/20 step pass**.
- step 20 (perf-harness smoke) — 3 cases 통과, smoke run 약 115ms.
- 수동 `node scripts/perf-harness.mjs` (50 jobs × C=8) — accept p95 8ms · orch p95 8ms · tput 3333/s · err 0 → pass.
- validate-schemas `checked=186` 불변.

## Follow-ups

- **세션 53 (BullMQ 드라이버)**: 드라이버 배선 후 하네스 보고서에 `geny_queue_duration_seconds` 히스토그램 버킷과 `orchestrate_latency_ms` 를 교차 검증. 두 값이 일치해야 (±오차) 메트릭 계약이 정확함.
- **세션 54 (실 벤더 staging 부하)**: `--http` 플래그 + `createHttpAdapterFactories` 로 nano-banana sandbox 엔드포인트 상대. 네트워크 포함 p95 기준선을 **별도 SLO profile** 로 저장 (현 SLO 는 "Mock"; 새 profile 은 "staging-nano-banana").
- **장기 (β/GA)**: SLO report JSON 을 Prometheus pushgateway 또는 CloudWatch 로 푸시해 장기 추세. 1회성 측정이 아닌 **시계열 SLO 대시보드** 로 진화.

## 커밋

- `scripts/perf-harness.mjs`
- `scripts/perf-harness.test.mjs`
- `scripts/test-golden.mjs`
- `docs/02-system-architecture.md`
- `progress/INDEX.md`
- `progress/sessions/2026-04-19-session-51-perf-slo-harness.md`
