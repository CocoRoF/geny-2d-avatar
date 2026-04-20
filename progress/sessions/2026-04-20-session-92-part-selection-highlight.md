# 세션 92 — 파츠 선택 ↔ Preview 하이라이트 양방향 바인딩

**일자**: 2026-04-20
**워크스트림**: Frontend / UX
**선행 세션**: 세션 91 (`@geny/web-editor-renderer` SVG 구조 프리뷰 mount), 세션 90 (`<geny-avatar>.setParameter`), 세션 81 (에디터 스캐폴드 + Parts 사이드바 read-only), docs/09 §4.3

---

## 1. 문제

세션 91 에서 Preview Stage 에 SVG 구조 프리뷰가 합류했고, 세션 81 이후 Parts 사이드바는 파츠 리스트 + `aria-selected` 클릭 상태를 가지고 있었지만, **두 UI 가 서로의 선택을 모른다**. 사이드바에서 파츠를 골라도 Preview 는 반응하지 않고, Preview 의 어느 `<rect>` 가 해당 파츠인지 시각적으로 확인할 방법도 없었다. Stage 3 의 최종 UX — "내가 지금 어떤 파츠를 편집하는지" 피드백 — 가 아직 닫히지 않은 상태.

세션 81 D4 에서 미뤘던 "선택 상태 공유" 는 구조 프리뷰가 mount 된 지금이 가장 자연스러운 타이밍. 사이드바 → Preview 와 Preview → 사이드바 양방향 바인딩을 한 세션에서 닫는다.

---

## 2. 변경

### 2.1 `packages/web-editor-renderer/src/renderer.ts` — 선택 API 확장

- `StructureRendererOptions` 에 `onSelectPart?: (part | null) => void` 옵션 추가 — 사용자가 SVG `<rect>` 를 클릭할 때마다 발화. 같은 slot 재클릭은 선택 해제(`null` 전달).
- `StructureRenderer` 반환 인터페이스에 `selectedSlotId: string | null` getter + `setSelectedSlot(slotId | null): void` API 추가.
- 내부 맵 `rectsBySlot` / `partsBySlot` — 선택 전환 시 이전 rect 의 스타일 원상복구, 다음 rect 를 하이라이트.
- 선택 시 rect 스타일 전환: fill `#eef4ff → #fff1e0`, stroke `#2b4a8b → #ff7a00`, stroke-width `0.5 → 2`, `data-selected="true"` 추가.
- 각 rect 에 `click` 리스너 + `cursor: pointer` 스타일. 겹치는 `<text>` 는 `pointer-events: none` 으로 클릭을 rect 에 전달.
- **echo 방지 계약**: `setSelectedSlot()` 은 **콜백을 호출하지 않는다**. 사이드바가 선택을 밀어넣을 때 자기 자신에게 다시 전파되는 루프를 차단.
- 재-`ready` 시 `partsBySlot/rectsBySlot` 재초기화 + `selectedSlotId=null` 리셋. `destroy()` 가 세 상태 모두 비운다.
- 존재하지 않는 slot_id 에 대한 `setSelectedSlot` 호출은 무시 (현재 상태 유지).

### 2.2 `packages/web-editor-renderer/tests/renderer.test.ts` — 4 tests 추가 (6 → 10)

- `setSelectedSlot highlights matching rect` — 프로그래매틱 선택 3 경로 (slot_2 → slot_0 → null) + unknown slot_id 무시.
- `rect click → onSelectPart callback` — 클릭 이벤트가 콜백 발화 + 재클릭 시 null 전달.
- `setSelectedSlot does NOT fire onSelectPart` — echo 방지 계약 회귀.
- `rebuild on ready clears selection` — 템플릿 스왑 시 선택 리셋.

### 2.3 `apps/web-editor/index.html` — 사이드바 ↔ Preview 와이어링

- `partNodeBySlot = new Map()` — slot_id → `{ li, part, cat }` 역조회. `renderParts` 에서 채우고 `swapTemplate` 에서 clear.
- `createStructureRenderer` 호출에 `onSelectPart` 콜백 전달 — part 가 전달되면 `partNodeBySlot.get(slot_id)` 로 사이드바 li 를 찾아 `selectSidebarEntry({fromRenderer: true})` 호출.
- 기존 `selectPart(node, part, cat)` → `selectSidebarEntry(node, part, cat, { fromRenderer })` 로 개편. 단일 진입점에서 `clearSidebarSelection` + `aria-selected` + `renderInspector` + 조건부 `renderer.setSelectedSlot` (fromRenderer=false 일 때만) 수행.
- 사이드바 li click 리스너 → `selectSidebarEntry(li, p, cat, { fromRenderer: false })` — 자체 선택 + renderer 에게 전파.
- echo 루프 방지: renderer 는 프로그래매틱 setSelectedSlot 에 콜백을 안 쓰고, 에디터는 `fromRenderer=true` 분기에서 `renderer.setSelectedSlot` 을 다시 호출하지 않는다. 양쪽 모두 단일 엣지에서 끊김.

