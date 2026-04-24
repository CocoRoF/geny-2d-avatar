# P2-S2 — Mock 품질 개선: 역할별 shape 렌더링 (2026-04-21)

## 1. 트리거

P1-S5 (sprite pivot + Cubism 축 분리) 커밋 (`36a1c0e`) 직후, 사용자 재확인
"끝까지 전부 진행해. 특히 실제 비즈니스적 측면이 전부 제대로 반영되어야 해" 를
β 데모 경로 관점에서 재적용.

P2-S1 에서 도입한 Mock Generate 는 각 slot UV 위치에 **단색 그라데이션 사각형** +
slot_id 라벨을 그려 "프롬프트를 바꾸면 텍스처가 바뀐다" 는 파이프라인은 증명했지만
시각적으로는 **모자이크처럼** 보였다. β 제품 정의의 핵심 가치 —
"프롬프트 한 줄로 캐릭터가 태어난다" — 는 Mock 이어도 **얼굴처럼 보여야**
전달된다.

추가로 atlas UV 위치를 조사한 결과, slots 의 UV 좌표들은 실제 아바타 레이아웃
(face_base 중앙, ahoge 위, eye_l/r 좌우, mouth 아래 등) 을 그대로 따르고 있다.
즉 **slot 별로 역할 맞춤 shape** 만 그려주면 Mock 도 즉시 "아바타처럼" 보인다.

## 2. 산출물

### 2.1 mockCategoryOf — slot_id → 역할 카테고리 분류 (halfbody + fullbody)

`apps/web-editor/index.html` 에 slot_id 를 16+ 역할 카테고리로 분류하는 함수 추가:

| 카테고리 | 매칭 slot_id |
|---|---|
| `skin` | face_base, face_shadow, nose |
| `blush` | cheek_blush |
| `eye_white` | eye_white_l/r |
| `eye_iris` | eye_iris_l/r |
| `lash_upper` | eye_lash_upper_l/r |
| `lash_lower` | eye_lash_lower_l/r |
| `brow` | brow_l/r |
| `mouth_lips` | mouth_base |
| `mouth_inner` | mouth_inner |
| `ahoge` | ahoge |
| `hair_front` | hair_front |
| `hair_back` | hair_back |
| `hair_side` | hair_side_l/r |
| `skin_body` | neck, hip, arm_*, leg_*, foot_* |
| `cloth` | torso, cloth_main, cloth_cape, cloth_skirt |
| `accessory` | accessory_*, acc_belt |
| `generic` | 그 외 (fallback 그라데이션) |

halfbody 30 슬롯 + fullbody 38 슬롯 **전부** 명시 매핑. `generic` 으로 떨어지는
슬롯은 없다 (검증: fullbody atlas.json 의 `acc_belt`, `cloth_cape/skirt`,
`foot_l/r`, `leg_l/r`, `hip` 모두 정확한 카테고리로 포획).

### 2.2 mockDrawPartShape — 카테고리별 avatar-like primitive

16 카테고리 각각에 대해 canvas primitive 를 그리는 분기. 핵심만:

- **skin**: 베이지 그라데이션 + 살짝 둥근 얼굴 윤곽 (ellipse fill).
- **blush**: 원형 radial gradient (분홍, alpha 낮게).
- **eye_white**: 흰 타원 + 회색 외곽선.
- **eye_iris**: prompt theme hue 기반 원 + 동공 + 하이라이트 점.
- **lash_upper/lower**: 진한 색 arc stroke (눈꺼풀 커브).
- **brow**: 짧은 stroke arc.
- **mouth_lips**: 진한 핑크 quadraticCurve (윗입술 M 모양).
- **mouth_inner**: 어두운 원 (입 안).
- **ahoge/hair_***: theme hair hue 기반 커브 strokes + fill, hair_front 는 앞머리
  웨이브 2-3 가닥, hair_back 은 뒤통수 둥근 실루엣, hair_side 는 양 옆 흐름.
- **skin_body**: 베이지 rounded-rect (목·팔·다리·발 공통).
- **cloth**: theme cloth hue rounded-rect + 살짝 어두운 outline.
- **accessory**: saturated 작은 shape (pin 이나 벨트 느낌).
- **generic**: hash hue gradient rect (fallback).

### 2.3 mockThemeFromPrompt — 프롬프트 해시 기반 색 규칙

프롬프트 문자열을 해시해 결정되는 테마 객체:

```
{
  skin: "#f3d4b8",         // 베이지 계열, 살짝 변주
  blushHue: 340,           // 핑크
  eyeHue: hashMod(360),    // 다채로움
  hairHue: hashMod(360),
  hairLight: 35..55,
  hair: `hsl(hairHue, 55%, hairLight%)`,
  clothHue: hashMod(360),
  browColor: hair 보다 약간 어두운 쌍둥이,
  lashColor: hair 와 동일 hue · L 낮춤,
}
```

같은 prompt → 같은 theme (deterministic). 프롬프트 변경 시 머리색/눈색/옷색이
한번에 달라져 "캐릭터가 바뀐다" 는 즉각 피드백.

