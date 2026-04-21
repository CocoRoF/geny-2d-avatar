# ADR 0007 — Option 별 코드 영향 범위 예상 diff 노트

- **작성**: 세션 120 (2026-04-21), 자율 모드 대안 후보 (c)
- **상태**: **Pre-decision prep note** — ADR 0007 Decision 공란 상태에서 사용자 pick 직후 follow-up 세션이 즉시 진입 가능하도록 옵션별 코드 영향 범위를 사전 나열한다.
- **전제**: 세션 113 ADR 0007 Draft + 세션 114~115 `@geny/web-avatar-renderer` 계약/구현체 + 세션 116 web-editor wire-through 까지의 현 상태.
- **비고**: 본 노트는 **추정치** — Spike 가 끝나기 전엔 실 diff 규모가 바뀔 수 있다. 노트 자체가 결정물이 아니므로 사용자 pick 전까지 renamable / deletable.

---

## §0. 목적과 사용법

사용자가 ADR 0007 의 5 옵션 중 하나로 경로를 확정하는 시점에, 본 노트가 4 가지 구체적 질문에 즉답한다:

1. **어느 패키지가 새로 생기는가** (workspace 디렉터리 추가 범위).
2. **기존 파일 중 편집이 필요한 곳은 어디인가** (touch list — PR 범위 산정).
3. **golden 30 step 이 몇 step 늘어나는가** (CI 영향).
4. **런타임/타입 계약이 깨지는 지점이 있는가** (BC 여부).

각 옵션 섹션 말미에 **Critical path sequence** 를 두어, 확정 직후 세션 1~N 에 무엇을 순서대로 하면 되는지 기록.

---

## §1. 공통 기반 (모든 옵션 진입 전 존재)

세션 114~116 의 산출물은 ADR 0007 어떤 경로를 가도 **재사용** — 이 섹션은 고정축.

| 축 | 위치 | 상태 |
|---|---|---|
| Renderer 계약 | `packages/web-avatar-renderer/src/contracts.ts` | `RendererPart` / `RendererBundleMeta` / `RendererHost` / `RendererReadyEventDetail` / `RendererParameterChangeEventDetail` + `isRendererBundleMeta` / `isRendererParameterChangeEventDetail` 가드 + `Renderer` 베이스 (destroy only) |
| Null 구현체 | `packages/web-avatar-renderer/src/null-renderer.ts` | 테스트 더블 — 상태 tracking 만 |
| Logging 구현체 | `packages/web-avatar-renderer/src/logging-renderer.ts` | NullRenderer 위임 + logger-only 리스너 + discriminated union `LoggingRendererEvent` |
| Structure 구현체 | `packages/web-editor-renderer/src/renderer.ts` | SVG 구조 프리뷰 (픽셀 아님) — Runtime 에서도 **디버그 층으로 유지** (ADR 0007 Consequences) |
| Event source | `packages/web-avatar/src/element.ts` | `<geny-avatar>` — `ready` / `parameterchange` / `motionstart` / `expressionchange` + `setParameter` / `playMotion` / `setExpression` |
| Wire-through | `apps/web-editor/index.html` (dynamic import `?debug=logger`) + `apps/web-editor/scripts/prepare.mjs` (dist copy) | 옵션 확정 후 신규 구현체도 동일 패턴으로 late-attach |
| Golden | `scripts/test-golden.mjs:126-127` (`web-avatar-renderer` / `web-editor-renderer` tests) | 신규 구현체 추가 시 패키지당 1 step 추가 예상 |

### 1.1 불변 원칙 (어떤 옵션이든 어기면 설계 붕괴)

