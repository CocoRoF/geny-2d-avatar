# Foundation Exit #1 — 단일 아바타 생성 → 프리뷰 → Cubism export

- 대상 exit 게이트: `docs/14 §3.3` 항목 1번.
- 도구: `apps/web-preview/` (세션 19) + `@geny/exporter-core` CLI (세션 08–15) + `@geny/web-avatar` 런타임 (세션 15, 18).
- 범위: Foundation 레벨은 "수동 테스트 성공" 이 기준. 본 문서는 재현 가능한 E2E 체크리스트.

## 선행 조건

1. `pnpm install` (workspace root).
2. Node 22.11.0 이상. `.nvmrc` 사용 시 `nvm use`.

---

## 체크리스트

### A. 템플릿 무결성 (스키마 축)

- [ ] `pnpm run validate:schemas` → `checked=133 failed=0` (17 schemas).
- [ ] `pnpm run test:golden` → 5 step all pass (exporter-core 93 tests + 3 bundle diffs).

### B. 아바타 "생성" (export.json → bundle)

- [ ] `samples/avatars/sample-01-aria.export.json` 로 번들 빌드:
  ```
  pnpm --filter @geny/exporter-core run build
  node packages/exporter-core/bin/exporter-core.mjs avatar \
    --export samples/avatars/sample-01-aria.export.json \
    --rig-templates rig-templates \
    --out-dir /tmp/aria-e2e
  ```
- [ ] 결과 파일 수 15 (cdi3/model3/pose3/physics3 + motions 7 + expressions 3 + bundle.json).
- [ ] `/tmp/aria-e2e/bundle.json` 의 `files[]` sha256 와 `samples/avatars/sample-01-aria.bundle.snapshot.json.files[]` 일치 (파일 수 15, 총 36122 bytes).

### C. Cubism export 검증

- [ ] `/tmp/aria-e2e/aria.model3.json` 열어 FileReferences 확인:
  - `Moc == "aria.moc3"`, `Textures == ["textures/aria_00.png"]` (export.json 값 그대로).
  - `Expressions` 3 엔트리, `Motions` 7 엔트리.
  - `HitAreas` 2 엔트리 (`Body`, `Head`).
- [ ] `/tmp/aria-e2e/aria.physics3.json` 존재, `Meta.TotalInputCount` >= 9 setting.
- [ ] (선택) Live2D Cubism Viewer 에서 `aria.model3.json` 로드 → moc3/텍스처는 placeholder 이므로 "파일 없음" 경고 정상. model3 구조 자체는 valid.

### D. Web 프리뷰 (런타임 축)

- [ ] 아티팩트 준비: `pnpm --filter @geny/web-preview run build:public`
  - 기대: `public/sample/bundle.json` (kind=web-avatar-bundle, 4 files, halfbody v1.2.0), `public/cubism/bundle.json` (kind=cubism-bundle, aria 15 files), `public/vendor/index.js` (컴파일된 @geny/web-avatar).
- [ ] 서버 기동: `pnpm --filter @geny/web-preview run serve` (기본 포트 4173).
- [ ] 브라우저에서 `http://localhost:4173/` 방문.
- [ ] **상태** 박스가 `ready — tpl.base.v1.halfbody@1.2.0` (녹색) 로 전환. 실패(빨강) 시 DevTools Console 확인.
- [ ] **Bundle Manifest** 섹션:
  - `kind == web-avatar-bundle`, `avatar_id == avt.preview.halfbody.demo`.
  - `files (count) == 3` (atlas.json + web-avatar.json + textures/base.png — bundle.json 자신 제외).
- [ ] **Web Avatar Meta**:
  - `parameter_groups >= 1`, `parameters >= 1`, `parts >= 1`, `motions >= 1`, `expressions >= 1`.
  - `physics_summary` 는 `N setting / M output` 형태 (N≥9 for halfbody v1.2.0).
  - `atlas ref` 에 `atlas.json (sha256 앞 12자)` 표시.
- [ ] **Atlas**: `textures` 에 `textures/base.png · 4×4 · png` 라인 1개.

### E. 회귀 안전장치

- [ ] 번들 재생성 결정론: `pnpm --filter @geny/web-preview run build:public` 을 다시 실행해도 `public/sample/bundle.json` 바이트가 동일 (golden 과 같음). 
- [ ] `pnpm run test:golden` 이 여전히 5 step green.

---

## 합격 기준

A~D 모든 항목 ✅ 시 Foundation Exit #1 통과로 간주. E 는 CI 자동화(세션 10) 로 지속 감시.

현재 미구현 → 차단 아님 (Foundation 범위 밖):
- GPU 렌더링 · 파라미터/모션/표정 실시간 제어 (Stage 3+).
- moc3 실제 바이너리 (AI 파이프라인 도입 이후).
- 브라우저 자동 E2E (Playwright 등, 차후 Platform 스트림).

## 알려진 한계

- D 단계의 “프리뷰”는 **메타데이터 렌더** 까지. 그래픽 프레임을 그리지 않음.
- moc3 placeholder 로 인해 C 단계의 Cubism Viewer 실로딩은 실패 (구조 검증만 가능).
- `aria.export.json` 의 `avatar_id = av_01J...` 는 ULID 정규식은 맞으나 실 DB 에 등록되지 않음 — Foundation 범위 밖.

## 다음 단계

Foundation 이후:
1. Playwright 로 D 단계를 자동화 — `ready` 이벤트 수신 여부 + DOM snapshot.
2. moc3 placeholder → 실제 moc3 (AI 파이프라인 Session 21+).
3. `<geny-avatar>` 에 rendering surface (WebGL canvas) 추가 (Stage 3).
