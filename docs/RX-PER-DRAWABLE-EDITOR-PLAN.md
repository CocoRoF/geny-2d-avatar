# RX — Per-Drawable Editor 재구성 계획

**문서 상태**: 계획 v1 (사용자 승인 대기)
**작성일**: 2026-04-26
**Trigger**: 사용자가 https://nikke-db.pages.dev/visualiser 스크린샷과 함께 "지금 구조적 특성이 매우 심각하게 잘못되었고, 완전히 다시 만들어도 좋으니" 지시.

---

## 1. 목표 (사용자 원문)

> "뼈대는 전부 정해져 있고, 거기에 개별 Texture를 켜고 끄고 해볼 수도 있으며, 그 텍스처를 개별적으로 단건 수정할 수 있는 느낌"

스크린샷 분석:
- 우측 layer panel: drawable 마다 row (color swatch / eye icon visibility / select checkbox / 이름)
- 검색창 + Select results / Deselect results
- RGBA 슬라이더 4개
- "Apply modifications to selected layers"
- 좌측 stage: 실시간 Live2D 렌더 (변경 즉시 반영)

## 2. 핵심 기능 6 가지

| # | 기능 | 메커니즘 |
|---|---|---|
| F1 | drawable 목록 | `coreModel.getModel().drawables.ids[]` |
| F2 | 가시성 토글 | `setMultiplyColorByRGBA(idx, 1, 1, 1, 0)` (alpha=0 = 숨김) + override flag |
| F3 | 다중 선택 + 검색 | UI state |
| F4 | RGB shift | `setMultiplyColorByRGBA(idx, r, g, b, 1)` |
| F5 | 단건 텍스처 수정 (AI inpaint) | drawable 의 UV bbox 만 atlas 에서 잘라 inpaint, 결과는 같은 bbox 에 합성 |
| F6 | 결과 저장 | atlas + drawable layer-state (visibility/multiply colors/edits) → bundle |

## 3. 기술 검증 결과 (조사 완료)

✅ **Cubism Core JS API** — `model.internalModel.coreModel.getModel().drawables` 가 다음을 노출:
```ts
{
  count: number,
  ids: string[],
  textureIndices: Int32Array,
  renderOrders: Int32Array,
  drawOrders: Int32Array,
  opacities: Float32Array,
  parentPartIndices: Int32Array,
  vertexUvs: Array<Float32Array>,    // 각 [u0,v0,u1,v1,...]
  vertexPositions: Array<Float32Array>,
  indices: Array<Uint16Array>,
  constantFlags: Uint8Array,         // blend mode, double-sided, mask invert
  dynamicFlags: Uint8Array,          // visibility, opacity changed 등
}
```
또한 `coreModel.setMultiplyColorByRGBA(drawableIdx, r, g, b, a)` + `setOverrideFlagForDrawableMultiplyColors(idx, true)` 가 SDK 차원에서 매 프레임 override 를 보장 — **Nikke DB visualizer 도 동일 메커니즘 사용**.

✅ **UV → atlas pixel** 변환은 단순 곱셈. UV 는 top-left origin, [0..1].

✅ **빌드 환경 OK**: `packages/web-avatar-renderer-pixi/src/pixi-live2d-renderer.ts:62-76` 의 `Live2DModelLike` typedef 만 넓혀주면 됨.

## 4. 아키텍처 (현재 vs 목표)

### 현재 (atlas-centric)
```
preset (.moc3) + atlas (단일 PNG)
    ↓ user mask drawing
inpaint pipeline → 새 atlas
    ↓ build
bundle.zip
```

### 목표 (drawable-centric)
```
preset (.moc3) → drawable list (id, UV bbox, parent part)
    ├── visibility + multiply color override (frontend, 매 프레임 적용)
    ├── 단건 inpaint (drawable UV bbox 만 → atlas 에 합성)
    └── 다중 RGB shift (선택 drawables 일괄 multiplyColor 설정)
    ↓ build
bundle.zip + layer-state.json (가시성/multiplyColor 저장)
```

## 5. Phase 분해 (PR 단위)

### Phase RX.1 — Drawable extraction (additive, 안전)
- `Live2DModelLike` 타입 확장: `getDrawableCount/getDrawableId/getDrawableTextureIndex/getDrawableVertexUvs/setMultiplyColorByRGBA/setOverrideFlagForDrawableMultiplyColors` 노출
- 모델 로드 직후 drawable list 추출 함수 `extractDrawables(model): DrawableMeta[]`
  - DrawableMeta = `{ index, id, partIndex, partId, textureIndex, renderOrder, uvBbox: {x,y,w,h}, isVisible, blendMode }`
