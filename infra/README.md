# infra/

Infrastructure · 계약 자산.

2026-04-24 P0.3.1 — OFF-GOAL 배포 인프라 (`helm/{worker-generate,observability,redis}`, `observability/`, `docker-compose.staging.yml`) `archive/infra/` 로 이동. Phase 6 배포 시 재설계·복귀.

## 현재 남아있는 것

| 디렉터리 | 역할 |
|---|---|
| `adapters/` | `adapters.json` — AI 어댑터 카탈로그 (ALIGNED, ai-adapter-core 가 소비) |
| `palettes/` | `halfbody-pastel.json` — 색 팔레트 참조 (ADJACENT, Phase 3 텍스처 생성에 재활용) |
| `registry/` | `signer-keys.json` — license-verifier 테스트 fixture (RFC 8032 Test 1 공개 벡터) |

## Phase 6 배포 시 복귀 대상

- `archive/infra/helm/worker-generate/` — 큐 기반 생성 워커 chart (bullmq 재활성 조건)
- `archive/infra/helm/observability/` — Prometheus/Grafana chart
- `archive/infra/helm/redis/` — Redis chart (큐/캐시 용)
- `archive/infra/observability/` — Prometheus scrape config + Grafana 대시보드 + smoke snapshot
- `archive/infra/docker-compose.staging.yml` — staging dev 용 compose

Phase 6 에서 이들은 새 스코프 (프리셋+텍스처+Web UI)에 맞춰 재설계 필요. 그대로 복귀 금지.
