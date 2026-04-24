# 02. 텍스처 파이프라인

프리셋은 고정·재사용. **가변은 오직 텍스처**. 이 문서는 텍스처가 입력부터 Live2D 번들 완성까지 어떤 경로를 타는지 정의한다. 진입점은 **웹 UI** (`docs/03 §웹 UI 레이어` 참조).

## 1. 한 눈에

```
[웹 UI]
 ├─ preset 선택     ← rig-templates/base/<id>/<version>/atlas.json
 ├─ source 선택
 │    ├─ (A) AI generate: prompt + seed + references
 │    ├─ (B) manual upload: PNG 파일
 │    └─ (C) recolor:  base.png 불러와 색상·명도 변경
 └─ "Build" 클릭
          │
          ▼
[백엔드] texture generation / transform
    - slot 계획          ← atlas.json
    - 생성·업로드·변환
    - atlas 패킹
          │
          ▼
  texture.png + texture.manifest.json
          │
          ▼
[백엔드] exporter-core
    - rig-templates/<preset>/**  + avatar.json
    - 번들 조립 (Cubism JSONs + bundle.json + web-avatar.json)
          │
          ▼
 [웹 UI] 프리뷰 (PixiJS 기반 <geny-avatar>)
          │
          ▼
 [웹 UI] 다운로드 zip
          │
          ▼
 (외부) Cubism Editor 에서 .moc3 컴파일 후 최종 런타임 임베딩
```

## 2. 입력

### 2.1 웹 UI 폼 (사용자 관점)

- **Preset**: 드롭다운 (카탈로그에서 선택 — mao_pro, halfbody 등)
- **Source**: 라디오 버튼 (AI / Upload / Recolor)
- **AI 선택 시**:
  - `prompt` (필수, 자유 입력)
  - `seed` (선택, 기본 = 랜덤)
  - `style_references` (선택, URL 또는 업로드)
  - `palette_hint` (선택, primary/accent 색상)
  - `slot_overrides` (선택, advanced — 슬롯별 로컬 프롬프트)
- **Upload 선택 시**: PNG drag-drop
- **Recolor 선택 시**: 프리셋의 base.png 미리보기 + 색상 조정 슬라이더

### 2.2 내부 schema 계약

`schema/v1/ai-adapter-task.schema.json`:
```jsonc
{
  "task_id": "tx-001",
  "capability": "texture_atlas_generate",
  "preset_id": "tpl.base.mao_pro",
  "preset_version": "1.0.0",
  "prompt": "blue-haired anime girl with pastel hoodie",
  "seed": 1234567890,
  "palette_hint": { "primary": "#A0C8FF", "accent": "#FFEAC8" },
  "slot_overrides": {},
  "budget": { "max_cost_usd": 0.10, "deadline_ms": 30000 }
}
```

## 3. 슬롯 계획

프리셋의 `textures/atlas.json` 에서 슬롯 목록과 크기 정보를 가져온다.

```jsonc
{
  "slots": [
    { "part_id": "face_base",  "uv": { "x": 0, "y": 0, "w": 1024, "h": 1024 } },
    { "part_id": "hair_front", "uv": { "x": 1024, "y": 0, "w": 1024, "h": 1024 } }
  ]
}
```

각 슬롯에 대한 semantic 태그 매핑 (생성기가 프롬프트 확장에 사용):
- `face_*` → "face feature"
- `hair_*` → "hairstyle strand"
- `cloth_*`, `arm_*`, `torso`, `neck` → "clothing"
- `accessory_*` → "accessory"
- `eye_*`, `brow_*`, `mouth_*`, `nose`, `cheek_*` → "facial element"

## 4. 생성 전략

| 전략 | 언제 쓰나 | 구현 우선순위 |
|---|---|---|
| **C. Recolor / Manual upload** | Phase 1 — 웹 UI 최소 동작 검증 | 가장 먼저 |
| **A. Single-shot AI atlas** | Phase 2 — AI end-to-end 증명 | MVP |
| **B. Per-slot AI** | Phase 3 — 품질 향상, 부분 재생성 | 품질 단계 |
| **D. Hybrid** (A 로 초안 → B 로 특정 슬롯 덮어쓰기) | Phase 4 | 성숙 단계 |

### 4.1 Manual upload (C)

사용자가 직접 제작한 4096×4096 PNG 업로드. 프리셋의 `atlas.json` 이 정한 `width × height` 와 일치해야 함. 검증 실패 시 업로드 거부·오류 안내.

### 4.2 Recolor (C')

프리셋의 `base.png` 을 로드 → 색상 HSL shift, 팔레트 치환 등 저비용 변환. 클라이언트 사이드 Canvas 만으로 가능.

### 4.3 Single-shot AI (A)

프롬프트 1 개 → AI 벤더에 atlas 크기 그대로 생성 요청 → 응답 PNG 를 검증 후 채택.

`packages/ai-adapter-core.orchestrate()` 재활용:
- task capability: `texture_atlas_generate`
- registry 에서 `routing_weight desc, cost asc` 로 어댑터 선정
- 5xx / DEADLINE / UNSAFE_CONTENT → fallback
- `(preset_id, prompt, seed)` 을 cache key 로 결정론적 재생

**한계**: AI 가 UV 경계를 모르므로 파츠가 어긋난 채 그려짐. 상용 품질 아님. 데모·초안 수준.

### 4.4 Per-slot AI (B)

