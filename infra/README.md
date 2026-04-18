# infra/

Infrastructure as Code.

| 디렉터리 | 도구 | 역할 |
|---|---|---|
| `terraform/` | Terraform | 클라우드 리소스(VPC, EKS/GKE, RDS, S3/R2, Redis) |
| `helm/` | Helm | K8s 차트 (각 app/service) |
| `argo/` | Argo CD Application | GitOps 배포 |
| `observability/` | Prometheus / Grafana 선언형 config | 메트릭 카탈로그 · scrape · 알람 룰 · 대시보드 3종 (`docs/02 §9`) |

Foundation 단계: 스켈레톤만. 실제 작성은 Platform 워크스트림 세션.
`observability/` 는 세션 17 에서 Foundation Exit #3 대응으로 config 만 수립 — 런타임 배포는 Helm chart 세션.

## 환경 채널 (`docs/13 §7.3`)

`dev → staging → prod-canary → prod`
