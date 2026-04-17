# 09. 사용자 인터페이스 & UX (UI / UX)

> **한 줄 요약**: 사용자는 "복잡한 파이프라인" 을 볼 필요가 없다. 본질은 **"내 캐릭터를 만든다 → 움직이게 한다 → 내보낸다"** 세 단계의 체험. UI는 이 체험을 마찰 없이 연결한다.

---

## 1. UX 원칙 (UX Principles)

1. **첫 30초 안에 "될 것 같다" 는 확신**을 준다. 마법 같은 순간(Aha!) 을 홈에서 만든다.
2. **항상 방향을 본다**. 각 화면에서 "지금 어디고, 다음에 뭘 하나" 가 보인다.
3. **실패는 구체적으로, 성공은 담백하게**. 실패는 이유+해결책, 성공은 과장하지 않는다.
4. **기다림을 숨기지 않는다**. 긴 작업은 진행상황을 보여주고, 이탈해도 복귀할 수 있다.
5. **고급은 접고, 기본은 펼친다**. 초보자의 기본값이 이미 "쓸 만한 결과" 여야 한다.
6. **움직이는 프리뷰가 곧 진실**. 정적 썸네일보다 움직임 1회를 먼저 보여준다.
7. **뒤로 갈 권리**. 모든 결정은 취소/이전 버전 복귀가 가능.

---

## 2. 정보 구조 (IA)

```
 [Home]
  ├─ Start New Avatar
  │    ├─ Quick Start (템플릿 기반)
  │    ├─ From Illustration (원본 이미지)
  │    └─ From Preset (스튜디오 프리셋)
  ├─ My Avatars
  │    └─ Avatar Detail
  │         ├─ Editor
  │         ├─ Validation Report
  │         └─ Export
  ├─ Library
  │    ├─ Templates
  │    ├─ Style Profiles
  │    ├─ Parts (saved)
  │    └─ Motion Packs
  ├─ Workspace (org 사용자)
  │    └─ Member / Roles / Billing
  └─ Community & Marketplace (GA)
```

---

## 3. 핵심 사용 여정 (Core User Journeys)

### 3.1 신규 VTuber 크리에이터 — "첫 아바타"

```
 Step 1. [Home] → "Start New Avatar"
 Step 2. [Onboarding Wizard]
           - Use Case: "VTubing"
           - Body Type: "Half Body"
           - Style Mood: (3장 택1)
 Step 3. [Reference Upload] — 내 일러스트 1장 업로드
 Step 4. [Auto-Suggest] — 시스템이 추천 템플릿+스타일 프로파일을 제안
 Step 5. [Generate] — "Create My Avatar" 클릭
 Step 6. [Live Progress] — 5–10분간 파츠 생성 진행바, 썸네일 점진 노출
 Step 7. [Preview] — 프리뷰 플레이어에서 blink/mouth/angle 자동 재생
 Step 8. [Inspect] — Validation Report, 자동 통과 or 리뷰 권장
 Step 9. [Tweak] — 사이드바 파츠별로 "다시 그리기"
 Step 10. [Export] — "Download for VTube Studio"
```

### 3.2 스튜디오 — "60명 배치 생성"

- **Project** 생성 → **Style Profile Lock** 설정 → CSV 업로드 (캐릭터별 프롬프트) → 배치 큐 → 결과 대시보드.
- 조직 승인 워크플로우 (QA 리드 승인 후 공개).

### 3.3 IP 운영자 — "원작 스타일 기반 신캐릭터"

- 원작 캐릭터 여러 컷 업로드 → 스타일 임베딩 생성 → "스타일 락" 활성화 → 베이스 리그 선택 → 파츠별 프롬프트.

### 3.4 챗봇 운영자 — "템플릿 + 로고만"

- 카탈로그에서 **Pre-rigged Avatar** 선택 → 컬러/로고 교체 → **Embed Code** 복사.

---

## 4. 주요 화면(Screens)

### 4.1 Home

- Hero: "내 캐릭터, 30분 만에 움직이게."
- 3 버튼: **New Avatar / From Illustration / From Preset**.
- 최근 프로젝트.
- 학습 리소스 / 공지.

### 4.2 Onboarding Wizard

- 1) Use case
- 2) Body type (Half/Full/Chibi/Feline)
- 3) Mood grid (시각적, 9 샘플)
- 4) (선택) 레퍼런스 업로드
- 5) 요약 + **Start** 버튼

각 단계 뒤로/건너뛰기 가능. 기본값이 있어 3초면 완주 가능.

### 4.3 Editor (핵심 화면)

