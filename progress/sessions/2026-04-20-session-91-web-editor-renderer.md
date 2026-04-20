# 세션 91 — `@geny/web-editor-renderer` 구조 프리뷰 + Preview Stage 합류

**일자**: 2026-04-20
**워크스트림**: Frontend / UX
**선행 세션**: 세션 81 (web-editor 스캐폴드), 세션 87 (fullbody 스위처), 세션 89 (`@geny/web-editor-logic`), 세션 90 (`<geny-avatar>.setParameter` + `parameterchange`), docs/01 §8 (`@geny/web-avatar` 런타임은 렌더러 의존성 없음)

---

## 1. 문제

세션 90 이 `<geny-avatar>` 에 `setParameter` / `parameterchange` 계약을 닫은 직후, 중앙 Preview Stage 는 여전히 세션 81 D2 에서 고정한 "placeholder — Stage 2 에선 번들 메타만 로드" 상태. Inspector 슬라이더는 상태 맵에만 써지고, **시각적 피드백** 이 없어 에디터 사용자가 자기가 무엇을 바꾼 건지 확인할 방법이 없었다.

실 Cubism/WebGL 렌더러는 별도의 파이프라인 — 쉐이더 + GLTF/moc 디코더 + 애니메이션 블렌더 — 를 요구하므로 Foundation 세션 한 개로 끝나지 않는다. 반면 "**어떤 파츠가 있고, 파라미터가 어느 축으로 움직이는가**" 를 보여주는 **구조 프리뷰** 는:

- 번들의 `meta.parts` 배열만 읽으면 충분.
- Canvas2D/WebGL 픽셀이 아닌 **SVG DOM** 으로 그리면 happy-dom 에서 어서션 가능.
- 세션 90 에서 열린 `setParameter` → `parameterchange` 이벤트를 바로 소비해 "write-through 가 실제로 화면에 닿는다" 를 증명.

세션 91 은 이 **수직 슬라이스** 를 한 번에 닫는다 — 새 패키지 스켈레톤 + 렌더러 팩토리 + 에디터 mount + e2e.

---

## 2. 변경

### 2.1 `packages/web-editor-renderer/` — 새 workspace 패키지 `@geny/web-editor-renderer@0.1.0`

- `package.json`: ESM + `main=dist/index.js` + happy-dom devDep. `private: true`.
- `tsconfig.{json,build,test}.json`: 기존 `web-editor-logic` 와 동일한 3파일 패턴 (ES2022 + NodeNext + DOM lib + strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes).
- `.gitignore`: `dist/ dist-test/ node_modules/ *.tsbuildinfo` — 세션 89 와 동일 규약.

### 2.2 `packages/web-editor-renderer/src/renderer.ts` — `createStructureRenderer` 팩토리

- **계약**:
  ```ts
  interface RendererHost extends EventTarget {
    readonly bundle?: { readonly meta: RendererBundleMeta } | null;
  }
  createStructureRenderer({ element: RendererHost, mount: Element, rotationParameter?: string })
    → { destroy(), partCount, rotationDeg }
  ```
- **docs/01 §8 보존** — `@geny/web-avatar` 에 직접 의존하지 않고 **duck-typed EventTarget** 을 받는다. `<geny-avatar>` 는 `EventTarget` + optional `bundle` getter 를 제공하므로 drop-in.
- SVG (`viewBox="0 0 400 500"`) 를 `mount` 에 주입 → `ready` 이벤트 수신 시 `meta.parts` 를 5-column grid (`CELL_W = VIEWBOX_W / 5`) 로 투영. 파츠 1개당 `<rect>` + `<text>` (role label) 생성, `data-slot-id` / `data-role` 로 태깅.
- Root group (`<g data-testid="structure-root">`) 에 `parameterchange` 이벤트 값으로 `rotate(° 200 250)` 적용 — 자동 선택된 파라미터는 `id.includes("angle")` 첫 파라미터 (명시 `rotationParameter` 지정 시 override). 비회전 파라미터 change 는 무시.
- Re-`ready` 시 SVG 내용을 비우고 재구축, `rotationDeg` 0으로 리셋 — 템플릿 스왑 시나리오 대응.
- `destroy()` — 이벤트 리스너 해제 + SVG 제거. 이후 이벤트는 무시.
- `element.bundle` 이 이미 있으면 (에디터가 `ready` 이후 renderer 를 붙이는 경우) 즉시 build.

