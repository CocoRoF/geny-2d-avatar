# P1-S9 — `?debug=pivots` dev 오버레이: atlas pivot_uv 시각 검증 (2026-04-22)

## 1. 트리거

P1-S8 이 halfbody v1.3.0 30 파츠 + fullbody v1.0.0 38 파츠 **전 파츠에**
`atlas.slots[i].pivot_uv` 를 자동 주입했지만, 렌더 결과에서 **피벗이 올바른
위치에 꽂혔는지 육안 확인할 수단이 없었다**. Foundation CI 는 JSON 골든
sha256 으로 데이터 경로는 고정하지만 픽셀 회귀 테스트는 없음 — 저자/운영이
브라우저에서 "ahoge 가 정말 정수리에서 회전하는가" 를 확인하려면 수작업
head_angle_z 슬라이더 조작 + 시각 비교밖에 없었다.

β 제품 정의 §3 #1 "실 픽셀 렌더" / §3 #5 "파라미터 반영" 의 신뢰도를 담보
하려면 피벗 위치를 **눈으로 볼 수 있어야** 한다. 특히 P4 (실 nano-banana
합류) 이후 AI 생성 슬롯이 pivot_uv 없이 올 때도 "어느 슬롯이 fallback 중심
으로 돌고 있는가" 가 한눈에 드러나야 저자 피드백 루프가 빠르다.

## 2. 산출물

### 2.1 순수 함수 — `computePivotMarkerPositions`

`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` 에 신설:

```ts
export interface PivotDebugMarker {
  readonly slot_id: string;
  readonly x: number;
  readonly y: number;
  readonly hasPivotUv: boolean;
}

export function computePivotMarkerPositions(
  scene: PixiSceneInput,
  stageW: number,
  stageH: number,
): PivotDebugMarker[];
```

- `buildSpriteScene` 과 **동일한** `fit / originX / originY` 공식 재사용 —
  sprite 위치와 1 픽셀 어긋남 없이 겹친다.
- `scene.meta.parts` 에 열거되지 않은 슬롯은 제외 (실제 렌더되지 않는 슬롯에
  마커를 그리면 혼란).
- `hasPivotUv` 플래그 — 저자가 명시적으로 `pivot_uv` 를 찍었는지 / slot 중심
  fallback 인지 구분. 오버레이 색상 결정에 사용.
- canvas 차원 0/음수 방어 (fit NaN 회귀).

### 2.2 옵션 배관 — `PixiRendererOptions.debugPivots`

`PixiRendererOptions` + `CreatePixiAppOptions` 양쪽에 `debugPivots?: boolean`
추가. 기본값 `false`. `createPixiRenderer` 내부에서 `createApp` 호출 시
pass-through.

### 2.3 실 렌더 경로 — `defaultCreateApp` 오버레이 컨테이너

```ts
const debugPivots = !!options.debugPivots;
const pivotOverlay = debugPivots ? new pixi.Container() : null;
if (pivotOverlay) root.addChild(pivotOverlay);
```

- 비활성 시 컨테이너 자체를 만들지 않아 **zero-cost** (bundle/렌더 영향 없음).
- 활성 시 `root` 의 child 로 부착 — stage rotation/pivot 공유해 sprite 와 같은
  좌표계에서 이동.
- `rebuild` 후 `drawPivotOverlay(scene, stageW, stageH)` 호출 — 마커를 초기화
  후 현재 슬롯 세트로 재드로잉. sprite 경로 + fallback grid 양쪽에서 동일
  훅.

### 2.4 마커 렌더

```ts
for (const m of markers) {
  const g = new pixi.Graphics();
  const outer = m.hasPivotUv ? 0xff3b30 : 0x8a8a8a;
  const inner = m.hasPivotUv ? 0xffffff : 0xd0d0d0;
  g.circle(0, 0, 5); g.fill({ color: outer, alpha: 0.85 });
  g.stroke({ color: 0x000000, width: 1, alpha: 0.35 });
  g.circle(0, 0, 1.5); g.fill({ color: inner, alpha: 0.95 });
  g.position.set(m.x, m.y);
  pivotOverlay.addChild(g);
}
```

