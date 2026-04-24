# 04. 로드맵

"완성" 의 정의: **비개발자가 웹 브라우저에서 프리셋 선택 → 텍스처 생성 또는 업로드 → 실시간 프리뷰 → Live2D 번들 다운로드** 를 5 분 안에 끝낼 수 있는 제품.

각 Phase 는 **데모 가능한 사용자 시나리오**로 끝난다. 내부 산출물만 있고 사용자 관점에서 진보 없는 Phase 는 허용하지 않는다.

세부 실행 계획(파일 단위 · 테스트 기준)은 [`docs/05-EXECUTION-PLAN.md`](./05-EXECUTION-PLAN.md).

---

## Phase 0 — Scope Reset (진행 중)

**데모 목표**: "문서와 코드가 같은 스코프를 말한다" 를 git 으로 증명.

- [x] 아카이브 (`archive/docs/`, `archive/progress_old/`)
- [x] `docs/00~04` 새 기준 문서
- [ ] 코드 OFF-GOAL 격리 — Phase 0 의 마지막 작업 (별도 세션)
- [x] `rig-templates/base/halfbody/v1.0.0 ~ v1.2.0` archive 이동 (P0.3.3), `fullbody/v1.0.0` 는 동결
- [ ] 루트 README + archive README + memory 갱신

**검수**: `pnpm run validate:schemas` 그린 + README 의 모든 패키지/앱 링크가 존재하는 디렉토리를 가리킴.

---

## Phase 1 — mao_pro 프리셋 편입 + 웹 프리뷰 first pixel

**데모 목표**: 로컬 웹 UI 에서 `mao_pro` 프리셋 선택 → 프리셋 기본 텍스처 (mao 의 원본 `texture_00.png`) 가 PixiJS 로 실제 픽셀 렌더. 파라미터·모션·표정 동작.

- [x] `scripts/rig-template/import-cubism-preset.mjs` — Cubism 원본 → rig-template 래퍼 자동 변환 (P1.A 2026-04-24)
- [x] `rig-templates/base/mao_pro/v1.0.0/` 구축 (template.manifest · parameters · deformers · parts · physics · pose · motions · expressions · atlas · runtime_assets/.moc3) — **P1.A 완료**
- [ ] `scripts/rig-template/extract-atlas.mjs` — `.moc3` 파싱 → per-drawable atlas slots (P3 per-slot 텍스처 생성 시 필요)
- [ ] `halfbody/v1.3.0/textures/atlas.json` slots 채움 (같은 스크립트 재사용)
- [ ] `pnpm run validate:schemas` + `scripts/rig-template/physics-lint.mjs` 통과
- [x] `@geny/web-avatar-renderer-pixi` 구조 프리뷰 수준 구현 — grid placeholder (P1 이전 β 결과)
- [ ] `@geny/web-avatar-renderer-pixi` **first-pixel** — `.moc3` 실제 렌더 (P1.4)
  - [x] **P1.C**: renderer 통합 경로 ADR 확정 → `docs/adr/001-renderer-integration.md` (pixi-live2d-display 채택)
  - [ ] **P1.D**: Cubism Core 번들 정책 ADR + 의존성 추가 (blocking — 라이선스 검토 필요)
  - [ ] **P1.E**: `PixiLive2DRenderer` 어댑터 + mao_pro 번들 브라우저 재생 Playwright E2E
- [ ] `apps/web-preview` (또는 `web-editor` 최소판) — 프리셋 드롭다운 + 기본 텍스처 렌더
- [ ] 파라미터·모션·표정 이벤트 확인

**검수**: 브라우저에서 mao_pro 로드 → 눈·입·머리 흔들림·표정 변경 모두 동작하는 스크린 녹화 1 건.

---

## Phase 2 — 웹 UI 기본 + 수동 텍스처 업로드 / Recolor / 다운로드

**데모 목표**: 비개발자가 웹 UI 에서 프리셋 선택 → PNG 업로드 (또는 base 리컬러) → 프리뷰 → 번들 zip 다운로드. AI 없이 end-to-end.

