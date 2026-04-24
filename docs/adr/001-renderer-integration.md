# ADR 001 — Live2D Renderer 통합 경로

**Status**: Accepted — 2026-04-24 (P1.C)
**Context**: Phase 1 (`docs/04-ROADMAP.md §Phase 1`) 에서 "브라우저에서 `.moc3` + texture 를 실제로 그린다" 는 데모 목표. 기존 `@geny/web-avatar-renderer-pixi` 는 구조 프리뷰(grid placeholder)만 수행.

---

## Decision

**Phase 1.4 에서 [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) 를 primary 런타임 통합 경로로 채택한다.**

단, 즉시 npm 의존성 추가는 **보류** — `Cubism Core (live2dcubismcore.js)` 라이선스 검토가 선행되어야 한다. Phase 1.4 착수 시 별도 PR 로 SDK 번들 + 런타임 로더를 함께 도입.

---

## 검토한 대안

### Option A — pixi-live2d-display (채택)

- **설명**: PixiJS 커뮤니티 라이브러리. Cubism Framework for Web 을 래핑해 PIXI.Application 에 `Live2DModel` 을 Container 로 추가 가능.
- **장점**:
  - 성숙도 ↑ (GitHub 5.5k stars, VTube Studio·pixi 기반 플레이어 사용)
  - PIXI v8 지원 (우리 현 의존 `pixi.js@^8.6.0` 와 호환)
  - 파라미터 I/O · 모션 · 표정 API 내장 — `<geny-avatar>` 이벤트 5 종과 매핑 쉬움
  - MIT 라이선스 (pixi-live2d-display 자체)
- **단점**:
  - **런타임 의존: Cubism Core (proprietary)** — 별도 다운로드 필요, 전역 스크립트로 로드
  - Cubism 라이선스는 Live2D 의 정책을 따른다 (상업 이용 시 규약 동의 필요)

### Option B — Cubism Framework 직접 통합

- **설명**: Live2D/CubismWebFramework (MIT) 를 직접 import 해 PixiJS 와 통합.
- **장점**: 중간 레이어 없음 → 제어 세밀.
- **단점**: 통합 코드를 직접 작성 (수주 ~ 수개월), Cubism Core 여전히 필요, 유지보수 비용 높음.

### Option C — 자체 `.moc3` 파서 + WebGL

- **설명**: `.moc3` binary 포맷을 reverse-engineer / 직접 해석 후 우리 WebGL 렌더러.
- **장점**: SDK 의존 제거.
- **단점**: 포맷 공개 미흡, 공식 지원 없음, 수개월 개발, 디포머/물리/마스크 구현 전부 필요. **비현실적**.

### Option D — Spine / VRM 등 다른 포맷으로 전환

- **설명**: 다른 2D/3D 포맷으로 스코프 변경.
- **Rejected**: 프로젝트의 핵심이 "Cubism 프리셋 + texture 교체" 이므로 범위 밖.

---

## 결정 근거

1. **핵심 요구: 30 초 내 데모 동작.** pixi-live2d-display 를 쓰면 1~2 세션 내 first-pixel 가능. 자체 구현은 월 단위.
2. **기존 코드 재활용**: `@geny/web-avatar-renderer-pixi` 는 이미 PIXI.Application 생성·createApp 주입 훅·breath ticker 를 가짐. pixi-live2d-display 의 `Live2DModel` 을 stage 에 얹는 어댑터만 추가하면 된다.
3. **라이선스 가드레일**: Cubism Core 는 Live2D 의 정책에 의존 — 상업 배포 시 별도 계약 필수 (`docs/03-ARCHITECTURE.md §9` 에 명시). MIT 수준 제품을 만드는 건 아니다.

---

## 실행 계획 (Phase 1.4)

다음 PR 범위 (P1.D 예정):

1. **Cubism Core 번들 정책 결정** (blocking)
   - 저장소 포함 vs. 배포 시 다운로드 스크립트
   - 라이선스 고지 위치 (`archive/infra/legal/` + 런타임 UI 각주)
2. **의존성 추가**
   - `pixi-live2d-display@^0.4` → `packages/web-avatar-renderer-pixi/package.json`
   - Cubism Core WASM → `public/vendor/live2dcubismcore.min.js` (apps/*)
3. **`PixiLive2DRenderer` 어댑터 작성** (기존 `createPixiRenderer` 와 병행)
   - `loadBundle(bundleJson)` → `runtime_assets/` 경로 찾기 → `Live2DModel.from(model3.json URL)`
   - `setParameter(id, value)` → `model.internalModel.coreModel.setParameterValueById(cubismId, value)`
   - `playMotion(packId)` → `model.motion(groupName)` 매핑
   - `setExpression(id)` → `model.expression(id)` 매핑
4. **Browser E2E 추가**
   - Playwright 로 mao_pro 번들 로드 → first-pixel 스크린샷
5. **CI 고려**
   - Cubism Core 는 브라우저 전용 — CI 는 Node happy-dom 에서 어댑터 계약만 검증
   - 실 픽셀 렌더는 수동 스모크 or Playwright 섀도우

### 종료 조건

- 브라우저에서 mao_pro 프리셋 로드 → 파라미터 슬라이더로 얼굴 각도 움직임 → 모션 재생 → 표정 변경이 동작하는 30 초 녹화.

---

## 영향

- `docs/03-ARCHITECTURE.md §7 외부 의존` 에 Cubism Core 추가 명시됨 (이미 있음, 유지).
- `docs/04-ROADMAP.md §Phase 1.4` 가이드라인 강화.
- `packages/web-avatar-renderer-pixi/README.md` — 현 구조 프리뷰 + Phase 1.4 pixi-live2d-display 통합 명시.
- `.gitignore` — 만약 Cubism Core 를 저장소에 포함하지 않는다면 `public/vendor/live2dcubismcore*` 를 ignore.

## Deferred decisions

- **ADR 002** (예정): Cubism Core 번들 정책 (포함 vs 외부 다운로드) — Phase 1.4 착수 직전.
- **ADR 003** (예정): Live2D 상업 라이선스 확보 시점 / Phase 6 공개 전.