- builder.html 에 임시 dev-only 디버그 패널: drawable 갯수 + 첫 5개 id 출력 — 구조 검증용 (다음 Phase 에서 정식 UI 로 교체)
- **기존 코드 변경 없음** (전부 새 추가)
- 테스트: drawable count > 0, UV bbox 가 [0, atlasSize] 범위 안

### Phase RX.2 — Layer Panel UI (replaces 우측 패널 일부)
- 새 panel `<section id="drawable-panel">`:
  - 검색 input
  - drawable row 목록 (스크린샷 모방):
    - color swatch (현재 multiplyColor 미니뷰)
    - 👁 visibility toggle (alpha 0/1)
    - ☐ select checkbox
    - drawable id text
    - 우측에 mini thumbnail (atlas 의 UV bbox sub-image)
  - Select results / Deselect results 버튼 (검색 결과 일괄)
- visibility toggle 클릭 → `setMultiplyColorByRGBA(idx, 1, 1, 1, 0|1)` + override flag
- 매 프레임 Cubism update 후 적용 보장 (override flag 가 SDK 차원에서 처리하므로 별도 hook 불필요)
- 기존 inpaint 패널 / slot 패널 / iter 패널은 일단 그대로 유지 (Phase RX.6 에서 정리)

### Phase RX.3 — RGB shift (다중 선택 일괄)
- panel 하단에 RGBA 슬라이더 (R/G/B 0-255, A 0-100%)
- 선택된 drawables 에 동일한 multiplyColor 적용
- "Apply" 버튼 — 즉시 live preview 반영
- "Reset" 버튼 — 선택 drawables 의 multiplyColor 를 (1,1,1,1) 로

### Phase RX.4 — 단건 inpaint (drawable scoped)
- drawable row 우클릭 또는 "✎ 편집" 버튼 → 그 drawable 의 UV bbox 를 inpaint canvas 에 로드
  - bg = atlas 의 그 영역 잘라서
  - mask = bbox 영역 내에서만 그릴 수 있게 제한
  - prompt 입력 → AI 호출 → bbox 영역 내 픽셀만 수정해서 atlas 에 합성
- 백엔드: `/api/texture/inpaint` 가 `bbox: {x,y,w,h}` 옵션 추가 — bbox 외부는 강제 원본 (compositeInpaintResult 가 이미 mask 외부를 보존하므로 bbox 외 mask=0 이면 자동으로 됨)
- 기존 atlas-wide inpaint 와 코드 공유

### Phase RX.5 — Layer state 저장/복원
- `layer-state.json` schema: `{ drawables: { [id]: { visible: boolean, multiplyColor?: [r,g,b,a] } } }`
- 모델 로드 시 자동 적용
- `/api/build` 가 bundle 에 포함
- 다운로드 → 외부 viewer 는 multiplyColor 무시 (Cubism Editor 호환), 우리 web-preview 는 layer-state 반영

### Phase RX.6 — Polish + 정리
- 기존 atlas-wide inpaint 패널을 "고급 모드" 로 토글 (drawable 단위 가 기본)
- 또는 deprecate
- builder.html 정리 — drawable 단위 가 primary flow 가 되도록 레이아웃 재배치
- 사용자 확인 후 진행

### Phase RX.7 (선택) — 검색 강화 + drawable 그룹핑
- 이름 prefix 별 그룹 (예: `b_f_*`, `back_tree_*`)
- preset 별 의미 있는 카테고리화 (사용자 정의 라벨 가능)

## 6. 기존 코드 처분

### KEEP (그대로 사용)
- `rig-templates/` (mao_pro 프리셋)
- `pixi-live2d-display-advanced` 통합
- `apps/api/src/routes/{build, bundle, texture-serve, live2d-proxy, presets, preset-atlas, models, texture-upload}.ts`
- `apps/api/src/lib/{adapters/*, edit-prompt, inpaint-composite, image-post, texture-manifest, texture-adapter}.ts`
- `apps/api/tests/{inpaint-composite, texture-inpaint, …}.test.ts`
- Activity Log + history undo/redo + cancel/timer + auto idle motion

