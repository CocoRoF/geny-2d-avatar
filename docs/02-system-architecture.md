# 02. 시스템 아키텍처 (System Architecture)

> **목표**: 이 문서만 읽어도 "geny-2d-avatar가 어떤 부품으로 구성되고, 어떻게 데이터가 흐르며, 어디서 동기/비동기 경계가 나뉘는지" 를 엔지니어가 이해할 수 있게 한다.

---

## 1. 아키텍처 원칙 (Architectural Principles)

1. **파이프라인은 DAG(Directed Acyclic Graph)다.** 모든 생성 과정은 노드와 엣지로 표현 가능해야 하고, 재실행·부분 재실행·캐시가 가능해야 한다.
2. **모든 AI 호출은 교체 가능하다.** nano-banana, SDXL, ComfyUI, Imagen, 자체 파인튜닝 모델 무엇이 오더라도 동일한 어댑터 인터페이스 뒤로 숨긴다.
3. **결정론적 단계와 비결정론적 단계를 분리한다.** 정규화·후처리·검수는 결정론적(reproducible), AI 생성은 비결정론적. 시드·파라미터를 기록해 **"가능한 한" 재현** 가능하게 한다.
4. **모든 아티팩트는 콘텐츠 주소(content-addressable)다.** 해시 기반 ID + 버전 계보. 덮어쓰기 없음.
5. **프런트와 파이프라인은 이벤트로 느슨히 결합한다.** 긴 작업은 즉시 제출 + 진행상황 스트리밍.
6. **데이터와 메타데이터를 분리한다.** 큰 바이너리는 오브젝트 스토리지, 메타데이터는 트랜잭셔널 DB.
7. **스케일 유닛은 "작업(Job)" 이다.** GPU가 바쁠 때 큐 길이가 늘고, 워커를 늘리면 자연스럽게 해소된다.
8. **실패는 1급 시민이다.** 모든 노드는 재시도·부분 실패·원인 라벨을 갖는다.

---

## 2. 전체 구성 (C4 Level 1 — System Context)

```
                    ┌────────────────────────┐
                    │       End Users        │
                    │ (크리에이터·스튜디오·   │
                    │   챗봇 운영자)         │
                    └───────────┬────────────┘
                                │ HTTPS
                                ▼
       ┌────────────────────────────────────────────────┐
       │              geny-2d-avatar Platform            │
       │  (Web App + API + Pipeline + Asset Storage)     │
       └───┬────────────┬────────────┬────────────┬─────┘
           │            │            │            │
           ▼            ▼            ▼            ▼
  ┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐
  │  Image AI   │ │ Live2D   │ │ Auth IdP │ │  Payment   │
  │  Providers  │ │ Cubism   │ │ (OIDC)   │ │  (Stripe)  │
  │ nano-banana │ │ SDK /    │ │          │ │            │
  │ SDXL/Comfy  │ │ Exporter │ │          │ │            │
  │  (plugable) │ │          │ │          │ │            │
  └─────────────┘ └──────────┘ └──────────┘ └────────────┘
```

---

## 3. 컨테이너 레벨 (C4 Level 2 — Containers)

