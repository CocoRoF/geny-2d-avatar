# infra/

Infrastructure as Code.

| 디렉터리 | 도구 | 역할 |
|---|---|---|
| `terraform/` | Terraform | 클라우드 리소스(VPC, EKS/GKE, RDS, S3/R2, Redis) |
| `helm/` | Helm | K8s 차트 (각 app/service) |
| `argo/` | Argo CD Application | GitOps 배포 |

Foundation 단계: 스켈레톤만. 실제 작성은 Platform 워크스트림 세션.

## 환경 채널 (`docs/13 §7.3`)

`dev → staging → prod-canary → prod`
