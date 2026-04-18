# 세션 24 — Observability Helm chart (Foundation Exit #3 완결)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 24
- 워크스트림: **Platform / Infra** (`docs/14 §9`) — 관측 스택 실 배포 가능 아티팩트
- 로드맵: Foundation Exit #3 "관측 대시보드 3종 기본 동작" (`docs/14 §3.3`)

## 1. 목표

세션 17 에서 선언형 config 로 고정한 관측 자산(Prometheus scrape / alert rule / Grafana dashboard 3)을 **실 K8s 클러스터에 한 줄로 배포 가능한 Helm chart** 로 승격. canonical config 와의 drift 를 CI 가 잡도록 동기 도구를 함께 둔다.

```
infra/observability/*.yml · *.json           (canonical — 세션 17)
   ↓ scripts/sync-observability-chart.mjs
infra/helm/observability/configs/**          (chart 사본, sync 강제)
   ↓ Helm template (.Files.Get / .Files.Glob)
ConfigMap (prometheus.yml / alerts.yml / dashboards/*.json)
   ↓ Deployment volumeMounts
Prometheus · Alertmanager · Grafana Pods
```

## 2. 산출물 체크리스트

- [x] `infra/helm/observability/Chart.yaml` — apiVersion v2, geny-observability v0.1.0
- [x] `values.yaml` + `values-dev.yaml` + `values-prod.yaml` — prometheus / alertmanager / grafana 서브섹션, emptyDir vs PVC, 알람 자격증명 placeholder
- [x] `configs/` — canonical 에서 동기된 5개 파일 (prometheus.yml + alerts.yml + dashboards/01-03)
- [x] `templates/_helpers.tpl` + `NOTES.txt` (port-forward 안내)
- [x] `templates/prometheus-config.yaml` · `prometheus.yaml` — ConfigMap(config + rules) + Deployment + Service + 옵션 PVC, `checksum/config` 기반 rolling restart
- [x] `templates/alertmanager-config.yaml` · `alertmanager.yaml` — docs/02 §9.3 라우팅 canonical (P1→PagerDuty / P2→Slack) templatized, inhibit rule 포함
- [x] `templates/grafana-config.yaml` · `grafana.yaml` — datasource provisioning (Prometheus 서비스 DNS) + dashboards provider + 3 dashboards ConfigMap (`.Files.Glob` 로 패턴 로드) + Secret 기반 admin 자격증명
- [x] `scripts/sync-observability-chart.mjs` — 단일 소스 복사 + `--check` drift 모드
- [x] `scripts/verify-observability-chart.mjs` — sync 호출 + Chart.yaml/values/templates 구조 + `Files.Get` 참조 검증 + 선택적 `helm template` 실행
- [x] `scripts/test-golden.mjs` — step 11 `observability chart verify` (총 11 step)
- [x] `infra/observability/README.md` — 배포 섹션을 "예정" → 실제 Helm chart 로 교체
- [x] `infra/helm/observability/README.md` — sync 워크플로, 환경별 install, port-forward, 보안 주의
- [x] `progress/INDEX.md` — Exit #3 ✅ + Platform/Infra 갱신 + Gate 섹션 11 step + 세션 24 row + §8 다음 세션 재정렬

## 3. 설계 결정 (D1–D5)

### D1. canonical 은 `infra/observability/` — chart `configs/` 는 **sync 대상**, 편집 금지

Helm chart 의 `.Files.Get "configs/..."` 는 **chart 디렉터리 내부 파일만** 로드 가능 (`../../observability/...` 는 helm package 가 제외). 심볼릭 링크는 OS/tar 이식성 문제. 따라서 chart 안에 동기본을 두되, 편집 규칙을 단일화:

- canonical 에서만 편집
- sync 스크립트가 byte 복사
- verify 스크립트 (= CI step 11) 가 drift 를 실패로 보고

대안(고려·기각): Helm `.Files.Get` 을 포기하고 Jinja 풍 렌더 스크립트를 별도 구현 → chart 관례를 깨뜨리고, OCI registry push 후 `helm pull` 흐름이 깨진다.

### D2. helm 바이너리 없이도 구조 검증이 동작해야 한다

CI 이미지에 helm 을 넣지 않기로 했다 (세션 24 범위는 artifact 생성 + drift 검증까지). `verify-observability-chart.mjs` 는:

1. `configs/` byte-equal (sync 스크립트 `--check`)
2. Chart.yaml 의 required 필드 (`apiVersion`/`name`/`version`/`appVersion`) regex 매치
3. values-*.yaml 존재 + 탭 문자 금지
4. 필수 템플릿 8개 존재
5. 템플릿에 `Files.Get "configs/prometheus.yml"` / `Files.Get "configs/alerts.yml"` / `Files.Glob "configs/dashboards/*.json"` 참조 존재

helm 이 `PATH` 에 있으면 `helm template` 을 `values-dev.yaml`/`values-prod.yaml` 두 번 실행해 렌더 에러도 잡는다 — **optional**. 로컬 개발자/배포 환경은 helm 이 있을 가능성이 높으니 이중 안전망으로 작동.

### D3. Alertmanager 라우팅은 **chart templatized** — canonical yaml 에 두지 않음

