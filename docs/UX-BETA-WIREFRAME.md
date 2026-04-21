# UX-BETA-WIREFRAME — β 릴리스 UX 와이어프레임 (Phase P0 산출물)

> **상태**: P0-S1 세션 2026-04-21 작성, **사용자 승인 대기** (🟡).
> 이 문서가 승인되면 `progress_0420/PLAN.md §2` 의 P0 상태가 ✅ 로 bump 되고 P1 (ADR 0007 Decision 후) 로 진입.

본 문서는 [`docs/PRODUCT-BETA.md §2.1~§2.3`](./PRODUCT-BETA.md) 의 3 시나리오 (Creator / 실패 경로 / 파라미터만) 를 `apps/web-editor` 화면 하나 안에서 완결하는 **최소 UI 계약**을 정한다. Foundation 의 [`docs/09-user-interface-ux.md`](./09-user-interface-ux.md) §2~§4 를 정신적 상위 문서로 삼되, β 에서 **바뀌는 부분** 과 **구현하지 않는 부분** 을 명확히 분리한다.

---

## 1. β UX 계약 한 줄

> **1 URL · 1 템플릿 · 1 프롬프트 필드 · 1 Generate 버튼 · 5 슬롯 진행 바 · 1 프리뷰 캔버스 · 1 Inspector 사이드바.** 그 외 요소는 전부 β 제외.

## 2. 09-user-interface-ux.md 와의 Diff (β 만의 축소)

| 09 §2~§4 요소 | β 포함 여부 | 비고 |
|---|---|---|
| IA 의 [Home] → [Start New Avatar] | ❌ 제외 | β 는 단일 에디터 URL, onboarding 없음 |
| Onboarding Wizard (Use case / Body type / Mood) | ❌ 제외 | halfbody v1.3.0 고정, 사용자 선택 없음 |
| Quick Start / From Illustration / From Preset 3 분기 | ❌ 제외 | β 는 "프롬프트 한 줄" 경로만 |
| Editor 의 TopBar (Save / History / Share / Export) | ❌ 제외 | 저장/공유/export 없음 (탭 닫으면 소멸) |
| Editor 의 3-column 레이아웃 (Parts / Preview / Inspector) | ✅ **유지** | 현 web-editor 구조 그대로 |
| Parts 사이드바 (썸네일 + 상태 배지) | ⚠️ 축소 | β 에서는 "상태 배지" 만 사용(파츠별 generated/pending). 썸네일/우클릭 메뉴 없음 |
| Preview Player (Pose Picker / Custom sliders / Record clip) | ⚠️ 축소 | Custom sliders = Inspector 파라미터 슬라이더. Pose Picker / Record 제외 |
| Inspector (Prompt / Style Profile / Reference / Advanced) | ⚠️ 축소 | Inspector = parameters / motions / expressions 3 탭 (기존 Foundation) + **Generate 상태** 표시. Style Profile / Reference / Advanced 제외 |
| Validation Report (하단) | ❌ 제외 | β 는 성공/실패 이진. Validation report 없음 |
| Library / Workspace / Community | ❌ 제외 | β 는 로그인·계정 없음 |
| §5.2 이탈/복귀 (서버 측에서 계속 진행) | ❌ 제외 | β 는 탭 session, 이탈 = 취소 |
| §5.3 실패 메시지 3 요소 (무엇/왜/할 수 있는 것) | ✅ **유지** | §6 에서 구체 카피 |
| §7 태블릿/모바일 반응형 | ❌ 제외 | 데스크톱 Chrome/Safari 최신 2 버전만 |
| §8 접근성 (키보드/색대비/photosensitive) | ⚠️ 최소 | 키보드 `Enter` 로 Generate 만 지원. 나머지는 β 후 |
| §11 i18n (KO/EN/JA) | ⚠️ 축소 | β 는 **KO + EN 2 언어만** 카피 보유. JA / 자동 번역 없음 |

