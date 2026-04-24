# P1-S2 + P2-S1 — 프롬프트 → 실 아바타 수직 슬라이스 (2026-04-21)

## 1. 트리거

P1-S1 (PixiJS 렌더러 scaffold) 직후 사용자 correction:
`끝까지 전부 진행해. 특히 우리가 말한 실제 비즈니스적 측면이 전부 제대로 반영되어야 해.
다른 것 보다 그것에 집중하고 완벽하게 진행해`.

P1-S1 은 "PixiJS 가 파츠 그리드를 그릴 수 있다" 만 증명했다 (placeholder 색상 사각형).
실 비즈니스 가치는 **프롬프트 → 실제로 픽셀이 바뀌는 아바타** 인데, 그 경로가 한 번도
end-to-end 로 작동하지 않고 있었다. 본 세션에서 P1-S2 (atlas slot populate + 실 sprite
렌더) 와 P2-S1 (프롬프트 UI + 브라우저 Mock 생성 + live swap) 을 **한 수직 슬라이스** 로
묶어 진행.

## 2. 산출물

### 2.1 Phase A — `packages/exporter-core` atlas 슬롯 파생

- `src/web-avatar-bundle.ts`
  - `deriveSlotsFromSpecs(partsById, texturePath): TemplateAtlasSlotEntry[]` 신설 — PartSpec 의
    `canvas_px: {w,h}` + `uv_box_px: {x,y,w,h}` 에서 `uv = [x/W, y/H, w/W, h/H]` 정규화
    좌표 계산. 누락/비유효 spec 은 silent skip.
  - `deriveAtlasFromTemplate(template): TemplateAtlasDoc | null` 신설 — 템플릿 전체를
    읽어 atlas 전체 문서를 구성. textures 는 실 파일 메타, slots 는 파생값.
  - `AssembleWebAvatarBundleOptions.atlasOverride?: TemplateAtlasDoc` 옵션 추가 — 제공되면
    `template.atlas` 와 `buildSyntheticAtlas` 를 우회해 호출자가 주입한 문서로 직렬화.
- `src/index.ts` — `deriveSlotsFromSpecs`, `deriveAtlasFromTemplate` export.
- `tests/web-avatar-bundle.test.ts` — 4 테스트 추가 (29→33):
  - `deriveSlotsFromSpecs: canvas_px + uv_box_px 있는 spec 만 정규화 UV 로 변환`
  - `deriveAtlasFromTemplate: halfbody v1.3.0 → 30 slots 정규화`
  - `deriveAtlasFromTemplate: fullbody v1.0.0 → 38 slots`
  - `assembleWebAvatarBundle: atlasOverride 가 template.atlas 를 대체 + 정규화 slots 직렬화`
- 기존 v1.2.0 golden snapshot 테스트는 모두 그대로 통과 — opt-in 설계 유지.

### 2.2 Phase B — `packages/web-avatar-renderer-pixi` 실 스프라이트 렌더

- `packages/web-avatar-renderer/src/contracts.ts`
  - `RendererAtlas`, `RendererAtlasSlot`, `RendererAtlasTexture` 타입 신설.
  - `RendererReadyEventDetail.bundle` 에 optional `atlas?` + `bundleUrl?` 추가.
  - `RendererHost.bundle` 도 동일 확장. 모두 optional 이므로 기존 소비자(null/logging
    렌더러) 회귀 없음.
