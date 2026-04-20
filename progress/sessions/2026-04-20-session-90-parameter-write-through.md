# 세션 90 — `<geny-avatar>` setParameter write-through (Stage 3 setter 계약 진입)

**일자**: 2026-04-20
**워크스트림**: Frontend / UX
**선행 세션**: 세션 81 (web-editor 스캐폴드 + Inspector read-only), 세션 87 (fullbody 템플릿 스위처), 세션 89 (`@geny/web-editor-logic` 단일 소스), docs/09 §4.3 (Editor UX), docs/01 §8 (@geny/web-avatar 렌더러 의존성 금지 계약)

---

## 1. 문제

세션 81 D2 가 "중앙 Stage 는 플레이스홀더, 실 렌더는 Stage 3 이후" 로 고정한 이래, Inspector 는 파츠 메타 **read-only 표시** 에서 한 발짝도 움직이지 못했다. §8 로드맵의 세션 90 후보는 "Stage 3 kick-off — 렌더러 + Inspector write-through + `<geny-avatar>` setter 계약" 두 축을 함께 묶었지만, 두 축을 한 세션에 넣으면:

1. **렌더러** — pixi.js vs three.js vs 네이티브 WebGL 선택 + `@geny/web-editor-renderer` 새 패키지 + 해피돔에서 canvas 픽셀 검증 불가 → e2e 스토리 별도 설계 필요.
2. **setter 계약** — `<geny-avatar>.setParameter` 구현 + `parameterchange` 이벤트 + Inspector 슬라이더 UI + happy-dom e2e.

두 축을 섞으면 "렌더러가 구독할 상태가 뭔지" 가 렌더러 선택에 의존하게 되고, 세션이 커진다. **setter 계약을 먼저 고정** 하면 렌더러는 이 계약 위에 얹으면 된다 — Foundation-phase 답게 DOM/상태 계약을 먼저 못 박는다.

세션 90 은 **setter 계약만** 한정 — 렌더러는 후속 세션. `element.ts` 의 `setParameter` 는 세션 23 이후로 `throw "not implemented in stage 2"` 스텁으로 남아 있었고, 이번 세션에서 실 구현 + 클램프 + 이벤트 + 에디터 UI 합류 + e2e 회귀 까지 한 번에 닫는다.

---

## 2. 변경

### 2.1 `packages/web-avatar/src/element.ts` — setter 계약 실구현

- 새 필드: `#parameters: Map<string, number>` + `#parameterRanges: Map<string, readonly [number, number]>` — 번들 `meta.parameters` 로 시드.
- 새 lifecycle: `#seedParameters(bundle)` — `ready` 이벤트 디스패치 직전에 호출. `id → default` + `id → [lo, hi]` 두 맵 초기화.
- `setParameter(id, value): number` —
  - unknown id → `WebAvatarBundleError(code="INVALID_SCHEMA")`.
  - 비유한 값 (`NaN`/`Infinity`) → 동일 에러.
  - 정상 값 → `Math.min(hi, Math.max(lo, value))` 로 클램프 → 맵 갱신 → `parameterchange` CustomEvent 디스패치 → **클램프된 값 반환**.
- `getParameters(): Readonly<Record<string, number>>` — `Object.freeze(Object.fromEntries(...))` 로 프리즈된 스냅샷.
- 새 타입 export: `GenyAvatarParameterChangeEvent = CustomEvent<{ id, value, values }>`.
- `playMotion` / `setExpression` 은 여전히 스텁 (Stage 3 렌더러 합류 이후).

### 2.2 `packages/web-avatar/tests/dom-lifecycle.test.ts` — 3개 회귀 추가

- `getParameters reflects meta defaults after ready` — 번들의 모든 parameter id 가 default 값으로 시드됐는지 전수 검증 (halfbody 46개, fullbody 60개).
- `setParameter clamps to range and fires parameterchange` — 중앙값 (클램프 없음) / 상단 초과 (hi 로 클램프) / 하단 미만 (lo 로 클램프) 세 경우 + `parameterchange.detail.{id,value,values}` 검증.
- `setParameter throws on unknown id / non-finite value` — INVALID_SCHEMA 코드 확정.

### 2.3 `apps/web-editor/index.html` — Inspector Parameters 패널

- `renderParameters(parameters, parameter_groups)` 함수 추가 — 파라미터를 `parameter.group` 로 버킷팅해 그룹 헤더 + 슬라이더 행 렌더. 각 행: `label(id) + input[type=range, min=lo, max=hi, step=0.01, value=default] + readout(default.toFixed(2))`.
- `input` 이벤트 → `el.setParameter(p.id, parseFloat(input.value))`.
- `el.addEventListener("parameterchange", ...)` → `readoutByIdRef.get(id)` 로 readout 텍스트 갱신 (클램프 반영).
- `renderInspector` 가 파츠 선택 시 `inspectorEl.replaceChildren()` 하는데, `paramSectionEl` 을 별도 DOM 노드로 보관해두고 재삽입 → 슬라이더 상태 보존.
- `swapTemplate` 에서 `paramSectionEl = null` + `readoutByIdRef.clear()` — 템플릿 교체 시 새 세트로 재렌더.
- CSS: `.params-section / .param-group / .param-row` — 기존 `.kv` 톤과 맞춤.

### 2.4 `apps/web-editor/scripts/e2e-check.mjs` — `runDomLifecycle` 확장

- `ready` 이후 `el.getParameters()` 키 수 = `meta.parameters.length` 검증.
- 첫 parameter 의 `(lo+hi)/2` 로 `setParameter` → `parameterchange` 대기 → `detail.{id,value}` + `getParameters()[id]` 반영 검증.
- `hi + 999` 입력 → 반환값이 `hi` (클램프) 검증.
- 로그: `parameter write-through: ${id} default=... → mid=... → clamped=${hi}`.

