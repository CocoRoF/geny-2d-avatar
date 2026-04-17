# Session 11 — avatar-export 스펙 + `assembleAvatarBundle` end-to-end 스모크

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Data
- **Linked docs**: `docs/11 §3.5`, `docs/04 §* (avatar-as-data)`, `docs/12 §4.5`
- **Linked ADRs**: `progress/adr/0004` (참조형 아바타)
- **Previous**: 세션 10 — migrate.mjs + golden CI (commit `8a4a7f8`)

---

## 1. 목표 (Goals)

- [ ] `schema/v1/avatar-export.schema.json` — 아바타 단의 export 구성 계약 (moc/texture/lipsync/bundle_name 오버라이드). docs/11 §3.5 의 번들 경로 계약과 exporter-core D7/D8 을 데이터로 고정.
- [ ] `samples/avatars/sample-01-aria.avatar.json` — template_version `1.0.0` → `1.2.0` bump (세션 07+ 실제 사용 가능한 버전).
- [ ] `samples/avatars/sample-01-aria.export.json` — 실 예제 export spec (Aria 전용 moc/texture 경로 + precise lipsync + bundle_name).
- [ ] `packages/exporter-core/src/avatar-bundle.ts` — `assembleAvatarBundle(spec, rigTemplatesRoot, outDir)`: 상위 레이어에서 export spec + rig template 레퍼런스를 받아 번들 조립.
- [ ] golden: `samples/avatars/sample-01-aria.bundle.snapshot.json` (aria 바운더리 번들 snapshot).
- [ ] `scripts/test-golden.mjs` 확장 — avatar 번들 회귀도 포함.
- [ ] CLI `avatar` 서브커맨드 — `node …/cli.js avatar --spec <path> --rig-templates-root <dir> --out-dir <dir>`.
- [ ] 버전 bump `@geny/exporter-core` 0.2.0 → 0.3.0 (avatar 레이어 추가).

### 범위 경계

- Avatar 에 포함되는 `part_instance` 레벨의 AI 생성 결과물(masks/latent/style_profile refs) 은 이 세션 범위 밖 — `part_instance` 스키마는 별도 세션 (AI Generation 워크스트림).
- 실제 `.moc3` 바이너리/아틀라스 픽셀 데이터 — 여전히 외부 산출.
- 다중 아바타(batch export) · orchestrator 연동 — Foundation 이후.

## 2. 사전 맥락 (Context)

- **ADR 0004** (참조형 아바타): "avatar = metadata + part_instances + style_profile_ref. 번들 시점엔 rig template 을 조합." 지금까지 metadata 만 스키마화되어 있음 (`avatar-metadata.schema.json`, 세션 05).
- **세션 09 `assembleBundle`** 은 rig template 까지만 입력으로 받는다 — 어떤 moc/texture/lipsync 를 쓸지는 *호출자* 결정. 이 세션은 그 결정을 **데이터 계약 (avatar-export spec)** 으로 고정.
- **세션 10 golden CI** 는 halfbody v1.2.0 번들 1개만 본다. 이 세션 이후로 CI 는 *avatar-level* 회귀도 감시.
- **파일명 분리**: 이미 존재하는 `sample-01-aria.avatar.json` 은 metadata 전용. export spec 은 **별도 파일** `sample-01-aria.export.json` — 관심사 분리(metadata 는 DB row, export 는 파이프라인 입력).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 |
|---|---|---|
| avatar-export schema | `schema/v1/avatar-export.schema.json` | JSON Schema 2020-12, additionalProperties false, required fields 확정. `pnpm run validate:schemas` 통과. |
| avatar metadata bump | `samples/avatars/sample-01-aria.avatar.json` | template_version `1.2.0`. 기존 metadata 필드 유지. |
| avatar export spec | `samples/avatars/sample-01-aria.export.json` | moc/textures/lipsync/bundle_name 포함. avatar-export.schema 통과. |
| assembleAvatarBundle | `packages/exporter-core/src/avatar-bundle.ts` | 입력: `{spec, rigTemplatesRoot}` + outDir. 템플릿 자동 조회 → assembleBundle 위임. |
| CLI avatar | `packages/exporter-core/src/cli.ts` | `avatar --spec <path> --rig-templates-root <dir> --out-dir <dir>` 서브커맨드. |
| golden 번들 snapshot | `samples/avatars/sample-01-aria.bundle.snapshot.json` | avatar 번들의 결정론적 파일 목록 스냅샷. byte-for-byte. |
| test:golden 확장 | `scripts/test-golden.mjs` | 기존 3 단계에 avatar 번들 비교 1 단계 추가. |
| 버전 bump | `packages/exporter-core/package.json` | `0.2.0` → `0.3.0`. |
| INDEX 갱신 | `progress/INDEX.md` | session 11 row, 🟢 여부 토글. |

## 4. 결정 (Decisions)

