# 세션 78 — observability-e2e 를 bullmq-integration CI lane 에 승격

**일자**: 2026-04-20
**워크스트림**: Platform / Observability / CI
**선행 세션**: 세션 69 (`.github/workflows/ci.yml` `bullmq-integration` lane 신설, redis:7.2-alpine service container + noeviction 강제 pre-step), 세션 77 (`scripts/observability-e2e.mjs` + `--reuse-redis` 토글)

---

## 1. 문제

세션 77 이 `scripts/observability-e2e.mjs` 를 로컬 한 커맨드 검증 경로로 만들었지만 (`[e2e] ✅ observability e2e pass` 수동 녹색), **회귀 방어** 는 아직 golden step 22 의 파서 단위 테스트(세션 76) 에만 의존 — 실 Redis 에 기반한 "모든 부품이 이어붙어 도는지" 는 CI 에서 자동 회귀되지 않는다. 예: `@geny/worker-generate` 가 `@geny/metrics-http` 를 import 하지 못하는 workspace 경로 버그, Helm chart 의 env 배선 drift, producer/consumer health endpoint 회귀 — golden + bullmq-integration 둘 다 놓칠 가능성.

세션 77 D3 가 "golden lane 미등록, `bullmq-integration` lane 승격이 적합" 을 결정했으므로 세션 78 은 그 승격을 실행.

---

## 2. 변경

### 2.1 `.github/workflows/ci.yml` — `bullmq-integration` lane 에 2 step 추가

기존 `BullMQ integration tests` 뒤에:

```yaml
- name: Build worker-generate chain
  run: |
    set -euo pipefail
    pnpm -F @geny/orchestrator-service build
    pnpm -F @geny/job-queue-bullmq build
    pnpm -F @geny/worker-generate build

- name: Observability e2e
  run: node scripts/observability-e2e.mjs --reuse-redis --redis-url "$REDIS_URL"
```

- **빌드 체인**: 기존 lane 은 `ai-adapter-core` 만 빌드 (job-queue-bullmq tsc 의 dist 의존 해소용). 세션 77 스크립트는 `apps/worker-generate/dist/main.js` 를 spawn 하므로 `orchestrator-service` → `job-queue-bullmq` → `worker-generate` 순으로 빌드 (workspace 의존 순서 존중).
- **`--reuse-redis` 토글**: `services.redis` 로 이미 noeviction 이 강제된 상태 (기존 pre-step 에서 `redis-cli config get` assert). `docker run` 을 치지 않고 PING→spawn→smoke→validation 만 수행.
- **env 전파**: lane level 의 `env.REDIS_URL = redis://localhost:6379` 가 step 에 상속 → `$REDIS_URL` 로 pass-through.

### 2.2 CI 실행 전 로컬 dry-run 검증

CI 에 밀기 전 `--reuse-redis` 경로를 로컬에서 시뮬레이션:

```
$ docker run -d --rm --name geny-obs-ci-dry -p 6383:6379 redis:7.2-alpine \
    redis-server --maxmemory-policy noeviction
$ node scripts/observability-e2e.mjs --reuse-redis \
    --redis-url redis://127.0.0.1:6383 --producer-port 9193 \
    --consumer-port 9194 --queue-name geny-ci-dry
... (4단계 전부 통과) ...
[e2e] ✅ observability e2e pass
```

docker container 는 본 스크립트 관리 대상이 아니므로(`--reuse-redis`) 별도 `docker rm -f` 로 수동 정리 — CI 환경은 service container 가 job 종료 시 자동 정리.

---

## 3. 주요 결정축