**β 에서 추가되는 요소** (09 에 없는 것):
- **상단 Generate bar** (Preview 캔버스 위) — §3 그림 참조.
- **파츠별 진행 배지 5 개** — `face` / `hair_front` / `hair_back` / `body` / `eyes` 각각 상태.
- **에러 배너 + 재시도 버튼** — Generate 실패 복구.
- **Error ID** — 관측 축(Grafana trace) 으로 연결되는 8-char hex.

## 3. 레이아웃 (ASCII)

```
┌────────────────────────────────────────────────────────────────────────┐
│  Geny β   halfbody v1.3.0                                               │ ← 1-line header (title only)
├────────────────────────────────────────────────────────────────────────┤
│  Prompt: [ 은발 트윈테일, 고스로리 교복, 보라색 눈       ]  [ Generate ] │ ← Generate bar (full width)
│  [●●●●●] face  [●○○○○] hair_front  [○○○○○] hair_back  [○○○○○] body  [○○○○○] eyes │ ← 5-slot progress strip
│  Status: 텍스처 생성 중 (2/5) · 예상 12초 남음                           │ ← Status line (single-line summary)
├─────────────┬──────────────────────────────────┬───────────────────────┤
│  Parts      │          Preview (canvas)        │    Inspector          │
│  ─────────  │                                  │  ─────────────────    │
│  ● face     │                                  │  [Parameters]         │
│  ● hair_fr  │          <<  avatar  >>          │   angle_x     [====]  │
│  ● hair_bk  │          (실 픽셀 렌더)           │   angle_y     [===-]  │
│  ● body     │                                  │   mouth_open  [=---]  │
│  ● eyes     │                                  │   ...                 │
│  (20 more)  │                                  │                       │
│             │                                  │  [Motions]            │
│             │                                  │   idle.default  ▶     │
│             │                                  │   blink.once    ▶     │
│             │                                  │                       │
│             │                                  │  [Expressions]        │
│             │                                  │   smile / surprise    │
└─────────────┴──────────────────────────────────┴───────────────────────┘
```

**치수 가이드** (1440×900 데스크톱 기준, 실 구현은 Flex/Grid):
- Header: 48 px
- Generate bar (3 줄: prompt row / progress strip / status line): 합 108 px (36+36+36)
- 3-column body: 남은 높이 (약 744 px)
  - Left (Parts): 240 px 고정
  - Center (Preview): 남은 width 중앙 (≥ 640 px 보장)
  - Right (Inspector): 360 px 고정
- 1280 px 미만: Inspector 를 드로어로 collapse (기본 닫힘). β 는 Chrome/Safari 1440+ 전제지만 방어.

## 4. Generate 패널 상세

### 4.1 Prompt 필드

- **Element**: `<textarea maxlength="200" rows="1">` (자동 확장, 최대 3 줄).
- **Placeholder (KO)**: `예: 은발 트윈테일, 고스로리 교복, 보라색 눈`
- **Placeholder (EN)**: `e.g., silver twin-tails, gothic lolita uniform, purple eyes`
- **Char counter**: 우하단 소형 `180/200` 표시 (160+ 부터 표시).
- **Empty 상태**: Generate 버튼 disabled.
- **Validation (클라이언트)**: 빈 문자열 / 200자 초과만 차단. 나머지는 server safety filter.

### 4.2 Generate 버튼

- **Label (KO)**: `Generate`
- **Label (EN)**: `Generate`
- **Label — 생성 중**: `생성 중…` / `Generating…` (disabled)
- **Disabled 조건**:
  - Prompt 비어있음
  - Prompt > 200 char
  - 생성 중 (다중 요청 차단)
  - 네트워크 offline (추후 phase, β 는 생략 가능)
- **단축키**: prompt 내 `⌘/Ctrl + Enter` — Generate 트리거.
- **Focus ring**: WCAG 기본 (outline 2px solid accent).

### 4.3 5-슬롯 진행 strip

