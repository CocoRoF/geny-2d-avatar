# ADR 0002 — Schema-First: JSON Schema 2020-12 as Single Source of Truth

- **Status**: Accepted
- **Date**: 2026-04-17
- **Deciders**: geny-core
- **관련 문서**: `docs/12-data-schema-and-api.md`, `docs/03-rig-template-spec.md`, `docs/04-parts-specification.md`

---

## Context

이 시스템의 **모든 공용 계약**은 4종이다.

1. 리그 템플릿 매니페스트 / 파라미터 / 파츠 스펙 (`docs/03`, `docs/04`)
2. 아바타 · 버전 · 파츠 인스턴스 엔터티 (`docs/12 §4`)
3. HTTP API 요청·응답 (`docs/12 §5`)
4. 이벤트 메시지 (`docs/12 §6`)

언어는 **TypeScript (web, sdk)** 와 **Python (services, AI adapter)** 가 섞여 있다. 두 언어에서 동일 계약을 "손으로" 들고 있으면 반드시 어긋난다. Foundation 단계부터 계약을 하나로 잡아야 β 이전에 비용이 누적되지 않는다.

선택지:

1. **Zod (TS) 또는 Pydantic (Py) 한 쪽을 권위로** — 다른 쪽은 수동 동기화. **기각**: 편향.
2. **Protobuf / gRPC 스키마** — 타입은 강하나 JSON 친화 API · 파일 계약과 궁합 약함. **기각**: 템플릿 매니페스트·PSD 자산 메타는 JSON 이 자연.
3. **JSON Schema 2020-12 단일 권위** — `$ref` · `$defs` · `oneOf`/`anyOf`/`if-then` 지원. 각 언어는 **생성기** 로 타입을 뽑는다. **채택**.

---

## Decision

- **`schema/v1/**/*.schema.json`** 이 **유일한 계약 원본**. 수정은 이 파일에서만.
- 생성 타겟:
  - TypeScript: `json-schema-to-typescript` 또는 `zod-from-json-schema` → `packages/schema-types/`
  - Python: `datamodel-code-generator` → Pydantic v2 → `packages/schema_py/`
- **런타임 검증**: TS 는 Ajv 2020, Python 은 `jsonschema` (Draft 2020-12). 두 쪽 모두 동일 스키마 파일을 읽어들인다.
- **스키마 자체의 버저닝**: `schema/v1/` → `schema/v2/` 디렉터리 승격. `schema_version` 필드는 스키마 내부에서 `const: "v1"` 로 강제.
- **ID 규약** (`schema/v1/common/ids.json`):
  - 내부 엔터티 ID: `{prefix}_{ULID}` 포맷 (userId=`usr_`, avatarId=`av_`, …).
  - 템플릿 ref: `tpl.{base|community|custom}.v{major}.{family}`.
  - 슬롯 ID: 소문자 스네이크 + `fx.*` 네임스페이스 허용.
  - 파라미터 ID: 소문자 스네이크, `Param*` 는 Cubism 쪽 매핑용으로 분리.

---

## Consequences

### 긍정적

- 스키마 변경 → 양쪽 타입 재생성 → 사용처 컴파일 에러로 즉시 노출. **계약 위반이 런타임까지 살아남지 않는다.**
- `rig-templates/base/**` 의 JSON 파일을 **동일 스키마로 직접 검증** 가능 (`scripts/validate-schemas.mjs`). 템플릿 기여자가 런타임 없이 린트 가능.
- API 문서(OpenAPI)도 JSON Schema 를 참조해 중복 없이 생성 가능 (추후 단계).

### 부정적

- 생성기마다 생성물의 모양이 미묘하게 다르다 → **생성 산출물을 저장소에 커밋하지 않는다**. 빌드 타임에 재생성. 단, 타입 드리프트 방지용 스냅샷 테스트는 필요.
- JSON Schema 의 `if-then-else`·`oneOf` 조합은 생성기에서 종종 잃어버린다 → 복잡 규칙은 Ajv 수준 런타임 검증으로 보강.

### 중립

- Pydantic 은 생성이지만 **validator 를 손으로 확장**해도 된다(도메인 로직). 단, 생성된 필드 구조 자체는 수정 금지.

---

## Alternatives Considered

- **"Zod 권위" 전략**: TS 친화적이지만 Python 측에서 역변환이 불완전하고, JSON 직렬화 규약에도 차이. 기각.
- **Protobuf + gRPC**: 마이크로서비스 다량 발생 시 이점. 현재 단일 백엔드 + 워커 구조에서는 과잉. β 이후 재검토 가능.
- **OpenAPI 권위 + 역생성**: HTTP 만 커버. 파일 포맷·이벤트 페이로드까지 강제하려면 결국 JSON Schema 로 내려간다.

---

## Follow-ups

- `packages/schema-types` (TS) · `packages/schema_py` (Python) 패키지 실체는 **세션 02** 에서 생성기 스크립트와 함께 만든다.
- 현 시점(세션 01) 에서는 `schema/v1/*.schema.json` + `scripts/validate-schemas.mjs` 까지만 존재. 이 스크립트가 template.manifest · parameters · parts 샘플 전부를 통과해야 세션을 닫는다.
- 스키마 변경 PR 체크리스트는 세션 02 에서 `.github/pull_request_template.md` 로 고정.
