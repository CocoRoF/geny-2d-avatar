# Session 05 — Avatar Sample + Pose3 Schema + HitArea Validation

- **Date**: 2026-04-18
- **Workstreams**: Data, Rig & Parts
- **Linked docs**: `docs/03 §12.1`, `docs/11 §3.2`, `docs/11 §3.2.1`, `docs/12 §4.5`
- **Linked ADRs**: `progress/adr/0002`, `progress/adr/0003`, (new) `progress/adr/0004`

---

## 1. 목표 (Goals)

- [x] `schema/v1/pose.schema.json` 신규 — Cubism `pose3.json` 의 snake_case 계약. v1.0.0 은 파일 부재지만 스키마·검증 경로 먼저 확정.
- [x] `samples/avatars/sample-01-aria.avatar.json` 신규 — avatar-metadata 인스턴스 1건. status=draft, template 참조 `tpl.base.v1.halfbody@1.0.0`.
- [x] `validate-schemas.mjs` 확장 — (a) manifest.hit_areas[].bound_to_part ∈ slotIds, (b) `samples/avatars/` 디렉터리 walk + avatar-metadata 검증 + template 참조 교차 검증, (c) 템플릿 `pose.json` 옵셔널 로드.
- [x] `progress/adr/0004-avatar-as-data.md` — avatar = `metadata + part_instances + (optional) version snapshot` 모델. 템플릿은 참조, Pose3 는 템플릿 측 구조.
- [x] `INDEX.md`·ADR 표 갱신 + 워크스트림 상태 업데이트.

## 2. 사전 맥락 (Context)

- docs/11 §3.2.1: `pose3.json` 은 mutex 그룹(팔 A/B 등)을 선언해 동시 노출을 막음. Cubism 예시의 `Type/Groups/Id/Link` → 우리 내부는 `type/groups/slot_id/link` snake_case.
- docs/03 §12.1 #7: `template.manifest.json` 의 `hit_areas[]` 는 `{id, role, bound_to_part}` — `bound_to_part` 는 슬롯 ID(우리 내부 규약). 기존 manifest 는 `face_base`·`torso` 로 바인딩.
- docs/12 §4.5: Avatar 엔터티는 DB row + export 번들에서 공유. 필수 필드 minimum = 9개. 선택 필드 = style_profile_id, current_version_id, updated_at, tags, validation, provenance_summary_hash.
- `halfbody v1.0.0` 에는 팔 A/B variant 가 없음 — pose.json 파일은 아직 생성하지 않고 스키마·검증 경로만 준비. 파일이 실제로 추가될 시점은 v1.1.0 (arm variant 도입) 이후.
- 저장소 규약: 샘플 데이터는 `samples/` 루트, 도메인별 하위(`avatars/`, `parts/`, `style_profiles/` 등)로 분할. 이번 세션에서는 avatars/ 만 개시.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| Pose3 스키마 | `schema/v1/pose.schema.json` | Cubism pose3 snake_case. groups[][] 형태, slot_id + link[]. | ✅ |
| Avatar 샘플 | `samples/avatars/sample-01-aria.avatar.json` | avatar-metadata 통과. template 참조가 실제 저장소에 존재. | ✅ |
| 검증기 확장 | `scripts/validate-schemas.mjs` | hit_areas 교차 검증 + samples/avatars walk + optional pose.json. | ✅ |
| ADR 0004 | `progress/adr/0004-avatar-as-data.md` | avatar-as-data 의사결정·결과·대안. | ✅ |
| INDEX 갱신 | `progress/INDEX.md` | 세션 05 로우, ADR 표, 워크스트림 Data. | ✅ |

## 4. 결정 (Decisions)

