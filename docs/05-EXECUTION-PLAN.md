# 05. 실행 계획

`docs/04-ROADMAP.md` 를 **세션 단위**로 분해한다. 각 세션은 (a) 단일 PR 로 끝낼 수 있는 일감 + (b) 테스트 통과 + (c) 사용자 관점의 가시적 진보 를 가져야 한다.

세션 ID 체계: `<phase>.<session>.<slug>` (예: `P1.2.atlas-extract`). 이전 β 로드맵의 `P0-S1` 등은 폐기.

---

## Phase 0 — Scope Reset

### P0.1 — 문서 리셋 (완료)

- [x] `docs/00~05` 작성
- [x] `archive/{docs,progress_old}` 로 이전
- [x] `README.md` 재작성

### P0.2 — 코드 OFF-GOAL 격리

**deliverable:**

- 격리 대상을 `packages/_deprecated/` 로 이동 + `pnpm-workspace.yaml` 에서 제외:
  - `packages/migrator`
  - `packages/job-queue-bullmq`
  - `packages/exporter-pipeline`
  - `packages/ai-adapters-fallback`
- 서비스/앱:
  - `services/orchestrator` → `services/_deprecated/orchestrator`
  - `apps/worker-generate` → `apps/_deprecated/worker-generate`
- `rig-templates/base/halfbody/v1.0.0 ~ v1.2.0` → `archive/rig-templates/halfbody/`
- 각 `_deprecated` 폴더 README 에 이유·복귀 조건 기록
- 루트 `package.json` scripts 중 격리된 패키지 참조 제거
- CI workflow (`test-golden.mjs`) 에서 격리 패키지 의존 스텝 제거

**테스트:**
- `pnpm install --frozen-lockfile` 성공
- `pnpm run validate:schemas` 그린
- `pnpm -F @geny/exporter-core test` 그린
- `pnpm run test:golden` 그린 (축소된 스코프)

**검수:** 격리 후 남은 packages 가 ALIGNED + ADJACENT 만 구성. README 의 repo layout 표기와 실제 디렉토리 일치.

---

## Phase 1 — mao_pro 편입 + First Pixel

### P1.1 — `.moc3` 해부 & atlas extraction 스크립트

**deliverable:**
- `scripts/rig-template/extract-from-moc3.mjs` 신설:
  - 입력: `.moc3` 경로 + output rig-template 디렉토리
  - 출력: `parameters.json`, `deformers.json`, `parts/*.spec.json`, `textures/atlas.json` (slots 추출) 자동 생성
  - Live2D Cubism Core (WASM 또는 JS) 사용. `.moc3` 의 CSMMoc 구조를 파싱.
- 단위 테스트: `mao_pro_ko/runtime/mao_pro.moc3` 로 실행 → 기대 슬롯 수(드로어블 수) 일치
- `docs/01 §6` "3rd-party preset 편입" 섹션에 사용법 명시

**테스트:**
- 스크립트 실행 결과가 schema 통과
- drawable ID 추출이 `mao_pro.cdi3.json` 의 Parts 와 cross-check

**검수:** 스크립트 한 줄로 mao 의 JSON 파일들이 생성됨.

### P1.2 — `rig-templates/base/mao_pro/v1.0.0/` 편입

**deliverable:**
- `template.manifest.json` (origin = third-party / Live2D Inc. / mao_pro_ko)
- `parameters.json`, `deformers.json`, `parts/*.spec.json` (P1.1 스크립트 출력)
- `physics/physics.json` — `mao_pro_ko/runtime/mao_pro.physics3.json` 을 `physics.schema.json` 래핑
- `physics/design_notes.md` — 16 PhysicsSetting 요약 + halfbody 매핑 포인터
- `pose.json` — `mao_pro.pose3.json` 변환
- `motions/*.json` — `mao_pro_ko/runtime/motions/*.motion3.json` 을 motion-pack 으로 래핑 (7 개)
- `expressions/*.json` — `mao_pro_ko/runtime/expressions/*.exp3.json` 을 expression-pack 으로 래핑 (8 개)
- `textures/atlas.json` — P1.1 스크립트 출력
- `textures/base.png` — `mao_pro_ko/runtime/mao_pro.4096/texture_00.png` 복사 (원본 보존)
- `runtime_assets/mao_pro.moc3` — 원본 복사
- `README.md` — 프리셋 요약 + 라이선스 재명시

