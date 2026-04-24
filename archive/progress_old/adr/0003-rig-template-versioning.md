# ADR 0003 — Rig Template Versioning: Full-SemVer Directory per Release

- **Status**: Accepted
- **Date**: 2026-04-17
- **Deciders**: geny-core
- **관련 문서**: `docs/03-rig-template-spec.md` §7, §8; `rig-templates/base/halfbody/v1.0.0/README.md`

---

## Context

`docs/03 §7` 은 템플릿 ID 를 `tpl.base.v{major}.{family}` 로, 내용 버전을 SemVer (`major.minor.patch`) 로 관리한다고 말한다. §8 의 예시 트리는 `v1.3.2/` 처럼 **풀 SemVer 를 디렉터리명** 으로 쓰는 형태다. 그러나 관행적으로 세 가지 대안이 있다.

1. **major 만 디렉터리** (`v1/`) + 내부 파일의 `version` 필드로 minor/patch 구분.
2. **풀 SemVer 디렉터리** (`v1.0.0/`, `v1.0.1/`, `v1.1.0/` 가 병렬 존재).
3. **Git 태그 기반** — 디렉터리는 하나, 릴리스는 태그로.

리그 템플릿은 "코드" 가 아니라 **자산(asset) + 계약** 이다. 다음 특성이 결정에 영향:

- AI 파이프라인은 특정 **정확한 버전** 을 고정해서 재현성을 확보해야 한다(docs/05, docs/08).
- 기존 아바타는 `template_version: "1.3.2"` 를 메타에 박아둔다(docs/12). 해당 버전이 **물리적으로 존재해야** 재검수·재내보내기가 가능.
- β 후 **18개월** 간 과거 major 유지 의무(docs/03 §7.3).

---

## Decision

**풀 SemVer 디렉터리** 를 채택한다.

```
rig-templates/base/halfbody/
  v1.0.0/
    template.manifest.json  (version: "1.0.0")
    parameters.json
    parts/*.spec.json
    ...
  v1.0.1/
  v1.1.0/
```

규약:

- 디렉터리 이름은 `v{major}.{minor}.{patch}` — `template.manifest.json` 의 `version` 필드와 **완전 일치**. 불일치는 validator 가 거부.
- `id` 필드는 **major 만 포함** (`tpl.base.v1.halfbody`) — API 식별자.
- 런타임 참조 형식: `tpl.base.v1.halfbody@1.0.0`.
- 프리릴리스는 `v1.1.0-rc.1/` 디렉터리명 허용 (SemVer 2.0 prerelease 문법).
- 삭제 금지: 한 번 푸시된 버전 디렉터리는 **이동·삭제 불가**. 수정이 필요하면 새 patch 를 올린다.

---

## Consequences

### 긍정적

- 아바타 메타의 `template_version` 이 디렉터리로 **1:1** 해석된다. 복잡한 Git 조회 없이 파일 시스템으로 검수/내보내기 재현.
- Diff 가 명확 — `v1.0.0/ → v1.0.1/` 복사 후 변경 파일만 수정하면 되므로 리뷰가 "바뀐 파일" 기준으로 집중 가능.
- 커뮤니티 템플릿(`tpl.community.*`) 이 별도 저장소가 되더라도 동일 규약을 복제 가능.

### 부정적

- 디렉터리 수가 누적 → 저장소 용량 증가. `physics/`, `motions/` 가 바이너리/대용량 JSON 이면 부담. **완화**: 공용으로 나누기보다 버전 고립을 우선. 공용이 필요한 경우 상위의 `shared/` 디렉터리로 뺀다(예: `rig-templates/shared/lipsync_mapping.v1.json`).
- 동일한 `physics/` 등을 여러 버전이 공유하고 싶은 유혹이 생김 → **금지**. 한 버전은 한 스냅샷.

### 중립

- Git LFS 필요성은 **현 단계에서는 불필요**. `physics3.json`, `motion3.json` 은 텍스트 JSON. 바이너리 자산(예: `.moc3`, `.psd`)은 `.gitignore`.

---

## Alternatives Considered

- **`v1/` 디렉터리 하나 + 내부 `version`**: 과거 패치 재현성 상실. 기각.
- **Git 태그만 사용**: `git worktree` 를 CI 가 매번 체크아웃해야 하고, 로컬 개발자가 여러 버전을 동시 참조하기 어렵다. 기각.
- **`v1.minor/` 까지만 디렉터리**, patch 는 git 기록: 절충안이지만 patch 도 **파일 내용이 달라진 별도 스냅샷** 이어야 재현성이 일관된다. 기각.

---

## Follow-ups

- `scripts/validate-schemas.mjs` 는 디렉터리명과 매니페스트 `version` 의 일치를 강제하는 체크를 포함한다(세션 01 구현).
- 버전 승급 스크립트(`scripts/rig-template/bump.mjs`) 는 세션 02 에서 추가.
- β 이전에 `v1.0.0 → v1.1.0` 첫 minor 승급을 한 번 리허설한다(파츠 스펙 추가).
- 저장소 비대화 징후(디렉터리 50개 이상/ template) 가 보이면 β 후 `rig-templates/base/halfbody/archive/v1.0.x/` 로 오래된 패치를 아카이브하는 규약을 추가 검토.
