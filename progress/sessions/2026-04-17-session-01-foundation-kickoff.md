# Session 01 — Foundation Kickoff

- **Date**: 2026-04-17
- **Workstreams**: Rig & Parts, Data, (Platform: 저장소 레이아웃만)
- **Linked docs**: `docs/03`, `docs/04`, `docs/12`, `docs/13 §13`, `docs/14 §3`
- **Linked ADRs**: `progress/adr/0001`, `progress/adr/0002`, `progress/adr/0003`

---

## 1. 목표 (Goals)

- [x] `progress/` 추적 체계 가동 (INDEX + TEMPLATE + 본 세션 로그).
- [x] `docs/13 §13` 기준 저장소 모노레포 스켈레톤 확립.
- [x] JSON Schema 3종 초판 (`rig-template`, `part-spec`, `avatar-metadata`).
- [x] `rig-templates/base/halfbody/v1.0.0/` 초판 (manifest + parameters + 핵심 파츠 스펙 샘플).
- [x] ADR 0001–0003 기록.

## 2. 사전 맥락 (Context)

- 앞선 대화에서 `docs/01–18 + index` 초판 완료. `mao_pro_ko` 레퍼런스 샘플을 `.gitignore` 로 제외한 상태.
- 실 인프라(K8s/Postgres/S3/AI vendor keys) 없이 **스펙·계약·스켈레톤** 부터 정리해 후속 세션이 바로 코드에 착수 가능하도록 한다.
- `docs/14 §3.3` 의 Foundation Exit 전체는 이번 세션 범위 밖(별도 세션들에서 분할).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| Progress 체계 | `progress/INDEX.md`, `progress/SESSION_TEMPLATE.md`, `progress/sessions/...` | INDEX 가 모든 워크스트림/ADR/세션을 가리키고, 템플릿이 재사용 가능 | 🟢 |
| 모노레포 스켈레톤 | `apps/`, `packages/`, `services/`, `schema/`, `rig-templates/`, `infra/`, `scripts/` + 각 README | `docs/13 §13` 레이아웃과 1:1 대응, 각 폴더 README 가 책임·미래 내용을 1쪽으로 기술 | 🟢 |
| JSON Schema 초판 | `schema/v1/rig-template.schema.json`, `schema/v1/part-spec.schema.json`, `schema/v1/avatar-metadata.schema.json` | `docs/03·04·12` 필드를 모두 커버, 예제가 검증 통과 | 🟢 |
| halfbody v1 템플릿 초판 | `rig-templates/base/halfbody/v1.0.0/*` | manifest + parameters + 최소 파츠 샘플 + README, 스키마 검증 통과 | 🟢 (필수 파츠 24 중 샘플 3개, 전체는 세션 02) |
| ADR | `progress/adr/0001`, `0002`, `0003` | 각 결정의 Context / Decision / Consequences 명시 | 🟢 |

## 4. 결정 (Decisions)

- **D1**: 단일 모노레포를 유지한다. 이유: SDK·schema·rig-templates·워커가 서로의 스키마를 공유해야 함. → ADR 0001.
- **D2**: 스키마는 JSON Schema 2020-12 드래프트로, 각 언어 바인딩(Python Pydantic, TS Zod) 은 **생성물** 로 취급. → ADR 0002.
- **D3**: 리그 템플릿 ID 와 디렉터리 경로는 **SemVer 풀 버전** (예: `v1.0.0/`) 으로 사용, `docs/03 §7.1` 의 `tpl.base.v{major}.*` 네이밍은 API 식별자로만. 파일 경로에는 `{major}.{minor}.{patch}` 를 모두 표기해 아카이브와 구별. → ADR 0003.

## 5. 변경 요약 (Changes)