### REFACTOR
- `texture-inpaint.ts` — `bbox` 옵션 추가 (drawable scope)
- `pixi-live2d-renderer.ts` — `Live2DModelLike` 타입 확장
- `builder.html` — 우측 layer panel 추가, 기존 패널 점진 정리

### DEPRECATE (Phase RX.6)
- 슬롯 재생성 패널 (drawable 단위가 대체)
- 전체 atlas inpaint 의 primary 위치 (고급 모드로 이동)

### DELETE (없음)
- 어떤 파일도 즉시 삭제하지 않음. 새 흐름이 안정된 후 정리.

## 7. 위험 / 미지수

1. **Cubism Core 미로드 환경** — 사용자가 vendor/live2dcubismcore.min.js 미배치 시 drawable list 도 못 뽑음. 기존 안내 문구 재사용.
2. **textureFlipY 설정** — `internalModel.textureFlipY` 가 true 면 V 플립 필요. 모델별로 다를 수 있어 첫 로드 시 자동 검출.
3. **회전된 메시의 axis-aligned bbox** — 일부 drawable (예: 머리카락) 은 회전된 메시라 bbox 가 너무 큼. 첫 단계는 그대로 두고, 나중에 oriented bbox 로 개선 가능.
4. **다중 drawable 이 동일 atlas region 공유** — 흔하지 않지만 발생 시 한 drawable 편집이 다른 곳에도 영향. 사용자에게 경고 표시.
5. **TypeScript 타입 갭** — pixi-live2d-display-advanced 의 some types 가 우리 코드와 어긋날 수 있음. 첫 PR 에서 검증.
6. **성능** — drawable 100+ 모델 (mao_pro 32 parts × n drawables) 의 thumbnail 렌더링이 느릴 수 있음. lazy loading + 캐시.

## 8. 진행 방식

- **사용자 승인 후** Phase RX.1 부터 순차 진행. 각 Phase 1 PR.
- Phase RX.1 은 additive (기존 동작 깨지지 않음) → 안전.
- Phase RX.2~RX.5 는 새 UI/API 추가. 기존 기능 보존.
- Phase RX.6 (정리) 은 사용자가 새 flow 만족 확인 후에만 진행.
- 자율 모드는 일단 정지. 각 Phase 결과 확인 후 다음 진행.

## 9. 첫 액션 (사용자 승인 시)

Phase RX.1 — drawable extraction:
1. `packages/web-avatar-renderer-pixi/src/pixi-live2d-renderer.ts` 의 `Live2DModelLike` 확장 (타입 widening)
2. `apps/web-preview/builder.html` 에 `extractDrawables(model)` 함수 추가
3. 모델 로드 후 `window.log.info("drawables", { count, first5: ids.slice(0, 5), uvBboxSample })` 로 검증
4. PR 생성, CI 통과, merge
5. 사용자 확인 (drawable list 가 콘솔에 나오는지) → Phase RX.2 진행

---

## 부록 A — DrawableMeta TypeScript 인터페이스 (RX.1 산출물)

```ts
export interface DrawableMeta {
  readonly index: number;        // Cubism core 의 drawable index
  readonly id: string;           // 예: "b_f_3", "back_tree_l1"
  readonly partIndex: number;    // 부모 part index (-1 = root)
  readonly partId: string | null;
  readonly textureIndex: number; // multi-texture 모델 대응
  readonly renderOrder: number;
  readonly drawOrder: number;
  readonly uvBbox: { x: number; y: number; w: number; h: number }; // atlas pixel space
  readonly blendMode: "normal" | "additive" | "multiplicative";
  readonly isDoubleSided: boolean;
  readonly isInvertedMask: boolean;
  readonly initialOpacity: number;
}

export function extractDrawables(model: Live2DModelLike, atlasSize: { w: number; h: number }): DrawableMeta[];
```

## 부록 B — Layer state schema (RX.5 산출물)

```jsonc
{
  "schema_version": "v1",
  "format": 1,
  "preset": { "id": "tpl.base.v1.mao_pro", "version": "1.0.0" },
  "drawables": {
    "b_f_3": { "visible": false },
    "back_tree_l1": { "multiplyColor": [0.8, 0.6, 0.5, 1.0] },
    "ribbon_a": { "visible": true, "multiplyColor": [1.2, 1.0, 1.0, 1.0] }
  },
  "edits": [
    { "drawable_id": "head_face", "texture_id": "tex_abc...", "bbox": { "x": 1024, "y": 0, "w": 512, "h": 512 } }
  ]
}
```
