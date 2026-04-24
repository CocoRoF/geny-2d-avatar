# 세션 80 — Prometheus 스크레이퍼 prep: snapshot-diff 도구 + staging values + golden step 23

**일자**: 2026-04-20
**워크스트림**: Platform / Observability / Infra
**선행 세션**: 세션 75 (`infra/observability/smoke-snapshot-session-75.txt` Foundation 스냅샷 커밋), 세션 66 (`infra/helm/worker-generate/` ServiceMonitor 템플릿 + `serviceMonitor.enabled` 토글), 세션 78 (bullmq-integration lane e2e)

---

## 1. 문제

세션 75 가 Foundation `/metrics` exposition 을 `smoke-snapshot-session-75.txt` (4585B) 로 고정했지만, **"실 Prometheus 스크레이퍼가 같은 구조로 수집하는지"** 는 staging 클러스터 없이 검증 불가. 실 cluster 배선은 (a) kube-prometheus-stack 설치 + (b) worker-generate ServiceMonitor 활성화 + (c) `/metrics` 엔드포인트 실 수집 + (d) 수집 결과를 Foundation 스냅샷과 diff — 4단계인데 (a)(c) 는 cluster 가 있어야 한다. 본 세션은 cluster 없이 가능한 (b)(d) 를 prep:

- **staging values 파일** — `serviceMonitor.enabled: true` + kps operator matchLabels 관행 라벨 (`release: kube-prometheus-stack`).
- **diff 도구** — Prometheus exposition 두 파일의 **구조적 drift**(metric name 추가/삭제 + label key 집합 변화) 를 보고. sample 값 차이는 informational(트래픽/타이밍 변동 당연).

cluster access 가 생기면 `helm install -f values-staging.yaml` → `curl prometheus.../api/v1/...` → `node observability-snapshot-diff.mjs --baseline ... --current ...` 한 줄이면 승격.

---

## 2. 변경

### 2.1 `scripts/observability-snapshot-diff.mjs` 신규

- `parseExposition(text)` — 세션 76 `extractMetricNames` 확장. 각 metric 에 대해 `{ type, labelKeys: Set, sampleCount }` 수집. `# TYPE <name> <kind>` 선언 + 샘플 라인 합집합 등록, `_bucket`/`_sum`/`_count` 접미사는 base name 으로 축약(세션 75 D6 계약 상속).
- `diffExpositions(baseline, current)` — `{ added, removed, labelDrift, sampleCountDelta }` 리포트. structural drift 정의 = `added.length + removed.length + labelDrift.length > 0`. sample count delta 는 항상 informational(staging 실 트래픽 vs Foundation smoke 20잡은 태생적으로 다르다).
- escape 된 label value 안의 `,` / `"` 처리 — exposition 파서의 고전적 함정 방지 (테스트 case 3).
- CLI: `--baseline <path> --current <path> [--verbose]`, exit 0 = 구조 동일, exit 1 = drift, exit 2 = usage error.
- `fileURLToPath(import.meta.url) === process.argv[1]` 가드 — 테스트 import 시 `main()` 미실행(세션 76 관행).

### 2.2 `scripts/observability-snapshot-diff.test.mjs` 신규

8 assert/strict 케이스 — (1) histogram suffix 축약 + label key 수집 (2) TYPE-only 는 sampleCount=0 (3) escape label 방어 (4) 동일 → no drift (5) added/removed 감지 (6) label key missing/extra (7) sample count delta informational (8) **`smoke-snapshot-session-75.txt` self-diff 회귀 (8 metrics 확인)** — 이 마지막 케이스가 Foundation 스냅샷의 metric 수가 바뀌면 CI 즉시 탐지하는 guard.

### 2.3 `infra/helm/worker-generate/values-staging.yaml` 신규

- `worker.driver: bullmq` + `queueName: geny-generate-staging` (prod 와 분리)
- `worker.httpAdapters.enabled: false` — staging 은 Mock 어댑터만 (비용 0, snapshot diff 가 Mock 기준)
- `producer.replicas: 1` + `consumer.replicas: 1 concurrency: 4` — Foundation 경량 클러스터 가정
- `serviceMonitor.enabled: true` + `labels: { release: kube-prometheus-stack }` — kube-prometheus-stack operator 의 기본 `serviceMonitorSelector.matchLabels.release=<kps-release-name>` 계약. kps 를 다른 이름으로 설치한 클러스터면 이 라벨 덮어쓰면 됨.

### 2.4 `scripts/test-golden.mjs` — step 22 → **23**

