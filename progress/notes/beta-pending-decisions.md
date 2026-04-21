# β 대기 결정 로그 (2026-04-21 작성, soak 세션)

> **목적**: β 로드맵 진행이 차단된 **외부 결정 항목 전체를 한 파일에서 처리**. 사용자가 돌아왔을 때 이 문서 위에서 한 번에 선택하면 P0~P6 의 진입 잠금이 순차 해제된다.
>
> 본 문서는 카탈로그가 아니다. 각 항목은 **잠금 해제 후 즉시 착수 가능한 자율 세션** 과 직접 연결된다. 사용자 답변 한 줄이 어떤 세션을 몇 개 open 시키는지 명시한다.

---

## 0. 결정이 필요한 이유 한 장 요약

| 블로커 | 해제 주체 | 해제 안 되면 | 해제 시 open 되는 자율 세션 |
|---|---|---|---|
| **P0 Q1~Q6** (UX wireframe) | 사용자 | P0 ✅ 불가, UI 구현 spec 확정 불가 | (Q3~Q5 답변만으로도 P2-S1 UI 구현 가능) |
| **ADR 0007 Decision** | 사용자 / PM | P1 진입 불가 (렌더러 기술 미정) | P1-S1 (렌더러 스캐폴드) 즉시 |
| **BL-VENDOR-KEY** | 운영 + 사용자 | P3 진입 불가 (실 nano-banana 호출 불가) | P3-S1 (벤더 키 주입 인프라) 즉시 |
| **BL-STAGING** | 인프라 | P5 진입 불가 (실 배포 검증 불가) | P5-S1 (kubeconfig + namespace) 즉시 |
| **BL-BUDGET** | 사용자 / 재무 | P3 이후 지속 중단 위험 | 운영적 단일 승인 (세션 open 아님) |
| **BL-LEGAL** | 법무 | β 오픈(P6) 불가 | 운영적 단일 승인 (세션 open 아님) |

---

## 1. P0 UX wireframe — Q1~Q6 (사용자 한 줄 답)

근거: [`docs/UX-BETA-WIREFRAME.md §9`](../../docs/UX-BETA-WIREFRAME.md). 각 질문에 **기본 제안(권장)** 과 대안이 이미 작성돼 있다. 아래는 요약 + 답변의 파급.

### Q1 — 진행 표시: 5 pill vs 단일 bar?

- **기본**: 5 pill (부분 실패 가시성 ↑)
- **대안**: 단일 bar (공간 절약, 부분 실패 시 별도 배너)
- **파급**: 기본 선택 시 P2-S1 UI 그대로 진행. 단일 bar 선택 시 wireframe §3 레이아웃 + §4.3 재작성 필요.
- **기본 그대로 ok 이면 사용자 답: `Q1: 기본`**

### Q2 — Error ID 표시 형식: 8-char hex vs 16-char full vs UUID?

- **기본**: 8-char hex (Grafana trace tail)
- **파급**: observability 축의 `trace_id` 축약 함수 1 곳 추가. 기본 채택이 관측 비용 최소.
- **기본 그대로 ok 이면 사용자 답: `Q2: 기본`**

### Q3 — Prompt 200 char limit: 유지 vs 500 vs 100?

- **기본**: 200 (nano-banana 권장 길이)
- **파급**: Gemini 2.5 Flash Image 는 긴 프롬프트도 수용하지만 100~300 자 범위가 스타일 안정성 높음. 500 은 noise 유발 리스크. 100 은 사용자 표현력 제한.
- **기본 그대로 ok 이면 사용자 답: `Q3: 기본`**

### Q4 — Generate 중 prompt 재수정 허용?

- **기본**: 편집 허용, 버튼만 disabled
- **파급**: state machine `generating` 상태에서 textarea disabled 여부. 기본은 사용자 이탈 방지.
- **기본 그대로 ok 이면 사용자 답: `Q4: 기본`**

### Q5 — 완료 후 Inspector 자동 포커스: Parameters 탭 vs 마지막 탭 유지?

