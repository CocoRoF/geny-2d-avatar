/**
 * `parseArgs` pure unit test (세션 67). `--concurrency N` + env fallback 경로.
 *
 * side-effect 없음 — main()/서버/redis 미관여. Helm (세션 66 D6) 이 env 로 주입한
 * `GENY_WORKER_CONCURRENCY` 가 CLI 미지정 시 실제로 CliArgs.concurrency 로 흘러야 함.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { parseArgs, CONCURRENCY_ENV } from "../src/args.js";

test("parseArgs: 기본값 — concurrency 미지정 시 undefined", () => {
  const args = parseArgs([], { env: {} });
  assert.equal(args.concurrency, undefined);
  assert.equal(args.role, "both");
  assert.equal(args.driver, "in-memory");
});

test("parseArgs: --concurrency N 정상 파싱", () => {
  const args = parseArgs(["--concurrency", "8"], { env: {} });
  assert.equal(args.concurrency, 8);
});

test("parseArgs: --concurrency 범위 초과 → throw", () => {
  assert.throws(() => parseArgs(["--concurrency", "0"], { env: {} }), /1\.\.256/);
  assert.throws(() => parseArgs(["--concurrency", "257"], { env: {} }), /1\.\.256/);
});

test("parseArgs: --concurrency 정수 아님 → throw", () => {
  assert.throws(() => parseArgs(["--concurrency", "abc"], { env: {} }), /정수/);
  assert.throws(() => parseArgs(["--concurrency", "3.5"], { env: {} }), /정수/);
});

test("parseArgs: --concurrency 값 누락 → throw", () => {
  assert.throws(() => parseArgs(["--concurrency"], { env: {} }), /값 누락/);
});

test("parseArgs: env GENY_WORKER_CONCURRENCY fallback — CLI 미지정 (세션 66 D6)", () => {
  const args = parseArgs([], { env: { [CONCURRENCY_ENV]: "16" } });
  assert.equal(args.concurrency, 16);
});

test("parseArgs: env 빈 문자열은 무시 (Helm 미세팅과 동일하게 취급)", () => {
  const args = parseArgs([], { env: { [CONCURRENCY_ENV]: "" } });
  assert.equal(args.concurrency, undefined);
});

test("parseArgs: CLI 가 env 보다 우선", () => {
  const args = parseArgs(["--concurrency", "4"], { env: { [CONCURRENCY_ENV]: "32" } });
  assert.equal(args.concurrency, 4);
});

test("parseArgs: env 값이 불량이면 throw — 조용히 무시하지 않음", () => {
  assert.throws(
    () => parseArgs([], { env: { [CONCURRENCY_ENV]: "banana" } }),
    /env GENY_WORKER_CONCURRENCY/,
  );
  assert.throws(
    () => parseArgs([], { env: { [CONCURRENCY_ENV]: "999" } }),
    /1\.\.256/,
  );
});

test("parseArgs: --role consumer + --driver bullmq 조합 유지 (회귀 방지)", () => {
  const args = parseArgs(
    ["--role", "consumer", "--driver", "bullmq", "--concurrency", "12"],
    { env: {} },
  );
  assert.equal(args.role, "consumer");
  assert.equal(args.driver, "bullmq");
  assert.equal(args.concurrency, 12);
});

test("parseArgs: --role producer 는 in-memory driver 에서 거부 (세션 65 회귀)", () => {
  assert.throws(
    () => parseArgs(["--role", "producer"], { env: {} }),
    /--driver bullmq 에서만/,
  );
});

test("parseArgs: --safety-preset 기본값 undefined (세션 88)", () => {
  const args = parseArgs([], { env: {} });
  assert.equal(args.safetyPreset, undefined);
});

test("parseArgs: --safety-preset 원문 보존 (파싱은 main.ts 가 담당)", () => {
  const args = parseArgs(["--safety-preset", "block-vendors:nano-banana"], { env: {} });
  assert.equal(args.safetyPreset, "block-vendors:nano-banana");
});

test("parseArgs: --safety-preset 값 누락 → throw", () => {
  assert.throws(() => parseArgs(["--safety-preset"], { env: {} }), /값 누락/);
});
