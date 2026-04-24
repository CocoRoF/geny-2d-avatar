# vendor/live2dcubismcore/

Live2D **Cubism Core for Web** (proprietary WASM 번들). 이 디렉토리 자체는 저장소에 포함되지만 실 파일(`live2dcubismcore.min.js`) 은 [ADR 002](../../docs/adr/002-cubism-core-bundle.md) 에 따라 **재배포 금지 조항 준수를 위해 git 에 포함되지 않는다** (`.gitignore`).

## 설치 절차

1. [Live2D Cubism SDK for Web 공식 페이지](https://www.live2d.com/sdk/download/web/) 에서 SDK 다운로드 (약간 크기 있는 `.zip`)
2. 압축 해제 후 `Core/live2dcubismcore.min.js` 를 이 디렉토리에 복사:
   ```
   vendor/live2dcubismcore/
   ├── .gitignore
   ├── README.md
   └── live2dcubismcore.min.js   ← 여기 (gitignored)
   ```
3. 프로젝트 루트에서 검증 + 앱들로 복사:
   ```bash
   pnpm exec node scripts/setup-cubism-core.mjs
   ```
   성공 메시지:
   ```
   [cubism-core] ✅ source 검증 OK (bytes=..., sha256=...)
   [cubism-core] ✅ apps/web-preview/public/vendor/live2dcubismcore.min.js 복사
   [cubism-core] ✅ apps/web-editor/public/vendor/live2dcubismcore.min.js 복사
   ```

## 라이선스 경계

- Live2D Cubism Core 는 **Live2D Inc. 의 proprietary 소프트웨어**
- 라이선스: https://www.live2d.com/en/sdk/license/
- **개인/소규모** 비상업 이용은 무상. **상업 배포 시 별도 계약** 필요 (2026-04-24 현재 이 프로젝트 스코프는 비상업 장난감 범위)
- **재배포 금지** — 그래서 이 저장소에 파일을 포함하지 않는다.

## 관련

- [`docs/adr/001-renderer-integration.md`](../../docs/adr/001-renderer-integration.md) — 렌더러 통합 경로 (pixi-live2d-display-advanced 채택)
- [`docs/adr/002-cubism-core-bundle.md`](../../docs/adr/002-cubism-core-bundle.md) — 본 Core 번들 정책
- [`scripts/setup-cubism-core.mjs`](../../scripts/setup-cubism-core.mjs) — 검증 + 배포 스크립트
