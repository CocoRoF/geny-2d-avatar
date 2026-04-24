# ADR 0001 — Monorepo Layout with pnpm + Taskfile

- **Status**: Accepted
- **Date**: 2026-04-17
- **Deciders**: geny-core (1인 창업 단계, 기술 주도)
- **관련 문서**: `docs/13-tech-stack.md` §13, `progress/sessions/2026-04-17-session-01-foundation-kickoff.md`

---

## Context

프로젝트는 **웹앱(Next.js 15) · Python 서비스(FastAPI) · 공용 SDK(TS) · 리그 템플릿 · JSON Schema** 를 동시에 다룬다. `docs/13 §13` 에서 이미 디렉터리 트리를 명세했지만, 실제로 무엇을 저장소 기본 형태로 고정할지는 본 세션에서 결정해야 한다.

선택지:

1. **멀티레포**: `geny-web`, `geny-api`, `geny-rigs`, `geny-schema` 각각 분리.
2. **모노레포 (pnpm workspaces + Taskfile)**: 한 저장소, 다중 언어, 한 커밋으로 릴리스 단위 묶기.
3. **혼합**: 핵심은 모노, 엔터프라이즈 플러그인만 멀티.

현재 상황:

- 1인 개발 · Foundation 단계 · **스키마와 템플릿이 모든 서비스의 계약** 이다. 분리 시 버저닝 폭발.
- 언어 혼재(TS/Python)지만 루트에서 Taskfile 로 엔트리 포인트를 통일하면 CI 복잡도가 크지 않다.
- `pnpm` 은 워크스페이스 그래프·캐싱·의존 호스팅에서 npm/yarn 대비 현재 표준.

---

## Decision

**모노레포로 간다.** 루트 레이아웃은 아래처럼 고정한다.

```
/
├── apps/            # Next.js 웹앱, 어드민
├── packages/        # 공용 TS 라이브러리 (sdk, ui, validators)
├── services/        # Python FastAPI, Temporal worker, AI adapter
├── schema/          # JSON Schema 2020-12 (단일 계약)
├── rig-templates/   # 베이스 리그 템플릿 (SemVer 디렉터리)
├── infra/           # k8s, terraform, helm
├── scripts/         # 루트 유틸리티 (validate-schemas 등)
├── docs/            # 한국어 계획/스펙 문서
├── progress/        # 세션 로그 · ADR · 인덱스
├── pnpm-workspace.yaml
├── Taskfile.yml
├── package.json     # 루트 (pnpm 9, node 20.11)
├── pyproject.toml   # Python 툴체인 (ruff/mypy/pytest)
└── .editorconfig / .nvmrc / .gitignore
```

핵심 규약:

- **pnpm workspaces**: `apps/*`, `packages/*`, `services/*` 만 워크스페이스로. `schema`, `rig-templates`, `docs` 는 파일 기반 자원.
- **Taskfile** 이 루트 엔트리 포인트. 개발자는 `task install` / `task check` / `task validate:schemas` 만 기억하면 된다.
- **언어별 격리**: Python 은 `pyproject.toml` 루트 단일, 가상환경 `services/*/.venv`. TS 빌드는 각 패키지의 `package.json` 담당.
- **schema/ 는 워크스페이스 밖**: 언어 중립 자산. 각 언어가 생성기로 타입을 뽑는다(ADR 0002).

---

## Consequences

### 긍정적

- 한 번의 PR 로 "스키마 변경 + TS 사용처 수정 + Python 사용처 수정 + 템플릿 업데이트" 를 원자 단위로 릴리스 가능.
- Foundation 단계에서 저장소 이동 비용 없음. β 시점까지 유효.
- CI 는 root `Taskfile` 의 단일 엔트리 → 추후 `turbo`/`nx` 도입 가능 (현 시점 보류, 1인 단계 과잉).

### 부정적

- 저장소가 점점 무거워진다 → 커뮤니티 템플릿은 **별도 네임스페이스(`tpl.community.*`) 별 저장소** 로 분리한다(docs/03 §2.2). 즉 **"베이스 + 퍼스트파티"만 모노레포 안** 이다.
- Python/Node 를 한 CI 워커에 올리면 캐시 적중률 문제 발생 가능 → Taskfile 에서 `install:node` / `install:py` 를 분리해 단계적 캐싱.

### 중립

- 루트 `package.json` 은 **도구 컨테이너** 역할만. 배포 산출물 없음.

---

## Alternatives Considered

- **멀티레포**: 스키마 버저닝 지옥. 각 레포에 `schema` 를 subtree 로 박는 방법도 있지만 커밋 메시지가 왜곡됨. 기각.
- **단일 레포 + Bazel**: 1인 단계에서 학습 비용이 수익을 압도. 기각.
- **Turborepo**: 좋지만 워크스페이스가 10개 넘어가기 전까지는 캐시 이득이 작다. β 후 재검토.

---

## Follow-ups

- `apps/web` · `services/api` 스캐폴딩은 세션 02에서 실제 코드가 들어올 때 만든다(현재 READMEs 만 존재).
- `infra/` 실체는 Foundation 말기 클라우드 셋업과 함께(현재는 디렉터리 + README).
- 리뷰 시 이 ADR 과 `docs/13` 이 충돌하지 않는지 주기 체크.