```
 ┌────────────────────────────────────────────────────────────────────────────┐
 │                              geny-2d-avatar                                 │
 │                                                                             │
 │  ┌─────────────────────┐      ┌─────────────────────┐                        │
 │  │   Web Frontend       │─────▶│   Edge / Gateway    │                        │
 │  │  (Next.js SPA)       │ WS ◀ │  (API GW + CDN)     │                        │
 │  └──────────▲──────────┘      └──────────┬──────────┘                        │
 │             │                              │                                  │
 │             │ WebSocket                    │ REST / gRPC                      │
 │             │                              ▼                                  │
 │             │                  ┌────────────────────────┐                     │
 │             │                  │   Core API Service      │                     │
 │             │                  │ (Auth, Projects, Jobs,  │                     │
 │             │                  │  Billing, Permissions)  │                     │
 │             │                  └──────┬────┬────┬───────┘                     │
 │             │                         │    │    │                             │
 │             │        ┌────────────────┘    │    └───────────────────┐          │
 │             │        ▼                     ▼                         ▼          │
 │             │  ┌──────────┐        ┌───────────────┐        ┌──────────────┐   │
 │             │  │Postgres  │        │  Object Store │        │ Event Broker │   │
 │             │  │ (meta)   │        │  (S3/R2)      │        │  (NATS/Kafka)│   │
 │             │  └──────────┘        └───────────────┘        └──────┬───────┘   │
 │             │                                                       │          │
 │             │                                                       ▼          │
 │             │                                           ┌──────────────────────┐│
 │             │                                           │  Pipeline Orchestrator││
 │             │                                           │  (Job DAG Executor)   ││
 │             │                                           └─────┬────┬────┬──────┘│
 │             │                                                 │    │    │        │
 │             │                                                 ▼    ▼    ▼        │
 │             │     ┌───────────────────────────────────────────────────────┐      │
 │             │     │              Worker Pools (autoscaled)                 │      │
 │             │     │  ┌─────────────┐ ┌─────────────┐ ┌─────────────────┐   │      │
 │             │     │  │ CPU Worker  │ │ GPU Worker  │ │ AI-Adapter Worker│   │      │
 │             │     │  │ (post-proc, │ │ (detection, │ │ (calls external  │   │      │
 │             │     │  │  fitting,   │ │  segment,   │ │  image AI APIs)  │   │      │
 │             │     │  │  rendering) │ │  SD-local)  │ │                  │   │      │
 │             │     │  └─────────────┘ └─────────────┘ └─────────────────┘   │      │
 │             │     └───────────────────────────────────────────────────────┘      │
 │             │                                                                     │
 │             └────────────── Live Progress ◀── Event Broker (stream) ──┘           │
 └────────────────────────────────────────────────────────────────────────────────────┘
```

### 컨테이너 책임 요약

| 컨테이너 | 책임 | 비-책임 |
|---|---|---|
| **Web Frontend** | 사용자 인터랙션, 에디터 캔버스, 미리보기 플레이어, 실시간 진행상황 표시 | 무거운 연산, 실제 리깅 계산 |
| **Edge / Gateway** | 인증 토큰 검증, 레이트리밋, CDN, WebSocket 라우팅 | 비즈니스 로직 |
| **Core API** | 프로젝트/아바타/잡 CRUD, 권한, 청구, 라이선스 | AI 직접 호출, 이미지 처리 |
| **Pipeline Orchestrator** | DAG 정의·스케줄링·재시도·의존성 관리 | 각 단계의 실제 계산 |
| **Worker — CPU** | 정규화, 후처리 (색/선/광원), 렌더 합성, 최종 export | GPU 의존 작업 |
| **Worker — GPU** | 세그멘테이션, 키포인트 감지, (옵션) 로컬 SD 추론 | 외부 API 호출 |
| **Worker — AI Adapter** | 외부 이미지 모델 API 호출, 레이트/쿼터/백오프 관리 | 결과 가공 |
| **Object Store** | PNG/PSD/model3 등 바이너리 저장 | 메타데이터 |
| **Postgres** | 사용자, 프로젝트, 작업 상태, 감사 로그 | 대용량 파일 |
| **Event Broker** | 작업 이벤트 팬아웃, 진행상황 스트림 | 영구 저장 (토픽 보존은 제한) |

---

## 4. 파이프라인 상세 (Pipeline DAG)

### 4.1 기본 템플릿 DAG

