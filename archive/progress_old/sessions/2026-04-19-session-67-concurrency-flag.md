# 세션 67 — `--concurrency N` CLI flag (ADR 0006 §D3 X+4 partial · 세션 66 D6 loop closer)

**일자**: 2026-04-19
**워크스트림**: Platform / Pipeline
**관련 ADR**: [0006 Queue/Persistence](../adr/0006-queue-persistence.md) §D3 X+4 (partial)
**선행 세션**: 세션 66 (Helm chart 배포 외재화 — `GENY_WORKER_CONCURRENCY` env 선행 주입 D6)

---

## 1. 문제

세션 66 Helm chart (`infra/helm/worker-generate`) 의 **D6 — `GENY_WORKER_CONCURRENCY` env 선행 배선** 은 consumer Deployment 에 env 를 꽂아놓기만 했을 뿐, 실제로 `apps/worker-generate` 는 이 env 를 읽는 코드가 없었다. `createBullMQConsumer(client, { concurrency? })` (세션 65 X+2) 는 옵션을 받을 준비가 됐지만, main.ts 의 `runConsumer` 가 해당 옵션을 생략한 채 BullMQ 기본값(1) 로 떨어지는 상태. Helm values 에서 `consumer.concurrency: 4` 를 바꿔도 런타임 반영 0 — loop closer 가 누락된 것.

핵심 회귀 방지 요건:

1. CLI `--concurrency N` 이 우선권을 가지면서 env fallback 이 성립해야 한다 (운영자가 개별 pod 에서 override 할 수 있도록).
2. env 불량값(`GENY_WORKER_CONCURRENCY=banana`) 이 **silent 하게 기본값 1 로 degrade** 되면 Helm 운영자가 오타를 찾지 못한다 — explicit throw 가 필요.
3. parseArgs 를 단위 테스트로 회귀할 수 있어야 한다 — main.ts 의 서버/redis side-effect 없이.

---

## 2. 변경

### 2.1 `apps/worker-generate/src/args.ts` 분리 (신규)

`parseArgs` 를 main.ts 에서 별도 모듈로 추출. 기존 로직 보존 + 다음 추가:

- `CliArgs.concurrency: number | undefined` 필드.
- `--concurrency N` 플래그 — 정수 + 범위 [1, 256] 검증. 값 누락/비정수/범위 외는 explicit throw.
- env `GENY_WORKER_CONCURRENCY` fallback — CLI 미지정 + env 존재 시 사용. env 값도 동일 검증 통과 필요.
- `ParseArgsOptions.env?: NodeJS.ProcessEnv` — process.env 의존 주입 가능. 단위 테스트가 전역 env 뮤테이션 없이 검증 가능.
- 재사용 가능한 `parseConcurrency(raw, origin)` 내부 헬퍼 — CLI 와 env 양쪽에 동일 규칙 적용.
- `CONCURRENCY_ENV = "GENY_WORKER_CONCURRENCY"` 상수 export — 테스트가 매직 문자열을 재복제하지 않도록.

### 2.2 `apps/worker-generate/src/main.ts` 수정

- `CliArgs`/`DriverKind`/`Role`/`DEFAULT_QUEUE_NAME`/`parseArgs` 를 args.ts 에서 re-import.
- 로컬 정의 제거 (~60 LOC 감소) — 단일 진실 공급원 유지.
- `runConsumer` 에서 `createBullMQConsumer(client, { ..., ...(args.concurrency !== undefined ? { concurrency: args.concurrency } : {}) })` — `exactOptionalPropertyTypes` 안전 스프레드.
- `logBoundSummary` 의 consumer branch 에 `concurrency=${args.concurrency ?? "default(1)"}` 표기 — 런타임 검증용.

### 2.3 `apps/worker-generate/tests/args.test.ts` 신규

11 pure unit test (전역 env 미사용):

1. `parseArgs([], { env: {} })` 기본값 — concurrency undefined.
2. `--concurrency 8` 정상.
3. 범위 초과 (`0`/`257`) → `/1\.\.256/` throw.
4. 비정수 (`abc`/`3.5`) → `/정수/` throw.
5. 값 누락 (`--concurrency` 단독) → `/값 누락/` throw.
6. env fallback (`env: { GENY_WORKER_CONCURRENCY: "16" }`) → 16.
7. env 빈 문자열 → undefined (Helm 미세팅과 동일 취급).
8. CLI (`--concurrency 4`) + env (`32`) → 4 (CLI 우선).
9. env 불량값 (`banana`/`999`) → throw (silent 금지).
10. `--role consumer --driver bullmq --concurrency 12` 조합 OK (회귀).
11. `--role producer` (in-memory driver) 거부 — 세션 65 회귀.

### 2.4 Helm chart 주석 정리

세션 66 이 남긴 "CLI flag 미노출 — session 67 후보" 문구를 3곳에서 제거/갱신:

- `infra/helm/worker-generate/values.yaml` line 71~73 — "`--concurrency` CLI flag fallback 경로 (세션 67) 로 소비된다. 범위 [1, 256]" 로 갱신.
- `infra/helm/worker-generate/README.md` 주요 values 표 `consumer.concurrency` 행.
- `infra/helm/worker-generate/templates/consumer-deployment.yaml` env 블록 주석.

