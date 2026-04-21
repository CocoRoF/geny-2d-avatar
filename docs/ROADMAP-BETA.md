# ROADMAP-BETA — Foundation 이후 β 까지의 실행 로드맵

> 본 문서는 Foundation 종료(세션 127, 2026-04-21) 이후 **β 릴리스까지 뭘 만들지** 의 phase 별 실행 계약이다. `docs/PRODUCT-BETA.md` 의 9 개 검수 항목을 모두 green 으로 만드는 것이 β.

**이 문서는 카탈로그가 아니다**. 각 phase 는 "몇 세션 / 어떤 산출물 / 어떻게 검수" 가 구체적으로 지시된 **작업 지시서**다.

---

## 0. 상태 (2026-04-21)

| | |
|---|---|
| **Foundation** | ✅ Exit 4/4 + 릴리스 게이트 3/3 + lint C1~C14 + migrator + 렌더러 계약 패키지 |
| **β 진입 가능** | 🟡 조건부 — ADR 0007 Decision + BL-VENDOR-KEY + BL-STAGING 3 축 중 최소 1 (ADR 0007) 선행 |
| **치명적 결함** | **실 픽셀 렌더 부재 + 실 벤더 호출 경험 0 + 실 staging 배포 경험 0** |
| **β 목표 시점** | 사용자 승인 후 실 착수, Phase P1~P5 예상 15~25 세션 (2~3 주 full-focus) |

## 1. β 진입 흐름 (한 눈에)

```
Foundation 종료
      ↓
[ADR 0007 pick]  ←── ★ 사용자 Decision 필요 (외부 입력 1)
      ↓
P0 ─ UX wireframe 합의 (1 세션)
      ↓
P1 ─ 실 렌더러 첫 픽셀 (3~5 세션)
      ↓
P2 ─ 프롬프트 UI + Mock e2e (2~3 세션)
      ↓
[BL-VENDOR-KEY 해제]  ←── ★ 벤더 키 필요 (외부 입력 2)
      ↓
P3 ─ 실 nano-banana 통합 (3~5 세션)
      ↓
P4 ─ 파츠별 텍스처 생성 & 자동 조립 (3~5 세션)
      ↓
[BL-STAGING 해제]  ←── ★ 클러스터 필요 (외부 입력 3)
      ↓
P5 ─ staging 배포 & 실 관측 (2~3 세션)
      ↓
P6 ─ β 오픈 (open-ended)
```

**3 개의 외부 입력 축** 을 끊지 않으면 β 경로가 뚫리지 않는다. 이 중 **ADR 0007 은 이 저장소 안에서 해결 가능** (사용자의 Decision 한 줄 + Accept 커밋). 나머지 2 개는 운영 영역.

## 2. Phase 개요

| Phase | 목표 | 핵심 산출물 | 예상 세션 | 외부 의존 |
|---|---|---|---:|---|
| **P0** | UX wireframe + Generate flow 확정 | `docs/UX-BETA-WIREFRAME.md` | 1 | — |
| **P1** | **실 픽셀** — halfbody v1.3.0 aria 를 실 렌더러로 표시 | `@geny/web-avatar-renderer-pixi` + `<geny-avatar>` wire | 3~5 | ADR 0007 |
| **P2** | 프롬프트 UI + Mock 기반 end-to-end UX | web-editor Generate 패널 + orchestrator HTTP wire | 2~3 | P1 |
| **P3** | 실 nano-banana 통합 (1 슬롯부터) | 벤더 키 Secret + face 슬롯 실 호출 + 실 e2e 1 건 | 3~5 | P2 + BL-VENDOR-KEY |
| **P4** | 파츠 5 슬롯 자동 조립 + 품질 튜닝 | `@geny/texture-orchestrator` + 파츠별 프롬프트 템플릿 | 3~5 | P3 |
| **P5** | staging 배포 + 실 Prometheus/Grafana | Helm install + `beta.geny.ai` DNS + 실 대시보드 | 2~3 | P4 + BL-STAGING |
| **P6** | β 오픈 + 피드백 루프 | 베타 랜딩 + 사용자 테스트 + 지표 수집 | open-ended | P5 |