```
                    ┌───────────────────┐
                    │  Job: create-avatar│
                    └─────────┬─────────┘
                              │
        ┌─────────────────────┼────────────────────┐
        ▼                     ▼                    ▼
   [normalize_input]   [select_rig_template]   [validate_refs]
        │                     │                    │
        └──────────┬──────────┘                    │
                   ▼                               │
            [extract_parts]◀──────────────────────┘
                   │
     ┌─────────────┼──────────────┬────────────────┐
     ▼             ▼              ▼                ▼
 [ai_redesign_  [ai_redesign_  [ai_redesign_   [ai_redesign_
   face]         hair]          cloth]          accessory]
     │             │              │                │
     └─────────────┼──────────────┴────────────────┘
                   ▼
           [consistency_pass]    ← 색/선/광원/알파 통일
                   │
                   ▼
              [auto_fit]         ← 앵커 정렬, pivot 계산
                   │
                   ▼
          [validation_render]    ← 테스트 포즈 세트
                   │
                   ▼
                 [gate]          ← 점수 < 임계값이면 human_review 로 분기
               /        \
              ▼          ▼
         [auto_pass]   [human_review_request]
              \          /
               ▼        ▼
              [finalize]
                   │
                   ▼
              [export*]          ← (선택) 타겟별 export 팬아웃
```

### 4.2 노드 명세 규칙

각 노드는 다음 메타를 갖는다:

```yaml
node_id: ai_redesign_face
version: 3
input_schema: parts/face.schema.json
output_schema: parts/face.schema.json
timeout_seconds: 90
retries:
  max: 3
  backoff: exponential
  on:
    - transient_http_5xx
    - rate_limited
determinism: non_deterministic    # or deterministic
cacheable: true
cache_key:
  - input_hash
  - model_version
  - prompt_hash
  - seed
cost_estimate:
  ai_call: 0.02 USD
  cpu_seconds: 1.5
```

자세한 스키마는 [12-data-schema-and-api.md](./12-data-schema-and-api.md).

### 4.3 실행 모드

| 모드 | 언제 쓰는가 | 동작 |
|---|---|---|
| **Interactive** | 사용자가 에디터에서 "이 파츠만 다시" | 필요 노드만 subgraph 실행, p50 ≤ 10s |
| **Batch** | 스튜디오가 60 캐릭터 일괄 생성 | 우선순위 낮음 큐, 야간/비수기 시간대 할인 |
| **Scheduled** | 야간 재학습/리그레션/골든셋 | cron, 내부 관측용 |
| **Shadow** | 새 모델 롤아웃 전 | 프로덕션 결과와 병행 생성, 비교만 |

---

## 5. 동기 vs 비동기 경계

### 5.1 규칙

- **즉시 응답이 의미 있는 것만 동기**: 로그인, 프로젝트 목록, 설정 변경, 미리보기 조작.
- **1초 이상 걸릴 가능성이 있는 것은 모두 비동기**: AI 호출, 후처리, 검수 렌더, export.
- **비동기 작업은 언제나** (a) 즉시 `job_id` 반환, (b) WebSocket/SSE 로 진행상황, (c) 완료 후 idempotent GET 으로 결과 조회 가능.

### 5.2 진행상황 이벤트 스키마

```json
{
  "job_id": "job_01HXYZ...",
  "node_id": "ai_redesign_hair",
  "phase": "running",
  "progress": 0.42,
  "eta_seconds": 18,
  "log_tail": ["calling adapter:nano-banana ..."],
  "issues": []
}
```

### 5.3 경계 선택 이유

- 사용자의 "느꼈다" 는 속도 = 서버 응답 시간이 아니라 **"뭔가 일어나고 있다" 는 피드백까지 걸린 시간**. 이벤트 스트림이 UX에서 결정적.
- 대기 중 화면 이탈 해도 돌아왔을 때 이어서 볼 수 있어야 함 → 결과는 반드시 재조회 가능.

---

## 6. 데이터 흐름 — 대표 시나리오 3가지

### 6.1 시나리오 A — 신규 아바타 생성 (Cold Start)

```
 (1) User  ─── upload (ref image) + prompt ──▶  Frontend
 (2) Frontend ─── POST /projects/{id}/avatars ──▶ Core API
 (3) Core API  ─── create Avatar(row) ──▶ Postgres
                 └── put ref.png      ──▶ Object Store
                 └── enqueue job      ──▶ Event Broker
 (4) Orchestrator picks job, plans DAG
 (5) Worker(CPU): normalize_input, extract_parts
 (6) Worker(AI): ai_redesign_* fan-out
 (7) Worker(CPU): consistency_pass, auto_fit
 (8) Worker(GPU): validation_render
 (9) Orchestrator writes result refs ▶ Postgres + Object Store
(10) Event Broker ── job.completed ──▶ Frontend (via WS)
(11) User sees preview; may request tweaks
```