- `progress/INDEX.md`, `progress/SESSION_TEMPLATE.md`, `progress/sessions/2026-04-17-session-01-foundation-kickoff.md` — 추적 체계 초판.
- `progress/adr/0001-monorepo-layout.md`, `0002-schema-first-contract.md`, `0003-rig-template-versioning.md` — 결정 기록.
- `apps/`, `packages/`, `services/`, `schema/`, `rig-templates/`, `infra/`, `scripts/` — 스켈레톤 디렉터리 + 각 README.
- `schema/v1/*.schema.json` — 1차 계약 정의 3종.
- `rig-templates/base/halfbody/v1.0.0/template.manifest.json`, `parameters.json`, `parts/face_base.spec.json`, `parts/hair_front.spec.json`, `parts/eye_iris_l.spec.json`, `README.md` — 템플릿 초판 (나머지 21 슬롯 → 세션 02).
- `package.json`(root), `pnpm-workspace.yaml`, `.editorconfig`, `.nvmrc`, `pyproject.toml`(root), `Taskfile.yml` — 개발 환경 진입점.
- `scripts/validate-schemas.mjs` — 스키마 검증 스크립트.

## 6. 블록 (Blockers / Open Questions)

- **파츠 24개 완전 스펙**: 이번 세션은 샘플 3. 세션 02에서 21개 추가 + 파츠 간 의존 그래프 검증 필요.
- **CI/CD**: 아직 GitHub Actions 미구성. 세션 02 말에 스키마 검증 워크플로우부터 추가.
- **Cubism 파라미터 매핑 자동화**: `docs/03 §12.1` 의 매핑 테이블을 `schema/v1/cubism-mapping.json` 으로 형식화할지 (열린 질문).

## 7. 다음 세션 제안 (Next)

- **세션 02**: halfbody v1 파츠 스펙 21종 추가, Cubism 매핑 스키마 형식화, GitHub Actions 스키마 검증 워크플로우, justfile/Taskfile 기본 레시피.

## 8. 지표 (Metrics)

- 신규 파일: 32종 (스키마 5, 템플릿 6, 진행 체계 6, 스캐폴딩 READMEs 7, 루트 설정 6, 스크립트 2).
- `rig-templates/base/halfbody/v1.0.0/`: manifest 1 + parameters.json 1 + part specs 3 + README 1 = **6**.
- `schema/v1/`: 5 (`rig-template`, `parameters`, `part-spec`, `avatar-metadata`, `common/ids`).
- `progress/adr/`: 3 (0001, 0002, 0003).
- **검증(Ajv 2020, `node scripts/validate-schemas.mjs`)**: ✅ `checked=5 failed=0`.
  - `rig-template.schema.json` × manifest.json 통과
  - `parameters.schema.json` × parameters.json 통과 (37 파라미터 / 7 그룹 / 2 combined_axes)
  - `part-spec.schema.json` × 3 part specs 통과
  - ADR 0003 교차 체크: 디렉터리 `v1.0.0/` ↔ manifest `version: "1.0.0"` 일치 확인.
- 런타임 의존: `ajv@^8`, `ajv-formats@^3` 설치 완료 (pnpm).
- 빌드/테스트: 해당 없음(이번 세션은 스펙 작성).

## 9. 인용 (Doc Anchors)

- [docs/03 §3 표준 파라미터 세트](../../docs/03-rig-template-spec.md#3-표준-파라미터-세트-standard-parameter-set)
- [docs/03 §9 파츠 슬롯 표준](../../docs/03-rig-template-spec.md#9-파츠-슬롯-표준-part-slot-standard)
- [docs/03 §12.1 Cubism 매핑](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [docs/04 §2 파츠 슬롯 카탈로그](../../docs/04-parts-specification.md#2-파츠-슬롯-카탈로그-part-slot-catalog)
- [docs/04 §3 파츠 스펙 파일](../../docs/04-parts-specification.md#3-파츠-스펙-파일-part-spec-file--예시)
- [docs/12 §4 엔티티 스키마](../../docs/12-data-schema-and-api.md)
- [docs/13 §13 저장소 구조](../../docs/13-tech-stack.md#13-저장소-구조repo-layout-제안)
- [docs/14 §3 Foundation](../../docs/14-roadmap-and-milestones.md#3-foundation-2026-q2-초)