**합계**: P0~P5 = 14~22 세션. P6 는 운영 단계.

---

## 3. Phase 상세

### Phase P0 — UX wireframe + Generate flow 확정

**목표**: Generate 패널의 UI 레이아웃 / 진행 상태 / 실패 복구 경로를 **문서 한 장으로 고정**. 개발 착수 전 사용자 승인.

**작업 단위**
- `docs/UX-BETA-WIREFRAME.md` 작성 — Generate 패널 위치, 프롬프트 필드, 진행 상태 표시, 에러 메시지, 재시도 버튼, 완료 후 inspector 활성화 순서.
- 기존 `docs/09-user-interface-ux.md` §2~§4 와 diff 표기 — β 에서만 변하는 부분을 별도 블록으로 명시.
- 파츠 5 슬롯 (`face`/`hair_front`/`hair_back`/`body`/`eyes`) 별 진행 바 레이아웃 결정 (단일 바 vs 슬롯별 5-바).
- 실패 메시지 텍스트 카피 초안 (한/영 2 언어).

**검수 기준**
- [ ] 사용자가 wireframe md 를 리뷰하고 "이대로 진행" 승인.
- [ ] Wireframe 이 `docs/PRODUCT-BETA.md §2.1~§2.3` 3 시나리오 전부 커버.
- [ ] 모바일 제외 명시 (데스크톱 Chrome/Safari 가정 명문화).

**리스크**
- UX 논의가 길어지면 코드 착수 지연. 완벽보다 "β 한 번 돌려볼 수 있는 최소 단위" 로 종료.

**산출물**: `docs/UX-BETA-WIREFRAME.md` (1 파일, ~200 줄).

---

### Phase P1 — 실 픽셀 첫 렌더 (halfbody v1.3.0 aria)

**목표**: ADR 0007 Decision 에 따라 실 렌더러 구현체를 만들고, 기존 aria 번들이 **브라우저에서 실제 픽셀로 표시**되는 경로를 확보. 프롬프트 생성 없이도 "아바타가 보인다" 는 증거를 먼저 확보한다.

**전제**: ADR 0007 Accepted (Option E 권장 — 첫 Spike 부터 인터페이스 + 구현체 분리).

**작업 단위 (세션 분할 예시)**

| 세션 | 산출물 | 완료 조건 |
|---|---|---|
| P1-S1 | `@geny/web-avatar-renderer-pixi@0.1.0` 스캐폴드 | `package.json` + `tsconfig` + `src/pixi-renderer.ts` 스텁 + 기존 `Renderer` 계약 구현. `pnpm build` 통과 |
| P1-S2 | `loadBundle → Sprite` 1 파츠 렌더 | aria 의 `face` 파츠 1개만 `<canvas>` 위에 Pixi `Sprite` 로 출력. 위치/스케일 정확 |
| P1-S3 | 전 파츠 렌더 + `deformation_parent` 트리 | 30 파츠 전부 출력 + 부모-자식 변환 누적 |
| P1-S4 | `setParameter` → 실 변형 | `angle_x` / `mouth_open_y` / `eye_l_open` 3 축이 렌더 결과에 반영. 파라미터→디포머 매트릭스 적용 |
| P1-S5 | `<geny-avatar>` wire-through + golden 회귀 | `web-avatar` 가 `?renderer=pixi` 플래그 시 pixi 렌더러 활성. `web-editor` 기본 경로 교체. 기존 SVG 렌더러는 `?debug=svg` 로 보존 |

**검수 기준**
- [ ] `pnpm --filter @geny/web-editor dev` 실행 → 브라우저에서 aria 의 실제 그림이 보임 (SVG 박스 X)
- [ ] DevTools Canvas 탭에 실 WebGL draw call 기록됨
- [ ] Inspector 슬라이더 이동 시 얼굴/입/눈이 실제로 움직임
- [ ] golden 30 step 전부 green (SVG 렌더러 회귀 유지)
- [ ] bundle 크기 증가가 Option E 예상치(docs/ADR 0007 Option A §2.5) 내 (~250KB min+gz)
- [ ] `pnpm --filter @geny/web-avatar-renderer-pixi test` green

