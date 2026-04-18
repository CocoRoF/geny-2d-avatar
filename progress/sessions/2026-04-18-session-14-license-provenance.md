# Session 14 — `license.json` + `provenance.json` 스키마 + Ed25519 서명 스캐폴드

- **Date**: 2026-04-18
- **Workstreams**: Data, Platform / Infra (license/provenance 계약 수립)
- **Linked docs**: `docs/11 §9.1`, `docs/11 §9.2`, `docs/11 §9.3`, `docs/16` (라이선스 타입)
- **Linked ADRs**: 신규 없음 (ADR 0002 스키마-우선 계약 적용)
- **Previous**: 세션 13 — 번들 루트 `bundle.json` 매니페스트 (commit `50d2a42`)
- **Prerequisite fix**: CI Node 20.11 → 22.11 bump (commit `f331022`) — `node --test` positional glob 미지원 문제 해결

---

## 1. 목표 (Goals)

- [x] `schema/v1/license.schema.json` — docs/11 §9.1 기반. `bundle_manifest_sha256` 로 번들 결합, Ed25519 서명, 약관 버전.
- [x] `schema/v1/provenance.schema.json` — docs/11 §9.2 기반. 파츠 계보 (source_type/vendor/seed/prompt_sha256), post-processing 이력, 번들 결합.
- [x] `scripts/sign-fixture.mjs` — 테스트 전용 Ed25519 서명/검증 헬퍼. RFC 8032 §7.1 Test 1 공개 벡터 사용.
- [x] `samples/avatars/sample-01-aria.license.json` + `sample-01-aria.provenance.json` — 유효 서명 포함 샘플.
- [x] `scripts/validate-schemas.mjs` — 신규 2종 스키마 로드 + 샘플 검증 + 번들 sha 교차확인 + 서명 검증.
- [x] `schema/README.md` — 항목 2개 추가.
- [x] `progress/INDEX.md` — session 14 row, Data 스트림 상태 업데이트.

### 범위 경계

- **`@geny/exporter-core` 수정 없음**: 번들 조립기는 순수 결정론 계약(세션 13 D4)을 유지한다. license/provenance 는 번들 밖에서 발급되는 **부착 가능한 증명서** 이므로 exporter-core 의 책임이 아니다. 추후 별도 서비스(예: `services/license-issuer/`) 또는 orchestrator 레이어에서 발급.
- **공개키 레지스트리 인프라 없음**: 이 세션은 스키마 계약 + 픽스처 서명만. 키 로테이션/revocation/`license.verify` 엔드포인트는 별도 세션.
- **프로덕션 키 없음**: 본 세션의 샘플은 **RFC 8032 §7.1 Test 1** (공개 테스트 벡터, `9d61b19d…`) 로 서명. `signer_key_id: "geny.fixture.rfc8032-test1"` 인 문서만 허용. 프로덕션 키 (`geny.platform.YYYY-MM`) 분리.

## 2. 사전 맥락 (Context)

- **세션 13 D1**: `bundle.json` 은 자기 자신의 sha256 을 포함하지 않는다 (JAR `META-INF/MANIFEST.MF` 패턴). 그래서 번들 자체 감사는 상위 레이어가 맡는다.
- **세션 13 D4**: 번들엔 타임스탬프·서명 금지. 시간·서명은 **provenance / license 책임**.
- **세션 13 열린 질문**: "license 쪽이 bundle.json 의 sha 를 가리키는 방향 선호". 본 세션에서 이 방향 확정 (`license.bundle_manifest_sha256 = sha256(bundle.json)` ).
- **docs/11 §9.1 예시 구조**: `avatar_id, template, owner, style_profile, license_type, usage_rights, restrictions, created_at, platform_terms_version, signature`. 이 중:
  - `template` → `template_id` + `template_version` 분리 (세션 13 관행).
  - `created_at` → `issued_at` (명확성) + `expires_at` 추가 (만료 옵션).
  - `bundle_manifest_sha256` 신설 — §9.3 서명이 결합 대상을 명시하기 위함.
  - `license_id`, `signer_key_id` 신설 — 레지스트리/감사.