- **D1 (avatar-export 는 별도 파일)**: metadata 파일 `.avatar.json` 과 export spec `.export.json` 분리. 이유: (a) metadata 는 DB row 단위로 바뀜 (status, updated_at), export 설정은 번들링 파이프라인 전용. (b) 권한 모델 분리 용이 (metadata 는 작성자 편집, export 는 배포 엔지니어).
- **D2 (export spec 는 avatar_id 참조만 가짐)**: metadata 복제 금지. 참조(`avatar_id`) + template (`template_id` + `template_version`) + 번들 설정만 가진다. 런타임에서 metadata 와 조인.
- **D3 (필수 필드 최소화)**: `schema_version`, `avatar_id`, `template_id`, `template_version`, `bundle_name` 5 개만 required. moc/textures/lipsync 는 optional (생략 시 D7 placeholder).
- **D4 (`bundle_name` 는 파일 prefix 를 결정)**: 세션 09 D8 의 "avatar" 중립 prefix 를 D4 에서 오버라이드. 예: `bundle_name: "aria"` → `aria.model3.json`, `aria.cdi3.json`, …. motions dir 는 항상 `motions/` (변경 없음).
- **D5 (rigTemplatesRoot 는 경로 규약으로 템플릿 해석)**: `<rigTemplatesRoot>/base/halfbody/v<template_version>/` 로 고정 (spec_id 의 `tpl.base.v1.halfbody` → `base/halfbody`). 규약 불일치 시 throw. 이 선택은 집중 가능성을 확보 — 향후 custom template id 도입 시 레지스트리 계층 추가.
- **D6 (golden 스냅샷은 avatar 바운더리)**: `sample-01-aria.bundle.snapshot.json` 는 aria 번들 전체(5 + 7 motions = 12 파일, bundle_name=aria 로 인한 prefix 다름) 의 sha256 목록. exporter-core 수준 halfbody golden 과 중복처럼 보이지만, *avatar 오버라이드* 경로가 내려오는지를 회귀 체크 (bundle_name/moc/texture 변화에 대한 검증).
- **D7 (avatar CLI 는 spec 파일 1개만 받음)**: `--moc` / `--texture` 같은 플래그 중복 지원하지 않는다. spec 파일을 통해서만 override. 이유: 결정론·재현성 (CLI 플래그는 단순 덮어쓰기 용이).
- **D8 (버전 0.3.0 bump)**: avatar 단 스펙·번들러가 추가됨. 하위 converter 는 변경 없어 SemVer minor.

## 5. 변경 요약 (Changes)

- `schema/v1/avatar-export.schema.json` — 신규.
- `schema/README.md` — avatar-export 항목 추가.
- `scripts/validate-schemas.mjs` — avatar-export 검증 편성.
- `samples/avatars/sample-01-aria.avatar.json` — template_version bump.
- `samples/avatars/sample-01-aria.export.json` — 신규.
- `samples/avatars/sample-01-aria.bundle.snapshot.json` — 신규 (golden).
- `packages/exporter-core/src/avatar-bundle.ts` — 신규.
- `packages/exporter-core/src/index.ts`, `package.json` exports — avatar-bundle 추가.
- `packages/exporter-core/src/cli.ts` — `avatar` 서브커맨드.
- `packages/exporter-core/tests/avatar-bundle.test.ts` — 신규 (~5 tests).
- `packages/exporter-core/package.json` — version `0.3.0`.
- `scripts/test-golden.mjs` — avatar 번들 단계 추가.
- `progress/INDEX.md` — session 11 row, 🟢 상태.

## 6. 블록 (Blockers / Open Questions)

- 실제 moc3/텍스처 없이 "로드 가능 여부" 최종 검증은 불가. 이 세션은 *번들 파일 구조와 경로 계약* 만 가둔다. Editor 검증은 Foundation Exit 수동 체크리스트 단계.
- `part_instance` / `style_profile` 단 스키마는 AI Generation 워크스트림에서. 이 세션 avatar-export 는 템플릿 + 오버라이드만 묶으므로 선행 가능.

## 7. 다음 세션 제안 (Next)

- **세션 12**: Expression(exp3) 변환기 + Web Avatar 번들 포맷 가교.
- **세션 13**: 관측 대시보드 3종 기본 동작 (Foundation Exit #3).
- **세션 14**: 개발자 온보딩 1일 달성 (Foundation Exit #4) — README·quickstart·troubleshooting.

## 8. 지표 (Metrics)

- **스키마 수**: 10 → 11 (avatar-export 추가).
- **변환기/번들러**: 5 + 1 + **avatar 레벨 +1** = 7 엔트리 API.
- **골든 fixture 수**: 8 → 9 (avatar 번들 snapshot +1).
- **테스트 수**: 48 → ~53 (avatar-bundle 5 추가).
- **CI 체크포인트**: test:golden = 3 → 4 단계.

## 9. 인용 (Doc Anchors)

- [docs/11 §3.5 빌드 경로](../../docs/11-export-and-deployment.md#35-빌드-경로)
- [progress ADR 0004 참조형 아바타](../adr/0004-avatar-as-data.md)
- [progress session 05 avatar 샘플](./2026-04-18-session-05-avatar-pose.md)
