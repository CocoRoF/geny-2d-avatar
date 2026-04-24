# 세션 94 — `<geny-avatar>` playMotion / setExpression 스텁 해소

**일자**: 2026-04-20
**워크스트림**: Frontend / Runtime 선행
**선행 세션**: 세션 90 (`setParameter` write-through + `parameterchange`), 세션 91 (구조 프리뷰), 세션 92 (파츠 선택 양방향 바인딩)

---

## 1. 문제

`<geny-avatar>.playMotion(packId)` / `setExpression(expressionId)` 는 세션 18 (Stage 2) 이래 `throw new WebAvatarBundleError("... not implemented in stage 2", "INVALID_SCHEMA")` 로 묶여 있었다. 세션 90 에서 `setParameter` 계약을 닫으면서 Inspector 슬라이더 → `parameterchange` → 렌더러 `rotate()` 루프는 증명했지만, motion pack / expression 두 축은 "번들에 포함 은 되어 있으나 element 가 인식조차 하지 않는" 상태. Foundation Exit 이후 Runtime phase 에서 Cubism/WebGL 실 렌더러가 들어오면 pack_id → motion3 curve interpolation 이 붙지만, **그 전에 "번들에 없는 id 는 입구에서 차단한다" 계약을 고정하지 않으면** Runtime 이 임의의 string 을 재생 시도하는 창구가 남는다.

세션 93 (실 staging 배포) 은 cluster access 확보 전이라 보류. 세션 94 는 `<geny-avatar>` 의 마지막 두 스텁을 Foundation 수준으로 닫는다 — id 유효성 검증 + state tracking + 이벤트 플러밍. 실 애니메이션 재생(timeline 보간)은 Runtime.

---

## 2. 변경

### 2.1 `packages/web-avatar/src/element.ts` — motion/expression API 실구현

- 새 이벤트 타입 export:
  - `GenyAvatarMotionStartEvent = CustomEvent<{ pack_id, motion: WebAvatarMotion }>`
  - `GenyAvatarExpressionChangeEvent = CustomEvent<{ expression_id: string|null, expression: WebAvatarExpression|null }>`
- private 필드 추가: `#motions: Map<string, WebAvatarMotion>`, `#expressions: Map<string, WebAvatarExpression>`, `#currentMotion: string|null`, `#currentExpression: string|null`.
- `#seedParameters(bundle)` 확장 — motion/expression 레지스트리 맵 재빌드 + current\* null 리셋. 재-ready (template swap) 시 새 번들의 id 공간으로 갈아끼움.
- public getter: `get currentMotion(): string|null`, `get currentExpression(): string|null`.
- `playMotion(packId: string): void`:
  - `#motions.has(packId) === false` → `WebAvatarBundleError("unknown motion pack_id: ...", "INVALID_SCHEMA")`.
  - 정상 → `#currentMotion = packId` → `motionstart` 이벤트 (detail = `{pack_id, motion}` 전체 meta 동반).
- `setExpression(expressionId: string | null): void`:
  - `null` → `#currentExpression = null` → `expressionchange {expression_id: null, expression: null}`.
  - 유효 id → `#currentExpression = expressionId` → `expressionchange {expression_id, expression}` (full meta).
  - unknown id → `WebAvatarBundleError("unknown expression_id: ...", "INVALID_SCHEMA")`.
- 기존 `setParameter` / `getParameters` / ready / error / stale-src cancel 계약 무변화.

### 2.2 `packages/web-avatar/tests/dom-lifecycle.test.ts` — 5 tests 추가 (15 → 20)

- `playMotion dispatches motionstart with motion meta + updates currentMotion (세션 94)` — 유효 pack_id 로 `motionstart` 이벤트 + detail.motion.duration_sec/loop 비교 + currentMotion getter.
- `playMotion throws INVALID_SCHEMA on unknown pack_id (세션 94)` — 에러 코드 + currentMotion 불변 확인.
- `setExpression dispatches expressionchange + null clears (세션 94)` — 유효 id → 이벤트, `null` → 해제 이벤트, currentExpression 두 경로.
- `setExpression throws INVALID_SCHEMA on unknown id (세션 94)` — 에러 코드 + currentExpression 불변.
- `re-ready resets motion + expression state (세션 94)` — 번들 스왑 시 current\* 모두 null 로 리셋 (서로 다른 id 공간 회귀 방지).

### 2.3 `apps/web-editor/index.html` — Inspector Motion / Expression 패널