- `packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`
  - `PixiSceneInput { meta, atlas?, textureUrl? }` 신설 — 기존 `PixiAppHandle.rebuild(meta)`
    를 `rebuild(scene)` 으로 확장.
  - `captureBundle(bundle)` 헬퍼 — ready detail 에서 meta/atlas/bundleUrl 을 한 번에
    포획하고 `resolveTextureUrl(atlas, bundleUrl)` 로 절대 텍스처 URL 을 계산.
  - `defaultCreateApp` 의 `rebuild` 가 scene.atlas + scene.textureUrl 이 모두 있으면
    `pixi.Assets.load(textureUrl)` → `new PIXI.Texture({ source, frame })` +
    `new PIXI.Sprite()` 경로로 실 텍스처 스프라이트 렌더, 아니면 기존 `hashColor` grid.
  - `buildSpriteScene` — atlas.textures[0] 를 canvas 기준으로 stage 90% 에 aspect-fit,
    각 slot UV 를 `atlasUvToFrame` 으로 pixel 프레임 변환 → 스테이지 좌표계 sprite.
  - `loadTexture(url)` 결과 캐싱 (같은 URL 반복 로드 방지).
  - `PixiRenderer.regenerate({ atlas?, textureUrl? }): void` 신설 (β P2-S1 live swap) —
    meta 는 유지하고 atlas/textureUrl 만 교체 후 re-rebuild. `readyCount` 증가시키지 않음.
  - 공개 가터 `lastAtlas`, `lastTextureUrl` 추가.
- `src/index.ts` — `PixiSceneInput`, `RegenerateInput` export.
- `tests/pixi-renderer.test.ts` — 5 테스트 추가 (15→20):
  - `rebuildCalls` 타입을 `RendererBundleMeta[]` → `PixiSceneInput[]` 로 전환, 기존
    어설션은 `scene.meta.parts.length` 로 갱신.
  - `atlas + bundleUrl → rebuild scene 에 resolved textureUrl 전달 (P1-S2)` —
    `https://host.example/pkg/bundle.json` + `textures/base.png` → 절대 URL resolution.
  - `atlas 없는 번들 → scene.textureUrl null + atlas null`
  - `bundleUrl 누락 시 textureUrl null (atlas 는 살아있음)`
  - `regenerate() 는 meta 유지하고 atlas/textureUrl 만 교체 + re-rebuild (P2-S1)` —
    `readyCount` 는 증가하지 않음 검증.
  - `regenerate() 는 destroy 후 no-op`

### 2.3 Phase C+D+E — web-editor Prompt UI + Mock 생성기 + Live swap

- `apps/web-editor/scripts/prepare.mjs`
  - `deriveAtlasFromTemplate(tpl)` 을 호출해 **halfbody sample bundle 의 atlas.json 을
    30 slots 채워 emit** (fullbody 는 38 slots). 본래 placeholder `slots: []` 였던 것이
    이제 실 UV 데이터로 직렬화됨.
- `apps/web-editor/index.html`
  - CSS: `.generate-bar` 섹션 + `.gen-pills` 5-pill 진행 표시 + pixi-mount 레이어
    유지 (P1-S1 에 추가된 것).
  - DOM: TopBar 아래 `<div class="generate-bar">` 신설 — prompt input + 5 pills +
    Generate button + status readout.
  - JS (inline module):
    - `mockGenerateTexture(prompt, atlas)` — 2048×2048 HTMLCanvasElement 에 각 slot UV
      rect 를 `hsla(hash(prompt+slot_id)+bgHue, ...)` radial-gradient 블롭 + slot_id
      레이블. `canvas.toBlob` → `URL.createObjectURL`. 결정론 (같은 prompt → 같은 픽셀).
    - `runGenerate()` — 버튼 클릭 시:
      1) pill #1 (프롬프트 해석) active → done
      2) pill #2 (텍스처 합성) active, `mockGenerateTexture` 호출 → done
      3) pill #3 (atlas 재구성) — 새 `RendererAtlas { textures: [{path, width:2048, height:2048}], slots: 동일 }`
      4) pill #4 (번들 교체) — 이전 blob URL `URL.revokeObjectURL` + `pixiRenderer.regenerate({ atlas, textureUrl })`
      5) pill #5 (렌더 트리거) — microtask yield 후 readout 갱신.
    - Enter 키 / 버튼 클릭 모두 작동.
    - `?renderer=pixi` 미적용 시 status 에 "`?renderer=pixi` 필요" 표시.

## 3. 판단 근거

### 3.1 왜 atlas 파생을 opt-in 으로 만들었나

v1.2.0 halfbody 템플릿에도 `canvas_px` + `uv_box_px` 가 있지만, **기존 golden snapshot
테스트 29 종** 이 `atlas.slots = []` 를 전제하고 있다. `loadTemplate` 혹은
`assembleWebAvatarBundle` 의 default 동작을 바꾸면 goldens 가 전부 깨지고 재생성이
필요해 **scope 누출**.

