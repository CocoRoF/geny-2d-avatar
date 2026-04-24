# 11. 내보내기 & 배포 (Export & Deployment)

> **한 줄 요약**: 만든 아바타를 **사용자가 "실제로 쓰는 곳"** 까지 무마찰로 옮긴다. VTube Studio, Web, Unity, Unreal, 모바일, 이미지 시트. 포맷마다 요구사항이 다르므로 **어댑터 기반**으로 설계한다.

---

## 1. 설계 원칙

1. **Export 는 아바타의 "최종 사용자 경험" 이다.** 사용자가 우리 앱을 떠나도 그 결과로 계속 존재한다.
2. **포맷마다 현실을 고려한다.** Cubism SDK, VTube Studio, Unity 마다 제약과 관례가 다르다.
3. **라이선스와 증명서를 묶어 낸다.** Export 된 파일은 출처·라이선스·버전을 담고 있어야 한다.
4. **대용량도 스트리밍**한다. ZIP 다운로드 외에도 CDN 스트리밍/서명 URL/SDK 직송.
5. **역추적**. Export 된 산출물에서 "어느 아바타·버전" 인지 읽을 수 있어야 한다.

---

## 2. 지원 타겟 매트릭스

| 타겟 | 형식 | 지원 시점 | 비고 |
|---|---|---|---|
| **Live2D Cubism** | `.model3.json`, `.moc3`, `.physics3.json`, `.motion3.json`, `.cdi3.json`, 텍스처 PNG 세트, `.psd`(선택) | MVP | 베이스 |
| **VTube Studio** | Cubism 번들 + VTS 메타 | MVP | 크리에이터 1순위 |
| **Web SDK (`@geny/web-avatar`)** | 자체 런타임 + JSON + 텍스처 atlas | MVP | embed 한 줄 |
| **Unity** | Unity 패키지 + Cubism SDK 호환 | α | 인디 게임 스튜디오 |
| **Unreal** | 플러그인 | β | 2D 기능 집합 검증 필요 |
| **Mobile SDK (iOS/Android)** | Swift / Kotlin 바인딩 | β | VTuber 앱·챗봇 |
| **Spine** | `.skel`, `.atlas`, `.json` | GA | 매핑 손실 허용 |
| **정적 PSD / 이미지 시트** | PSD, PNG sheet, JSON 메타 | MVP | 외주/편집용 |
| **영상 (GIF / MP4 / APNG)** | 선택 포즈/모션 짧은 렌더 | MVP | 미리보기/공유 |

---

## 3. Cubism (핵심)

### 3.1 파일 구성

Cubism 공식 샘플 `mao_pro` 의 `runtime/` 디렉터리 구조를 레퍼런스로 한다.

```
avatar_{id}/
├── avatar.model3.json       # FileReferences, Groups, HitAreas
├── avatar.moc3              # 바이너리 모델
├── avatar.physics3.json     # 진자 기반 물리
├── avatar.pose3.json        # 파츠 mutex 그룹 (arm A/B 같은 대체 포즈)
├── avatar.cdi3.json         # 파라미터/파츠 UI 메타 (그룹, 한국어명)
├── avatar.{2048|4096}/
│   └── texture_00.png       # 단일 atlas (권장)
├── motions/
│   ├── idle_default.motion3.json
│   ├── blink_auto.motion3.json
│   ├── greet_wave.motion3.json
│   └── ...                  # 템플릿 표준 모션 + 사용자 선택분
├── expressions/
│   ├── smile.exp3.json      # Blend: Add / Multiply / Overwrite
│   └── ...
├── provenance.json          # C2PA 출처 증명
├── license.json             # 라이선스·크레딧
└── meta.json                # 아바타 ID, 버전, 템플릿, 생성 시각
```

### 3.2 파라미터 매핑

