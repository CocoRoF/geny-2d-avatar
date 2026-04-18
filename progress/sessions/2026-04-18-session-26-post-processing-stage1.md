# 세션 26 — Post-Processing Stage 1 skeleton (alpha sanitation)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 26
- 워크스트림: **Post-Processing & Fitting** (`docs/14 §9`) — 스트림 착수
- 로드맵: docs/06 §4 Stage 1 · `progress/INDEX.md §8` 세션 26 예고

## 1. 목표

AI 어댑터(`@geny/ai-adapter-*`) 결과 RGBA8 픽셀을 web-avatar/Cubism 번들 텍스처로 보내기
전에 "깔끔한 경계" 로 만드는 첫 단계를 **이미지 라이브러리 의존 없이** 결정론적으로 한다.
Stage 1 전체(§4.2 6 step) 중 라이브러리 결정이 필요한 morphological close / feather 를
뒤로 미루고, pure 픽셀 산술로 끝나는 premult↔straight · noise threshold · tight bbox 만
먼저 박제해 Exporter 파이프라인에 물릴 수 있는 인터페이스 를 확보한다.

```
[AI adapter RGBA8]
     ↓
@geny/post-processing · applyAlphaSanitation()
  1) premultiplied → straight (flag 에 따라)
  2) cleanAlphaNoise(threshold=8)
  3) computeAlphaBbox()                ←  bbox 메타/atlas.json 에 그대로 사용
     ↓
[@geny/exporter-core · assembleWebAvatarBundle (세션 18 stage 2)]
```

## 2. 산출물 체크리스트

- [x] `packages/post-processing/` 신설 (`@geny/post-processing` v0.1.0) — pnpm workspace 인식
- [x] `src/types.ts` — `ImageBuffer = {width,height,data(Uint8ClampedArray),premultiplied}` + `createImageBuffer()` 크기·길이 가드
- [x] `src/alpha-premult.ts` — `straightToPremultiplied()`/`premultipliedToStraight()`. α=255 bit-exact 라운드트립 / α=0 RGB=0 고정 / 나머지 `Math.round` 수식
- [x] `src/alpha-threshold.ts` — `cleanAlphaNoise(img, {threshold=8})`. premultiplied 면 노이즈 픽셀의 RGB 도 0
- [x] `src/alpha-bbox.ts` — `computeAlphaBbox(img, {minAlpha=1})`. 전부 투명이면 `null`
- [x] `src/pipeline.ts` — `applyAlphaSanitation(img, opts)` → `{image, bbox}`. premultiplied 입력 시 먼저 역변환
- [x] `src/index.ts` — 모든 공개 API exports
- [x] `tests/alpha-premult.test.ts` — 10 tests (α=255/0/128, 라운드트립 exact, α=0 lossy, 동일 참조 short-circuit, 생성자 가드)
- [x] `tests/alpha-threshold.test.ts` — 7 tests (기본 threshold, RGB 보존 vs premult RGB 0, threshold=0 short-circuit, threshold=16, 범위 가드, 입력 불변)
- [x] `tests/alpha-bbox.test.ts` — 6 tests (전부 투명, 단일 픽셀, tight bbox, 전체 채움, minAlpha 노이즈 제외, 범위 가드)
- [x] `tests/pipeline-golden.test.ts` — 4 tests (LCG seed=42 픽스처 → sha256 `f2341b59…` 고정 + premultiplied 분기 + 전부 노이즈 → bbox null + 유효 픽셀 하나만)
- [x] `tsconfig.{json,build,test}.json` + `.gitignore` — 기존 패키지 규약 동일
- [x] `scripts/test-golden.mjs` — step 13 `post-processing tests` 추가 (총 13 step)
- [x] `packages/post-processing/README.md` — 구현 범위 + 사용 예 + 다음 단계 연결
- [x] `progress/INDEX.md` — Post-Processing 스트림 🟡 + Platform/Infra step=13 + Gate 갱신 + 세션 26 row + §8 세션 27–29 재정렬

## 3. 설계 결정 (D1–D5)

### D1. Stage 1 을 "6 step 중 3 step" 으로 분할 착수 — 나머지는 라이브러리 결정 후

docs/06 §4.2 의 6 step 을 한 번에 구현하면:

- morphological close → npm 픽셀 연산 라이브러리 선택(없으면 직접 구현) 부담
- feather → 파츠 스펙 `alpha_edge_policy` 스키마 연결 선행
- UV clip → 파츠 `uv_bbox` 연결 선행

