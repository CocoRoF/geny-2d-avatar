/**
 * RX.1 — extractDrawables / uvBbox / setDrawableVisible 회귀.
 *
 * Cubism Core 는 브라우저 환경 전용이라 mock coreModel 로 데이터-레이어만 검증.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  extractDrawables,
  setDrawableMultiplyRgb,
  setDrawableVisible,
  uvBbox,
  type DrawableMeta,
} from "../src/index.js";
import type { Live2DModelLike } from "../src/pixi-live2d-renderer.js";

interface MockDrawable {
  readonly id: string;
  readonly uvs: number[];
  readonly partIndex?: number;
  readonly textureIndex?: number;
  readonly renderOrder?: number;
  readonly blendMode?: number;
  readonly opacity?: number;
}

interface MockOpts {
  readonly drawables: MockDrawable[];
  readonly partIds?: string[];
  readonly textureFlipY?: boolean;
}

interface MockState {
  readonly multiplyOverride: Set<number>;
  readonly multiplyColors: Map<number, [number, number, number, number]>;
}

function makeMockModel(opts: MockOpts): { model: Live2DModelLike; state: MockState } {
  const state: MockState = {
    multiplyOverride: new Set<number>(),
    multiplyColors: new Map(),
  };
  const cm = {
    setParameterValueById() {},
    getDrawableCount: () => opts.drawables.length,
    getDrawableId: (i: number) => opts.drawables[i]!.id,
    getDrawableVertexUvs: (i: number) => new Float32Array(opts.drawables[i]!.uvs),
    getDrawableTextureIndex: (i: number) => opts.drawables[i]?.textureIndex ?? 0,
    getDrawableParentPartIndex: (i: number) => opts.drawables[i]?.partIndex ?? -1,
    getDrawableRenderOrder: (i: number) => opts.drawables[i]?.renderOrder ?? 0,
    getDrawableBlendMode: (i: number) => opts.drawables[i]?.blendMode ?? 0,
    getDrawableOpacity: (i: number) => opts.drawables[i]?.opacity ?? 1,
    getPartCount: () => opts.partIds?.length ?? 0,
    getPartId: (i: number) => opts.partIds?.[i] ?? "",
    setOverrideFlagForDrawableMultiplyColors: (i: number, v: boolean) => {
      if (v) state.multiplyOverride.add(i);
      else state.multiplyOverride.delete(i);
    },
    setMultiplyColorByRGBA: (i: number, r: number, g: number, b: number, a: number) => {
      state.multiplyColors.set(i, [r, g, b, a]);
    },
  };
  const model: Live2DModelLike = {
    internalModel: {
      coreModel: cm,
      textureFlipY: opts.textureFlipY ?? false,
    },
    motion: () => Promise.resolve(true),
    expression: () => Promise.resolve(true),
  };
  return { model, state };
}

// ----- uvBbox -----

test("uvBbox: basic top-left UV → atlas pixel space", () => {
  // UV (0.25,0.25) ~ (0.5,0.5) on 1024 atlas → (256,256) ~ (512,512).
  const b = uvBbox(new Float32Array([0.25, 0.25, 0.5, 0.5]), { w: 1024, h: 1024 });
  assert.equal(b.x, 256);
  assert.equal(b.y, 256);
  assert.equal(b.w, 256);
  assert.equal(b.h, 256);
  assert.equal(b.uMin, 0.25);
  assert.equal(b.vMax, 0.5);
});

test("uvBbox: triangle 3 vertex 의 axis-aligned bbox", () => {
  // 0.25/0.5 등 binary-exact UV 사용 → FP 오차 없음.
  // 삼각형 (0.25, 0.25), (0.5, 0.25), (0.25, 0.5) → bbox u=[0.25,0.5] v=[0.25,0.5].
  const b = uvBbox(
    new Float32Array([0.25, 0.25, 0.5, 0.25, 0.25, 0.5]),
    { w: 100, h: 100 },
  );
  assert.equal(b.x, 25);
  assert.equal(b.y, 25);
  assert.equal(b.w, 25);
  assert.equal(b.h, 25);
});

test("uvBbox: textureFlipY=true → V 가 (1-V) 로 변환", () => {
  // flipY: v=0.25 → 0.75, v=0.5 → 0.5 → vMin=0.5 vMax=0.75.
  const b = uvBbox(
    new Float32Array([0, 0.25, 1, 0.5]),
    { w: 100, h: 100 },
    true,
  );
  assert.equal(b.y, 50);
  assert.equal(b.h, 25);
});

test("uvBbox: 빈 UV → all zero (degenerate)", () => {
  const b = uvBbox(new Float32Array([]), { w: 100, h: 100 });
  assert.equal(b.x, 0); assert.equal(b.y, 0); assert.equal(b.w, 0); assert.equal(b.h, 0);
});

test("uvBbox: atlas 경계 밖으로 벗어나도 클램프", () => {
  const b = uvBbox(
    new Float32Array([-0.1, -0.1, 1.2, 1.2]),
    { w: 100, h: 100 },
  );
  // floor(-0.1*100)= -10 → max(0, -10) = 0. ceil(1.2*100)=120 → min(100, 120)=100.
  assert.equal(b.x, 0); assert.equal(b.y, 0);
  assert.equal(b.w, 100); assert.equal(b.h, 100);
});

// ----- extractDrawables -----

test("extractDrawables: 3 drawable 모델 → 3 개 메타", () => {
  const { model } = makeMockModel({
    drawables: [
      { id: "head_face", uvs: [0, 0, 0.5, 0, 0.5, 0.5, 0, 0.5], partIndex: 0, renderOrder: 10 },
      { id: "body_torso", uvs: [0.5, 0, 1, 0, 1, 0.5, 0.5, 0.5], partIndex: 1, renderOrder: 5 },
      { id: "hair_back", uvs: [0, 0.5, 0.5, 0.5, 0.5, 1, 0, 1], partIndex: 0, blendMode: 1 },
    ],
    partIds: ["head", "body"],
  });
  const meta = extractDrawables(model, { atlasSize: { w: 1024, h: 1024 } });
  assert.equal(meta.length, 3);
  assert.equal(meta[0]!.id, "head_face");
  assert.equal(meta[0]!.partId, "head");
  assert.equal(meta[1]!.partId, "body");
  assert.equal(meta[0]!.uvBbox.w, 512);
  assert.equal(meta[2]!.blendMode, "additive");
});

test("extractDrawables: degenerate UV (size 0) 는 건너뜀 (default)", () => {
  const { model } = makeMockModel({
    drawables: [
      { id: "ok", uvs: [0, 0, 1, 1] },
      { id: "empty", uvs: [] },
    ],
  });
  const meta = extractDrawables(model, { atlasSize: { w: 100, h: 100 } });
  assert.equal(meta.length, 1);
  assert.equal(meta[0]!.id, "ok");
});

test("extractDrawables: skipDegenerate=false 면 빈 UV 도 포함", () => {
  const { model } = makeMockModel({
    drawables: [
      { id: "ok", uvs: [0, 0, 1, 1] },
      { id: "empty", uvs: [] },
    ],
  });
  const meta = extractDrawables(model, {
    atlasSize: { w: 100, h: 100 },
    skipDegenerate: false,
  });
  assert.equal(meta.length, 2);
  assert.equal(meta[1]!.id, "empty");
  assert.equal(meta[1]!.uvBbox.w, 0);
});

test("extractDrawables: coreModel 에 getDrawableCount 없으면 빈 배열", () => {
  const model: Live2DModelLike = {
    internalModel: {
      coreModel: { setParameterValueById() {} },
    },
    motion: () => Promise.resolve(true),
    expression: () => Promise.resolve(true),
  };
  const meta = extractDrawables(model, { atlasSize: { w: 100, h: 100 } });
  assert.deepEqual(meta, []);
});

test("extractDrawables: blend mode code 매핑", () => {
  const { model } = makeMockModel({
    drawables: [
      { id: "n", uvs: [0, 0, 1, 1], blendMode: 0 },
      { id: "a", uvs: [0, 0, 1, 1], blendMode: 1 },
      { id: "m", uvs: [0, 0, 1, 1], blendMode: 2 },
      { id: "?", uvs: [0, 0, 1, 1], blendMode: 99 },
    ],
  });
  const meta: DrawableMeta[] = extractDrawables(model, { atlasSize: { w: 1, h: 1 } });
  assert.equal(meta[0]!.blendMode, "normal");
  assert.equal(meta[1]!.blendMode, "additive");
  assert.equal(meta[2]!.blendMode, "multiplicative");
  assert.equal(meta[3]!.blendMode, "unknown");
});

// ----- setDrawableVisible / setDrawableMultiplyRgb -----

test("setDrawableVisible(true) → multiplyColor [1,1,1,1] + override true", () => {
  const { model, state } = makeMockModel({
    drawables: [{ id: "a", uvs: [0, 0, 1, 1] }],
  });
  setDrawableVisible(model, 0, true);
  assert.ok(state.multiplyOverride.has(0));
  assert.deepEqual(state.multiplyColors.get(0), [1, 1, 1, 1]);
});

test("setDrawableVisible(false) → multiplyColor alpha=0 (숨김)", () => {
  const { model, state } = makeMockModel({
    drawables: [{ id: "a", uvs: [0, 0, 1, 1] }],
  });
  setDrawableVisible(model, 0, false);
  assert.deepEqual(state.multiplyColors.get(0), [1, 1, 1, 0]);
});

test("setDrawableMultiplyRgb 는 alpha=1 유지 (visibility 와 분리)", () => {
  const { model, state } = makeMockModel({
    drawables: [{ id: "a", uvs: [0, 0, 1, 1] }],
  });
  setDrawableMultiplyRgb(model, 0, { r: 0.5, g: 0.7, b: 1.2 });
  const c = state.multiplyColors.get(0)!;
  assert.equal(c[0], 0.5);
  assert.equal(c[1], 0.7);
  assert.equal(c[2], 1.2);
  assert.equal(c[3], 1);
});

test("setDrawableVisible 호출이 없는 환경 (옵셔널 함수 미정의) 은 silent no-op", () => {
  const model: Live2DModelLike = {
    internalModel: {
      coreModel: { setParameterValueById() {} },
    },
    motion: () => Promise.resolve(true),
    expression: () => Promise.resolve(true),
  };
  // throw 하지 않아야 함.
  setDrawableVisible(model, 0, false);
  setDrawableMultiplyRgb(model, 0, { r: 0, g: 0, b: 0 });
  assert.ok(true);
});
