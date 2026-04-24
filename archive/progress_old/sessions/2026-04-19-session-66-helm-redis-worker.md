# 세션 66 — Helm chart 확장 (redis + worker-generate) & `perf-harness --driver bullmq`

- **날짜**: 2026-04-19
- **상태**: 완료
- **관련 ADR**: [0006 — 잡 큐 영속성 전략](../adr/0006-queue-persistence.md), [0005 — 리그 저작 게이트](../adr/0005-rig-authoring-gate.md)
- **관련 계획**: [`bullmq-driver-prework.md` §1, §4](../plans/bullmq-driver-prework.md)
- **관련 세션**: 53 (prework), 60/62/63 (bullmq 드라이버 X/X+1), 64/**65** (X+2 depth/consumer 분리), 17/24 (observability chart 패턴 레퍼런스)
- **범위**: ADR 0006 §D3 **X+3** Helm 배포 + **X+4 선행 배선** (perf-harness `--driver bullmq` CLI). 본 세션은 드라이런/단위테스트까지. 실 cluster rollout + Redis staging 회귀는 세션 67 예정.

---

## 1. 달성 목표

`bullmq-driver-prework.md §4` 로드맵 중 X+3 + X+4 두 단계를 Helm + CLI 수준에서 재료 공급:

```
infra/helm/
├── observability/      (세션 17/24)
├── redis/              ← 세션 66 신설 — wrapping chart (in-cluster dev + external prod)
└── worker-generate/    ← 세션 66 신설 — producer/consumer 2 Deployment
```

- `--role producer|consumer` (세션 65) 를 **생산 토폴로지로 번역** — 같은 이미지, 다른 flag, 두 Deployment.
- ADR 0006 §1.2 prod 요구사항 3종을 **chart 값에 하드 고정** — `maxmemory-policy=noeviction` · Redis 7.2+ · primary+replica.
- `scripts/perf-harness.mjs --driver bullmq` 로 X+4 staging 회귀 경로 **CLI 배선만** 완성 (실 Redis 위 실행은 세션 67).

## 2. 변경 파일

### 신규 — `infra/helm/redis/` (redis 7.2-alpine wrapping chart)

- `Chart.yaml` — apiVersion v2, name `geny-redis`, version 0.1.0, appVersion "7.2". ADR 0006 §1.2 요구사항 4종 (Redis 7+, primary + 1 replica, noeviction, Cluster 모드 거부) 을 description 에 명시.
- `values.yaml` — `mode: in-cluster|external` 토글이 차트의 심장:
  - `in-cluster` — `redis:7.2-alpine` StatefulSet, primary 1 + readReplicas N, 하드 디폴트 `maxmemoryPolicy: noeviction`.
  - `external` — managed endpoint(`rediss://`) Secret 참조만, 차트는 redis 자체 배포 없음.
  - `connectionSecret.{name,urlKey}` 계약 — consumer 가 동일 규약으로 Secret 을 읽어 모드 교체가 consumer manifest 를 흔들지 않음.
- `values-dev.yaml` — in-cluster, readReplicas=0, auth off, persistence off, RDB/AOF off. 프로세스 재시작 = 상태 초기화 (prework §1.1).
- `values-prod.yaml` — **기본 `mode: external`** (관리형 Redis). `external.existingSecret: "geny-redis-connection"` 로 external-secrets sync 결과 재사용. in-cluster 설정은 관리형 장애 시 fallback 용 기록.
- `templates/_helpers.tpl` — labels, fullname, headless/primary/replicas service name, primary pod FQDN, `inClusterUrl`, `connectionSecretName`.
- `templates/configmap.yaml` — `redis.conf` 고정 (maxmemory-policy, save, appendonly, bind, protected-mode=no) + `entrypoint.sh` (StatefulSet ordinal 기반 primary/replica 분기: ordinal≠0 → `--replicaof {fullname}-0 {port}`, auth 활성 시 `--requirepass/--masterauth` 주입).
- `templates/services.yaml` — headless service(stable DNS) + primary service (ordinal 0 only, `statefulset.kubernetes.io/pod-name` selector) + replicas service (readReplicas>0 시만).
- `templates/statefulset.yaml` — replicas = primary + readReplicas, `serviceName: headless`, volumeClaimTemplates 조건부 (persistence off 면 emptyDir).
- `templates/connection-secret.yaml` — consumer 가 secretKeyRef 로 참조할 Secret. `external + existingSecret` 시엔 렌더 skip (외부 Secret 재사용).
- `templates/NOTES.txt` — mode 별 접속 가이드 + ADR 0006 §1.2 체크리스트 출력.
- `README.md` — dev/prod 설치 예, ADR 요구사항 표, 드라이런 `helm template/lint` 명령.

### 신규 — `infra/helm/worker-generate/` (producer/consumer 2 Deployment)

- `Chart.yaml` — version 0.1.0, 세션 65 `--role` CLI 를 생산 토폴로지로 번역하는 chart 설명.
- `values.yaml` — 공통 `worker.driver` (기본 `bullmq` — ADR 0006 하드 디폴트) + `worker.queueName` + `worker.httpAdapters.{enabled,existingSecret}` + `redis.existingSecret`(geny-redis chart 계약과 일치: `redis-geny-redis-connection`).
  - `producer.{enabled,replicas,port,service,resources,extraArgs}` — `--role producer` 고정.
  - `consumer.{enabled,replicas,concurrency,port,service,resources,extraArgs}` — `--role consumer` + `GENY_WORKER_CONCURRENCY` env (CLI flag 미노출, 세션 67 후보 — Helm 측 선행 배선).
- `values-dev.yaml` — producer 1 / consumer 1 (concurrency 2).
- `values-prod.yaml` — producer 2 (HA) / consumer 3 (concurrency 8) + `httpAdapters.enabled: true` + `serviceMonitor.enabled: true`.
- `templates/_helpers.tpl` — fullname, labels, `commonArgs` (driver/queue-name/http/catalog), `commonEnv` (REDIS_URL secretKeyRef), `envFrom` (httpAdapters Secret), `catalogVolume`/`catalogVolumeMount`.
- `templates/producer-deployment.yaml` — 같은 이미지 + `args: [--role producer, --port {producer.port}, {commonArgs}]` + readinessProbe/livenessProbe `GET /healthz` on http port.
- `templates/consumer-deployment.yaml` — 같은 이미지 + `args: [--role consumer, --port {consumer.port}, {commonArgs}]` + `GENY_WORKER_CONCURRENCY` env + readiness/liveness `GET /healthz` on metrics port.
- `templates/services.yaml` — producer Service (http port, /jobs + /metrics) + consumer Service (metrics port, /metrics + /healthz). `prometheus.io/scrape=true` annotation 포함.
- `templates/servicemonitor.yaml` — `serviceMonitor.enabled` 시 producer + consumer 각각 ServiceMonitor CRD 렌더.
- `templates/NOTES.txt` — driver/queue/producer/consumer 요약 + bullmq 에서 producer/consumer 중 하나라도 disabled 면 경고.
- `README.md` — 토폴로지 ASCII 다이어그램 + 설치 순서(redis chart 먼저 → worker chart) + 주요 values 표.

### 수정 — `scripts/perf-harness.mjs`

- `--driver KIND` 옵션 추가 (`in-memory`(기본) | `bullmq`).
- `--queue-name N` 옵션 추가 (기본 `geny-perf`).
- `buildWorker(cfg)` 팩토리 헬퍼 신규 — in-memory 면 `createWorkerGenerate()` 그대로, bullmq 면 `REDIS_URL` 검증 → `ioredis` dynamic import → `createBullMQDriverFromRedis` → `createBullMQJobStore({ mode: "inline" })` 로 단일 프로세스 producer+consumer inline 실행. 종료 시 `client.quit()` cleanup 체인 연결.
- `report.config.{driver,queueName}` 추가 — 보고서 JSON 에 실행 경로 기록 (staging p95 대조 재료).
- `printReport` 상단에 `driver=... queue=...` 라벨 노출.

### 수정 — `scripts/perf-harness.test.mjs`

- Case 4 신규 — `report.config.driver` 필드가 렌더되는지 회귀.
- Case 5 신규 — `--driver bullmq` + `REDIS_URL` 미설정 경로는 explicit throw 로 **안전하게** 거절되는지 (Redis 를 띄우지 않고 가드 동작만 검증).

---

## 3. 설계 결정

### D1 — redis chart 는 "wrapping chart", 모드 토글 하나로 dev/prod 통합

prework §1.3 이 정의한 pattern 그대로. in-cluster(dev) 와 external(prod managed) 을 별도 chart 로 쪼개지 않은 이유:

- **consumer 계약이 고정됨** — 두 모드 모두 동일한 Secret 이름 + key 계약을 렌더. `worker-generate` chart 가 모드를 몰라도 됨.
- **dev→staging→prod 전환이 single `values-*.yaml` 교체** — 같은 release 이름 유지, chart 자체는 일관.
- **prod 장애 시 in-cluster fallback 경로 기록** — `values-prod.yaml` 의 in-cluster 블록이 placeholder 가 아니라 "관리형 outage 대응 recipe" 로 남음.

### D2 — `maxmemory-policy=noeviction` 은 chart 하드 디폴트, override 없음

`inCluster.config.maxmemoryPolicy: noeviction` 는 values.yaml 기본이고 values-dev/prod 에서 바꾸지 않는다. 큐 키가 축출되는 순간 "왜 잡이 없어졌나" 를 디버깅할 수 있는 단서가 전부 사라진다(**관측 블라인드**). chart 레벨에서 `allkeys-lru` 등으로 교체 가능하게 두면 운영자가 캐시 감각으로 값을 바꿀 여지. 별도 캐시용 Redis 는 다른 chart/DB 번호로 분리하는 게 옳다.

### D3 — primary + read-replica 는 StatefulSet 단일 집합 + entrypoint 분기

운영 성숙도가 올라가면 bitnami/redis 같은 성숙 subchart 를 `dependencies` 에 pin 하는 게 옳다. Foundation 범위에선:

- Helm `dependencies` + `pnpm`/`helm dep update` 추가 복잡도 회피.
- StatefulSet 1개 + `entrypoint.sh` 가 ordinal 로 role 결정 — 관리 경계 단순.
- `statefulset.kubernetes.io/pod-name={fullname}-0` selector 의 primary Service 로 BullMQ 가 read-replica 를 안 쓰는 설계와 일치 (ADR 0006 §1.2 — replica 는 관측/백업 용).
- readReplicas=0(dev 기본) 이면 replica 서비스 자체를 렌더하지 않음 (`gt (int .readReplicas) 0` 가드).

Cluster 모드는 chart 경로 자체에서 노출하지 않는다 (prework §1.2 "β 이전까진 거부" 반영).

### D4 — worker chart 는 **같은 image + 다른 `--role`** = 이미지 1회 빌드 규칙

producer/consumer 를 별 image/Chart 로 쪼개지 않는다:

- 세션 65 `CliArgs.role` 이 이미 CLI 수준 분기. Dockerfile 하나로 충분.
- `_helpers.tpl` `commonArgs` 가 driver/queue/http/catalog 를 두 Deployment 에 동일 주입 — Drift 방지.
- 버전 업그레이드 시 producer/consumer 가 강제 동일 버전 — 프로토콜 호환성 혼란 차단.

단점은 producer Deployment 가 consumer 코드 바이트까지 포함한다는 것 (수 MB 수준) — Foundation 에선 trade-off 가치 있음.

### D5 — `redis.existingSecret` 기본값 = `redis-geny-redis-connection`

release 이름이 `redis` 일 때 geny-redis chart 가 렌더하는 Secret 이름 규약 (`{release}-{chartname}-connection`). 다른 release 이름을 쓰려면 `values-*.yaml` 에서 override. 기본값을 **작동하는 조합** 으로 두는 게 독립 값 두 개를 매번 맞추라고 하는 것보다 덜 어리석다.

### D6 — `GENY_WORKER_CONCURRENCY` env 를 consumer Deployment 에 지금 주입

세션 65 `createBullMQConsumer(client, { concurrency? })` 는 이미 존재하지만 CLI flag 는 아직 없다 (세션 67 후보). Helm 쪽에서 env 를 **먼저** 주입해 두면:

- 세션 67 에서 `CliArgs.concurrency` + `process.env.GENY_WORKER_CONCURRENCY` 읽기만 추가하면 Helm 재배포 없이 override 경로 활성.
- chart 사용자가 "왜 values 에 있는 field 가 실제로 consumer 에 전달되지 않나" 의문을 막음 — idempotent upgrade.

### D7 — perf-harness `--driver bullmq` 는 **inline 모드**, producer/consumer 분리 아님

prework §4 X+4 가 요구하는 건 "Redis 붙은 staging 환경에서 p95 regression". 하네스는 단일 프로세스 내에서 BullMQ queue 를 거쳐 orchestrate 까지 다 한다 (mode="inline"). 실 consumer 프로세스 분리는:

- Helm chart 로 cluster 에 배포한 뒤 **외부에서 HTTP POST /jobs 만 날리는** 모드를 세션 67 에서 추가할 예정 (`--target-url` 옵션 정도).
- 본 세션의 inline 모드만으로도 in-memory vs BullMQ 의 오버헤드 차분은 측정 가능 — 이게 X+4 의 회귀 baseline.

### D8 — REDIS_URL 가드 테스트는 실제 Redis 없이 회귀

`perf-harness.test.mjs` Case 5 는 `delete process.env.REDIS_URL` 후 `driver: "bullmq"` 실행을 기대 — `buildWorker` 가 `throw new Error(...REDIS_URL...)` 를 던지는지만 검증. CI 에 Redis 를 띄우지 않고도 bullmq 분기 경로가 설치돼 있음을 증명 (실 실행은 세션 67 staging CI 레인).

---

## 4. 검증

### 단위 / 골든

- `node scripts/perf-harness.test.mjs` — 5 case 전수 pass (기존 3 + 신규 2).
- `node scripts/test-golden.mjs` — 21 step 전수 pass, 세부:
  - worker-generate 21 tests (세션 65 대비 불변)
  - perf-harness smoke 5 cases (기존 3 + 세션 66 +2)
  - job-queue-bullmq 22 pass + 4 skip (REDIS_URL 미설정 skip, 세션 62/65 대비 불변)

### Helm chart 검증

- **`helm lint` / `helm template` 은 본 환경(로컬)에 helm CLI 부재 → 명령 문서화만 수록**. 실 rollout 은 세션 67 staging cluster 에서 최초 실행.
- 정적 구조 검토:
  - `_helpers.tpl` naming — observability chart 와 동일 관례 (fullname/labels/selectorLabels).
  - StatefulSet selector ↔ headless Service selector ↔ primary Service selector 3단 일치.
  - `ServiceMonitor` CRD 는 `serviceMonitor.enabled=false` 기본 — CRD 없는 클러스터 설치 실패 방지.
  - `checksum/config` annotation 이 redis StatefulSet template 에 들어가 ConfigMap 변경 시 자동 pod rollout.

### validate-schemas / docs

- validate-schemas **checked=244 불변** (스키마 변경 0).

---

## 5. 남은 작업 / 세션 67 후보

1. **실 cluster 드라이런** — `helm lint infra/helm/redis -f values-dev.yaml` / `helm template` 을 CI 스텝에 추가. Helm CLI 가 없는 env 는 docker 기반 helm container 로 실행 가능.
2. **perf-harness `--target-url` 모드** — chart 로 배포된 producer Service 에 외부 harness 가 HTTP 만 날리는 경로 (consumer 프로세스 분리 실측).
3. **`QueueEvents` 기반 `geny_queue_duration_seconds` 정밀화** — enqueue→terminal 차분 (prework §4 X+2 마무리). 세션 65 는 consumer 처리 구간만 측정.
4. **`concurrency` CLI flag** — consumer Deployment 는 이미 env 로 값 주입 중, worker CLI 에 `--concurrency N` 을 추가해 `createBullMQConsumer(..., { concurrency })` 로 전달.
5. **`removeOnComplete` TTL 후 재제출 → 새 잡** 실 검증 (prework §2.4 포인트 4) — staging Redis 에서만 재현 가능.