`infra/observability/` 는 "Prometheus 스크랩 + alert rule + Grafana dashboard" 의 선언형 config. Alertmanager 는 **라우팅 + 자격증명** 이라 환경별 override 가 필수(dev 는 noop, prod 는 PagerDuty 실키). 따라서 canonical 에 두지 않고 Helm template 에 두어 `values.*.yaml` 로 override.

routing 원칙은 `templates/alertmanager-config.yaml` 주석에 docs/02 §9.3 링크로 고정 — 규칙이 바뀌면 docs + chart 동기 수정.

### D4. `values-prod.yaml` 의 민감 값은 **placeholder 문자열**

`SECRET_PAGERDUTY_KEY` / `SECRET_SLACK_WEBHOOK` / `SECRET_GRAFANA_ADMIN` — 문자열 자체가 "여기는 secret 주입" 이라는 시그널. 실 배포는 external-secrets / SealedSecret / Vault agent 가 이 값을 교체한다. chart 자체에는 실 키가 절대 들어가지 않는다.

dev 는 `admin-dev-only` / `dev-null-noop` — 쓰기 쓸 수 없는 고정 문자열. CI 에서 `helm template` 이 렌더되는 것만 보장.

### D5. `checksum/config` 어노테이션으로 ConfigMap 변경 시 rolling restart

Prometheus 포드의 `annotations.checksum/config` = `sha256(configs/prometheus.yml)` + `sha256(configs/alerts.yml)`. canonical 이 바뀌면 sync 스크립트가 configs/ 를 갱신 → Helm diff 에서 체크섬이 변하고 Pod spec 이 변경돼 `kubectl apply` 가 Pod 를 재시작한다. ConfigMap 만 바뀌고 Pod 가 재시작되지 않는 일반적 함정을 방어.

Grafana 포드는 `toYaml .Values.grafana | tpl | sha256sum` 으로 동일 효과 — dashboards ConfigMap 은 sidecar/provisioning 이 30s 폴링하므로 restart 불필요, admin 자격증명 변경 시만 restart.

## 4. 검증 로그

```
$ node scripts/sync-observability-chart.mjs
[sync] infra/observability/prometheus/prometheus.yml → infra/helm/observability/configs/prometheus.yml
[sync] infra/observability/prometheus/rules/alerts.yml → infra/helm/observability/configs/alerts.yml
[sync] infra/observability/grafana/dashboards/01-job-health.json → infra/helm/observability/configs/dashboards/01-job-health.json
[sync] infra/observability/grafana/dashboards/02-cost.json → infra/helm/observability/configs/dashboards/02-cost.json
[sync] infra/observability/grafana/dashboards/03-quality.json → infra/helm/observability/configs/dashboards/03-quality.json
[sync] ✔ 5 files synced

$ node scripts/verify-observability-chart.mjs
[sync-check] ✔ chart configs in sync (5 files)
[verify] helm binary not found — skipping render check
[verify] ✔ chart infra/helm/observability OK (Chart.yaml + values + templates + configs sync)

# canonical 에 의도적 drift 주입 → verify 가 실패(exit 1) 하는지 회귀
$ echo "# drift" >> infra/observability/prometheus/prometheus.yml && node scripts/verify-observability-chart.mjs; echo "exit=$?"
[sync-check] DRIFT detected — infra/helm/observability/configs/ out of sync.
  - infra/observability/prometheus/prometheus.yml ↔ infra/helm/observability/configs/prometheus.yml
...
exit=1

$ pnpm run test:golden
[golden] ▶ validate-schemas              ✔
[golden] ▶ exporter-core tests           ✔
[golden] ▶ bundle golden diff             ✔
[golden] ▶ avatar bundle golden diff      ✔
[golden] ▶ web-avatar bundle golden diff  ✔
[golden] ▶ web-preview e2e                ✔
[golden] ▶ license-verifier tests         ✔
[golden] ▶ ai-adapter-core tests          ✔
[golden] ▶ ai-adapter-nano-banana tests   ✔
[golden] ▶ web-avatar dom lifecycle       ✔
[golden] ▶ observability chart verify     ✔
[golden] ✅ all steps pass
```

## 5. 교차 레퍼런스

- docs/02 §9 관측성 (메트릭 카탈로그 · 대시보드 3 · 알람 3)
- docs/13 §7.4 관측성 스택
- docs/14 §3.3 Foundation Exit #3
- 세션 17 — canonical config 신설 (이 세션의 패키징 대상)
- 세션 21 — `infra/registry/signer-keys.json` (인프라 디렉터리의 또 다른 선언형 자산; 세션 22+ 에서 동일 drift-check 패턴을 확장할 수 있다)

## 6. 다음 3세션 재정렬

Foundation Exit 모든 게이트가 코드로 close-out 됨 (Exit #1/2/3/4 전부 ✅ 혹은 자동 회귀). `progress/INDEX.md §8`:

- **세션 25**: AI 어댑터 2차 — `HttpNanoBananaClient` 실 HTTP + 벤더 에러 매핑 + SDXL/Flux-Fill 폴백 + 캐시 레이어.
- **세션 26**: Post-Processing Stage 1 (alpha cleanup) skeleton.
- **세션 27**: rig 확장 (v1.3 body) 혹은 Release Gate (Gitleaks/Trivy/k6).