```
┌──────────────────────────────────────────────────────────────┐
│  TopBar: [Avatar Name]   [Save]  [History]  [Share]  [Export]│
├─────────────┬───────────────────────────────┬────────────────┤
│ Left: Parts │    Center: Preview Player     │ Right: Inspector│
│  - Face     │                               │  - Prompt       │
│  - Eyes     │  [▶ Preview]  [Pose Picker]   │  - Style Profile│
│  - Mouth    │                               │  - Reference    │
│  - Brows    │   (Live2D/Web Renderer)       │  - Advanced     │
│  - Hair     │                               │                 │
│  - Body     │   Controls:                   │  Actions:       │
│  - Cloth    │   [Angle X/Y/Z] [Blink]       │  [Regenerate]   │
│  - Accessory│   [Mouth] [Vowel] [Idle]      │  [Diff vs Prev] │
│             │                               │  [Revert]       │
├─────────────┴───────────────────────────────┴────────────────┤
│  Bottom: Validation Report (collapsed/expanded)              │
└──────────────────────────────────────────────────────────────┘
```

#### 4.3.1 Parts 사이드바

- 카테고리별 그룹(Face / Eye / Hair / Body / Cloth / Accessory).
- 각 슬롯의 **썸네일 + 상태 배지**(pending / ok / warning / stale).
- 우클릭/롱프레스: "다시 그리기 / 라이브러리에서 찾기 / 저장 / 삭제".

#### 4.3.2 Preview Player

- 기본 루프(idle + blink + subtle lipsync).
- **Pose Picker**: neutral / blink / smile / angle-l / angle-r / mouth-open / custom sliders.
- Custom sliders: 파라미터 직접 조작.
- 드래그로 고개 회전 인터랙션.
- "Record 3s clip" 으로 미리보기 공유용 짧은 GIF/MP4 추출.

#### 4.3.3 Inspector (우측)

- 선택한 파츠의 **Prompt**, **Style Profile**, **Reference**.
- **Advanced** 접힘 패널: 시드, 벤더, 후처리 토글, 앵커 수동 편집.
- 각 파츠에 **Diff vs Previous** 비교 (A/B 슬라이더).

### 4.4 Validation Report 화면

[08](./08-validation-and-rendering.md) §8 참조. 카드 형태로 최상위에 점수/카테고리, 아래에 이슈 목록, 각 이슈에 권장 액션.

### 4.5 Export

- 목적 선택 (VTube Studio / Web SDK / Unity / Unreal / 이미지 시트 / PSD).
- 포맷별 옵션: 해상도, 모션 팩 포함 여부, 파츠 원본 포함.
- 사용 목적 약관(+ 라이선스 태그) 확인.
- 결과: 다운로드 / 공유 링크 / API 토큰.

### 4.6 Library

- **Templates**: 공식/내 스튜디오/커뮤니티 탭.
- **Style Profiles**: 저장 + 태그 + 공유.
- **Parts**: 저장된 파츠 (라이브러리). 드래그로 에디터에 편입.
- **Motion Packs**: 공식 + 업로드.

### 4.7 Workspace

- 멤버/역할(Viewer/Editor/Reviewer/Admin).
- 빌링/쿼터 (AI 호출, export 수).
- 감사 로그.

---

## 5. 진행상황 UX (Progress UX)

### 5.1 긴 작업의 3 요소

1. **예상 시간** ("약 5분 남음") — 보수적으로.
2. **현재 무엇을 하는가** ("앞머리를 다시 그리는 중").
3. **점진적 결과** — 파츠가 완성되는 대로 썸네일로 점진 공개.

### 5.2 이탈/복귀

- 닫고 나가도 **서버 측에서 계속 진행**.
- 복귀 시 동일 화면에 이어서 표시.
- 푸시/이메일 알림 옵트인.

### 5.3 실패 메시지 템플릿

- **무엇이 실패했는가** (파츠 수준).
- **왜 그런가** (1문장, 기술 용어 최소화).
- **무엇을 할 수 있나** (3가지 이하 액션).

예:
> 앞머리 재생성에서 경계가 얼굴을 살짝 가리는 문제가 있었어요.
> - 다시 시도 (다른 시드)
> - 프롬프트를 간결하게 줄이기
> - 내가 직접 앵커 맞추기

---

## 6. 마이크로 인터랙션 기준

- 버튼 눌림 120–180ms 안에 시각 반응.
- 생성 시작 후 0.5s 내 첫 상태 전이 표시.
- 에러 토스트는 **액션 가능한 것** 에만(그냥 알림은 조용한 배지).
- 키보드: 저장 `⌘S`, 검수 `⌘V`, 재생성 `⌘R`, 실행 취소 `⌘Z`.

---

## 7. 반응형 & 디바이스