**리스크**
- Pixi 의 mesh deformation 이 Cubism 의 Warp/Rotation 디포머 수식과 1:1 대응하지 않을 수 있음 — 세션 P1-S4 에서 조기 발견 시 Option D(자체 WebGL2) 재검토 트리거.
- 텍스처 번들이 실제로는 atlas 조립이 안 되어 있을 수 있음 (aria 번들은 개별 파츠 PNG) — P1-S2 에서 atlas 선행 조립 여부 결정.

**산출물**: `packages/web-avatar-renderer-pixi/` 신규, `packages/web-avatar/` 의 `element.ts` 약간 touch (renderer factory hook).

---

### Phase P2 — 프롬프트 UI + Mock end-to-end

**목표**: 사용자가 프롬프트를 입력하고 **Mock 벤더가 반환한 이미지** 가 프리뷰에 반영되는 경로를 완성. 실 벤더 호출 없이 UX 전체가 완결되어야 한다.

**작업 단위**

| 세션 | 산출물 | 완료 조건 |
|---|---|---|
| P2-S1 | Generate 패널 UI | web-editor 상단 또는 우측에 프롬프트 `<textarea>` + Generate 버튼 + 진행 표시기 |
| P2-S2 | `orchestrate()` HTTP 호출 wire-through | 브라우저 → orchestrator-service POST /jobs. BullMQ 경로 스킵 (P2 는 직접 orchestrate 동기 호출 허용) |
| P2-S3 | Mock 이미지 → post-processing → 번들 패치 | `mock-vendor-server` 가 준비한 샘플 PNG → `applyAlphaSanitation` → aria 번들의 face 텍스처 교체 |
| P2-S4 | 상태 기계 (idle/generating/success/error) + 재시도 UI | `useGenerateState()` hook 또는 동등 상태 관리. 에러 ID 표시 |

**검수 기준**
- [ ] Mock 벤더가 켜진 상태에서 프롬프트 입력 → 5 초 내 프리뷰 face 텍스처 교체
- [ ] 진행 바가 4 단계 상태를 실제로 반영 (분석/생성/조립/완료)
- [ ] 실패 시나리오(`--fail-rate-edit 1.0`) 에서 에러 메시지 + 재시도 버튼 정상 동작
- [ ] 기존 Foundation 시나리오(슬라이더만 조작) 무회귀
- [ ] Generate 요청이 worker-generate `/jobs` 엔드포인트에 도달 (관측 로그)

**리스크**
- 프롬프트 text 만으로 Mock 이미지를 결정 못 함 — Mock 은 seed 기반 프리셋 이미지 3~5 장 회전.
- 상태 관리 프레임워크 선택 (React? Solid? Vanilla?) — web-editor 가 현재 vanilla TS/Web Components 이므로 Vanilla 유지 권장.

**산출물**: `apps/web-editor/src/generate-panel/` 신규, `packages/web-editor-generate-client/` 선택적 분리, orchestrator-service `/jobs` API surface 확장.

---

### Phase P3 — 실 nano-banana 통합 (face 슬롯 1 개부터)

**목표**: BL-VENDOR-KEY 해제 후, face 슬롯 1 개라도 **실 nano-banana 엔드포인트** 로 호출해서 실 이미지로 프리뷰에 반영되는 최소 경로를 확보.

**전제**: Google Gemini API 키 확보 + quota. `infra/vendor-keys/` 디렉터리 + sealed-secret 또는 env 주입 경로.

**작업 단위**

| 세션 | 산출물 | 완료 조건 |
|---|---|---|
| P3-S1 | 벤더 키 주입 인프라 | `values-staging.yaml` 에 `secrets.nanoBananaApiKey` 경로. 로컬은 `.env.local` (.gitignore). orchestrator-service 가 `loadApiKeysFromCatalogEnv` 경유해 읽음 |
| P3-S2 | nano-banana face 슬롯 프롬프트 템플릿 | `infra/prompts/face.v1.md` — 사용자 프롬프트 + 뼈대 UV 제약 + style anchor |
| P3-S3 | 첫 실 호출 E2E | `pnpm exec node scripts/vendor-smoke.mjs --slot face --prompt "은발 트윈테일"` 이 실 nano-banana 호출 → PNG 반환 → `rig-templates/.../parts/face.spec.json` UV 영역 내 매핑 검증 |
| P3-S4 | 비용/지연 관측 실측 | 10 회 호출 샘플에서 `cost_usd` / `duration_seconds` Grafana 에 실 분포 표시 |
| P3-S5 | 1-hop fallback 실증 | nano-banana 의도 실패(잘못된 키) → sdxl 실 호출로 fallback 경로 확인 |

