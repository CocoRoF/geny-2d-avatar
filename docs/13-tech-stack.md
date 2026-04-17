# 13. 기술 스택 (Tech Stack)

> **한 줄 요약**: 최소한의 선택지를 고르고, 그 선택지가 옳은 이유를 기록한다. **"더 좋은 게 있다" 보다 "팀이 유지보수 가능한가" 가 우선**. 새 기술은 PoC 없이는 채택하지 않는다.

---

## 1. 선택 원칙

1. **Boring where possible, novel where it pays.** 본질 외 영역은 지루한 기술.
2. **오너십 있는 팀 ≥ 언어 유행**. 운영하는 사람이 싫어하는 스택은 고르지 않는다.
3. **열쇠는 어댑터화**. 외부 의존(특히 AI 벤더, Cubism)은 교체 가능하게.
4. **Self-host 전에 Managed**. 초기 운영 부담 최소화.
5. **개방형 포맷 + 폐쇄형 코어 결합**. 호환성·데이터 이동성을 지킨다.

---

## 2. 프런트엔드 (Frontend)

### 2.1 App

- **Next.js (App Router)** — 라우팅/이미지/서버 액션 통합, 인력풀.
- **React 19+** — Server Components, Streaming.
- **TypeScript strict**.
- **Tailwind CSS + shadcn/ui (Radix)** — 디자인 토큰 일관.
- **Zustand** (global state) — 에디터 상태 분리.
- **TanStack Query** — 서버 상태 캐시/재시도.
- **Framer Motion** — 마이크로 인터랙션.
- **tsx canvas renderer** for preview player (경량 자체 런타임 공유).

### 2.2 에디터 캔버스

- **WebGL2** (우선), **WebGL1 fallback**.
- **OffscreenCanvas + WebWorker** — 프리뷰 스레드 분리.
- **PixiJS** (검증된 2D 엔진) 또는 자체 미니 런타임 중 택1.
  - 결정 기준: 내부 번들 포맷과의 매핑 용이성, 번들 크기.
  - 초기 β: PixiJS 로 빠르게, GA 에서 자체 런타임 대체 가능.

### 2.3 품질 도구

- ESLint (flat config), Prettier, TypeScript project refs.
- Playwright (e2e), Vitest + RTL (단위), Storybook.

### 2.4 접근성/국제화

- `react-aria` 사용.
- `next-intl` 로 i18n.

---

## 3. 백엔드 (Backend)

### 3.1 언어/프레임워크

- **Python 3.12** (파이프라인/AI 인접) — 과학 라이브러리 생태계.
- **TypeScript (Node 20+)** (API/오케스트레이션 일부) — 프런트와 공유.
- **Go** 선택지: 핵심 I/O 서비스가 CPU 바운드가 아니고, 수평 확장 필요 시 일부 서비스에 적용 검토 (β 후 결정).

### 3.2 API 프레임워크

- **FastAPI** (Python) — 핵심 파이프라인/도메인.
- **Fastify / Nest.js** (TypeScript) — 에지 API / BFF (Backend For Frontend).
- gRPC 내부 통신(후기) — 초기엔 HTTP/JSON.

### 3.3 도메인 모델링

- Pydantic v2 (Python), Zod (TS) — 스키마 기반 검증.
- JSON Schema → 양쪽 공통 생성.

### 3.4 테스트

- pytest, hypothesis(fuzz), Schemathesis(계약 테스트), Testcontainers.

---

## 4. 파이프라인 / 오케스트레이션

### 4.1 오케스트레이터 선택지

| 선택지 | 장 | 단 |
|---|---|---|
| **Temporal** | 검증된 워크플로우 엔진, 재시도/결정적 실행 | 러닝 커브, 운영 |
| **Dagster** | 데이터 파이프라인 친화 | AI 이미지 워크플로우와 mismatch |
| **Prefect** | 쉬움, Python native | 장기 워크플로우엔 얕음 |
| **직접 구현** | 완전 맞춤, 작은 DAG | 처음부터 다시 만드는 비용 |

**잠정 결정**: **Temporal**. 이유: 재시도/시그널/타임아웃 같은 모든 운영 요구가 기본 내장, Python/TS SDK 양쪽 지원, 엔터프라이즈 운영 경험 풍부.

대안(경량): 초기엔 내부 `JobRunner` 로 충분하면 유지 → β 에서 Temporal 전환.