각 슬롯을 별도로 생성 → 리사이즈·크롭 → atlas 에 패킹.
- 각 슬롯당 프롬프트 확장 (전역 prompt + slot semantic 태그 + slot_override)
- 생성된 이미지를 `uv.w × uv.h` 로 리사이즈
- `palette_hint` 로 색 일관성 락
- 배경 투명도 검증

## 5. 검증

생성·업로드 텍스처가 번들에 들어가기 전 체크:

- [ ] **크기**: `atlas.json.textures[0].width/height` 와 일치
- [ ] **포맷**: PNG / RGBA / 8-bit / `premultiplied_alpha` 플래그 일치
- [ ] **슬롯 커버리지**: 각 `slots[].uv` 영역에 alpha > 0 픽셀 존재 (빈 슬롯 방지)
- [ ] **렌더 회귀**: `test_poses/*.json` 로 프리셋 고정 포즈 렌더 → 기준 스냅샷과 SSIM 비교 (임계값 통과)
- [ ] **결정론 (선택)**: 동일 `(preset_id, prompt, seed, adapter)` → 바이트 동일 PNG

## 6. 출력

### 6.1 파일

```
<output_dir>/
├── texture.png                # 아틀라스
├── texture.manifest.json      # 생성 메타 (schema/v1/texture-manifest.schema.json — Phase 2 에 확정)
├── avatar.json                # 프리셋 + 텍스처 결합 기술서
└── bundle/                    # exporter-core 출력
    ├── bundle.json            # Cubism bundle 매니페스트
    ├── web-avatar.json        # Web Avatar 런타임 매니페스트
    ├── model3.json, pose3.json, physics3.json, cdi3.json
    ├── motions/*.motion3.json
    ├── expressions/*.exp3.json
    └── runtime/
        ├── model.moc3         # 프리셋 runtime_assets 에서 복사
        └── texture_00.png     # 우리가 생성·업로드한 texture.png
```

### 6.2 `texture.manifest.json` (Phase 2 에 schema 확정)

```jsonc
{
  "schema_version": "v1",
  "preset": { "id": "tpl.base.mao_pro", "version": "1.0.0" },
  "atlas_sha256": "…",
  "generated_by": {
    "mode": "ai" | "manual" | "recolor",
    "strategy": "single" | "per-slot" | "hybrid",
    "adapter": "nano-banana@1.2.0",
    "adapter_attempts": [ /* ai-adapter-core 의 attempts[] */ ]
  },
  "prompt": "…",
  "seed": 1234567890,
  "slot_fill": [
    { "part_id": "face_base", "source": "ai", "prompt": "…" }
  ],
  "created_at": "2026-04-24T10:00:00Z",
  "provenance_ref": "avatar.json#/provenance"
}
```

### 6.3 `avatar.json`

`schema/v1/avatar-metadata.schema.json` 준수:
```jsonc
{
  "schema_version": "v1",
  "avatar_id": "avt.demo-001",
  "preset": {
    "template_id": "tpl.base.mao_pro",
    "template_version": "1.0.0"
  },
  "texture": { "path": "./texture.png", "manifest_path": "./texture.manifest.json" }
}
```

## 7. `exporter-core` 로 번들 생성

`@geny/exporter-core avatar` CLI (백엔드 작업에서 호출):

```bash
node packages/exporter-core/bin/exporter-core.mjs avatar \
  --spec ./avatar.json \
  --rig-templates-root ./rig-templates \
  --out-dir ./out/bundle
```

출력 JSON 은 전부 `canonicalJson()` 직렬화 (키 알파벳 정렬 / 2-space / LF / trailing newline). 동일 입력 → 동일 바이트 (골든 회귀의 기반).

## 8. 웹 프리뷰

웹 UI 는 번들 생성이 끝나면 `<geny-avatar src="./out/bundle/bundle.json" />` 로 직접 렌더. `@geny/web-avatar-renderer-pixi` (PixiJS 기반) 가 실제 픽셀을 그린다.

`.moc3` 바이너리 디코딩은 Live2D Cubism Framework (JS) 가 담당. 프리뷰 단계에서는 `.moc3` 가 프리셋의 `runtime_assets/` 에서 직접 로드되거나, 번들에 임베드된 같은 파일을 사용한다.

## 9. Phase 별 미해결 과제

| Phase | 과제 |
|---|---|
| 1 | `.moc3` → `atlas.json slots` 자동 추출 스크립트 (`scripts/rig-template/extract-atlas.mjs`) |
| 1 | mao_pro 프리셋 편입 (파일 트리 + manifest + atlas) |
| 1 | `apps/web-editor` 에 preset 카탈로그 + upload/recolor/preview/download 통합 |
| 2 | `ai-adapter-core` 의 capability 확장: `texture_atlas_generate` |
| 2 | `schema/v1/texture-manifest.schema.json` 신설 |
| 3 | 슬롯별 AI 생성 + 스타일 일관성 락 + 부분 재생성 |
| 4 | Hybrid 전략 (초안 → 파트별 덮어쓰기) |

## 10. 참고

- `packages/ai-adapter-core/README.md` — 라우팅·폴백·provenance 규약
- `packages/exporter-core/README.md` — 번들 조립 CLI
- `schema/v1/atlas.schema.json` · `avatar-metadata.schema.json`
- `archive/docs/05-ai-generation-pipeline.md` — 이전 스코프의 생성 파이프라인 설계 (벤더·폴백·캐시 설계는 재활용)
- `archive/docs/06-post-processing-pipeline.md` — 후처리 (슬롯 경계 블렌딩 Phase 3 에 참고)