- **표현**: 5 개 pill 이 inline 으로 나열. 각 pill 은 "슬롯 이름 + 5-dot 진행 바".
- **슬롯 순서**: `face → hair_front → hair_back → body → eyes` (PRODUCT-BETA §4 파츠 순).
- **상태 4 종 × dot 표현**:
  - `pending` — `○○○○○` (회색)
  - `in_progress` — `●○○○○` → `●●○○○` → ... (accent color, 서버 progress event 반영)
  - `success` — `●●●●●` (green)
  - `error` — `✕✕✕✕✕` (red) + 하단 재시도 버튼 노출
- **부분 실패**: 특정 슬롯만 error 이면 해당 pill 만 red. 나머지는 유지.
- **hover**: pill 에 hover 시 tooltip "hair_front: nano-banana 호출 중 · 3.2s 경과".

### 4.4 Status line

- **목적**: 전체 진행의 **1 줄 요약**. 기계적 집계이며 §4.3 strip 의 verbose 버전.
- **4 상태 카피 (KO / EN)**:
  | 상태 | KO | EN |
  |---|---|---|
  | idle | `준비됨 · 프롬프트를 입력하세요` | `Ready · enter a prompt` |
  | analyzing | `프롬프트 분석 중…` | `Analyzing prompt…` |
  | generating | `텍스처 생성 중 (N/5) · 예상 XX초 남음` | `Generating textures (N/5) · ~XXs left` |
  | assembling | `조립 중…` | `Assembling…` |
  | success | `완료 · 프리뷰에서 슬라이더를 움직여보세요` | `Done · move the sliders on the right` |
  | error | `오류 발생 (id: XXXXXXXX) · 재시도 가능` | `Error (id: XXXXXXXX) · retry available` |

- **ETA 계산**: P3 이후 실 벤더 지연 baseline 으로 갱신. β 초기엔 고정 `~25s` 뒤 실 측정 평균으로 치환.

### 4.5 완료 후 Inspector 활성화 순서

`success` 상태 전이 직후 자동으로:

1. Preview 캔버스에 새 텍스처 반영 (frame 1 차 draw).
2. Inspector [Parameters] 탭이 이미 활성이면 유지, 아니면 Parameters 로 전환 (다른 탭에 포커스가 남아있으면 **유지** — 사용자 의도 존중. 초기 상태만 Parameters).
3. Generate bar 의 status line 이 success 카피로 전환 (2 초 후 fade → `idle` 카피 로 복귀 하되, "재생성" 버튼은 계속 노출).
4. Prompt 필드는 **그대로 유지** (재수정 + 재생성 편의). 자동 clear 안 함.

### 4.6 에러 & 재시도

```
┌─ 오류 발생 (id: a3f81c00) ─────────────────────────────────────────────┐
│  hair_front 생성이 실패했습니다.                                        │
│  사유: 벤더 응답이 UV 범위를 벗어남                                      │
│                                                                        │
│  [ 다시 시도 ]   [ 오류 정보 복사 ]                                      │
└────────────────────────────────────────────────────────────────────────┘
```

- **배너 위치**: Generate bar 바로 아래 (§4.4 status line 자리), full-width red 배경.
- **내용 3 요소** (09 §5.3):
  1. **무엇이 실패** — 슬롯 이름 + 한 문장.
  2. **왜** — 분류 카테고리 (safety / vendor / UV / timeout / unknown) 의 한 줄 해설.
  3. **할 수 있는 것** — 최대 2 개 액션 (재시도 / 오류 정보 복사). β 는 "프롬프트 수정" 액션은 명시 안 함 (사용자가 prompt 필드가 살아있어 자연스럽게 가능).
- **오류 ID** — 8-char hex, Grafana trace ID 의 마지막 8 글자. 운영자가 `trace_id=*<id>` 로 조회 가능.
- **전체 실패** (5 슬롯 모두) — 배너 카피를 `생성에 실패했습니다. 네트워크/벤더 상태를 확인하거나 다시 시도하세요.` 로 변경. 재시도 1 개 액션.

## 5. 상태 기계 (Finite State Machine)