### 4.2 이벤트 브로커

- **NATS JetStream** — 가볍고 빠름, K8s 친화.
- **Kafka** — 장기 보존·재처리 필요 시 (β 후).

### 4.3 캐시

- **Redis** — 세션, 토큰, 파이프라인 캐시 인덱스.

---

## 5. 데이터 저장소 (Storage)

### 5.1 관계형

- **PostgreSQL 16** (managed: RDS / Cloud SQL / Neon).
- 확장:
  - `pgvector` — 스타일 임베딩 검색.
  - `pg_partman` — 이벤트 파티셔닝.
  - `pg_stat_statements` — 쿼리 프로파일.

### 5.2 오브젝트 스토리지

- **AWS S3 / Cloudflare R2** — R2 선호(이그레스 비용).
- Lifecycle policy: 임시 업로드 7일, 삭제된 자산 30일, 영구 자산 버전 관리.

### 5.3 검색

- **OpenSearch** (GA에서 도입) — 프리셋/템플릿 검색.
- 초기엔 Postgres trigram.

### 5.4 아카이브 / 백업

- Point-in-Time Recovery 7일.
- 월간 스냅샷 90일 보존.

---

## 6. AI 인프라 (AI Infra)

### 6.1 외부 이미지 생성 API

- **Google nano-banana (Gemini 2.5 Flash Image)** — primary.
- **Replicate** (SDXL, Flux-Fill 등 다수 모델 허브) — fallback.
- **fal.ai** — 저지연 서버리스 대안.

### 6.2 자체 호스팅 GPU

- **Hugging Face Diffusers + ComfyUI 워커**.
- 런타임: **vLLM** 대신 이미지 모델용 **Ray Serve**.
- GPU: 초기 L4/A10, 필요 시 A100/H100.
- 사용 시점: 비용 임계(월 $30k 초과) 혹은 네트워크 지연 요구.

### 6.3 세그/키포인트

- **SAM2**, **MediaPipe**, **OpenPose/Ultralytics YOLO-pose** 조합.
- 자체 소형 모델(ONNX) 로 경량화.

### 6.4 임베딩

- **OpenCLIP** (SigLIP 또는 BGE) — 스타일 비교.
- pgvector 에 저장, cosine 유사도.

### 6.5 실험 & 모델 관리

- **MLflow** 또는 **Weights & Biases** — 실험 기록.
- **DVC** — 골든셋/데이터셋 버전.

---

## 7. 인프라 (Infra)

### 7.1 오케스트레이션

- **Kubernetes** (managed: EKS/GKE/Fargate+EKS).
- **Helm / Kustomize** 로 매니페스트 관리.

### 7.2 IaC

- **Terraform** — 클라우드 리소스.
- **Pulumi** 대체 검토: TypeScript 일관성. 조직 역량에 따라 결정.

### 7.3 CI/CD

- **GitHub Actions** — PR CI.
- **Argo CD** — GitOps 배포.
- 환경 채널: dev → staging → prod-canary → prod.

### 7.4 관측성

- **Prometheus + Grafana** 메트릭.
- **Loki** 로그.
- **Tempo / OpenTelemetry** traces.
- **Sentry** 프런트/백 에러.

### 7.5 시크릿

- **Vault** 또는 클라우드 KMS.
- 외부 AI 벤더 키는 짧은 TTL, 자동 회전.

---

## 8. 보안 도구

- 의존성 스캔: **Snyk / Dependabot / OSV-scanner**.
- 코드 스캔: **Semgrep**.
- 시크릿 스캔: **Gitleaks**.
- 이미지 스캔: **Trivy**.
- 런타임: **Falco** (eBPF).

---

## 9. 결제 / 빌링

- **Stripe** — 구독/사용량/엔터프라이즈 청구.
- 과금 이벤트는 내부 이벤트 브로커에 먼저 기록 → Stripe 로 싱크.
- 세금: Stripe Tax.

---

## 10. 인증 / 계정

- **OIDC 기반 IdP**: Auth0, Clerk, 또는 Supabase Auth 중 택.
  - 기준: 조직 관리, 멀티테넌시, 가격.
  - 잠정: **Clerk** (개발 속도) → 엔터프라이즈 SSO 요구 증가 시 마이그레이션.
