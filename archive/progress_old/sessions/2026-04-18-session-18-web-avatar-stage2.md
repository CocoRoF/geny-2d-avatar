# Session 18 — Web Avatar stage 2 + `<geny-avatar>` 런타임 스켈레톤

- 날짜: 2026-04-18
- 스트림: Data + Pipeline + Frontend
- 관련 docs: `docs/11 §4.5` (번들 메타 구조), `docs/14 §3.3` (Foundation Exit)
- 전제: 세션 15 (web-avatar stage 1 — JSON 메타만) 완료 상태에서 시작.

## 0. 목표

1. `schema/v1/atlas.schema.json` 신설 — 텍스처 UV/치수 매핑 공식 계약.
2. `schema/v1/web-avatar.schema.json` 확장 — `textures[].{width,height,bytes,sha256}` + `atlas` 필수 필드로 bump.
3. `@geny/exporter-core` loader + `assembleWebAvatarBundle` — PNG/WebP 바이트 + atlas.json 방출.
4. `packages/web-avatar/` — `<geny-avatar>` Custom Element + 번들 로더 최소 구현 (렌더링 전 단계).
5. halfbody v1.2.0 템플릿에 `textures/base.png` 픽스처 + `textures/atlas.json` 추가.
6. 골든 3종 재생성 — `web-avatar.json` / `web-avatar-bundle.snapshot.json` 업데이트 + `atlas.json` 신규.

## 1. 스키마 변경

### 1.1 `schema/v1/atlas.schema.json` 신설
- `$id`: `https://geny.ai/schema/v1/atlas.schema.json`.
- `required`: `schema_version`, `format`, `textures`, `slots`.
- `textures[]`: `path (regex ^textures/[A-Za-z0-9_./-]+\.(png|webp)$)` / `width (1..8192)` / `height (1..8192)` / `format (enum png|webp)` / `premultiplied_alpha (bool)`.
- `slots[]`: `slot_id (common/ids)` / `texture_path` / `uv (4-tuple 0..1)`.

### 1.2 `web-avatar.schema.json` bump
- `required` 에 `atlas` 추가.
- `textures[]` 엔트리 `width/height/bytes/sha256` 필수화 — 세션 15 에선 참조만 허용했음.
- `atlas` 필드 `oneOf(object{path:"atlas.json", sha256:hex64} | null)` — textures 가 있을 때만 객체 참조, 없으면 null.

### 1.3 `scripts/validate-schemas.mjs`
- `SCHEMA_ID.atlas` + validator 매핑 추가.
- 5번째 섹션 `validateAtlasDocs()` 신설 — 템플릿 `textures/atlas.json` 과 골든 `halfbody_v1.2.0.atlas.json` 양쪽 검증.
- 실행 결과: **checked 131 → 133** (2 추가 — 템플릿 atlas + 골든 atlas).

## 2. Exporter Core — loader + `assembleWebAvatarBundle`

### 2.1 Loader
- `TemplateTextureFile { path, buffer, bytes, width, height, format, sha256 }` 추가.
- `manifest.textures_dir ?? "textures/"` 디렉터리를 재귀 스캔. `atlas.json` 은 skip (원문 보존 위해 별도 로드).
- PNG 는 IHDR chunk (바이트 16/20 에서 width/height 빅엔디안 4 바이트) 로, WebP 는 VP8 lossy 만 지원 (bytes 26-29 마스킹 `& 0x3fff`). VP8L/VP8X 는 throw.
- `sha256` 은 Node `createHash("sha256").update(buf).digest("hex")`.
- `atlas.json` 은 있으면 파싱해 `Template.atlas`, 없으면 null.

### 2.2 `assembleWebAvatarBundle`
- 로직: `includeTextures=true` 일 때 `template.textures` 를 순회하며 PNG/WebP 바이트를 `textures/<name>` 로 byte-copy, `textureEntries[]` 에 `width/height/bytes/sha256/purpose:"albedo"` 를 수집.
- `template.atlas` 가 있으면 그대로, 없으면 `buildSyntheticAtlas()` 로 placeholder 생성.
- atlas.json 은 canonical JSON 으로 쓰이며 그 sha256 가 `web-avatar.json` 의 `atlas.sha256` 에 반영.
- `includeTextures=false` 옵션으로 Stage 1 동작(web-avatar.json + bundle.json 만) 유지 — 테스트 커버리지 보존.

### 2.3 `convertWebAvatar`
- `WebAvatarTexture` 에 `width/height/bytes/sha256` 추가.
- 새 `WebAvatarAtlasRef { path: "atlas.json", sha256: string }`.
- `ConvertWebAvatarOptions.atlas?` 추가. 기본 `null`.

## 3. 픽스처