**검수 기준**
- [ ] `curl` 이 아니라 파이프라인 전체를 거쳐 실 HTTP 요청이 `generativelanguage.googleapis.com/...` 에 도달
- [ ] 반환 이미지가 256x256 또는 규정 해상도로 돌아옴, post-processing 파이프라인 통과
- [ ] 실 호출 10 회 중 `geny_ai_call_total{status="ok"}` 최소 7 회
- [ ] atlas UV 매핑이 face 슬롯 범위를 벗어나지 않음 (자동 검증 스크립트)
- [ ] 1-hop fallback 관측 증거 (`geny_ai_fallback_total` ≥ 1)

**리스크**
- **비용 폭발**: 실수로 loop 호출 시 quota 소진. 세션 P3-S1 에서 CLI level rate-limit + dry-run 모드 필수.
- **프롬프트 품질**: 첫 시도는 "뼈대 UV 안에 안 들어오는 그림" 이 나올 확률 높음 — 프롬프트 템플릿 v1→v2 반복 예상.
- **legal**: nano-banana 약관 중 "output ownership" 확인 (GCP Gemini 약관 §7).

**산출물**: `infra/prompts/`, `scripts/vendor-smoke.mjs`, `packages/ai-adapter-nano-banana/` 의 HTTP 호출 경로 tune-up.

---

### Phase P4 — 파츠 5 슬롯 자동 조립 + 품질 튜닝

**목표**: 프롬프트 1 줄 → face + hair_front + hair_back + body + eyes **5 슬롯 동시 생성** → 자동 atlas 조립 → 완성된 아바타.

**작업 단위**

| 세션 | 산출물 | 완료 조건 |
|---|---|---|
| P4-S1 | `@geny/texture-orchestrator@0.1.0` | 5 슬롯 병렬 `orchestrate()` 호출 + Promise.allSettled 패턴 + 부분 실패 허용 |
| P4-S2 | 슬롯별 프롬프트 템플릿 5 종 | `infra/prompts/{face,hair_front,hair_back,body,eyes}.v1.md` |
| P4-S3 | style consistency 앵커 | 첫 슬롯(face) 결과를 `style_reference` 로 후속 슬롯에 피드백 (nano-banana `reference_image` param 활용) |
| P4-S4 | atlas 조립 자동화 | `assembleWebAvatarBundle` 이 동적 텍스처 5 장으로 atlas 재조립 후 번들 emit |
| P4-S5 | 품질 검증 스크립트 | `scripts/quality-check-bundle.mjs` — UV 정합성 / alpha 경계 / 색역 sanity 자동 검사 |

**검수 기준**
- [ ] 프롬프트 1 줄 → 30 초 내 5 슬롯 텍스처 생성 + atlas 조립 + 프리뷰 반영
- [ ] 5 슬롯 중 style consistency (머리색/선화/광원) 육안으로 납득 가능
- [ ] 부분 실패(1~2 슬롯 fail) 시 기본 텍스처로 fallback + 사용자에게 어느 슬롯이 fail 인지 표시
- [ ] quality-check 스크립트가 UV 초과 / alpha 깨짐 탐지

**리스크**
- style consistency 가 nano-banana 단독으로 불충분할 수 있음 — IP-Adapter 또는 reference image 주입이 어댑터 레벨에서 필요. `docs/05 §2.1` 의 Style-Transfer 축 당겨올 가능성.
- 5 슬롯 동시 호출 비용 × 실패 재시도 = P3 의 5 배 비용 burst. quota 재산정 필요.

**산출물**: `packages/texture-orchestrator/`, `infra/prompts/*.md` 5 종, `scripts/quality-check-bundle.mjs`, orchestrator `/jobs` API 확장 (multi-slot).