### 6.2 시나리오 B — 부분 재생성 (Warm Edit)

```
 User: "앞머리만 다시"
 Frontend ── PATCH /avatars/{id}/parts/hair_front with prompt ──▶ Core API
 Orchestrator runs subgraph:
   extract_parts(hair_front) → ai_redesign_hair(front) → consistency_pass
   → auto_fit(hair_front) → validation_render(subset)
 Cache hits: normalize_input, ai_redesign_face, ai_redesign_cloth, ...
 p50 목표: 10s, p90: 25s
```

### 6.3 시나리오 C — Export (Live2D Cubism)

```
 User clicks "Export for VTube Studio"
 Core API creates export_job
 Worker(CPU):
   - 파츠 PNG + 메쉬/파라미터 → .psd layered
   - .psd → Cubism SDK 오프라인 변환기
   - .moc3/.model3.json/.physics3.json/.motion3.json 번들 생성
 결과물 → Object Store, 서명된 URL 반환
```

---

## 7. 서비스 분할 전략 (Service Boundaries)

### 7.1 초기 (MVP) — "Modular Monolith"

- Core API 를 단일 배포 유닛으로 유지.
- 모듈 경계: `auth`, `project`, `asset`, `job`, `billing`, `catalog`.
- 모듈 간 호출은 **인프로세스 함수 호출이 아니라 서비스 인터페이스** 를 경유 (향후 분리 쉽게).
- 워커만 별도 배포 유닛.

### 7.2 확장 (β 이후) — 필요 시 분리

- `asset-service` 분리 이유: 스토리지 I/O 헤비, 독립 스케일.
- `ai-adapter-service` 분리 이유: 외부 API 쿼터/장애 격리.
- `billing-service` 분리 이유: 감사·규제 대응, 배포 주기 독립.

### 7.3 절대 나누지 않을 것

- `project` 와 `avatar` 는 같은 서비스에 둔다. 트랜잭션 경계가 같다.
- `job` 과 `orchestrator` 는 같은 경계에 둔다. 상태 일관성 문제.

---

## 8. 배포 토폴로지 (Deployment Topology)

### 8.1 환경

| 환경 | 목적 | 데이터 |
|---|---|---|
| `local-dev` | 개발자 로컬 | 가짜 AI 어댑터 + 소형 모델 |
| `ci` | PR 검증 | 골든셋 일부, 모킹된 AI |
| `staging` | 배포 전 통합 | 외부 AI 벤더의 sandbox 키 |
| `prod` | 서비스 | 실제 벤더 키, 멀티 리전 (추후) |
| `prod-canary` | 1–5% 트래픽 | 새 워커 버전 검증 |

### 8.2 인프라 기본선 (Baseline)

- 컨테이너 오케스트레이션: **Kubernetes** (시작은 managed, 자체 운영 부담 회피).
- 노드 풀:
  - `pool-web`: 작은 일반 노드
  - `pool-cpu-worker`: CPU-최적화, 오토스케일 2–40
  - `pool-gpu-worker`: GPU (L4/A10/A100 옵션), 오토스케일 0–8, **스케일 투 제로** 가능
  - `pool-ai-adapter`: 일반 노드 (네트워크 바운드)
- 데이터베이스: Postgres (managed, pgvector 확장 포함 — 스타일 임베딩용).
- 오브젝트 스토리지: S3/R2.
- 이벤트: NATS (초기) → Kafka (필요 시).
- 캐시: Redis (세션, 토큰, 파생 썸네일).
- CDN: 이미지/미리보기 전송.
- 시크릿: Vault / KMS.

### 8.3 리전 전략

- 시작은 1 리전.
- β에서 "모델 벤더가 가까운 리전" 으로 워커 풀 배치 (레이턴시·이그레스 비용 절감).
- 사용자 데이터는 리전-어피니티, 복제는 백업 용도만.

