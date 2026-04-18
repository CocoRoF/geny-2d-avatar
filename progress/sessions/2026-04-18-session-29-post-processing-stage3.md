# 세션 29 — Post-Processing Stage 3 skeleton (color normalize)

- 날짜: 2026-04-18
- 브랜치/커밋: main · 세션 29
- 워크스트림: **Post-Processing & Fitting** (`docs/14 §9`) — Stage 3 진입
- 로드맵: docs/06 §6 Stage 3 · `progress/INDEX.md §8` 세션 29 예고

## 1. 목표

Stage 1(세션 26) 이 "경계 정리" 를 맡았다면 Stage 3 는 "색 일관성" 을 맡는다. AI 어댑터가
돌려주는 파츠 이미지는 매 호출마다 벤더/프롬프트/시드에 따라 색이 ±수 LSB 흔들리고, 같은
캐릭터 안에서도 슬롯 간 색감이 튄다. 이를 **슬롯별 목표 색 프로파일** 에 맞춰 선형 재매핑
하면 atlas 단계 이전에 팔레트 통일이 끝난다.

이번 세션은 docs/06 §6 의 결정론적 경로(RGB Reinhard transfer) 만 먼저 박제. Lab* 변환
/ fit-to-palette 카탈로그 / per-part 다중 프로파일 은 후속.

```
[AI adapter RGBA8 (Stage 1 이후)]
       ↓
@geny/post-processing · normalizeColor()
  1) premultiplied ? → straight 역변환 (Stage 1 이미 했을 수도)
  2) computeColorStats(img)           ← source 프로파일
  3) remapColorLinear(img, src, tgt)  ← Reinhard RGB
  4) computeColorStats(result)        ← applied (QA 재검증)
       ↓
[atlas emit / 번들 저장]
```

## 2. 산출물 체크리스트

- [x] `packages/post-processing/src/color-stats.ts` — `ColorStats = {mean,std,sampleCount}` + `computeColorStats(img, {alphaThreshold=1})`. 2-pass mean→variance. premultiplied 입력은 straight 복원 후 측정. population std (n 으로 나눔). 완전 투명 → `sampleCount=0` + mean/std=0.
- [x] `packages/post-processing/src/color-remap.ts` — `remapColorLinear(img, source, target, {alphaThreshold=1})`. Reinhard RGB: `newC = (C - src.mean) * (dst.std/src.std) + dst.mean`. `src.std[c]===0` 채널은 `scale=1` 평행 이동. 0..255 clamp. α 보존. α<threshold 픽셀 skip. premultiplied 입력은 throw.
- [x] `packages/post-processing/src/color-normalize.ts` — `normalizeColor(input, target, opts)` = premult unwrap → source stats → remap → applied stats. `{image(straight), source, applied}` 반환.
- [x] `packages/post-processing/src/index.ts` — Stage 3 3 exports + 3 types 추가.
- [x] `tests/color-stats.test.ts` — 6 tests (단색 std=0 · 전부 투명 count=0 · alphaThreshold gate · 두 색 반반 mean/std · premultiplied 복원 · 범위 가드).
- [x] `tests/color-remap.test.ts` — 7 tests (source=target 항등 · std=0 평행 이동 · clamp · α=0 무변경 · premultiplied throw · alphaThreshold skip · 새 버퍼 입력 불변).
- [x] `tests/color-normalize.test.ts` — 8 tests (applied 평균이 target 에 ≤1.5 수렴 · premult 자동 unwrap · alphaThreshold 일관 적용 · 입력 불변 · LCG seed=1337 sha256 결정론 · target std=0 붕괴 · α=0 유지 + 유효 픽셀 이동 · applied == computeColorStats(image)).
- [x] `packages/post-processing/README.md` — Stage 3 섹션 + 사용 예 (cleaned → normalized) + 48 tests 갱신.
- [x] `progress/INDEX.md` — 스트림 상태 "Stage 1 + Stage 3", Platform/Infra step 요약, Gate line, 세션 29 row, §8 재정렬(세션 30/31/32).

## 3. 설계 결정 (D1–D5)

### D1. RGB Reinhard 선형만 — Lab* 는 인터페이스 유지한 채 후속

docs/06 §6 은 Reinhard et al. (2001) Lab* 변환을 권장하지만 Foundation 에선:

- Lab* 전환 수학은 sRGB↔XYZ↔Lab 체인이 필요 — 라운딩 정책 정밀 설계가 더 걸림
- 감각적(per-color 밝기/채도 분리) 이점은 "스타일이 심하게 다른 벤더 교차" 에서나 큼
- Foundation 목표는 "팔레트가 튀지 않음" → RGB 선형으로 충분히 끌어올 수 있음

