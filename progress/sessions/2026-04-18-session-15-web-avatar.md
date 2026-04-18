# Session 15 — Web Avatar 번들 포맷 Stage 1

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Data (`docs/11 §4` 경량 런타임 번들 계약 수립)
- **Linked docs**: `docs/11 §4.5` (Web Avatar 런타임), `docs/11 §3` (번들 매니페스트)
- **Linked ADRs**: 신규 없음 (ADR 0002 스키마-우선 계약 적용)
- **Previous**: 세션 14 — license/provenance 스키마 + Ed25519 서명 (commit `2ddbbf5`)

---

## 1. 목표 (Goals)

- [x] `schema/v1/web-avatar.schema.json` — `@geny/web-avatar` 런타임 전용 경량 JSON 메타.
- [x] `schema/v1/bundle-manifest.schema.json` kind enum 확장 — `cubism-bundle | web-avatar-bundle`.
- [x] `@geny/exporter-core` v0.6.0 — `convertWebAvatar()` + `assembleWebAvatarBundle()` + CLI `web-avatar` subcommand.
- [x] `packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar.json` + `.web-avatar-bundle.snapshot.json` 2 골든 신규.
- [x] `packages/exporter-core/tests/web-avatar.test.ts` + `web-avatar-bundle.test.ts` — 13 테스트 신규 (76 → 88 passing).
- [x] `packages/web-avatar/` — 패키지 스캐폴드 (package.json + README). 실제 런타임은 stage 2+.
- [x] `scripts/test-golden.mjs` step 5 — web-avatar 번들 CLI 골든 diff.
- [x] `scripts/validate-schemas.mjs` — web-avatar 스키마 등록 + 골든 파일 스키마 validation.
- [x] `schema/README.md` — 1행 추가.
- [x] `progress/INDEX.md` — session 15 row, Pipeline·Data 스트림 상태 업데이트.

### 범위 경계

- **런타임 코드 없음**: `packages/web-avatar/` 는 `package.json` + README 만. `<geny-avatar>` 커스텀 엘리먼트 구현은 stage 2+ 에서. 본 세션은 **입력 포맷 + 번들 조립기** 까지만.
- **텍스처 바이너리 동봉 없음**: `web-avatar.schema.json.textures[]` 는 경로·purpose 참조만. 실제 PNG/WebP 파일을 `bundle.json.files[]` 에 포함하는 것은 stage 2 에서 (세션 18 후보).
- **물리 엔진 없음**: `physics_summary` 는 설정 존재 여부 + 카운트만 노출. 실제 `.physics3.json` 를 파싱해 물리를 돌리는 것은 런타임 stage 에서.

## 2. 사전 맥락 (Context)

