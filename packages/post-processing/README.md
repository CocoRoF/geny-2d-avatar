# @geny/post-processing

docs/06 §4 Stage 1 Alpha Sanitation skeleton.

AI 어댑터(`@geny/ai-adapter-*`) 가 생성한 RGBA8 픽셀 버퍼를 web-avatar/Cubism 번들에
넣기 전에 "깔끔한 경계" 로 만드는 첫 단계. 세션 26 기준 구현 범위:

- [x] `premultipliedToStraight` / `straightToPremultiplied` — docs/06 §4.2 step 1. α=255 픽셀은 bit-exact 라운드트립
- [x] `cleanAlphaNoise` — step 2. 기본 threshold=8. premultiplied 입력이면 RGB 도 함께 0
- [x] `computeAlphaBbox` — step 6. tight bbox 재계산, 전부 투명이면 `null`
- [x] `applyAlphaSanitation` — 위 3 단계를 묶은 파이프라인 + 결정론적 golden sha256

미구현(후속 세션):

- [ ] step 3 morphological close — 슬롯별 `max_hole_px` 필요, 라이브러리 결정 선행
- [ ] step 4 alpha feather — `alpha_edge_policy` 메타 연결 선행
- [ ] step 5 UV box clip — 파츠 메타의 uv_bbox 연결 선행

## 사용

```ts
import { applyAlphaSanitation, createImageBuffer } from "@geny/post-processing";

const raw = createImageBuffer(1024, 1024, pixelBuffer, /* premultiplied */ false);
const { image, bbox } = applyAlphaSanitation(raw, {
  threshold: { threshold: 8 },
  bbox: { minAlpha: 8 },
});
// image.data: 정리된 RGBA8
// bbox: { x, y, width, height } | null — null 이면 전부 투명
```

## 검증

```bash
pnpm -F @geny/post-processing test  # 27 tests
```

- 라운드트립 (α=255 bit-exact / α=0 lossy) / threshold 동작 / bbox tight 계산 / 파이프라인 결과 sha256 고정
- 골든 sha256 (`f2341b59…`) 이 바뀌면 알파 수학이 변경되었다는 뜻 — 의도한 변경이면 픽셀 단위 리뷰 후 golden 갱신

## 다음 단계

`@geny/exporter-core` 의 `assembleWebAvatarBundle()` stage 2 (세션 18) 가 텍스처 PNG 를 그대로
복사하는데, Stage 1 완성(close/feather/uvclip) 이후 이 패키지를 경유하게 연결한다.
세션 27+ 에서 AI 어댑터 결과 → post-processing → atlas emit 까지 한 컨베이어로 연결 예정.
