# Session 13 — Bundle manifest (`bundle.json`) + 번들 자체 해시 감사

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Data
- **Linked docs**: `docs/11 §4.5`, `docs/11 §9`, `docs/12 §4`
- **Linked ADRs**: 신규 없음 (스키마-우선 계약 ADR 0002 적용)
- **Previous**: 세션 12 — Expression(exp3) 변환기 + halfbody 표정 3종 (commit `048384e`)

---

## 1. 목표 (Goals)

- [x] `schema/v1/bundle-manifest.schema.json` — 번들 디렉터리 루트에 놓이는 `bundle.json` 의 스키마. 모든 파일(파일 자신 제외) 의 `{path, sha256, bytes}` 목록 + 번들 kind/출처 메타 선언.
- [x] `@geny/exporter-core` v0.4.0 → v0.5.0 — `assembleBundle` 이 `bundle.json` 을 마지막 파일로 emit. `avatarId` 옵션 pass-through (avatar 경로). `BundleResult.files` 에 `bundle.json` 포함.
- [x] 기존 halfbody/aria 번들 goldens 재생성 (14 → 15 files) + `bundle-manifest.test.ts` 신규 (8 tests).

### 범위 경계

- **license.json + provenance** (docs/11 §9) 은 이 세션 밖. 번들 자체 감사(sha256 매니페스트) 만 먼저 확립. 서명·발급자·라이선스 계약은 별도 세션.
- **zip/tar 패키징** 도 이 세션 밖. `bundle.json` 은 디렉터리 안의 일반 파일. 이후 세션에서 zip archiver 가 이 매니페스트를 봉인한다.
- **Web Avatar 런타임**(`@geny/web-avatar`) 은 이 세션 밖. 본 세션은 Cubism bundle 에 국한해 `kind: "cubism-bundle"` 만 지원한다 (enum 확장 여지 남김).

## 2. 사전 맥락 (Context)

- **세션 11 스냅샷 포맷**: `snapshotBundle(result)` 가 이미 `{file_count, files:[{path, sha256, bytes}], total_bytes}` 를 canonical JSON 으로 반환하고 있다. 이 구조는 golden 비교용 in-memory 오브젝트. 본 세션은 이걸 "on-disk manifest" 로 승격하되, 번들의 목적/출처 메타(`kind`, `template_id`, `avatar_id`) 를 추가한다.
- **docs/11 §4.5** — Web Avatar 번들은 "JSON 메타 + 텍스처" 단일 단위. 이 세션의 `bundle.json` 은 그 디스크립터의 Cubism 판이며, 향후 web-avatar 번들에도 재사용 가능한 공통 구조를 의도.
- **docs/11 §9** — license.json 과 provenance 는 별도 파일. 본 매니페스트는 **해시 목록만** 책임지고, 라이선스/서명은 이후 파일이 `bundle.json` 을 참조하도록 설계.
- **결정론 제약**: `created_at` 같은 타임스탬프는 golden byte-equal 을 깨뜨린다. 본 매니페스트에는 **절대 포함하지 않는다**. 시간 메타는 향후 provenance 파일 책임.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| bundle-manifest schema | `schema/v1/bundle-manifest.schema.json` | JSON Schema 2020-12, additionalProperties false. required=[schema_version, kind, format, files]. `pnpm run validate:schemas` 통과. | 🟢 |
| avatar-export schema 갱신 | — | 본 세션은 avatar-export 스키마 변경 없음. | 🟢 |
| exporter-core bundle.json emit | `packages/exporter-core/src/bundle.ts` | `assembleBundle` 이 마지막에 `bundle.json` 을 쓰고 `BundleResult.files` 에 포함. bundle.json 내부 `files[]` 는 자신을 제외. | 🟢 |
| avatarId pass-through | `packages/exporter-core/src/avatar-bundle.ts` | `specToBundleOptions(spec)` 가 `avatarId: spec.avatar_id` 를 반환, `assembleAvatarBundle` 이 그대로 전달. | 🟢 |
| BundleFileNames.manifest | `packages/exporter-core/src/converters/model.ts` | 기본값 `"bundle.json"`. CLI override 가능. | 🟢 |
| goldens 재생성 | `packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json` · `samples/avatars/sample-01-aria.bundle.snapshot.json` | 15 files 포함, byte-for-byte. | 🟢 |
| bundle-manifest.test.ts | `packages/exporter-core/tests/bundle-manifest.test.ts` | 8 tests — kind/format/files-exclude-self/template_id resolution/avatarId pass-through/manifest rename/determinism. | 🟢 |
| bundle.test.ts / avatar-bundle.test.ts 갱신 | — | 14 → 15 file count 확정 + `bundle.json` path 포함 검증. | 🟢 |
| 버전 bump | `packages/exporter-core/package.json` | `0.4.0` → `0.5.0`. SemVer minor — 공개 API 추가만. | 🟢 |
| test:golden | `scripts/test-golden.mjs` | 주석 test 수 갱신 (68 → 76). 단계 수는 4 유지. | 🟢 |
| INDEX | `progress/INDEX.md` | session 13 row, Pipeline 스트림 상태 `v0.5.0 + bundle.json` 으로. | 🟢 |

## 4. 결정 (Decisions)