- **기본**: 처음에만 Parameters 탭 활성, 이후 사용자 마지막 탭 유지
- **파급**: `generate:success` 이벤트 핸들러 1 블록 (web-editor logic). 기본이 가장 덜 놀라는 선택.
- **기본 그대로 ok 이면 사용자 답: `Q5: 기본`**

### Q6 — 언어: 브라우저 locale 자동 vs URL query 강제?

- **기본**: 브라우저 locale 자동 (`navigator.language`), 폴백 EN
- **파급**: β 초기 유저 소수 (KO 중심) 전제. URL query 는 개발/QA 편의만 추가.
- **기본 그대로 ok 이면 사용자 답: `Q6: 기본`**

### 한 줄 처리 옵션 — 사용자가 빠르게 닫고 싶다면

> `Q1~Q6: 전부 기본`

본 문서에 "전부 기본" 이라 답하면 다음 자율 세션에서 wireframe §9 블록 제거 + §10 마지막 체크박스 check + PLAN §2 P0 ✅ bump + P1 대기 상태로 전환.

---

## 2. ADR 0007 Decision — 렌더러 기술

근거: [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) Context + Options. 사용자/PM 이 **Option A / C / D / E 중 하나 Accepted 로 승격**.

### Option A — PixiJS v8 (MIT, scene-graph)

- **강점**: 검증된 2D 렌더러, `parts[]` 매핑 직관, ~120~180 KB gzip, 커뮤니티 풍부
- **약점**: Cubism 의 Warp/Rotation 디포머 semantic 을 Pixi mesh 위에 **직접 재구현** 필요 (ADR 0007 Option A §2.5)
- **P1 일정**: 3~5 세션 (ROADMAP P1 예상치 그대로)

### Option C — Cubism Web SDK (상용 라이선스)

- **강점**: `.moc3` 런타임 그대로 재생, 디포머 구현 불필요
- **약점**: 라이선스 비용 + 벤더 종속성 + 번들에 `.moc3` 포함 필요 (exporter-pipeline 확장)
- **P1 일정**: 4~6 세션 (.moc3 변환 layer 포함)

### Option D — 자체 WebGL2 미니 렌더러

- **강점**: 번들 최소, 라이선스 free, 우리 스키마 100% 직결
- **약점**: 구현 비용 가장 큼, 팀 WebGL2 경험 필요, 셰이더 유지보수
- **P1 일정**: 6~10 세션

### Option E — 하이브리드 (권장)

- **구조**: 계약 패키지(`@geny/web-avatar-renderer`, 세션 114 완성) 를 facade 로 유지, Option A (PixiJS) 를 첫 impl, Option D 의 자체 미니 path 는 나중에 필요 시 추가 impl 로 붙임
- **강점**: 빠른 β (PixiJS) + 장기 탈출구 (자체) 동시 확보. 세션 115 의 Null/Logging impl 과 같은 축
- **약점**: 첫 구현은 Option A 와 동일 비용, facade 유지 오버헤드 약간
- **P1 일정**: 3~5 세션 (Option A 와 동일, facade 오버헤드는 이미 세션 114/115 에 선행 투자됨)

### 권장

**Option E (하이브리드)**. 근거:
1. 세션 114~116 에서 이미 facade + Null/Logging impl 축을 선행했기 때문에 추가 비용 0.
2. β 는 PixiJS 로 빠르게 진입, GA 단계에서 자체 구현 승격 여지 남김.
3. Cubism(C) 은 라이선스 리스크 큼. 자체(D) 는 단독으로는 일정 리스크 큼.

### 사용자 답변 포맷

> `ADR 0007: Option E Accepted` (또는 A/C/D 중 하나)

Accept 후 다음 자율 세션은:
1. `progress/adr/0007-renderer-technology.md` Decision 섹션 작성 (사용자 답변 문장 + 근거)
2. `progress/notes/adr-0007-option-diffs.md §7` 공통 touch 8 항목 일괄 편집
3. P1-S1 세션 착수 — `packages/web-avatar-renderer-pixi/` 스캐폴드