### 2.4 mockGenerateTexture — 투명 배경 + per-slot primitive

- `ctx.clearRect(0, 0, 2048, 2048)` 로 시작 (기존은 희미한 그라데이션).
- slot_id 라벨 제거 (이미지 위에 텍스트 찌꺼기가 남던 문제).
- 각 slot 의 UV → pixel 변환 후 `mockDrawPartShape` 호출, hash hue 를 per-slot variation
  으로 넘김 (같은 카테고리 안에서도 살짝 다름).

## 3. 판단 근거

- **왜 slot_id 기반 heuristic 인가?** atlas.slots 가 pivot_uv 나 category 필드를
  아직 갖지 않는다. 이름 기반 classification 은 P1-S5 의 transformFromParameter
  와 동일 철학 (이름 규약에 기대는 Mock-only heuristic). 실 벤더 asset 합류
  시점 (β P3+) 에 atlas 확장으로 교체 예정.
- **왜 halfbody 와 fullbody 를 동시에 지원?** 두 템플릿 모두 β 제품 데모에
  노출된다. fullbody 의 `leg_*` `foot_*` `hip` `cloth_cape/skirt` 등이 `generic`
  fallback 으로 떨어지면 fullbody 데모가 "일부는 모자이크" 로 보인다. 동등
  커버리지가 필수.
- **왜 테마 해시 기반?** 실 벤더는 벡터/이미지 생성 결과가 nondeterministic 이지만
  Mock 은 재현성이 덕목 (테스트·데모 안정성). prompt 한 번 입력 → 이미지가 항상
  같은 모양으로 나타나야 스크린샷 기반 회귀 테스트에 안정적.
- **왜 canvas primitive 인가?** 실 PNG 자산을 갖다 쓰는 순간 "Mock" 이 아닌
  "curated asset" 이 된다. 벤더 의존 0 · 저작권 이슈 0 · 퍼포먼스 즉시 (2048
  canvas 한 장) 가 β 단계 목표. 실 생성 경로는 P3 에서 nano-banana 로 치환.
- **왜 투명 배경?** sprite 단위로 배치될 때 배경 그라데이션은 겹쳐 보여 지저분.
  투명 배경으로 각 파츠가 독립적으로 읽혀야 Pixi sprite 합성이 의도대로 된다.

## 4. 검증

- `pnpm --filter @geny/web-editor test` → halfbody + fullbody 두 템플릿 전부 e2e
  pass (categorize, DOM lifecycle, parameter write-through, motion/expression
  round-trip, LoggingRenderer debug stream).
- `pnpm -r test` → 17 패키지, 전부 green (worker-generate 45/45 포함).
- 카테고리 fallback 제거 검증: halfbody 30 슬롯 · fullbody 38 슬롯 **전원**
  명시 분기 포획 (grep 기반 실검증).

## 5. 알려진 한계

- **Canvas primitive 품질의 상한**: procedural shape 로는 실제 chibi-style 캐릭터
  느낌을 완벽히 구현 못함. 얼굴 윤곽·눈 모양의 디테일이 단순. β P3 실 벤더
  이미지 합류 시 자연스레 해소.
- **theme 다양성 한계**: 프롬프트 자연어 의도 (예: "금발 쌍둥이 소녀") 가 `hairHue`
  에 반영되지는 않는다. 단순 해시일 뿐이라 "빨간 머리" 프롬프트가 녹색 머리로
  나올 수도 있다. 의미 해석은 nano-banana 실 벤더의 역할.
- **pivot 정보 여전히 없음**: sprite.anchor=0.5 만 적용. hair/ahoge 의 실 피벗
  은 머리 위 어딘가지만 atlas 에 pivot 좌표 없음 (P1-S5 한계 그대로).
- **fullbody 의 arm/leg 은 세로 긴 rect**: skin_body 카테고리가 단일 rounded-rect
  로 fallback. 실 사람 모양 (원근 + 관절) 은 P3 이후.

## 6. 다음 후보

1. **P2-S3 pill timing 측정** — prompt submit → canvas swap latency 실측
   (성공 기준 ≤ 5s).
2. **P1-S6 sample atlas.textures[0] 실 PNG 교체** — 현재 4×4 placeholder. Mock
   Generate 없이 초기 로드 때도 이미지가 보이게.
3. **pivot_uv atlas 확장** — atlas.slots 에 optional pivot_uv 추가 후 sprite.anchor
   를 UV 기반으로 (hair/ahoge 정확한 피벗).
4. **P3 대기** — BL-VENDOR-KEY 해제 시 nano-banana 실 HTTP 경로 통합.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P1-S5-sprite-pivot-and-axis-split.md`
- 소스: `apps/web-editor/index.html` (mockCategoryOf, mockDrawPartShape,
  mockThemeFromPrompt, mockGenerateTexture)
- 샘플 번들: `apps/web-editor/public/sample/halfbody/bundle.json`,
  `apps/web-editor/public/sample/fullbody/bundle.json` + atlas.json
- β 로드맵: `docs/ROADMAP-BETA.md` P2 phase
