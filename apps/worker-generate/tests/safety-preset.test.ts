/**
 * `parseSafetyPreset` + `createSafetyFilterFromPreset` 단위 테스트 (세션 88).
 *
 * 본 프리셋은 CI 회귀용 주입점 — 실 안전성 판정은 Runtime 외부 서비스 몫. 따라서 핵심은
 *  (a) 파서가 엄격해서 오타가 silent noop 으로 흘러내리지 않음
 *  (b) block-vendors 필터가 벤더 이름 기반으로 결정론적으로 UNSAFE 판정
 * 두 가지.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import type { GenerationResult, GenerationTask } from "@geny/ai-adapter-core";

import {
  createSafetyFilterFromPreset,
  parseSafetyPreset,
} from "../src/safety-preset.js";

function mkResult(vendor: string): GenerationResult {
  return {
    schema_version: "v1",
    task_id: "tsk.test.01",
    slot_id: "slot.test",
    image_sha256: "0".repeat(64),
    vendor,
    model_version: "test",
    seed: 1,
    prompt_sha256: "f".repeat(64),
    cost_usd: 0,
    latency_ms: 0,
    completed_at: "2026-04-20T00:00:00Z",
  };
}

function mkTask(): GenerationTask {
  return {
    schema_version: "v1",
    task_id: "tsk.test.01",
    avatar_id: "avt.test",
    slot_id: "slot.test",
    role: "test",
    stage: "generate",
    size: { width: 512, height: 512 },
    seed: 1,
    prompt: { positive: "" },
  } as unknown as GenerationTask;
}

test("parseSafetyPreset: noop", () => {
  assert.deepEqual(parseSafetyPreset("noop"), { kind: "noop" });
});

test("parseSafetyPreset: block-vendors 단일", () => {
  const spec = parseSafetyPreset("block-vendors:nano-banana");
  assert.equal(spec.kind, "block-vendors");
  assert.deepEqual(spec.blockedVendors, ["nano-banana"]);
});

test("parseSafetyPreset: block-vendors 다중 + 공백 허용", () => {
  const spec = parseSafetyPreset("block-vendors: nano-banana , sdxl ");
  assert.deepEqual(spec.blockedVendors, ["nano-banana", "sdxl"]);
});

test("parseSafetyPreset: 알 수 없는 preset → throw", () => {
  assert.throws(() => parseSafetyPreset("allow-all"), /알 수 없는/);
  assert.throws(() => parseSafetyPreset("block-tasks:1"), /알 수 없는 safety preset kind/);
});

test("parseSafetyPreset: 빈 값 → throw", () => {
  assert.throws(() => parseSafetyPreset(""), /비어있음/);
});

test("parseSafetyPreset: block-vendors 빈 목록 → throw", () => {
  assert.throws(() => parseSafetyPreset("block-vendors:"), /최소 1 벤더/);
  assert.throws(() => parseSafetyPreset("block-vendors: , "), /최소 1 벤더/);
});

test("parseSafetyPreset: 중복 벤더 → throw", () => {
  assert.throws(
    () => parseSafetyPreset("block-vendors:nano-banana,nano-banana"),
    /중복된 벤더/,
  );
});

test("createSafetyFilterFromPreset: noop 은 모든 결과 통과", async () => {
  const filter = createSafetyFilterFromPreset({ kind: "noop" });
  const v1 = await filter.check(mkResult("nano-banana"), mkTask());
  const v2 = await filter.check(mkResult("sdxl"), mkTask());
  assert.equal(v1.allowed, true);
  assert.equal(v2.allowed, true);
});

test("createSafetyFilterFromPreset: block-vendors 매칭만 차단", async () => {
  const filter = createSafetyFilterFromPreset({
    kind: "block-vendors",
    blockedVendors: ["nano-banana"],
  });
  const vNano = await filter.check(mkResult("nano-banana"), mkTask());
  const vSdxl = await filter.check(mkResult("sdxl"), mkTask());
  const vFlux = await filter.check(mkResult("flux-fill"), mkTask());
  assert.equal(vNano.allowed, false);
  assert.ok(vNano.reason?.includes("nano-banana"));
  assert.deepEqual(vNano.categories, ["test-preset"]);
  assert.equal(vSdxl.allowed, true);
  assert.equal(vFlux.allowed, true);
});

test("createSafetyFilterFromPreset: block-vendors 다중 매칭", async () => {
  const filter = createSafetyFilterFromPreset({
    kind: "block-vendors",
    blockedVendors: ["nano-banana", "sdxl"],
  });
  const vNano = await filter.check(mkResult("nano-banana"), mkTask());
  const vSdxl = await filter.check(mkResult("sdxl"), mkTask());
  const vFlux = await filter.check(mkResult("flux-fill"), mkTask());
  assert.equal(vNano.allowed, false);
  assert.equal(vSdxl.allowed, false);
  assert.equal(vFlux.allowed, true);
});