- SAML/SSO: 엔터프라이즈.

---

## 11. 커뮤니케이션 / 운영

- 문서: Notion/Confluence 중 택.
- 이슈: Linear.
- 장애 대응: PagerDuty.
- 고객 지원: Intercom / Zendesk.
- 내부 챗: Slack.

---

## 12. 개발 환경 (DX)

- **devcontainer** (VS Code) — Python/Node/GPU 옵션.
- **Nix** (옵션) — 재현 가능 셸.
- **Turborepo** + **pnpm** — 모노레포 Front/SDK.
- **uv** 또는 **poetry** — Python 의존성.
- 전역 `justfile` / `Taskfile` — 하위 명령 표준화.

---

## 13. 저장소 구조(Repo Layout) 제안

```
geny-2d-avatar/
├── apps/
│   ├── web/              # Next.js
│   ├── worker-cpu/       # Python
│   ├── worker-gpu/       # Python
│   ├── worker-ai/        # Python
│   └── api/              # Fastify/Nest (edge) + FastAPI (core)
├── packages/
│   ├── sdk-ts/
│   ├── sdk-py/
│   ├── web-avatar/       # @geny/web-avatar
│   └── unity-sdk/
├── services/
│   ├── orchestrator/
│   └── exporter/
├── schema/               # JSON Schema, protobuf
├── rig-templates/        # 공식 템플릿 (03)
├── infra/
│   ├── terraform/
│   └── helm/
├── docs/                 # 이 기획 문서
└── scripts/
```

---

## 14. 선택 근거(ADR 후보)

- `adr/0010-pick-temporal-over-custom.md`
- `adr/0011-postgres-pgvector-primary-store.md`
- `adr/0012-nextjs-app-router-for-editor.md`
- `adr/0013-pixijs-vs-own-mini-renderer.md`
- `adr/0014-clerk-for-auth-initial-then-re-eval.md`

---

## 15. 성능/비용 가이드

### 15.1 초기 규모 가정 (β)

- DAU 3k, 동시 세션 500, 시간당 아바타 생성 400.
- AI 호출 시간당 10k.
- 저장 증가 1TB/월.

### 15.2 예산 추정(월)

| 항목 | $ |
|---|---|
| Kubernetes 노드 (일반) | 3,000 |
| GPU 노드 (스포트 우선) | 4,000 |
| AI 벤더 호출 | 15,000 |
| Postgres Managed | 600 |
| 오브젝트 스토리지 | 400 |
| CDN | 500 |
| 관측성 | 400 |
| 외부 SaaS(Stripe/Clerk/Sentry 등) | 800 |
| **합계** | **~24,700** |

위 수치는 초기 가정이며, 비용 트래킹(02 §11.3 대시보드)로 주기적 업데이트.

---

## 16. 기술적 위험 (요약)

상세는 [17-risks-and-mitigation.md](./17-risks-and-mitigation.md).

- AI 벤더 가격/정책 변경.
- Cubism SDK 라이선스 변경.
- GPU 가용성/가격.
- 대규모 동시 사용자 유입 시 큐 폭주.

---

## 17. 폐기/전환 전략

- 특정 벤더/도구 전환은 **어댑터 계층**에서 처리.
- Postgres → 다른 RDB 전환 가능성 낮음. 필요 시 **샤딩/파티셔닝** 우선.
- 오케스트레이터 교체는 워크플로우 코드 재작성 비용 큼 — 결정 신중.

---

## 18. 채택 전 PoC 체크리스트

새 기술 채택 전 아래를 수행.

- [ ] 동작하는 데모(실제 기능 1개 커버).
- [ ] 운영 고려(배포/업그레이드/재해 복구).
- [ ] 교체 비용 추정.
- [ ] 라이선스/보안.
- [ ] 팀 학습 부담.

---

## 19. 열린 질문

- **Cloudflare 전면 도입(R2 + Workers + D1)**: 이그레스 비용 방어엔 강함. Workers 의 콜드 스타트/제약을 핵심 API에 채택할지.
- **Self-hosted AI** 의 진입 시점: GA 이전? 이후?
- **모노레포 vs 폴리레포**: 현재 모노레포 선호하지만 SDK 패키지는 별도 저장소로 가야 할 수도.

---

**다음 문서 →** [14. 로드맵과 마일스톤](./14-roadmap-and-milestones.md)