- `rig-templates/base/halfbody/v1.2.0/textures/base.png` — 4×4 RGBA 전체 투명 PNG. 네이티브 의존성 없이 Node `zlib` + 인라인 CRC32 (폴리 `0xedb88320`) 로 생성. 69 bytes, sha256 `f164334dc3985e3b8d95b71e59462c9c4f6d80c7ede23238c8759d9c4495a6db`.
- `rig-templates/base/halfbody/v1.2.0/textures/atlas.json` — `slots: []` placeholder. Stage 3 의 메쉬 fitting 이 실 UV 를 채움.

## 4. `packages/web-avatar/` — 런타임 스켈레톤

### 4.1 파일
- `src/types.ts` — 런타임 입력의 TS 투영. `@geny/exporter-core` 의 내부 타입과 **별도** (권위는 JSON Schema; 두 패키지가 각자의 미러를 가짐).
- `src/loader.ts` — `loadWebAvatarBundle(url, { fetch? })`. 브라우저 + Node 22 공통. `WebAvatarBundleError` (`code: FETCH_FAILED | INVALID_JSON | INVALID_KIND | INVALID_SCHEMA | MISSING_FILE`).
- `src/element.ts` — `createGenyAvatarElementClass()` + `registerGenyAvatar(tagName?)`. Custom Element 는 환경에 `HTMLElement` 가 있을 때만 정의.
- `src/index.ts` — barrel export + `typeof customElements !== "undefined"` 가드하에 auto-register.

### 4.2 이벤트 / API
- `ready`: `CustomEvent<{ bundle: WebAvatarBundle }>` — bundle.json → web-avatar.json → atlas.json 해석 완료.
- `error`: `CustomEvent<{ error: unknown }>`.
- `setParameter/playMotion/setExpression` 는 `WebAvatarBundleError` throw (Stage 3 에서 실장).

### 4.3 tsconfig / 빌드
- `lib: ["ES2022", "DOM"]` — Custom Element 를 위한 DOM 타입.
- `exports`: `.` (barrel, auto-register) / `./element` / `./loader` / `./types`. 프레임워크별 통합 시점 제어를 위해 element/loader 직접 import 허용.
- `pnpm --filter @geny/web-avatar run build` → `dist/{index,element,loader,types}.{js,d.ts,*.map}`.

### 4.4 테스트
- `tests/loader.test.ts` (7 케이스): 골든 번들 materializetion + fsFetch 주입 → 정상 로딩 / atlas=null / INVALID_KIND / MISSING_FILE / FETCH_FAILED / INVALID_JSON / INVALID_SCHEMA.
- `tests/element.test.ts` (2 케이스): 클래스 팩토리 (HTMLElement 가드) + registerGenyAvatar no-op (customElements 부재).
- 합계 **9 tests pass**.

## 5. 골든 / 테스트 전체

- 기존 `@geny/exporter-core` 테스트 88 → **93 pass** (web-avatar-bundle 5 신규: 파일 수 4 / includeTextures=false / 텍스처 bytes equality / atlas.json shape / web-avatar.test 에 atlas passthrough 2).
- `halfbody_v1.2.0.web-avatar.json` 재생성 — 새 `atlas` 필드 반영, 11887 bytes.
- `halfbody_v1.2.0.web-avatar-bundle.snapshot.json` 재생성 — 4 file 엔트리 (web-avatar + atlas + bundle + texture).
- `halfbody_v1.2.0.atlas.json` 신규 (222 bytes).
- `validate-schemas`: checked **133** / failed 0 (17 schemas).

## 6. 변경 파일

### 신규
```
packages/web-avatar/src/types.ts
packages/web-avatar/src/loader.ts
packages/web-avatar/src/element.ts
packages/web-avatar/src/index.ts
packages/web-avatar/tests/loader.test.ts
packages/web-avatar/tests/element.test.ts
packages/web-avatar/tsconfig.json
packages/web-avatar/tsconfig.build.json
packages/web-avatar/tsconfig.test.json
schema/v1/atlas.schema.json
rig-templates/base/halfbody/v1.2.0/textures/base.png
rig-templates/base/halfbody/v1.2.0/textures/atlas.json
packages/exporter-core/tests/golden/halfbody_v1.2.0.atlas.json
progress/sessions/2026-04-18-session-18-web-avatar-stage2.md (이 문서)
```

### 수정
```
packages/web-avatar/package.json           # v0.0.0 → v0.1.0, exports 맵, build/test scripts
packages/web-avatar/README.md              # stage 2 범위 업데이트 + 사용 예
packages/exporter-core/src/loader.ts       # textures/atlas 필드 추가, PNG/WebP 치수 해석
packages/exporter-core/src/converters/web-avatar.ts  # Texture shape + AtlasRef
packages/exporter-core/src/web-avatar-bundle.ts      # 텍스처 byte-copy + atlas.json emit
packages/exporter-core/tests/web-avatar.test.ts      # 신규 2 케이스
packages/exporter-core/tests/web-avatar-bundle.test.ts # 신규 3 케이스 + 파일 수 조정
packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar.json  # 재생성
packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar-bundle.snapshot.json  # 재생성
schema/v1/web-avatar.schema.json           # textures 치수 필수화 + atlas 필드
schema/README.md                            # atlas.schema.json 추가
scripts/validate-schemas.mjs                # atlas schema + validateAtlasDocs
progress/INDEX.md                           # session 18 row + 스트림 업데이트
```