- **D1 (pose snake_case 정책)**: Cubism `pose3.json` 의 키(`Type/Groups/Id/Link`) 를 우리 내부는 `type/groups/slot_id/link` 로 보관. Cubism 파츠 ID 가 아닌 **우리 slot_id** 로 참조 — export 시 `cubism_mapping` 으로 PartXxx 로 변환(docs/11 §3.2 경유). 이유: 내부 단일 진실 공급원은 slot, Cubism ID 는 export 관심사.
- **D2 (pose.json 파일 옵셔널)**: 템플릿에 pose.json 이 없어도 검증이 깨지지 않도록 — ENOENT 는 skip, 존재 시에만 검증. 파일은 variant 를 가진 템플릿 버전부터 생성.
- **D3 (avatar 샘플 위치)**: `samples/avatars/*.avatar.json` 규약. 파일명 `sample-NN-{slug}.avatar.json`. 샘플은 단지 데이터 정합성 증명용으로 저장소에 커밋(민감 정보 없음).
- **D4 (avatar-as-data, ADR 0004)**: avatar 는 metadata + part_instance 참조만 저장. 템플릿 정의는 git 참조(`template_id@template_version`). parts/motions/physics 는 템플릿 소유. Pose3 mutex 구조는 템플릿 측(모든 사용자가 공유).
- **D5 (HitArea bound_to_part 정합)**: `bound_to_part` 는 실제 슬롯 ID 여야만 함 — 검증기에서 교차검사. 없으면 Cubism 생성 시 dangling reference 가 되어 Viewer 런타임 에러. manifest 검증 이후 parts 로드 완료 시점에 실행.

## 5. 변경 요약 (Changes)

- `schema/v1/pose.schema.json` 신규.
- `samples/avatars/sample-01-aria.avatar.json` 신규 (samples/ 디렉터리 최초 커밋).
- `scripts/validate-schemas.mjs` — hit_areas 체크 + samples/avatars walk + optional pose.json 로드 블록 추가.
- `progress/adr/0004-avatar-as-data.md` 신규.
- `progress/INDEX.md` — 세션 05 로우, ADR 표, 워크스트림(Data) 상태, 누적 산출물 맵(`samples/` 추가).

## 6. 블록 (Blockers / Open Questions)

- pose.json 파일은 halfbody v1.0.0 범위 밖 (variant 부재). v1.1.0 에서 arm A/B 추가 시점에 첫 파일 생성.
- part_instance 샘플은 미작성 — 실제 이미지 key 가 없는 상태에서 메타만 커밋하는 게 의미가 희박해서 별도 세션으로 미룸. 세션 06 또는 post-processing 파이프라인 최초 랜딩 시 편성.
- avatar 샘플의 `prj_id`·`created_by` 는 고정 ULID 를 채워넣었다 — DB 가 생기기 전이라 단순 구조 증명이 목적. 실제 샘플 생성은 첫 run 이후 재작성 예정.

## 7. 다음 세션 제안 (Next)

- **세션 06**: Fuwa/옷 볼륨 파라미터 + arm A/B variant → halfbody v1.1.0 bump → pose.json 첫 작성 + normal 프리셋 12 설정 완성 + greet.wave 재작성.
- **세션 07**: `packages/exporter-core` — 템플릿 JSON → Cubism `.moc3/.physics3.json/.motion3.json/.pose3.json/.cdi3.json` 변환 초판.
- **세션 08**: part_instance 샘플 + S3 key 규약(docs/12 §5) 구현 초안.

## 8. 지표 (Metrics)

- **스키마 총합**: 10종 (pose 신규). 9 → 10.
- **샘플 자료**: 1건 (avatars/sample-01-aria).
- **검증 결과**: `node scripts/validate-schemas.mjs` → `checked=40 failed=0` (세션 04 의 39 + avatar 샘플 1).
- **검증기 확장 항목**: hit_areas.bound_to_part ∈ slotIds (manifest 마다) · samples/avatars walk + template 참조 존재 검사 · optional pose.json 로드.
- **ADR 수**: 3 → 4.

## 9. 인용 (Doc Anchors)

- [docs/03 §12.1 mao_pro 기반 비교](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [docs/11 §3.2 Groups / HitAreas](../../docs/11-export-and-deployment.md#32-파라미터-매핑)
- [docs/11 §3.2.1 Pose3 대체 포즈 그룹](../../docs/11-export-and-deployment.md#321-pose3-대체-포즈-그룹)
- [docs/12 §4.5 Avatar](../../docs/12-data-schema-and-api.md#45-avatar)