```
 idle ──(Generate 클릭)──▶ analyzing
                             │
                             ▼
                         generating (N/5, 0 ≤ N ≤ 5)
                             │
             ┌───────────────┼───────────────┐
             ▼               ▼               ▼
          success         error         (재시도 클릭)
             │               │               │
             │               └──(재시도)──────┘
             │                               ▼
             └──(다시 입력)──▶ idle      analyzing
```

- **허용 전이**: 위 화살표 만. 다른 전이는 UI 버그로 간주 (assert + console.error).
- **병렬 요청 금지**: generating / analyzing / assembling 상태에서 Generate 버튼 disabled.
- **취소**: β 는 취소 버튼 **미구현**. 사용자는 탭 닫기 = 취소. 서버 측 job 은 idempotency key 로 중복 방지.

## 6. 에러 메시지 카피 (KO / EN) — 벤더 실패 카테고리

Foundation 의 `ai-adapter-core` 는 실패 코드를 다음 4 버킷으로 분류한다 ([`docs/05-ai-generation-pipeline.md §7.2`](./05-ai-generation-pipeline.md) 참조). β UI 는 이 4 버킷 + `unknown` 5 종만 한국어/영문 카피로 고정.

| 카테고리 | 트리거 | KO | EN |
|---|---|---|---|
| `safety` | Prompt / 응답이 policy 위반 | `이 프롬프트는 생성할 수 없습니다. 다른 표현으로 시도해 주세요.` | `This prompt cannot be generated. Please try different wording.` |
| `vendor` | 벤더 API 오류 (5xx / timeout / quota) | `생성 서비스가 일시 응답하지 않습니다. 잠시 후 다시 시도해 주세요.` | `The generation service is temporarily unavailable. Please retry shortly.` |
| `uv_constraint` | 응답 이미지가 슬롯 UV 범위 미준수 | `결과가 뼈대와 맞지 않았습니다. 다시 시도해 주세요.` | `The result did not fit the rig. Please retry.` |
| `timeout` | 전체 30 초 초과 | `시간이 너무 오래 걸립니다 (30초 초과). 다시 시도하거나 프롬프트를 간결하게 줄여 주세요.` | `Request timed out after 30s. Retry or shorten the prompt.` |
| `unknown` | 기타 | `알 수 없는 오류입니다 (id: XXXXXXXX). 다시 시도하거나 문제가 계속되면 오류 ID 를 공유해 주세요.` | `Unknown error (id: XXXXXXXX). Retry or report the error id if it persists.` |

- **Error ID 는 항상 포함** — 5 카테고리 모두 `(id: 8char)` 포스트픽스 허용. 위 표는 기본 본문만.
- **한국어 존댓말 유지** — "세요" / "주세요" 통일. 명령형 (하라) 금지.
- **영문 sentence case** — 앞 글자만 대문자, 그 외 lowercase.

## 7. 시나리오 커버리지 검증

[`docs/PRODUCT-BETA.md §2`](./PRODUCT-BETA.md) 3 시나리오에 본 wireframe 이 대응하는지 점검:

| 시나리오 | 커버 요소 | 확인 |
|---|---|---|
| **2.1 Creator (성공 경로)** | prompt → Generate → 5 진행 strip → Preview 반영 → slider 조작 | §3 + §4.1~§4.5 + 기존 Inspector parameters 슬라이더 |
| **2.2 실패 경로 (safety / fallback / terminal)** | safety 배너 / 부분 실패 pill / 전체 실패 카피 | §4.6 + §6 `safety` / `vendor` 카테고리 |
| **2.3 파라미터만** | 생성 없이 Inspector 슬라이더 조작 | Inspector 는 page load 시부터 기본 aria 번들로 활성 (Generate 상태 무관) |

3 시나리오 모두 β UI 안에서 완결 가능.

## 8. 비포함 (β 제외 명시)

- 저장 / History / Share / Export — β 탭 session 만 유효.
- 계정 / 로그인 / 워크스페이스.
- 모바일 / 태블릿 반응형. 1024 px 미만 접근 시 `β 는 데스크톱 Chrome/Safari 에서만 지원합니다.` 안내 페이지.
- Validation Report (08 §8).
- Pose Picker / Record clip / Diff vs Previous (09 §4.3.2~§4.3.3).
- Parts 사이드바의 우클릭 메뉴 / 라이브러리 검색.
- Prompt 의 Style Profile / Reference image / Advanced 설정.
- 키보드 단축키 `⌘S / ⌘R / ⌘Z` (09 §6) — β 는 `⌘/Ctrl + Enter` (Generate) 만.