## 7. 설계 결정 (D1 ~ D7)

### D1 — `<geny-avatar src>` 는 bundle.json URL (web-avatar.json 아님)
- **이유**: bundle.json 이 `files[].sha256` 전체 감사를 제공 → Stage 3+ 에서 런타임 integrity 검증 가능. web-avatar.json 단독 로드는 텍스처 sha256 을 알 수 없음.
- **영향**: 호출자는 `./avatar/bundle.json` 형태 URL 을 제공. 로더가 `files[]` 에서 `web-avatar.json` 엔트리를 찾아 base URL 에 상대 해석.

### D2 — 로더는 순수 함수, Custom Element 는 옵트-인
- **이유**: SSR/Node 환경에서도 타입/로더는 import 가능해야 함. DOM 의존성을 element.ts 에만 격리.
- **영향**: `@geny/web-avatar/loader` 로 직접 import 시 Custom Element 레지스트리를 건드리지 않는다.

### D3 — 모듈 루트 import 시 자동 등록
- **이유**: 가장 흔한 사용 패턴 (`import "@geny/web-avatar"` → `<geny-avatar>` 바로 사용). 프레임워크 격리 필요 시 `registerGenyAvatar(tagName)` 직접 호출.
- **영향**: `customElements === undefined` 가드로 Node 환경 안전.

### D4 — Stage 2 범위는 "로딩/파싱까지". 렌더/제어는 예외 throw.
- **이유**: 명시적 실패가 silently-no-op 보다 디버깅 쉬움. 호출자가 Stage 3 전까지 오인 사용을 조기 발견.
- **영향**: `setParameter/playMotion/setExpression` 는 `WebAvatarBundleError(code: "INVALID_SCHEMA")` throw. 메시지에 "not implemented in stage 2" 명기.

### D5 — atlas 는 번들의 별도 파일 (web-avatar.json 임베드 X)
- **이유**: 번들 구조 = "JSON 메타 + 바이너리 + UV 매핑" 의 3계층. atlas.json 은 보통 수 KB 대지만 대형 아바타/세트는 수백 KB 가능 → lazy fetch 여지 남김. 또한 AI 파이프라인이 atlas 만 재생성하는 루프에도 유리.
- **영향**: `web-avatar.json.atlas = {path:"atlas.json", sha256}` 참조만. 런타임은 필요시 skip 가능 (stage 2 는 항상 로드).

### D6 — 텍스처는 always albedo (purpose 하나)
- **이유**: Cubism/2D 파이프라인에서 현 시점 normal/specular 등 추가 맵 없음. 1종 사용이면 enum 을 열어 두되 값은 고정.
- **영향**: schema enum `["albedo"]`. 추후 확장 시 format bump (1 → 2) + runtime fallback.

### D7 — Integrity 검증은 Stage 3 이후 (SubtleCrypto)
- **이유**: 브라우저 fetch 는 sha256 자동 검증 안 해 줌. SubtleCrypto.digest 는 가능하지만 Stage 2 핵심 목표는 "형식 로딩". 검증 구현은 Stage 3 에서 WebGL 리소스 업로드와 함께.
- **영향**: `bundle.manifest.files[].sha256` 는 현재 참조용. 검증 미수행 — 다음 세션 로드맵.

## 8. Foundation Exit 영향

- **#1 (단일 아바타 생성→프리뷰→export)**: 런타임 로더가 준비됨 — 세션 19 에서 프리뷰 UI(최소 HTML) 띄우는 기반.
- **#3 (관측 대시보드)**: 변경 없음 (세션 17 config 완).
- 본 세션으로 새로 완료된 Exit 게이트 없음. Pipeline 스트림은 **Cubism + Web stage2 완**, Frontend 스트림은 **🟡 (Custom Element 스켈레톤 — 렌더링 없음)** 로 승격.

## 9. 다음 3세션

- **세션 19**: Foundation Exit #1 — 최소 web 프리뷰 HTML + sample bundle fetch. 수동 E2E 체크리스트 작성.
- **세션 20**: Observability Helm chart + 실배포 (Exit #3 완결) — 혹은 발급자 레지스트리/라이선스 verify.
- **세션 21**: AI 생성 어댑터 (nano-banana) skeleton 혹은 rig 확장 (v1.3 body 파츠).
