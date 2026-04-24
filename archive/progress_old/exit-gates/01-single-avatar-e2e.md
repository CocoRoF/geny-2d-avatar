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

**D-자동 (세션 20/23/45 도입 — 모두 CI 포함)**:
- [ ] `pnpm --filter @geny/web-preview run test` 1발 실행 → `✅ web-preview e2e pass`.
  - 내부: prepare → serve(random port) → HTTP 6종 200 + MIME 검증 → `loadWebAvatarBundle` 체인 (manifest/meta/atlas) 검증 → **`<geny-avatar>` happy-dom 라이프사이클 (HTTP URL 에 대한 setAttribute("src") → ready 페이로드 필드 어서션, 세션 45)** → serve 종료. 실패 시 non-zero exit.
- [ ] `pnpm run test:golden` 의 step 6 `web-preview e2e` 도 same (CI 자동 회귀).
- [ ] D-자동 어서션이 이전 D-시각 수동 체크리스트(상태/Manifest/Meta/Atlas) 와 1:1 대응: `template_id@template_version`, `avatar_id`, `files.length === 3`, `meta.parameters/parts/motions/expressions > 0`, `meta.physics_summary` 존재, `atlas.textures[0] == textures/base.png · 4×4 · png`.

**D-수동 (선택)** — 실 브라우저 시각 확인용 (Exit 게이트에는 무관 — D-자동이 동일 필드 커버):
- [ ] `pnpm --filter @geny/web-preview run dev` → `http://localhost:4173/` 방문하여 4 섹션이 D-자동 어서션과 동일하게 채워지는지 육안 확인.

### E. 회귀 안전장치

- [ ] 번들 재생성 결정론: `pnpm --filter @geny/web-preview run build:public` 을 다시 실행해도 `public/sample/bundle.json` 바이트가 동일 (골든과 같음). 
- [ ] `pnpm run test:golden` 이 **6 step** green (세션 20 기준).

---

## 합격 기준

A~D 모든 항목 ✅ 시 Foundation Exit #1 통과로 간주. E 는 CI 자동화(세션 10/20) 로 지속 감시.

현재 미구현 → 차단 아님 (Foundation 범위 밖):
- GPU 렌더링 · 파라미터/모션/표정 실시간 제어 (Stage 3+).
- moc3 실제 바이너리 (AI 파이프라인 도입 이후).
- ~~Custom Element DOM lifecycle 자동 검증~~ — 세션 45 에서 happy-dom + HTTP URL 경로가 `<geny-avatar>` ready 페이로드를 검증 (세션 23 의 file:// 커버와 상보).

## 알려진 한계

- D 단계의 “프리뷰”는 **메타데이터 렌더** 까지. 그래픽 프레임을 그리지 않음.
- moc3 placeholder 로 인해 C 단계의 Cubism Viewer 실로딩은 실패 (구조 검증만 가능).
- `aria.export.json` 의 `avatar_id = av_01J...` 는 ULID 정규식은 맞으나 실 DB 에 등록되지 않음 — Foundation 범위 밖.

## 다음 단계

Foundation 이후:
1. ~~`<geny-avatar>` 실 DOM 라이프사이클 검증~~ — ✅ 세션 23 (file:// 경로) + 세션 45 (HTTP + web-preview 번들) 에서 완료. 남은 과제는 **실제 렌더링 표면**.
2. moc3 placeholder → 실제 moc3 (AI 파이프라인 Session 21+).
3. `<geny-avatar>` 에 rendering surface (WebGL canvas) 추가 (Stage 3).