- **세션 13 bundle.json**: 번들 루트 매니페스트 스키마가 이미 있음. kind=`cubism-bundle` 하드코딩이었으나 본 세션에서 enum 확장.
- **세션 13 D1 (self-exclude)**: `bundle.json` 은 자신의 sha 를 `files[]` 에 포함하지 않음. `web-avatar-bundle` 도 동일하게 웹아바타 전용 매니페스트에 적용 (매니페스트 내 files[]=1 — `web-avatar.json` 만).
- **docs/11 §4.5**: 런타임은 Cubism `.moc3` 를 직접 파싱하지 않는다. 대신 우리가 미리 요약한 경량 JSON(`web-avatar.json`) 을 소비한다. 이유: 번들 크기 감소 + 런타임 코드 복잡도 감소 + 크로스플랫폼(Unity/Web/iOS) 일관성.
- **세션 08 D5 canonical JSON**: 2-space, LF, trailing `\n`, 키 ASCII 정렬, 배열 보존. 본 세션의 `web-avatar.json` + `bundle.json` 모두 적용 — 동일 템플릿 → 바이트 동일.
- **세션 14 서명**: license/provenance 는 `bundle_manifest_sha256` 로 번들을 가리킨다. web-avatar 번들도 동일하게 bundle.json sha 로 부착 가능 (별도 서명 경로 불필요).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| web-avatar 스키마 | `schema/v1/web-avatar.schema.json` | JSON Schema 2020-12, additionalProperties=false, 12 required. textures pattern = `^textures/.+\\.(png|webp)$`, purpose enum=`["albedo"]`. | 🟢 |
| bundle-manifest 확장 | `schema/v1/bundle-manifest.schema.json` | `kind` enum `["cubism-bundle", "web-avatar-bundle"]`. description 갱신. | 🟢 |
| converter | `packages/exporter-core/src/converters/web-avatar.ts` | `convertWebAvatar(tpl, opts)` — parameter_groups/parameters/parts/motions/expressions/textures 모두 stable-sort. physics_summary = `setting_count + total_output_count` or null. | 🟢 |
| bundle 조립기 | `packages/exporter-core/src/web-avatar-bundle.ts` | `assembleWebAvatarBundle(tpl, outDir, opts)` — `web-avatar.json` + `bundle.json` (kind=web-avatar-bundle, self-exclude). | 🟢 |
| CLI | `packages/exporter-core/src/cli.ts` | `web-avatar --template <dir> --out-dir <dir> [--avatar-id <id>]` — stdout=snapshotBundle, stderr=log. `--moc/--texture/--lipsync/--pack/--expression` 차단. | 🟢 |
| 공개 API | `packages/exporter-core/src/index.ts` + `package.json` exports | `./converters/web-avatar` + `./web-avatar-bundle` 추가. 타입 `WebAvatarJson` 외 10종 export. version 0.5.0 → 0.6.0. | 🟢 |
| 테스트 | `packages/exporter-core/tests/web-avatar{,-bundle}.test.ts` | converter 6 + bundle 6 = 12 + golden 1 snap = 13. 전체 스위트 88 pass. | 🟢 |
| 골든 | `packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar{,-bundle.snapshot}.json` | byte-equal 회귀용. `web-avatar.json` 11546 B · `bundle.json` 336 B. | 🟢 |
| 런타임 스캐폴드 | `packages/web-avatar/{package.json, README.md}` | private=true, engines node>=22.11. README = 현재 상태(스캐폴드) + stage 2+ 계획. | 🟢 |
| test:golden step | `scripts/test-golden.mjs` | step 5 `runWebAvatarBundleDiff` — CLI 경유 snapshot vs golden byte 비교. | 🟢 |
| validator 등록 | `scripts/validate-schemas.mjs` | `SCHEMA_ID.webAvatar` + compile + golden 파일 스키마 validation. checked 130 → 131. | 🟢 |
| README | `schema/README.md` | 1행 추가. | 🟢 |
| INDEX | `progress/INDEX.md` | session 15 row, Data 15→16 스키마, Pipeline v0.5→v0.6, 골든 12→14, test:golden 4→5 step. | 🟢 |

## 4. 결정 (Decisions)