---

## 3. BL-VENDOR-KEY — nano-banana 키 프로비저닝

### 필요 항목 체크리스트

| # | 항목 | 담당 | 상태 |
|---|---|---|---|
| 1 | GCP 프로젝트 생성 | 운영 | ⚪ |
| 2 | Gemini API 활성화 (API & Services) | 운영 | ⚪ |
| 3 | API Key 생성 (Application default 또는 서비스 계정) | 운영 | ⚪ |
| 4 | 월 quota 승인 (최소 1000 req/month, β 테스트용) | 사용자/재무 | ⚪ |
| 5 | 결제 계정 연결 (무료 tier 초과 시) | 사용자/재무 | ⚪ |
| 6 | 키의 저장소 장소 (local `.env.local` + staging `kubectl create secret generic`) | 운영 | ⚪ |
| 7 | 키 rotation 주기 (최소 90일) + rotation 절차 문서 | 운영 | ⚪ |
| 8 | `infra/adapters/nano-banana.yaml` 엔드포인트 / 모델 ID 확정 (예: `gemini-2.5-flash-image`) | 사용자 | ⚪ |

### 사용자 답변 포맷 (1~8 각 항목에 대해)

```
BL-VENDOR-KEY:
  project_id: <project-id>
  api_key_secret_name: <k8s-secret-name>
  model_id: gemini-2.5-flash-image
  quota_monthly: 1000
  key_storage: staging/sealed-secret + local/.env.local
  rotation: 90d
  status: ready
```

해제 후 P3-S1 자율 세션 착수 — `values-staging.yaml` 에 `secrets.nanoBananaApiKey` 경로 추가 + 로컬 `.env.local` 템플릿 + orchestrator-service 가 `loadApiKeysFromCatalogEnv` 경유해 읽는 경로 확인.

---

## 4. BL-STAGING — K8s 클러스터 프로비저닝

### 필요 항목 체크리스트

| # | 항목 | 담당 | 상태 |
|---|---|---|---|
| 1 | K8s cluster (GKE / EKS / 자체) | 인프라 | ⚪ |
| 2 | `kubectl` kubeconfig 접근 | 인프라 | ⚪ |
| 3 | namespace `geny-beta` | 인프라 | ⚪ |
| 4 | ingress-controller (nginx / GCE / Cloudflare) | 인프라 | ⚪ |
| 5 | cert-manager + `Let's Encrypt` ClusterIssuer | 인프라 | ⚪ |
| 6 | DNS: `beta.geny.ai` A record → ingress IP | 인프라/운영 | ⚪ |
| 7 | Storage Class (Redis persistence용) | 인프라 | ⚪ |
| 8 | kube-prometheus-stack 설치 + ServiceMonitor 경로 | 인프라 | ⚪ |
| 9 | Cloudflare rate-limit 정책 (IP 기준 10 req/min) | 운영 | ⚪ |
| 10 | Helm values 오버라이드 (`infra/helm/values-staging.yaml`) | 운영 | ⚪ |

### 사용자 답변 포맷

```
BL-STAGING:
  cluster: gke/prod-beta-1
  namespace: geny-beta
  domain: beta.geny.ai
  tls_issuer: letsencrypt-prod
  storage_class: standard-rwo
  prometheus_stack: installed (kube-prometheus-stack v55)
  ratelimit: cloudflare-waf-rule-42
  status: ready
```

해제 후 P5-S1 자율 세션 착수 — kubeconfig 수령 확인 + namespace `geny-beta` 존재 확인 + Helm `values-staging.yaml` 초기 작성.

---

## 5. BL-BUDGET — β 테스트 예산 승인

### 필요 항목

| # | 항목 | 금액 | 상태 |
|---|---|---|---|
| 1 | P3 초기 smoke | ~$50 | ⚪ |
| 2 | P4 5 슬롯 × iteration | ~$150 | ⚪ |
| 3 | P5 staging 10 회 가동 검증 | ~$100 | ⚪ |
| 4 | P6 사용자 테스트 (5~10명 × 5 회) | ~$200+ | ⚪ |
| **합계** | | **~$500** (β 1 사이클 상한) | |

