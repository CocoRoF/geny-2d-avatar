# @geny/web-preview

Geny 2D Avatar 개발용 **로컬 프리뷰 앱**. 두 페이지 제공:
- `/` (index.html) — 번들 메타데이터 디버그 패널 (렌더 없음)
- `/live2d-demo.html` — **실제 Live2D 렌더 데모 (P1.5)**. mao_pro 프리셋을 `createPixiLive2DRenderer` 로 렌더.

## 빠른 시작

```bash
pnpm install                                    # workspace 설치
pnpm --filter @geny/web-preview run build:public  # 번들 생성 + @geny/web-avatar 컴파일 복사
pnpm --filter @geny/web-preview run serve         # http://localhost:4173
```

혹은 한 줄로:

```bash
pnpm --filter @geny/web-preview run dev
```

### 기대 결과

브라우저에서:
- 상태 박스: `ready — tpl.base.v1.halfbody@1.2.0` (녹색).
- Bundle Manifest / Web Avatar Meta / Atlas 3 섹션이 채워져 있음.
- DevTools → Network: bundle.json · web-avatar.json · atlas.json · textures/base.png 모두 200.

## 구조

```
apps/web-preview/
├── index.html            # <geny-avatar src> + metadata 패널
├── scripts/
│   ├── prepare.mjs       # 빌드 + 번들 2종 생성 (public/ 에 수집)
│   └── serve.mjs         # Node 내장 http 로 정적 서빙
└── public/               # 생성물 (gitignored)
    ├── vendor/           # @geny/web-avatar dist 복사본
    ├── sample/           # halfbody v1.2.0 web-avatar 번들 (<geny-avatar> 로딩 대상)
    ├── cubism/           # aria Cubism 번들 (다운로드/검증용)
    └── INDEX.json        # 아티팩트 메타
```

## 내부 동작

- `scripts/prepare.mjs`:
  1. `pnpm --filter @geny/exporter-core run build`
  2. `pnpm --filter @geny/web-avatar run build`
  3. `packages/web-avatar/dist/*` → `public/vendor/`
  4. `loadTemplate(rig-templates/base/halfbody/v1.2.0)` → `assembleWebAvatarBundle(..., public/sample, { avatarId: "avt.preview.halfbody.demo" })`.
  5. `samples/avatars/sample-01-aria.export.json` → `assembleAvatarBundle(..., rig-templates, public/cubism)`.
- `index.html`: `<geny-avatar src="./public/sample/bundle.json">` + `ready/error` 리스너 → `<dl>` 3개에 메타 렌더.
- `scripts/serve.mjs`: Node `http` 모듈 기반 정적 서버 (MIME 매핑 포함, dependency zero).

## 체크리스트

종합 절차는 `progress/exit-gates/01-single-avatar-e2e.md` 참조.

## 범위 제한

- **`/` 메타데이터 뷰**: `<geny-avatar>` 가 로드/이벤트까지만 담당. 렌더는 하지 않음 (역사적 Stage 2 페이지).
- **`/live2d-demo.html` (P1.5)**: 실제 PIXI + Live2DModel 렌더 ⚠️ Cubism Core 수동 설치 필요.
- **Integrity 검증 없음** — `manifest.files[].sha256` 은 참조용 (SubtleCrypto 검증은 차후).

## `/live2d-demo.html` 사용

### 사전 조건

Live2D Cubism Core (proprietary) 는 재배포 금지라 저장소에 포함되지 않음 (ADR 002).
사용자 수동 설치:

```bash
# 1. Live2D SDK for Web 다운로드 후 압축 해제
#    https://www.live2d.com/sdk/download/web/

# 2. Core/live2dcubismcore.min.js 를 저장소 vendor 디렉토리로 복사
cp <SDK_EXTRACTED>/Core/live2dcubismcore.min.js vendor/live2dcubismcore/

# 3. 앱 public/vendor/ 로 복사 (프로젝트 루트에서)
pnpm exec node scripts/setup-cubism-core.mjs

# 4. web-preview 빌드 + 서브
pnpm -F @geny/web-preview build:public
pnpm -F @geny/web-preview serve
# → http://localhost:4173/live2d-demo.html
```

### 기대 결과

- 상태 박스: **"✅ mao_pro 로드 성공"** (녹색).
- 좌측 PIXI canvas 에 니지이로 마오 3rd-party 프리셋 렌더.
- 우측 슬라이더 (ParamAngleX/Y/Z/BodyAngleX/MouthOpenY) 로 파츠 조작 가능.
- 모션 버튼 (예: Idle / TapBody) 재생.
- 표정 버튼 (exp_01~exp_08 / reset) 적용.

### 실패 시

- **❌ Cubism Core 미로드**: 위 1~3 단계 확인. vendor/live2dcubismcore/live2dcubismcore.min.js 파일이 존재하는지.
- **❌ 모델 로드 실패**: DevTools Network 탭에서 mao_pro.moc3 / texture_00.png / *.motion3.json 등이 404 인지 확인. `pnpm -F @geny/web-preview build:public` 재실행.