- **D1 (런타임 전용 경량 JSON)**: `web-avatar.json` 은 Cubism `.moc3` 를 직접 파싱하지 않고 우리가 요약한 구조를 싣는다 (docs/11 §4.5). 이유: 런타임 번들 크기 감소 + Web/Unity/iOS 런타임 공통 구조 + Cubism 버전에 런타임 비종속.
- **D2 (web-avatar 를 별개 번들 종류로, Cubism 번들과 분리)**: 같은 `bundle.json` 스키마(kind 분기) 를 재사용하되 디렉터리는 분리. Editor/orchestrator 는 동일 아바타에 대해 두 번들을 **동시에** 발행(Cubism 프로페셔널 워크플로용 + Web 경량 런타임용). 공통 스키마는 JAR-style 감사 일관성 유지.
- **D3 (`bundle.json` self-exclude 유지)**: 세션 13 D1 을 그대로 적용. web-avatar-bundle 내 `files[]` 는 `web-avatar.json` 1개만. 자기 자신(bundle.json) 제외.
- **D4 (결정론 — canonicalJson 재사용)**: 세션 08 D5 의 canonical JSON 규칙(2-space, LF, trailing `\n`, ASCII 키 정렬) 동일 적용. 모든 배열(parameter_groups/parameters/parts/motions/expressions/textures) 은 안정적 키로 sort → 소스 정렬 상태에 무관하게 바이트 동일.
- **D5 (physics_output 파라미터를 `parameters[]` 에서 제거하지 않음)**: 런타임이 물리 엔진을 붙일 때 `Param*_sway` 등의 id 를 **참조** 할 수 있어야 한다. 런타임이 직접 쓰지는 않아도 존재 사실 자체는 알아야 함. 따라서 전체 파라미터를 노출, `physics_summary` 로 "물리 엔진이 붙은 설정이 있다" 를 별도 신호.
- **D6 (`textures[]` 는 stage 1 에서 빈 배열 default)**: 실제 PNG/WebP 파일을 번들에 동봉하는 것은 stage 2 에서. 지금은 런타임이 텍스처 경로 구조만 계약으로 받아들이고, 실제 파일 참조는 Editor 연동 이후. `ConvertWebAvatarOptions.textures` 로 주입 가능(미래 코드 경로 미리 준비).
- **D7 (`expressions[].name_en` fallback to expression_id)**: 템플릿이 ko/ja 만 제공하면 런타임이 영문 UI 를 만들 때 깨짐. 따라서 converter 에서 `name?.en ?? expression_id` fallback. 스키마는 `name_en` 필수 유지.
- **D8 (CLI 옵션 경계)**: `web-avatar` 는 Cubism 전용 옵션(`--moc/--texture/--lipsync/--pack/--expression`) 를 거부. 별도 명령 분리로 실수 방지 + 사용 의도 명확화 (세션 11 D7 의 avatar-export spec 경계와 동일 원칙).
- **D9 (version bump 0.5.0 → 0.6.0)**: 공개 API 추가(`convertWebAvatar` / `assembleWebAvatarBundle` / CLI subcommand) — 호환 깨짐 없음 → SemVer minor bump. exports 경로 2종 추가도 minor.
- **D10 (validator 가 골든 파일을 직접 스키마로 검증)**: `scripts/validate-schemas.mjs` 에 `halfbody_v1.2.0.web-avatar.json` 을 `web-avatar.schema.json` 으로 validate. 이는 converter 출력과 스키마 계약의 **이중 검증** — converter 버그로 스키마 위반을 낼 경우 golden 바이트가 같더라도 CI 가 잡도록.

## 5. 변경 요약 (Changes)

- `schema/v1/web-avatar.schema.json` — 신규 (세션 요구). 12 required, textures pattern, physics_summary oneOf.
- `schema/v1/bundle-manifest.schema.json` — kind enum 확장, description 갱신.
- `schema/README.md` — 1행 추가.
- `packages/exporter-core/src/converters/web-avatar.ts` — 신규.
- `packages/exporter-core/src/web-avatar-bundle.ts` — 신규.
- `packages/exporter-core/src/cli.ts` — `web-avatar` subcommand (+ `--avatar-id`), parseArgs 분기, help 갱신.
- `packages/exporter-core/src/index.ts` — exports 추가.
- `packages/exporter-core/package.json` — 0.5.0 → 0.6.0, `./converters/web-avatar` + `./web-avatar-bundle` export 추가.
- `packages/exporter-core/tests/web-avatar.test.ts` — 6 tests.
- `packages/exporter-core/tests/web-avatar-bundle.test.ts` — 6 tests.
- `packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar.json` — 골든.
- `packages/exporter-core/tests/golden/halfbody_v1.2.0.web-avatar-bundle.snapshot.json` — 골든.
- `packages/web-avatar/package.json` — 신규 스캐폴드.
- `packages/web-avatar/README.md` — 신규 (stage 1 설명 + stage 2+ 계획).
- `scripts/test-golden.mjs` — step 5 `runWebAvatarBundleDiff`, 88 tests 카운트.
- `scripts/validate-schemas.mjs` — `SCHEMA_ID.webAvatar`, `validators.webAvatar`, `validateWebAvatarGolden()`.
- `progress/sessions/2026-04-18-session-15-web-avatar.md` — 본 파일.
- `progress/INDEX.md` — session 15 row, Pipeline/Data 스트림 업데이트, 릴리스 게이트 수정, 다음 3세션 예고 조정.