- **docs/11 §9.2**: 민감 정보는 해시만. 원문은 콘솔에서만. 본 세션의 `prompt_sha256` 가 이를 준수.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| license 스키마 | `schema/v1/license.schema.json` | JSON Schema 2020-12, additionalProperties=false, Ed25519 signature pattern, bundle_manifest_sha256 required. | 🟢 |
| provenance 스키마 | `schema/v1/provenance.schema.json` | parts[] (3 source_type enum) + post_processing[] + signature. | 🟢 |
| 서명 헬퍼 | `scripts/sign-fixture.mjs` | RFC 8032 Test 1 로 sign + verify. canonical JSON payload (2-space, LF, trailing `\n`, sorted keys; 세션 08 D5). CLI 사용. | 🟢 |
| 아리아 license | `samples/avatars/sample-01-aria.license.json` | 스키마 통과 + signer_key_id=fixture + signature verify=ok + `bundle_manifest_sha256` = aria 번들의 bundle.json sha. | 🟢 |
| 아리아 provenance | `samples/avatars/sample-01-aria.provenance.json` | 3 파츠 (template_preset / user_uploaded / ai_generated 각 1), post-processing 2, signature verify=ok. | 🟢 |
| validate-schemas 확장 | `scripts/validate-schemas.mjs` | SCHEMA_ID +2, validators +2, license/provenance 샘플 루프. bundle.json sha 교차확인. verifyDocument() 호출. `checked=130 failed=0`. | 🟢 |
| README | `schema/README.md` | 2 라인 추가. | 🟢 |
| INDEX | `progress/INDEX.md` | session 14 row, Data 스트림 (13 → 15 스키마 + license/provenance 샘플). | 🟢 |

## 4. 결정 (Decisions)

- **D1 (license 가 bundle 을 참조, 역방향 금지)**: `license.bundle_manifest_sha256` = `sha256(bundle.json)`. 이는 세션 13 D1 (bundle 은 자신을 참조 못 함) 의 귀결. 서명된 라이선스가 특정 번들에 고정됨 → 번들 재생성 시 라이선스 재서명 필요. provenance 도 동일 방향.
- **D2 (avatar_id + template_id/version 을 license/provenance 양쪽에서 중복 필드로)**: bundle.json 도 같은 필드들을 가지고 있음. 3개 파일에 퍼져 있더라도 sha256 로 서로를 묶으므로 불변 체인 성립. 각 파일이 stand-alone 으로 검증 가능.
- **D3 (서명 페이로드 = canonical JSON of document - signature field)**: `signature` 를 제거한 뒤 canonicalJson() (2-space, LF, trailing newline, ASCII byte sort). 이는 세션 08 D5 의 번들 변환기 표준과 동일 규칙 → 동일 직렬화기 재사용 가능 (현재는 sign-fixture.mjs 에 inline, 추후 공용 모듈로 승격 가능).
- **D4 (Ed25519 선택)**: docs/11 §9.3 지정. JWT (RSA/ECDSA) 보다 키/서명 크기 작고 (32B pub / 64B sig), Node 내장 `crypto.sign('ed25519')` 로 외부 의존 없음.
- **D5 (서명 포맷 `ed25519:<base64url-no-padding>`)**: 알고리즘 접두어로 향후 확장성(예: `ed448:…`, `rsa-pss-sha256:…`) 확보. base64url (`[A-Za-z0-9_-]+`) 은 URL-safe, 패딩 제거로 스트림 친화적.
- **D6 (signer_key_id 패턴 `[a-z][a-z0-9._-]{2,62}`)**: 프로덕션 예시 `geny.platform.2026-04` (월별 로테이션 여지), 픽스처 `geny.fixture.rfc8032-test1`. 키 식별자 네임스페이스로 `geny.{ role }.{ tag }` 관행.
- **D7 (RFC 8032 Test 1 픽스처 사용)**: 개인키도 공개된 테스트 벡터이므로 리포지토리에 직접 포함해도 안전. `signer_key_id` 가 `geny.fixture.*` 로 네임스페이스 분리됨 → 프로덕션 검증자는 이 키를 자동 거절해야 함 (sign-fixture.mjs 에서는 반대로 이 키만 허용하는 ref impl).
- **D8 (provenance 의 파츠 순서 = slot_id 사전순 권장)**: Canonical JSON 이 객체 키를 정렬하지만 **배열은 보존**한다 (세션 08 D5). 따라서 배열 안정성은 작성자 책임. 샘플은 `body, face, hair_front` 사전순.
- **D9 (prompt/asset 원문은 해시만)**: docs/11 §9.2 준수. `prompt_sha256` · `source_asset_sha256` 모두 nullable — 원문 없는 출처(template_preset 등) 는 null. ai_generated 는 prompt_sha256 필수 관행이나 스키마상은 nullable (완화: 레거시 트레이스도 수용).
- **D10 (bundle.json sha 교차확인을 validator 에 내장)**: `scripts/validate-schemas.mjs` 가 `samples/avatars/*.bundle.snapshot.json` 의 bundle.json entry 를 파싱해 license/provenance 의 `bundle_manifest_sha256` 와 대조. 번들-license 일관성이 CI 에서 자동 회귀.

