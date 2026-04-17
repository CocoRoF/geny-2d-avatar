# 05. AI 생성 파이프라인 (AI Generation Pipeline)

> **한 줄 요약**: AI는 **"자유로운 예술가"** 가 아니라 **"제약된 파츠 재설계 계약자"** 다. 이 문서는 nano-banana(Gemini 2.5 Flash Image) 등 외부 이미지 모델을 어떻게 우리 파이프라인에 가둬놓고 써먹는지를 정의한다.

---

## 1. 설계 원칙 (Design Principles)

1. **AI는 "슬롯 채우기" 만 한다.** 전체 캐릭터를 그리지 않는다. 한 번에 하나의 슬롯만 요청한다.
2. **AI는 "레퍼런스를 따르는 작업자"** 다. 프롬프트뿐 아니라 **레퍼런스 이미지 + 마스크 + 스타일 토큰**을 같이 받아야 품질이 나온다.
3. **벤더는 교체 가능하다.** 같은 슬롯을 nano-banana, SDXL, 자체 모델 중 어디로 호출하든 결과 스키마가 같다.
4. **시드와 파라미터를 보존한다.** 완벽한 재현은 불가능해도 "거의 같은 결과" 는 재현 가능하도록 모든 호출 파라미터를 기록.
5. **비용과 품질을 라우팅한다.** 파츠·사용자 등급·긴급도에 따라 "저비용 모델 → 고비용 모델" 계단 호출.
6. **실패는 당연하다.** 재시도, 부분 성공, 대체 벤더 페일오버를 기본 동작으로 설계.

---

## 2. 사용 AI 모델의 분류 (Model Taxonomy)

### 2.1 역할별 모델

| 역할 | 예시 모델 | 왜 쓰는가 |
|---|---|---|
| **Image-Edit (파츠 재설계 핵심)** | Google nano-banana / Gemini 2.5 Flash Image, SDXL+ControlNet, Seedream, Flux-Fill | 기존 레퍼런스 파츠 + 마스크 + 프롬프트 → 수정된 파츠 |
| **Style-Transfer / Reference** | IP-Adapter, FaceID, nano-banana (레퍼런스 일관성), 자체 파인튜닝 LoRA | 한 캐릭터의 정체성/스타일 유지 |
| **Segmentation / Mask** | SAM2, BiRefNet | 원본 일러스트에서 파츠 영역 자동 분리 |
| **Keypoint / Landmark** | 얼굴/신체 키포인트 모델 (오픈 소스) | 눈/입/코 기준점, 앵커 자동 탐지 |
| **Line-Art / Tone** | ControlNet-Canny/Lineart, 자체 후처리 | 선화 보존/통일 |
| **Upscaling** | Real-ESRGAN 계열 | 저해상도 → 2048/4096 |
| **Embedding (Style)** | CLIP, 커스텀 인코더 | 스타일 프로파일 생성, 검색, 검증 |

### 2.2 어댑터(Adapter) 인터페이스

모든 모델은 동일한 어댑터 인터페이스 뒤에 숨는다.

```python
class AIAdapter(Protocol):
    capability: set[Capability]  # {EDIT, STYLE_REF, MASK, SEG, KP, ...}
    name: str
    version: str
    cost_per_call_usd: float

    async def generate(
        self,
        task: GenerationTask,
    ) -> GenerationResult: ...

class GenerationTask(BaseModel):
    slot_id: str
    reference_image: Image | None
    mask: Image | None
    style_reference: list[Image]        # IP-Adapter 류
    prompt: str                         # 구성은 PromptBuilder 책임
    negative_prompt: str
    size: tuple[int, int]
    seed: int | None
    guidance_scale: float | None
    strength: float | None              # img2img / inpaint 강도
    deadline_ms: int                    # 타임아웃
    budget_usd: float                   # 이 호출에 허용된 최대 비용
    idempotency_key: str

class GenerationResult(BaseModel):
    image: Image
    alpha: Image | None
    logs: list[str]
    provider_metadata: dict             # vendor-specific
    cost_usd: float
    latency_ms: int
```

### 2.3 벤더 전략: "3개 이상, 언제든 교체"

초기 프로덕션 기본 조합:

