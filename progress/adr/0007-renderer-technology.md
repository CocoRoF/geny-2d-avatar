# ADR 0007 — 브라우저 런타임 렌더러 기술 선택

- **Status**: **Accepted — Option E (hybrid, PixiJS primary → 자체 런타임 GA)**
- **Date**: 2026-04-21 Draft (세션 113), 2026-04-21 Accepted (β 로드맵 P1-S1 시점에 사용자 "제대로 진행해" 지시 + 본 ADR 권장 기본값 승계)
- **Deciders**: geny-core
- **관련 문서**: `docs/01-vision-and-goals.md`, `docs/02-system-architecture.md` §3/§6, `docs/08-validation-and-rendering.md` §4, `docs/11-export-and-deployment.md` §3, `docs/13-tech-stack.md` §2.2
- **관련 ADR**: [0002](./0002-schema-first-contract.md) (schema-first), [0004](./0004-avatar-as-data.md) (참조형 아바타), [0005](./0005-rig-authoring-gate.md) (저작 게이트)
- **관련 세션**: 90 (`setParameter` contract), 91/92 (web-editor-renderer SVG 프리뷰), 94 (motion/expression 스텁), 105 (web-avatar 번들 골든 승격), 112 (rig-template-lint L2 포화)

> **이 ADR 의 목적**: 후보 F (Runtime 전환 착수) 진입 *이전에* 사용자 / PM 이 읽고 결정할 수 있도록 네 후보를 정렬한다. Decision 은 아직 공란이다 — "Accepted" 로 승격되는 시점은 사용자 리뷰 + Spike 결과를 반영한 별도 커밋이다.

---

## Context

Foundation 단계 (세션 1~112) 는 `<geny-avatar>` 커스텀 엘리먼트의 **상태 계약 + 이벤트 플러밍** 만 구현했다. 실제 픽셀 출력은 두 가지 모의 층으로 대체돼 있다:

- `@geny/web-avatar` — `ready` / `parameterchange` / `motionstart` / `expressionchange` 이벤트만 디스패치. 렌더 없음. happy-dom 테스트 20 개로 라이프사이클만 회귀 (`packages/web-avatar/src/element.ts:55-207`).
- `@geny/web-editor-renderer` — `<geny-avatar>` 에 구독해서 SVG 격자를 그리는 **구조 프리뷰** (파츠를 색 블록으로 나열, angle 파라미터에 따라 root group rotate). Cubism/WebGL 픽셀은 없다 (`packages/web-editor-renderer/src/renderer.ts:1-266`).

후보 F (Runtime 전환) 에서 이 두 층을 합쳐 **실 Cubism/WebGL 렌더러** 로 교체해야 하지만, 무엇으로 교체할지가 결정돼 있지 않다. 늦게 결정하면 다음 3 가지 위험:

1. **번들 스키마와의 매핑 불일치** — 우리 `web-avatar.json` (ADR 0002 schema-first) 은 `parts[]` / `parameters[]` / `motions[]` / `expressions[]` 을 중립 형식으로 노출한다. 선택한 렌더러가 이 중립 형식에서 멀리 떨어진 native 구조를 요구하면 변환 층 비용이 새 워크스트림이 된다 (예: Cubism Web SDK 는 `.moc3` 바이너리를 요구).
2. **라이선스 잠김** — 브라우저 렌더러 선택이 제품 전 페이지에 퍼진 뒤 교체하면 UX-facing 코드 다수가 동시 수정된다. 라이선스 조건이 뒤늦게 문제되면 rollback 난이도 급증.
3. **Export/Viewer 와의 책임 경계 혼선** — Cubism SDK 는 **Export 축** (docs/02 §6.3, docs/11 §3) 에선 1st-class 이지만 **브라우저 프리뷰 축** 에서는 옵션이다. 둘이 같은 라이브러리여야 한다는 가정이 암묵적으로 스며들면 결정이 왜곡된다.