- 우리 파라미터 `head_angle_x` → Cubism `ParamAngleX` (+ 원본 범위 보존). 전체 매핑표는 [03 §12.1](./03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로).
- 모든 필수 파라미터를 빠짐없이 작성. 기본값/범위/물리 설정 포함.
- CDI3: 파츠 그룹, 파라미터 그룹 설명. UI 언어는 **사용자 로케일** 로 채움 (ko/en/ja).
- `CombinedParameters` 로 2D 조이스틱 쌍을 선언: `(ParamAngleX, ParamAngleY)`, `(ParamAllX, ParamAllY)`.
- `model3.json` 의 `Groups` 에 최소 2개를 작성:
  - `EyeBlink`: `[ParamEyeLOpen, ParamEyeROpen]`
  - `LipSync`: 기본 모드 `[ParamA]` (호환성 최대화), 정밀 모드 `[ParamA, ParamI, ParamU, ParamE, ParamO]`.
- `HitAreas`: 최소 `HitAreaHead`, `HitAreaBody`. 템플릿 메타의 `hit_areas` (03 §12.1) 에서 생성.

### 3.2.1 Pose3 (대체 포즈 그룹)

A/B 포즈가 있는 슬롯(예: `arm_l[variant=A|B]`) 은 `pose3.json` 에 mutex 그룹으로 선언한다. 동시 표시를 방지해 렌더링 충돌을 막는다.

```json
{
  "Type": "Live2D Pose",
  "Groups": [
    [{ "Id": "PartArmLA", "Link": [] }, { "Id": "PartArmLB", "Link": [] }],
    [{ "Id": "PartArmRA", "Link": [] }, { "Id": "PartArmRB", "Link": [] }]
  ]
}
```

### 3.2.2 Expression (exp3) Blend 규약

| Blend | 의미 | 사용 예 |
|---|---|---|
| `Add` | 현재 값에 가산 | 눈웃음, 눈썹 상하 |
| `Multiply` | 현재 값에 곱함 (보통 `EyeOpen` 을 강제로 닫을 때) | 졸린 눈, 찡긋 |
| `Overwrite` | 절대값 대체 | 리셋성 표정 |

템플릿 기본 표정 세트는 **6–8개** (중립/기쁨/슬픔/놀람/화남/졸림/부끄럼 + α). `mao_pro` 가 8개 제공.

### 3.3 모션 번들

- 템플릿의 표준 모션 팩을 기본 포함.
- 사용자가 추가로 고른 공식/커뮤니티 모션 팩 옵션 포함.
- 커스텀 모션은 별도 항목.

### 3.4 텍스처 아틀라스

- 기본 단일 atlas (2048 or 4096). 필요 시 분할.
- **mipmap 생성 여부**: 기본 off (2D에서 필요 없음).
- 알파 프리-멀티플라이 여부: 타겟 SDK에 맞게 (`Cubism` 은 straight alpha 표준).

### 3.5 빌드 경로

- 내부 SDK 어댑터로 결정론적 생성. 외부 Cubism Editor 의존 최소화(호환 테스트용은 사용).
- 유효성: 공식 Cubism Viewer 로 **렌더 성공률 100%**.

### 3.6 VTube Studio 전용 메타

- `vts_meta.json`: 애니메이션 트리거 매핑, 핫키.
- 모델 썸네일 설정.

---

## 4. Web SDK (`@geny/web-avatar`)

### 4.1 설계 목표

- **한 줄 설치**: `<geny-avatar id="av_…"></geny-avatar>` 로 동작.
- **경량**: 초기 JS ≤ 80KB gzip.
- **프레임워크 무관**: Web Components + React/Vue 래퍼.

### 4.2 런타임 요구

- WebGL2 우선, WebGL1 폴백.
- OffscreenCanvas 지원 시 사용.
- requestAnimationFrame 기반 60fps.
- 오디오 → 립싱크(WebAudio AnalyserNode + 경량 모음 추정기).

### 4.3 패키지 구성