- **Primary (파츠 재설계)**: nano-banana (레퍼런스·마스크·프롬프트 지원, 저렴, 빠름).
- **Fallback 1**: SDXL-Inpaint + ControlNet (로컬/자체 호스팅 가능, 확장성).
- **Fallback 2**: Flux-Fill 계열 (품질 보험).
- **Segmentation**: SAM2.
- **Keypoint**: 자체 학습 경량 모델 + MediaPipe.

> **⚠ 주의**: 위 모델 이름/버전은 시장 변동성이 크다. 어댑터 추상화 덕분에 **6개월 내 전부 교체 가능** 하도록 설계한다.

---

## 3. nano-banana 통합 상세 (Primary Adapter)

### 3.1 왜 nano-banana 인가

- 레퍼런스 이미지 + 텍스트 지시의 **정합성이 높다**.
- **저렴하고 빠름** — 파츠 단위 반복 호출에 경제적.
- **여러 입력 이미지 믹싱** 이 가능 — 스타일 일관성 유지에 유리.

### 3.2 호출 경로 (High-Level)

```
 PartGenRequest ──▶ PromptBuilder ──▶ AdapterRouter
                                          │
                                          ▼
                                  NanoBananaAdapter
                                          │
                                          ▼
                        (HTTP) Gemini 2.5 Flash Image API
                                          │
                                          ▼
                                  GenerationResult
                                          │
                                          ▼
                                PartPostProcessor (→ 06)
```

### 3.3 요청 본문 매핑

```yaml
task.slot_id: "hair_front"
task.reference_image: parts/hair_front.default.png  # 레퍼런스 (있으면)
task.mask: hair_front_mask.png                       # AI가 덮어 써도 되는 영역
task.style_reference:
  - avatar/{id}/style/ref_face_crop.png
  - avatar/{id}/style/palette.png
task.prompt:
  <built by PromptBuilder, see §5>
task.negative_prompt: "face, skin, background, text, watermark"
task.size: [2048, 2048]  # 캔버스 기준
task.seed: {deterministic from idempotency_key}
```

### 3.4 응답 처리

- 응답 이미지가 `uv_box_px` 안에 들어오는지 검증. 벗어나면 **자동 크롭** 또는 **재시도**.
- 알파 채널 없는 경우: SAM2 로 마스크 추출 → 알파 복원.
- 응답 안전 필터(프로바이더 측) 거부 시: 프롬프트 수정 or 다른 벤더로 폴백.

### 3.5 비용/쿼터 관리

- 조직(org) 단위 월 호출 한도 → 이 선을 초과하면 **저비용 경로**(SDXL 로컬) 로 자동 전환.
- 스파이크 대응: 대기열에 **우선순위 버킷**(유료 > 무료).
- 장애 대응: 2분 슬라이딩 윈도우에서 5xx 비율 > 15% 면 프로바이더 가중치 감소.

---

## 4. 슬롯별 생성 전략 (Per-Slot Generation Strategy)

각 슬롯은 고유한 난이도와 트릭이 있다. 아래는 주요 슬롯의 기본 전략.

### 4.1 face_base (최고 난이도)

- **절대 원칙**: 얼굴은 **"전체 재생성" 을 피한다**. 원본 일러스트가 있으면 보존이 우선.
- 입력:
  - 원본 일러스트 얼굴 크롭
  - 마스크: 헤어/배경 제외한 얼굴 영역
  - 스타일 레퍼런스: 사용자가 선택한 "톤 라이브러리" 에서 1–2장
- 프롬프트: 피부/선/명암만 지시. 이목구비 위치는 건드리지 않음.
- 실패 모드: 눈/코/입이 미묘하게 이동 → 앵커 보정 실패 → **인간 리뷰 필수**.
- 정책: `max_iter=3`, 이 이상이면 인간 리뷰로 에스컬레이션.

### 4.2 eye_iris_l/r (홍채)

- 분리 생성 후 **좌우 대칭 강제** (`symmetry:true` 기본).
- 색상 프롬프트 파싱: "heterochromia" 키워드 탐지 시만 비대칭 허용.
- 출력 후 검증: 색 통계 차이 ≤ ΔE 5.

### 4.3 hair_front / hair_side_* / hair_back