## 6. 블록 (Blockers / Open Questions)

- **텍스처 atlas 규약**: stage 2 에서 `textures[]` 에 실제 파일을 어떻게 담을지 결정 필요. 후보:
  1. 단일 `albedo.png` atlas + mesh UV 를 별도 `mesh.json` 으로 출력.
  2. 슬롯별 PNG(`textures/body.png`, `textures/face.png`, ...) + 런타임이 조립.
  본 결정은 Editor 렌더 파이프라인 도입과 함께 검토.
- **런타임 API 표면**: `<geny-avatar>` 가 노출할 API(`setParameter`/`playMotion`/`setExpression`/`on('frame')`) 는 아직 미정. stage 2 세션 예정.
- **physics 세부 데이터 로딩 경로**: `physics_summary` 는 존재 여부만 알림. 실제 `.physics3.json` 를 어디서 로드할지(Cubism 번들 재참조 vs web-avatar 번들에 별도 물리 요약 포함) 미정.
- **web-avatar-bundle 과 license 결합**: 기존 license 는 **Cubism 번들 bundle.json sha** 를 가리킴. 동일 아바타에 대해 두 번들(Cubism + web-avatar) 이 발행될 때 license 가 각각 필요한지/하나만으로 족한지 정책 결정 필요. 후보안: license 하나 + `bundles[]` 배열로 두 sha 동시 결합. 세션 17 로테이션 세션에서 재검토.

## 7. 다음 세션 제안 (Next)

- **세션 16**: 개발자 온보딩 1일 달성 (Foundation Exit #4) — 루트 README, quickstart (`pnpm i && pnpm run test:golden`), troubleshooting, 8+1 CLI subcommand 예제, license/provenance 인지, web-avatar CLI 사용 예.
- **세션 17**: 관측 대시보드 3종 (Foundation Exit #3) — Prometheus/Grafana 뼈대. 또는 공개키 레지스트리 + `license.verify` 엔드포인트.
- **세션 18**: Web Avatar stage 2 — 텍스처 PNG/WebP 번들 + atlas 메타. 실제 런타임 `<geny-avatar>` 스켈레톤.

## 8. 지표 (Metrics)

- **스키마 수**: 15 → 16 (+web-avatar).
- **exporter-core**: v0.5.0 → v0.6.0. 공개 API +3 함수 (`convertWebAvatar`, `convertWebAvatar` overload 없음, `assembleWebAvatarBundle`) + 10 타입 + CLI subcommand 1.
- **테스트**: 76 → 88 (+12 — converter 6 + bundle 6). 전 스위트 pass.
- **test:golden 단계**: 4 → 5 (+web-avatar bundle diff). 전 step pass.
- **validate-schemas checked**: 130 → 131 (+golden web-avatar.json).
- **골든 파일**: 12 → 14 (+2: web-avatar.json + web-avatar-bundle.snapshot.json).
- **번들 바이트 (halfbody v1.2.0)**: Cubism 36042 B (15 files) · Web Avatar 11882 B (2 files) — 약 30% 크기.

## 9. 인용 (Doc Anchors)

- [docs/11 §4 Web Avatar 번들](../../docs/11-export-and-deployment.md)
- [progress session 13 bundle manifest](./2026-04-18-session-13-bundle-manifest.md)
- [progress session 14 license/provenance](./2026-04-18-session-14-license-provenance.md)
- [progress session 08 canonical JSON (D5)](./2026-04-18-session-08-exporter-core.md)
