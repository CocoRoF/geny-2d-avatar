# Session 10 — `scripts/rig-template/migrate.mjs` + golden 회귀 CI

- **Date**: 2026-04-18
- **Workstreams**: Pipeline, Platform / Infra
- **Linked docs**: `docs/14 §3.3 (Foundation Exit checklist)`, `docs/11 §3`
- **Linked ADRs**: `progress/adr/0003` (템플릿 버저닝)
- **Previous**: 세션 09 — exporter-core v0.2.0 (cdi3 + model3 + bundle, commit `7ddfa43`)

---

## 1. 목표 (Goals)

- [ ] `scripts/rig-template/migrate.mjs` — v1.0.0/v1.1.0 → v1.2.0 자동 마이그레이션 (적용 가능한 필드·기본값·파일 구조 변경 한정, 사용자 저작 콘텐츠는 건드리지 않음).
- [ ] `scripts/test-golden.mjs` + `pnpm test:golden` (root) — end-to-end 골든 회귀 러너. 스키마·단위 테스트·CLI 번들 골든 byte 비교를 한 번에.
- [ ] `.github/workflows/ci.yml` — push/PR 에서 `pnpm build + test + validate:schemas + test:golden` 실행. 기존 `validate-schemas.yml` 은 스키마 전용 빠른 패스로 유지.
- [ ] `progress/INDEX.md` — session 10 row, Foundation Exit 체크리스트 #2 ✅ 토글.

### 범위 경계

- 마이그레이션은 **순방향만** (downgrade 없음). 대상은 공식 템플릿에 한정 — 사용자가 포크한 v1.0.0 템플릿의 **일부** 필드만 안전히 들어올릴 수 있다 (의미있는 자동 이행 가능한 것만).
- CI 러너는 GitHub Actions 이나 CI 프로바이더 중립 — 실제 `.yml` 은 GHA 문법.
- 성능 SLO·보안 스캔은 Exit checklist #3·#4 이고 별도 세션.

## 2. 사전 맥락 (Context)

- **v1.0.0 → v1.1.0** (세션 06): arm L/R 단일 파츠 → `arm_{l,r}_{a,b}` variant, `pose.json` 추가, `arm_pose_variant` 파라미터, manifest `cubism_mapping` 에 arm 관련 3 entry.
- **v1.1.0 → v1.2.0** (세션 07): `overall_{x,y,rotate}` + `hair_*_fuwa` 5 + `cloth_main_fuwa` 파라미터, `cloth_main` 파츠, `deformers.json` 에 `overall_warp`/`cloth_warp`, `physics.json` 의 setting 4 → 9 (sway L/R 분리 + Fuwa 5), manifest `cubism_mapping` 확장.
- 이 중 **기계적으로 이행 가능한 것**은 manifest/parameters 필드 추가 정도. arm 파츠 분할은 재저작이 필요 (변형 기준점·UV·z_order 모두 수동). 물리 설정은 물리적 파라미터 값 자체가 튜닝 대상. 따라서 migrate.mjs 는 "version bump + manifest 확장 + 파라미터 추가 시 기본값 0 주입" 수준만 보장하고, 파츠/물리/deformers 는 **경고 리포트** 로 사용자에게 수동 작업 목록을 남긴다.
- CI 금 회귀: 이미 `@geny/exporter-core` 가 8 개 골든 fixture + 48 tests 를 갖고 있어, **그 실행이 녹색이면 Exit checklist #2 (골든 1 아바타 회귀 자동)** 조건을 만족.
- pnpm workspace 가 이미 셋업되어 있어 `pnpm -r build` · `pnpm -r test` 가 전 패키지에 퍼진다. `@geny/exporter-core` 만 현재 tests 가 있어 `-r test` 는 사실상 exporter-core test.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 |
|---|---|---|
| 마이그레이션 엔진 | `scripts/rig-template/migrate.mjs` | CLI `node migrate.mjs <srcDir> <outDir>` — 현재 version 감지, 각 step migrator 순차 적용, 결과 쓰기. 각 단계에 skip 된 수동 작업은 `MIGRATION_REPORT.md` 로 출력. |
| 골든 러너 | `scripts/test-golden.mjs` | 단일 엔트리 포인트: validate-schemas → exporter-core build+test → CLI bundle 회귀 diff. 하나라도 실패하면 non-zero exit. |
| 루트 스크립트 | `package.json` | `scripts.test:golden` = `node scripts/test-golden.mjs`. |
| CI | `.github/workflows/ci.yml` | ubuntu-latest, Node 20.11, pnpm 9.12, 캐시 포함. 단계: install → `pnpm run test:golden`. |
| 진행 문서 | `progress/INDEX.md` | session 10 row + Foundation Exit #2 ✅. |

## 4. 결정 (Decisions)

