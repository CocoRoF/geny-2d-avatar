# @geny/license-verifier

`license.json` / `provenance.json` 문서 검증 라이브러리 + CLI.
docs/11 §9.3 `license.verify` 계약의 reference implementation.

## 기능

- `SignerRegistry` — 발급자 공개키 레지스트리 파서 (JSON → 인덱스).
- `verifyLicense(doc, registry, opts)` — Ed25519 서명 + 키 유효기간 + 문서 유효기간 + 번들 sha 결합 확인.
- `verifyProvenance(doc, registry, opts)` — provenance 문서용.
- `verifySignedDocument(doc, registry, opts)` — 두 함수의 공통 저수준 검증.
- CLI `license-verifier verify --kind ... --file ... --registry ... [--bundle ...] [--trust ...]`.

## 검증 항목

| 축 | 검사 |
|---|---|
| 서명 | `signature == "ed25519:<base64url>"` + 페이로드(canonical JSON - signature 필드)가 공개키로 verify. |
| 키 존재 | `signer_key_id` 가 레지스트리에 있는가. |
| 키 상태 | `revoked` 절대 거절. `retired` 는 기존 서명만 허용 (active 도 mutually 동일). |
| 키 유효기간 | `not_before ≤ now`. `not_after` 있으면 `now ≤ not_after`. |
| Trust scope | `production` 모드에서는 `trust_scope == "fixture"` 키 거절. 테스트에서 `trust: "fixture"` 로 명시 옵트인. |
| 문서 유효기간 | license 는 `issued_at ≤ now ≤ (expires_at || ∞)`. provenance 는 시점 제약 없음. |
| 번들 결합 | 옵션 `expectedBundleManifestSha256` 제공 시 `doc.bundle_manifest_sha256` 과 일치해야 함. |

## 사용

```ts
import { SignerRegistry, verifyLicense } from "@geny/license-verifier";

const registry = SignerRegistry.loadFromFile("infra/registry/signer-keys.json");
const license = JSON.parse(fs.readFileSync("sample-01-aria.license.json", "utf8"));
const result = verifyLicense(license, registry, {
  trust: "fixture",
  expectedBundleManifestSha256: bundleSha,
});
console.log("ok:", result.key.key_id);
```

## CLI

```sh
node packages/license-verifier/bin/license-verifier.mjs verify \
  --kind license \
  --file samples/avatars/sample-01-aria.license.json \
  --registry infra/registry/signer-keys.json \
  --trust fixture
# → ok key=geny.fixture.rfc8032-test1 trust=fixture
```

## 테스트

```sh
pnpm -F @geny/license-verifier test
```

15 tests — registry 파서 + happy path + 모든 failure 코드 + sign-then-verify round trip + bundle sha cross-check.

## 서명 페이로드 규칙 (세션 14 D3 동일)

1. 입력 문서에서 `signature` 필드를 제거한 객체를 준비.
2. `canonicalJson()` — 2-space indent, LF, trailing newline, 객체 키 ASCII byte 사전 정렬 (세션 08 D5).
3. Ed25519 로 서명 후 `ed25519:<base64url-no-padding>`.

`scripts/sign-fixture.mjs` 의 알고리즘과 동일. `tests/verify.test.ts` 가 round-trip 으로 두 구현이 같은 결과를 내는지 회귀.