- `<geny-avatar>` 는 **렌더러 의존 0** 유지 (docs/01 §8 + ADR 0004 정신). 렌더러 패키지에 이벤트 리스너로 붙는 구조.
- 가드는 **shape-only** — semantic 검증은 JSON Schema 로 위임 (ADR 0002). 신규 구현체가 range tuple 순서 같은 semantic 을 재검증하면 중복이며 가드/schema 책임 혼선.
- Renderer 베이스는 **작게 유지** — `partCount` / `rotationDeg` 같은 확장 readout 은 구현체별 인터페이스로 (세션 115 D1 원칙).
- Structure Renderer 와 Runtime Renderer 는 **병존** — 교체 아님. Runtime 합류해도 SVG 디버그 층은 삭제 금지.

---

## §2. Option A — PixiJS v8 고정

### 2.1 신규/확장 패키지

| 패키지 | 역할 | 의존 |
|---|---|---|
| `packages/web-avatar-renderer-pixi/` **(신규)** | Pixi 드라이버 — `createPixiRenderer({ element, canvas, bundle })` 팩토리 | `@geny/web-avatar-renderer` (workspace), `pixi.js` ^8.x |

구조 스케치:
```
packages/web-avatar-renderer-pixi/
├── package.json              # name: @geny/web-avatar-renderer-pixi
├── tsconfig.json             # extends 공통
├── src/
│   ├── index.ts              # createPixiRenderer re-export
│   ├── pixi-renderer.ts      # 본체 (Application + Container + Sprite 배치)
│   ├── part-adapter.ts       # RendererPart → Sprite/Mesh 매핑 규약
│   ├── deformer-evaluator.ts # parameter → vertex 변형 (자체 구현, Pixi 외)
│   └── motion-clock.ts       # motion curve 재생 루프 (requestAnimationFrame)
└── tests/
    ├── pixi-renderer.test.ts # happy-dom + mock WebGL (또는 skip / node-canvas)
    └── deformer-evaluator.test.ts
```

**예상 라인**: pixi-renderer.ts ~300 LOC, deformer-evaluator.ts ~200~400 LOC (실제 deformer 수학 복잡도에 비례), motion-clock.ts ~100 LOC, part-adapter.ts ~150 LOC. 테스트 포함 총 ~1500 LOC 첫 세션 산정 — **2~3 Spike 세션** 으로 Critical path 위 수직 슬라이스 (halfbody v1.3.0 + 회전 파라미터 1 + 파츠 텍스처 1) 까지.

### 2.2 기존 파일 편집

| 파일 | 변경 | 규모 |
|---|---|---|
| `docs/13-tech-stack.md §2.2` | "WebGL2 우선 / Pixi β / 자체 GA" 잠정안 → **"PixiJS v8 고정"** 으로 재작성 | ~30 라인 |
| `docs/13-tech-stack.md` (pending ADR 이름) | `adr/0013-pixijs-vs-own-mini-renderer.md` 참조 → `adr/0007-renderer-technology.md` 로 치환 | 1 라인 |
| `progress/adr/0007-renderer-technology.md` | Status Draft → **Accepted**, Decision 공란 → "Option A 확정" + 결정 근거 요약 | ~15 라인 append |
| `packages/web-avatar/README.md` | 렌더러 경로별 표의 Option A 행에 🟢 확정 표시 | ~5 라인 |
| `packages/web-avatar-renderer/README.md` | "하위 구현체" 절에 `-pixi` 실 패키지 추가 + 다른 옵션 제거 | ~10 라인 |
| `apps/web-editor/index.html` | `?debug=logger` 에 대응하는 Runtime attach 블록 추가 (dynamic import `createPixiRenderer`) | ~20 라인 |
| `apps/web-editor/scripts/prepare.mjs` | `packages/web-avatar-renderer-pixi/dist` → `public/vendor/` 복사 step 추가 | ~10 라인 |
| `apps/web-editor/scripts/e2e-check.mjs` | Runtime attach smoke (canvas 존재 + ready/destroy 이벤트 확인) 추가 | ~50 라인 |
| `scripts/test-golden.mjs` | `runWebAvatarRendererPixiTests` step 추가 — build → test 2 단 | ~20 라인 |