---

## 3. 검증

- `pnpm -F @geny/web-avatar test`: **15/15 PASS** (기존 12 + 신규 3).
- `node apps/web-editor/scripts/e2e-check.mjs`: ✅ halfbody(29 parts · 46 parameters) + fullbody(38 parts · 60 parameters) 양쪽 parameter write-through 검증.
  - halfbody 첫 파라미터 `arm_l_angle` range=[-30,30] default=0, mid=0 → clamped=30.
  - fullbody 첫 파라미터 `accessory_back_sway` range=[-1,1] default=0, mid=0 → clamped=1.
- `node scripts/test-golden.mjs`: ✅ all steps pass (28 steps — 세션 89 의 web-editor-logic tests 포함, 회귀 없음).

---

## 4. 주요 결정축

**D1. setter 를 `@geny/web-avatar` (런타임) 에 두고 `@geny/web-editor-logic` (에디터) 에 두지 않는다.**
- `<geny-avatar>` 는 docs/01 §8 에서 "모든 consumer 의 DOM 계약" — 에디터/Runtime 뷰어/미래 렌더러가 동일 소스를 구독해야 함. parameter **상태** 는 렌더러 의존성이 아니라 상태 계약이므로 runtime 패키지에 두는 게 맞음.
- 에디터는 이 계약에 UI 만 얹는다.

**D2. 클램프는 element 가 한다 — UI slider `min/max` 도 있지만 신뢰하지 않는다.**
- UI slider 가 range 를 준수해도 `input.value` 를 `parseFloat` 한 결과는 float 부정확으로 `hi + 1e-10` 같은 초과가 가능. 프로그래매틱 호출 (e2e / Runtime 이후 콘솔) 도 임의 값을 넣을 수 있음.
- 계약: element 가 **단일 진실 공급원** 이며 항상 범위 내 값을 갖는다 → setParameter 반환값이 실 저장 값.

**D3. `parameterchange.detail.values` 는 전체 스냅샷.**
- 하나만 바뀌어도 전체 Record 를 보내는 게 약간 비싸 보이지만, 렌더러 입장에서 "이벤트 도착 시점의 완전한 상태" 를 쥘 수 있어야 state 동기화가 단순. 이벤트 드롭/리오더 시나리오도 커버.
- freeze 해서 수신자가 실수로 쓰지 못하게.

**D4. 비유한 값 거부 — 정상 경로의 오염 방지.**
- `setParameter(id, NaN)` 을 허용해 `Math.min(hi, Math.max(lo, NaN))` → `NaN` 이 맵에 들어가면 렌더러가 영원히 깨짐. 입구에서 막는다.

**D5. 세션 90 은 렌더러를 건드리지 않는다 — 중앙 Stage 는 여전히 플레이스홀더.**
- 렌더러 라이브러리 선택 (pixi vs three vs native) + 새 패키지 격리 (`@geny/web-editor-renderer`) + canvas 픽셀 검증 e2e 설계는 별도 세션. 이번엔 계약만 고정.
- 렌더러는 `el.addEventListener("parameterchange")` 하나로 세션 90 산출물에 합류 가능 — plumbing 구조적 분리.

**D6. Inspector 슬라이더의 step = 0.01 고정.**
- 파라미터마다 min step 이 다르지만 (각도 1°, sway 0.01), UI 에선 0.01 로 통일해 "같은 세밀도" 로 조작 가능. 향후 `parameter.display_step` 같은 스키마 확장 시 교체.

**D7. Inspector 가 `replaceChildren` 할 때 `paramSectionEl` 만 재삽입.**
- 슬라이더 DOM 상태 (focus, drag) 를 보존하기 위해 같은 노드를 다시 붙인다. `readoutByIdRef` 맵도 동일한 WeakMap-like 역할 — `el.getParameter(id)` 의 readout 을 직접 가리킴.
- 파츠 선택 시 파라미터 상태가 리셋되지 않음.

**D8. e2e 는 halfbody + fullbody 양쪽에서 setParameter 호출 1회씩 검증.**
- 두 템플릿이 서로 다른 parameter 세트를 가지므로 "시드된 `#parameterRanges` 가 실제 번들을 반영했는가" 를 두 번 검증. 한 쪽 하드코딩 방지.

---

## 5. 파일 변경 요약

- `packages/web-avatar/src/element.ts` — setter 실구현 + parameterchange 이벤트 타입 export + seedParameters + getParameters.
- `packages/web-avatar/tests/dom-lifecycle.test.ts` — 세션 90 회귀 3건 추가 (총 12 → 15 tests, web-avatar 전체는 15 passing).
- `apps/web-editor/index.html` — renderParameters + parameterchange 리스너 + CSS.
- `apps/web-editor/scripts/e2e-check.mjs` — runDomLifecycle 에 write-through 블록 추가.

---

## 6. 남긴 숙제

- `@geny/web-editor-renderer` 새 패키지 — Canvas2D 또는 pixi.js 기반 실 렌더. `parameterchange` 구독. (세션 91+ 또는 staging 해제 이후.)
- Parameters 패널 그룹 헤더가 `face/body/arm/hair/...` 영문 id 를 그대로 표기 — `parameter_groups[].display_name_en` 은 이미 배선 (`groupTitleById`), ko/ja 는 스키마에 있지만 아직 안 노출 — i18n 세션 합류 시.
- `playMotion/setExpression` 여전히 스텁 — 모션은 pose3 plan + bundle motions[] 이 살아 있어 렌더러와 함께 켜야 의미가 생김.
- Pose preset dropdown (Neutral/Smile/Sad/...) — docs/09 §4.3.2 의 Preview Player 컨트롤. 렌더러 이후.
