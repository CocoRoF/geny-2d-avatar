# PRODUCT-BETA — β 릴리스 제품 정의

> **"사용자가 웹에서 프롬프트를 입력하면, Geny 가 뼈대(리그 템플릿) 에 맞는 텍스처를 생성해 실제로 움직이는 2D 아바타를 프리뷰에 띄운다."**

이 문서는 Foundation 단계 종료 후 **β 릴리스까지 무엇을 만들고 무엇을 만들지 않을지** 를 결정한다. Foundation 축의 상세 스펙(docs/01~18)은 그대로 유효 — 본 문서는 "지금부터 β 까지 제품으로서 어떻게 보이게 할 것인가" 의 상위 계약이다.

---

## 1. 한 줄 정의

**프롬프트 → 텍스처 → 아바타 프리뷰**. 단일 웹 URL 에 접속한 사용자가 프롬프트 한 줄을 입력하면 30초 내에 뼈대에 맞는 텍스처가 생성되어 실제로 움직이는 halfbody 아바타를 본다.

## 2. 핵심 사용자 시나리오 (β 기준)

### 2.1 시나리오 A — "Creator" (VTuber 지망생)

1. `https://beta.geny.ai` 접속 → web-editor 로드.
2. 템플릿 고정 (`halfbody v1.3.0`, β 는 1 템플릿).
3. 프롬프트 입력: `"은발 트윈테일, 고스로리 교복, 보라색 눈"`.
4. **[Generate]** 버튼 클릭.
5. 진행 바: `분석 중 → 텍스처 생성 중 (1/5) → 조립 중 → 완료`.
6. 30 초 이내 프리뷰에 아바타 실제로 그려짐 (실 픽셀, SVG 박스 X).
7. Inspector 슬라이더 조작 → `angle_x`/`angle_y` 움직이면 얼굴이 실제로 회전. `mouth_open_y` 움직이면 입이 실제로 벌어짐.
8. [Motion: idle.default] 재생 → 숨쉬는 모션 관측.

### 2.2 시나리오 B — 실패 경로

1. 프롬프트가 safety filter 에 걸림 → `"이 프롬프트는 생성할 수 없습니다 (사유: policy)"` 안내 + 원인 표시.
2. 벤더 1-hop fallback → `nano-banana 실패 → SDXL 재시도 중` 표시 + 결과적으로 성공.
3. 모든 벤더 실패 → `"다시 시도" 버튼 + 오류 ID` (관측 축에서 추적 가능한 ID).

### 2.3 시나리오 C — 파라미터만 조작

1. 생성 없이 기본 aria 번들 로드 → 슬라이더 조작만으로 표정/각도 변경 확인.
2. β 는 저장/공유 없음 (탭 닫으면 사라짐).

## 3. "실제로 볼 수 있다" 의 정의 (β Release Criteria)

| # | 항목 | 검수 방법 |
|---|---|---|
| 1 | **실 픽셀 렌더** | Chrome DevTools Canvas 탭에서 `<canvas>` 에 실제 drawImage/WebGL 호출이 잡힘. SVG `<rect>` 플레이스홀더가 아님 |
| 2 | **프롬프트 입력 UI** | web-editor 상단에 입력 필드 + Generate 버튼 + 진행 상태 표시 |
| 3 | **실 벤더 호출** | Network 탭에서 nano-banana API URL 에 실제 HTTPS POST 목격 (Mock 서버 X) |
| 4 | **텍스처 → 뼈대 매핑 정확성** | 생성된 얼굴 텍스처가 face 파츠 슬롯 UV 범위 내에서 렌더, 다른 파츠(hair) 위로 넘치지 않음 |
| 5 | **파라미터 반영** | `setParameter("angle_x", 20)` 호출 시 실제 렌더 결과에서 얼굴 회전 관측 |
| 6 | **staging URL 접근** | 외부 네트워크에서 `https://beta.geny.ai` 로 접근해 1 명이라도 시나리오 A 완주 |
| 7 | **관측 실 동작** | Grafana 에서 `geny_ai_call_total` / `geny_queue_depth` / `geny_ai_call_duration_seconds_bucket` 이 실 트래픽 기반 차트로 표시됨 |
| 8 | **생성 성공률** | 10 회 연속 프롬프트 실행 시 최소 7 회 프리뷰까지 도달 (품질 무관, "그림이 그려졌는가" 기준) |
| 9 | **p95 지연** | 프롬프트 제출 → 프리뷰 완성 p95 ≤ 30 초 |

이 9 개가 전부 green 이면 β.

## 4. MVP 범위 — **포함**

