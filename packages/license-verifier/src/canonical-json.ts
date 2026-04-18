/**
 * Canonical JSON — 세션 08 D5 규칙.
 *
 *   · 2 space indent
 *   · LF 개행
 *   · trailing newline
 *   · 객체 키 ASCII byte 사전 정렬 (배열 순서는 보존)
 *
 * 서명 페이로드는 `signature` 필드를 제거한 뒤 이 함수로 직렬화한 바이트.
 * `scripts/sign-fixture.mjs` 의 구현과 동일한 규칙이며 cross-verify 테스트가
 * `@geny/license-verifier` 의 검증 결과와 sign-fixture 서명이 일치함을 보장한다.
 */

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer, 2) + "\n";
}

export function canonicalJsonBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalJson(value));
}

function replacer(_key: string, val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val;
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort();
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) out[k] = obj[k];
  return out;
}

export function stripSignature<T extends { signature?: unknown }>(doc: T): Omit<T, "signature"> {
  const clone = { ...doc } as T;
  delete (clone as { signature?: unknown }).signature;
  return clone;
}