- **D1** — **lane 재사용 (`bullmq-integration`)**: 새 lane 을 만들지 않고 기존 `bullmq-integration` 에 step 2개 추가. 같은 Redis service container 를 공유 — 리소스 낭비 없고, "이 lane 이 Redis 관련 모든 회귀를 책임" 이라는 정체성 강화. 로그 이동도 한 곳.
- **D2** — **`--reuse-redis` 는 service container 가 이미 보증된 환경** — `bullmq-integration` lane 기존 pre-step 이 `redis-cli config get maxmemory-policy` 를 assert 하므로, `observability-e2e.mjs` 는 noeviction 을 재확인할 필요 없음 (D5 세션 77). 이중 체크는 lane pre-step 이 1순위.
- **D3** — **빌드 명시**: workspace 의존 순서를 `pnpm -F ... build` 3 step 으로 풀어 쓴 이유는 CI lean runner 에 dist 캐시가 없어서 (세션 70 교훈). `pnpm -r build` 는 불필요한 빌드 트리거 위험이 있어 범위 좁혀 실행.
- **D4** — **타임아웃 10분 유지**: 세션 69 의 `timeout-minutes: 10` 으로 충분. 로컬 실측 기준 전체 4단계가 5초 내 완료되므로 CI 의 Docker overhead 와 node/pnpm 부트스트랩 더해도 여유 충분.
- **D5** — **로컬 dry-run 필수**: CI 에 밀기 전에 `--reuse-redis` 경로를 로컬에서 시뮬레이션 — CI 환경 특이 이슈 (buffering / stdio 처리 / fileURLToPath path 해석) 를 실제 CI 시간 소모 없이 검출. 이번에는 정상 pass.
- **D6** — **기존 step 수정 없음**: 이미 녹색인 `BullMQ integration tests` step 은 건드리지 않음. 새 step 은 뒤에만 추가 — 실패 시 원인이 세션 78 변경에만 귀속.

---

## 4. 검증

### 로컬 `--reuse-redis` dry-run
```
$ docker run -d --rm --name geny-obs-ci-dry -p 6383:6379 redis:7.2-alpine redis-server --maxmemory-policy noeviction
$ node scripts/observability-e2e.mjs --reuse-redis --redis-url redis://127.0.0.1:6383 \
    --producer-port 9193 --consumer-port 9194 --queue-name geny-ci-dry
[e2e] reuse-redis=true redis=redis://127.0.0.1:6383 queue=geny-ci-dry jobs=20
[e2e] reusing existing redis at redis://127.0.0.1:6383
[e2e] redis PING OK
[e2e] producer OK — http://127.0.0.1:9193/healthz
[e2e] consumer OK — http://127.0.0.1:9194/healthz
[e2e] ── perf-harness smoke ──
[perf] tput=... err=0 (0/20)
[perf] ✅ SLO pass
[e2e] ── observability-smoke ──
[obs-smoke] union: 8
[obs-smoke] samples: enqueued=20 ai_calls=20 ai_dur_count=20 q_dur_count=20
[obs-smoke] ✅ all catalog §2.1 + §3 metrics present on union, samples above threshold
[e2e] ✅ observability e2e pass
$ docker rm -f geny-obs-ci-dry
```

### golden / validate-schemas 불변
```
$ node scripts/test-golden.mjs
[golden] ✅ all steps pass  (22/22 step)
```

### CI 검증
Push 직후 GitHub Actions `bullmq-integration` job 을 관찰. 기존 `BullMQ integration tests` step 은 변경 없음, 새 `Build worker-generate chain` + `Observability e2e` 2 step 이 green 확인.

---

## 5. 남긴 숙제

- **실 Prometheus 스크레이퍼 (세션 80 후보 재조정)**: staging cluster `kube-prometheus-stack` + ServiceMonitor. `infra/observability/smoke-snapshot-session-75.txt` 와 diff.
- **실 벤더 어댑터 투입 후 스냅샷**: `--snapshot <path>` 지정해 `observability-e2e` 로 nano-banana/sdxl/flux exposition 캡처 (비용 부담 있으므로 별도 세션 승인 필요).
- **web-editor 스캐폴드 (Foundation Exit #1 Editor 실측)**: UX 스트림 kick-off, 세션 79 후보.
- **e2e 실패 시 producer/consumer 로그 artifact 업로드**: 현재 실패 시 tail 800자만 stderr 출력 — `actions/upload-artifact` 로 전체 로그 보존하면 디버깅 편리. 별도 세션에서 추가.

---

## 6. 결과

- `.github/workflows/ci.yml` `bullmq-integration` lane 에 2 step 추가 (`Build worker-generate chain` + `Observability e2e`).
- **실 Redis 기반 e2e 회귀 CI 자동화**: `observability-smoke` union 계약 + producer/consumer health endpoint + worker-generate main.js spawn + perf-harness smoke 가 한꺼번에 CI 회귀 대상.
- 로컬 `--reuse-redis` dry-run pass 로 CI 에 밀기 전 검증 완료.
- golden 22/22, validate-schemas checked=244 불변.
- Foundation Exit #3 관측 증거: Foundation `/metrics` exposition + snapshot(세션 75) + 파서 회귀(세션 76) + 로컬 e2e(세션 77) + **CI 자동 회귀(세션 78)** 의 4단 방어망 완성.