### 2.3 `packages/web-editor-renderer/tests/renderer.test.ts` — happy-dom 회귀 6 tests

duck-typed EventTarget 호스트 + `window.CustomEvent` 디스패치로 실 `<geny-avatar>` 없이 구동.

1. `ready` 이벤트 → 6 parts 에 대해 `<rect>` 6 + `<text>` 6 생성, `data-slot-id/role` 검증.
2. `parameterchange { head_angle_x: 15 }` → `transform="rotate(15 200 250)"` + `rotationDeg=15`, 비회전 파라미터 무시.
3. 명시 `rotationParameter="body_breath"` override → `head_angle_x` 무시.
4. `host.bundle` 사전 세팅 → 즉시 build.
5. `destroy()` → SVG DOM 제거 + 이후 `ready` 무시 (partCount 동결).
6. 두 번째 `ready` → 파츠 수 갱신 + `rotationDeg` 리셋.

### 2.4 `apps/web-editor/index.html` — Preview Stage 에 renderer 장착

- `preview-hint` placeholder 제거, `.stage-inner` border `dashed → solid`, `padding 16px → 8px`.
- SVG 가 꽉 채우도록 `svg[data-testid="structure-preview"] { width: 100%; height: 100% }` 추가.
- `<geny-avatar id="avatar">` 는 `display:none` 유지 (여전히 bundle loader).
- 모듈 스크립트에 `import { createStructureRenderer } from "./public/vendor/web-editor-renderer/index.js"` 추가 → `createStructureRenderer({ element: el, mount: stageEl })` 한 줄로 장착.
- 기존 `renderParameters` 슬라이더는 `el.setParameter` 를 호출 → 렌더러가 `parameterchange` 를 구독해 회전 적용 → readout 업데이트. 루프 완결.
- 컨트롤 바 텍스트를 "Structure preview · rotation = head_angle_x" 로 갱신 (Stage 3 kick-off 표시).

### 2.5 `apps/web-editor/scripts/prepare.mjs` — 빌드 + 복사 스텝 추가

- `build @geny/web-editor-renderer` + `copy dist → public/vendor/web-editor-renderer` 두 스텝 추가 — `web-editor-logic` 과 동일 패턴.

### 2.6 `apps/web-editor/scripts/e2e-check.mjs` — renderer mount 회귀 추가

- 새 함수 `runRendererMount(bundleUrl, expect)` — happy-dom Window + `registerGenyAvatar` + `createStructureRenderer` 를 load → `<geny-avatar src=...>` 부착 → `ready` 대기.
- 어서션: `renderer.partCount === expect.partsTotal` (halfbody=29, fullbody=38), `rect` 개수, `g[data-testid="structure-root"]` 존재, `head_angle_x` 계열 파라미터에 10 을 쓰면 `rotate(10 200 250)` 적용 + `rotationDeg === 10`.
- 템플릿 루프에서 halfbody/fullbody 각각 한 번씩 — 실 번들 통과 검증.

### 2.7 `scripts/test-golden.mjs` — 25번째 step 편입

- 새 step `@geny/web-editor-renderer tests` 를 `web-editor-logic` 다음에 삽입. 골든 카운트 28 → **29**.
- web-editor e2e 항목 주석에 "세션 91 — renderer mount 어서션 추가" 기록.

---

## 3. 검증

- `pnpm -F @geny/web-editor-renderer test` — 6/6 pass (≈200 ms).
- `pnpm -F @geny/web-avatar test` — 15/15 pass (세션 90 회귀 유지).
- `apps/web-editor` e2e — halfbody + fullbody 양쪽 모두 `runRendererMount` 포함 전 스텝 pass.
- `node scripts/test-golden.mjs` — **29/29 all steps pass**.

---

## 4. 결정 축 (D1–D6)

### D1. 새 패키지 vs `@geny/web-editor-logic` 합류
- **결정**: 신규 패키지 `@geny/web-editor-renderer`.
- **이유**: logic 은 "role → category" 같은 **순수 데이터 규칙** — DOM/SVG 을 쓰지 않는다. 렌더러는 DOM 주입 + 이벤트 subscription — 성격이 다르다. 같은 패키지로 합치면 logic consumer 가 의도치 않게 DOM lib 를 끌고 오게 됨.