**테스트:**
- `pnpm run validate:schemas` → `mao_pro` 포함 전부 그린
- `scripts/rig-template/physics-lint.mjs --template rig-templates/base/mao_pro/v1.0.0` 그린
- `node packages/exporter-core/bin/exporter-core.mjs bundle --template rig-templates/base/mao_pro/v1.0.0 --out-dir /tmp/mao-bundle` 성공

**검수:** mao_pro 프리셋이 exporter-core CLI 에서 halfbody 와 동일하게 소비됨.

### P1.3 — halfbody v1.3.0 atlas slots 채움

**deliverable:**
- `halfbody/v1.3.0` 의 `runtime_assets/` 가 없으므로, **derived preset 용 atlas extraction** 은 Cubism Editor 에서 export 된 `.moc3` 필요
- halfbody v1.3.0 용 `.moc3` 가 있으면 P1.1 스크립트 재사용
- 없으면 수기로 placeholder 슬롯 정의 (추후 실 moc3 export 때 대체)
- `base.png` 를 4×4 placeholder → 4096×4096 로 교체 (검은색/그리드 등 디버깅 유용 이미지)

**테스트:**
- `validate:schemas` 그린
- test-golden 갱신 (halfbody v1.3.0 번들이 새 atlas 반영)

**검수:** halfbody v1.3.0 프리셋도 실제 texture_00.png 로 렌더 가능.

### P1.4 — `@geny/web-avatar-renderer-pixi` first pixel

**deliverable:**
- Cubism Framework for Web 또는 직접 `.moc3` 디코딩 + PixiJS 매핑
- `rendererPixi.loadBundle(bundleUrl)` → PIXI.Application canvas 에 렌더
- 파라미터 바인딩: `setParameter(id, value)` → PixiJS transform 갱신
- 모션 재생: `playMotion(pack)` → 파라미터 키프레임 재생
- 표정: `setExpression(id)` → 파라미터 오버레이
- 단위 테스트: Node 에서는 happy-dom limit 으로 mock, 실 픽셀 검증은 Playwright 도입 검토 (또는 수동)

**테스트:**
- mao_pro 번들 로드 → 초기 프레임 rendered (픽셀 alpha > 0 영역 존재)
- 파라미터 변경 이벤트 → 다음 프레임 변화 감지

**검수:** 브라우저 데모 페이지에서 mao_pro 가 움직인다.

### P1.5 — `apps/web-preview` 최소 통합

**deliverable:**
- Vite 기반 single-page
- `/` : 프리셋 드롭다운 (로컬 `rig-templates/` 스캔)
- 프리셋 선택 → `exporter-core` CLI 로 번들 빌드 (수동 실행 또는 단순 Vite 플러그인)
- `<geny-avatar>` 에 번들 로드
- 컨트롤 패널: 파라미터 슬라이더 (head_angle_x 등 주요 5~10 개), 모션 버튼, 표정 드롭다운
- Phase 1 스코프에서는 텍스처 교체 없음 — 프리셋의 base.png 만 렌더

**테스트:**
- `pnpm -F web-preview dev` 실행 → http://localhost:5173 에서 mao_pro 로드 확인

**검수:** 녹화 1 분 영상 — mao_pro 로드 → 파라미터 움직이기 → 모션 재생.

### P1 종료 판단

- PixiJS 렌더 품질이 Cubism Viewer 대비 차이 없음 (수동 비교)
- 프리셋 2 종(mao_pro, halfbody v1.3.0) 모두 frame 1 렌더
- 결정이 필요한 경우: Cubism Framework 번들러 전략, 라이선스 임베딩 방식