- CSS: `.playback-section`/`.playback-row`/`.playback-readout` 신규 (params-section 톤 일치, 버튼 flex-wrap + aria-pressed 스타일).
- `renderMotions(motions)` — 번들 meta.motions 전부를 버튼 목록으로 노출. 버튼 click → `el.playMotion(pack_id)`. readout `current: <pack_id>`.
- `renderExpressions(expressions)` — 번들 meta.expressions 전부 + **"None"** 버튼. 클릭 → `el.setExpression(id|null)`. readout 표시 (`none` 기본).
- `el.addEventListener("motionstart", ...)` — 버튼 `aria-pressed="true"` 단일 선택 + readout 갱신.
- `el.addEventListener("expressionchange", ...)` — 동일 로직 + None 버튼 연동 (`id === null` → none 버튼 pressed).
- `renderInspector` 의 `paramSectionEl` 재주입 패턴 확장: `motionSectionEl` / `expressionSectionEl` 도 파츠 선택 시 re-append 해 버튼 focus/pressed 상태 보존.
- `swapTemplate` — motion/expression 관련 4 ref (section, button maps, readout) 전부 clear.
- Preview hint: "세션 91 — Stage 3 kick-off" → "Stage 3 — motion/expression state only (render = Runtime)" 로 문구 갱신.

### 2.4 `apps/web-editor/scripts/e2e-check.mjs` — runDomLifecycle 확장

parameterchange 검증 뒤에 motion/expression round-trip 블록 추가:

- `el.currentMotion === null` / `currentExpression === null` (ready 직후 초기값).
- `el.playMotion(meta.motions[0].pack_id)` → `motionstart` 대기 → `detail.pack_id`/`detail.motion.duration_sec` 일치 + `el.currentMotion` 반영.
- `assert.throws(() => el.playMotion("motion.nonexistent"), err => err.code === "INVALID_SCHEMA")` + `currentMotion` 불변.
- `el.setExpression(meta.expressions[0].expression_id)` → `expressionchange` → detail 검증.
- `el.setExpression(null)` → `expressionchange {expression_id: null}` + `currentExpression` null.
- `assert.throws(() => el.setExpression("expression.nonexistent"), ...)`.
- 로그 1줄: `"motion/expression round-trip: <firstPack> → (unknown throws), <firstExp> → null"`.

halfbody 첫 motion = `blink.auto`, 첫 expression = `expression.neutral` / fullbody 는 동일 순서.

---

## 3. 검증

- `pnpm -F @geny/web-avatar test` — 20/20 pass (15 기존 + 5 신규).
- `apps/web-editor` e2e — halfbody + fullbody 양쪽 round-trip 전 스텝 pass (motion pack_id + expression_id + null clear + unknown throw 검증 포함).
- `node scripts/test-golden.mjs` — **29/29 all steps pass** (step 수 불변, 기존 step 내부 회귀 5 tests + e2e round-trip 추가).

---

## 4. 결정 축 (D1–D7)

### D1. motion playback: full timeline 재생 vs id-only state tracking
- **결정**: id-only state tracking + 이벤트 발화 + `currentMotion` getter. 실 motion3 curve interpolation / parameter override 는 Runtime 렌더러.
- **이유**: Foundation 의 책임은 "벤더 → 번들 → 엘리먼트 → 에디터" 계약 플러밍. 모션 curve 를 해석해 parameter 를 시간축으로 보간하려면 Cubism expression3 loader + RAF 루프 + 물리 엔진 통합까지 묶여야 하는데, 이는 실 렌더러 패키지 (WebGL/Canvas) 선정과 함께 해야 함. 반면 "번들에 없는 pack_id 는 거부" / "motion 선택이 이벤트로 브로드캐스트된다" 는 지금 닫아두어야 Runtime 이 stable 한 id 계약 위에 timeline 을 얹을 수 있다.

### D2. `setExpression(null)` 지원 vs 오버로드 회피
- **결정**: `null` 지원 — 현재 표정 해제 (resting / neutral state).
- **이유**: Inspector UI 에 "표정 없음" 으로 되돌아가는 길이 필요. 빈 문자열 `""` 은 의미가 모호하고 unknown id 와 충돌. `null` 은 명시적 signal 로 계약이 깔끔하다. 타입도 `string | null` 로 TS/IDE 에서 강제.

