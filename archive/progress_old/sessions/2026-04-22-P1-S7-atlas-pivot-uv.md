# P1-S7 — atlas `pivot_uv` 확장: hair/ahoge 실 피벗 (2026-04-22)

## 1. 트리거

P1-S5 에서 sprite.anchor 를 `(0.5, 0.5)` 로 고정해 Cubism 3 축 회전/이동을
통일했다. 이 결정으로 body/face 같은 bbox 중심 기준 파츠는 자연스럽게
회전했지만, **머리 위 장식(ahoge, 더듬이)** 이나 **머리카락 윗부분** 은
여전히 sprite bbox 중심 기준으로 회전해 시각적으로 어색했다:

- ahoge 가 head_angle_z (roll) 회전 시 sprite 중심을 축으로 도는 탓에,
  끝단이 얼굴 아래로 내려오는 순간이 생김 — 물리적으로 머리 정수리가
  고정되어야 자연스럽다.
- halfbody v1.3.0 / fullbody v1.0.0 저자가 Cubism 에서 실제로는 파츠별
  pivot 을 지정해 저작했는데, Foundation 기간엔 이 정보가 atlas JSON 에
  실리지 않아 렌더러가 복원 불가.

β 제품 정의 상 "Cubism 저작 의도를 웹에서 재현" 이 핵심 약속(PRODUCT-BETA
§3~§4). pivot 정보가 atlas 를 통과해야 P3 (실 벤더) 단계에서 hair/ahoge 가
의도대로 움직인다. 선제적으로 optional 계약을 열어둬야 P3~P4 때 풀 rebuild
없이 점진 migration 가능.

## 2. 산출물

### 2.1 Schema — `schema/v1/atlas.schema.json`

`slots.items.properties` 에 optional field 추가:

```json
"pivot_uv": {
  "type": "array",
  "minItems": 2,
  "maxItems": 2,
  "items": { "type": "number", "minimum": 0, "maximum": 1 },
  "description": "(β P1-S7) 회전/스케일 피벗의 정규화 UV 좌표 [u, v] (0..1 전체 텍스처 기준). 있으면 pixi 렌더러가 sprite.anchor 와 위치를 이 UV 가 slot 내 어디에 해당하는지로 계산한다. 미지정 시 slot UV 중심이 피벗(호환)."
}
```

기존 atlas 는 필드 자체가 없어 validator 통과 (backward-compatible).

### 2.2 Contract — `@geny/web-avatar-renderer`

`RendererAtlasSlot` 에 `readonly pivot_uv?: readonly [number, number]` 추가.
계약 패키지는 런타임 코드 없음 원칙을 유지(타입만 확장).

### 2.3 Loader — `@geny/exporter-core`

`TemplateAtlasSlotEntry` 에 `pivot_uv?: [number, number]` 추가. 기존 atlas
파일 로드 경로 무변경 — 필드가 없으면 undefined 전달.

### 2.4 Pure function — `resolvePivotPlacement()`

`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` 에서
sprite anchor/position 계산을 순수 함수로 분리:

```ts
export function resolvePivotPlacement(params: {
  slot: { uv: readonly [number, number, number, number]; pivot_uv?: readonly [number, number] };
  frame: { x: number; y: number; width: number; height: number };
  canvasW: number;
  canvasH: number;
  fit: number;
  originX: number;
  originY: number;
}): { anchorX: number; anchorY: number; spriteX: number; spriteY: number } {
  const [u0, v0, u1, v1] = params.slot.uv;
  const centerU = (u0 + u1) / 2;
  const centerV = (v0 + v1) / 2;
  const pivotU = params.slot.pivot_uv?.[0] ?? centerU;
  const pivotV = params.slot.pivot_uv?.[1] ?? centerV;
  const du = u1 - u0;
  const dv = v1 - v0;
  const anchorX = du > 0 ? (pivotU - u0) / du : 0.5;
  const anchorY = dv > 0 ? (pivotV - v0) / dv : 0.5;
  const spriteX = params.originX + pivotU * params.canvasW * params.fit;
  const spriteY = params.originY + pivotV * params.canvasH * params.fit;
  return { anchorX, anchorY, spriteX, spriteY };
}
```

- `pivot_uv` 미지정 시 formula 상 anchor = (0.5, 0.5), position = slot 중심
  → 기존 P1-S5 behavior 와 **완전히 동일** (수학적으로 증명, 테스트로 고정).
- `pivot_uv` 가 slot 바깥이어도 (예: ahoge 가 slot 위쪽 머리 정수리가 피벗)
  동작 — anchorY 가 0~1 범위 밖으로 외삽되어 sprite 가 정확히 해당 UV
  지점을 축으로 회전.

`applyMeta` 내부의 sprite 생성 루프에서 직접 호출하도록 교체:
sprite.anchor.set(x, y), sprite.position.set(...) 두 줄이 계산 결과를 사용.

### 2.5 Package export — `packages/web-avatar-renderer-pixi/src/index.ts`

`resolvePivotPlacement` 를 named export — 외부 테스트/디버거에서 동일
수식을 재계산할 필요가 있을 때 (dev overlay 등) 재사용.

