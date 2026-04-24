# P1-S8 — halfbody/fullbody 전 파츠 `pivot_uv` 자동 주입 + P1-S7 uv 포맷 회귀 수정 (2026-04-22)

## 1. 트리거

P1-S7 에서 `atlas.slots[i].pivot_uv` optional 필드를 계약 + 렌더러 경로에
열어뒀으나 **실 번들 atlas.json 에는 아직 미주입** 상태였다 (P1-S7 §5
한계). β PRODUCT §3~§4 의 "Cubism 저작 의도를 웹에서 재현" 약속을 지키려면
halfbody v1.3.0 (30 파츠) · fullbody v1.0.0 (38 파츠) atlas 에 실제 peg 좌표
가 실려야 한다.

저자는 이미 part spec 의 `anchor.x_frac / y_frac` (slot-local 0..1) 로 각
파츠의 피벗을 기록해뒀다 — ahoge 는 `(0.5, 0.05)` (정수리 바로 위), hair_front
는 `(0.5, 0.22)` (이마 약간 위) 등. P1-S8 은 이 값을 캔버스 UV 로 환산해
`atlas.slots[i].pivot_uv` 로 노출하는 exporter 경로를 추가한다 — 파츠별
수작업 없이 한 번의 exporter 수정으로 68 파츠 전부가 자동으로 올바른 pivot
을 얻는다.

동시에 P1-S8 준비 과정에서 P1-S7 `resolvePivotPlacement` 이 `atlas.json` 의
`uv` 포맷을 오해석하던 회귀를 발견해 함께 고친다 — 저장 포맷은 `[x, y, w, h]`
(정규화) 이지만 P1-S7 은 `[u0, v0, u1, v1]` 로 구조분해해 slot 중심 fallback
이 실제 bbox 의 "끝점" 을 쓰고 있었다. pivot_uv 가 주입된 지금은 이 버그가
시각 퇴화로 드러나므로 지금 고친다.

## 2. 산출물

### 2.1 Exporter — `@geny/exporter-core / deriveSlotsFromSpecs`

`packages/exporter-core/src/web-avatar-bundle.ts` 의 `deriveSlotsFromSpecs`
에 anchor → pivot_uv 변환을 추가 (기존 로직 변경 없음, `pivot_uv` 만 append):

```ts
const entry: TemplateAtlasSlotEntry = {
  slot_id: slotId,
  texture_path: texturePath,
  uv: [x / W, y / H, w / W, h / H],
};
const anchor = spec["anchor"] as { x_frac?: unknown; y_frac?: unknown } | undefined;
if (anchor) {
  const xFrac = Number(anchor.x_frac);
  const yFrac = Number(anchor.y_frac);
  if (Number.isFinite(xFrac) && Number.isFinite(yFrac)) {
    entry.pivot_uv = [(x + xFrac * w) / W, (y + yFrac * h) / H];
  }
}
slots.push(entry);
```

- `x_frac / y_frac` 은 저자 편의상 slot-local (0..1, slot UV 내 상대) 이지만
  `pivot_uv` 는 캔버스 UV (P1-S7 계약) 이므로 `(box.x + x_frac*box.w) / W`
  로 환산.
- anchor 필드 자체가 없거나 두 축 중 하나라도 숫자가 아니면 필드 생략 —
  pixi 렌더러는 slot 중심으로 fallback (P1-S5 동작 완전 동일).
- `x_frac / y_frac` 값은 slot 바깥(예: ahoge y_frac=0.05 는 slot 상단보다
  위에 있음) 도 허용 — `Number.isFinite` 만 게이트.

### 2.2 Bug fix — `resolvePivotPlacement` uv 포맷

`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`:

```diff
-  const [u0, v0, u1, v1] = params.slot.uv;
-  const centerU = (u0 + u1) / 2;
-  const centerV = (v0 + v1) / 2;
+  // atlas.json slot uv 형식은 `[x, y, w, h]` (정규화 0..1, x/y 가 좌상단, w/h 가 크기).
+  // P1-S7 초판이 `[u0, v0, u1, v1]` 로 잘못 해석해 fallback center 가 어긋났던 것을
+  // P1-S8 에서 교정 — pivot_uv 지정 경로의 공식은 폭/높이 기반이 원래 맞아 결과 동일.
+  const [u0, v0, w, h] = params.slot.uv;
+  const centerU = u0 + w / 2;
+  const centerV = v0 + h / 2;
   const pivotU = params.slot.pivot_uv?.[0] ?? centerU;
   const pivotV = params.slot.pivot_uv?.[1] ?? centerV;
-  const du = u1 - u0;
-  const dv = v1 - v0;
-  const anchorX = du > 0 ? (pivotU - u0) / du : 0.5;
-  const anchorY = dv > 0 ? (pivotV - v0) / dv : 0.5;
+  const anchorX = w > 0 ? (pivotU - u0) / w : 0.5;
+  const anchorY = h > 0 ? (pivotV - v0) / h : 0.5;
```