- [ ] `apps/api` 신설 — Express 또는 Fastify, `/api/presets`, `/api/texture/upload`, `/api/build`, `/api/bundle/:id`
- [ ] `apps/web-editor` Phase-1 미니 UI 확장:
  - Preset catalog dropdown
  - Source: Upload PNG / Recolor base
  - Preview canvas
  - Download button
- [ ] PNG 업로드 검증 (크기·포맷·슬롯 커버리지)
- [ ] Recolor: 클라이언트 Canvas HSL shift
- [ ] `exporter-core avatar` 백엔드 래퍼 → 번들 디렉토리 생성
- [ ] zip 스트리밍
- [ ] 두 프리셋 (mao_pro, halfbody v1.3.0) 모두에서 동일 플로우 동작
- [ ] UI 스타일링 최소 (읽히는 수준)

**검수**: 낯선 사용자가 5 분 이내 업로드 → 다운로드 → 외부 Cubism Viewer 재생 성공.

---

## Phase 3 — AI 텍스처 단일 생성 통합

**데모 목표**: 웹 UI 에서 프롬프트 입력 → Generate 버튼 → 30 초 이내 AI 생성 텍스처가 프리뷰에 표시 → 다운로드.

- [ ] `ai-adapter-core` 에 `capability: texture_atlas_generate` 추가
- [ ] 어댑터 1 종 구현 (`@geny/ai-adapter-nano-banana` 재활용 또는 새로운 Gemini/SDXL 어댑터)
- [ ] `schema/v1/texture-manifest.schema.json` 신설
- [ ] 백엔드 `/api/texture/generate` — `ai-adapter-core.orchestrate()` 호출, provenance 기록
- [ ] 캐시 key `(preset_id, prompt, seed, adapter)` 로 결정론적 재생
- [ ] 프런트 진행 상태 (SSE 또는 polling)
- [ ] 벤더 키 env 관리 (`.env.local` 예시 + 배포 Secret)
- [ ] 오류·안전성 필터 핸들링 (UNSAFE_CONTENT 등)

**검수**: 5 가지 서로 다른 프롬프트 → 5 가지 다른 아바타가 동일 프리셋 위에서 재생.

---

## Phase 4 — 슬롯별 생성 + 부분 재생성 + 스타일 일관성

**데모 목표**: UI 에서 특정 파츠 클릭 → "regenerate this slot" → 해당 슬롯만 새로 생성. 팔레트 락·스타일 참조로 나머지와 일관성 유지.

- [ ] 슬롯별 프롬프트 확장 로직 (전역 + semantic 태그 + override)
- [ ] `palette.schema.json` 활용 한 색 일관성 락
- [ ] Inpainting 어댑터 또는 per-slot generate + 정합 보정
- [ ] `packages/post-processing` 재활용 — 슬롯 경계 블렌딩
- [ ] UI 에 파츠 선택 hit-test (PixiJS 에서 드로어블 클릭) + 슬롯 하이라이트
- [ ] "regenerate selected slot" 엔드포인트
- [ ] 여러 슬롯 변경 이력 undo/redo (local state)

**검수**: "파란 머리 아바타" → 머리만 빨강으로 재생성 → 옷·얼굴 유지, 경계 자연.

---

## Phase 5 — 다중 프리셋 확장 + 프리셋 저작 가이드

**데모 목표**: 두 번째 derived preset (예: `fullbody` 되살리거나 새 `chibi` 저작) 이 동일 UI 에서 동작. 외부 저작자가 프리셋 추가 절차를 따라할 수 있는 문서.

- [ ] 두 번째 프리셋 선택 (fullbody 재활성 vs chibi 신저작) — 팀 결정
- [ ] 저작 → 파일 트리 분해 → 카탈로그 등재
- [ ] Preset catalog UI 에서 카테고리 탭 / 썸네일
- [ ] `docs/06-PRESET-AUTHORING-GUIDE.md` 신설 (Cubism Editor 워크플로우 + 파일 분해 + 등재 튜토리얼)
- [ ] 사용자 업로드 `.moc3` 등재 경로 (실험적, 프리뷰만)