### 사용자 답변 포맷

```
BL-BUDGET:
  approved_usd: 500
  cost_center: engineering-beta-01
  alert_threshold_pct: 80  # $400 도달 시 Slack 알림
  status: approved
```

---

## 6. BL-LEGAL — 약관 / 라이선스 검토

### 필요 항목

| # | 항목 | 근거 | 상태 |
|---|---|---|---|
| 1 | nano-banana (Gemini 2.5 Flash Image) 약관 §7 output ownership 확인 | Google AI Terms | ⚪ |
| 2 | 생성 이미지 사용자 귀속 여부 (β 는 익명이므로 저장소 측 권한) | Legal review | ⚪ |
| 3 | 사용자 프롬프트 저장 정책 (β 는 세션 ephemeral, PII 없음) | Legal review | ⚪ |
| 4 | Cubism SDK 상용 라이선스 조건 (Option C 선택 시만) | Live2D Inc. | ⚪ |
| 5 | Rig templates 저작 권리 (Geny 내부 저작물) | Legal review | ⚪ |
| 6 | 프롬프트 safety filter 정책 (child-safe / copyright 키워드 블록리스트) | Trust & Safety | ⚪ |

### 사용자 답변 포맷

```
BL-LEGAL:
  nano_banana_output_ownership: permitted-for-b2c-preview
  user_prompt_retention: none (β 세션 ephemeral)
  safety_blocklist_path: infra/safety/blocklist.v1.txt
  status: approved
```

---

## 7. 결정 순서 권장 (최단 β 경로)

```
Day 1 (현재)
  └─ Q1~Q6 전부 기본 답변  ─── P0 ✅ close (5분)
  └─ ADR 0007: Option E    ─── P1-S1 ~ S5 open (3~5 세션)

Day 2~3
  └─ BL-BUDGET approve     ─── P3 재정적 안전 확보 (선행 OK)
  └─ BL-LEGAL pre-review   ─── P6 까지의 법무 리스크 낮춤

Day 4~7 (P1 진행 중)
  └─ BL-VENDOR-KEY 확보    ─── P2 완료 시점에 P3 즉시 진입
  └─ BL-STAGING 준비       ─── P4 완료 시점에 P5 즉시 진입
```

BL-VENDOR-KEY 와 BL-STAGING 은 **P1~P2 작업과 병렬 진행** 하면 β 까지의 벽시계 시간이 최소화된다. 지금부터 해제 작업을 병렬 시작하는 게 최적.

---

## 8. 본 문서의 생명주기

- **유효 기간**: 사용자가 여기 결정 답변을 주고 다음 자율 세션이 반영할 때까지.
- **갱신 주체**: 사용자 답변 반영 세션이 해당 섹션에 **완료 스탬프** (`✅ 2026-MM-DD P?-S? 반영됨 by 세션 X`) 추가.
- **전체 완료 시**: 모든 섹션이 ✅ 되면 본 문서를 `progress/notes/beta-pending-decisions.archived.md` 로 rename (또는 본문 상단에 "완료" 표시).
- **새 결정 추가**: P1~P6 진행 중 새 외부 결정 항목 발생 시 본 문서에 append — 단일 진실 공급원 유지.

## 9. 참조

- [`docs/PRODUCT-BETA.md`](../../docs/PRODUCT-BETA.md)
- [`docs/ROADMAP-BETA.md §5`](../../docs/ROADMAP-BETA.md) — 원본 블로커 맵
- [`docs/UX-BETA-WIREFRAME.md §9`](../../docs/UX-BETA-WIREFRAME.md)
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md)
- [`progress/notes/adr-0007-option-diffs.md`](./adr-0007-option-diffs.md)
- [`progress_0420/PLAN.md §3·§1`](../../progress_0420/PLAN.md)