- 주력: 데스크탑 브라우저 (1440+).
- 태블릿: 에디터 축소형 지원(프리뷰+사이드바 드로어).
- 모바일: 보기/공유/구매만. 생성은 "데스크탑에서 열기" 유도.
- 네이티브 앱: β 이후 검토.

---

## 8. 접근성 (Accessibility)

- 전 기능 키보드 조작 가능.
- 색 대비 WCAG AA 이상.
- 프리뷰 플레이어에 **대체 설명**(우리는 이미지를 생성하니 a11y 설명은 메타에서 자동 생성).
- 사진 민감증(photosensitive) 모드: 깜빡임/움직임 감소.

---

## 9. 콘텐츠 정책 UX

- 업로드·프롬프트가 정책에 걸리면 **삭제 전에** 경고 → 수정 기회.
- 어린이 캐릭터 관련 민감 주제는 **명확한 가이드 링크**.
- 커뮤니티 공유 시 **라이선스 선택 다이얼로그** (모든 것이 "공개" 가 아니다).

---

## 10. 협업 & 공유

### 10.1 협업

- 프로젝트 멤버 초대, 역할.
- 동시 편집: 시작은 **락 기반**(한 번에 1명 편집, 다른 사람은 보기).
- 코멘트: 파츠별 / 포즈별 댓글.

### 10.2 공유

- 퍼블릭 링크(짧은 URL): 프리뷰+썸네일만.
- 뷰어 전용 공유(토큰), 만료 기한.
- 스튜디오 리뷰 워크플로우: "승인/반려/주석".

---

## 11. 국제화(i18n) / 현지화(l10n)

- 문자열은 key 기반, 초기 지원: KO, EN, JA.
- 프롬프트 입력은 다언어 그대로. 내부 파이프라인은 영어로 정규화(번역 레이어).
- 날짜/수량/통화 현지화.

---

## 12. 브랜드 & 디자인 시스템 (간단 가이드)

- 톤: "빠르고, 친절하고, 어른스러운". 귀여운 과장 배제.
- 컬러: 중립 배경 + 액센트 1색. 아바타 썸네일이 주인공이 되도록.
- 타이포: 가독성 ≥ 멋. 시스템 폰트 + 한글 최적.
- 아이콘: 2px 라인, rounded.
- 컴포넌트: shadcn/radix 기반 커스텀 디자인 토큰.

---

## 13. 온보딩 디테일

- 처음 30초 체크리스트:
  1. 샘플 아바타 재생 (자동 재생).
  2. "내가 시작하기" 버튼 1클릭 온보딩.
  3. 1분 내 템플릿 선택 완료 → 생성 예약.
- 빈 상태(Empty states): 교육적 + 즉시 행동 유발.

---

## 14. 에러 & 예외 UI 케이스

- 네트워크 끊김: "오프라인, 편집은 로컬 저장" 자동.
- 서버 과부하: 우선순위 낮은 작업 대기 알림.
- 쿼터 초과: 명확히 "내가 쓴 양 / 한도" 바 + 업그레이드 경로.
- 정책 거부: 이유 카테고리 + 가이드 링크 + 지원 요청 버튼.

---

## 15. 관찰성 (Product Analytics)

| 지표 | 측정 이유 |
|---|---|
| TTFV (Time-To-First-Value) | 첫 프리뷰 재생까지 시간 |
| TTFE (Time-To-First-Export) | 첫 완주 체험 |
| 파츠별 재생성 횟수 p50/p90 | 에디터 UX 품질 |
| 이탈 구간 분포 | 온보딩 개선 포인트 |
| Support 티켓 per 1k 유저 | 총 UX 건강 |

---

## 16. 디자인 산출물

- Figma: `design/geny-2d-avatar/*`.
- 컴포넌트 스펙: 토큰/상태/접근성 주석 포함.
- 프로토타입: 핵심 여정 3개 클릭스루.
- 사용자 테스트 스크립트 + 녹화 저장소.

---

## 17. 사용자 테스트 (User Research)

- 알파: 5명 모더레이티드 + 15명 언모더레이티드.
- 베타: 50명 이상, 세그먼트별.
- 지표: TTFE, NPS, 이슈 상위 10.

---

## 18. 열린 질문

- 프리뷰 플레이어에 **마이크 립싱크** 체험을 기본 탑재할지(데모 효과 vs 권한/브라우저 호환).
- 커뮤니티/마켓플레이스 편입 시기와 노출 위치 (홈 vs 별도 탭).
- 모바일 네이티브 앱이 필요한지 (모션 입력 활용).

---

**다음 문서 →** [10. 커스터마이징 워크플로우](./10-customization-workflow.md)
