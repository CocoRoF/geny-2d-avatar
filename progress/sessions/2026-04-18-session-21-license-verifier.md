# Session 21 — 발급자 공개키 레지스트리 + `@geny/license-verifier`

- **날짜**: 2026-04-18
- **스트림**: Data + Platform/Infra
- **관련 docs**: `docs/11 §9.1`, `docs/11 §9.2`, `docs/11 §9.3` (license.verify 계약)
- **관련 ADR**: 신규 없음 (ADR 0002 스키마-우선 계약, 세션 14 D3/D4 서명 규칙 적용)
- **전제**: 세션 14 (license/provenance 스키마 + `sign-fixture.mjs`) 완료. 세션 20 (test:golden 6 step) 완료.

## 0. 목표

세션 14 에 명시된 blocker "**발급자 공개키 레지스트리 저장소 + `license.verify` 엔드포인트**" 해소.

- 레지스트리 계약(JSON Schema) 고정.
- 레지스트리 데이터 1 종 (fixture 키 1 건).
- `verifyLicense` / `verifyProvenance` **reference implementation** (Node, deps=0) + CLI.
- CI 회귀: registry 존재/ID 패턴/key_id cross-ref 를 `validate-schemas` 에, 검증기 단위 회귀를 `test:golden` step 7 에.

비목표 (의도적으로 제외):
- HTTP 엔드포인트. `verifyLicense` 는 순수 함수 ref impl 이며 API 서비스에서 이 모듈을 호출하면 됨. 서비스 프레임(`services/api/`) 은 별도 세션.
- 프로덕션 플랫폼 키. fixture 만 (프로덕션 키 추가 = 별도 커밋 + 별도 ADR).
- 키 로테이션 자동화. 레지스트리는 수작업 편집 + `registry_version` bump.

## 1. 설계 결정 (D1–D7)

### D1 — 레지스트리는 **단일 JSON 파일**, 배열 1 개 + key_id 유일

**선택**: `infra/registry/signer-keys.json` 하나에 모든 발급자 키.
**고려**: (a) 디렉터리 + per-key 파일, (b) 외부 KMS/Vault, (c) 단일 파일.
**이유**:
- Foundation 규모(키 N<50) 에서 단일 파일이 가장 단순 + diff 친화적.
- 단일 파일은 **atomic commit** 으로 변경 추적. KMS 는 외부 상태로 분기 → 세션 21 범위 밖.
- Schema 에 `uniqueItems: true` + 파서에서 중복 id 재검출.

### D2 — `status = active | retired | revoked` 3 상태

- `active`: 신규 서명 + 검증 모두 허용.
- `retired`: 신규 서명 금지 (정책), **기존 서명은 not_after 까지 검증 허용**. 키 로테이션 시 주요 상태.
- `revoked`: 전부 거절. 키 compromise 시.

Verify 는 `revoked` 를 즉시 throw, `retired`/`active` 는 유효기간만 확인. 정책("retired 키로 새로 서명은 금지") 은 **signer 측** 에서 강제 (verify 는 algorithm 검사만).

### D3 — `trust_scope = production | fixture`

`production` 검증 기본값에서 `trust_scope === "fixture"` 키를 거절. RFC 8032 Test 1 처럼 공개된 개인키로 서명된 샘플이 프로덕션 경로에 흘러드는 것을 구조적으로 차단.
테스트/샘플은 `trust: "fixture"` 를 명시 opt-in. 두 가지 trust 모드의 경계가 코드 한 줄(`opts.trust ?? "production"`).

### D4 — 서명 알고리즘은 `"ed25519"` **고정**

스키마 `enum: ["ed25519"]`. 향후 ed448/rsa-pss-sha256 확장은 **ADR 이후 enum 추가**.
이유: 멀티 알고리즘은 verifier 복잡도와 알고리즘 downgrade attack surface 를 키움. Foundation 은 하나만.

### D5 — `@geny/license-verifier` 는 `@geny/web-avatar` 와 동일 빌드 레이아웃

- `src/` TypeScript → `dist/` ESM (`tsc -p tsconfig.build.json`).
- 테스트는 `tsc -p tsconfig.test.json` → `dist-test/` 에서 `node --test`.
- deps=0 (Node 22 내장 crypto 만 사용). devDeps=TypeScript/@types/node.
- 모듈 경계: `canonical-json` · `registry` · `verify` · `types` · `errors` 5 개.
- **이유**: 기존 패키지 규칙 재사용 → 온보딩 비용 0. pnpm filter 로 독립 build/test.