---

## Phase 2 — 웹 UI 기본 + 수동 텍스처 + 다운로드

### P2.1 — `apps/api` 서버 스캐폴드

**deliverable:**
- `apps/api` 생성 — Fastify + TS
- `GET /api/presets` — `rig-templates/` 스캔 → `{id, version, title, atlas: {w,h,slots}, thumbnail}` 배열
- `GET /api/presets/:id/:version/atlas.json` — atlas 원본 스트리밍
- 오류 응답 표준 (`{ error: {code, message} }`)
- 로컬 실행 스크립트 (`pnpm -F api dev`)

**테스트:**
- Fastify integration test: `/api/presets` 가 2 개 프리셋 반환

**검수:** 서버 한 줄 실행 → HTTP 로 카탈로그 GET.

### P2.2 — 텍스처 업로드 + 검증

**deliverable:**
- `POST /api/texture/upload` (multipart form)
  - 필드: `preset_id`, `preset_version`, `file` (PNG)
  - 검증: 크기 일치, PNG magic, RGBA, alpha coverage per slot (임계값 통과)
  - 저장: `/var/geny/textures/<uuid>.png` (개발 시 tmp dir)
  - 응답: `{ texture_id, sha256, checks: [...] }`
- 실패 시 구체적 원인 반환

**테스트:**
- 유효/무효 PNG 여러 케이스 단위 테스트
- 4096×4096 PNG 업로드 → 200, 슬롯 비어있는 PNG → 400

**검수:** curl 로 PNG 업로드 성공.

### P2.3 — 번들 빌드 엔드포인트

**deliverable:**
- `POST /api/build`
  - 입력: `{ preset_id, preset_version, texture_ref }`
  - 내부: `avatar.json` 작성 → `exporter-core avatar` 실행 → 번들 디렉토리 생성
  - 응답: `{ bundle_id, bundle_url: "/api/bundle/<id>/bundle.json" }`
- `GET /api/bundle/:id/*` — 번들 파일 정적 서빙
- `GET /api/bundle/:id/download` — zip 스트리밍 (`archiver` 라이브러리)

**테스트:**
- mao_pro + 기본 텍스처로 빌드 → bundle.json 응답
- 다운로드 zip 열어 Cubism Viewer 재생 성공

**검수:** 브라우저에서 다운로드 URL 클릭 → zip 수신.

### P2.4 — `apps/web-editor` Phase-2 UI

**deliverable:**
- Vite + React (또는 Solid) — 선택, 팀 확인
- 페이지 구성:
  - Header: 로고 / GitHub 링크
  - Sidebar: Preset catalog (카드 리스트 with thumbnail)
  - Main: Preview canvas + Texture source tabs (Upload / Recolor)
  - Bottom: Build & Download 버튼
- 프리셋 선택 → `<geny-avatar>` 가 현재 텍스처로 프리뷰
- 업로드 → `POST /api/texture/upload` → 성공 시 새 텍스처로 프리뷰 갱신 (번들 재빌드 or client-side texture swap)
- Build 버튼 → `/api/build` → 다운로드 URL 표시
- 반응형 (최소 너비 1280px)

**테스트:**
- Playwright E2E: 프리셋 선택 → 업로드 → 프리뷰 → 다운로드 버튼 활성화

**검수:** 비개발자 1 명 5 분 테스트. 막힘 없이 다운로드까지 도달.

### P2.5 — Client-side Recolor

**deliverable:**
- Texture source "Recolor" 탭
- base.png 로드 → `<canvas>` HSL shift (Hue 슬라이더 + Saturation + Lightness)
- 결과 Canvas → PNG blob → `/api/texture/upload` 와 동일 경로로 서버 전송 (또는 바로 build 단계로 직렬화)
- 프리셋 그대로 이 텍스처로 번들 빌드

**테스트:**
- 수동: hue 90도 회전 → 프리뷰 색 변화 확인