- **D1 (migrate 는 보수적)**: "안전하게 자동화 가능한 항목" = manifest 필드 추가/갱신, parameters.json 에 파라미터 항목 누락 시 기본값으로 보충, compat.motion_packs 갱신. **거절**: 파츠 spec 분할·신규 파츠·물리 setting 추가·deformers 트리 수정. 이들은 보고서에 `TODO:` 리스트로.
- **D2 (출력은 새 디렉터리)**: `<outDir>` 이 비어 있어야 함. in-place 수정은 금지 (실수 방지 + git diff 가독성 + 롤백 용이). 필요 파일만 선택적으로 머지하는 건 사용자 책임.
- **D3 (step 체이닝)**: `1.0.0` → `1.1.0` → `1.2.0` 두 단계 migrator. 각 단계는 `(inputDir, outputDir) => Report` 시그니처. 기반 트리는 `fs-cp` 로 먼저 복사한 뒤 각 migrator 가 diff 만 적용.
- **D4 (CI 분리)**: 가벼운 `validate-schemas.yml` 은 유지 (스키마 PR 전용 빠른 경로), 중량 `ci.yml` 은 전체 회귀. paths 분리로 체크 중복 방지 — `ci.yml` 은 스키마 외에도 패키지·스크립트 경로 포함.
- **D5 (test:golden 스크립트 위치)**: `scripts/test-golden.mjs` (루트 `scripts/` 아래). 런타임에 `pnpm` 을 호출해 각 워크스페이스 패키지를 실행. 이 방식은 CI 에서도 로컬에서도 동일.
- **D6 (migrate 는 pure JS, ESM, 외부 의존성 0)**: Node 20 built-in (`fs/promises`, `path`, `url`, `process`) 만 사용. `ajv` 등은 validate-schemas 가 이미 담당.
- **D7 (골든 diff 실패 시 stderr 에 힌트)**: "`골든 갱신 명령은 다음 3 줄` ..." 힌트 포함 — 의도된 변경일 때 개발자가 빠르게 업데이트 가능.

## 5. 변경 요약 (Changes)

- `scripts/rig-template/migrate.mjs` — 신규 (버전 레지스트리 + 두 단계 migrator + MIGRATION_REPORT 출력).
- `scripts/test-golden.mjs` — 신규 (골든 회귀 통합 러너).
- `package.json` — `test:golden` 스크립트.
- `.github/workflows/ci.yml` — 신규 워크플로.
- `progress/INDEX.md` — session 10 row, Exit #2 ✅.

## 6. 블록 (Blockers / Open Questions)

- migrate.mjs 는 downgrade 를 지원하지 않는다. v1.2.0 에서 v1.0.0 으로의 역이행은 **데이터 손실** 이므로 의도적으로 제외 (documentation-only warning).
- CI 의 GitHub Actions secrets / matrix / concurrency 는 이 세션 범위 밖. 이후 세션에서 OS/Node 매트릭스·동시성 제한 추가.
- Windows 러너의 path delimiter 이슈 — 마이그레이션 스크립트는 `path.join` 으로 통일되어 이론상 호환이나, 실제 GHA windows 매트릭스 는 세션 11 이후.

## 7. 다음 세션 제안 (Next)

- **세션 11**: `samples/avatars/sample-01-aria` 재작성 + avatar 단 end-to-end export 스모크 (rig template + avatar refs → Cubism 번들 폴더 with moc/texture override).
- **세션 12**: Expression (exp3) 변환기 + Web Avatar 번들 포맷 가교.
- **세션 13**: 관측 대시보드 3종 기본 동작 (Exit #3) — 로깅 스키마·Prometheus·Grafana 뼈대.

## 8. 지표 (Metrics)

- **마이그레이션 단계 수**: 2 (v1.0.0→v1.1.0, v1.1.0→v1.2.0).
- **CI 단계 수**: install + test:golden = 2. test:golden 내부는 3 단계 (schemas / exporter-core tests / bundle diff).
- **검증**: `pnpm run test:golden` 로컬 실행 → exit 0. 마이그레이션 스크립트로 v1.0.0 템플릿 복사본을 v1.2.0 으로 이행 → 결과가 schemas 통과 (실 아바타 골든과는 다름 — 물리·파츠가 placeholder).

## 9. 인용 (Doc Anchors)

- [docs/14 §3.3 Foundation Exit 체크리스트](../../docs/14-roadmap-and-milestones.md#33-foundation-exit-체크리스트)
- [progress ADR 0003 템플릿 버저닝](../adr/0003-rig-template-versioning.md)
- [progress session 06 arm variants](./2026-04-18-session-06-arm-variants.md)
- [progress session 07 Fuwa physics](./2026-04-18-session-07-fuwa-physics.md)