- 주입된 pivot_uv: **빨강(0xff3b30) + 흰 중심** — "저자 의도 피벗" 시각.
- fallback (pivot_uv 없음): **회색(0x8a8a8a)** — 아직 주입 안 된 슬롯 식별.
- 반경 5px / inner 1.5px — stage 크기 무관 (pixi stage 좌표계).

### 2.5 web-editor wire-through — `?debug=pivots`

`apps/web-editor/index.html`:

- 기존 `?debug=logger` flag 파서를 `Set<string>` 으로 일반화해 여러 debug
  flag 를 `,` 로 나열 가능 (`?debug=logger,pivots`).
- `debugPivotsEnabled` 를 계산해 `createPixiRenderer({ debugPivots: ... })`
  로 전달. console 메시지에도 `(+debug=pivots overlay)` 추가.
- 기본 경로(`?renderer=pixi` 만) 에선 비활성 — 에디터 UX 에 영향 없음.

### 2.6 package export — `packages/web-avatar-renderer-pixi/src/index.ts`

`computePivotMarkerPositions` + `PivotDebugMarker` 타입을 named export —
외부 툴링(dev overlay 확장, diagnostics dashboard 등) 이 같은 공식을
재사용 가능.

### 2.7 단위 테스트 — 44 tests (+8 P1-S9)

`packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts`:

- atlas 없음 → `[]`.
- slots 비어있음 → `[]`.
- pivot_uv 지정 슬롯 → 올바른 (x, y) + `hasPivotUv=true`.
- pivot_uv 없는 슬롯 → slot 중심 + `hasPivotUv=false`.
- `meta.parts` 에 없는 슬롯 제외 + 원래 atlas.slots 순서 보존.
- 비정사각 canvas (2048x1024) + 비정사각 stage (1024x768) — ahoge 실값
  `pivot_uv=[0.5, 0.021484375]` 회귀 고정.
- canvas 차원 0 방어 → `[]`.
- textures 빈 atlas → `[]`.

## 3. 판단 근거

- **왜 순수 함수로 분리?** 오버레이 렌더 로직을 pixi.Graphics API 에 섞어
  두면 node:test 에서 fit/origin 공식을 회귀 테스트할 수 없다. `buildSpriteScene`
  과 **한 공식** 을 공유해야 sprite 와 1 픽셀 어긋남 없이 겹치는데, 두 경로가
  coincidentally 같은 상수를 쓰고 있어도 미래에 한쪽만 바뀌면 마커가 드리프트.
  순수 함수로 단일 수식을 강제 + 8 테스트로 고정 = 드리프트 방지.
- **왜 `meta.parts` 기준으로 필터링?** atlas 는 AI 생성 variant/미사용 슬롯을
  포함할 수 있다. 현재 렌더되지 않는 슬롯에 마커를 그리면 저자가 "왜 이
  피벗은 sprite 와 무관한 위치에 뜨지?" 로 혼란. 실제 scene.meta.parts 에
  열거된 슬롯만 표시.
- **왜 default false?** P1-S9 는 **dev 도구**. 기본 브라우저 경로의 bundle
  size / 렌더 비용이 0 이어야 프로덕트 영향 없음. pixi.Container 자체를
  조건부로 생성해 tree-shake 친화.
- **왜 주입됨=빨강, fallback=회색?** 색상 대조 극대화 — 빨강은 "저자가
  찍은 peg" 의 시각적 긴급도 표현, 회색은 "정보 부재" 를 암시. 임의의 hue
  페어를 쓰면 semantic 이 흐릿.
- **왜 root 의 child 로?** root 가 stage 회전 + pivot 의 변환 기준. 마커를
  stage 기준으로 두면 head_angle_z 회전 시 마커가 따라가 **피벗 위치가
  sprite 와 함께 돈다** — "이 점을 축으로 sprite 가 회전한다" 는 시각
  피드백이 직관적.