**검수:** recolor 만으로 "빨강 마오" / "파랑 마오" 변주 생성 데모.

### P2 종료 판단

- 비개발자가 5 분 이내 업로드 → 다운로드
- 다운로드한 zip 이 외부 Cubism Viewer 에서 정상 재생
- 두 프리셋(mao_pro, halfbody) 에서 동일 플로우

---

## Phase 3 — AI 텍스처 단일 생성

### P3.1 — `ai-adapter-core` capability 확장

**deliverable:**
- `schema/v1/ai-adapter-task.schema.json` 에 `capability: "texture_atlas_generate"` 추가
- `schema/v1/ai-adapter-result.schema.json` 에 image binary result 경로 확정 (base64 or URL)
- 기존 `part_generate` capability 는 deprecated 마크 (아직 삭제 X)
- 어댑터 예시 업데이트

**테스트:**
- 스키마 validation + TS 타입 빌드 그린

### P3.2 — `schema/v1/texture-manifest.schema.json` 신설

**deliverable:**
- 필드: `schema_version`, `preset {id, version}`, `atlas_sha256`, `generated_by {mode, strategy, adapter, adapter_attempts}`, `prompt`, `seed`, `slot_fill[]`, `created_at`, `provenance_ref`
- Ajv 검증 스크립트 추가

**테스트:**
- 유효/무효 샘플 픽스처

### P3.3 — AI 벤더 어댑터 1 종 구현

**deliverable:**
- `@geny/ai-adapter-nano-banana` 재활용 또는 `@geny/ai-adapter-<vendor>` 신규
- `capability: texture_atlas_generate` 처리
- 벤더 키는 env 에서만 로드 (`process.env.<VENDOR>_API_KEY`)
- 4096×4096 요청 (벤더 지원 시) 또는 상위 해상도 생성 후 다운샘플
- 결과 PNG sha256 계산
- `attempts[]` 에 요청/응답 사이즈·지연·에러 기록
- 어댑터 테스트 (Mock HTTP)

**테스트:**
- 단위 테스트: Mock 벤더로 success/5xx/timeout/unsafe_content 모두 검증

### P3.4 — `/api/texture/generate` 엔드포인트

**deliverable:**
- `POST /api/texture/generate` — `{preset_id, prompt, seed?, palette_hint?}`
- 내부: `ai-adapter-core.orchestrate()` 호출, cache 활성화
- 결과 PNG 저장 + `texture.manifest.json` 작성
- SSE 진행률 (어댑터 attempts 흐름 실시간 전송)
- 응답: `{ texture_id, sha256, manifest_url }`
- 실패 시 fallback / 오류 메시지

**테스트:**
- Mock 어댑터로 end-to-end
- 동일 (prompt, seed) → 동일 sha256

### P3.5 — Web UI AI 생성 통합

**deliverable:**
- Texture source 탭에 "Generate with AI" 추가
- 프롬프트 textarea + seed input (주사위 아이콘으로 랜덤) + palette hint (color picker ×2)
- "Generate" 버튼 → SSE 진행률 표시 + spinner
- 완료 시 결과 텍스처로 프리뷰 갱신
- 재생성 버튼 (seed 변경)

**테스트:**
- Playwright: 프롬프트 입력 → generate → 30 초 내 프리뷰 갱신

**검수:** 5 개 서로 다른 프롬프트 → 5 개 서로 다른 아바타 (동일 프리셋).

### P3 종료 판단

- AI 결과 품질이 "쓸 만" 수준인가?
- 아니라면 P3.6 (품질 튜닝) 별도 세션 — 프롬프트 템플릿, 해상도, 벤더 교체

---

## Phase 4 — 슬롯별 생성 + 부분 재생성

### P4.1 — 슬롯별 프롬프트 엔진

