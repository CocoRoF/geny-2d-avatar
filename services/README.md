# services/

장기 실행 도메인 서비스. 앱(`apps/`) 과 분리되는 이유는 운영 경계(배포 단위/스케일/SLO) 가 다르기 때문.

| 디렉터리 | 역할 | 관련 docs |
|---|---|---|
| `orchestrator/` | 파이프라인 DAG 실행 — 초기 내부 JobRunner, β에서 Temporal 전환 | 02 §4, 13 §4 |
| `exporter/` | Cubism/Web/Unity 등 타겟별 익스포트 빌더 | 11 |

각 서비스는 자체 `README.md`, 이벤트 스키마 참조(`schema/`), 배포 스펙(`infra/helm/`) 을 소유한다.
