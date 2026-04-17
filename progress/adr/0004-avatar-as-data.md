# ADR 0004 — Avatar-as-Data: 메타 + PartInstance 참조, 템플릿은 값이 아닌 참조

- **Status**: Accepted
- **Date**: 2026-04-18
- **Deciders**: geny-core
- **관련 문서**: `docs/12-data-schema-and-api.md` §4.5 / §4.6 / §4.7, `docs/03-rig-template-spec.md` §7, `docs/11-export-and-deployment.md` §3.2.1
- **관련 ADR**: [0002](./0002-schema-first-contract.md), [0003](./0003-rig-template-versioning.md)

---

## Context

"Avatar" 가 애플리케이션의 중심 엔터티가 되면서, 이를 **어떤 형태의 값** 으로 저장할지 결정이 필요하다. 가능한 축은 두 개다.

1. **Self-contained 아바타** — 한 JSON 에 템플릿 정의 + 파라미터 + 파츠 이미지 참조 + Pose3 + physics 오버라이드까지 전부 포함. 교환·백업 간편.
2. **참조형 아바타** — 템플릿은 git 참조(`template_id@template_version`), 파츠는 별도 엔터티(PartInstance), avatar 는 메타 + 버전 스냅샷만.

docs/12 §4.5–4.7 은 이미 후자(참조형) 전제로 쓰였지만, **ADR 차원에서 명시적으로 고정** 되어 있지 않았다. 구체 질문들이 세션 05 에 다시 올라왔다.

- pose3 mutex 는 avatar 마다 다른가, 템플릿이 소유하는가?
- avatar JSON 에 parts 가 flat 리스트여야 하나, `part_instance_id` 참조만 담아야 하나?
- `template_version` 을 뛰어넘는 오버라이드(예: 사용자가 파라미터 범위를 임의로 늘림) 를 허용할 것인가?

결정을 미루면 exporter, API, UI, DB 가 제각각 가정을 세운다.

---

## Decision

**참조형 아바타** 를 채택한다. Avatar 는 "이 사용자의 선택지 묶음" 메타 + PartInstance 참조 + 버전 스냅샷이며, 템플릿 구조는 모든 아바타가 공유하는 불변 자산이다.

### 계약

1. **`avatars.*` 테이블/레코드** — docs/12 §4.5 스키마 준수. 필수 9 필드는 `schema_version, id, prj_id, name, template_id, template_version, status, created_by, created_at`. 그 외는 모두 nullable.
2. **`template_id + template_version`** — 해당 버전의 `rig-templates/base/{family}/v{semver}/` 가 반드시 저장소에 존재(ADR 0003). 존재하지 않으면 validator 가 거부.
3. **PartInstance** — 실제 이미지/프롬프트/승인 상태는 `parts/{prt_id}` 로 분리 저장. `avatar.current_version_id` 는 Version 을 가리키고, Version 이 `slot_id → prt_id` 매핑을 소유(docs/12 §4.6).
4. **Pose3 는 템플릿 측** — mutex 그룹은 구조적 제약(파일명 `rig-templates/.../pose.json`). avatar 가 어떤 A/B 를 "현재 보여줄지" 는 parameter 값(예: `arm_pose_variant=0|1`) 으로 표현.
5. **파라미터 범위 오버라이드 금지** — avatar 는 템플릿이 선언한 `parameters.json` 의 range/default 를 변경할 수 없다. 필요하면 새 템플릿 버전을 만든다.
6. **교환 번들(`avatar_{id}/`)** — docs/11 §3 의 디스크 구조는 export 시점에 **생성되는 결과물**. 저장소의 소스 데이터는 여전히 참조형 레코드. 번들은 재현 가능한 artifact 이지 source of truth 가 아니다.

### 저장소 규약

```
samples/
  avatars/
    sample-01-aria.avatar.json   ← avatar-metadata 인스턴스 (메타만)
  part_instances/                ← 차후 세션에서 개시
  style_profiles/
rig-templates/base/halfbody/v1.0.0/
  template.manifest.json  parameters.json  parts/  motions/  physics/  pose.json?
```

- 샘플은 **메타만** 커밋한다(실제 이미지는 S3, 저장소에는 참조 key 를 쓰지 않음).
- validator 는 `samples/avatars/` 를 walk 해 avatar-metadata 스키마 + 템플릿 참조 존재를 검증한다(세션 05 구현).

---

## Consequences

### 긍정적

- **템플릿 업데이트가 전파 가능** — `v1.0.0 → v1.0.1` patch 가 올라갈 때 avatar 가 `template_version` 을 bump 하는 마이그레이션 한 방으로 반영된다.
- **DB 스키마 안정** — avatar row 의 폭이 얕아 인덱싱/샤딩 친화적.
- **Exporter 가 deterministic** — 같은 `(template_id, template_version, part_instances, parameters)` 입력이면 같은 번들. C2PA provenance 와 궁합이 좋다.
- **샘플 검증 루프가 싸다** — avatar-metadata 인스턴스를 몇 KB 로 만들고 CI 에 여러 개 섞어 회귀 검출.

### 부정적

- **Self-contained export 가 필요할 때 추가 단계** 가 든다 — docs/11 §3 번들 생성 로직을 `packages/exporter-core` 에서 구현해야 한다(세션 07 예정). 단일 파일로 끝나지 않는다.
- **템플릿 삭제 시 아바타 고아화** — ADR 0003 의 "버전 삭제 금지" 와 짝을 이루어야 한다. 만약 외부 템플릿이 저장소에서 사라지면 avatar 가 렌더 불가 상태가 됨 — 커뮤니티 템플릿 섹션에서 별도 정책 필요(TBD).
- **DB 조회가 join 을 요구** — 썸네일 1장을 보여주려면 avatar + version + part_instances[] 까지 읽어야 하는 경우가 있다. 완화: `provenance_summary_hash` 나 별도의 `avatar_summary` 캐시 테이블을 훗날 검토.

### 중립

- "avatar 오버라이드" 는 아바타의 **파라미터 값 / 선택된 파츠 / 모션 선정** 으로만 표현된다 — 구조(파라미터 목록, 파츠 슬롯, Pose3 그룹) 는 템플릿 소유.

---

## Alternatives Considered

- **Self-contained 아바타 JSON**: 단일 파일 교환이 쉬우나, 템플릿 패치가 여러 아바타로 전파되지 않고 중복이 폭증. 기각.
- **Avatar 가 parameters.json 을 상속+오버라이드**: range 까지 바꿀 수 있게 허용하면 검수/export 가 "아바타마다 다른 파라미터 공간" 을 감당해야 한다. 복잡도 폭발. 기각.
- **Pose3 를 avatar 측에 둠**: mutex 구조는 템플릿의 파츠 topology 에 종속 — avatar 가 바꿀 수 있는 것이 실질적으로 없다. 기각.

---

## Follow-ups

- 세션 06: halfbody v1.1.0 에서 arm variant 도입 → 첫 `pose.json` 작성 → 본 ADR 의 "Pose3 는 템플릿 측" 명제가 실제 파일로 확인됨.
- 세션 07: `packages/exporter-core` 가 avatar + template 을 받아 docs/11 §3 번들(`avatar_{id}/`) 을 deterministic 하게 생성.
- 세션 08 이후: `samples/part_instances/` 개시. 더미 S3 key 로 파츠 플로우 회귀 픽스처 편성.
- DB 설계 시: avatar → version 은 1:N, version → part_instance 는 M:N 링크(Version.parts[] 가 link 를 들고 있음). 외래키 방향 확정은 세션 08 이후 infra 편성 시점에.