**검수**: 두 프리셋 간 전환 즉시 (< 1s) 프리뷰 재렌더 + 각 프리셋에서 AI 생성 성공.

---

## Phase 6 — 배포 + 사용성 다듬기 + Launch

**데모 목표**: 공개 URL 에서 누구나 아바타 1 체 만들기 가능. 라이선스·rate limit·관측 갖춤.

- [ ] 프런트엔드 정적 hosting (Vercel/Cloudflare Pages)
- [ ] 백엔드 Node 서비스 배포 (Cloud Run / Fly / Render)
- [ ] AI 벤더 키 Secret management (GCP Secret Manager 또는 vendor-specific)
- [ ] Rate limit (IP 기준 분당 N 회, 월 사용량 cap)
- [ ] 로그·metrics (`packages/metrics-http` 재활성화, Grafana 또는 Cloud 기본 관측)
- [ ] 라이선스 표시 (mao_pro 는 Live2D 라이선스, 생성물은 사용자 귀속)
- [ ] 결제·인증 (초안: 익명 무료 quota 만, 인증은 Phase 7+)
- [ ] README "Try it live" 배지
- [ ] 초기 사용성 테스트 (비개발자 5 명, 5 분 과제)

**검수**: 공개 URL 이 90 일간 99% uptime + 월 N 명 아바타 생성 (숫자 결정).

---

## 가드레일

| 가드 | 내용 |
|---|---|
| Scope 팽창 금지 | 리그 에디터 · 3D · 파츠 분해 UI 는 본 리포에 들어오지 않는다 |
| 프리셋 우선 | 프리셋(카탈로그) 완성 전에 생성기 품질 튜닝 금지 |
| 수동 경로 유지 | AI 없이도 파이프라인 전체가 돌아야 한다 (수동 업로드 = 1st-class) |
| 웹 UI 는 제품 | CLI 는 개발 도구일 뿐, README 의 "Try it live" 는 웹 URL 이어야 한다 |
| 결정론 | 동일 입력 → 동일 바이트. 회귀 테스트를 깨지 않는다 |
| 3rd-party 라이선스 | `mao_pro_ko/` 원본 파일 수정 금지. 편입은 metadata 레이어만 |

## Phase 간 판단 질문

| Phase 끝 | 질문 |
|---|---|
| 0 | 문서와 코드가 같은 말을 하는가? (OFF-GOAL 잔재 제거 완료?) |
| 1 | PixiJS 렌더가 Cubism SDK 대비 품질 차이 없이 동작하는가? (아니면 Phase 확장) |
| 2 | 비개발자가 업로드 → 다운로드까지 헤매지 않는가? |
| 3 | AI 생성 품질이 "쓸 만" 수준인가? Phase 4 로 가나, 품질 튜닝에 추가 세션? |
| 4 | 부분 재생성이 UX 로 자연스러운가? |
| 5 | 새 프리셋 추가가 1 주 내 가능한가? |
| 6 | Launch 가능 상태인가? 미해결 블로커는? |

## Phase 별 예상 규모 (현재 추정)

| Phase | 세션 수 | 주요 산출물 |
|---|---|---|
| 0 | 2 (문서 완료 + 코드 격리) | archive 완료, 코드 정리 |
| 1 | 4~6 | mao_pro 편입, atlas extraction, PixiJS first pixel |
| 2 | 4~6 | `apps/api`, web-editor 기본, 업로드/다운로드 |
| 3 | 4~6 | AI 통합, texture-manifest schema, provenance |
| 4 | 5~8 | 슬롯별 생성, 블렌딩, hit-test UI |
| 5 | 3~5 | 두 번째 프리셋, 저작 가이드 |
| 6 | 3~5 | 배포, rate limit, 관측 |
| **합계** | **25~36 세션** | 공개 URL β launch |

각 Phase 마다 `docs/05-EXECUTION-PLAN.md` 에서 세션 단위 deliverable 을 정의.
