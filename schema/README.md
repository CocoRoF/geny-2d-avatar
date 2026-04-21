# schema/

모든 내부 계약(Contract) 의 단일 진실 공급원.
앱·워커·SDK 는 여기 정의된 JSON Schema 만을 신뢰한다.

## 방침 (ADR 0002)

- 작성 포맷: **JSON Schema 2020-12**.
- 언어 바인딩(Python Pydantic, TS Zod) 은 **생성물**. 사람이 직접 편집하지 않는다.
- 스키마 변경은 **SemVer**. 호환 깨짐은 major bump + 마이그레이션 노트.
- `schema/v{N}/` 로 major 를 나눈다. 동일 major 내 minor/patch 는 `$schema` + `x-version` 메타로 표기.

## 카탈로그 (v1 — 22 계약)

각 항목은 **보장** / **소비자** / **Docs** / **도입** 4 라인 고정 구조. 자세한 필드 정의는 각 `.schema.json` 파일의 `title` + `description` + `properties` 를 최후 권위로 본다.

### 리그 · 파츠 (docs/03 · docs/04) — 5

- **`v1/rig-template.schema.json`** — Rig Template Manifest
  - 보장: 템플릿 매니페스트. parameters/parts/motions 는 별도 파일 참조 (평탄화).
  - 소비자: `@geny/rig-template-lint`, `scripts/validate-schemas.mjs`, exporter-core.
  - Docs: docs/03 전체.
  - 도입: 세션 01.
- **`v1/parameters.schema.json`** — Rig Parameters File
  - 보장: `parameters.json` 의 표준 파라미터 세트 계약 (id · range · default · group).
  - 소비자: rig-template-lint (C3 · C4 · C7 · C8 · C14), exporter-core cubism 매핑.
  - Docs: docs/03 §3.
  - 도입: 세션 01.
- **`v1/deformers.schema.json`** — Deformers Tree
  - 보장: 평탄 배열 + parent 링크 구조 (중첩 JSON 회피, diff 청결성).
  - 소비자: rig-template-lint (C9 · C10 · C14), exporter-core.
  - Docs: docs/03 §4.
  - 도입: 세션 02.
- **`v1/physics.schema.json`** — Physics Config
  - 보장: Cubism `physics3.json` 구조 1:1 대응, parameter id 는 템플릿 id + snake_case.
  - 소비자: exporter-core `cubism_mapping` 변환, rig-template-lint.
  - Docs: docs/03 §6.2.
  - 도입: 세션 03.
- **`v1/part-spec.schema.json`** — Part Spec
  - 보장: 파츠 슬롯 계약서 (id · variant · required/optional · parameter_ids).
  - 소비자: AI 생성 어댑터 입력 검증, 후처리 훅, 검수 파이프라인.
  - Docs: docs/04 §3.
  - 도입: 세션 01.

### 모션 · 표정 · 포즈 (docs/03 §6 · docs/11) — 4

- **`v1/motion-pack.schema.json`** — Motion Pack
  - 보장: Cubism `motion3.json` 구조의 snake_case 정규화. 1 파일 = 1 팩.
  - 소비자: exporter-core, rig 저작(`rig-templates/base/**`).
  - Docs: docs/03 §6.1.
  - 도입: 세션 04.
- **`v1/expression-pack.schema.json`** — Expression Pack
  - 보장: Cubism `.exp3.json` 원본 대응. 시간축 없는 per-parameter offset + Blend(Add/Multiply/Overwrite).
  - 소비자: exporter-core, web-avatar 런타임.
  - Docs: docs/11 §3.2.2, docs/12 §4.10.
  - 도입: 세션 12.
- **`v1/pose.schema.json`** — Pose3 (Mutex Groups)
  - 보장: Cubism `pose3.json` 의 snake_case 내부 계약. 동일 그룹 내 파츠 mutex.
  - 소비자: exporter-core, web-avatar 런타임, rig-template-lint.
  - Docs: docs/11 §3.2.1.
  - 도입: 세션 05.
- **`v1/test-poses.schema.json`** — Test Pose Set
  - 보장: 표준 테스트 포즈 세트 — 검수 렌더러의 입력.
  - 소비자: 검수 파이프라인, web-editor preview, snapshot 회귀.
  - Docs: docs/08 §3.
  - 도입: 세션 04.

### 번들 (docs/11 §3·§4) — 5

- **`v1/bundle-manifest.schema.json`** — Bundle Manifest
  - 보장: 번들 루트 `bundle.json`. 자신을 제외한 모든 파일의 `{path, sha256, bytes}` + kind. 결정론 위해 타임스탬프·서명 미포함.
  - 소비자: exporter-pipeline 조립, `@geny/web-avatar` 로더.
  - Docs: docs/11 §4.5 / §9.
  - 도입: 세션 13.
- **`v1/web-avatar.schema.json`** — Web Avatar Runtime Bundle Meta
  - 보장: `@geny/web-avatar` 전용 경량 번들 메타 (textures[].{width,height,bytes,sha256} + atlas 필드 확정).
  - 소비자: `@geny/web-avatar` 런타임, web-editor renderer.
  - Docs: docs/11 §4.5.
  - 도입: 세션 15 (세션 18 stage 2 에서 textures/atlas 확장).