| 축 | 포함 |
|---|---|
| 템플릿 | `halfbody v1.3.0` **1 종만** |
| 생성 | 프롬프트 1 줄 → 단일 아바타 1 건 생성 |
| AI 어댑터 | `nano-banana` (primary) + `sdxl` (1-hop fallback). `flux-fill` 은 2-hop 으로 보유하나 UI 숨김 |
| 파츠 생성 범위 | `face` + `hair_front` + `hair_back` + `body` + `eyes` (5 슬롯). 의상 디테일/악세서리는 auto-fill 또는 base asset |
| 프리뷰 | 파라미터 30 개(halfbody v1.3.0) 슬라이더 반영 + 모션 9 종(idle/blink/mouth 등) 재생 |
| 배포 | staging cluster 1 개 (`beta.geny.ai` 단일 URL) |
| 보안 | Cloudflare rate-limit + prompt safety filter + 벤더 키 server-side only |

## 5. MVP 범위 — **제외** (명시적 비목표)

- fullbody v1.0.0 (Foundation 에서 저작했으나 β 는 halfbody 만)
- 저장 / 히스토리 / 계정 / 로그인 (β 는 익명, 탭 닫으면 소멸)
- 멀티 아바타 / 씬 편집 / 마켓플레이스 / 결제
- 3D / 비디오 / 음성 / 립싱크
- 모바일 최적화 (데스크톱 Chrome/Safari 최신 2 버전만)
- 사용자 정의 어댑터 업로드
- 실시간 협업
- 커스텀 템플릿 저작 기능 (β 는 base 템플릿 읽기 전용)

## 6. 명시적 가정 & 의존성

- **ADR 0007 Decision 확정** — Option E(하이브리드, 권장) 기준으로 PixiJS 구현체 진입. 확정되지 않으면 β 불가능.
- **nano-banana 벤더 키 확보** (`BL-VENDOR-KEY` 해제). GCP 프로젝트 + Gemini API 키 + quota.
- **staging cluster access** (`BL-STAGING` 해제). K8s kubeconfig + DNS + TLS 인증서.
- **비용 예산** — β 테스트 기간 중 $200~$500 벤더 콜 비용 (사내 할당).
- **legal clearance** — nano-banana 약관 + 생성 콘텐츠 라이선스 검토.

## 7. 성공 지표 (β)

| 지표 | 목표 | 측정 경로 |
|---|---|---|
| 프롬프트→프리뷰 p95 지연 | ≤ 30 초 | Grafana `histogram_quantile(0.95, geny_ai_call_duration_seconds_bucket)` + frontend timing |
| 생성 성공률 | ≥ 70% (10 회 중 7 회 프리뷰 도달) | 수동 테스트 + `geny_ai_call_total{status="ok"}/total` |
| 1-hop fallback 동작률 | 실 측정 ≥ 0 회 (의도된 실패 케이스에서) | `geny_ai_fallback_total` |
| 실 demo URL 동시 접속 | ≥ 5 사용자 세션 | Cloudflare Analytics |
| 비용 per 생성 | ≤ $0.05 (nano-banana 기준) | `geny_ai_call_cost_usd_sum / count` |
| 전체 실패율 (terminal failure) | ≤ 5% | `geny_queue_failed_total{reason!="retry"}` |

## 8. β 와 Foundation 의 경계

Foundation 이 확보한 것 (그대로 재사용):
- 5 리그 템플릿 + rig-template-lint C1~C14
- 22 JSON Schema + 검증 CI
- exporter-core + exporter-pipeline + post-processing
- orchestrator-service + worker-generate + BullMQ
- ai-adapter 3 종 (mock 포함) + routeWithFallback
- web-editor 3-column 레이아웃 + `<geny-avatar>` + web-editor-renderer (SVG 프리뷰)
- 관측 4 단 방어망 + Helm chart + gitleaks CI

β 에서 새로 만드는 것:
- **실 픽셀 렌더러** (`@geny/web-avatar-renderer-pixi`)
- **프롬프트→생성 UI** (web-editor Generate 패널)
- **texture-orchestrator** (파츠별 프롬프트 분리 + 자동 조립)
- **실 벤더 키 인프라** (Secret → Pod env)
- **staging 배포** + 실 관측 스크레이프
- **프롬프트 엔지니어링** (파츠별 템플릿 + style consistency)
- **β landing URL** + rate-limit + safety filter 실 활성화

## 9. 참조

- `docs/01-vision-and-goals.md` — 장기 비전 (β 이후 GA 범위 포함)
- `docs/05-ai-generation-pipeline.md` — AI 어댑터 계약 + 슬롯 채우기 원칙
- `docs/09-user-interface-ux.md` — UX 상세 스펙
- `docs/14-roadmap-and-milestones.md` — 장기 로드맵 (β 는 일부 구간만)
- `docs/ROADMAP-BETA.md` — β 까지 phase 별 실행 로드맵 (본 문서의 실행 문서)
- `progress/adr/0007-renderer-technology.md` — 렌더러 Option 정렬
- `progress/notes/adr-0007-option-diffs.md` — Option 별 코드 영향 예상 diff