## 5. 변경 요약 (Changes)

- `schema/v1/license.schema.json` — 신규. 15 required fields.
- `schema/v1/provenance.schema.json` — 신규. parts[] + post_processing[] + signature.
- `schema/README.md` — 2행 추가.
- `scripts/sign-fixture.mjs` — 신규. sign/verify/canonicalJson + CLI.
- `scripts/validate-schemas.mjs` — SCHEMA_ID +2, validators +2, license/provenance 샘플 루프, 번들 sha 교차 + 서명 검증.
- `samples/avatars/sample-01-aria.license.json` — 신규. 서명 포함.
- `samples/avatars/sample-01-aria.provenance.json` — 신규. 서명 포함.
- `progress/sessions/2026-04-18-session-14-license-provenance.md` — 본 파일.
- `progress/INDEX.md` — session 14 row, Data 스트림 v1.0 + license/provenance.

## 6. 블록 (Blockers / Open Questions)

- **공개키 레지스트리 저장소**: 현재 `geny.fixture.rfc8032-test1` 만 인식. 프로덕션용 키 목록은 DB/config 중 어디 둘지 결정 필요 — 예상컨대 `services/license-issuer/` 혹은 orchestrator 의 config 맵. 세션 15+ 에서.
- **키 로테이션 정책**: `signer_key_id` 에 `YYYY-MM` 을 넣은 관행은 **월별 로테이션** 을 상정한다. 그러나 이전 키로 서명된 라이선스는 만료 전까지 유효해야 하므로 레지스트리는 **복수 활성 키** 를 지녀야 한다. 세션 15+ 에서 구현.
- **provenance 의 범위**: 현재 파츠 단위. 디포머 단위 계보(예: AI 가 생성한 physics 세팅) 는 미포함. 현재 halfbody v1.x 는 physics 가 템플릿 고정이므로 불필요. 커뮤니티 템플릿 도입 시 확장 고려.
- **`license.verify` 엔드포인트**: docs/11 §9.3 명시. API 레이어에서 구현. 본 세션의 `verifyDocument` 가 ref impl.

## 7. 다음 세션 제안 (Next)

- **세션 15**: Web Avatar 번들 포맷 1 단계 (`docs/11 §4`) — `@geny/web-avatar` 패키지 스켈레톤 + bundle.json 재사용 + 텍스처 규약. 본 세션의 license/provenance 파일도 web-avatar 번들 함께 배포.
- **세션 16**: 개발자 온보딩 1일 (Foundation Exit #4) — README/quickstart/troubleshooting. license/provenance 인지가 포함.
- **세션 17 후보**: 관측 대시보드 3종 (Foundation Exit #3) — Prometheus/Grafana 뼈대.

## 8. 지표 (Metrics)

- **스키마 수**: 13 → 15 (+license, +provenance).
- **샘플 파일 수 (samples/avatars/)**: 3 → 5 (+license, +provenance).
- **validate-schemas checked**: 이전 ≈125 → 130 (+license +provenance +교차검증).
- **test:golden 단계 수**: 4 유지.
- **exporter-core**: 변경 없음 (v0.5.0 유지).
- **CI**: 이 세션의 직전에 Node 22.11 로 pin bump (commit `f331022`) → green 복귀.

## 9. 인용 (Doc Anchors)

- [docs/11 §9 라이선스 & 증명서](../../docs/11-export-and-deployment.md#9-라이선스--증명서-license--provenance)
- [RFC 8032 §7.1 Test 1 (Ed25519 test vector)](https://www.rfc-editor.org/rfc/rfc8032#section-7.1)
- [progress session 13 bundle manifest](./2026-04-18-session-13-bundle-manifest.md)
- [progress session 08 canonical JSON (D5)](./2026-04-18-session-08-exporter-core.md)