### D6 — canonicalJson 은 `scripts/sign-fixture.mjs` 와 **동일 알고리즘, 독립 구현**

세션 14 의 sign-fixture 가 이미 canonicalJson 을 갖고 있으나, 라이브러리로 import 하면 scripts/ → packages/ 방향 역의존. 대신 두 구현을 따로 유지하고 **round-trip 테스트** 로 회귀 회로 구성:

- `tests/verify.test.ts` 의 `sign-then-verify round trip` 테스트가 license-verifier 의 canonicalJson 으로 서명한 문서를 license-verifier 의 verify 로 통과시킴.
- 저장소의 기존 `sample-01-aria.license.json` (sign-fixture 로 서명됨) 도 license-verifier 로 통과.
- 따라서 두 구현 중 하나라도 어긋나면 CI (step 7) 가 실패.

이 이중 구현 접근의 **비용** 은 코드 34 줄 중복. **장점** 은 (a) script 의존 없는 순수 라이브러리, (b) 양방향 cross-verify 가 회귀 그물망.

### D7 — CLI 는 `@geny/license-verifier`, 서브커맨드 `verify`

- 단일 서브커맨드만 제공 (sign 은 의도적으로 없음 — 서명은 서비스 책임).
- `--kind license|provenance` / `--file <doc>` / `--registry <path>` / `--bundle <path>` (옵션) / `--trust production|fixture` (기본 production) / `--now <RFC3339>` (테스트용).
- 성공 stdout: `ok key=<key_id> trust=<scope>`. 실패 stderr: `✖ <CODE>: <message>`.
- exit 0/1/2 (ok / verify fail / usage).

## 2. 변경 파일

### 신규

```
schema/v1/signer-registry.schema.json
infra/registry/signer-keys.json
packages/license-verifier/package.json
packages/license-verifier/tsconfig.json
packages/license-verifier/tsconfig.build.json
packages/license-verifier/tsconfig.test.json
packages/license-verifier/README.md
packages/license-verifier/src/canonical-json.ts
packages/license-verifier/src/errors.ts
packages/license-verifier/src/index.ts
packages/license-verifier/src/registry.ts
packages/license-verifier/src/types.ts
packages/license-verifier/src/verify.ts
packages/license-verifier/bin/license-verifier.mjs
packages/license-verifier/tests/verify.test.ts
progress/sessions/2026-04-18-session-21-license-verifier.md (이 문서)
```

### 수정

```
schema/README.md           # signer-registry 행 추가
scripts/validate-schemas.mjs # signerRegistry 스키마 로드 + infra/registry 파일 검증 + samples 의 signer_key_id cross-check
scripts/test-golden.mjs    # STEPS 에 "license-verifier tests" 추가 (step 7)
progress/INDEX.md          # session 21 row, Platform·Data 스트림, §6 게이트, §8 다음 3세션
pnpm-lock.yaml             # workspace 에 @geny/license-verifier 등록
```

## 3. 테스트 스위트 설계 (18 tests)

| 그룹 | 테스트 | 검증 내용 |
|---|---|---|
| 레지스트리 파서 (3) | loadFromFile resolves fixture key | 샘플 레지스트리에서 fixture 키 lookup |
| | rejects duplicate key_id | 중복 key_id → INVALID_REGISTRY |
| | rejects invalid hex public_key | 64-hex 아닌 public_key → INVALID_REGISTRY |
| Happy path (3) | verifyLicense passes … fixture trust | aria license 샘플 fixture trust 통과 |
| | verifyProvenance passes … fixture trust | aria provenance 샘플 통과 |
| | verifyLicense passes with expectedBundleSha | bundle sha cross-check 통과 |
| Failure (9) | production trust rejects fixture key | `trust: "production"` + fixture 키 → FIXTURE_KEY_REJECTED |
| | unknown signer_key_id | 레지스트리에 없는 키 → UNKNOWN_KEY |
| | revoked key rejected | status=revoked → KEY_REVOKED |
| | expired key rejected | not_after < now → KEY_EXPIRED |
| | key not yet valid rejected | not_before > now → KEY_NOT_YET_VALID |
| | tampered payload | license_type 수정 후 → SIGNATURE_MISMATCH |
| | malformed signature format | prefix 가 ed25519 이 아닌 경우 → BAD_SIGNATURE_FORMAT |
| | bundle sha mismatch | opts.expectedBundleSha 불일치 → BUNDLE_SHA_MISMATCH |
| | document expired | expires_at < now → DOCUMENT_EXPIRED |
| | document issued in the future | issued_at > now → DOCUMENT_NOT_YET_VALID |
| Round trip (2) | sign-then-verify round trip | 재서명 + verify 통과 — sign-fixture 알고리즘과 동일 |
| | canonical json key-order invariant | 키 순서와 무관하게 동일 직렬화 |