```
@geny/web-avatar/
├── package.json
├── dist/
│   ├── geny-avatar.esm.js
│   ├── geny-avatar.umd.js
│   └── types.d.ts
├── react/
│   └── GenyAvatar.tsx
└── docs/
```

### 4.4 API

```html
<geny-avatar
  src="https://cdn.geny.ai/avatars/av_01HXY.../bundle.json"
  autoplay
  idle
  microphone-lipsync
  on-ready="..."
></geny-avatar>
```

```ts
import { GenyAvatar } from "@geny/web-avatar/react";

<GenyAvatar
  src={bundleUrl}
  onReady={() => ...}
  onExpression={(e) => ...}
  microphoneLipsync
/>;
```

### 4.5 번들 포맷

- 우리가 정의한 경량 번들(JSON 메타 + 텍스처) — Cubism `.moc3` 직접 파싱은 라이선스/성능 이슈로 지양.
- 번들은 **우리 런타임 전용**. Cubism 정식 SDK 와 병행 사용 가능.

### 4.6 보안/프라이버시

- 번들은 서명 URL 기반 CDN 배포.
- `iframe` 샌드박스에서 실행 선택지.

---

## 5. Unity

### 5.1 두 가지 옵션

1. **Cubism 경유**: 공식 Cubism SDK for Unity 를 설치한 프로젝트에 우리 번들을 import.
2. **자체 경량 런타임(Unity 네이티브)**: 외부 SDK 의존 없이 동작. 정적 기능 한정.

초기 β 는 1 우선. GA 에서 2 완성.

### 5.2 패키지 구성

```
geny-unity/
├── Runtime/
├── Editor/
├── Samples/
├── package.json
└── Documentation/
```

### 5.3 기능

- 임포트 위저드: 우리 아바타 ID → 자산 다운로드 → Prefab 생성.
- 파라미터 노출: 애니메이터/스크립트에서 접근.
- 립싱크 컴포넌트: 마이크/오디오 소스 입력.

### 5.4 조건

- Unity 2022 LTS 이상.
- URP/Built-in 양쪽 호환.

---

## 6. Unreal

### 6.1 접근

- **Live2D Cubism SDK for Unreal** 가 있으나 2D Live2D 특성상 Unreal 커뮤니티는 얕음.
- β까지 **2D 합성 수준**(Widget/Image) 지원.
- 3D 씬에 carousel 붙이기는 플러그인 타입.

### 6.2 플러그인 구성

- `GenyAvatarUE` 플러그인: 아바타 ID → 자산 자동 import, UMG 위젯.
- 블루프린트 노드: Play, Set Parameter, Set Expression.

---

## 7. Mobile SDK

### 7.1 iOS

- Swift Package, `GenyAvatarKit`.
- Metal 기반 렌더.
- VoIP/WebRTC 연동 예제.

### 7.2 Android

- Gradle 모듈, `geny-avatar-android`.
- OpenGL ES / Vulkan.

### 7.3 기능 주의

- 모바일은 발열·배터리 주의 — fps 30 기본, 성능 자동 조절.

---

## 8. 정적 자산 Export

### 8.1 PSD

- 레이어명 = slot_id.
- 폴더 그룹: face / eyes / hair / body / cloth / accessory.
- 해상도: 2048 또는 4096.
- 포토샵/Clip Studio 에서 수작업 후처리를 가능하게.

### 8.2 이미지 시트

- `sheet.png` + `sheet.json` (좌표/슬롯 매핑).
- 게임 UI/스크린샷 용.

### 8.3 투명 영상

- APNG / WebM (alpha 채널).
- 특정 모션(예: `idle_default`) 을 루프.

---

## 9. 라이선스 & 증명서 (License & Provenance)

### 9.1 `license.json`

