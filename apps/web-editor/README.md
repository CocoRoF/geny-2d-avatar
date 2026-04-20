# @geny/web-editor

Geny 2D Avatar **Foundation 에디터 스캐폴드** (세션 81). docs/09 §4.3 의 3-column UX 골격 —
TopBar / Parts 사이드바 / Preview Stage / Inspector — 을 정적으로 구현하고, halfbody v1.2.0
번들 메타를 실 DOM 라이프사이클로 바인딩한다. 저장/재생성/Export 등 Runtime 액션은
세션 82+ 범위.

## 빠른 시작

```bash
pnpm install
pnpm --filter @geny/web-editor run build:public
pnpm --filter @geny/web-editor run serve     # http://localhost:4174
```

혹은 한 줄로:

```bash
pnpm --filter @geny/web-editor run dev
```

## 기대 결과

브라우저에서:
- 상단바: `Geny Editor · avt.editor.halfbody.demo` + Save/History/Share/Export (비활성, Runtime 대기).
- 좌측 Parts 사이드바: Face · Hair · Body · Accessory 4 카테고리로 그룹된 파츠 리스트.
- 파츠 클릭 → 우측 Inspector 에 `slot_id / role / category` 표시 (read-only).
- 중앙 Preview: Stage 박스 + "Stage 3+ 렌더러 합류 예정" 힌트 (DOM 엘리먼트는 이벤트까지만).

## 구조

```
apps/web-editor/
├── index.html            # 3-column 레이아웃 + categoryOf() prefix 규칙
├── scripts/
│   ├── prepare.mjs       # exporter-core + web-avatar 빌드 → public/ 조립
│   ├── serve.mjs         # Node 내장 http 정적 서버 (port 4174)
│   └── e2e-check.mjs     # Foundation CI 의 무인 E2E (HTTP + loader + DOM lifecycle)
└── public/               # 생성물 (gitignored)
    ├── vendor/           # @geny/web-avatar dist 복사본
    ├── sample/           # halfbody v1.2.0 web-avatar 번들 (avatarId=avt.editor.halfbody.demo)
    └── INDEX.json        # 아티팩트 메타
```

## 범위 제한 (Stage 2)

- **렌더링 없음** — `<geny-avatar>` 는 이벤트 수신까지만. 중앙 Stage 는 플레이스홀더.
- **상태 저장 없음** — Inspector 변경/Save/History/Share/Export 모두 Runtime(세션 82+) 에서 합류.
- **Prompt / Style Profile / Regenerate 없음** — 생성 API 결속은 docs/09 §4.3.2 에 따라 Runtime 이후.
- **번들 다양성 없음** — halfbody v1.2.0 1종만. fullbody/chibi 스위칭은 Stage 3+.

## 내부 동작

- `prepare.mjs`:
  1. `@geny/exporter-core` / `@geny/web-avatar` 빌드.
  2. `packages/web-avatar/dist/*` → `public/vendor/`.
  3. `assembleWebAvatarBundle(halfbody v1.2.0, public/sample, { avatarId: "avt.editor.halfbody.demo" })`.
  4. `public/INDEX.json` 매니페스트 기록.
- `index.html`:
  - `<geny-avatar src="./public/sample/bundle.json">` 에 `ready` 리스너.
  - `categoryOf(role)` — prefix 기반 Face/Hair/Body/Accessory 분류 (27 고유 role 전부 커버).
  - 파츠 클릭 시 Inspector 에 `slot_id/role/category` 표시.
- `e2e-check.mjs`:
  - prepare → serve → HTTP 200 체크 (6 경로) → loader 체인 (avatar_id 일치) →
    categorize 어서션 (4 카테고리 모두 ≥1, Other=0) → `<geny-avatar>` happy-dom ready.

## 관련 체크리스트

- Foundation Exit #1 — `progress/exit-gates/01-single-avatar-e2e.md`
- UX 레이아웃 사양 — `docs/09-editor-ux-ux-layout.md` §4.3
