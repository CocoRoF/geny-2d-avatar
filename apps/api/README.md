# @geny/api

Geny 2D Avatar 백엔드 API. Phase 2 — docs/03-ARCHITECTURE.md §3.2.

## 상태

- **P2.1** ✅ — Fastify 기본 서버 + `/api/health` + `/api/presets`
- **P2.2** ✅ — `/api/texture/upload` (PNG 검증)
- **P2.3** ✅ — `/api/build` (exporter-core avatar 호출) + `/api/bundle/:id/*`
- **P3.1** ✅ — `/api/texture/generate` (mock)
- **P3.2** ✅ — `texture-manifest` 스키마 + 번들 첨부
- **P3.3** ✅ — `TextureAdapterRegistry` + `runTextureGenerate` + `attempts[]`
- **P3.4** ✅ — Pollinations.ai 벤더 어댑터 (키 불필요, 무료 공개 API)
- **P3.5** ⏳ — UI 에 adapter/attempts 시각화

## 엔드포인트

### GET `/api/health`

서버 생존 확인.

```json
{ "status": "ok", "version": "0.1.0" }
```

### GET `/api/presets`

`rig-templates/base/**` 를 스캔해 활성 프리셋 카탈로그 반환.

```json
{
  "presets": [
    {
      "id": "tpl.base.v1.fullbody",
      "version": "1.0.0",
      "display_name": { "en": "Full Body Standard", "ko": "풀바디 표준" },
      "family": "fullbody",
      "origin": "derived",
      "canvas": { "width": 2048, "height": 4096 },
      "atlas": { "width": 4, "height": 4, "slot_count": 38 },
      "motion_count": 9,
      "expression_count": 3
    },
    {
      "id": "tpl.base.v1.halfbody",
      "version": "1.3.0",
      "...": "..."
    },
    {
      "id": "tpl.base.v1.mao_pro",
      "version": "1.0.0",
      "origin": "third-party",
      "family": "custom",
      "...": "..."
    }
  ]
}
```

정렬: `id@version` 알파벳.

## 실행

```bash
pnpm -F @geny/api build
pnpm -F @geny/api dev     # default PORT=3000
```

환경변수:
- `PORT` — 기본 3000
- `GENY_RIG_TEMPLATES` — 기본 저장소 루트의 `rig-templates/`
- `GENY_LOG=true` — Fastify 로그 활성화

## 테스트

```bash
pnpm -F @geny/api test
```

Fastify `app.inject()` 로 HTTP 포트 없이 호출. 5 테스트:
- `/api/health` 200
- `/api/presets` 3+ 프리셋 포함 (mao_pro + halfbody + fullbody)
- 빈 rigTemplatesRoot → 빈 배열
- 정렬 확인
- 미지 URL → 404