모든 테스트는 `now` 를 명시적으로 주입 — CI 환경 wall-clock 시간과 무관하게 결정적.

## 4. 검증 로그

### 4.1 `pnpm -F @geny/license-verifier test`
```
ℹ tests 18  pass 18  fail 0
```

### 4.2 `pnpm run validate:schemas`
```
[validate] checked=134 failed=0
[validate] ✅ all schemas + rig templates valid
```
(checked 133 → 134: signer-registry 검증 +1)

### 4.3 `pnpm run test:golden` (7 step)
```
[golden] ▶ validate-schemas       ✔
[golden] ▶ exporter-core tests    ✔
[golden] ▶ bundle golden diff     ✔
[golden] ▶ avatar bundle golden diff  ✔
[golden] ▶ web-avatar bundle golden diff  ✔
[golden] ▶ web-preview e2e        ✔
[golden] ▶ license-verifier tests ✔ (1001 ms)
[golden] ✅ all steps pass
```

### 4.4 CLI 스모크
```
$ node packages/license-verifier/bin/license-verifier.mjs verify \
    --kind license \
    --file samples/avatars/sample-01-aria.license.json \
    --registry infra/registry/signer-keys.json \
    --trust fixture --now 2026-04-18T12:00:00Z
ok key=geny.fixture.rfc8032-test1 trust=fixture

$ # 같은 명령을 --trust 생략(=production)으로 호출:
✖ FIXTURE_KEY_REJECTED: fixture key 'geny.fixture.rfc8032-test1' rejected in production trust mode
```

## 5. Foundation Exit 상태 변화

- **Exit #1/#2/#3/#4**: 수치 변동 없음 (본 세션은 Exit 게이트 외 Data/Platform 스트림 진척).
- **세션 14 blocker** (공개키 레지스트리 + license.verify 엔드포인트): **✅ 해소 (ref impl 레벨)**. 실 HTTP 엔드포인트는 `services/api/` 도입 시 본 라이브러리를 import 하면 됨.

## 6. 알려진 한계 / 후속

- **프로덕션 키 없음**: 샘플 레지스트리는 fixture 1 건만. 실 플랫폼 키 추가 시 `issuer` / `not_after` / `note` 를 충실히 기록 + `registry_version` bump.
- **키 로테이션 자동화 없음**: `retired` 상태 전환은 운영자 수작업. 자동화는 Issuer 서비스 도입 시.
- **알고리즘 다양성 없음**: ed25519 only. ed448/RSA 추가 필요시 ADR + enum 확장.
- **회전 주기 정책**: 현 스키마는 `YYYY-MM` suffix 권장만 명시. 실제 월별 회전은 운영 플레이북에 수록 예정.
- **sign-fixture.mjs 와 license-verifier 의 이중 구현**: D6 에서 선택한 의도적 중복. 회귀 그물망 덕에 안전하나, 리팩터링 후보 (예: `canonicalJson` 을 shared `@geny/canonical-json` 마이크로 패키지로 분리).

## 7. 지표 (Metrics)

- **스키마 수**: 17 → 18 (+signer-registry).
- **패키지 수**: 2 → 3 (+@geny/license-verifier).
- **test:golden 단계**: 6 → 7.
- **validate-schemas checked**: 133 → 134.
- **license-verifier 테스트**: 18.
- **CLI**: `license-verifier verify` — 단일 서브커맨드.

## 8. 다음 3세션

- **세션 22**: AI 생성 어댑터 (nano-banana) skeleton — provenance 의 `ai_generated` 경로를 어댑터 계약까지 고정. 혹은 Observability Helm chart 실배포 (Exit #3 완결).
- **세션 23**: happy-dom 기반 `<geny-avatar>` DOM lifecycle 스냅샷 — Exit #1 의 D-시각 자동화.
- **세션 24**: rig v1.3 body 파츠 확장 혹은 Post-Processing Stage 1 (alpha cleanup) skeleton.
