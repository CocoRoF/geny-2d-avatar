# 03. 아키텍처

## 1. 전체 레이어 (Web 제품 관점)

```
┌───────────────────────────────────────────────────────────────────┐
│  BROWSER  —  apps/web-editor (Vite + TS)                          │
│                                                                   │
│   [Preset Catalog]   [Texture Source]   [Preview Canvas]          │
│      ▲                  │                   ▲                     │
│      │                  │                   │                     │
│      │ GET /api/presets │ POST /api/build   │ <geny-avatar        │
│      │                  ▼                   │   src="bundle.json">│
│      │                (작업 실행)            │ @geny/web-avatar +  │
│      │                                      │ renderer-pixi       │
└──────┼──────────────────┼──────────────────────────────────────────┘
       │                  │
       ▼                  ▼
┌───────────────────────────────────────────────────────────────────┐
│  BACKEND  —  서비스 (Node/Express 또는 Next.js API routes)          │
│                                                                   │
│   /api/presets            ← rig-templates/ 스캔 → 카탈로그 반환       │
│   /api/texture/generate   ← @geny/ai-adapter-core.orchestrate()   │
│   /api/texture/upload     ← PNG 검증 (크기·alpha·슬롯 커버리지)     │
│   /api/build              ← @geny/exporter-core avatar → 번들 zip │
│   /api/bundle/:id         ← 정적 번들 serving                       │
└───────────────────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────────┐
│  DATA / ASSETS  (리포 + 생성 artifacts)                            │
│                                                                   │
│   rig-templates/base/{mao_pro,halfbody,...}/vX.Y.Z/  ← 프리셋 카탈로그 │
│   mao_pro_ko/                                      ← 3rd-party 원본 │
│   schema/v1/*.schema.json                          ← 계약 소스      │
│   /var/geny/bundles/<avatar_id>/                   ← 생성된 번들 zip │
└───────────────────────────────────────────────────────────────────┘
       ▲
       │
┌───────────────────────────────────────────────────────────────────┐
│  EXTERNAL                                                         │
│   Live2D Cubism Editor   — 프리셋 저작 + .moc3 컴파일 (수동)         │
│   AI Vendor APIs         — 텍스처 이미지 생성                      │
└───────────────────────────────────────────────────────────────────┘
```

## 2. 데이터 흐름 (end-to-end)

1. **사용자가 웹 UI 에 진입** → `GET /api/presets` → `rig-templates/` 스캔 → 카탈로그 JSON 응답
2. **프리셋 선택 + 텍스처 소스 선택**
3. **AI 생성 경로**:
   - `POST /api/texture/generate` (`preset_id`, `prompt`, `seed`)
   - 백엔드가 `ai-adapter-core.orchestrate()` 호출
   - AI 벤더 → PNG 반환 → 검증 → 저장
4. **업로드 경로**:
   - `POST /api/texture/upload` (multipart PNG)
   - 백엔드가 검증 → 저장
5. **Build**:
   - `POST /api/build` (`preset_id`, `texture_ref`) → `avatar.json` 생성 → `exporter-core avatar` CLI 실행 → 번들 디렉토리
   - 번들 경로 반환
6. **프리뷰**:
   - 웹 UI 가 `<geny-avatar src="/api/bundle/<id>/bundle.json">` 렌더
   - PixiJS 가 `.moc3` + 텍스처를 실시간 재생
7. **다운로드**:
   - `GET /api/bundle/<id>/download` → zip 스트리밍

## 3. 레이어별 책임

### 3.1 Frontend — `apps/web-editor`

| 책임 | 구현 |
|---|---|
| 프리셋 선택 UI | `fetch('/api/presets')` + dropdown |
| 텍스처 소스 스위치 | 라디오/탭 (AI / Upload / Recolor) |
| AI 프롬프트 폼 | `<form>` + debounce seed 랜덤화 |
| 업로드 | `<input type="file">` + client-side PNG 파싱 검증 |
| 리컬러 | `<canvas>` HSL shift |
| 프리뷰 렌더 | `<geny-avatar>` + `@geny/web-avatar-renderer-pixi` |
| 진행 상태 | WebSocket 또는 SSE (긴 AI 생성 진행률) |
| 다운로드 | `<a download>` |

