#!/usr/bin/env node
/**
 * scripts/sign-fixture.mjs
 *
 * 라이선스 / provenance 샘플에 **테스트 전용** Ed25519 서명을 채워넣는 헬퍼.
 *
 * 사용법:
 *   node scripts/sign-fixture.mjs <path-to-license-or-provenance.json>
 *
 * 키: RFC 8032 §7.1 Test 1 (`9d61b19d...`). 이 값은 IETF 표준 문서에 공개된
 * **알려진 테스트 벡터**이며, 프로덕션 키와 절대 혼용하면 안 된다.
 * `signer_key_id: "geny.fixture.rfc8032-test1"` 인 문서에만 사용한다.
 *
 * 서명 절차 (세션 14 D3):
 *   1) 입력 문서의 `signature` 필드를 빈 문자열로 바꾸거나 제거한 페이로드를 구성.
 *      우리는 "해당 필드를 canonical JSON 에서 제거" 규칙을 채택.
 *   2) canonicalJson() 으로 직렬화 (2-space indent, LF, trailing newline — 세션 08 D5).
 *   3) Ed25519 로 서명 후 base64url(패딩 없음).
 *   4) `signature: "ed25519:<b64url>"` 을 채워 다시 canonicalJson 으로 저장.
 *
 * 검증은 `verify-fixture.mjs` 또는 동일 루틴을 역순으로.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { argv, exit, stderr } from "node:process";

// ─── RFC 8032 §7.1 Test 1 (공개 테스트 벡터) ───
const RFC8032_TEST1_SEED_HEX =
  "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
const RFC8032_TEST1_PUBKEY_HEX =
  "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
const FIXTURE_KEY_ID = "geny.fixture.rfc8032-test1";

// Ed25519 PKCS#8 PrivateKeyInfo prefix (16 bytes) — RFC 8410.
// SEQUENCE (46 bytes) { version=0, AlgorithmIdentifier { id-Ed25519 },
//                       privateKey OCTET STRING (36 bytes) {
//                         OCTET STRING (32 bytes) <seed> } }
const PKCS8_ED25519_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
// Ed25519 SubjectPublicKeyInfo prefix (12 bytes) — RFC 8410.
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function fixturePrivateKey() {
  const seed = Buffer.from(RFC8032_TEST1_SEED_HEX, "hex");
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  return createPrivateKey({ key: der, format: "der", type: "pkcs8" });
}

function fixturePublicKey() {
  const pub = Buffer.from(RFC8032_TEST1_PUBKEY_HEX, "hex");
  const der = Buffer.concat([SPKI_ED25519_PREFIX, pub]);
  return createPublicKey({ key: der, format: "der", type: "spki" });
}

// 세션 08 D5: 2-space indent, LF, trailing newline, 키 ASCII byte sort.
export function canonicalJson(value) {
  return JSON.stringify(value, replacer, 2) + "\n";
}

function replacer(_key, val) {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val;
  const sortedKeys = Object.keys(val).sort();
  const out = {};
  for (const k of sortedKeys) out[k] = val[k];
  return out;
}

function stripSignature(doc) {
  const { signature: _omit, ...rest } = doc;
  return rest;
}

export function signDocument(doc) {
  if (doc.signer_key_id !== FIXTURE_KEY_ID) {
    throw new Error(
      `refusing to sign: signer_key_id must be '${FIXTURE_KEY_ID}' (got '${doc.signer_key_id}')`,
    );
  }
  const payload = Buffer.from(canonicalJson(stripSignature(doc)), "utf8");
  const sigBytes = sign(null, payload, fixturePrivateKey());
  return "ed25519:" + sigBytes.toString("base64url");
}

export function verifyDocument(doc) {
  if (doc.signer_key_id !== FIXTURE_KEY_ID) {
    throw new Error(
      `verify: unknown signer_key_id '${doc.signer_key_id}' (fixture only supports '${FIXTURE_KEY_ID}')`,
    );
  }
  if (!doc.signature?.startsWith("ed25519:")) {
    return false;
  }
  const sigB64 = doc.signature.slice("ed25519:".length);
  const sigBytes = Buffer.from(sigB64, "base64url");
  const payload = Buffer.from(canonicalJson(stripSignature(doc)), "utf8");
  return verify(null, payload, fixturePublicKey(), sigBytes);
}

async function main() {
  const [, , path] = argv;
  if (!path) {
    stderr.write("usage: node scripts/sign-fixture.mjs <file.json>\n");
    exit(2);
  }
  const doc = JSON.parse(readFileSync(path, "utf8"));
  const signature = signDocument(doc);
  const signed = { ...doc, signature };
  writeFileSync(path, canonicalJson(signed));
  const ok = verifyDocument(signed);
  stderr.write(
    `signed ${path} with ${FIXTURE_KEY_ID} → verify=${ok ? "ok" : "FAIL"}\n`,
  );
  if (!ok) exit(1);
}

if (import.meta.url === `file://${argv[1]}`) {
  await main();
}