---

## 3. 결정축

### D1. env 불량값은 silent 무시 대신 explicit throw

대안: 일부 배포 시스템은 "env 값이 이상하면 기본값으로 fallback" 이 관용. 이 쪽을 택하지 않은 이유 — Helm 템플릿 오타(`{{ .Values.consumer.concurrency }}` 를 `{{ .Values.consuemr.concurrency }}` 로 잘못 쓰는 부류) 가 silent 로 기본값 1 에 떨어지면 "prod 에서 느리다" 는 증상만 남고 근본 원인을 찾기 어렵다. fail-fast 가 운영 debuggability 에 더 낫다고 판단. 단, **빈 문자열** 은 Helm 의 조건부 주입과 정렬되도록 "미주입" 과 동등 처리 — helm `{{ if .Values.x }}` 렌더 스킵과 대칭.

### D2. pure parseArgs 분리 — `import main.ts` side-effect 회피

main.ts 는 top-level `main().catch(...)` 로 import 즉시 서버/redis 초기화를 트리거한다. 테스트 파일이 `import { parseArgs } from "../src/main"` 하면 main() 이 실행돼 테스트 자체가 행동을 맞지 않게 된다. 해결책 후보: (a) `import.meta.url === process.argv[1]` 엔트리 가드 — Node ESM 에서 브리틀, 테스트 환경에서 false negative 가능. (b) args.ts 로 분리 — 명확한 관심사 분리 + 타입 export 도 단일 위치. (b) 채택. `ParseArgsOptions.env?` 도 이 설계와 짝 — 테스트가 `process.env` 를 오염시키지 않는다.

### D3. `--concurrency` 는 role 과 무관하게 surface 만 받되 consumer 에서만 소비

이유: BullMQ `Worker` 만 concurrency 개념을 쓰고 producer(`Queue`) 는 무의미. 하지만 미래에 producer 쪽 rate-limit 옵션(예: `p-limit` 로 enqueue 동시성 제한) 을 같은 flag 로 재사용할 여지가 있다 — 지금 role-specific 하게 강하게 거부하면 나중에 surface 를 바꿔야 함. 현재는 producer/both 에서 값을 받되 무시만 한다. (회귀 테스트가 이 무시 동작을 고정하지 않음 — 향후 변경 여지를 남김.)

---

## 4. 검증

| 명령 | 결과 |
|---|---|
| `pnpm --filter @geny/worker-generate test` | 32/32 pass (21 기존 + 11 신규 args) |
| `node scripts/test-golden.mjs` | 21/21 step pass (worker-generate 32 tests · perf-harness 5 case · job-queue-bullmq 22 pass + 4 skip 등) |

- Helm `helm lint/template` 드라이런: 환경에 `helm` CLI 미설치 — 주석 변경만이라 렌더링 영향 없음. docker helm container CI step 은 세션 68 후보로 유지 (세션 66 부터 이월).
- 실 Redis 통합 (docker-compose + `--driver bullmq` end-to-end, `QueueEvents` 차분): 세션 68 후보 — 본 세션은 code path 만 닫고 런타임 p95 regression 은 분리.

---

## 5. 다음 세션 후보

**세션 68 (강력 후보)** — staging Redis 기반 BullMQ 실 integration:

- `docker-compose.staging.yml` 에 redis:7.2-alpine + `maxmemory-policy=noeviction` (세션 66 D2 와 정렬).
- CI lane 에서 `REDIS_URL=redis://localhost:6379` 주입 → `pnpm --filter @geny/job-queue-bullmq test` 가 skip 하던 4 test 실행.
- `perf-harness --driver bullmq --jobs 2000 --concurrency 8` (세션 67 flag 활용) → in-memory baseline 대비 p95 overhead 측정, `docs/02 §12.4` SLO 표 확장.
- ADR 0006 §2.4 포인트 4 (`removeOnComplete` TTL 경과 후 동일 jobId 재제출 → 새 잡) 실 Redis 증거.
- `QueueEvents` enqueue→terminal 차분으로 `geny_queue_duration_seconds` 정밀화 (현재는 processor 구간 근사).
- helm `helm lint/template` CI step (docker helm container) — 세션 66 이월.

---

## 6. 커밋 메시지 초안

```
feat(worker-generate): --concurrency N CLI flag (세션 67 · 세션 66 D6 loop closer)

- apps/worker-generate/src/args.ts 신규 (parseArgs 분리, pure unit testable)
- CliArgs.concurrency + --concurrency N + env GENY_WORKER_CONCURRENCY fallback
- 범위 [1, 256] 검증, env 불량값 silent 무시 대신 explicit throw
- runConsumer → createBullMQConsumer({ concurrency }) 전달
- Helm values.yaml/README.md/consumer-deployment.yaml "CLI 미노출" 캐비어트 제거
- tests/args.test.ts 11 unit test 추가 (worker-generate 21→32)
- progress: INDEX.md §3 Pipeline · §4 세션 67 행 · §8 후보 rotate

관련 ADR: 0006 §D3 X+4 (partial), 세션 66 D6 loop closer.
```