### 3.2 Backend — `apps/api` (신설 예정) 또는 `services/*`

| 엔드포인트 | 역할 |
|---|---|
| `GET /api/presets` | `rig-templates/` 디렉토리 스캔 + atlas 메타 요약 |
| `POST /api/texture/generate` | AI 생성 task 큐잉 + polling/SSE 진행률 + 결과 PNG 반환 |
| `POST /api/texture/upload` | PNG 검증 (크기·alpha·slot coverage) + 저장 |
| `POST /api/texture/recolor` | 서버사이드 recolor (또는 클라이언트 담당) |
| `POST /api/build` | `avatar.json` 작성 → `exporter-core` 호출 → 번들 디렉토리 반환 |
| `GET /api/bundle/:id/*` | 정적 번들 파일 서빙 (bundle.json, .moc3, texture_00.png 등) |
| `GET /api/bundle/:id/download` | zip 스트리밍 |
| `POST /api/presets/upload` (미래) | 사용자 `.moc3` 업로드 → user preset 등재 |

### 3.3 Core 패키지

| 패키지 | 역할 | 현 상태 |
|---|---|---|
| `schema/v1/` | 모든 JSON 포맷의 단일 계약 | ✅ 성숙 |
| `rig-templates/` | 프리셋 카탈로그 | mao_pro 편입 대기 |
| `@geny/exporter-core` | 프리셋 + avatar.json → Cubism/Web 번들 | ✅ 성숙 (88 tests) |
| `@geny/ai-adapter-core` | AI 벤더 라우팅·폴백·provenance | ✅ 계약 성숙 (capability 재정의 필요) |
| `@geny/ai-adapter-nano-banana` | 벤더 어댑터 구현체 예시 | 재활용 대상 |
| `@geny/web-avatar` | `<geny-avatar>` Web Component | ✅ 성숙 |
| `@geny/web-avatar-renderer` | 렌더러 계약 (duck-typed interface) | ✅ 성숙 |
| `@geny/web-avatar-renderer-pixi` | PixiJS 기반 2D 렌더 | 활성 개발 대상 |
| `apps/web-editor` | Web UI (제품 본체) | 스캐폴드 — 완성 필요 |
| `apps/web-preview` | 프리뷰 전용 경량 앱 | 통합 가능 (web-editor 와 병합 검토) |

### 3.4 정리(=OFF-GOAL) 예정

Phase 0 에서 `archive/` 또는 `packages/_deprecated/` 로 격리:

| 패키지/앱 | 이유 |
|---|---|
| `packages/migrator` | 프리셋은 Cubism Editor 재저작. 코드 마이그레이션 불필요 |
| `packages/job-queue-bullmq` | 초기 web UI 에는 synchronous API 로 충분. 필요 시 Phase 6+ 복귀 |
| `packages/exporter-pipeline` | "파츠 AI 생성 + 후처리 + 번들" 흐름 전제. 현 스코프(텍스처 → 번들) 에는 exporter-core 단일로 충분 |
| `services/orchestrator` | 파츠 오케스트레이터. 웹 UI 가 직접 AI + exporter 를 호출 |
| `apps/worker-generate` | 별도 워커 프로세스 불필요 (Phase 6+) |
| `packages/ai-adapters-fallback` | 단일 어댑터 재시도로 시작. fallback 체인 재설계 후 복귀 |
| ~~`rig-templates/base/halfbody/v1.0.0 ~ v1.2.0`~~ | **P0.3.3 완료** — `archive/rig-templates/halfbody/` 로 이동 |

## 4. 데이터 계약

권위: `schema/v1/*.schema.json`.