**deliverable:**
- `packages/texture-orchestrator` 신설 (또는 `ai-adapter-core` 확장)
- 기능: 전역 prompt + 슬롯 semantic 태그 + slot_override → 슬롯별 생성 task 생성
- Palette lock: 이전 생성 텍스처의 주요 색 N 개 추출해 다음 슬롯에 `palette_hint` 주입
- 슬롯별 생성 → 개별 PNG → atlas 패킹 (기존 atlas.json UV 에 맞춰 리사이즈·배치)

**테스트:**
- Mock 어댑터로 30 슬롯 × 500ms 생성 시뮬레이션 → 15s 내 완료

### P4.2 — Inpainting / 부분 재생성

**deliverable:**
- 어댑터 capability: `texture_slot_regenerate` 추가
- 입력: 현재 atlas PNG + slot list + prompt override
- 전략: (a) 기존 atlas 의 해당 슬롯만 Inpainting 또는 (b) 해당 슬롯 새로 생성 후 덮어쓰기
- 결과: 수정된 atlas PNG

### P4.3 — UI hit-test & 슬롯 선택

**deliverable:**
- PixiJS 렌더에서 마우스 클릭 → drawable hit-test → `part_id` 식별
- 해당 파츠 outline 하이라이트
- "Regenerate this part" 버튼
- 프롬프트 override textarea (파츠 전용)

### P4.4 — Undo / Redo

**deliverable:**
- 텍스처 변경 이력 스택 (client-side)
- 서버에는 버전별 PNG 저장 (`/var/geny/textures/<texture_id>/v1.png, v2.png, ...`)
- UI Undo/Redo 버튼

**테스트:**
- 머리→빨강→파랑→초록 변경 후 2회 undo → 빨강 복원

### P4.5 — 슬롯 경계 블렌딩

**deliverable:**
- `packages/post-processing` 재활용 — Gaussian blur / feathering 슬롯 경계
- Color harmony 체크 (LAB 공간 거리 임계값)

**검수:** "파란 머리 아바타" → 머리만 빨강으로 재생성 → 옷·얼굴 그대로, 경계 부드러움.

---

## Phase 5 — 다중 프리셋 + 저작 가이드

### P5.1 — 두 번째 프리셋 결정 & 저작

**deliverable:**
- 팀 결정: fullbody 재활성 vs chibi 신저작
- Cubism Editor 저작 완료 (외부 작업)
- `rig-templates/base/<new>/v1.0.0/` 편입 (P1.1 스크립트 재사용)

### P5.2 — UI 카탈로그 확장

**deliverable:**
- Preset catalog 에 카테고리 탭 (halfbody / fullbody / chibi / 3rd-party)
- 각 프리셋 thumbnail 자동 생성 (`exporter-core` + headless render)
- 프리셋 상세 모달 (파츠 수 · 파라미터 수 · 지원 모션/표정 · 라이선스)

### P5.3 — `docs/06-PRESET-AUTHORING-GUIDE.md`

**deliverable:**
- Cubism Editor 초기 설정 (템플릿·네이밍)
- 저작 가이드 (파츠 분해 기준, PhysicsSetting 가이드)
- `.moc3` export → 스크립트 실행 → 등재 절차 스크린샷 포함
- 사용자 업로드 프리셋 등재 경로 (실험적)

### P5.4 — User Preset Upload (실험적)

**deliverable:**
- `POST /api/presets/upload` — `.moc3` + `.model3.json` + textures 업로드
- 자동 분해 → 임시 preset id 부여 → 세션 내에서만 사용 가능
- 권한: 업로드자 본인만 사용 (로그인 필요 — Phase 6 인증과 연동)

**검수:** 외부 저작자가 가이드만 보고 fullbody 저작 → 1 주 내 UI 에서 동작.

---

## Phase 6 — 배포 & Launch

### P6.1 — 프런트엔드 배포

**deliverable:**
- Vercel / Cloudflare Pages 프로젝트 설정
- `apps/web-editor` 정적 빌드 → deploy
- Custom domain (결정 후)
- HTTPS

### P6.2 — 백엔드 배포