따라서 `remapColorLinear(img, source, target)` 시그니처를 현재 RGB Reinhard 로 확정하고,
세션 32+ 에서 `{ space: "rgb" | "lab" }` 옵션을 추가하는 방향. 인터페이스 호환성 유지.

근거: "결정론 먼저, 품질 개선은 회귀 잠그고서" — 세션 26 의 D1 과 동일 원칙.

### D2. α-gate 로 통계 측정 — 경계 픽셀이 평균을 왜곡하지 않게

투명/반투명 경계 픽셀은 검은색/흰색 방향으로 RGB 가 눌려 있어 모집단에 섞이면 평균이
가짜로 어둡/밝게 나옴. `alphaThreshold` 기본 1(완전 투명만 제외), 세션 26 과 동일한 8 은
호출자가 원하면 넘길 수 있게 옵션으로 남김.

remap 도 같은 threshold 를 존중 — "통계에 안 넣은 픽셀은 변경도 안 함" 원칙. 그렇지 않으면
stats 는 α≥1 기준인데 remap 은 α≥0 기준으로 돌아 edge 가 새 색으로 물들어버림.

근거: docs/06 §4.1 "알파 경계 보호" 와 동일한 사상을 색 단계에도 적용.

### D3. `src.std[c]===0` 채널은 평행 이동만 — 0 으로 나눔 방어 + 단색 파츠 보호

단색 파츠(예: 솔리드 레이어, 디버그 플랫) 는 std=0 → `dst.std/src.std = Infinity`. 이 경우
`scale=1` 로 고정하고 `newC = C + (dst.mean - src.mean)` 만 적용. "색 분포가 없으니 중심만
옮긴다" 가 직관과 일치.

근거: docs/06 §6 명시. 또한 Reinhard 원논문 §3 의 degenerate case 처리와 동일 접근.

### D4. `normalizeColor` 는 `{source, applied}` 를 반환 — 로그/QA 단에서 수렴 검증

remap 후 한 번 더 stats 계산해서 반환하면:

- 회귀 테스트에서 `applied.mean ≈ target.mean` (≤1.5 LSB) 를 직접 검증
- 운영 파이프라인에서 벤더별 수렴도를 메트릭으로 기록 (관측 세션 17/24 와 연결 가능)
- 실패 케이스(예: 대부분 투명한 파츠) 는 `source.sampleCount` 로 조기 감지

근거: 결정론 + QA 가시성. 비용은 미미(두 pass 추가).

### D5. LCG 픽스처 기반 결정론 sha256 — 파일 없이 회귀 박제

세션 26 과 동일 철학. `seed=1337 → 8×8 RGBA8` 두 번 돌려 같은 sha256 이 나오는지 확인.
픽셀 저장 없이도 "수학이 바뀌면 테스트가 깨진다" 를 보장. 실제 값 골든 문자열은 너무 길어
다중 target 프로파일 확장 시 유지보수 부담 → 일단 "동일 입력 → 동일 출력" 회귀로 충분.

근거: 수학이 바뀌면 applied.mean 수렴 테스트(D4) 도 같이 깨지므로 이중 방어.

## 4. 검증 로그

```bash
$ pnpm -F @geny/post-processing test
ℹ tests 48  pass 48  fail 0
```

- Stage 1 27 + Stage 3 21 = 48.
- `test-golden.mjs` step 13 은 `pnpm -F @geny/post-processing test` 를 그대로 돌리므로
  새 테스트가 자동 포함. step 수 변화 없음(14 유지).

## 5. 위험·후속

- **Lab* 미지원**: "스타일이 심하게 튀는 벤더 교차" 에선 선형 RGB 만으로 색감 이동이 부족할
  수 있음. 세션 32 에서 옵션으로 추가, `remapColorLinear` 시그니처는 유지.
- **per-part target 카탈로그 부재**: 현재는 호출자가 `ColorStats` 를 만들어 넘기는 구조 —
  슬롯별 기본 target 팔레트 카탈로그(`palette.json`) 는 아직 없음. `fit-to-palette` 는 후속.
- **std=0 target**: `target.std = [0,0,0]` 이면 출력이 단일 평균 색으로 붕괴 — 디버그용
  용도는 OK 지만 실 운영에선 경고할 필요. 현재는 수학적으로 정의된 결과만 내보냄.
- **large image 성능**: 3 pass(stats ×2 + remap ×1) pure JS. 2K 텍스처 수백 ms. Foundation
  OK, Release Gate 에서 측정 후 Worker/SIMD 판단.

## 6. 다음 세션 예고

세션 30 은 AI 어댑터 4차 — `adapters.yaml` 카탈로그 + orchestrator 진입점 + provenance
`attempts[]` round-trip. `progress/INDEX.md §8` 참조.