- **`v1/atlas.schema.json`** — Texture Atlas Meta
  - 보장: `<outDir>/atlas.json` 의 텍스처 UV/치수 매핑. slots[] 는 0..1 정규화 UV 사각형.
  - 소비자: `@geny/web-avatar` 런타임, exporter atlas 훅.
  - Docs: docs/11 §4.5.
  - 도입: 세션 18 (stage 2).
- **`v1/avatar-metadata.schema.json`** — Avatar Metadata
  - 보장: Avatar 엔터티 — DB row + export 번들 모두에서 재사용.
  - 소비자: orchestrator-service, avatar-export 참조, web-editor save.
  - Docs: docs/12 §4.5.
  - 도입: 세션 01.
- **`v1/avatar-export.schema.json`** — Avatar Export Spec
  - 보장: 번들 조립 입력. metadata 복제 없이 `avatar_id` 참조 + 번들 설정만 보유.
  - 소비자: exporter-pipeline, worker-generate.
  - Docs: docs/11 §3.5 (세션 11 D1/D2/D3).
  - 도입: 세션 11.

### AI 어댑터 (docs/05) — 3

- **`v1/ai-adapter-task.schema.json`** — AIAdapterTask
  - 보장: 모든 어댑터(nano-banana / SDXL+CN / Flux-Fill) 의 단일 입력 계약. 이미지/마스크는 sha256 참조. 시드·예산·타임아웃·idempotency 명시 → 벤더 교체 재현성.
  - 소비자: `@geny/ai-adapter-core`, 어댑터 3 종, Mock.
  - Docs: docs/05 §2.2.
  - 도입: 세션 22.
- **`v1/ai-adapter-result.schema.json`** — AIAdapterResult
  - 보장: 단일 결과 계약. 이미지/알파는 외부 저장소 sha256. `vendor_metadata` 는 벤더별 자유 필드.
  - 소비자: orchestrator provenance `parts[].ai_generated` 생성 직결.
  - Docs: docs/05 §2.2.
  - 도입: 세션 22.
- **`v1/adapter-catalog.schema.json`** — AdapterCatalog
  - 보장: `name+version` 고유 키. factory 는 코드 주입 (JSON 미표현). config 에 비밀 값 미포함 (env 참조키만).
  - 소비자: orchestrator `AdapterRegistry` 구성, `routeWithFallback`.
  - Docs: docs/05 §12.6.
  - 도입: 세션 30.

### 라이선스 · 프로비넌스 (docs/11 §9) — 3

- **`v1/license.schema.json`** — License
  - 보장: 번들 라이선스 증명서. `bundle.json` sha256 으로 번들과 결합. Ed25519 서명. 서명 대상은 canonical JSON (2-space indent · LF · trailing newline).
  - 소비자: `@geny/license-verifier`, `@geny/web-avatar` 로더.
  - Docs: docs/11 §9.1, §9.3 (세션 08 D5 canonical 규칙).
  - 도입: 세션 14.
- **`v1/provenance.schema.json`** — Provenance
  - 보장: 파츠 계보(벤더/시드/프롬프트 해시) + 후처리 이력 + 번들 참조. 민감 정보는 sha256 만. Ed25519 서명 불변성.
  - 소비자: exporter-pipeline 기록, `@geny/license-verifier` 검증.
  - Docs: docs/11 §9.2.
  - 도입: 세션 14.
- **`v1/signer-registry.schema.json`** — Signer Registry
  - 보장: `signer_key_id → Ed25519 public key(hex) + 상태 + 유효 기간`. 키 로테이션 위해 복수 활성 허용.
  - 소비자: `@geny/license-verifier` (license/provenance 의 `signer_key_id` 조회).
  - Docs: docs/11 §9.3.
  - 도입: 세션 21 (세션 14 blocker 해소).

### 후처리 (docs/06) — 1

- **`v1/palette.schema.json`** — PaletteCatalog
  - 보장: 팔레트 락 — 지배색(k-means k=4) 이 카탈로그의 최근접 팔레트 색으로 이동 (ΔE CIE76, `move_cap_delta_e` 이내만 이동).
  - 소비자: post-processing Stage 3 `fit-to-palette`, pre-atlas 훅.
  - Docs: docs/06 §6.4.
  - 도입: 세션 32.

### 공용 (`common/`) — 1

- **`v1/common/ids.json`** — ID 공용 정의
  - 보장: `{prefix}_{ULID26}` 포맷 (Crockford Base32 26자, I/L/O/U 제외). 14 개 엔터티 ID + `templateRef` · `semver` · `slotId` · `parameterId` · `cubismParamId` · `cubismPartId`.
  - 소비자: 위 21 스키마 전부 (`$ref` 로 참조).
  - Docs: docs/12 §3.
  - 도입: 세션 01.

## 검증

```bash
node scripts/validate-schemas.mjs
```

Ajv (2020-12) 로 스키마 자체 + `rig-templates/base/**/v*.*.*` 아래 템플릿 파일 + 디렉터리명과 `version` 일치 (ADR 0003) 까지 일괄 검증. 현재 실측 `checked=244 failed=0`. CI 골든 step 1 (`test:golden`) 으로 매 PR 실행 — 체크 갯수는 실측이 권위 (`progress/runbooks/02-golden-step-catalog.md §1` 참조).