```json
{
  "avatar_id": "av_01HXYZ...",
  "template": "tpl.base.v1.halfbody@1.3.2",
  "owner": { "type": "user", "id": "usr_..." },
  "style_profile": "stp_...@3",
  "license_type": "commercial_per_seat",
  "usage_rights": ["vtube_live", "recorded_video", "commercial_product_ui"],
  "restrictions": ["no_resale_of_assets", "no_ai_training_third_party"],
  "created_at": "2026-05-02T12:03:00Z",
  "platform_terms_version": "2026.04",
  "signature": "ed25519:..."
}
```

### 9.2 증명서(Provenance)

- `meta.json` 에 파츠 계보(어떤 벤더/시드/프롬프트) 요약.
- 민감 정보(원본 프롬프트 전문)는 해시만 공개, 원문은 사용자 콘솔에서만 조회.

### 9.3 서명

- 플랫폼 Ed25519 키로 `license.json` 서명.
- Export 수신자는 `license.verify` 엔드포인트로 위조 여부 확인 가능.

---

## 10. Export 플로우 UX

```
 Editor → "Export" 클릭
   │
   ▼
 목적 선택 (VTS / Web / Unity / Unreal / Mobile / 이미지 시트)
   │
   ▼
 옵션 (해상도 / 모션 팩 / 라이선스 종류)
   │
   ▼
 검수 요약 (점수, 이슈) 확인
   │
   ▼
 생성 (서버 측 빌드 job)
   │
   ▼
 결과 (다운로드 + 공유 링크 + 플러그인별 안내)
```

### 10.1 대기 UX

- 작은 번들: 즉시 다운로드 (≤ 30s).
- 큰 번들: 서명 URL + 이메일 알림.

### 10.2 재사용

- 같은 옵션 조합은 캐시. 두 번째 export 는 즉시.

---

## 11. Export 제한 / 거부

- **검수 점수 < 50**: Export 차단, 재생성 유도.
- **라이선스 미정**: 강제 라이선스 선택 팝업.
- **정책 위반**: 내용 정책(성인/초상권) 걸리면 Export 금지.
- **무료 티어 한도 초과**: 안내 + 업그레이드.

---

## 12. CDN & 스트리밍

- 모든 번들은 CDN 에지에 분산.
- 서명 URL 기본 만료 24h (공유 설정별 조정).
- 범위 요청(Range) 지원 — 웹에서 점진 로드.

---

## 13. 보안 & 위변조 방지

- 번들 ZIP 에 서명 포함.
- 런타임 SDK 가 서명 검증 후 로드 (엄격 모드).
- "서명 없음" 번들은 경고 후 실행(호환성 여유).

---

## 14. 버전·호환 관리

- Export 된 번들은 **SDK 호환성 행렬** 을 담고 있어 SDK 가 "이 번들은 최소 web-sdk 0.5 필요" 식으로 감지.
- 하위 호환 깨짐은 major 버전으로.

---

## 15. Export API

```
POST /api/v1/export
{
  "avatar_id": "av_...",
  "target": "vtube_studio",
  "options": {
    "resolution": 2048,
    "include_motions": ["idle.default","blink.auto"],
    "include_expressions": ["smile","surprise"],
    "license_type": "commercial_per_seat"
  }
}

→ 202 Accepted
{ "export_job_id": "exp_01H..." }

GET /api/v1/export/exp_01H...
→ { "status": "ready", "bundle_url": "...", "expires_at": "..." }
```

---

## 16. 측정

- Export 성공률.
- Export 까지 걸린 시간.
- 타겟별 다운로드 수 (크리에이터 시장 파악).
- 버전별 런타임 채택률.

---

## 17. 열린 질문

- Cubism 공식 SDK 라이선스(상용) 정책 변경 대응. 자체 경량 런타임 우선도 강화 고려.
- Unreal 2D 지원 범위: VTuber 시장에서 실수요가 충분한지.
- 모바일 런타임 SDK 를 오픈소스로 공개할지.

---

**다음 문서 →** [12. 데이터 스키마 & API](./12-data-schema-and-api.md)