- 함께 같은 벤더·같은 스타일 레퍼런스로 **배치 호출**. 톤 일관성.
- `hair_back` 은 약간 채도/명도 낮게 — 깊이감 보정은 후처리에서.
- 물리 스윙 가능성을 고려해 가장자리를 **반투명 페더** 로.

### 4.4 cloth_main

- 가장 자유도가 높고 자동화가 잘 먹는 영역.
- 프롬프트에 "line_weight", "fabric_type", "color_palette" 토큰 활용.
- 옷자락 디테일이 어깨/팔 파츠와 맞지 않으면 **cross-part consistency 재생성**.

### 4.5 accessory_*

- 기본은 "없음". 사용자가 명시적으로 요청할 때만 생성.
- 작은 파츠일수록 해상도·선 굵기가 본체와 어긋나기 쉬움 → 후처리 가중치 ↑.

### 4.6 mouth_base / mouth_inner

- 자동 생성은 **기본 닫힌 입 + 약간의 열린 입 변형** 세트.
- `mouth_inner` (치아/구강) 는 거의 단색 톤. 프롬프트 최소화.
- 립싱크 다섯 모음은 변형 디포머가 만들어냄 — AI 가 모음별 이미지를 안 만든다.

---

## 5. 프롬프트 빌더 (Prompt Builder)

### 5.1 구조

프롬프트는 **계층적**으로 조립된다.

```
 [GLOBAL STYLE]   ← 스타일 프로파일 (캐릭터 전체 일관성)
     ↓
 [TEMPLATE HINT]  ← 베이스 리그의 "인상" (chibi/halfbody/feline...)
     ↓
 [SLOT SPEC]      ← 이 슬롯의 prompt_scope 화이트리스트
     ↓
 [USER INPUT]     ← 사용자가 이 슬롯에 준 텍스트
     ↓
 [NEGATIVE]       ← 슬롯 negative + 공통 negative
```

### 5.2 글로벌 스타일 (Style Profile)

스타일 프로파일은 사용자가 "내 캐릭터의 룩북" 을 정의하는 구조.

```json
{
  "profile_id": "stp_01HXYZ...",
  "name": "Soft Pastel Shoujo",
  "tokens": {
    "linework": "clean thin line",
    "shading": "cel shading with soft highlights",
    "palette": ["#f7d8e0", "#d6b8ff", "#bfe6ff"],
    "tone_contrast": "low-mid",
    "era_hint": "2000s shoujo manga"
  },
  "style_reference_images": ["img_01...", "img_02..."],
  "embedding": [0.012, -0.33, ...]   // CLIP 임베딩
}
```

이 프로파일은 **모든 파츠 생성에 주입**된다. 프로파일이 바뀌면 전체 아바타 재생성이 권고됨.

### 5.3 사용자 입력의 "안전한 범위"

슬롯의 `prompt_scope` 밖의 입력은 무시된다.

예) `hair_front.spec.json` 의 `prompt_scope = ["hair_style", "hair_color", "bangs_shape"]`.
사용자가 "I want blue eyes" 라고 입력해도 이 슬롯 프롬프트에는 반영되지 않는다 (다른 슬롯 `eye_iris_*` 의 입력으로 라우팅).

### 5.4 네거티브 프롬프트 전략

- 공통: `watermark`, `text`, `logo`, `low quality`, `jpeg artifact`, `extra limbs`, `3d`, `photo`.
- 슬롯별: 슬롯이 절대 포함하지 않아야 할 카테고리 (예: `hair_front` 의 `face, eyes, background`).
- 사용자 정의 네거티브: 안전 키워드 필터를 통과해야 허용.

### 5.5 프롬프트 일관성 검사

- 같은 아바타의 슬롯들 프롬프트 hash 집합을 임베딩 공간에서 클러스터링.
- 이상치(슬롯 프롬프트 톤이 크게 다른 것) 발견 시 경고.

---

## 6. 일관성 전략 (Cross-Part Consistency)

### 6.1 3층 방어선

1. **입력 계층**: 모든 파츠에 같은 `style_profile + style_reference_images` 주입.
2. **생성 계층**: 벤더의 레퍼런스 일관성 기능(IP-Adapter/FaceID/nano-banana 레퍼런스) 활용.
3. **후처리 계층**: [06](./06-post-processing-pipeline.md) 이 마지막으로 색/선/광원 통일.