### 2.3 Golden step 변경

**+1 step** (30 → 31): `@geny/web-avatar-renderer-pixi tests`. downstream consumer 는 현재 없으므로 `build → test` 단독. e2e-check.mjs 의 web-editor e2e 에 Runtime attach 검사가 들어가면 **+0 step** 이지만 assertion 추가.

### 2.4 런타임/타입 계약

- **깨지지 않음** — 신규 패키지는 기존 `Renderer` 베이스 구현. `RendererHost` 계약 준수.
- Pixi 내부 타입은 **패키지 경계 밖으로 유출 금지** — `createPixiRenderer` 반환 타입은 `Renderer & { readonly canvas: HTMLCanvasElement }` 수준으로 좁혀 Pixi `Application` 타입이 소비자에 노출되지 않게 (Option E 교체 예비).

### 2.5 리스크 / 블록

- **Pixi v8 API 불안정** — v8 은 2024 말 GA 이후로 minor 에서 breaking 이 산발적. lockfile 고정 + renovate 탈주 방지 필요.
- **Deformer 수학 자체 구현** — Live2D 의 warp/rotation deformer 는 Pixi 가 제공하지 않음. `deformer-evaluator.ts` 의 정확도 검증 경로 (golden screenshot diff?) 가 Spike 범위 밖이면 "시각 회귀 미캡처" 구간 발생.
- **WebGL context 손실** — iOS Safari 백그라운드 전환 시 context lost → 자동 복구 루프 필요 (Pixi 는 이벤트 노출하지만 복구 트리거는 우리 몫).

### 2.6 Critical path sequence (A 확정 시)

1. **세션 A-1**: `packages/web-avatar-renderer-pixi/` 스캐폴드 + `createPixiRenderer` 빈 껍데기 + 가장 단순한 Sprite 1 장 표시 (halfbody v1.3.0 textures[0] 하드코딩).
2. **세션 A-2**: `parameterchange` 구독 → 루트 rotation 적용 (SVG Structure 와 동일 파라미터로 교차 검증 가능).
3. **세션 A-3**: 파츠 전체 배치 (z-order + pivot). 이 시점 golden screenshot 골든 첫 후보.
4. **세션 A-4**: deformer-evaluator (warp/rotation) 수학 도입 + 골든 회귀 프레임 비교.
5. **세션 A-5**: motion curve 재생 루프 + expression blend. Runtime β 닫힘.

---

## §3. Option B — Three.js r160+ (탈락 후보)

ADR 0007 이 "명시적 반대 의견 없으면 탈락" 으로 기술 — 본 노트도 diff 를 **최소 개요** 만 기록.

### 3.1 차이점 요약

- 신규 패키지 `packages/web-avatar-renderer-three/` 구조는 Option A 와 **대칭** (Pixi → Three 교체). 신규 LOC 규모 유사, scene-graph 개념은 거의 동일.
- **유일한 강점**: `morphTargetInfluences` 가 expression blend 에 자연 매핑. 단 Option A/D 에서도 자체 구현 난이도 중간이라 결정 arg 으로 약함.
- **추가 비용**: camera/ortho setup boilerplate. 2D 도메인이라 `OrthographicCamera` + `MeshBasicMaterial` 로 시작 + Three 3D 생태계 기능을 쓰지 않는 것에 대한 번들 낭비.
- **팀 learning**: 팀이 3D 경험 없으면 Pixi 대비 확실히 더 가파른 러닝커브.

### 3.2 Critical path (B 확정 시)

Option A 와 실질적으로 동일 — 세션 수 추정 동일 (A-1 ~ A-5). morph target 활용 만큼 expression blend 세션이 단축될 여지.

**권장**: B 를 선택하려면 **PM 이 Pixi 대비 Three 를 택하는 이유** 를 한 줄로 남겨 두는 것이 향후 rollback 기준으로 유용.

---