---

### Phase P5 — staging 배포 + 실 관측

**목표**: BL-STAGING 해제 후 실 K8s cluster 에 Helm install + Prometheus 실 스크레이프 + Grafana 대시보드 live + `beta.geny.ai` DNS.

**작업 단위**

| 세션 | 산출물 | 완료 조건 |
|---|---|---|
| P5-S1 | kubeconfig + namespace | `kubectl` 접근 확보, `geny-beta` namespace |
| P5-S2 | Helm install (Redis + worker + orchestrator + web-editor) | 모든 Pod Ready, Service/Ingress 동작 |
| P5-S3 | DNS + TLS | `beta.geny.ai` A record + cert-manager TLS |
| P5-S4 | Prometheus 실 scrape 연동 | kube-prometheus-stack 의 ServiceMonitor 가 worker-generate `/metrics` 실 수집 |
| P5-S5 | Grafana 대시보드 live 검증 | AI Generation / Queue / SLO Overview 3 대시보드가 실 데이터 표시. 수동 10 회 호출 후 차트 확인 |

**검수 기준**
- [ ] 외부 네트워크(예: 휴대폰 4G) 에서 `https://beta.geny.ai` 접속 → web-editor 로드
- [ ] 프롬프트 입력 → 프리뷰 완성 시나리오 A 실 URL 에서 성공
- [ ] Grafana 3 대시보드가 모두 live 데이터
- [ ] P5-S5 의 10 회 호출이 `geny_ai_call_total` 에 합산됨
- [ ] Alertmanager 라우팅 (P1→PagerDuty, P2→Slack) dry-run 으로 검증

**리스크**
- cluster 별 ingress-controller / storage-class / 네임스페이스 정책 상이 — Helm `values-staging.yaml` 에 override 필요.
- TLS 인증서 발급 전파 지연 + DNS TTL.

**산출물**: `infra/helm/values-staging.yaml` 확정, `docs/DEPLOY-STAGING.md` 배포 runbook, 실 지표 caption 스크린샷.

---

### Phase P6 — β 오픈 + 피드백 루프 (open-ended)

**목표**: 소수 사용자(5~10 명) 초대, 실 프롬프트 분포 수집, failure mode 분류, 프롬프트 템플릿 튜닝.

**작업 단위 (예시, 세션 단위 미고정)**
- 베타 랜딩 페이지 (landing.geny.ai 또는 beta 내 README)
- 피드백 수집 경로 (Google Form + 에러 ID 링크)
- 실 프롬프트 로그 (PII 제거 후 5 일 치 샘플)
- 프롬프트 템플릿 v2 (실 실패 사례 기반 개선)
- 비용/품질 weekly report 자동 생성

**검수 기준**
- [ ] 5 명 이상 실 사용자가 시나리오 A 완주
- [ ] 성공률 `docs/PRODUCT-BETA.md §7` 6 지표 모두 목표치 달성
- [ ] failure mode 최소 3 종 분류 + 각 대응안 docs 에 기록

**산출물**: `docs/BETA-FEEDBACK-LOG.md`, 프롬프트 템플릿 v2, 운영 runbook v2.

---

## 4. Cross-phase 축 (모든 phase 에서 동시 추적)

### 4.1 관측

- P1 진입 시 렌더러 frame budget / GC / 메모리 워닝 계측 추가.
- P2 부터 orchestrator trace ID 를 UI 에 노출 (에러 복원용).
- P5 에서 실 스크레이프 활성화 — 그 전엔 로컬 Prometheus 로 dry-run.

### 4.2 성능 SLO

- Foundation Mock SLO 를 β Mock SLO 로 재정의 필요. P2 에서 갱신.
- P3 에서 실 벤더 p95 baseline 최초 capture.
- p95 30 초 목표는 β 기준. 30s 초과 지속 시 P4 style consistency pipeline 단순화 검토.

### 4.3 보안

- 프롬프트 safety filter: P2 에서 Mock 레벨 구현, P3 에서 실 Google Safety API 또는 자체 규칙 적용.
- 벤더 키: P3 부터 server-side only, 브라우저로 절대 유출 금지.
- rate-limit: P5 에서 Cloudflare level.
- gitleaks CI: 모든 phase 계속.