### 6.2 스타일 임베딩 검증

모든 파츠 결과의 CLIP 임베딩을 스타일 프로파일 임베딩과 비교:
- 거리 > 임계값 → 재생성.
- 임계값은 슬롯별로 다름 (예: `cloth_main` 은 허용 폭이 넓고, `face_base` 는 좁음).

### 6.3 팔레트 락(Palette Lock)

- 사용자가 지정한 팔레트 (최대 12 색) 가 있으면, 생성 결과의 지배색이 팔레트의 ΔE 10 이내에 들어오도록 검사.
- 벗어나면 후처리에서 히스토그램 매칭 + 재검사.

---

## 7. 파이프라인 실행 세부 (Execution)

### 7.1 파츠 생성 노드(`ai_redesign_*`)의 실행

```
INPUT: slot_id, avatar_id, user_prompt, style_profile_id, ref_mask, context
  │
  ├─ 1. Load spec (04)
  ├─ 2. Resolve style_profile (avatars/{id}/style.json)
  ├─ 3. Build prompt (see §5)
  ├─ 4. Choose adapter (§8 Routing)
  ├─ 5. Call adapter.generate(task)
  │      - timeout = spec.timeout
  │      - seed = deterministic(idempotency_key)
  ├─ 6. Validate raw output
  │      - shape, alpha, uv_box, safety
  │      - on fail: retry up to spec.max_iter, then fallback adapter
  ├─ 7. Emit GenerationResult + cost/latency
  └─ 8. Hand off to post-processor
```

### 7.2 동시성 & 배치

- 한 아바타의 파츠들은 **가능한 한 병렬**로 호출.
- 단, 얼굴 계열(`face_base`, `eye_*`, `mouth_*`, `brow_*`)은 **face_base 선행 완료 후** 병렬로 나머지.
- 머리 계열(`hair_*`)은 서로 참조 이미지를 공유 → 동일 요청 내에서 **배치 API** 사용 (지원 벤더에 한해).

### 7.3 타임아웃/재시도

- 슬롯별 타임아웃: face = 90s, hair = 60s, cloth = 60s, accessory = 45s.
- 재시도는 **같은 프롬프트 + 다른 시드** 가 1회차, **프롬프트 축약** 이 2회차, **다른 벤더** 가 3회차.

---

## 8. 어댑터 라우팅 (Adapter Routing)

### 8.1 라우팅 변수

- 사용자 등급 (무료/유료/프로/엔터프라이즈)
- 요청 긴급도 (interactive / batch)
- 슬롯 난이도 (face > eye > hair > cloth > accessory)
- 예산 잔고 (org/user 월 한도 대비 잔여)
- 벤더 헬스 (최근 N분 성공률/지연)

### 8.2 라우팅 정책 예

| 조건 | 1차 | 2차(재시도 시) | 3차 |
|---|---|---|---|
| 유료 + interactive + face | nano-banana | SDXL+IP-Adapter | Flux-Fill |
| 유료 + batch + cloth | SDXL+CN (비용) | nano-banana | - |
| 무료 + interactive | 저속/저비용 경로 우선 | nano-banana (쿼터 내) | 실패 시 재시도 지연 |
| 엔터프라이즈 | 전용 쿼터 우선 | - | - |

### 8.3 자동 건강도 감시

- 벤더별 `health_score = f(success_rate, p95_latency, cost_variance)`.
- 점수가 임계 이하로 10분 지속 → 라우터 가중치 감소.

---

## 9. 안전(Safety) & 콘텐츠 정책

### 9.1 업로드 레퍼런스 검증

- 업로드된 레퍼런스 이미지에 대해 **NSFW 필터 + 초상권 탐지** 를 실행. 위반 시 업로드 거부.
- 공인(유명인) 얼굴 유사도가 높으면 **동의 확인** 스텝.

### 9.2 생성 결과 검증

- 최종 파츠 세트에 대해 NSFW 재검사.
- 미성년 캐릭터 표현은 콘텐츠 정책 `content_policy.json` 으로 관리 (금지/허용 기준).

### 9.3 프롬프트 샌드박스

- 사용자 자유 텍스트에서 금칙어/우회 표현 패턴을 탐지.
- 탐지 시 프롬프트를 **서버가 재작성** 하거나 거부.

### 9.4 로그와 감사