- **D1 (`bundle.json` 은 번들 내부 15번째 파일, 자기 자신은 files 목록에서 제외)**: JAR 의 `META-INF/MANIFEST.MF` 패턴. 매니페스트가 자기 자신의 sha256 을 내장하면 chicken-and-egg 문제. 대신 `BundleResult.files` 는 15 개 전부 — 디스크와 1:1. 매니페스트 자체 검증은 상위 provenance 레이어의 책임.
- **D2 (kind enum 도입, 초기값 `"cubism-bundle"` 만)**: 향후 `"web-avatar-bundle"` 등 확장. enum 으로 선언해두면 Web Avatar 세션에서 `oneOf` 분기 깔끔.
- **D3 (format integer, 시작값 1)**: 스키마 버전(`schema_version: "v1"`) 와 별개. 매니페스트 구조 자체의 호환 버전. 향후 파일 메타(예: mtime, permissions) 추가 시 format bump.
- **D4 (타임스탬프 금지)**: `created_at` 등은 무조건 제외. golden 결정론. 시간·서명은 이후 `provenance.json` 책임.
- **D5 (`template_id`·`template_version` 은 manifest 에서 자동 추출)**: `assembleBundle(tpl, ...)` 는 `tpl.manifest.id` + `tpl.manifest.version` 을 사용. null 허용(미래에 template 없는 번들 경로 여지).
- **D6 (`avatar_id` 는 옵션)**: 템플릿-단독 assembleBundle 에서는 null. avatar-export spec 경유 시 spec.avatar_id 주입.
- **D7 (`files[]` 정렬 + 전체 sha256/bytes 일관성)**: 세션 09 의 `BundleResult.files` 정렬·canonical 계산과 동일 규칙 재사용. `bundle.json` 자체를 뺀 14 항목을 path 알파벳 순으로.
- **D8 (버전 0.5.0 bump)**: 공개 API 추가(type, 함수). 하위 호환. SemVer minor.

## 5. 변경 요약 (Changes)

- `schema/v1/bundle-manifest.schema.json` — 신규.
- `schema/README.md` — bundle-manifest 항목 추가.
- `scripts/validate-schemas.mjs` — bundle-manifest 스키마 로드. 샘플 인스턴스는 별도 없음(모든 골든 번들이 암묵적 샘플).
- `packages/exporter-core/src/bundle.ts` — `bundle.json` 작성 루프.
- `packages/exporter-core/src/converters/model.ts` — `BundleFileNames.manifest` 기본 `"bundle.json"`.
- `packages/exporter-core/src/avatar-bundle.ts` — `specToBundleOptions` → `avatarId` 추가.
- `packages/exporter-core/src/index.ts` — `BundleManifestJson` 타입 export.
- `packages/exporter-core/package.json` — 0.5.0.
- `packages/exporter-core/tests/bundle-manifest.test.ts` — 신규.
- `packages/exporter-core/tests/bundle.test.ts` · `avatar-bundle.test.ts` — 14 → 15 files.
- `packages/exporter-core/tests/golden/halfbody_v1.2.0.bundle.snapshot.json` — 재생성.
- `samples/avatars/sample-01-aria.bundle.snapshot.json` — 재생성.
- `scripts/test-golden.mjs` — 주석 갱신.
- `progress/INDEX.md` — session 13 row + Pipeline 상태.

## 6. 블록 (Blockers / Open Questions)

- **provenance / license.json 과의 상호참조**: `bundle.json` 이 license 파일을 참조할지, license 파일이 bundle.json 을 참조할지. 현재는 **license 쪽이 bundle.json 의 sha 를 가리키는** 방향을 선호(매니페스트는 불변, 라이선스는 이후 부착). 결정은 세션 14 이후.
- **checksum 알고리즘**: 현재 sha256 만. Cubism 원본도 sha256 관행이므로 단일 알고리즘 유지. 향후 ecosystem 확장 시 `sha256:<hex>` 접두어로 알고리즘 명시 가능.

## 7. 다음 세션 제안 (Next)

- **세션 14**: `license.json` + provenance 시그너처 (`docs/11 §9`) — 라이선스 메타 + 발급자 + 서명 링크. 본 세션의 bundle.json 을 기반으로.
- **세션 15**: Web Avatar 번들 포맷(docs/11 §4) 1 단계 — 패키지 스켈레톤 + bundle.json 재사용 + 텍스처 에셋 규약.
- **세션 16 후보**: 관측 대시보드 (Foundation Exit #3) — Prometheus/Grafana 뼈대.

## 8. 지표 (Metrics)

- **스키마 수**: 12 → 13 (+bundle-manifest).
- **번들 파일 수 (halfbody v1.2.0)**: 14 → 15 (+bundle.json).
- **번들 바이트 총합 (halfbody v1.2.0)**: 33609 → 36042 (+2433, bundle.json 포함).
- **테스트 수**: 68 → 76 (+8 bundle-manifest).
- **exporter-core 버전**: 0.4.0 → 0.5.0.
- **CI 체크포인트**: test:golden = 4 단계 유지.

## 9. 인용 (Doc Anchors)

- [docs/11 §4.5 Web Avatar 번들 포맷](../../docs/11-export-and-deployment.md#45-번들-포맷)
- [docs/11 §9 라이선스 & 증명서](../../docs/11-export-and-deployment.md#9-라이선스--증명서-license--provenance)
- [progress session 11 avatar-export](./2026-04-18-session-11-avatar-export.md)
- [progress session 12 expressions](./2026-04-18-session-12-expressions.md)