**deliverable:**
- `apps/api` Dockerfile
- Cloud Run / Fly / Render 중 하나
- 환경 변수 (Vendor API keys, CORS origin, storage path)
- Storage: 단기 PNG·bundle 은 임시 디렉토리 + 주기적 GC, 장기 보존은 S3/GCS

### P6.3 — Rate Limit · CORS · 보안

**deliverable:**
- IP 기반 rate limit (예: 분당 5 generate, 시간당 20)
- CORS whitelist (프런트 도메인만)
- 업로드 파일 크기 limit (10MB)
- CSP 헤더 (XSS 방지)
- 벤더 키 leak 방지 점검 (gitleaks CI 재활성화)

### P6.4 — 관측

**deliverable:**
- `packages/metrics-http` 재활성화 → Prometheus endpoint
- 또는 Cloud provider 기본 관측 (Cloud Run metrics, Fly metrics)
- Grafana 대시보드 (generate success rate, latency, error 5xx, cache hit)
- 알람 (5xx > 1% → Slack/이메일)

### P6.5 — 라이선스 UX

**deliverable:**
- 각 프리셋 카드에 라이선스 배지 (Live2D sample, CC-BY, user-owned 등)
- 다운로드 전 라이선스 동의 체크박스 (mao_pro 등 제약 있는 프리셋)
- 생성물 라이선스 고지 (`mao_pro` 기반 아바타는 Live2D 상업 이용 동의 필요)

### P6.6 — Launch checklist

**deliverable:**
- [ ] 5 개 이상 프리셋 (목표, Phase 5 시점에 결정)
- [ ] 생성 성공률 > 95%
- [ ] P95 latency < 30s
- [ ] 90일 uptime > 99%
- [ ] README 에 "Try it live" 배지 + 라이브 URL
- [ ] 샘플 갤러리 (10 아바타)
- [ ] 초기 사용성 테스트 리포트 (5 명, 5분 과제)
- [ ] 블로그 포스트 / 런치 노트

**검수:** 공개 URL 이 외부 사용자 N 명에게 공유되어 사용됨.

---

## 세션 운영 규칙

1. **세션 = 단일 PR**: 하나의 세션이 하나의 PR. 세션 내 여러 commit OK 하지만 병합은 1 PR.
2. **CI green 전 병합 금지**: `validate:schemas` + `test:golden` 통과 필수.
3. **세션 로그**: 이전 β 스타일의 `progress/sessions/*.md` 는 부활시키지 않는다. PR description 이 유일한 log.
4. **ADR 은 필요 시**: 기술 선택이 되돌리기 어려운 경우만 `docs/adr/NNN-<slug>.md` 로 기록. (이전 `progress/adr` 와 별도 경로, 새 스코프에서 필요 시 `docs/adr/` 신설)
5. **스코프 팽창 검증**: PR 마다 `docs/04-ROADMAP §가드레일` 자체 체크리스트 포함.
6. **수동 경로 유지**: AI 없이도 해당 Phase 의 시나리오가 전부 동작해야 한다. AI 전용 기능은 Phase 3+ 이후.

## 리스크 & 미해결

| 리스크 | 대응 |
|---|---|
| Cubism Framework for Web 라이선스 | 상용 이용 시 Live2D 와 별도 계약 필요. 초기 OSS 범위는 비상업 또는 소규모. |
| `.moc3` 파싱 난이도 | Cubism Core (WASM) 를 그대로 임베딩. 직접 파서 작성 금지 |
| AI 벤더 품질 편차 | 어댑터 2 종 이상 확보. 특정 벤더 down 시 fallback (P3 에서는 수동 폴백만, P6 에서 자동 체인) |
| 4096 해상도 비용 | 벤더마다 최대 해상도·가격 차이. Phase 3 에서 2K 부터 시작해 점진 상향 |
| 프리셋 저작 난이도 | Phase 5 까지 프리셋 2~3 개면 충분. 많은 프리셋은 외부 저작자 모집 단계 (launch 후) |
