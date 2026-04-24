# Session 02 — Halfbody v1 Parts + Deformer Tree + CI

- **Date**: 2026-04-17
- **Workstreams**: Rig & Parts, Data, Platform (CI only)
- **Linked docs**: `docs/03 §4·§5·§9`, `docs/04 §2·§8·§9`, `docs/13 §12`
- **Linked ADRs**: `progress/adr/0002`, `progress/adr/0003`

---

## 1. 목표 (Goals)

- [x] halfbody v1 파츠 스펙 **전체 27 슬롯** 확보 (세션 01 샘플 3 + 이번 24).
- [x] `deformers.json` 구현 — docs/03 §4.1 트리 + 검증 스키마.
- [x] GitHub Actions 로 스키마 검증 자동화 (`validate-schemas.mjs` CI).

## 2. 사전 맥락 (Context)

- 세션 01 에서 모노레포 스켈레톤 / JSON Schema 5종 / halfbody manifest + parameters + 샘플 파츠 3종 이 완성됐고 Ajv 검증이 통과.
- 남은 21 파츠 + 선택 3 파츠(= 24 추가) 를 스펙화해야 파츠 간 의존 그래프 · Z-order · 앵커 컨벤션이 전체 파이프라인에 열린다.
- 물리(`physics.json`) / 모션(`motions/*`) / `test_poses` 는 세션 03 이후로 분리 — 파츠 스펙이 전제 조건.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| 파츠 스펙 24 | `rig-templates/base/halfbody/v1.0.0/parts/*.spec.json` | part-spec 스키마 통과, slot_id=파일명, 의존 그래프 무순환, z_order 단조 | ✅ |
| 디포머 트리 | `rig-templates/base/halfbody/v1.0.0/deformers.json` + `schema/v1/deformers.schema.json` | 트리 노드 = 파라미터·부모, 모든 `deformation_parent` 가 존재하는 노드 | ✅ |
| CI 검증 | `.github/workflows/validate-schemas.yml` | main/PR 에서 `pnpm validate:schemas` 통과 필수 | ✅ |

## 4. 결정 (Decisions)

- **D1 (deformers)**: `deformers.json` 은 평탄한 배열 + 각 노드에 `parent` 문자열을 두는 모델을 택한다 (중첩 JSON 은 diff 가 끔찍). 검증기가 트리로 재구성 후 사이클 검사.
- **D2 (variant A/B)**: Pose3 mutex 를 준비하되, 본 세션은 `arm_l/arm_r` 를 variant 없이 기본 스펙만 쓴다. variant 지원은 세션 04 (모션 팩과 함께).
- **D3 (FX 슬롯)**: halfbody v1 기본 템플릿에 FX 는 포함하지 않는다(docs/04 §2.3). `fx.*` 슬롯은 별도 `fx_pack.*` 릴리스로 분리.

## 5. 변경 요약 (Changes)

- `rig-templates/base/halfbody/v1.0.0/parts/` 에 24 스펙 추가.
- `rig-templates/base/halfbody/v1.0.0/deformers.json`, `schema/v1/deformers.schema.json` 신규.
- `scripts/validate-schemas.mjs` — 디포머 + 파츠-디포머 교차 체크 추가.
- `.github/workflows/validate-schemas.yml` 신규.

## 6. 블록 (Blockers / Open Questions)

- 파츠 간 색상 통계 목표 (docs/04 §5) 를 스펙에 인라인으로 박을지 별도 `color-contexts.json` 으로 뺄지 — 당분간 `visual.color_context` 키만 유지.
- `eye_lash_lower_*`, `mouth_inner`, `cheek_blush`, `accessory_*` 는 필수 여부 결정 필요 — docs/04 §2.1 표기를 따라 `required: false`.

## 7. 다음 세션 제안 (Next)

- **세션 03**: 물리(`physics.json`) 초판 + mao_pro 벤치마크 12 Setting 매핑 + 물리 파일 스키마.
- **세션 04**: `motions/` 기본 7 팩 (`idle.default`, `blink.auto` 등) + `test_poses/validation_set.json`.
- **세션 05**: arm variant A/B · Pose3 mutex · HitArea 바인딩 검증.

## 8. 지표 (Metrics)

- **파츠 스펙**: 27 / 27 (required 21 + optional 6). 모든 파일 `slot_id == filename stem`.
- **디포머 노드**: 14 (warp 14 / rotation 0 / glue 0). 루트 `root` 단일. hair_back_warp 는 root 직속(docs/03 §4.2 지연 회전 규칙).
- **파라미터 참조**: deformers.params_in 에서 사용하는 파라미터 ID 24 개 — 모두 `parameters.json` 에 존재(교차 검증 통과).
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=30 failed=0` (스키마 6 + 매니페스트 1 + parameters 1 + deformers 1 + parts 27 = 36 중 schema 로딩은 선 로딩이므로 집계에서 제외).
- **색 문맥 확장**: `part-spec.schema.json` enum 에 `mouth`, `shadow` 추가(docs/04 §5 정합).
- **Z-order 범위**: 10 (hair_back) – 95 (accessory_front). 단조성 유지.

## 9. 인용 (Doc Anchors)

- [docs/03 §4 디포머 계층](../../docs/03-rig-template-spec.md#4-디포머-계층-deformer-hierarchy)
- [docs/03 §5.3 Z-Order](../../docs/03-rig-template-spec.md#53-레이어-z-순서-draw-order)
- [docs/04 §2 파츠 슬롯 카탈로그](../../docs/04-parts-specification.md#2-파츠-슬롯-카탈로그-part-slot-catalog)
- [docs/04 §5 색 문맥 그룹](../../docs/04-parts-specification.md#5-색-문맥color-context-그룹)
- [docs/04 §8 파츠 계층](../../docs/04-parts-specification.md#8-파츠-계층-hierarchical-relationship)
- [docs/04 §9 변형 호환성](../../docs/04-parts-specification.md#9-변형-호환성-deformation-compatibility)