## §4. Option C — Cubism Web SDK (부분 채택 경로)

ADR 0007 은 Option C 를 **기본 렌더러로 채택하지 않음** — "Cubism Import Viewer" 가 제품 요구로 확정되면 **별도 레인** 으로 추가.

### 4.1 신규/확장 패키지 (부분 채택 시)

| 패키지 | 역할 | 의존 |
|---|---|---|
| `packages/web-avatar-cubism-viewer/` **(신규, 선택)** | `.moc3` + `.model3.json` 소비 전용 Viewer — 기본 렌더러 축과 **평행** | Cubism Web SDK (외부, 라이선스 계약 선행) |
| `packages/exporter-cubism/` **(확장, 이미 존재할 수 있음)** | `.moc3` 번들 생성 부분은 docs/11 §3.2 에서 이미 범위 — 본 ADR 과 무관 |

### 4.2 기존 파일 편집 (부분 채택 시)

| 파일 | 변경 | 규모 |
|---|---|---|
| `progress/adr/0007-renderer-technology.md` | Option A/D/E 중 **기본 렌더러 확정** + Option C 부분 채택 메모 (Viewer 레인 신설) | ~20 라인 append |
| `docs/11-export-and-deployment.md §3.2` | `.moc3` export path 에 "Web Viewer 재사용" 연결 추가 | ~10 라인 |
| `docs/01-vision-and-goals.md §8` | Cubism 종속 리스크 서술 재검토 — 기본 렌더러가 Cubism 이 아니라는 점 명시 | ~5 라인 |
| **신규** `progress/adr/0008-cubism-viewer-scope.md` | Viewer 레인 ADR (라이선스 계약 범위 + 운영 모델) | 신규 파일 ~80 라인 |

### 4.3 Golden step 변경

- **+1 step** (viewer 단독) 또는 **0** (라이선스 키 부재 시 skip-step 으로 설정). **BL-CUBISM-LICENSE** 외부 블록 도입.

### 4.4 런타임/타입 계약

- **영향 없음** — Viewer 는 기본 렌더러 축과 분리. `<geny-avatar>` 는 `.moc3` 를 인지하지 않음.
- Import Viewer 는 **다른 엔트리포인트** (`<geny-cubism-viewer src="model.moc3">` 등) 가 자연.

### 4.5 리스크 / 블록

- **라이선스 계약 선행** — 매출 규모에 따라 무료/상용 구간 명확화 필요. 계약 체결 전엔 상업용 CI 배포 불가.
- **진실 공급원 충돌** — Cubism Editor 에서 만든 `.moc3` 를 런타임에 직접 쓰면 우리 `web-avatar.json` schema 가 진실이 아니게 됨. 부분 채택은 "Viewer 전용" 경계를 반드시 유지해야 avatar-as-data (ADR 0004) 가 살아있음.
- **Open Question #1 (PM 답변)** 이 "제품 기능에 포함" 인 경우에만 진입. 그 외 스킵.

---

## §5. Option D — 자체 WebGL2 미니 런타임 (직진)

### 5.1 신규/확장 패키지

| 패키지 | 역할 | 의존 |
|---|---|---|
| `packages/web-avatar-renderer-webgl2/` **(신규)** | 자체 WebGL2 드라이버 — shader / vertex / uv-atlas 직접 관리 | `@geny/web-avatar-renderer` (workspace), **외부 의존 0** |

구조 스케치 (Option A 와 유사하지만 내부가 완전히 다름):
```
packages/web-avatar-renderer-webgl2/
├── src/
│   ├── index.ts
│   ├── webgl2-renderer.ts    # gl.createProgram / uniform / attrib / drawArrays
│   ├── shaders/
│   │   ├── part.vert.glsl    # deformer uniform + uv
│   │   └── part.frag.glsl    # atlas sample + alpha
│   ├── deformer-evaluator.ts # Option A 와 동일 수학 (재사용 가능)
│   ├── motion-clock.ts
│   ├── atlas-uploader.ts     # textures[] → GL texture / atlas packing
│   └── context-recovery.ts   # context lost/restored 이벤트 처리
└── tests/ ...
```