---

## 9. 관측성 (Observability)

### 9.1 삼각 측정 (Logs / Metrics / Traces)

- **Logs**: 구조화 JSON, `job_id` + `node_id` + `user_id` 필수 태그. 원본 이미지/프롬프트 로그는 프라이버시 분리 저장.
- **Metrics**: 노드별 duration, 성공/실패율, 큐 길이, GPU 활용도, AI 벤더별 호출/비용.
- **Traces**: 프런트 클릭 → API → 오케스트레이터 → 워커 → AI 벤더 까지 1개의 trace id.

#### 9.1.1 Metrics exposition 스모크 (세션 75)

`infra/observability/metrics-catalog.md` §2.1 (Queue state, BullMQ) + §3 (AI vendor calls) 의 실제 배선을 Foundation 단계에서 실측으로 고정. `scripts/observability-smoke.mjs` 가 producer(`/metrics`) + consumer(`/metrics`) 두 엔드포인트를 스크랩해 **합집합**이 카탈로그의 8개 메트릭 이름을 모두 포함하는지 검증 + sample count 가 던진 job 수 이상인지 확인.

**분할 소유권** — Foundation 시점의 실측 결과:

| 메트릭 | producer | consumer | 비고 |
|---|---|---|---|
| `geny_queue_depth{state}` | ✅ sample | — | BullMQ `getJobCounts()` producer 쪽 스냅샷 |
| `geny_queue_enqueued_total` | ✅ sample | — | `Queue.add()` 직후 카운터 증가 |
| `geny_queue_duration_seconds` | — | ✅ sample | consumer 쪽 처리 지연 histogram |
| `geny_queue_failed_total` | — | ✅ TYPE (미발생) | terminal failure — 스모크 런에선 0 |
| `geny_ai_call_total` | TYPE 만 | ✅ sample | producer 는 AI 어댑터 호출 안 함 |
| `geny_ai_call_duration_seconds` | TYPE 만 | ✅ sample | 〃 |
| `geny_ai_call_cost_usd` | TYPE 만 | ✅ sample | 〃 |
| `geny_ai_fallback_total` | TYPE 만 | ✅ TYPE (미발생) | Mock 어댑터는 폴백 없음 |

**실측 (N=20, queue=geny-obs-75, Redis 7.2-alpine:6381)**:

```
producer /metrics → 6 metric names (queue + ai TYPE)
consumer /metrics → 6 metric names (queue_duration + ai samples)
union             → 8 metric names (카탈로그 §2.1 + §3 완전 커버)
samples: enqueued=20  ai_calls=20  ai_dur_count=20  queue_dur_count=20
✅ all catalog §2.1 + §3 metrics present on union, samples above threshold
```

**해석**:
- producer 는 큐 **수용 측 관찰자** (depth + enqueued), consumer 는 **처리 측 관찰자** (duration + failed). Prometheus 수집기 관점에서 두 대상이 따로 스크랩되는 것이 자연스럽고, 대시보드는 `sum without(instance)` 로 합쳐 보면 됨.
- 카탈로그 §2.1 는 "하나의 서비스가 모두 노출" 을 요구하지 않는다 — 책임 분할이 정상. 본 세션 검증은 합집합 기준.
- 스냅샷 `infra/observability/smoke-snapshot-session-75.txt` 에 원본 exposition 보존 — Runtime 축에서 실 Prometheus 스크레이퍼 붙일 때 비교 기준.

Exit #3 관측 대시보드 증거 — `geny_queue_*` + `geny_ai_*` 실제 노출 확인으로 Foundation 단계 증거 확보 (실 Prometheus 수집 + Grafana 대시보드 배선은 Runtime 단계 과업).

### 9.2 대시보드 (초기 필수 3개)

1. **Job Health**: WSAC, 완주율, 실패 원인 상위 10, p50/p90 TTFE.
2. **Cost**: 벤더별 호출/비용, 1아바타당 단가, 캐시 적중률.
3. **Quality**: 자동 검수 점수 분포, 재생성율, 사람 리뷰 개입률.