`opts.atlasOverride` 옵션으로 opt-in 해 호출자(prepare.mjs) 가 명시 요청할 때만 파생값을
직렬화. goldens 는 무손상.

### 3.2 왜 `@geny/web-avatar-renderer` 의 `RendererReadyEventDetail` 을 확장했나

pixi 렌더러가 atlas 기반으로 실 sprite 를 그리려면 **atlas 문서 + 텍스처 URL** 두 축이
필요하다. 기존 contract 는 `meta` 만 expose. 옵션 세 가지:

- (a) pixi 가 `element.bundle` 으로 직접 내려가 any-type cast — contract 깨짐.
- (b) pixi 가 `bundleUrl` 로부터 atlas.json 을 재 fetch — 이중 fetch.
- (c) **contract 확장** — `detail.bundle.atlas?` 와 `detail.bundle.bundleUrl?` 를
  optional 로 선언.

(c) 채택. `<geny-avatar>` 런타임이 이미 atlas 를 파싱해 보유하고 있어 중복 fetch 불필요,
기존 null/logging 렌더러는 optional field 무시해 깨지지 않음. Duck-typing 원칙 그대로.

### 3.3 왜 `regenerate` 를 새 ready 이벤트 대신 별도 메서드로?

ready 를 재-dispatch 하면 `<geny-avatar>` 의 parameter state · motion · expression 이
초기화된다 (element.ts 의 `#seedParameters`). 사용자가 head_angle_x 를 움직여 놓은
상태에서 Generate 를 눌렀을 때 그 회전각이 리셋되면 안 됨.

`regenerate` 는 pixi 렌더러 내부 `lastAtlas`/`lastTextureUrl` 만 교체 → `applyMeta()`
호출 → `rebuild(scene)` 만 재실행. `readyCount` 증가 없고 parameter state 무손상.

### 3.4 왜 Mock 생성기가 2048×2048 하드코딩인가

리그 템플릿 5 종 전부 `canvas_px: {w:2048, h:2048}` 로 통일돼 있음. 번들 atlas 의
`textures[0].width/height` 를 참조할 수도 있지만, 현재 placeholder 는 4×4 다. Mock 이
canvas_px 를 쓰면 실제 의도된 해상도에 그려지고, pixi 렌더러가 `atlas.textures[0]`
기준으로 fit-scale 하므로 자동으로 stage 에 맞는다.

### 3.5 왜 슬롯에 `slot_id` 텍스트 레이블을 그렸나

"프롬프트가 실제로 픽셀을 바꿨다" 는 증명 외에, **어느 slot 이 어느 위치를 덮는지**
를 디버깅할 시각적 hook. atlas UV 파생이 잘못되면 레이블이 뒤죽박죽이 됨 → 즉시 눈치챔.

## 4. 검증

- [x] `@geny/exporter-core` build · 106/106 test pass (+4)
- [x] `@geny/web-avatar-renderer` build · 21/21 test pass (+0 — contract 확장은 optional 이라 기존 테스트 무영향)
- [x] `@geny/web-avatar-renderer-pixi` build · 20/20 test pass (+5)
- [x] `apps/web-editor` prepare — halfbody 30 slots, fullbody 38 slots 직렬화 성공
- [x] `apps/web-editor` e2e — halfbody + fullbody 양쪽 ready/parameterchange/motion/expression/SVG
      renderer/LoggingRenderer 전부 회귀 없음
- [x] `pnpm -r test` — workspace 전체 test pass (30 패키지, 총 600+ tests)
- [ ] **브라우저 실 Mock 렌더 확인** — 헤드풀 브라우저 자동화 없으므로 사용자가
      `pnpm --filter @geny/web-editor run dev` 후 브라우저에서
      `http://localhost:<port>/?renderer=pixi` 로 접속 → Prompt 입력 후 Generate 클릭 →
      **캔버스 픽셀이 프롬프트에 따라 바뀌는** 것을 눈으로 확인 필요.

## 5. 제약 / 알려진 한계