### 4.4 비용

- phase 별 예산 (대략):
  - P0~P2: $0 (Mock only)
  - P3: $50 (초기 smoke)
  - P4: $150 (5 슬롯 × iteration)
  - P5: $100 (staging 10 회 가동 검증)
  - P6: $200+ (사용자 테스트)
- 각 phase 시작 시 quota limit 설정. over-run 시 중단 스위치.

## 5. 블로커 맵

| 블로커 | 차단 phase | 해제 주체 | 해제 조건 |
|---|---|---|---|
| ADR 0007 Decision | P1 진입 | 사용자 / PM | `progress/adr/0007-renderer-technology.md` Decision 섹션 Accepted 로 교체 |
| BL-VENDOR-KEY | P3 진입 | 운영 + 사용자 | GCP 프로젝트 + Gemini API 키 + 월 quota ≥ 1000 req |
| BL-STAGING | P5 진입 | 인프라 | K8s cluster + kubeconfig + DNS + TLS |
| BL-BUDGET | P3 이후 지속 | 사용자 / 재무 | β 기간 $500 예산 승인 |
| BL-LEGAL | P6 open | 법무 | nano-banana 약관 output ownership 검토 완료 |

## 6. 세션 운영 규칙 (Foundation 과의 차이)

| 축 | Foundation 기간 (세션 1~127) | β 기간 (P0~P6) |
|---|---|---|
| 세션 단위 | 1 세션 = 한 축 (lint 규칙 1 개, 패키지 1 개 README 등) | 1 세션 = phase 내 1 단계 (P1-S1, P1-S2 등 명시적 id) |
| 자율 모드 | 활성 (지시 전까지 loop) | **비활성** — 모든 세션은 사용자가 "P?-S? 진행" 으로 **명시 지시** 후 착수 |
| 커밋 메시지 | `docs(...)` 중심, 카탈로그 위주 | `feat(P<phase>): <deliverable>` 중심, 실 기능 위주 |
| 검수 | golden step CI 통과 | **위 각 phase 의 검수 기준** 전부 green |
| 문서 업데이트 | 매 세션 INDEX/PLAN/SUMMARY 3 파일 | 해당 phase 의 detail doc (`docs/PHASES/P<n>.md` 생성 시) 만. progress_0420 은 **phase 완료 시에만** bump |
| 브랜치 | main 직접 commit | phase 단위 feature branch 권장 (`feat/p1-renderer-pixi` 등) |

자율 loop 는 Foundation 까지의 역할로 **역할을 다했다**. β 기간은 사용자 지시 + 명시적 phase 진입이 원칙.

## 7. "다음 액션 한 줄"

**현재**: Foundation 종료 + β 플랜 수립 완료. 코드 변경 없음.

**다음 액션 (사용자 선택)**:
1. `docs/PRODUCT-BETA.md` + 본 ROADMAP 리뷰 → 승인 or 수정 요청.
2. 승인 시: ADR 0007 Decision 한 줄 pick (Option A/C/D/E 중).
3. Decision 후: P0-S1 (UX wireframe) 세션 착수 지시.

β 경로는 사용자의 3 개 의사결정(ADR 0007 / vendor key / staging) 으로 열린다. 나머지는 실행이다.

## 8. 참조

- `docs/PRODUCT-BETA.md` — 제품 정의 + 검수 항목 9 개
- `docs/01-vision-and-goals.md` — 장기 비전
- `docs/05-ai-generation-pipeline.md` — AI 어댑터 계약
- `docs/09-user-interface-ux.md` — UX 전체 스펙
- `docs/14-roadmap-and-milestones.md` — Foundation 포함 장기 로드맵 (β 구간은 본 문서로 치환)
- `progress/adr/0007-renderer-technology.md` — 렌더러 기술 Draft (Decision 대기)
- `progress/notes/adr-0007-option-diffs.md` — Option 별 코드 영향 예상 diff
- `rig-templates/README.md` — 사용 가능 템플릿 카탈로그 (β 는 halfbody v1.3.0 선택)
