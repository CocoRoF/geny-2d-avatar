# 세션 79 — observability-e2e 실패 시 producer/consumer 로그 artifact 업로드

**일자**: 2026-04-20
**워크스트림**: Platform / Observability / CI
**선행 세션**: 세션 77 (`scripts/observability-e2e.mjs` 오케스트레이션 + stderr tail 800자 dump), 세션 78 (`bullmq-integration` lane 승격)

---

## 1. 문제

세션 77 D 블록은 실패 시 stderr 에 producer/consumer 로그 **tail 800자만** 노출. 세션 78 이 이걸 CI lane 으로 올린 뒤 실제로 "Build worker-generate chain" 단계 누락이 발견됐는데, 디버깅은 runner log 스크롤뿐 — worker bootstrap payload 를 통째로 보려면 재현이 필요했다.

향후 실 Redis 기반 e2e 가 플레이키해질 때 (네트워크 jitter · pod 재스케줄 · perf-harness ACK 슬립 조합) tail 800자는 가설 수립에 부족하다. 로그 전체를 artifact 로 남겨야 SIGTERM 이후 drain 라이프사이클 · Redis reconnect · orchestrate inner exception 까지 보존된다.

---

## 2. 변경

### 2.1 `scripts/observability-e2e.mjs`

- `--log-dir` 플래그 (기본 `artifacts/observability-e2e/`, repo root 기준). `mkdirSync(..., { recursive: true })` 로 기동 시 자동 생성.
- `startWorker(role, ...)` 가 `${LOG_DIR}/${role}.log` 를 `createWriteStream(flags:"w")` 로 열어 stdout+stderr 를 tee. 기존 in-memory `logs[]` 배열은 "not healthy" 타임아웃 시 stderr tail 800자 경로에서 여전히 사용 (세션 77 호환).
- `runSubprocess(cmd, args, { logName })` 이 선택적 파일 이름을 받아 `perf-harness.log` / `observability-smoke.log` 도 tee. process.stdout 패스스루 계약은 그대로.
- `perf-harness --report` 경로를 `/tmp/obs-e2e-harness.json` → `${LOG_DIR}/perf-harness-report.json` 으로 이동 — 성공/실패 양쪽에서 p50/p95 JSON 을 한 artifact 번들로 회수.
- 성공 경로 말미에 `console.log('[e2e] logs saved to ...')` 한 줄 추가 (CI 로그에서 artifact 위치 식별 도움).

### 2.2 `.github/workflows/ci.yml`

`Observability e2e` step 에 `id: observability-e2e` 부여 후, 뒤에 조건부 artifact 업로드 step 추가:

```yaml
- name: Upload observability-e2e artifacts on failure
  if: failure() && steps.observability-e2e.conclusion == 'failure'
  uses: actions/upload-artifact@v4
  with:
    name: observability-e2e-logs
    path: artifacts/observability-e2e/
    if-no-files-found: warn
    retention-days: 7
```

- 성공 시에는 artifact 를 만들지 않음 (GH Actions 저장공간 · 리스트 노이즈 방지). 주기적 snapshot 수집은 별도 경로(`--snapshot`) 로 분리.
- retention 7일 — 실패 회고에 충분, 장기 보관은 gitops 가 아닌 staging Grafana/Prometheus.
- `if-no-files-found: warn` — script 가 log 디렉터리 생성 전에 죽어도 lane 이 경고만 내고 실패 원인은 그대로 stderr.

### 2.3 `.gitignore`

`artifacts/` 추가 — 로컬 dry-run 시 로그가 워킹 트리에 남아 커밋되지 않도록.

---

## 3. 검증

### 로컬 dry-run

```
$ docker run -d --rm --name geny-obs-79-dry -p 6384:6379 redis:7.2-alpine \
    redis-server --maxmemory-policy noeviction
$ node scripts/observability-e2e.mjs --reuse-redis --redis-url redis://127.0.0.1:6384 \
    --producer-port 9195 --consumer-port 9196 --queue-name geny-session-79-dry
... (4단계 모두 pass) ...
[e2e] ✅ observability e2e pass
[e2e] logs saved to /Users/hrjang/.../artifacts/observability-e2e
$ ls artifacts/observability-e2e/
consumer.log              perf-harness-report.json
observability-smoke.log   perf-harness.log
producer.log
$ wc -l artifacts/observability-e2e/*.log
  2  consumer.log
 71  observability-smoke.log
  5  perf-harness.log
 22  producer.log
$ head -3 artifacts/observability-e2e/producer.log
[worker-generate] listening on http://127.0.0.1:9195 role=producer — ...
[worker-generate] job submitted: perf-0-5feceb66ff {"slot_id":"hair_front"}
[worker-generate] job submitted: perf-1-6b86b273ff {"slot_id":"hair_front"}
$ docker rm -f geny-obs-79-dry
```