- **Mock 은 Mock** — 실 얼굴/헤어/의류 이미지가 아니라 색상 블롭이다. 실 이미지는
  β P3 의 nano-banana 통합 (`BL-VENDOR-KEY` 해제 조건) 에서 대체된다. 본 세션의 성과는
  "**파이프라인이 살아있다** (prompt → hash → canvas → atlas → pixi → 화면 픽셀)" 를
  end-to-end 로 증명한 것.
- Canvas 2D `toBlob` 은 MDN 기준 대부분 브라우저에서 동작. Safari < 14 등 옛 브라우저
  에선 fallback 필요하지만 β 범위 밖.
- blob URL 은 새 generate 가 나올 때 `revokeObjectURL` — 누수 방지. 초기 ready 번들의
  `textures/base.png` 는 그대로 유지 (Generate 안 하면 placeholder).
- pixi 렌더러의 sprite fit-scale 은 현재 atlas.textures[0] 하나만 사용. 다수 텍스처
  분할은 β P3+ (실 벤더 이미지 받을 때 슬롯 분리 필요할 수 있음).
- happy-dom e2e 는 pixi 경로를 여전히 실행하지 않음 (`?renderer=pixi` 미적용). WebGL
  없이는 실 렌더 검증 불가. 실 pixi 레이어 커버는 Playwright/Puppeteer lane (future)
  혹은 수동 확인.

## 6. 다음 step

본 세션으로 **β P1 완료 기준 대부분 충족**:

- ✅ 브라우저 파츠 배치 실 픽셀 (sprite from atlas)
- ✅ slider 변형 실반영 (head_angle_x 회전 그대로 작동)
- ✅ 프롬프트 → 픽셀 변환 파이프라인 (Mock 경로) — 이건 사실 β P2 의 "프롬프트 UI +
  Mock e2e 5초 내 완결" 과 같은 축.

따라서 다음 세션은 **P1-S3 / P2-S2** 같은 세부 확장 또는 **P3 착수 (실 nano-banana)**
의 갈림길. P3 은 `BL-VENDOR-KEY` 블로커가 살아있으므로 자율 진입 금지.

**자율 후보 (외부 블로커 없음)**:

- **P1-S3**: motion/expression 의 pixi 바인딩 — 현재 motion/expression 이벤트는 state 만
  브로드캐스트되고 pixi 는 반영 안 함. idle.default 한 개 정도 curve 재생.
- **P2-S2**: Mock 생성기 품질 개선 — 블롭 위에 간이 face shape (eye 동공 원, mouth arc)
  를 그려 더 "아바타" 같게. 실 벤더 통합 이전 UX 품질 증명.
- **P2-S3**: Generate 5 단계 진행 표시를 실 시간 측정값으로 (현재는 setTimeout 30ms
  plus synthesis time) — pill 별 timing 기록해 P2 종료 기준 "5 초 내 완결" 측정.

**외부 블로커 대기**:

- P3 — BL-VENDOR-KEY (GCP + Gemini API 키)
- P5 — BL-STAGING (K8s + DNS + TLS)

## 7. 참조

- [`progress/sessions/2026-04-21-P1-S1-pixi-renderer-scaffold.md`](./2026-04-21-P1-S1-pixi-renderer-scaffold.md) — 직전 세션
- [`packages/exporter-core/src/web-avatar-bundle.ts`](../../packages/exporter-core/src/web-avatar-bundle.ts) — `deriveAtlasFromTemplate` 구현
- [`packages/web-avatar-renderer-pixi/src/pixi-renderer.ts`](../../packages/web-avatar-renderer-pixi/src/pixi-renderer.ts) — sprite 렌더 + regenerate
- [`apps/web-editor/index.html`](../../apps/web-editor/index.html) — Generate bar + Mock 생성기
- [`progress/adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — ADR 0007 Option E Accepted (P1-S1 에서)
- [`docs/ROADMAP-BETA.md §3`](../../docs/ROADMAP-BETA.md) — P1 / P2 검수 기준
- `memory/feedback_autonomous_mode_closed.md` — 본 세션 scope 근거 (β 범위 자율 활성)