- 생성 호출의 입력(프롬프트/레퍼런스 해시)과 출력(해시)은 감사 로그에 암호화 보관.
- 신고(DMCA/악용) 시 해당 아바타의 파츠 계보를 추적 가능하도록 설계.

---

## 10. 비용 최적화 (Cost)

### 10.1 캐시 전략

- 캐시 키: `hash(adapter, model_version, prompt_hash, ref_hash, seed, size)`
- 사용자가 "같은 파츠를 한 번 더" 눌러도 즉시 응답 (비용 0).
- 스타일 프로파일이 바뀌면 키가 바뀌어 캐시 미스.

### 10.2 계단식 호출 (Cascade)

저비용 모델로 초안 → 점수 미달 시만 고비용 모델로.

```
 초안(SDXL local) → score≥75 ? 통과 : nano-banana → score≥75 ? 통과 : human_review
```

### 10.3 해상도 계단

- 초안은 1024 → 통과 시만 4096 업스케일.
- 사용자가 "PRO 품질" 을 명시적으로 선택해야 바로 고해상도.

### 10.4 프롬프트 단축

- 토큰 수와 비용은 비례. 스타일 프로파일을 **해시 ID** 로 벤더에 전달(지원 시) → 긴 지시문 반복 방지.

---

## 11. 측정(Measurement)

| 지표 | 정의 | 목표 |
|---|---|---|
| 파츠당 평균 성공률 | 한 슬롯의 1차 호출에서 검수 통과 | ≥ 65% (얼굴 제외 75%) |
| 재시도 횟수 p50 / p90 | 슬롯 당 | ≤ 1 / ≤ 2 |
| 파츠당 평균 비용 | USD | ≤ $0.03 |
| 아바타당 총 비용 | 27 슬롯 가정 | ≤ $0.60 |
| 벤더 폴백 비율 | 1차 벤더 실패 후 다른 벤더 | ≤ 8% |
| 인간 리뷰 개입률 | 자동 통과 실패율 | ≤ 20% (β), ≤ 10% (GA) |

---

## 12. 어댑터 추가 가이드 (How to Add a Provider)

1. `capability` 선언 (어떤 Task 를 처리할 수 있는지).
2. `generate()` 구현: 우리 Task → 벤더 요청 → 벤더 응답 → 우리 Result.
3. 벤더 에러 코드 → 우리 에러 클래스 매핑.
4. 비용 추정 함수 (`estimate_cost(task)`) 구현.
5. 헬스체크 (`probe()`).
6. 어댑터 카탈로그 (`adapters.yaml`) 에 등록 + 기본 라우팅 가중치.
7. **골든셋 50개 파츠** 로 회귀 검증 후 합류.

---

## 13. 어댑터 테스트 (Testing)

### 13.1 오프라인 테스트

- 모든 어댑터는 `capability_matrix_test.py` 를 통과해야 한다.
- 동일 입력에 대해 최소 통과 기준 (alpha 존재, bbox 포함, latency 상한).

### 13.2 온라인 shadow

- 새 어댑터 후보는 프로덕션 트래픽의 1% 에 병행 호출, 결과만 로그(사용자 미노출).
- 2주간 비교 지표가 기준 통과 시 정식 라우팅 편입.

---

## 14. 프롬프트/스타일 개발 워크플로우 (for Prompt Engineers)

1. 스타일 가설을 `style_profile.*.yaml` 로 작성.
2. `tools/style-lab/` CLI 로 슬롯 10개에 대해 1차 생성.
3. 골든셋과 대조. 자동 점수 + 눈 검수.
4. 프롬프트 템플릿을 PR 로. CI 가 **이전 버전과의 정성적 회귀** 비교 렌더를 자동 생성.
5. 승인되면 카탈로그에 편입.

---

## 15. 열린 질문

- 자체 파인튜닝 모델을 언제 붙일지 (비용 감축 vs 운영 부담). PoC 트리거 조건을 14번에.
- 사용자 업로드 레퍼런스의 저작권 검증 수준. 16번에서 결정.
- 다중 레퍼런스 간의 "가중치" 를 UI 에 노출할지 vs 자동으로 숨길지.

---

**다음 문서 →** [06. 후처리 파이프라인](./06-post-processing-pipeline.md)