### 9.3 알람

- 완주율 10분간 −15%p → P1.
- 특정 AI 벤더 5xx 비율 > 20% → 자동 페일오버 + P2.
- 큐 길이 > 1k 지속 10분 → P2.

---

## 10. 신뢰성 & 내결함성 (Reliability)

### 10.1 실패 모드 분류

| 실패 유형 | 예 | 대응 |
|---|---|---|
| **일시적 (transient)** | 5xx, 타임아웃, 레이트리밋 | 지수 백오프 재시도 |
| **결정적 (deterministic)** | 잘못된 입력, 스키마 위반 | 재시도 금지, 사용자에게 메시지 |
| **치명적 (fatal)** | 벤더 전체 장애 | 어댑터 페일오버, 사용자에게 소프트 안내 |
| **부분 (partial)** | 파츠 12개 중 1개만 깨짐 | 그 파츠만 재실행, 나머지 캐시 활용 |

### 10.2 재시도 정책 기본값

- `max_retries = 3`, `initial = 1s`, `multiplier = 2`, `jitter = ±20%`.
- 외부 AI 벤더 호출은 `max_retries = 5`, 마지막 1회는 대체 벤더로.

### 10.3 멱등성 (Idempotency)

- 모든 작업은 `idempotency_key` (사용자 제공 또는 서버 생성). 동일 키 2회 → 결과 재사용.
- 파이프라인 노드는 `(inputs, version, seed)` 해시로 캐시.

### 10.4 백업 & 복구

- Postgres: PITR 7일.
- Object Store: 버전 관리 켜기, 30일 보존.
- 리그 템플릿/골든셋: git-backed, 전체 이력 보존.
- 복구 훈련(Game Day): β에서 분기 1회.

---

## 11. 보안 아키텍처 요약

> 전체는 **보안 전용 문서** (추후 분리) 에서 확장.

- **Zero Trust between services**: mTLS, 내부 JWT.
- **권한 모델**: Org → Workspace → Project → Avatar. 세분화된 role/permission.
- **데이터 분리**:
  - 사용자 원본 이미지 (ref) 는 암호화 + 짧은 서명 URL.
  - 스타일 임베딩은 별도 스키마, 타 사용자 접근 불가.
  - 생성 로그에서 개인식별정보 스크럽.
- **외부 벤더 키**: Vault, 짧은 TTL, 정기 회전.
- **업로드 검증**: MIME/사이즈/해시, 악성 파일 필터, 성인 콘텐츠 필터.

---

## 12. 확장성 & 병목 (Scalability & Bottlenecks)

### 12.1 예상 병목 지점 (β 기준 가설)

| 병목 | 증상 | 완화 |
|---|---|---|
| AI 벤더 쿼터 | 동시 호출 캡 | 다중 벤더, 큐 쿨링, 프리미엄 유료 쿼터 |
| GPU 시간 | 로컬 추론 시 비용 폭증 | 기본은 외부 API, GPU는 세그/키포인트·대량 배치에만 |
| CPU 후처리 | 이미지 크기 × 파츠 수 | 워커 수평 확장, 해상도 계단식 |
| Object Store 이그레스 | CDN 미캐시 시 | CDN 전면, 썸네일 분리 |
| Postgres 쓰기 | 잡 이벤트 폭주 | 이벤트는 Broker, DB는 상태 변화만 기록 |

### 12.2 스케일 단위

- **스케일 유닛 = Worker Pod**. 각 풀의 최소/최대·타겟 유틸을 정의.
- **작업 크기(work unit) = 1 avatar 생성** 또는 1 export.

### 12.3 비용 상한 거버넌스

- 사용자/프로젝트/조직 단위 **월 AI 호출 상한 (budget)**.
- 초과 시 자동 다운그레이드 (저비용 모델로 대체) + UI 안내.

### 12.4 성능 SLO 측정 하네스 (Foundation)

릴리스 게이트(`docs/14 §10` "성능 SLO 초과 없음") 를 기계적으로 검증하기 위한 하네스. 세션 51 에서 도입.

