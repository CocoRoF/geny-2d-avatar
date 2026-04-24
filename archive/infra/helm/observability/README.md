# geny-observability Helm chart

Geny 2D Avatar 플랫폼의 관측성 스택을 단일 Helm release 로 배포한다.

- **Prometheus** — `infra/observability/prometheus/prometheus.yml` + `rules/alerts.yml` ConfigMap 탑재
- **Alertmanager** — docs/02 §9.3 라우팅 (P1→PagerDuty / P2→Slack) templatized
- **Grafana** — docs/02 §9.2 대시보드 3종 (Job Health / Cost / Quality) + Prometheus 데이터소스 자동 provisioning

canonical 은 언제나 `infra/observability/` — chart 의 `configs/` 는 **sync 대상**. 편집 금지.

## Sync 워크플로

```bash
# canonical 수정 후:
node scripts/sync-observability-chart.mjs          # canonical → chart/configs 복사
node scripts/verify-observability-chart.mjs        # drift 검증 (CI 에서도 실행)
```

`test:golden` step 11 (`observability chart verify`) 가 drift 를 잡는다.

## 설치

```bash
# dev (emptyDir, 3d retention)
helm upgrade --install obs infra/helm/observability -f infra/helm/observability/values-dev.yaml

# prod (PVC, 30d retention, Secret 으로 알람 자격증명 주입)
helm upgrade --install obs infra/helm/observability -f infra/helm/observability/values-prod.yaml \
  --namespace observability --create-namespace
```

## 포트포워딩 (로컬 확인)

```bash
kubectl port-forward svc/obs-geny-observability-grafana        3000:3000
kubectl port-forward svc/obs-geny-observability-prometheus     9090:9090
kubectl port-forward svc/obs-geny-observability-alertmanager   9093:9093
```

Grafana 초기 자격증명은 `values.yaml` → `grafana.adminUser/adminPassword`. prod 는 Secret/SealedSecret 으로 주입.

## 환경별 override 규칙

- `values.yaml` — 기본값 (dev 가정)
- `values-dev.yaml` — emptyDir, 3d retention, noop 알람 채널
- `values-prod.yaml` — PVC 200Gi, 30d retention, 실 알람 채널 placeholder (`SECRET_*` 문자열 → external-secrets 로 교체)

환경별 **scrape config 자체가 달라야** 한다면 `infra/observability/prometheus.<env>.yml` 을 추가하고 sync 스크립트에 FILES 배열을 확장.

## 구조

```
infra/helm/observability/
├── Chart.yaml
├── values.yaml · values-dev.yaml · values-prod.yaml
├── README.md
├── configs/                      # canonical 동기본 (sync 스크립트가 쓴다)
│   ├── prometheus.yml
│   ├── alerts.yml
│   └── dashboards/{01,02,03}-*.json
└── templates/
    ├── _helpers.tpl · NOTES.txt
    ├── prometheus-config.yaml · prometheus.yaml
    ├── alertmanager-config.yaml · alertmanager.yaml
    └── grafana-config.yaml · grafana.yaml
```

## 보안 주의

- `values-*.yaml` 의 비밀 자격증명은 모두 **placeholder** 다. 프로덕션 배포 시 external-secrets / SealedSecret / Vault agent 로 교체.
- Grafana admin 패스워드는 Secret 으로 주입되며 env 로 노출된다. 운영에서는 OIDC/LDAP 로 전환 권장.
- Alertmanager 의 PagerDuty service key / Slack webhook 은 Secret 을 별도 ConfigMap 대신 참조하도록 prod 전환 시 리팩토링 (현 chart 는 단일 ConfigMap 에 평문 저장 — dev 전용 전제).

## 관련 docs

- [docs/02 §9 관측성](../../../docs/02-system-architecture.md#9-관측성-observability)
- [docs/13 §7.4 관측성 스택](../../../docs/13-tech-stack.md)
- [infra/observability/README.md](../../observability/README.md) — canonical config 문서