- **왜 flag 를 `?debug=pivots` 로?** 기존 `?debug=logger` 와 동일한 네임스페이스.
  `Set` 기반 파싱으로 `?debug=logger,pivots` 조합도 자동 지원 — 저자가
  logger 이벤트 + 피벗 시각을 동시에 보고 싶을 때 URL 한 번만 수정.

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer-pixi build` — green.
- `pnpm --filter @geny/web-avatar-renderer-pixi test` — **44/44 pass** (36 기존
  + 8 신규).
- `pnpm -r test` — **fail 0** 전 패키지 (exporter-core 107 · web-editor-logic
  71 · pixi 44 · 기타 정상).
- `pnpm --filter @geny/web-editor test` — halfbody + fullbody e2e **green**.
- index.html `?debug=pivots` wire-through — `debugFlagSet` 기반 파서 정규화,
  기존 `?debug=logger` 경로 회귀 없음 (LoggingRenderer debug 스트림 테스트
  유지).

## 5. 알려진 한계

- **마커 크기 고정** — 5px / 1.5px 로 stage 크기 무관. 초고해상도 디스플레이
  (Retina 4x) 에선 상대적으로 작게 보일 수 있음. pixi 는 autoDensity 를
  적용하므로 실 화면 픽셀 기준 ~10px 로 관측됨 — 현실 사용엔 충분하지만
  4K 60% zoom 같은 극단적 케이스에 안 맞을 수 있음. 후속 후보로 `stage` 대비
  상대 비율 옵션.
- **레이블 없음** — 마커가 어느 slot 인지 텍스트로 표시하지 않음. 다수
  슬롯이 겹치면(특히 halfbody 의 eye/eyebrow 영역) 구분 어려움. `BitmapText`
  레이블 + 자동 회피 레이아웃은 후속.
- **자동 토글 불가** — URL 파라미터로 초기 활성 결정. 런타임 토글
  (키보드 단축키 등) 은 미지원. 현재 요구사항은 저작자가 "한 번 URL 열고
  검증" 하는 시나리오라 충분.
- **fullbody canvas 대응 검증 필요** — halfbody 30 슬롯은 실 브라우저에서
  밀집도 확인 완료, fullbody 38 슬롯은 단위 테스트 공식만 일치 확인. 육안
  밀집도는 사용자 세션 필요.
- **dev overlay 계약 미노출** — `PivotDebugMarker` 는 exported 지만
  `web-avatar-renderer` 계약 패키지에 올라가진 않음 (pixi 구현 상세).
  logging/null 렌더러에 비슷한 기능을 제공하려면 계약 확장 필요 — 현재는
  pixi 단독.

## 6. 다음 후보

1. **dev metrics panel (`?debug=metrics`)** — P2-S5 `__genyMetricsSink` 위에
   최근 100 이벤트 히스토그램/타임라인 UI.
2. **pivot 레이블 + 슬롯 ID 표시** — 밀집 영역 가독성.
3. **pixi motion ticker 테스트** — breath fade_in/out 램프 공식 회귀 고정.
4. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-22-P1-S8-halfbody-pivot-uv-injection.md`
  (pivot_uv 자동 주입 — 본 세션이 시각 검증 층을 추가)
- 이번 세션 변경:
  - `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`
    (`computePivotMarkerPositions` 신설 + `defaultCreateApp` 오버레이 통합
    + `debugPivots` 옵션)
  - `packages/web-avatar-renderer-pixi/src/index.ts` (새 export)
  - `packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts` (8 신규)
  - `apps/web-editor/index.html` (`?debug=pivots` URL flag + createPixiRenderer
    배선)
- 선행 계약: `packages/web-avatar-renderer/src/contracts.ts`
  (`RendererAtlasSlot.pivot_uv` — P1-S7 에서 정의)
