# 세션 69 — CI `bullmq-integration` lane + `docker-compose.staging.yml`

**일자**: 2026-04-19
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4 (staging 기반)
**선행 세션**: 세션 62 (redis-integration.test.ts `maybeTest` 가 `REDIS_URL` 없으면 skip), 세션 68 (duration 정밀화 — wait+process SLO 대조 준비)

---

## 1. 문제

`packages/job-queue-bullmq/tests/redis-integration.test.ts` 는 세션 62 에서 작성됐으나 `REDIS_URL` 미설정 시 `maybeTest` 가 4 case 를 전부 skip 한다. Foundation CI 는 redis infrastructure 미설정 → CI 가 통과해도 "실 Redis 에서 실제로 돌아간다" 는 증거가 없는 상태. 세션 68 에서 duration 정밀화 (wait+process) 를 마쳤지만 이 역시 실 Redis 에서 검증된 적 없음.

목표: Foundation golden lane 의 무-Redis 철학을 훼손하지 않으면서, 별도 CI job 을 통해 실 Redis 통합 경로를 자동 회귀한다.

---

## 2. 변경

### 2.1 `.github/workflows/ci.yml` — `bullmq-integration` job 신규

- `services.redis: { image: redis:7.2-alpine, options: --health-cmd redis-cli ping ..., ports: [6379:6379] }`.
- `env.REDIS_URL: redis://localhost:6379`.
- 기존 `golden` lane 과 **병렬 독립** — 한쪽 실패가 다른쪽을 막지 않는다.
- 실행:
  1. Checkout / pnpm 설치 / Node 22.11 / 의존성 설치.
  2. **Enforce noeviction policy** pre-step — `redis-cli -u $REDIS_URL config get maxmemory-policy | tail -n1 == "noeviction"` 단언. 이미지 기본값 회귀나 관리자 override 감지용 1-줄 guard.
  3. `pnpm -F @geny/job-queue-bullmq test` — `maybeTest` 4 case 가 자동으로 skip 해제 → 실 Redis 위에서 실행.

### 2.2 `docker-compose.staging.yml` (루트 신규)

로컬 dev 편의용 — 테스트/perf-harness 를 local 에서 돌릴 때 `docker compose up -d` 만으로 동일 환경 재현.

- `image: redis:7.2-alpine` (helm chart appVersion 과 정렬).
- `command: [redis-server, --maxmemory-policy, noeviction]` — 명시적 플래그 주입.
- `ports: 6379:6379` + `healthcheck: redis-cli ping`.

주석에 CLI 사용례 5 줄 문서화 (`docker compose up` → `export REDIS_URL` → 테스트/perf-harness 실행).

---

## 3. 결정축

### D1. 별도 `bullmq-integration` job — golden 과 병렬 독립

대안: 기존 `golden` job 안에 step 추가 + conditional service container. 기각 — service container 는 job 레벨 정의라 조건부 토글 불가, 또 bullmq 서비스 오작동 (redis 이미지 풀 실패 등) 이 schemas/exporter 회귀까지 막는 건 blast radius 가 과함. 독립 job 이 실패 격리에 유리.

### D2. `maxmemory-policy` runtime 검증 pre-step

BullMQ 는 `maxmemory-policy != noeviction` 에서 큐 데이터 eviction 가능 (ADR 0006 §1.2). redis:7.x 기본은 `noeviction` 이지만:

- 이미지 업그레이드로 기본값이 바뀌면 silent 회귀 (테스트는 지나가는데 prod 에서 잡 증발).
- 관리자가 `--maxmemory-policy allkeys-lru` 같이 override 하면 detect 불가.

`redis-cli config get` 으로 1-줄 단언하면 이 회귀가 CI 에서 즉각 붉은색. 비용 거의 0.

### D3. 테스트 포인트 4 는 본 세션에서 추가하지 않음

`redis-integration.test.ts` 의 파일 헤더 주석에 "포인트 4 는 `removeOnComplete` TTL 가 필요 — scale out 은 X+4 staging" 으로 예정돼 있다. 하지만 본 세션은 **lane 자체가 녹색 녹는지** 를 먼저 독립 검증한다. test 확장은 세션 70 으로 분리 — 한 세션 1 관심사 원칙.

### D4. perf-harness `--driver bullmq` 도 CI 에 넣지 않음

CI 호스트는 shared runner — p95/p99 측정이 noisy (동시 실행 job, CPU throttle, 네트워크 jitter). perf SLO regression 대조는 전용 staging cluster (또는 local docker stack) 에서 돌려야 의미 있음. CI lane 은 "계약이 녹색 녹는지" 까지만.

---

## 4. 검증

| 명령 | 결과 |
|---|---|
| `node scripts/test-golden.mjs` | 21/21 step pass (변경 없이 재검증) |
| `docker compose -f docker-compose.staging.yml up` | **로컬 docker daemon 미가동(colima stopped)으로 미실행** — CI 에서 첫 실행 시 검증 예정 |
| `.github/workflows/ci.yml` YAML lint | 기존 두 job (`golden`, `secret-scan`) 구조와 동형 — action 버전 / pnpm 설정 재사용 |

- **원격 CI 결과 확인**: 푸시 후 GitHub Actions 에서 `bullmq-integration` 녹색을 확인해야 본 lane 이 실제로 동작함을 증명. 실패 시 세션 70 첫 작업 = 디버깅.
- BullMQ `Job.timestamp` 세션 68 경로 역시 이 lane 이 녹으면 실 Redis 에서 자동 회귀 — `processWithMetrics` `enqueuedAt` 은 기존 redis-integration 테스트엔 직접 붙지 않지만, `createBullMQConsumer` 경로가 사용되는 장래의 추가 테스트에서 자연 커버.

---

## 5. 다음 세션 후보

**세션 70 (강력 후보)** — lane 기반 확장:

- `redis-integration.test.ts` 에 ADR 0006 §2.4 포인트 4 (`removeOnComplete` TTL 경과 후 동일 jobId 재제출 → 새 잡) test 1 추가.
- `scripts/perf-harness.mjs --driver bullmq --concurrency 8 --jobs 2000` staging 실행 결과를 `docs/02 §12.4` SLO 표에 기록 (wait+process 정밀 duration 기준, 세션 68).
- helm CLI (docker container) 기반 `helm lint/template` CI step — 세션 66 부터 이월된 잔여.

---

## 6. 커밋 메시지 초안

```
ci(bullmq): redis:7.2-alpine service container + integration lane (세션 69)

- .github/workflows/ci.yml: bullmq-integration job 추가 (golden 과 병렬 독립)
- services.redis + REDIS_URL=redis://localhost:6379 env
- "Enforce noeviction policy" pre-step — redis-cli config get 으로 runtime 단언
- 기존 maybeTest 4 case (redis-integration.test.ts) 가 이 lane 에서 자동 실행
- docker-compose.staging.yml 루트 신규 — 로컬 dev 편의 (redis-server --maxmemory-policy noeviction)
- progress: INDEX.md §3 Pipeline · §4 세션 69 행 · §8 rotate

코드 변경 0 — infra/CI 만 추가. golden 21/21 불변.
관련 ADR: 0006 §D3 X+4 staging 기반.
```