`docs/13-tech-stack.md §2.2` 는 이미 **WebGL2 우선, PixiJS β / 자체 미니 런타임 GA** 라는 잠정 방향을 기록하고 있다 (해당 문서 파일에 pending ADR 이름 `adr/0013-pixijs-vs-own-mini-renderer.md` 가 존재). 본 ADR 은 그 잠정안을 옵션 비교표로 승격시키고, Cubism Web SDK 를 한 개 옵션으로 병렬 배치해 네 방향을 한 곳에서 저울질한다. 저장소 번호 관행을 따라 파일명은 `0007-renderer-technology.md` 로 통일 — docs/13 의 pending 번호(0013)는 예전 잠정치이므로 본 커밋에서 함께 반영한다.

### Scope / Non-goals

본 ADR 의 결정 범위:

- **In-scope**: 브라우저에서 `@geny/web-avatar` + `@geny/web-editor-renderer` 가 쓸 **런타임 드로잉 기술** (파츠 메쉬 드로우 / 파라미터 → 디포머 → 버텍스 변형 / 모션 커브 보간 / 표정 블렌드).
- **Out-of-scope (다른 ADR/문서로)**:
  - **서버 Headless Renderer** (docs/08 §4, 검수 파이프라인) — 서버 사이드 GL context + 배치. 후보 기술이 다르다 (node-gl, playwright-driven rendering, Puppeteer + WebGL, Skia 등). 본 ADR 이 고정하지 않는다.
  - **Cubism Export 포맷 지원** (docs/11 §3.2, `.moc3` / `.model3.json` / `.exp3.json` / `.motion3.json` 생성) — Cubism 은 Export 타겟으로서 반드시 유지. 브라우저 런타임 렌더러가 Cubism 이 아니어도 Export 축에는 영향 없음.
  - **모바일 네이티브 / Unity / Unreal** — docs/11 §5 이후 범위.

### 현재 번들 계약 (렌더러가 소비해야 할 입력)

`packages/web-avatar/src/types.ts:62-76` 의 `WebAvatarJson`:

- `parameters[]` — `{ id, range:[min,max], default, group, channel? }`. 29 ~ 49 개 (halfbody v1.0.0~v1.3.0) / 59 개 (fullbody v1.0.0).
- `parts[]` — `{ slot_id, role, parameter_ids? }`. 27~38 개. `deformation_parent` (리그 측 필드) 는 번들에는 이미 트리 평탄화로 흡수 (ADR 0005 L4).
- `motions[]` — `{ pack_id, duration_sec, fade_in_sec, fade_out_sec, loop }`. 실 curve 는 별도 asset.
- `expressions[]` — `{ expression_id, name_en, fade_in_sec, fade_out_sec }`. parameter delta 는 asset.
- `textures[]` + `atlas` + `physics_summary`.

렌더러는 이 데이터를 **변환 없이 직접** 먹는 게 이상적 (ADR 0002 schema-first 의 취지). Cubism 은 `.moc3` 바이너리 ↔ 위 스키마 사이 **양방향 변환** 이 필요하다는 점이 본 결정의 가장 큰 축이다.

---

## Options

네 방향을 병렬로 평가한다. 각 옵션의 "피트(fit)" 은 현재 번들 계약과 프로젝트 제약(라이선스, 팀 규모, Foundation-exit 이후 일정)에 대한 상대 적합도를 의미.

### Option A — **PixiJS v8** (검증된 2D WebGL/WebGPU 엔진, MIT)

- **렌더 모델**: scene-graph + Sprite/Mesh/Filter. WebGL2 기본, WebGPU 베타. mesh deformation 은 `SimpleMesh` + 버텍스 배열 수동 갱신 또는 `SimplePlane`/`MeshRope`.
- **번들 매핑**: `parts[]` → `Sprite`/`Mesh`. `parameters[]` → 자체 상태 → per-frame vertex recompute. `motions[].duration_sec` 은 외부 tweening (`@pixi/tweener` 또는 자체). Cubism 의 디포머 트리 semantic 은 우리가 **직접 재구현** — PixiJS 는 deformer 개념 없음.
- **라이선스**: MIT. 비용 0.
- **팀 러닝커브**: 중간. Pixi v8 API 변경폭 있음, 하지만 문서/커뮤니티 풍부.
- **번들 크기**: `@pixi/app` + `@pixi/mesh` 필요 분만 셰이크하면 ~120~180 KB gzip.
- **검증 경로**: 세션 97 의 Spike 1 세션 (Pixi Stage + 텍스처 1 장 + slider 1 개).
- **Fit 평가**: 🟢 **중상**. scene-graph 가 우리 `parts[]` 와 직관적 매핑. 약점은 deformer/warp/회전 디포머 체인 — 이는 Pixi mesh 수준에서 **자체 구현** 해야 함 (Live2D 의 `Warp Deformer` / `Rotation Deformer` / `Glue` 세 종류 중 우리가 실제로 쓰는 건 subset — halfbody/fullbody 에 warp 가 과반).

