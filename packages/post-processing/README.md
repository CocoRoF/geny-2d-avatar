# @geny/post-processing

docs/06 §4 Stage 1 Alpha Sanitation + §6 Stage 3 Color Normalize skeleton.

AI 어댑터(`@geny/ai-adapter-*`) 가 생성한 RGBA8 픽셀 버퍼를 web-avatar/Cubism 번들에
넣기 전에 "깔끔한 경계 + 일관된 색" 으로 만드는 전처리 단계. 세션 29 기준 구현 범위:

**Stage 1 — Alpha sanitation**

- [x] `premultipliedToStraight` / `straightToPremultiplied` — docs/06 §4.2 step 1. α=255 픽셀은 bit-exact 라운드트립
- [x] `cleanAlphaNoise` — step 2. 기본 threshold=8. premultiplied 입력이면 RGB 도 함께 0
- [x] `computeAlphaBbox` — step 6. tight bbox 재계산, 전부 투명이면 `null`
- [x] `applyAlphaSanitation` — 위 3 단계를 묶은 파이프라인 + 결정론적 golden sha256

**Stage 3 — Color normalize (결정론적 선형 경로만 — Lab* 는 후속)**

- [x] `computeColorStats` — per-channel 평균/population std, α-gate (threshold 기본 1), premultiplied 입력은 straight 로 복원 후 측정
- [x] `remapColorLinear` — Reinhard RGB 선형 재매핑 `newC = (C-src.mean)*(dst.std/src.std) + dst.mean`, std=0 채널은 평행 이동, 0..255 clamp, α 보존
- [x] `normalizeColor` — 위 두 단계 합성 + `{ source, applied }` stats 반환 (QA 용 — 얼마나 target 에 근접했는지 재검증 가능)

미구현(후속 세션):

- [ ] Stage 1 step 3 morphological close — 슬롯별 `max_hole_px` 필요, 라이브러리 결정 선행
- [ ] Stage 1 step 4 alpha feather — `alpha_edge_policy` 메타 연결 선행
- [ ] Stage 1 step 5 UV box clip — 파츠 메타의 uv_bbox 연결 선행
- [ ] Stage 3 Lab* 변환 — 감각적 색 이동이 필요할 때. 인터페이스(`remapColorLinear(img, src, tgt)`) 는 유지

## 사용

```ts
import {
  applyAlphaSanitation,
  normalizeColor,
  createImageBuffer,
} from "@geny/post-processing";

const raw = createImageBuffer(1024, 1024, pixelBuffer, /* premultiplied */ false);
const { image: cleaned, bbox } = applyAlphaSanitation(raw, {
  threshold: { threshold: 8 },
  bbox: { minAlpha: 8 },
});

// 슬롯별 목표 색(예: 캐릭터 팔레트에서 추출) 로 정규화
const target = { mean: [200, 180, 170], std: [25, 25, 25], sampleCount: 0 } as const;
const { image: normalized, source, applied } = normalizeColor(cleaned, target, {
  alphaThreshold: 8,
});
// applied.mean 이 target.mean 과 1~2 이내면 remap 이 성공적으로 적용된 것
```

## 검증

```bash
pnpm -F @geny/post-processing test  # 48 tests
```

- Stage 1: 라운드트립 (α=255 bit-exact / α=0 lossy) / threshold 동작 / bbox tight 계산 / 파이프라인 결과 sha256 고정
- Stage 3: source=target 항등 / std=0 평행 이동 / clamp / α=0 보존 / alphaThreshold gate / premultiplied 입력 차단 / LCG 픽셀 sha256 결정론 / applied≈target 수렴
- 골든 sha256 (`f2341b59…`) 이 바뀌면 알파 수학이 변경되었다는 뜻 — 의도한 변경이면 픽셀 단위 리뷰 후 golden 갱신

## 다음 단계

`@geny/exporter-core` 의 `assembleWebAvatarBundle()` stage 2 (세션 18) 가 텍스처 PNG 를 그대로
복사하는데, Stage 1/3 완성(close/feather/uvclip/Lab*) 이후 이 패키지를 경유하게 연결한다.
세션 27+ 에서 AI 어댑터 결과 → post-processing → atlas emit 까지 한 컨베이어로 연결 예정.
