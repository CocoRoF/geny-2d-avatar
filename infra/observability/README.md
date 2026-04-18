# infra/observability/

Geny 2D Avatar 플랫폼의 관측성(Observability) 스택 선언적 구성.

삼각 측정(docs/02 §9.1):
- **Logs** — 구조화 JSON, `job_id + node_id + user_id` 공통 태그. (수집기는 세션 17 범위 밖.)
- **Metrics** — Prometheus scrape + recording/alerting rules. **이 디렉터리**.
- **Traces** — OpenTelemetry + Tempo. (OTLP collector 배포는 세션 17 범위 밖.)
- **Errors** — Sentry (프런트/백). SaaS 이므로 config 만.

## 구조

```
infra/observability/
├── README.md                          # 본 파일
├── metrics-catalog.md                 # 메트릭 이름·라벨 단일 진실 공급원
├── prometheus/
│   ├── prometheus.yml                 # scrape config (dev 샘플)
│   └── rules/
│       └── alerts.yml                 # 3종 P1/P2 알람 (docs/02 §9.3)
└── grafana/
    └── dashboards/
        ├── 01-job-health.json         # docs/02 §9.2 #1 — WSAC, 완주율, p50/p90 TTFE, 실패 상위10
        ├── 02-cost.json               # docs/02 §9.2 #2 — 벤더별 호출/비용, 단가, 캐시 적중률
        └── 03-quality.json            # docs/02 §9.2 #3 — 자동 검수 점수, 재생성율, 사람 리뷰 개입률
```

## 배포 (예정)

Helm chart (`infra/helm/observability/`) 로 K8s 에 배포 예정. 현재는 **선언형 config 만** 저장.

- Prometheus: 이 디렉터리의 `prometheus.yml` + `rules/*.yml` 을 ConfigMap 으로 탑재.
- Grafana: `dashboards/*.json` 을 sidecar(또는 K8s ConfigMap provisioning) 으로 자동 로드.
- 환경 채널별 override: `prometheus.{dev,staging,prod}.yml` 는 Helm values 계층에서 관리 (세션 17 범위 밖).

## 대시보드 설계 원칙

1. **docs/02 §9.2 의 3개가 Foundation 필수**. 추가 대시보드는 운영 필요에 따라.
2. 각 대시보드는 **질문 하나에 답**해야 한다. ("지금 돈이 얼마나 새고 있나?", "완주율이 떨어지고 있나?")
3. 시계열은 항상 5xx/에러율/지연을 나란히 — 원인 추적 효율.
4. 고카디널리티 라벨 (예: `job_id`, `user_id`) 은 **메트릭에 넣지 않는다**. Traces/Logs 에서만.

## 알람 채널 (예정)

- P1 (즉시 대응 필요): PagerDuty.
- P2 (근무 시간 내): Slack `#oncall-geny`.
- 알람 룰은 `prometheus/rules/alerts.yml` 에 Prometheus native rule 로 기술.

## 관련 docs

- [docs/02 §9 관측성](../../docs/02-system-architecture.md#9-관측성-observability)
- [docs/13 §7.4 관측성 스택](../../docs/13-tech-stack.md)
- [docs/15 §11 QA SLO](../../docs/15-quality-assurance.md)