`observability-snapshot-diff parser tests` 추가 (~57ms, @geny/* 빌드 의존 없음). Foundation 스냅샷 (smoke-snapshot-session-75.txt) 의 metric 수/이름이 바뀌면 self-diff 케이스가 자동 탐지.

---

## 3. 검증

```
$ node scripts/observability-snapshot-diff.test.mjs
  ✓ histogram suffix 축약 + label key 수집
  ✓ TYPE-only 는 sampleCount=0 + 빈 labelKeys
  ✓ escape 된 label value 안 쉼표/따옴표 방어
  ✓ 동일 exposition → no drift
  ✓ added/removed metric 감지
  ✓ label key missing/extra drift 감지
  ✓ sample count delta 는 informational
  ✓ smoke-snapshot-session-75.txt self-diff → 0 drift (8 metrics)
[obs-snapshot-diff-test] ✅ all checks pass

$ node scripts/test-golden.mjs
... (23 step, 全部 ✔) ...
[golden] ✔ observability-snapshot-diff parser tests (57 ms)
[golden] ✅ all steps pass
```

Chart 렌더 수동 검증 불가(로컬 `helm` 미설치) — session 66 에서 작성된 `templates/servicemonitor.yaml` 이 이미 `values.serviceMonitor.labels` + `values.producer.enabled` / `values.consumer.enabled` 분기를 처리하므로, staging values 는 기존 템플릿 계약을 override 만. `infra/helm/observability/` 와 달리 `infra/helm/worker-generate/` 는 `scripts/verify-*-chart.mjs` 류의 드리프트 검사 없음 — staging rollout 첫 시도 시 helm template 으로 검증 예정.

---

## 4. 주요 결정축

- **D1** — **structural drift ≠ sample drift**: diff 도구의 exit code 는 metric 이름/타입/라벨 키 변화에만 반응. 샘플 값 변화(카운터 증가, 히스토그램 _count 증분)는 informational 만 — 실 staging 의 트래픽은 Foundation smoke 와 다른 게 당연하고, "실 운영 중" vs "코드 릴리스" 를 혼동시키면 안 됨. 대시보드/알람은 metric 이름 + label 키로 쿼리하므로 구조 불변이면 운영 안전.
- **D2** — **label key 집합만 비교 (값 아님)**: 예컨대 `queue_name="geny-obs-75"` (Foundation) vs `queue_name="geny-generate-staging"` (staging) 같은 **값** 차이는 당연. key 가 `queue_name` 으로 일치하는지만 확인. 값 비교까지 하면 drift 오탐 폭증.
- **D3** — **`_bucket`/`_sum`/`_count` 접미사 축약**: 세션 75 D6 계약 상속. 카탈로그는 base name 으로 선언하므로 diff 기준도 base name.
- **D4** — **staging 은 Mock 어댑터만**: 실 벤더 HTTP 어댑터 투입은 세션 82 후보로 분리. 본 세션은 "Foundation smoke 와 동일 구조의 exposition 이 kps 로 수집되는가" 만 검증 — 실 API 비용 0.
- **D5** — **`release: kube-prometheus-stack` 라벨**: kube-prometheus-stack operator 가 기본 설치 시 `serviceMonitorSelector.matchLabels.release=<release-name>` 로 SM 를 선택. Helm release 이름이 다르면 override 가능한 구조. 업계 관행에 맞춤 — chart 를 일부러 kps 에 적대적으로 만들 이유 없음.
- **D6** — **self-diff 케이스 포함**: test 8 은 smoke-snapshot-session-75.txt 를 읽어 자기 자신과 diff. 파일이 변조되면(실수로 metric 추가/삭제) golden 이 즉시 빨간색. Foundation 스냅샷의 "동결" 을 코드화.
- **D7** — **golden step 승격**: 테스트 자체는 fs 읽기 + pure logic, @geny/* 빌드 의존 0 — 가장 저렴한 step 중 하나 (~57ms). 도입 비용 무시 가능.

---

## 5. 남긴 숙제

- **실 staging 배포**: (a) kube-prometheus-stack 설치 (b) `helm install worker-generate -f values-staging.yaml` (c) `curl ...prometheus/api/v1/query?query=geny_queue_enqueued_total` 로 metric 수집 확인 (d) `curl worker-generate.../metrics > current.txt` + `node observability-snapshot-diff.mjs --baseline infra/observability/smoke-snapshot-session-75.txt --current current.txt` 로 drift 0 확인. cluster access 가 생기면 1시간 내 완결.
- **Foundation Exit #1 Editor 실측** (세션 81 후보 유지): `apps/web-editor` 스캐폴드 + 파츠 프리뷰 로드 + 실 브라우저 육안. Foundation 마감 최종 잔여.
- **실 벤더 HTTP 어댑터 + snapshot diff**: 세션 82 후보. nano-banana/sdxl/flux HTTP 경로에선 `geny_ai_call_duration_seconds_bucket` 의 `le=` 라벨 값이 바뀌지 않는지 diff 로 확인 (라벨 **값** 변화는 informational 이지만, 버킷 경계가 hardcoded 인 스키마 이슈 차이).
- **`observability-snapshot-diff.mjs` 를 CI 승격**: `bullmq-integration` lane 의 `Observability e2e` step 뒤에 "e2e 로 방금 수집한 exposition 을 Foundation 스냅샷과 diff" step 추가 가능. 단, 세션 75 스냅샷은 producer+consumer 두 세션 분리 snapshot 을 합쳐놓은 형식이고 e2e 는 producer/consumer 을 한 번에 내므로 형식 호환을 먼저 맞춰야 함 — 별도 세션.

---

## 6. 결과

- `scripts/observability-snapshot-diff.mjs` 신규 — Prometheus exposition 구조적 drift 검사 CLI + export (`parseExposition`, `diffExpositions`). 8 케이스 단위 테스트 pass.
- `infra/helm/worker-generate/values-staging.yaml` 신규 — kps ServiceMonitor 활성화, Mock 어댑터, 경량 replicas.
- `scripts/test-golden.mjs` 22 → **23 step** (`observability-snapshot-diff parser tests`, ~57ms).
- Foundation Exit #3 관측 축이 snapshot 수집까지 이어질 준비 완료. cluster access 생기면 한 커맨드로 drift 0 확인.