**예상 라인**: 본체 ~800~1200 LOC, shader glsl ~100 LOC, deformer/motion 은 Option A 와 공유 가능 (`packages/web-avatar-renderer/` 에 수학 모듈로 선분리하는 옵션 있음). 테스트 포함 첫 세션 범위 ~2000 LOC. **5~8 Spike 세션** — A 대비 2~3 배.

### 5.2 기존 파일 편집

Option A 와 **동일한 touch list** (docs/13 재작성, ADR 0007 Accept, README 업데이트, web-editor wire-through, prepare.mjs copy, e2e assert, golden step 추가) — 패키지 이름만 `-webgl2` 로.

### 5.3 Golden step 변경

**+1 step** (30 → 31). screenshot 골든 도입 검토 — WebGL2 는 Pixi 보다 픽셀 결정론이 강해서 골든 이미지 회귀 가능성이 오히려 좋음.

### 5.4 런타임/타입 계약

- **깨지지 않음** — 현 계약 준수. 외부 의존 0 이므로 타입 유출 우려 없음.

### 5.5 리스크 / 블록

- **가장 큰 리스크**: 인력 3~6 개월 풀타임 engineer. 자율 모드 세션으로 누적 불가 — 숙련 엔지니어 1~2 명 투입 결정이 선행.
- **iOS Safari WebGL2 경계** — iOS 15+ 만 지원. WebGL1 fallback 여부가 docs/13 에 미정.
- **shader 디버깅 난이도** — 브라우저간 GLSL 방언 차이 + Apple Silicon Metal 변환 quirks. 초기 Spike 동안 golden screenshot 비교가 false positive 를 많이 낼 가능성.

### 5.6 Critical path sequence (D 확정 시)

1. **세션 D-1**: WebGL2 context acquire + clear color (greenscreen). 계약 맞춤 빈 껍데기.
2. **세션 D-2**: 단일 quad + atlas texture (halfbody textures[0]) 드로우.
3. **세션 D-3**: shader uniform 으로 rotation 파라미터 wiring. SVG 와 교차 비교.
4. **세션 D-4**: 파츠 전체 배치 + z-order.
5. **세션 D-5**: deformer 수학 (warp/rotation).
6. **세션 D-6**: context recovery 루프.
7. **세션 D-7**: motion curve + expression blend.
8. **세션 D-8**: Spike 1 차 마무리 + 골든 이미지 프레임 2~3 장 고정.

---

## §6. Option E — 하이브리드 (A + D, 권장 기본값)

### 6.1 신규/확장 패키지

**첫 세션부터 A 와 동일**: `packages/web-avatar-renderer-pixi/` 신설. D 로의 교체는 GA 직전.

추가 고려:
- `packages/web-avatar-renderer/` 을 **facade** 로 확장할지 여부. ADR 0007 Consequences 는 "facade 로 확장 가능" 기술. Spike 1~2 세션에선 **직접 소비** 가 더 단순, facade 도입은 교체 직전 세션에서.
- 공통 수학 모듈 (deformer-evaluator, motion-clock) 을 **계약 패키지에 선반영** 할지 — Option A 진입 전에 `packages/web-avatar-renderer/` 에 `src/math/` 서브트리를 여는 선택지가 생김. 교체 시 Pixi/WebGL2 양쪽이 같은 수학 모듈을 import → diff 최소화.

### 6.2 기존 파일 편집