- **스크립트**: `scripts/perf-harness.mjs` — `@geny/worker-generate` 를 in-process 기동, 실 HTTP `POST /jobs` 에 Mock 어댑터 잡 N 개를 concurrency C 로 투하해 p50/p95/p99 + 에러율 + 처리량 보고.
- **측정 지표**:
  - `accept_latency_ms` — `POST /jobs` → 202 까지. 라우터 + JobStore.submit 오버헤드.
  - `orchestrate_latency_ms` — `POST /jobs` 전송 → 잡이 terminal (succeeded/failed) 에 도달하기까지. 큐 대기 + 어댑터 호출 + 후속 hook.
  - `error_rate_ratio` — terminal 실패 / 총 투하.
  - `throughput_jobs_per_s` — terminal 건 / 전체 시간.
- **SLO 임계 (Foundation Mock 파이프라인 기준)**:

  | 지표 | 임계 | 의미 |
  |---|---|---|
  | `accept_latency_ms` p95 | ≤ 100 | 라우터/submit 자체의 오버헤드. 실 벤더 지연과 독립. |
  | `orchestrate_latency_ms` p95 | ≤ 500 | Mock 어댑터 기준 end-to-end. 실 벤더는 별도 staging SLO. |
  | `orchestrate_latency_ms` p99 | ≤ 1500 | tail 포함 열화 한도. |
  | `error_rate_ratio` | ≤ 0.01 | Mock 은 0 이 정상, 1% 는 환경 슬랙. |
  | `throughput_jobs_per_s` | ≥ 10 | 개발 하드웨어 기준 최저선. |

- **CI 게이트**: `test:golden` step 20 `perf-harness smoke` 가 완화 SLO (p95 ≤ 2s, 에러 ≤ 5%, tput ≥ 1/s) 로 20 잡 1회 회귀. 전체 벤치는 수동 `node scripts/perf-harness.mjs --jobs 200 --concurrency 16`.
- **실 벤더 부하**는 `--http` 플래그로 wire (`createHttpAdapterFactories`), Foundation 범위 밖.
- **`--driver bullmq` / `--target-url` 실측 베이스라인 (세션 72·73, Mock 파이프라인 · N=100 · C=8, 개발 맥북 기준)**:

  | 드라이버 | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | 비고 |
  |---|---|---|---|---|---|---|
  | `in-memory` | 21 | 8.1 | 8.1 | 10.47 | 4761.9 | submit = setImmediate(orchestrate). 큐 오버헤드 0. |
  | `bullmq` (local Redis, inline) | 43 | 18.08 | 18.08 | 18.72 | 2325.58 | 같은 프로세스에서 producer+consumer. 큐/디스크 hop 포함. |
  | `external` (split producer/consumer) | 42 | 7.76 | 8.56 | 10.65 | 2380.95 | 세션 66 Helm chart 배포 형상 — 독립 프로세스 2개 + 공유 Redis, 하네스는 producer HTTP 만 호출. |

  셋 다 Foundation SLO 임계 (p95≤100/500, tput≥10) 대비 1 order-of-magnitude 이상 여유. `external` 행은 "producer Service(port 9091) → Redis(port 6380) → Worker Consumer(port 9092)" 토폴로지를 같은 호스트에서 재현한 결과로 ADR 0006 §D3 X+4 의 배포 형상 실측. 하네스의 `orch_latency` 는 client-observed wait-for-terminal 폴링 roundtrip 이라 `inline` 의 in-process orchestrate 구간과 직접 비교 불가 — 다만 동일 SLO 임계를 공유한다. Runtime 단계에서 실 벤더/실 Redis 배포 후 baseline 재캡처. 세션 72 는 perf-harness 에 `/metrics` 스크레이프 (`parseMetrics` — `geny_queue_enqueued_total` / `geny_queue_depth{state=*}`) 를 추가, 세션 73 은 `--target-url` 외부 모드 + `producer-only` 스토어의 `get(id)` 재조회 버그 수정으로 `queue.enqueued_total === jobs` 계약을 자동 assert 가능케 함.

