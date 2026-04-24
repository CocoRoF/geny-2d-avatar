# geny-redis Helm chart

ADR 0006 §D1 + [`progress/plans/bullmq-driver-prework.md §1`](../../../progress/plans/bullmq-driver-prework.md) 에서 고정된 BullMQ 백엔드 Redis wrapping chart.

두 가지 모드를 한 chart 에서 지원한다:

- **`mode: in-cluster`** (dev/CI 기본) — `redis:7.2-alpine` StatefulSet 을 primary 1 + readReplicas N 구성으로 기동.
- **`mode: external`** (prod) — managed Redis(AWS ElastiCache / GCP Memorystore / Upstash) 의 endpoint 를 Secret 으로만 주입. 본 chart 는 redis 자체를 배포하지 않는다.

어느 모드에서든 consumer(`worker-generate`) 는 동일한 Secret **계약** (`name + urlKey`) 으로 접속 URL 을 읽는다 — 모드 교체가 consumer manifest 를 흔들지 않는다.

## ADR 0006 §1.2 prod 요구사항

| 항목 | 본 chart 에서의 처리 |
|---|---|
| Redis 7.2+ | `inCluster.image.tag="7.2-alpine"` 하드 디폴트 |
| primary + 1 read-replica | `values-prod.yaml` 의 `replicas.primary=1, readReplicas=1` |
| maxmemory-policy=noeviction | `inCluster.config.maxmemoryPolicy="noeviction"` 하드 디폴트 — **override 금지**, 큐 키 축출 시 드러나지 않는 loss 발생 |
| Cluster 모드 거부 | 본 chart 가 Cluster 모드 배포 경로 자체를 노출하지 않음 |
| TLS rediss:// | `mode=external` 에서만 유효. `external.url` 또는 `external.existingSecret` 의 URL 스킴이 rediss:// 여야 함 |

## 설치

### dev — in-cluster

```bash
helm upgrade --install redis infra/helm/redis \
  -f infra/helm/redis/values-dev.yaml \
  --namespace geny-dev --create-namespace
```

consumer 에 주입:

```yaml
env:
  - name: REDIS_URL
    valueFrom:
      secretKeyRef:
        name: redis-geny-redis-connection
        key: REDIS_URL
```

`worker-generate` chart 는 이 Secret 이름을 자동으로 읽도록 설정돼 있다 (`redis.existingSecret`).

### prod — external (managed)

```bash
# 1. external-secrets 가 SSM/Secrets Manager 에서 REDIS_URL 을 sync 한 Secret 을 먼저 준비.
kubectl -n geny-prod create secret generic geny-redis-connection \
  --from-literal=REDIS_URL="rediss://user:pwd@primary.example:6380/0"

# 2. chart 설치 (external 모드).
helm upgrade --install redis infra/helm/redis \
  -f infra/helm/redis/values-prod.yaml \
  --namespace geny-prod
```

`mode=external` + `external.existingSecret` 지정 시 chart 는 Secret 을 렌더하지 않고 외부 Secret 을 그대로 재사용한다.

## 렌더 드라이런

```bash
helm template redis infra/helm/redis -f infra/helm/redis/values-dev.yaml
helm template redis infra/helm/redis -f infra/helm/redis/values-prod.yaml
helm lint     infra/helm/redis -f infra/helm/redis/values-dev.yaml
helm lint     infra/helm/redis -f infra/helm/redis/values-prod.yaml
```

## 구조

```
infra/helm/redis/
├── Chart.yaml
├── values.yaml · values-dev.yaml · values-prod.yaml
├── README.md
└── templates/
    ├── _helpers.tpl · NOTES.txt
    ├── configmap.yaml          # redis.conf + entrypoint.sh (primary/replica role 분기)
    ├── services.yaml           # headless + primary (+ replicas 선택)
    ├── statefulset.yaml
    └── connection-secret.yaml  # consumer 계약 — REDIS_URL 키
```

## 프로덕션 전환 체크리스트

- [ ] `external.existingSecret` 에 managed endpoint URL (rediss://) 주입
- [ ] managed 측 `maxmemory-policy=noeviction` 실측 확인 (CLI `CONFIG GET maxmemory-policy`)
- [ ] managed 측 Redis 버전 ≥ 7.2
- [ ] TLS CA bundle 이 consumer 이미지에 포함됐는지 (BullMQ ioredis 클라이언트 검증)
- [ ] 큐 길이 알람 (`geny_queue_depth`) 에 10분 임계 < 1k 적용 (`docs/02 §9.3`)

## 관련 docs

- [ADR 0006](../../../progress/adr/0006-queue-persistence.md)
- [bullmq-driver-prework §1](../../../progress/plans/bullmq-driver-prework.md)
- [docs/02 §8.2](../../../docs/02-system-architecture.md)