| Schema | 역할 |
|---|---|
| `rig-template.schema.json` | 프리셋 디렉토리 전체 구조 |
| `atlas.schema.json` | 텍스처 UV 슬롯 (이 프로젝트 핵심 계약) |
| `avatar-metadata.schema.json` | `avatar.json` (프리셋 + 텍스처 결합) |
| `bundle-manifest.schema.json` | 번들 매니페스트 |
| `web-avatar.schema.json` | 웹 런타임 매니페스트 |
| `ai-adapter-task/result.schema.json` | AI 생성 요청·응답 |
| `parameters / deformers / part-spec / physics / pose / motion-pack / expression-pack / test-poses` | 프리셋 내부 파일 |
| `palette` | 색 힌트 |
| `provenance` | AI 생성 증명 |
| `license` | 라이선스 |
| **`texture-manifest.schema.json`** (신설 예정, Phase 2) | 텍스처 메타 |

## 5. 결정론 규약

"동일 입력 → 동일 바이트".

- JSON 은 `exporter-core.canonicalJson()` 로 직렬화 (키 알파벳 정렬 · 2-space · LF · trailing newline)
- AI 생성은 `(preset_id, prompt, seed, adapter, adapter_version)` 을 cache key 로 → 동일 키 → 동일 PNG (벤더 결정론성 의존)
- `texture.png` 의 sha256 을 `texture.manifest.json` + `bundle.json` 양쪽 기록 → cross-check
- `test-golden.mjs` 가 CI 에서 번들 바이트 스냅샷 회귀 검증

## 6. 런타임 경계

| 시점 | 실행 환경 | 주체 |
|---|---|---|
| 프리셋 저작 | Live2D Cubism Editor (외부) | 사람 |
| `.moc3` 컴파일 | Live2D Cubism Editor (외부) | 사람 |
| 텍스처 생성 | 백엔드 서비스 (Node) + AI 벤더 HTTP | 웹 UI 트리거 |
| 번들 조립 | 백엔드 서비스 (Node + `exporter-core`) | 웹 UI 트리거 |
| 프리뷰 | 브라우저 + PixiJS + Cubism Framework | 사용자 |
| 다운로드 | 브라우저 | 사용자 |
| 최종 런타임 임베딩 | 사용자 앱 (VTube Studio, 외부 게임 등) | 사용자 |

## 7. 외부 의존

- **Live2D Cubism Editor 5.x** — 프리셋 저작·`.moc3` 컴파일
- **Live2D Cubism Framework for Web** (JS) — 브라우저에서 `.moc3` 디코딩·파라미터 바인딩
- **PixiJS v8** — 실제 2D 렌더 (삼각형 메시·텍스처 샘플링)
- **AI 벤더 API** — 텍스처 이미지 생성 (예: Gemini/nano-banana, SDXL, 등)

## 8. 빌드·개발 환경

- Node 22.11.0, pnpm 9.12.0, workspace 는 `apps/* packages/* services/*`
- 테스트 Node `--test` + `happy-dom`, 브라우저 E2E 는 Phase 2+ 에 Playwright 도입 검토
- Vite (`apps/web-editor`), tsc (패키지), 루트 번들러 없음
- CI: GitHub Actions, `pnpm install --frozen-lockfile` → `pnpm run test:golden`
- 배포 (Phase 6): 프론트엔드 정적 hosting (Vercel/Cloudflare Pages) + 백엔드 Node (Cloud Run/Fly/Render)

## 9. 보안·라이선스 경계

- **AI 벤더 키**: 백엔드 env 에만 보관. 프런트엔드에 노출 금지
- **`mao_pro_ko/`**: Live2D Inc. 라이선스 준수. `ReadMe.txt` 원문 보존. 상업적 이용 시 규약 동의 필요 (프리셋 편입은 라이선스 위반이 아니며, 원본은 그대로 유지)
- **사용자 업로드 `.moc3`**: 업로드 시 출처·라이선스 선언 필드 필수 (Phase 6+)
