# 세션 77 — Observability e2e 오케스트레이션 (`observability-e2e.mjs`)

**일자**: 2026-04-20
**워크스트림**: Platform / Observability
**선행 세션**: 세션 75 (observability-smoke 검증 전용 스크립트 + snapshot), 세션 76 (파서 단위 테스트 + golden step 승격)

---

## 1. 문제

세션 75 `observability-smoke.mjs` 는 **검증 전용** — 실 Redis + producer/consumer + 스모크 부하가 이미 올라가 있어야 의미 있는 결과가 나온다 (D2 SoC). 로컬 개발 루프에서 매번 4 터미널을 따로 띄우고 순서대로 실행해야 하며, 실수로 하나를 빠뜨리면 진단이 어렵다.

세션 76 이 파서 회귀 방어(가벼운 path)를 golden step 22 로 승격했지만, "전체 파이프라인이 end-to-end 로 동작" 하는지 한 커맨드로 확인하는 경로가 아직 없다.

세션 77 은 **오케스트레이션 스크립트** 를 제공 — 향후 CI 의 `bullmq-integration` lane 에 승격할 때 체크리스트 역할도 겸한다.

---

## 2. 변경

### 2.1 `scripts/observability-e2e.mjs` 신규

**파이프라인**:
1. `docker run --rm -d --name geny-obs-e2e -p 6382:6379 redis:7.2-alpine --maxmemory-policy noeviction` (기본) 또는 `--reuse-redis` 로 이미 떠있는 Redis 재사용.
2. Redis `PING` 루프 대기 (최대 6s) — docker run `-d` 후 서비스 준비까지 수백 ms 지연 가능성 방어.
3. Producer (port 9091) + Consumer (port 9092, `--concurrency 4`) spawn, `/healthz` 폴링.
4. `scripts/perf-harness.mjs --jobs 20 --concurrency 4 --queue-name geny-obs-e2e --target-url http://127.0.0.1:9091` 스모크 부하 투하.
5. `scripts/observability-smoke.mjs --producer-url --consumer-url --expect-enqueued 20 --expect-ai-calls 20` 검증.
6. `finally` 블록에서 `cleanupTasks` 역순 실행 — consumer/producer SIGTERM(5s deadline → SIGKILL) + docker 컨테이너 제거.

**주요 CLI 플래그**:
- `--reuse-redis` (기본 false — docker container 기동)
- `--redis-url` (기본 `redis://127.0.0.1:6382` — 6379 와 충돌 회피)
- `--container-name` (기본 `geny-obs-e2e`)
- `--producer-port` (9091) · `--consumer-port` (9092)
- `--queue-name` (기본 `geny-obs-e2e`)
- `--jobs N` (20) · `--harness-concurrency H` (4) · `--consumer-concurrency C` (4)
- `--snapshot <path>` (선택 — observability-smoke 스냅샷 pass-through)

**오류 처리**: 모든 단계는 try/catch → `cleanupTasks` 가 역순 실행됨을 보장 (docker 컨테이너 남김 방지). exit code 1 + 에러 메시지 + 남긴 producer/consumer 로그 tail 800자.

### 2.2 CI 승격은 별도 세션

`scripts/test-golden.mjs` 에 본 스크립트를 step 으로 추가하지는 않음 (D3 아래). golden lane 은 docker 없이 돌도록 전제되어 있고, 본 스크립트 승격은 `bullmq-integration` lane (이미 Redis service container 보유) 재활용이 더 합리적 — 별도 세션에서 lane 의 `steps` 에 얹는다.

---

## 3. 검증

```
$ node scripts/observability-e2e.mjs
[e2e] reuse-redis=false redis=redis://127.0.0.1:6382 queue=geny-obs-e2e jobs=20
[e2e] redis container started geny-obs-e2e (redis://127.0.0.1:6382)
[e2e] redis PING OK
[e2e] producer OK — http://127.0.0.1:9091/healthz
[e2e] consumer OK — http://127.0.0.1:9092/healthz
[e2e] ── perf-harness smoke ──
[perf] driver=external queue=geny-obs-e2e target=http://127.0.0.1:9091 jobs=20 concurrency=4 run_ms=42
[perf] accept  p50=1.6ms p95=10.56ms p99=10.56ms
[perf] orch    p50=5.81ms p95=17.26ms p99=17.26ms
[perf] tput=476.19/s err=0 (0/20)
[perf] ✅ SLO pass
[e2e] ── observability-smoke ──
[obs-smoke] producer metric names: 6
[obs-smoke] consumer metric names: 6
[obs-smoke] union: 8
[obs-smoke] samples: enqueued=20 ai_calls=20 ai_dur_count=20 q_dur_count=20
[obs-smoke] ✅ all catalog §2.1 + §3 metrics present on union, samples above threshold
[e2e] ✅ observability e2e pass
[e2e] redis container removed
```