### 2.6 Tests — 36 tests (+3 P1-S7)

- `pivot_uv` 없으면 slot 중심 — anchor ≈ (0.5, 0.5), position = slot 중심
  UV (기존 behavior 회귀 테스트).
- `pivot_uv` = 슬롯 우상단 → anchor = (1, 0), position = 우상단 UV.
- `pivot_uv` 가 슬롯 **바깥 위쪽** (ahoge 케이스) → anchorY = 2 로 외삽,
  position 은 텍스처 UV 기준 절대 좌표.

모든 테스트 green: `pnpm --filter @geny/web-avatar-renderer-pixi test` 36/36.
`pnpm -r test` 전체 fail 0.

## 3. 판단 근거

- **왜 optional 필드인가?** halfbody v1.0.0~v1.3.0 / fullbody v1.0.0 atlas
  는 이미 고정 — 필수 필드 추가하면 기존 5 템플릿 모두 재저작 필요 +
  validator 실패. optional 로 열어두고 **새 export 파이프** 가 점진 주입.
- **왜 UV 기준(캔버스 0..1) 인가, slot-local (0..1) 이 아닌?** 저자는 Cubism
  에서 텍스처 전체를 보면서 peg(pivot) 을 찍는다. 캔버스 UV 가 저작 공간과
  일치. slot-local 로 저장하면 저자는 매 슬롯의 UV 원점을 빼는 암산을 해야
  해 저작 오류율 상승.
- **왜 pixi 구현체에서 formula 로 slot-local anchor 계산하는가?** pixi
  Sprite.anchor 가 sprite-local 0..1. 캔버스 UV → slot-local 변환을 렌더러가
  떠맡아 계약은 캔버스 UV 단일 공간. 계산은 초당 수회(regenerate 시점)라
  비용 무시.
- **왜 순수 함수로 분리?** apply 경로에 inline 하면 테스트 밀도가 낮음.
  `resolvePivotPlacement` 단일 유닛으로 분리하면 DOM/pixi 없이도 수식 검증
  가능 — 이번에 3 테스트로 고정.
- **왜 `anchorX` 외삽 허용 (slot 바깥)?** ahoge 가 실제로 그런 케이스. Pixi
  sprite.anchor 는 값 범위를 강제하지 않음 — (anchor > 1) 이면 sprite 가
  anchor 기준 왼쪽/위로 렌더. 수식을 clamp 하면 ahoge 가 잘못 고정.

## 4. 검증

- `pnpm --filter @geny/web-avatar-renderer build` — green.
- `pnpm --filter @geny/web-avatar-renderer-pixi build` — green.
- `pnpm --filter @geny/web-avatar-renderer-pixi test` — **36/36 pass** (이전
  33 + P1-S7 3).
- `pnpm -r test` — **fail 0** (19/20 workspace, web-editor 예상된 1).
- `validate-schemas.mjs` (monorepo test 안에서 실행) — atlas schema 244
  check 통과.

## 5. 알려진 한계

- **실 atlas 파일에는 아직 pivot_uv 미주입**. 본 세션은 **계약 + 렌더러 경로**
  만 완성. halfbody/fullbody atlas JSON 에 실제 pivot_uv 를 채우는 작업은
  별도 세션 (저자 + export 파이프라인 양쪽 수정 필요). 현재 behavior 는
  backward-compatible 이라 기능 퇴화 없음.
- **pivot_uv 범위 검증 약함**. schema 상 `[0, 1]` 제약이지만 ahoge 같은
  바깥 피벗을 허용하려면 범위를 풀어야 할 수 있음 — 현실 저작 패턴이
  쌓이면 재검토. P3 실 벤더 합류 후 분포 측정 권장.
- **회전 외 scale/shear 미지원**. pivot_uv 는 scale 축에도 쓰이지만, P1-S5
  까지의 per-part transform 은 offsetX/offsetY/rotation 만 — scale 축
  확장은 P4+ motion pack 합류 시.
- **dev overlay 부재**. pivot 점이 올바르게 잡혔는지 시각 디버깅 가능한
  `?debug=pivots` 오버레이가 있으면 저자 피드백 사이클이 빨라짐. 후속 후보.

## 6. 다음 후보

1. **metric 단위테스트** — `__genyMetricsSink` 주입으로 P2-S4 emit 경로 회귀 고정.
2. **dev metrics panel** — `?debug=metrics` 로 최근 100 이벤트 히스토그램.
3. **실 atlas 에 pivot_uv 주입** — halfbody v1.3.0 ahoge/hair 슬롯 먼저 시범.
4. **`?debug=pivots` 오버레이** — pivot 위치 시각 확인용 dev 전용 마커.
5. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-21-P2-S4-telemetry-hook.md`
- 계약: `packages/web-avatar-renderer/src/contracts.ts` (RendererAtlasSlot.pivot_uv)
- 스키마: `schema/v1/atlas.schema.json` (pivot_uv)
- 구현: `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts` (resolvePivotPlacement + applyMeta)
- 테스트: `packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts` (3 신규)
- 선행: `progress/sessions/2026-04-21-P1-S5-sprite-pivot-and-axis-split.md`