### D3. 에러 코드: 새 `UNKNOWN_MOTION`/`UNKNOWN_EXPRESSION` vs `INVALID_SCHEMA` 재사용
- **결정**: 기존 `INVALID_SCHEMA` 재사용 (세션 90 unknown parameter 동일 패턴).
- **이유**: `WebAvatarBundleError.code` 는 현재 5-union (`FETCH_FAILED/INVALID_JSON/INVALID_KIND/INVALID_SCHEMA/MISSING_FILE`). 새 코드 2종 추가는 계약 확장 + consumer switch/exhaustive 커버리지 재검토 비용 발생. 의미상 "번들 meta 에 없는 id" = 스키마 불일치 = INVALID_SCHEMA 적합. 계약 복잡도는 최소화.

### D4. 렌더러에 motionstart/expressionchange 구독 추가 vs Foundation 범위 밖
- **결정**: Foundation 범위 밖. 렌더러 (`@geny/web-editor-renderer`) 는 세션 91 의 `ready`+`parameterchange` 구독만 유지.
- **이유**: 구조 프리뷰의 회전은 parameter 의 직접 결과지만, motion pack 이 어떤 parameter curve 를 시간축으로 돌릴지 해석하려면 motion3.json 을 파싱하는 런타임 레이어가 필요. Foundation 단계에서 이를 부분 구현하면 Runtime 에서 다시 갈아엎어야 함. Inspector UI 가 이벤트 listen 해 readout 을 갱신하는 것으로 "state 가 살아 있다" 는 증명은 충분.

### D5. `playMotion` 2번째 옵션 인자 vs void 시그니처
- **결정**: `playMotion(packId: string): void` 순수 한 인자.
- **이유**: Foundation 단계에서는 번들 meta 의 `duration_sec`/`fade_in_sec`/`fade_out_sec`/`loop` 를 그대로 소비. 런타임 override (속도 / 루프 강제 / 시크) 는 실 재생 엔진이 붙을 때 옵션으로 확장하는 편이 계약 표면 최소화. API 를 지금부터 넓게 열어두면 "구현되지 않은 옵션" 이 섞여 Foundation 사용자 혼란.

### D6. 재-ready 시 motion/expression 리셋 vs 유지
- **결정**: 리셋 (template swap 시 `#currentMotion = null`, `#currentExpression = null`).
- **이유**: 세션 90 parameters 리셋과 동일 패턴. halfbody 의 `blink.auto` 가 fullbody 에도 존재하면 우연히 유지되겠지만, 템플릿에 따라 pack_id 세트가 갈릴 수 있어 stale reference 리스크. `seedParameters` 가 이미 single choke-point 이므로 이 안에서 묶어 처리.

### D7. motionstart 페이로드: id 만 vs 전체 motion meta
- **결정**: `{pack_id, motion: WebAvatarMotion}` 전체 meta.
- **이유**: 세션 90 의 `parameterchange.detail.values` 전체 스냅샷 패턴과 일치. consumer (Inspector readout / 미래 렌더러) 가 매번 `bundle.meta.motions.find(m => m.pack_id === pack_id)` 를 반복할 필요 없음. 이벤트 자체가 self-contained context. 페이로드 크기 우려는 motion meta 가 5 필드 (pack_id/duration_sec/fade_in_sec/fade_out_sec/loop) 뿐이라 무시 가능.

---

## 5. 후속 (세션 95+)

- **세션 95 후보** — 렌더러 확장: 선택된 파츠에 바인딩된 parameter 만 Inspector 에 필터 노출, 또는 rig-template 의 deformer tree 를 렌더러가 시각화. rig-template 구조 편집은 template-authoring 파이프라인 스코프라 Foundation 범위 밖이지만, **뷰 필터** 는 현재 UX 개선 후보.
- **세션 96 후보** — 실 staging 배포 재개 (cluster access 확보 시). 세션 80 prep + 83/84/85/86/88 베이스라인 **5 종** → `helm install worker-generate -f values-staging.yaml` → kps ServiceMonitor → `/metrics` capture → snapshot-diff/fallback-validate 4 모드 실증.
- **Runtime phase 진입 후** — 실 Cubism motion3 loader + RAF 루프 + parameter interpolator 가 합류하면 이 세션의 `motionstart` 이벤트가 자연스럽게 "timeline start" 신호로 승격. `el.stopMotion()` / progress getter / fade crossbreed 등 옵션 확장 지점.

---

## 6. 인덱스 갱신

- `progress/INDEX.md` §4 롱세션에 세션 94 행 추가 (§4 의 newest-first 정렬).
- `progress/INDEX.md` §3 Frontend 축에 "motion/expression state + event" 업데이트.
- §3 UX 축에 세션 94 짧은 언급 (Inspector 에 Motions/Expressions 패널 추가).
- §8 "다음 세션 후보" — 세션 95/96 으로 roll.