Option A 와 동일 + **하이브리드 의도 명시**:
- `docs/13-tech-stack.md §2.2`: "PixiJS β → 자체 WebGL2 GA" 원래 잠정안을 **정식화**. 교체 목표 시점 (분기/세션 번호 또는 "GA 릴리스 전") 명기.
- `progress/adr/0007-renderer-technology.md` Decision: "Option E 확정 — Phase 1 PixiJS β / Phase 2 자체 WebGL2 GA".
- `packages/web-avatar-renderer/README.md` "하위 구현체" 절에 `-pixi` + `-webgl2` **양쪽** 선언 (후자는 TBD 플래그).

### 6.3 Golden step 변경

**Phase 1** (Pixi 도입): +1 step (Option A 와 동일).
**Phase 2** (WebGL2 교체): +1 step (Option D 와 동일, 총 +2).
**중간 상태** (둘이 공존하는 기간): 두 step 모두 켜짐 — 실 번들은 dev 환경에서 둘 중 하나 select 할 수 있게 feature flag.

### 6.4 런타임/타입 계약

- **깨지지 않음** — facade 도입 시점에만 계약 재구성 (옵션). 첫 Spike 에선 Option A 와 동일.
- **가장 중요한 판단**: `<geny-avatar>` 가 Pixi 타입에 오염되지 않게 **인터페이스로만 import** 유지. Option A 의 §2.4 원칙이 그대로 적용 — 오염이 생기면 Phase 2 교체 비용이 급증.

### 6.5 리스크 / 블록

- **교체 시점 놓침 → Pixi 고착**. 교체 트리거를 ADR 또는 릴리스 게이트에 명기 ("GA 전 Spike 3 세션 내 WebGL2 가 A 와 pixel parity 달성" 같은 객관 기준).
- **두 번 작성 비용**: deformer/motion 수학을 공통 모듈로 뽑지 않으면 D Phase 에서 A 작업의 큰 부분을 다시 쓴다. §6.1 의 "수학 모듈 선반영" 결정이 이 비용을 지배.

### 6.6 Critical path sequence (E 확정 시)

**Phase 1** (Option A 와 동일): 세션 A-1 ~ A-5.
**Phase 2** (Option D 와 동일, 단 수학 모듈 재사용): 세션 D-1 ~ D-8 중 D-5 (deformer) / D-7 (motion) 은 **재구현 대신 이식** — 세션 수 2~3 개 단축 가능.

---

## §7. 옵션 간 공통 변경 (어느 쪽이든 반드시 발생)

아래는 **어느 옵션을 택해도 동일하게 생기는** touch list — pick 시점에 일괄 편집 가능:

| 파일 | 변경 |
|---|---|
| `progress/adr/0007-renderer-technology.md` | Draft → **Accepted**, Decision 공란 채움, Follow-ups 체크박스 1 번 ☑ |
| `docs/13-tech-stack.md §2.2` | 잠정안 → 확정안 재작성 |
| `docs/13-tech-stack.md` | pending ADR 이름 `0013-pixijs-vs-own-mini-renderer.md` → `0007-renderer-technology.md` |
| `packages/web-avatar/README.md` | "렌더러 경로별 표" 행 상태 갱신 |
| `packages/web-avatar-renderer/README.md` | "하위 구현체" 절 실 패키지 이름 기입 |
| `progress_0420/INDEX.md §3` | ADR 0007 상태 Draft → Accepted |
| `progress_0420/PLAN.md §3` | ADR 0007 리뷰 대기 제거, Spike 세션 후보 추가 |
| `memory/project_foundation_state.md` | ADR 0007 리뷰 대기 라인 제거, 확정 라인 신설 |

**일괄 편집 규모**: ~100~150 라인 추가/치환. 1 세션 분량 (Phase 0 = ADR Accept 세션).

---

## §8. Open Questions 가 diff 에 미치는 영향

ADR 0007 §Open Questions 4 항목 중 Option 확정과 무관한 건 없음:

| Question | 영향 |
|---|---|
| #1 Cubism Import Viewer 제품 요구 | **YES → Option C 부분 채택 추가** (§4). NO → C 관련 touch 제거. |
| #2 모바일/iOS Safari 지원 범위 | WebGL1 fallback 결정 → Option D/E 의 context-recovery.ts 에 fallback path 존재 여부. A 는 Pixi 가 WebGL1 fallback 내장. |
| #3 Server Headless Renderer 코드 공유 | **공유 요구 시** deformer-evaluator / motion-clock 을 node-compatible 로 뽑아야 함 — 패키지 구조가 달라짐 (`packages/web-avatar-renderer-core/` 같은 추상화 추가). 공유 불필요면 현재 패키지 구조로 충분. |
| #4 성능 목표 (fps, 파츠 한계) | golden screenshot 회귀 외 **perf golden** (frame_time_ms histogram) 추가 여부. Option D 는 perf 노이즈 적고 A/E 는 Pixi 내부 스케줄링 흔들림 가능. |

---

## §9. 본 노트가 생략하는 것

- **실 LOC 측정** — "~300 LOC" 등은 경험 추정. Spike 이전 정확히 알 방법 없음.
- **성능 목표 판정** — fps / 파츠 한계는 Open Question #4 선행.
- **라이선스 법무 확인** — Option C 는 계약 실사 필요. 본 노트는 라이선스 조건을 PM 계약 프로세스 범위로 외부화.
- **pixel-level 골든 설계** — 어느 옵션이든 screenshot 회귀는 별도 Spike 세션에서 도입 (현재 골든 30 step 에 이미지 비교 없음).

---

## §10. 요약 표

| 항목 | A Pixi | B Three | C Cubism (Viewer) | D 자체 WebGL2 | E 하이브리드 |
|---|---|---|---|---|---|
| 신규 패키지 수 | 1 | 1 | 1 + 신 ADR 0008 | 1 | 2 (phase 1+2) |
| 기존 파일 touch | 9 | 9 | 4 + §9 | 9 | 9 + phase 2 시 재편 |
| Golden +step | +1 | +1 | +1 or 0 (skip) | +1 | +1 → +2 |
| 타입 계약 깨짐 | ✘ | ✘ | ✘ (레인 분리) | ✘ | ✘ |
| Critical path 세션 수 | 5 | 5 | 2~3 (viewer only) | 8 | 5 → 5~8 (phase 2) |
| 외부 의존 라이선스 비용 | 0 (MIT) | 0 (MIT) | **상용** | 0 | 0 (phase1) / 0 (phase2) |
| 가장 큰 blocker | v8 API 불안정 | 3D 생태계 과잉 | 라이선스 계약 | 인력 3~6mo | 교체 시점 판단 |

---

## §11. 참고 문서

- [`../adr/0007-renderer-technology.md`](../adr/0007-renderer-technology.md) — 원본 ADR Draft
- [`../../docs/13-tech-stack.md`](../../docs/13-tech-stack.md) §2.2 — 잠정안 기록
- [`../../packages/web-avatar-renderer/README.md`](../../packages/web-avatar-renderer/README.md) — 계약 패키지 현 상태
- [`../../packages/web-avatar-renderer/src/contracts.ts`](../../packages/web-avatar-renderer/src/contracts.ts) — Renderer 베이스 계약
- [`../sessions/2026-04-21-session-113-adr-0007-renderer.md`](../sessions/2026-04-21-session-113-adr-0007-renderer.md) — Draft 작성 세션 로그
- [`../sessions/2026-04-21-session-114-web-avatar-renderer-package.md`](../sessions/2026-04-21-session-114-web-avatar-renderer-package.md) — 계약 패키지 분리
- [`../sessions/2026-04-21-session-115-null-logging-renderer.md`](../sessions/2026-04-21-session-115-null-logging-renderer.md) — Null/Logging 구현체
- [`../sessions/2026-04-21-session-116-web-editor-logging-renderer-wire.md`](../sessions/2026-04-21-session-116-web-editor-logging-renderer-wire.md) — web-editor wire-through