이번 세션은 "라이브러리 없이 완결되는" 3 step 만 완성 → 인터페이스 `applyAlphaSanitation`
은 고정하고, 미완 step 은 옵션 인자가 비어 있는 상태로 pass-through. 후속 세션에서 옵션을
채우며 확장하면 됨.

근거: 파이프라인 계약(입/출력 `ImageBuffer + BBox`)은 바뀌지 않으므로, 나머지 step 추가는
consumer 영향 없음. vs. 6 step 을 한 번에 하려다 라이브러리 선택을 서두르는 것이 더 위험.

### D2. 라운드트립은 α=255 만 bit-exact 보장 — α<255 는 lossy 인정

premult `round(RGB * α/255)` 는 역변환에서 `round((R_pm * 255) / α)` — α 작을수록 양자화
오차 누적. α=0 구간은 정보 자체가 없음(모든 RGB 가 0 으로 수렴).

따라서:

- α=255 (불투명) + α=0 (완전 투명) 만 테스트가 bit-exact 강제
- 중간값은 "공식 적용" 만 테스트 (α=128 → `round(RGB*128/255)`)
- α=0 의 RGB 정보 손실을 테스트로 박제 (규약화)

근거: 실제 브라우저 canvas/WebGL 도 동일한 양자화 — "중간 α 에서 bit-exact 복원" 은 IEEE
float 없이는 불가. 위반 우려 없음.

### D3. `Uint8ClampedArray` 사용 — 브라우저 `ImageData` 와 zero-copy

`Uint8Array` 도 가능하지만 `ImageData.data` 가 `Uint8ClampedArray` 이므로 browser/editor
통합에서 wrap 없이 바로 사용 가능. clamp 동작은 역변환 `Math.min(255, …)` 에서 실수 방지로
이중 안전망 역할.

근거: 세션 18 `@geny/web-avatar` 가 브라우저 환경에서 작동하므로, 동일 타입을 통해 추후
텍스처 로더와 엮기 쉬움.

### D4. 골든은 LCG 픽스처 + 결과 sha256 고정 — PNG 파일 저장 없이 회귀

이미지 파일(PNG/WebP) 을 골든으로 커밋하면:

- 바이너리 diff 리뷰 어려움
- 포맷 인코더 버전 다르면 재생성 때 sha 변동

대신 "seed=42 LCG → 8×8 RGBA8 버퍼" 를 테스트 코드 내에서 생성하고, 파이프라인 결과의
`Uint8ClampedArray` 를 `sha256` 으로 박제. 수학이 바뀌면 sha 가 바뀌므로 리뷰어는 의도한
변경인지 확인 후 문자열 한 줄만 갱신.

근거: docs/15 골든 회귀 원칙(byte-equal)을 이진 자산 없이 구현. 세션 09 `model3` golden
과 같은 철학.

### D5. 파이프라인은 `{image, bbox}` 두 값을 반환 — 메타 통합 편의

consumer 가 bbox 재계산을 다시 할 이유 없도록 파이프라인 내부 결과를 그대로 노출. atlas
emitter/`avatar-metadata.bbox` / Cubism `HitArea` 등 모두 같은 bbox 를 소비.

## 4. 검증 로그

```bash
$ pnpm -F @geny/post-processing test
ℹ tests 27  pass 27  fail 0

$ pnpm run test:golden
… 13 steps … ✅ all steps pass
```

## 5. 위험·후속

- **골든 sha 의 시드 고정성**: Node `Uint8ClampedArray` 의 `.set()` 이나 `createHash()` 구현이
  바뀌어 수치가 달라질 가능성은 낮지만 0 은 아님. Node 22.11 pin(세션 13b) 유지가 전제.
- **step 3/4/5 미구현**: interface 는 고정되었으나 실제 cleanup 품질(구멍/깃털/UV 클립) 은
  아직 없음. 프로덕션 투입 전 세션 29+ 에서 완결 필요.
- **large image 성능**: 현재 pure JS loop 로 픽셀 단위. 2K 텍스처(4M 픽셀 × 3 pass) 는 수백 ms
  수준 추정 — Foundation 에선 충분. Worker/SIMD 최적화는 Release Gate 에서 측정 후 결정.

## 6. 다음 세션 예고

세션 27 은 rig v1.3 (body 파츠 + 물리 3 Setting) 또는 세션 28 (AI 어댑터 3차 `routeWithFallback`).
`progress/INDEX.md §8` 참조.