왜 드러나지 않았나: P1-S7 테스트가 같은 잘못된 컨벤션으로 작성돼 자기
일관됐기 때문. `pivot_uv` 가 있는 경로의 공식 `(pivot - u0) / w` 은 (w 를
폭으로 해석하든 u1 좌표로 해석하든 u1 == u0+w 이므로) 결과가 같아 **pivot_uv
지정 경로는 원래 맞았다**. 변형된 것은 fallback center 계산 뿐이며, halfbody
에 실 pivot_uv 가 주입되지 않은 P1-S7 당시엔 모든 경로가 fallback 이었기에
오히려 대량 회귀로 보일 수 있었는데 — 테스트도 같은 오류를 공유해 invisible
이었다.

### 2.3 Pixi 렌더러 테스트 — `[x, y, w, h]` 컨벤션으로 교정

`packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts` 의 3 P1-S7
테스트를 올바른 컨벤션으로 재작성:

- **no pivot_uv**: `uv: [0.2, 0.1, 0.6, 0.5]` → centerU=0.5, centerV=0.35,
  anchor=(0.5, 0.5), spriteX/Y = origin + centerUV · canvas · fit.
- **top-right pivot**: `pivot_uv: [0.8, 0.1]` → slot uv `[0.2, 0.1, 0.6, 0.5]`
  → anchor = ((0.8-0.2)/0.6, (0.1-0.1)/0.5) = (1.0, 0.0).
- **ahoge-style outside pivot**: `uv: [0.4, 0.0, 0.2, 0.1]`, `pivot_uv: [0.5, 0.2]`
  → anchor = ((0.5-0.4)/0.2, (0.2-0.0)/0.1) = (0.5, 2.0) — slot 밖 아래쪽.

부동소수점 비교는 `Math.abs(a - b) < 1e-9` 패턴 (`0.5000000000000001` 같은
IEEE 754 drift 회피).

### 2.4 exporter 테스트 — anchor → pivot_uv 단위 + 실 템플릿 회귀

`packages/exporter-core/tests/web-avatar-bundle.test.ts`:

**신규 단위 테스트** (`deriveSlotsFromSpecs`):

- `anchor: { x_frac: 0.5, y_frac: 0.05 }` + slot `uv_box_px: {864, 32, 320, 240}` +
  canvas 2048 → `pivot_uv = [(864 + 0.5·320)/2048, (32 + 0.05·240)/2048]` =
  `[0.5, 0.021484375]` (halfbody ahoge 실 값).
- `anchor` 필드 없는 spec → `pivot_uv` 필드 자체 생략 (키 비존재).
- `anchor: { y_frac: 0.1 }` (x_frac 누락) → `pivot_uv` 생략 — 부분 anchor 방어.

**회귀 테스트 확장** (`deriveAtlasFromTemplate`):

- halfbody v1.3.0 **30 slots 전부** `pivot_uv` 존재. ahoge 값
  `[0.5, 0.021484375]` 정확 일치.
- fullbody v1.0.0 **38 slots 전부** `pivot_uv` 존재. 동일 ahoge 값 (두
  템플릿이 동일한 canvas_px/uv_box_px/anchor 를 공유).

### 2.5 번들 자동 반영 — `apps/web-editor/public/sample/*/atlas.json`

`apps/web-editor/scripts/prepare.mjs` 가 이미 `deriveAtlasFromTemplate(tpl)`
를 `atlasOverride` 로 주입하는 경로를 가지고 있어, exporter 만 고치면 번들
빌드가 자동으로 새 atlas 를 생성. 검증:

- `public/sample/halfbody/atlas.json` → `pivot_uv` 30 건 (ahoge 블록 `[0.5,
  0.021484375]` 확인).
- `public/sample/fullbody/atlas.json` → `pivot_uv` 38 건.

pipeline 골든 (`packages/exporter-pipeline/tests/pipeline.test.ts`, halfbody
v1.2.0) 은 영향 없음 — `runWebAvatarPipeline` 은 `assembleWebAvatarBundle` 에
atlas override 를 안 넘기고 `template.atlas` 를 그대로 쓰므로
`deriveSlotsFromSpecs` 를 통과하지 않음. v1.2.0 저장 atlas 에는 pivot_uv 가
없고 schema 가 optional 이라 validator 도 통과.

## 3. 판단 근거

- **왜 exporter 일괄 주입인가, 저자 수동 JSON 편집이 아니라?** halfbody
  30 + fullbody 38 = 68 파츠를 저자가 atlas.json 에 손으로 찍으면 오타 위험
  + 저자는 part spec 과 atlas 중복 관리. 이미 part spec 의
  `anchor.x_frac/y_frac` 이 저작 Ground Truth — exporter 가 단일 변환
  규칙으로 파생하면 Foundation 의 "하나의 진실 공급원" 원칙 유지.
- **왜 지금 P1-S7 uv 버그를 같이 고치는가?** pivot_uv 가 주입되는 순간
  fallback 경로 (slot 중심 계산) 가 **드디어 호출되지 않는 경로로 바뀐다.
  하지만 스키마상 optional 이라 future atlas (custom peg 없는 AI 생성
  슬롯 등) 는 여전히 fallback 으로 돈다** — 버그가 P1-S8 직후부터 잠재
  회귀로 남음. 같은 commit 에서 제거.
