# @geny/web-preview

Geny 2D Avatar Foundation Exit #1 의 **수동 E2E 테스트 드라이버**. 템플릿/아바타 → 번들 → 브라우저 프리뷰까지의 흐름을 한 명령으로 재현한다.

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

## 범위 제한 (Stage 2)

- **렌더링 없음** — `<geny-avatar>` 가 로드/이벤트까지만 담당. WebGL 도입은 Stage 3.
- **Integrity 검증 없음** — `manifest.files[].sha256` 은 참조용 (SubtleCrypto 검증은 차후).
- **Cubism 실제 moc3 없음** — `aria.moc3` 는 placeholder. 구조 검증만 가능.