## 9. 열린 질문 — 사용자 승인 필요

| # | 질문 | 기본 제안 | 대안 |
|---|---|---|---|
| Q1 | 진행 strip 을 5 pill 로 둘지 단일 progress bar 로 둘지 | **5 pill** (부분 실패 가시성) | 단일 bar (공간 절약, 부분 실패 시 별도 배너로 대체) |
| Q2 | Error ID 표시 형식 | **8-char hex** (Grafana trace 의 tail 8) | 16-char full trace / UUID short |
| Q3 | Prompt 200 char limit | **200** (nano-banana 기준) | 500 (자유도↑) / 100 (축소) |
| Q4 | Generate 중 prompt 재수정 허용? | **편집 허용** (값만 유지, 버튼 disabled 유지) | 입력 자체 잠금 |
| Q5 | 완료 후 Inspector 자동 포커스 변경 | **Parameters 탭 활성 (처음에만)** | 사용자 마지막 탭 유지 |
| Q6 | KO/EN 언어 선택 | **브라우저 locale 자동** (폴백 EN) | URL query `?lang=ko` 강제 |

사용자가 위 6 질문에 답하면 P0 는 ✅ 로 close, P1 ADR 0007 Decision 단계로 이동.

## 10. P0 체크리스트 (산출물 완료 기준)

- [x] Generate 패널 위치 결정 (상단 full-width bar)
- [x] Prompt 필드 스펙 (textarea / 200 char / placeholder / validation)
- [x] Generate 버튼 스펙 (label / disabled 조건 / 단축키)
- [x] 진행 상태 표시 5 pill × 4 상태 (pending/in_progress/success/error)
- [x] Status line 1 줄 요약 6 상태 KO/EN 카피
- [x] 에러 배너 3 요소 구조 (무엇/왜/할 수 있는 것) + Error ID
- [x] 5 카테고리 × KO/EN 에러 카피
- [x] 상태 기계 (idle → analyzing → generating → success/error → idle)
- [x] 완료 후 Inspector 활성화 순서
- [x] 모바일 제외 명시 (1024 px 미만 안내)
- [x] 기존 09-user-interface-ux.md §2~§4 와의 diff 표
- [x] PRODUCT-BETA §2 3 시나리오 커버 검증
- [ ] **사용자 Q1~Q6 승인** ← P0 close 전 마지막 게이트

## 11. 다음 단계

1. 사용자 리뷰 → §9 Q1~Q6 에 대한 선택.
2. 선택 반영 후 본 문서 §9 제거 + §10 체크박스 마지막 항목 check.
3. `progress_0420/PLAN.md §2` 의 P0 상태 🟡 → ✅ bump.
4. ADR 0007 Decision 확정 대기 → P1-S1 (`@geny/web-avatar-renderer-pixi` 스캐폴드) 착수.

## 12. 참조

- [`docs/PRODUCT-BETA.md`](./PRODUCT-BETA.md) — β 제품 정의 9 검수 / MVP 포함·제외
- [`docs/ROADMAP-BETA.md §3 Phase P0`](./ROADMAP-BETA.md) — P0 phase 정의
- [`docs/09-user-interface-ux.md`](./09-user-interface-ux.md) — Foundation 전체 UX 스펙 (β 축소 대상)
- [`docs/05-ai-generation-pipeline.md §7.2`](./05-ai-generation-pipeline.md) — 어댑터 실패 카테고리 (§6 5 카테고리 근거)
- [`apps/web-editor/`](../apps/web-editor/) — 기존 3-column 레이아웃 코드
- [`progress_0420/PLAN.md §2`](../progress_0420/PLAN.md) — phase 트래커 (P0 상태 bump 대상)