### 2.4 `apps/web-editor/scripts/e2e-check.mjs` — 선택 round-trip 회귀

`runRendererMount` 확장:

- renderer 를 `onSelectPart: (part) => selectCalls.push(part)` 로 장착.
- 프로그래매틱: `renderer.setSelectedSlot(firstSlot)` → `selectedSlotId === firstSlot` + `rect[data-selected="true"]` 정확히 1 + **`selectCalls.length === 0`** (echo 방지).
- 사용자 클릭: 두 번째 slot 의 rect 에 `new window.Event("click", {bubbles: true})` 디스패치 → 콜백 1회 발화 + 하이라이트 이동.
- 재클릭 → null 콜백 + 선택 해제.
- 로그 1줄에 "selection round-trip (firstSlot → secondSlot → null)" 추가.

halfbody: `accessory_back → accessory_front → null`
fullbody: `acc_belt → accessory_back → null`

---

## 3. 검증

- `pnpm -F @geny/web-editor-renderer test` — 10/10 pass (6 기존 + 4 신규, ≈200 ms).
- `apps/web-editor` e2e — halfbody + fullbody 양쪽 모두 round-trip 어서션 포함 전 스텝 pass.
- `node scripts/test-golden.mjs` — **29/29 all steps pass** (step 수 불변, 기존 step 내부 회귀 4+ 추가).

---

## 4. 결정 축 (D1–D5)

### D1. 선택 API 를 콜백 vs CustomEvent
- **결정**: 생성자 옵션의 `onSelectPart` 콜백.
- **이유**: renderer 는 이미 `element: EventTarget` 을 쓰므로 자체적으로 또 다른 EventTarget 을 노출하면 consumer 가 두 곳에서 이벤트를 구독해야 함. 콜백 1개는 (a) 타입 추론 (정확한 payload) (b) echo-back 시맨틱 (`setSelectedSlot` 은 콜백 안 호출) 을 구분하기 쉽다. 일반적인 React 패턴 친화적.

### D2. echo 방지를 호출자 규약 vs 라이브러리 규약
- **결정**: 라이브러리 규약 — `setSelectedSlot` 은 **절대** `onSelectPart` 를 호출하지 않는다.
- **이유**: 양방향 바인딩에서 echo 루프 (A→B→A→...) 는 일반적인 함정. 호출자 규약 ("플래그로 막아달라") 으로 두면 각 consumer 마다 재발견, 규약 위반 시 조용히 무한 루프. 라이브러리에서 못 박는 쪽이 안전. 사이드바 → renderer 전파는 "프로그래매틱" 이라는 의미 그대로.

### D3. 선택 재클릭 → 해제 vs 유지
- **결정**: 해제 (toggle).
- **이유**: 단일 파츠를 깊이 보다가 전체 구조로 돌아갈 때 "비선택" 상태가 자연스럽다. 사이드바도 `aria-selected="false"` 로 되돌릴 수 있어야 함. 프로그래매틱 `setSelectedSlot(null)` 과 동일 경로.

### D4. rect 하이라이트를 CSS class vs inline attribute
- **결정**: inline attribute 5개 (+ `data-selected`).
- **이유**: happy-dom 은 CSS class 를 SVG attribute 로 반영하지 않아 e2e 어서션이 복잡해짐. `setAttribute("stroke", ...)` 는 DOM 레벨 속성이므로 `querySelector('rect[data-selected="true"]')` 로 직접 검증 가능. 실 브라우저 rendering 도 inline 이 최우선이라 안전.

### D5. e2e 에서 `Event.click` 디스패치 vs 직접 `rect.click()`
- **결정**: `dispatchEvent(new window.Event("click", { bubbles: true }))`.
- **이유**: SVG `<rect>` 에는 HTMLElement 의 `click()` helper 가 없음 (happy-dom 한정일 수도). `Event` 를 `bubbles: true` 로 만들면 리스너가 rect 자체에 직접 달린 경우도, 부모 전파도 모두 커버 — 실 브라우저 동작과 동일.

---

## 5. 후속 (세션 93+)

- **세션 93 후보** — 실 staging 배포 (cluster access 확보 후) — 세션 91 §8 에서 슬라이드.
- **세션 94 후보** — Runtime 전환 선행: `<geny-avatar>.playMotion` / `setExpression` 스텁 해소, motion preset 최소 1개 재생. Cubism/WebGL 실 렌더러는 Foundation Exit 이후 Runtime phase.
- **렌더러 확장 여력** — 선택 상태가 있으니 Inspector 편집 모드 (role 리네임, slot_id regenerate) 와 자연스럽게 묶일 후보. 다만 rig-template 이 진실 공급원이라 편집은 template-authoring 파이프라인 스코프 → Foundation 범위 밖.

---

## 6. 인덱스 갱신

- `progress/INDEX.md` §4 롱세션에 세션 92 행 추가 (§4 의 newest-first 정렬).
- `progress/INDEX.md` §3 Frontend 축에 "파츠 선택 양방향" 업데이트.
- §8 "다음 세션 후보" — 세션 93/94 로 roll.
