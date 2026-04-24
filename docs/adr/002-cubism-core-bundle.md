# ADR 002 — Cubism Core WASM 번들 정책

**Status**: Accepted — 2026-04-24 (P1.D)
**Context**: [ADR 001](./001-renderer-integration.md) 에서 `pixi-live2d-display-advanced` 를 PIXI v8 용 Live2D 런타임 래퍼로 채택. 이 라이브러리는 `window.Live2DCubismCore` (Live2D 의 proprietary WASM 번들) 을 전역에 로드해야 동작.

본 ADR 은 **해당 WASM 파일을 어디에 두고 어떻게 배포하는가** 를 결정.

---

## Decision

**Option A (local vendor, gitignored) 채택.**

- 저장소 포함 위치: `vendor/live2dcubismcore/` (디렉토리는 commit, 내부 `.min.js` 는 `.gitignore`)
- 사용자는 처음 clone 후 Live2D 공식 다운로드에서 `live2dcubismcore.min.js` 받아 해당 경로에 배치
- `scripts/setup-cubism-core.mjs` 가 파일 존재 + sha256 검증 + `apps/*/public/vendor/` 로 복사
- 재배포 위험 제로 (저장소에 실 바이너리 없음)

---

## 검토한 대안

### Option A — local vendor + gitignore (채택)

- **설명**: `vendor/live2dcubismcore/` 는 저장소에 있으나 실 `.min.js` 파일은 git 에 포함하지 않음. 사용자가 수동 다운로드.
- **장점**:
  - **Live2D 재배포 금지 정책 완전 준수** (저장소에 proprietary 바이너리 無)
  - 공개 repo 여도 법적 리스크 無
  - 업데이트는 사용자가 직접 교체
- **단점**:
  - 최초 clone → 개발 시작까지 수동 설정 1 단계 추가
  - CI 에서 Core 를 쓰는 E2E (Playwright) 는 secret 또는 별도 fetch 단계 필요

### Option B — 저장소에 바이너리 포함

- **Rejected**: Live2D Cubism Core 라이선스는 **redistribution 금지**. 공개 저장소 포함 = 위반 소지.
- 이 프로젝트가 비상업·개인 장난감 범위 (2026-04-24 사용자 확인) 라 해도 공개 git repo 에 올리는 것은 별도 리스크.

### Option C — 외부 CDN 에서 런타임 fetch

- **설명**: 런타임에 `<script src="https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js">` 식으로 로드.
- **Rejected**: Live2D 는 공식 hot-link 용 CDN URL 을 제공하지 않음. 비공식 미러는 불안정 + 라이선스 회피로 간주될 수 있음.

### Option D — `pixi-live2d-display-advanced` 의 bundled core 사용

- **설명**: 일부 community 포크는 Core 를 소스 트리에 번들해 npm install 만으로 동작.
- **Rejected**: 이 방식의 포크는 Live2D 라이선스를 우회하는 셈. 안전하지 않음.

---

## 결정 근거

1. **법적 안전성 > 개발 편의**. 하루 수동 설정 1 회 vs 라이선스 위반 리스크 — 전자 택.
2. **공개 repo 전제**. 현재 이 저장소가 공개이므로 proprietary 바이너리는 절대 포함 안 함.
3. **사용자 부담 최소화**. `setup-cubism-core.mjs` 스크립트가 파일 검증 + 배치 자동화. 사용자는 파일을 `vendor/live2dcubismcore/live2dcubismcore.min.js` 경로에 한 번 복사하면 됨.

---

## 사용자 설치 절차

1. [Live2D Cubism SDK for Web](https://www.live2d.com/sdk/download/web/) 접속, Cubism Core 다운로드 (약 600KB `.zip` 또는 `.min.js`)
2. 압축 해제 후 `live2dcubismcore.min.js` 파일을 저장소 루트 기준 `vendor/live2dcubismcore/` 에 배치:
   ```
   geny-2d-avatar/
   └── vendor/
       └── live2dcubismcore/
           ├── .gitignore   (live2dcubismcore.min.js 포함 금지)
           ├── README.md
           └── live2dcubismcore.min.js  ← 여기 (gitignored)
   ```
3. `pnpm exec node scripts/setup-cubism-core.mjs` 로 검증 + `apps/*/public/vendor/` 로 복사:
   ```bash
   pnpm exec node scripts/setup-cubism-core.mjs
   # → ✅ Cubism Core 검증 OK (sha256=... 약 600KB)
   # → ✅ apps/web-preview/public/vendor/live2dcubismcore.min.js 복사 완료
   ```
4. 이제 `pnpm -F @geny/web-preview dev` 로 로컬 실행 가능.

---

## CI / 자동 테스트 영향

- **validate-schemas / test-golden**: Cubism Core 에 의존 없음. 현재 CI 전부 그린 유지.
- **Playwright E2E (P1.E)**: 실 렌더 검증이므로 Core 필수. CI 에서는 **GitHub secret 에 Core 바이너리 base64 저장** 또는 **개인 CI runner 에 수동 배치** 중 택 — P1.E 착수 시 결정 (ADR 003 후보).

---

## Deferred

- **ADR 003** (예정): Playwright E2E CI 에서 Cubism Core 를 어떻게 주입할지 (GitHub secret / self-hosted runner / 프리뷰만 로컬 수동) — P1.E 착수 직전.
- Cubism Core 버전 업데이트 정책 (현재는 사용자가 수동, 버전 핀 없음) — 필요 시 향후.