- **Consumer `--concurrency` 스윕 (세션 74, `scripts/perf-sweep-concurrency.mjs`, external 모드 · N=200, harness_C=16, Mock 파이프라인)**:

  | consumer C | run_ms | accept p95 (ms) | orch p95 (ms) | orch p99 (ms) | tput (/s) | err | enqueued_total |
  |---|---|---|---|---|---|---|---|
  | 1 | 45 | 6.71 | 7.81 | 7.92 | 4444.44 | 0 | 200 |
  | 2 | 46 | 6.36 | 7.47 | 7.58 | 4347.83 | 0 | 200 |
  | 4 | 46 | 6.16 | 7.38 | 7.65 | 4347.83 | 0 | 200 |
  | 8 | 48 | 6.40 | 7.44 | 7.84 | 4166.67 | 0 | 200 |
  | 16 | 47 | 6.82 | 8.04 | 8.14 | 4255.32 | 0 | 200 |

  **Mock 파이프라인에서는 consumer `--concurrency` 가 tput 포화점과 무관** — 처리 시간이 매우 짧아(Mock 어댑터 ~0.1ms 수준) 단일 Worker 슬롯도 큐를 즉시 비워서 병렬 슬롯을 만들어도 대기 잡이 없어 효과 없음. 관측된 ~4200-4400/s ceiling 은 harness HTTP submit + Redis enqueue roundtrip 오버헤드에 의해 결정. 실 벤더 HTTP 어댑터(수백 ms ~ 수 s 처리) 가 투입되면 이 곡선이 비로소 의미를 가지며 Runtime 단계에서 재캡처 필요. **Foundation 결론**: Helm chart `GENY_WORKER_CONCURRENCY` 기본값은 비용 절감 위해 보수적인 값 (dev=2, prod=8, 세션 66) 유지해도 Mock 파이프라인 성능 회귀 없음. `accept_p95` / `orch_p95` 는 C 와 무관하게 ±0.7ms 안에서 노이즈 수준.

---

## 13. 플러그인 확장점 (Extensibility Hooks)

향후 서드파티/내부 팀이 파이프라인을 확장할 수 있는 지점을 미리 정의.

| 훅 | 예 | 문서 |
|---|---|---|
| `RigTemplate` | 새 베이스 리그 추가 | [03](./03-rig-template-spec.md) |
| `PartSpec` | 새 파츠 카테고리 추가 | [04](./04-parts-specification.md) |
| `AIAdapter` | 새 이미지 모델 벤더 | [05](./05-ai-generation-pipeline.md) |
| `PostProcessor` | 커스텀 후처리 | [06](./06-post-processing-pipeline.md) |
| `Validator` | 커스텀 품질 검사 | [08](./08-validation-and-rendering.md) |
| `Exporter` | 새 배포 타겟 | [11](./11-export-and-deployment.md) |

---

## 14. 아키텍처 의사결정 기록 (ADR) — 초판 후보

이 문서에서 다룬 주요 결정은 별도 ADR 파일로 분리 예정.

- `adr/0001-modular-monolith-over-microservices.md`
- `adr/0002-plug-in-ai-adapter-abstraction.md`
- `adr/0003-event-broker-nats-initial.md`
- `adr/0004-object-store-content-addressable.md`
- `adr/0005-dag-pipeline-orchestrator.md`

---

## 15. 열린 질문 (Open Questions)

- 오케스트레이터를 직접 구현할지(작은 DAG 엔진), 아니면 **Temporal / Dagster / Prefect** 를 채택할지. → β 전 결정.
- GPU 추론 자체를 사내로 끌고 올 시점: 벤더 비용이 1달 $30k 초과 시 PoC.
- 멀티테넌시 데이터 경계를 스키마 레벨(행 수준 보안)로 할지, DB 레벨(조직별 DB)로 할지. 엔터프라이즈 계약 시 재검토.

---

**다음 문서 →** [03. 베이스 리그 템플릿 명세](./03-rig-template-spec.md)