### Option B — **Three.js r160+** (3D 엔진, MIT)

- **렌더 모델**: scene-graph + Mesh/Material/Shader. 본질은 3D 이지만 2D orthographic + z-order 로 우회 가능. mesh deformation 은 `BufferGeometry` + `setAttribute('position', ...)` 수동 갱신 또는 morph targets.
- **번들 매핑**: Pixi 와 유사. Three 는 3D 우선이라 2D 만 쓰기 위해 camera/ortho setup boilerplate 추가. `morphTargetInfluences` 가 **expression blend** 와 자연 매핑 ─ 이게 Three 의 유일한 강점.
- **라이선스**: MIT.
- **팀 러닝커브**: 중상. 3D 개념(camera, light — off 가능) 이해 필요.
- **번들 크기**: tree-shaken 핵심 ~150~200 KB gzip.
- **Fit 평가**: 🟡 **중**. 2D 도메인에서 3D 엔진을 쓰는 건 기능 과잉. 우리가 활용할 유일한 3D 자산 (morph target expression blend) 은 Pixi + 자체 구현으로도 쉽게 재현. 유사 프로젝트 사례 적음.

### Option C — **Cubism Web SDK** (Live2D Inc. 공식 웹 런타임, 상용 라이선스)

- **렌더 모델**: `.moc3` 바이너리 + `.model3.json` 메타 → 내장 디포머/파라미터 평가기. Cubism Editor 의 리그를 **그대로** 재생.
- **번들 매핑**: **변환 어댑터 필수**. 우리 스키마 ↔ `.moc3` 는 단방향 (export) 으로만 정렬돼 있음 (docs/11 §3.2). 런타임 렌더를 Cubism 으로 하려면 런타임에 `.moc3` + `.model3.json` 이 번들에 **함께** 들어가야 하고 exporter-pipeline 에 새 step 추가 — ADR 0005 L4 확장 필요.
- **라이선스**: [Live2D Cubism SDK License Agreement](https://www.live2d.com/en/sdk/license/). 개인/소규모(매출 기준 무료) vs 상용은 별도 계약 및 연간 라이선스 비용. 상업적 SaaS 가 **과금 대상**. 비용 미공개 (벤더 견적). 종속성 위험 = 높음.
- **팀 러닝커브**: SDK 자체는 간단. 하지만 `.moc3` 생성이 Cubism Editor 숙련 또는 moc-build CLI (SDK 포함) 에 의존 — 이미 docs/01/docs/14 의 "Cubism 숙련자 희귀" 전제를 재도입하는 셈.
- **번들 크기**: Core(WASM, ~300 KB) + Framework + 모델당 moc3(수백 KB).
- **Fit 평가**: 🔴 **낮음**. (i) 라이선스 비용·종속, (ii) 우리 "avatar-as-data" 철학(ADR 0004) 과 충돌 — 진실은 우리 schema 가 아니라 `.moc3` 가 되고 schema 는 파생물로 격하, (iii) Export 축은 유지되므로 Web SDK 를 런타임에 쓸 필연성 없음. **단, Cubism editor 에서 만든 아바타를 불러와 보여주는 "Import view"** 가 제품 기능으로 필요하면 본 옵션은 **부분 채택 (Viewer 전용)** 가능.

### Option D — **자체 WebGL2 미니 런타임** (licence-free, 패키지 의존 0)

- **렌더 모델**: 최소 WebGL2 context + 우리 번들 스키마 1:1 매핑 셰이더. deformer 트리 평가기 / parameter 블렌더 / motion curve 재생 전부 자작. draw call = 파츠당 triangle fan / atlas uv.
- **번들 매핑**: 🟢 **최적**. 번들 포맷 그대로 소비. 스키마 변경 시 렌더러만 수정.
- **라이선스**: 자체. 비용 0, 통제 100%.
- **팀 러닝커브**: **매우 높음**. WebGL2 직접, 셰이더 작성, 성능 튜닝, 모바일/iOS Safari 대응. Live2D 의 deformer 수학 (warp blend, rotation deformer, physics 통합) 도 우리가 구현.
- **번들 크기**: ~30~50 KB gzip 가능 (스코프 제한 시).
- **Fit 평가**: 🟡 **중**. GA 목표로는 이상적 (docs/13 §2.2 GA 전환 언급). β 단계 직진은 **리스크 과도** — 3~6 개월 Spike + 1~2 명 풀타임 engineer 필요.

### Option E — **하이브리드 (A + D)**: Pixi β → 자체 GA

`docs/13-tech-stack.md §2.2` 의 잠정안이 사실상 이 경로. β 에선 PixiJS 로 빠른 수직 슬라이스 구축, GA 전에 자체 런타임으로 치환.

- **장점**: 리스크 분산. β 납기 지킴. 초기 UX-facing 코드가 Pixi 의존에 물들지 않도록 **렌더러 인터페이스를 우리 계약으로 먼저 고정** 하면 교체 비용이 관리 가능.
- **단점**: 두 렌더러를 두 번 작성한다. 교체 시점을 놓치면 Pixi 고착. 인터페이스 경계를 초반에 안 잡으면 Pixi 내부 타입이 애플리케이션에 누수.
- **실현 조건**: 세션 N 의 첫 Spike 부터 `packages/web-avatar-renderer/` 같은 **인터페이스 패키지** 를 먼저 만들고 PixiJS 구현은 `packages/web-avatar-renderer-pixi/` 로 분리. `<geny-avatar>` 는 인터페이스만 import.

---

## Decision

**Option E (하이브리드) — Accepted.** β 로드맵 P1 (실 픽셀 렌더) 진입 시점에 권장 기본값을
승격. 근거:

- 본 ADR 의 Options 섹션이 이미 Option E 를 "권장 기본값" 으로 평가.
- β 납기를 지키면서 (Option A/E 의 "빠름" fit), GA 에서 외부 의존 0 의 선택지(Option D)를
  유지할 수 있는 유일한 경로.
- 인터페이스 선분리 원칙 (Consequences §공통) 이 이미 `@geny/web-avatar-renderer` (세션 114)
  로 충족됐으므로, Option E 의 리스크 ("렌더러 교체 시 UX-facing 코드 누수") 가 최소화된
  상태.

## 구현 경로

1. **Primary β 렌더러**: `packages/web-avatar-renderer-pixi/` (PixiJS v8, MIT) — 세션 P1-S1
   에서 scaffold + 파츠 그리드 구조 프리뷰 합류. `?renderer=pixi` query flag 로 opt-in.
2. **계약 분리**: `packages/web-avatar-renderer/` 의 `RendererHost` / `Renderer` duck-typed
   인터페이스만 의존. PixiJS 타입은 구현체 내부에만 머무름 — 미래 자체 런타임 전환 시 계약
   수정 없이 구현체만 교체 가능.
3. **SVG 구조 프리뷰 유지**: `@geny/web-editor-renderer` 는 default 렌더러 + 클릭
   interaction 전담. pixi 합류 후에도 회귀 디버그 층으로 남음 (Consequences §공통 약속 준수).
4. **GA 전 Spike**: 자체 WebGL2 런타임 (Option D) 을 별도 패키지로 시험할 시점은 β 검수
   통과 이후 판단 — 본 ADR 에서는 고정 일정을 두지 않음.

Option B (Three.js) / C (Cubism Web SDK) 는 reject. Option D 직진은 reject (β 납기 불확실).

---

## Consequences

### 공통 (어떤 옵션이든)

- `packages/web-avatar/` 는 **렌더 독립** 계약 (ADR 0004 "참조형 아바타" 정신) 을 유지해야 한다. 현재 `element.ts` 가 `ready`/`parameterchange`/`motionstart`/`expressionchange` 만 노출하는 상태는 이 원칙과 일치 — 렌더러가 합류해도 이 4 이벤트를 **삭제/변경하지 않는다**.
- 새 패키지 `@geny/web-avatar-renderer-<impl>` 신설 권장. `<geny-avatar>` 에 직접 렌더러를 박으면 A/B/D/E 경로가 서로 섞여 교체 비용 급증.
- 세션 91/92 의 `@geny/web-editor-renderer` (SVG 구조 프리뷰) 는 **삭제하지 않는다** — 픽셀 렌더 없이도 구조를 확인하는 디버그 층으로 유지하면 Runtime 회귀 디버깅에 도움.

### 옵션별

| 옵션 | 번들 크기 | 라이선스 | 초기 구현 속도 | GA 까지 위험 | 교체 비용 |
|---|---|---|---|---|---|
| A Pixi | 중 (~150KB) | MIT | **빠름** | 중 (세부 튜닝) | 중 |
| B Three | 중상 (~180KB) | MIT | 보통 | 중 | 중 |
| C Cubism | 대 (~500KB+) | **상용** | 중 | 벤더 종속 | 대 |
| D 자체 | **소** (~40KB) | 없음 | **매우 느림** | 고 (인력 3~6mo) | 소 |
| E 하이브리드 | → D 로 수렴 | MIT → 자체 | **빠름** β / 중 GA | 중 | **설계 비용** 전가 |

### 정해지면 열리는 후속 작업

- **인터페이스 패키지 추출 세션**: 택일 전에도 가능. `RendererBundleMeta` / `ready`/`parameterchange` 구독자 쪽을 재사용 가능한 shape 로 뽑는다. 현재 `web-editor-renderer/src/renderer.ts:15-54` 가 duck-typed 로 이미 잘 설계돼 있어 대부분 그대로 승격 가능.
- **Spike 세션 (옵션별 1 세션씩)**: halfbody v1.3.0 번들 1 개 + 회전 파라미터 1 개 + 파츠 텍스처 1 장 → 스크린에 픽셀이 찍히는가. 4 옵션에 대해 순차 진행 시 4 세션.
- **렌더러 합류 후 관측**: 기존 Prometheus `geny_queue_*` 와 병렬로 `geny_render_*` (frame_time_ms_histogram, dropped_frame_total) 신설이 Runtime N 의 정리 대상.

---

## Open Questions

1. **Cubism 에셋 Import** 기능이 제품 요구 spec 에 들어가는가? 들어가면 Option C 의 부분 채택(Viewer 전용) 이 불가피. 답: **PM 의견 필요**.
2. **모바일/iOS Safari 지원** 타임라인? WebGL2 는 iOS 15+ 필요. WebGL1 fallback 이 docs/13 에 언급되지만 범위 미정. 답: **제품 범위 결정** 선행.
3. **Server Headless Renderer (docs/08 §4) 와의 코드 공유** 정책? 두 층이 다른 기술이어도 OK 인가? 공유 의무가 있으면 Option A/D 에서 서버 사이드 GL context 가능성까지 포함해 재평가. 답: **docs/08 저자 팀 합의** 필요.
4. **성능 목표**: 에디터 프리뷰 목표 fps (60 / 30 / 적응형), 파츠 한계 (50 / 100 / 200). 답: **UX 팀 합의** 필요.

---

## Follow-ups

- [x] 사용자 / PM 리뷰 → Decision 확정 → 본 ADR Status "Accepted" 로 승격 + 커밋. (2026-04-21 P1-S1)
- [x] 결정된 경로의 Spike 세션 예약. 산출물 = 하나의 번들 + 하나의 파라미터 슬라이더 → 회전하는 파츠 한 개. (P1-S1: `packages/web-avatar-renderer-pixi` scaffold + `?renderer=pixi` 에디터 통합, head_angle_x 회전 바인딩, 파츠 그리드 구조 프리뷰)
- [ ] P1-S2: 실 atlas 슬롯 populate 후 `PIXI.Sprite` 교체 (`atlasUvToFrame` 이 UV 변환 담당).
- [ ] `docs/13-tech-stack.md §2.2` 재작성 — 잠정 문구 ("택1") 를 본 ADR 결정으로 대체. pending ADR 이름 `adr/0013-pixijs-vs-own-mini-renderer.md` 를 ADR 0007 로 리디렉트.
- [ ] 서버 Headless Renderer 별도 ADR 후보 (0008 또는 docs/08 §4 확장).
- [ ] Cubism Import Viewer 를 제품 범위에 포함할지 결정 → Open Question #1 해소.