Cleanup 검증: `docker ps --filter name=geny-obs` 빈 결과, `pgrep -f worker-generate` 프로세스 남김 없음.

```
$ node scripts/test-golden.mjs
[golden] ✔ observability-smoke parser tests (55 ms)
[golden] ✅ all steps pass  (22/22 step 불변)
```

---

## 4. 주요 결정축

- **D1** — **docker lifecycle 을 스크립트 내부에서 관리**: `--reuse-redis` 가 없으면 `docker run --rm -d` → `docker rm -f` 를 본 스크립트가 책임. 로컬에서 "Redis 를 따로 띄워 두세요" 가이드보다 편의성이 크고, CI 로 승격 시에도 `--reuse-redis` 로 전환 스위치 하나만 켜면 됨.
- **D2** — **포트 6382 기본값**: 세션 72 는 6380, 세션 74 는 6380, 세션 75 는 6381. 각 세션이 "자기 격리" 하기 쉽게 6380~6382 를 다 쓰되, e2e 는 6382 를 기본값으로 고정 — 다른 세션 포트와 겹치지 않게 (로컬에서 여러 스크립트가 동시 돌 때 충돌 회피). `--redis-url` 로 override.
- **D3** — **golden step 미등록**: golden lane 은 workspace 빌드 + 단위 테스트 중심이고 docker dependency 도입은 lane 성격을 바꾼다. `bullmq-integration` lane 이 이미 Redis service container 를 띄우므로 그 lane 에 얹는 게 적합 — 단, service container 는 `docker run` 이 아닌 GH Actions `services:` 키로 자동 관리되므로 `--reuse-redis` + `REDIS_URL` 환경변수 path 를 타야 한다. CI 승격은 PR 별 세션에서 진행.
- **D4** — **cleanup try/finally 보장**: 테스트 실패든 정상 종료든 `cleanupTasks.reverse()` 역순 실행. 역순이 중요 — consumer/producer 는 Redis connection 을 열고 있으므로 Redis container 제거 전에 먼저 종료되어야 (duplicate connection 에러 억제).
- **D5** — **Redis PING 루프 + `/healthz` 루프 2단**: `docker run -d` 직후 바로 producer 시작하면 Redis 가 아직 listen 전이라 producer 가 `ECONNREFUSED` 로 죽음. 먼저 ioredis PING 으로 Redis ready 확인 → producer/consumer 순차 기동 + 각각 `/healthz` 폴링.
- **D6** — **perf-harness + observability-smoke subprocess 호출 (import 아님)**: 두 스크립트를 import 해서 함수 호출로 돌리면 coupling 상승 + 프로세스 종료 시점 불명확. subprocess + stdout passthrough 가 각 스크립트의 기존 CLI 계약을 존중.

---

## 5. 남긴 숙제

- **bullmq-integration CI lane 에 승격**: `.github/workflows/ci.yml` 의 해당 job 에 `pnpm -F @geny/worker-generate build` + `node scripts/observability-e2e.mjs --reuse-redis --redis-url $REDIS_URL` step 추가. 이 lane 의 Redis service container 는 이미 noeviction 정책이 강제되므로 `--reuse-redis` 로 바로 사용 가능. 별도 PR 로 분리.
- **실 Prometheus 스크레이퍼 승격** (세션 79 후보 예정 그대로): staging `kube-prometheus-stack` + ServiceMonitor → Grafana dashboard 에 실 데이터 렌더 확인.
- **실 벤더 어댑터 투입 후 스냅샷 diff**: `observability-e2e.mjs --snapshot ...` 를 nano-banana HTTP 어댑터 + real API key 조합으로 돌려 `geny_ai_call_total{vendor=nano-banana}` · `geny_ai_call_cost_usd` 실 분포 캡처. Mock 스냅샷(`infra/observability/smoke-snapshot-session-75.txt`) 과 diff 해 vendor-specific 값만 변화하는지 확인.
- **Windows dev 환경**: `docker` CLI 가 없는 개발자 대응 — 본 스크립트는 `--reuse-redis` 로 회피 가능하지만, "Redis 를 어떻게 띄울지" 가이드는 `scripts/README.md` 에 추가 필요 (별도 세션).

---

## 6. 결과

- `scripts/observability-e2e.mjs` 신규 — Redis docker + producer/consumer spawn + perf-harness smoke + observability-smoke validation 오케스트레이션. `--reuse-redis` 로 CI lane 재사용 가능.
- **한 커맨드 로컬 검증**: `node scripts/observability-e2e.mjs` → `[e2e] ✅ observability e2e pass`, 자동 cleanup.
- golden 22/22, validate-schemas checked=244, perf-harness test 7/7 불변 (본 스크립트는 golden 미등록 — D3).
- CI 승격은 `bullmq-integration` lane 에 별도 세션에서 얹음 (service container 재사용).
