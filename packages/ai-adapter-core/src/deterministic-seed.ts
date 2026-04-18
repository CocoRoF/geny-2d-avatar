import { createHash } from "node:crypto";

/**
 * docs/05 §7.1 — task.seed 가 null 이면 idempotency_key 로 시드를 도출한다.
 * 같은 idempotency_key → 항상 같은 시드. sha256 의 앞 4바이트를 Uint32 로.
 * 캐시 miss 를 피하기 위해 프롬프트/레퍼런스 해시는 키에 섞지 않는다.
 * (캐시 키 합성은 상위 orchestrator 의 책임 — docs/05 §10.1)
 */
export function deterministicSeed(idempotencyKey: string): number {
  const digest = createHash("sha256").update(idempotencyKey).digest();
  return digest.readUInt32BE(0);
}

/**
 * PromptBuilder 가 벤더에 넘긴 최종 프롬프트의 sha256.
 * provenance `parts[].prompt_sha256` 와 동일 값이어야 한다.
 */
export function promptSha256(prompt: string): string {
  return createHash("sha256").update(prompt, "utf8").digest("hex");
}