- **왜 테스트와 코드가 같은 오류를 공유했는데 Foundation 게이트는 green
  이었나?** P1-S5 까지는 `pivot_uv` 개념이 없었고 anchor 는 `(0.5, 0.5)`
  로 하드코딩. P1-S7 에서 공식이 새로 도입됐지만 **실 pivot_uv 데이터가
  없어 fallback 만 돌았다** — fallback 수식의 실수치가 정확한 센터와
  어긋났어도 "해당 센터 근처" 였고 시각상 허용. 데이터 경로를 열어야 가시
  회귀가 된다.
- **왜 x_frac/y_frac 값 범위를 검증하지 않는가?** ahoge y_frac=0.05 는
  실제로 slot 상단보다 위 (정수리 방향) — slot-local 0..1 clamp 를 걸면
  저작 의도 파괴. P1-S7 에서 이미 결정: pivot UV 는 slot 바깥 외삽 허용.
- **왜 `x_frac` 만 있고 `y_frac` 없는 partial anchor 는 생략하는가?** 두 축
  모두 저자가 명시적으로 찍었을 때만 의미 있음. 한 축만 있으면 다른 축의
  대응 기본값을 정할 근거가 없음 — slot 중심 fallback 이 안전.

## 4. 검증

- `pnpm --filter @geny/exporter-core test` — **107/107 pass** (P1-S2 기존
  테스트 전부 유지 + 신규 1 + halfbody/fullbody 골든 2 확장).
- `pnpm --filter @geny/web-avatar-renderer-pixi test` — **36/36 pass**
  (P1-S7 교정 후 회귀 없음).
- `pnpm --filter @geny/exporter-pipeline test` — **10/10 pass** (v1.2.0 골든
  sha256 유지 — pipeline 은 derive 경로 미사용).
- `pnpm -r test` — **fail 0** 전 패키지.
- `pnpm --filter @geny/web-editor test` — **e2e halfbody + fullbody pass**.
- `public/sample/{halfbody,fullbody}/atlas.json` pivot_uv 카운트 30 / 38 확인.

## 5. 알려진 한계

- **x_frac/y_frac 가 없는 파츠** — 현 템플릿은 모두 채워져 있으나 AI 생성
  atlas (P4) 는 anchor 없이 slot 만 올 수도 있음. 그 경로는 fallback 으로
  동작하므로 기능 퇴화 없음 — 단지 pivot 이 정확하지 않음. P3~P4 합류 후
  분포 관측 필요.
- **시각 검증 미자동화** — Foundation 의 CI 는 sha256 골든 + e2e 텍스트만
  확인, 픽셀 회귀 테스트는 없음. `?debug=pivots` dev 오버레이 (P1-S7 §5
  후속 후보) 가 있으면 저자가 육안으로 바로 확인 가능. 후속 세션.
- **anchor.type 필드 미소비** — part spec 의 `anchor.type` / `detect_method`
  는 P1-S8 에서 무시. 저자 의도가 "head_top_center" 인지 "scalp_center" 인지
  metadata 로 남기는 용도일 뿐, 계산엔 x/y_frac 만 사용.
- **v1.0.0~v1.2.0 legacy atlas** — pivot_uv 없음 (당연). 해당 버전으로
  번들 빌드 시 fallback (slot 중심) 만 적용. 본 phase β 스코프엔 해당 없음.

## 6. 다음 후보

1. **`?debug=pivots` dev 오버레이** — pivot 위치 시각 확인 (저자 피드백
   루프).
2. **dev metrics panel** — P2-S5 에서 고정한 `__genyMetricsSink` 위에
   `?debug=metrics` 로 최근 N 이벤트 히스토그램.
3. **pixi sprite motion/expression 실 렌더 회귀** — head_angle_z roll 시
   ahoge/hair 시각 동작 자동 회귀 (픽셀 hash 또는 anchor 위치 assertion).
4. **P3 실 nano-banana** — BL-VENDOR-KEY 해제 대기.

## 7. 참조

- 이전 세션: `progress/sessions/2026-04-22-P1-S7-atlas-pivot-uv.md`
  (계약/렌더러/스키마 확장)
- 이번 세션 변경:
  - `packages/exporter-core/src/web-avatar-bundle.ts:202-247`
    (`deriveSlotsFromSpecs`)
  - `packages/exporter-core/tests/web-avatar-bundle.test.ts:310-400` (신규
    단위 + 골든 확장)
  - `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts:385-405`
    (`resolvePivotPlacement` uv 포맷 교정)
  - `packages/web-avatar-renderer-pixi/tests/pixi-renderer.test.ts`
    ([x,y,w,h] 컨벤션 재작성)
- 재빌드 경로: `apps/web-editor/scripts/prepare.mjs:145`
  (`deriveAtlasFromTemplate` 자동 주입)
- 저작 Ground Truth: halfbody/fullbody part spec 의 `anchor.x_frac / y_frac`
  필드 (rig-templates/base/halfbody/v1.3.0/parts/*, fullbody/v1.0.0/parts/*)
