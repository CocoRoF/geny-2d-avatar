/**
 * Deterministic JSON serializer.
 *
 * - 객체 키는 ASCII byte 오름차순 정렬 (locale 무관, 한글·이모지 혼입 안전).
 * - 배열 원소 순서는 **보존** (pose3 Groups 의 mutex 우선순위 등 의미 있음 — 세션 08 D6).
 * - 2-space indent, LF 줄바꿈, 마지막에 개행 1개.
 *
 * 모든 Cubism 산출물이 이 함수를 경유해야 golden byte 비교가 안정적.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, replacer, 2) + "\n";
}

function replacer(this: unknown, _key: string, val: unknown): unknown {
  if (val === null || typeof val !== "object") return val;
  if (Array.isArray(val)) return val;
  const obj = val as Record<string, unknown>;
  const sortedKeys = Object.keys(obj).sort(byteCompare);
  const out: Record<string, unknown> = {};
  for (const k of sortedKeys) out[k] = obj[k];
  return out;
}

function byteCompare(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
