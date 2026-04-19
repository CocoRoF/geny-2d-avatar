# geny-worker-generate Helm chart

`apps/worker-generate` 의 K8s 배포 chart. **producer + consumer 2 Deployment** 토폴로지 (세션 65, ADR 0006 §D3 X+3).

## 배포 토폴로지

```
┌─────────────┐       ┌──────────────┐       ┌──────────────┐
│   HTTP      │──────▶│  producer    │──────▶│    Redis     │
│  (외부)      │       │  --role      │       │  (BullMQ Q)  │
│             │       │  producer    │       │              │
└─────────────┘       └──────────────┘       └──────┬───────┘
                            │                       │
                            │ /metrics              │ BullMQ poll
                            ▼                       ▼
                      Prometheus           ┌──────────────┐
                            ▲              │   consumer   │
                            │              │  --role      │
                            └──────────────│  consumer    │
                               /metrics    └──────────────┘
```

- **producer** — HTTP `/jobs` 수신, BullMQ `Queue.add()`. 메트릭: `geny_queue_enqueued_total{queue_name}` + `geny_queue_depth{queue_name,state}`.
- **consumer** — BullMQ `Worker`. 메트릭: `geny_queue_failed_total{queue_name,reason}` + `geny_queue_duration_seconds{queue_name,outcome}`.

두 Deployment 는 **같은 image** 를 공유하며 `--role` flag 로만 구분 — 이미지 1회 빌드로 두 역할 배포.

## 전제 — Redis Secret

본 chart 는 Redis 를 배포하지 않는다. `geny-redis` chart 가 렌더한 connection Secret 이름을 `redis.existingSecret` 에 맞춰 설치해야 한다.

```bash
# 1. redis chart 먼저
helm upgrade --install redis infra/helm/redis -f infra/helm/redis/values-dev.yaml -n geny-dev

# 2. worker-generate chart — redis-geny-redis-connection Secret 자동 참조
helm upgrade --install worker infra/helm/worker-generate -f infra/helm/worker-generate/values-dev.yaml -n geny-dev
```

## 설치

### dev

```bash
helm upgrade --install worker infra/helm/worker-generate \
  -f infra/helm/worker-generate/values-dev.yaml \
  --namespace geny-dev --create-namespace
```

### prod

```bash
# external-secrets 로 geny-adapter-keys, geny-redis-connection 을 먼저 sync.
helm upgrade --install worker infra/helm/worker-generate \
  -f infra/helm/worker-generate/values-prod.yaml \
  --namespace geny-prod
```

## 렌더 드라이런

```bash
helm template worker infra/helm/worker-generate -f infra/helm/worker-generate/values-dev.yaml
helm lint     infra/helm/worker-generate -f infra/helm/worker-generate/values-dev.yaml
helm lint     infra/helm/worker-generate -f infra/helm/worker-generate/values-prod.yaml
```

## 주요 values

| key | 기본값 | 설명 |
|---|---|---|
| `worker.driver` | `bullmq` | `in-memory` | `bullmq`. prod 는 bullmq 고정 |
| `worker.queueName` | `geny-generate` | BullMQ queue 이름 |
| `worker.httpAdapters.enabled` | `false` | `--http` flag — 실 벤더 호출 활성 |
| `worker.httpAdapters.existingSecret` | `""` | API key env 들을 담은 Secret |
| `redis.existingSecret` | `redis-geny-redis-connection` | geny-redis chart 가 만든 Secret |
| `producer.replicas` | 1 (dev) / 2 (prod) | HTTP /jobs 수신 replica |
| `consumer.replicas` | 1 (dev) / 3 (prod) | BullMQ Worker replica |
| `consumer.concurrency` | 4 | env `GENY_WORKER_CONCURRENCY` 로 주입 (세션 66 D6) → CLI `--concurrency N` fallback 으로 소비 (세션 67) |
| `serviceMonitor.enabled` | false | Prometheus Operator ServiceMonitor 렌더 |

## 구조

```
infra/helm/worker-generate/
├── Chart.yaml
├── values.yaml · values-dev.yaml · values-prod.yaml
├── README.md
└── templates/
    ├── _helpers.tpl · NOTES.txt
    ├── producer-deployment.yaml · consumer-deployment.yaml
    ├── services.yaml
    └── servicemonitor.yaml
```

## 관련 docs

- [ADR 0006](../../../progress/adr/0006-queue-persistence.md)
- [session 65](../../../progress/sessions/2026-04-19-session-65-consumer-queue-metrics.md) — `--role` CLI 분할 근거
- [catalog §2.1](../../observability/metrics-catalog.md) — 큐 메트릭 계약