5 파일 전부 기대 크기(200B ~ 2KB). producer 는 20잡 per-job trace + SIGTERM drain 라인까지, consumer 는 bootstrap + SIGTERM 라인, observability-smoke 는 8 메트릭 union + sample count JSON, perf-harness 는 p50/p95/tput summary + report.json (tput=476/s, err=0).

### golden 22/22 불변
```
$ node scripts/test-golden.mjs
[golden] ✅ all steps pass  (22/22 step)
```

### CI 실패 경로 수동 검증 불가

`if: failure()` 경로는 실 실패를 트리거해야 확인되는데, 고의 실패 커밋을 만들면 녹색 lane 이 오염돼 git log 가 지저분해진다. GH Actions `if: failure()` + `actions/upload-artifact@v4` 조합은 표준 이디엄이므로 문서 신뢰 — 다음 실 실패 이벤트에서 artifact 확인이 셀프-체크로 작동.

---

## 4. 주요 결정축

- **D1** — **실패 시에만 업로드**: 성공 시 artifact 를 남기지 않음. 이유 (a) GH Actions artifact 저장공간 (org tier 10GB 상한, 매 PR 마다 쌓으면 몇 주 만에 소진) (b) UI 의 "Artifacts" 섹션 시그널/노이즈 비율 — 실패 시 artifact 가 있을 때만 "볼 만한 게 있다" 는 가정을 유지. snapshot 수집은 별도 경로 (`--snapshot <path>` + 별도 스케줄 워크플로).
- **D2** — **tee (append 아닌 write-mode)**: 매 run 마다 덮어씀. 같은 runner 가 재시도되는 케이스에서 이전 run 의 잔여 로그와 섞이면 디버깅 역효과. 각 run 은 자기 run 의 로그만 본다.
- **D3** — **retention 7일**: staging 회고 주기(금요일) 한 번은 커버, 그 뒤엔 Grafana loki 로 끌어갈 것 (아직 미배선). 인시던트 P1 은 runbook §Postmortem 에서 artifact 링크를 바로 떼어 붙이면 됨.
- **D4** — **perf-harness `--report` 경로 이동**: `/tmp/obs-e2e-harness.json` 은 runner cleanup 시 사라져 artifact 수집 누락. `${LOG_DIR}/perf-harness-report.json` 으로 이동해 artifact 번들에 자동 포함.
- **D5** — **`if-no-files-found: warn`**: `error` 가 아닌 `warn`. script 가 mkdirSync 이전에 죽은 극단 케이스 (node 실행 자체 실패) 에서 이중 실패(실제 에러 + artifact 업로드 에러) 가 runner log 를 가리는 걸 방지 — 1차 실패 원인만 경로에 집중.
- **D6** — **artifact 이름 `observability-e2e-logs`**: 다른 lane/workflow 가 artifact 를 추가해도 이름 충돌이 없도록 기능-specific 네이밍. `logs` 같은 일반명 금지.

---

## 5. 남긴 숙제

- **실 Prometheus 스크레이퍼 (세션 80 후보 유지)**: staging cluster `kube-prometheus-stack` + ServiceMonitor. `infra/observability/smoke-snapshot-session-75.txt` 와 diff.
- **실 벤더 HTTP 어댑터 + `--snapshot` distribution 캡처 (세션 81 후보)**: nano-banana/sdxl/flux 실 호출 + `observability-e2e --snapshot` 으로 `geny_ai_call_cost_usd` 분포 실측.
- **Foundation Exit #1 Editor 실측 (세션 82+ 후보로 밀림)**: `apps/web-editor` 스캐폴드 + 실 브라우저 육안 승격. Foundation 마감 최종 잔여 — 별도 세션에서 fresh context 로.
- **Loki/Promtail 연동 (Runtime)**: 7일 retention artifact 는 staging 회고에 충분하지만 장기 추세 분석은 log aggregation 이 필요. 본 세션 범위 밖.

---

## 6. 결과

- `scripts/observability-e2e.mjs` — 5 로그 파일 (producer/consumer/perf-harness/observability-smoke + report.json) 을 `artifacts/observability-e2e/` 에 tee. 기존 stderr dump 경로 호환 유지.
- `.github/workflows/ci.yml` `bullmq-integration` lane — `Observability e2e` step 실패 시 `actions/upload-artifact@v4` 로 `observability-e2e-logs` artifact 생성 (retention 7일).
- `.gitignore` — `artifacts/` 패턴 추가.
- Foundation Exit #3 관측 **4단 방어망 + 실패 디버깅 증적** 완성: exposition(65/72) + snapshot(75) + 파서 회귀(76 golden) + 로컬 e2e(77) + CI 자동 회귀(78) + **CI 실패 artifact(79)**.
- golden 22/22 불변.