### D2. Canvas2D vs SVG
- **결정**: SVG.
- **이유**: (a) happy-dom 은 canvas pixel ops 미지원 → e2e 로 어서션 불가. (b) SVG 는 DOM 노드 단위 `querySelector`/`data-*` 로 어서션이 쉽고, 구조 프리뷰 목적 (파츠 그리드 + rotate) 에 충분. 실 Cubism 렌더러는 별도 canvas/GL 레이어로 추가 예정.

### D3. `@geny/web-avatar` 의존 vs duck-typed EventTarget
- **결정**: duck-typed `interface RendererHost extends EventTarget`.
- **이유**: docs/01 §8 "런타임은 렌더러 의존성 없음" 의 거울 — 렌더러도 런타임 element 를 강제로 의존하면 양방향 결합. `<geny-avatar>` 는 `EventTarget` 이니 계약만 맞으면 OK. 테스트도 실 element 등록 없이 `new window.EventTarget()` 으로 구동 가능 → 단위 테스트 격리.

### D4. rotation 파라미터 자동 선택 규칙
- **결정**: `meta.parameters.find((p) => p.id.includes("angle"))` 가 첫 후보. 명시 `rotationParameter` 로 override.
- **이유**: halfbody/fullbody 양쪽 `head_angle_x` 가 첫 "angle" 파라미터 (파라미터 순서가 그렇게 정렬됨). 휴리스틱이지만 Foundation 수직 슬라이스 목적 (rotate 가 실제로 반응한다는 걸 보여주기) 에는 충분. 세션 93+ 실 렌더러에선 파라미터 → 파츠 transform mapping 을 rig 메타에서 정식으로 읽는다.

### D5. `parameterchange` → rotate 연결을 렌더러 내부 vs `index.html` wiring
- **결정**: 렌더러 내부.
- **이유**: `index.html` 에 wiring 을 두면 e2e 가 렌더러 단독 동작을 검증하기 어렵다 (브라우저 스크립트 실행 스텁이 필요). 렌더러 팩토리가 자체적으로 이벤트를 구독하면 happy-dom 만으로 완결.

### D6. `rotationDeg` 리셋을 재-`ready` 에서
- **결정**: 재-`ready` 시 무조건 0 으로 리셋.
- **이유**: 템플릿 스왑 (halfbody ↔ fullbody) 시 이전 템플릿의 `head_angle_x` 가 새 템플릿에도 같은 의미로 유효하다 보장 없음. "번들 교체 = 상태 초기화" 가 단순하고 예측 가능. 슬라이더 UI 도 새 meta defaults 로 재시드되므로 자연스럽다.

---

## 5. 후속 (세션 92+)

- **세션 92 후보** — staging 통합 (Inspector 파츠 클릭 → 구조 프리뷰에서 해당 `rect` 하이라이트, `data-slot-id` 매칭). Preview Stage 와 Parts 사이드바가 같은 bundle 을 보되 **선택 상태** 를 양방향으로 공유.
- **세션 93 후보** — Runtime prep: `<geny-avatar>` 의 `playMotion` / `setExpression` 스텁을 해소해 motion preset 한 개라도 재생. Cubism/WebGL 실 렌더러는 별도 패키지 — Foundation 을 여는 Exit 게이트 이후 Runtime phase.
- **렌더러 확장 여력** — rotate 외 translate/scale 슬롯을 root group 대신 파츠별 `<g>` 에 적용하도록 확장하면 "파라미터 → affine transform" 매핑을 구조 프리뷰에서도 볼 수 있다. rig 메타에 transform mapping 이 들어오는 시점에 따라 갱신.

---

## 6. 인덱스 갱신

- `progress/INDEX.md` §4 롱세션에 세션 91 행 추가.
- `progress/INDEX.md` §3 Frontend 축에 "구조 프리뷰 + `parameterchange` 반영" 업데이트.
- §8 "다음 세션 후보" — 세션 92 를 staging, 93 을 runtime prep 으로 재배치.
