/**
 * `createPixiRenderer` 회귀 — 실 PIXI.Application 은 mock 으로 대체하고
 * 이벤트 구독 / 생명주기 / rotationParameter 반영 동작만 검증. β P1-S1.
 *
 * 실 PIXI 는 WebGL 컨텍스트를 요구하므로 node --test 환경에선 init 불가 —
 * `createApp` DI 를 통해 결정론적 mock 을 주입한다.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createPixiRenderer,
  resolvePivotPlacement,
  type PixiAppHandle,
  type CreatePixiApp,
  type PixiPartTransform,
  type PixiSceneInput,
} from "../src/index.js";
import type {
  RendererAtlas,
  RendererBundleMeta,
  RendererExpression,
  RendererHost,
  RendererMotion,
} from "@geny/web-avatar-renderer";

interface PartTransformCall {
  readonly slot_id: string;
  readonly transform: PixiPartTransform;
}

interface MockApp extends PixiAppHandle {
  readonly rebuildCalls: readonly PixiSceneInput[];
  readonly rotationCalls: readonly number[];
  readonly setMotionCalls: readonly (RendererMotion | null)[];
  readonly setExpressionCalls: readonly (RendererExpression | null)[];
  readonly setPartTransformCalls: readonly PartTransformCall[];
  readonly destroyed: boolean;
}

interface MockFactoryControl {
  readonly createApp: CreatePixiApp;
  readonly apps: readonly MockApp[];
  flushCreate(): Promise<void>;
}

function makeMockFactory(opts: { failFirst?: boolean; defer?: boolean } = {}): MockFactoryControl {
  const apps: MockApp[] = [];
  const pending: Array<() => void> = [];
  let failNext = !!opts.failFirst;

  const createApp: CreatePixiApp = () => {
    return new Promise<PixiAppHandle>((resolve, reject) => {
      const settle = () => {
        if (failNext) {
          failNext = false;
          reject(new Error("mock init failure"));
          return;
        }
        const state = {
          rebuildCalls: [] as PixiSceneInput[],
          rotationCalls: [] as number[],
          setMotionCalls: [] as (RendererMotion | null)[],
          setExpressionCalls: [] as (RendererExpression | null)[],
          setPartTransformCalls: [] as PartTransformCall[],
          destroyed: false,
        };
        const handle: MockApp = {
          rebuildCalls: state.rebuildCalls,
          rotationCalls: state.rotationCalls,
          setMotionCalls: state.setMotionCalls,
          setExpressionCalls: state.setExpressionCalls,
          setPartTransformCalls: state.setPartTransformCalls,
          get destroyed() {
            return state.destroyed;
          },
          rebuild(scene) {
            state.rebuildCalls.push(scene);
            return Promise.resolve();
          },
          setRotation(rad) {
            state.rotationCalls.push(rad);
          },
          setMotion(motion) {
            state.setMotionCalls.push(motion);
          },
          setExpression(expression) {
            state.setExpressionCalls.push(expression);
          },
          setPartTransform(slot_id, transform) {
            state.setPartTransformCalls.push({ slot_id, transform });
          },
          destroy() {
            state.destroyed = true;
          },
        };
        apps.push(handle);
        resolve(handle);
      };
      if (opts.defer) {
        pending.push(settle);
      } else {
        settle();
      }
    });
  };

  return {
    createApp,
    apps,
    async flushCreate() {
      while (pending.length) pending.shift()?.();
      // microtask drain
      await Promise.resolve();
      await Promise.resolve();
    },
  };
}

function sampleMeta(partCount = 3): RendererBundleMeta {
  return {
    parts: Array.from({ length: partCount }, (_, i) => ({
      role: `role_${i}`,
      slot_id: `slot_${i}`,
    })),
    parameters: [
      { id: "head_angle_x", range: [-30, 30], default: 0 },
      { id: "body_breath", range: [0, 1], default: 0 },
    ],
  };
}

function makeHost(initialBundle?: { meta: RendererBundleMeta }): RendererHost {
  const target = new EventTarget();
  return Object.assign(target, { bundle: initialBundle ?? null }) as unknown as RendererHost;
}

function makeMount(): Element {
  return { appendChild: () => {} } as unknown as Element;
}

test("createPixiRenderer: initial state is idle, no app", () => {
  const mf = makeMockFactory();
  const r = createPixiRenderer({
    element: makeHost(),
    mount: makeMount(),
    createApp: mf.createApp,
  });
  assert.equal(r.stage, "idle");
  assert.equal(r.partCount, 0);
  assert.equal(r.lastMeta, null);
  assert.equal(r.readyCount, 0);
  assert.equal(mf.apps.length, 0, "no PIXI.Application created until ready");
  r.destroy();
});

test("createPixiRenderer: ready triggers createApp and rebuild", async () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(4) } } }),
  );
  assert.equal(r.stage, "initializing", "init kicked off synchronously");
  assert.equal(r.readyCount, 1);
  assert.equal(r.partCount, 4);

  await mf.flushCreate();
  assert.equal(r.stage, "ready");
  assert.equal(mf.apps.length, 1);
  assert.equal(mf.apps[0]?.rebuildCalls.length, 1);
  assert.equal(mf.apps[0]?.rebuildCalls[0]?.meta.parts.length, 4);
  r.destroy();
});

test("createPixiRenderer: late-attach host.bundle triggers init", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  assert.equal(r.readyCount, 1, "late-attach counts as 1 ready");
  assert.equal(r.stage, "initializing");
  await mf.flushCreate();
  assert.equal(r.stage, "ready");
  assert.equal(mf.apps[0]?.rebuildCalls.length, 1);
  r.destroy();
});

test("createPixiRenderer: second ready after init re-rebuilds without recreating app", async () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(1) } } }),
  );
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(5) } } }),
  );
  assert.equal(r.readyCount, 2);
  assert.equal(mf.apps.length, 1, "same app reused");
  assert.equal(mf.apps[0]?.rebuildCalls.length, 2, "second rebuild on reready");
  assert.equal(mf.apps[0]?.rebuildCalls[1]?.meta.parts.length, 5);
  r.destroy();
});

test("createPixiRenderer: parameterchange rotation drives setRotation (deg→rad)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 30 } }),
  );
  assert.equal(r.parameterChangeCount, 1);
  assert.equal(mf.apps[0]?.rotationCalls.length, 1);
  const rad = mf.apps[0]?.rotationCalls[0] ?? 0;
  assert.ok(Math.abs(rad - Math.PI / 6) < 1e-9, "30deg = π/6 rad");

  // Non-rotation param doesn't trigger setRotation.
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "body_breath", value: 0.5 } }),
  );
  assert.equal(mf.apps[0]?.rotationCalls.length, 1, "non-rotation param ignored");
  r.destroy();
});

test("createPixiRenderer: custom rotationParameter", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
    rotationParameter: "head_angle_z",
  });
  await mf.flushCreate();
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 45 } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_z", value: 45 } }),
  );
  assert.equal(mf.apps[0]?.rotationCalls.length, 1, "only head_angle_z drove rotation");
  r.destroy();
});

test("createPixiRenderer: malformed events ignored", () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(new CustomEvent("ready", { detail: null }));
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: null } }));
  host.dispatchEvent(new CustomEvent("ready", { detail: { bundle: {} } }));
  assert.equal(r.readyCount, 0);
  assert.equal(r.stage, "idle");

  host.dispatchEvent(new CustomEvent("parameterchange", { detail: null }));
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: 1, value: 0 } as never }),
  );
  assert.equal(r.parameterChangeCount, 0);
  r.destroy();
});

test("createPixiRenderer: destroy removes listeners + tears down app", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  assert.equal(mf.apps[0]?.destroyed, false);

  r.destroy();
  assert.equal(r.stage, "destroyed");
  assert.equal(mf.apps[0]?.destroyed, true);

  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(9) } } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 45 } }),
  );
  assert.equal(r.readyCount, 1, "post-destroy ready ignored");
  assert.equal(r.parameterChangeCount, 0, "post-destroy parameterchange ignored");
});

test("createPixiRenderer: destroy during pending init tears down when init resolves", async () => {
  const mf = makeMockFactory({ defer: true });
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  assert.equal(r.stage, "initializing");
  r.destroy();
  assert.equal(r.stage, "destroyed");

  await mf.flushCreate();
  // app was created but then destroyed because destroy flag latched.
  assert.equal(mf.apps.length, 1);
  assert.equal(mf.apps[0]?.destroyed, true);
});

function sampleAtlas(): RendererAtlas {
  return {
    textures: [{ path: "textures/base.png", width: 2048, height: 2048 }],
    slots: [
      { slot_id: "slot_0", texture_path: "textures/base.png", uv: [0.0, 0.0, 0.5, 0.5] },
      { slot_id: "slot_1", texture_path: "textures/base.png", uv: [0.5, 0.5, 0.5, 0.5] },
    ],
  };
}

test("createPixiRenderer: atlas + bundleUrl → rebuild scene 에 resolved textureUrl 전달 (P1-S2)", async () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(
    new CustomEvent("ready", {
      detail: {
        bundle: {
          meta: sampleMeta(2),
          atlas: sampleAtlas(),
          bundleUrl: "https://host.example/pkg/bundle.json",
        },
      },
    }),
  );
  await mf.flushCreate();
  assert.equal(r.lastAtlas?.slots.length, 2);
  assert.equal(r.lastTextureUrl, "https://host.example/pkg/textures/base.png");
  const scene = mf.apps[0]?.rebuildCalls[0];
  assert.ok(scene);
  assert.equal(scene.meta.parts.length, 2);
  assert.equal(scene.atlas?.slots.length, 2);
  assert.equal(scene.textureUrl, "https://host.example/pkg/textures/base.png");
  r.destroy();
});

test("createPixiRenderer: atlas 없는 번들 → scene.textureUrl null + atlas null", async () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(
    new CustomEvent("ready", { detail: { bundle: { meta: sampleMeta(1) } } }),
  );
  await mf.flushCreate();
  const scene = mf.apps[0]?.rebuildCalls[0];
  assert.ok(scene);
  assert.equal(scene.atlas ?? null, null);
  assert.equal(scene.textureUrl ?? null, null);
  assert.equal(r.lastAtlas, null);
  assert.equal(r.lastTextureUrl, null);
  r.destroy();
});

test("createPixiRenderer: bundleUrl 누락 시 textureUrl null (atlas 는 살아있음)", async () => {
  const mf = makeMockFactory();
  const host = makeHost();
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  host.dispatchEvent(
    new CustomEvent("ready", {
      detail: { bundle: { meta: sampleMeta(1), atlas: sampleAtlas() } },
    }),
  );
  await mf.flushCreate();
  assert.equal(r.lastAtlas?.slots.length, 2);
  assert.equal(r.lastTextureUrl, null, "no bundleUrl → cannot resolve");
  r.destroy();
});

test("createPixiRenderer: regenerate() 는 meta 유지하고 atlas/textureUrl 만 교체 + re-rebuild (P2-S1)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  assert.equal(mf.apps[0]?.rebuildCalls.length, 1);

  r.regenerate({
    atlas: sampleAtlas(),
    textureUrl: "blob:https://host.example/abc",
  });
  assert.equal(mf.apps[0]?.rebuildCalls.length, 2, "second rebuild from regenerate");
  const scene = mf.apps[0]?.rebuildCalls[1];
  assert.equal(scene?.meta.parts.length, 2, "meta preserved");
  assert.equal(scene?.atlas?.slots.length, 2);
  assert.equal(scene?.textureUrl, "blob:https://host.example/abc");
  assert.equal(r.readyCount, 1, "regenerate does not bump readyCount");
  r.destroy();
});

test("createPixiRenderer: regenerate() 는 destroy 후 no-op", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  r.destroy();
  r.regenerate({ textureUrl: "blob:whatever" });
  assert.equal(mf.apps[0]?.rebuildCalls.length, 1, "no new rebuild after destroy");
});

test("createPixiRenderer: createApp failure leaves stage=idle", async () => {
  const mf = makeMockFactory({ failFirst: true });
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  await Promise.resolve();
  assert.equal(r.stage, "idle", "failed init does not latch into ready");
  assert.equal(mf.apps.length, 0);
  r.destroy();
});

// ─── β P1-S3: motion/expression binding ──────────────────────────────────────

function sampleMotion(overrides: Partial<RendererMotion> = {}): RendererMotion {
  return {
    pack_id: "idle.default",
    duration_sec: 4,
    fade_in_sec: 0.5,
    fade_out_sec: 0.5,
    loop: true,
    ...overrides,
  };
}

function sampleExpression(overrides: Partial<RendererExpression> = {}): RendererExpression {
  return {
    expression_id: "smile",
    name_en: "Smile",
    fade_in_sec: 0.2,
    fade_out_sec: 0.2,
    ...overrides,
  };
}

test("createPixiRenderer: motionstart 이벤트 → app.setMotion 호출 (P1-S3)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  const motion = sampleMotion();
  host.dispatchEvent(
    new CustomEvent("motionstart", { detail: { pack_id: motion.pack_id, motion } }),
  );
  assert.equal(r.motionStartCount, 1);
  assert.equal(r.lastMotion?.pack_id, "idle.default");
  assert.equal(r.lastMotion?.loop, true);
  assert.equal(mf.apps[0]?.setMotionCalls.length, 1);
  assert.equal(mf.apps[0]?.setMotionCalls[0]?.pack_id, "idle.default");
  r.destroy();
});

test("createPixiRenderer: expressionchange 이벤트 → app.setExpression 호출 (id + null 양쪽) (P1-S3)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  const expr = sampleExpression();
  host.dispatchEvent(
    new CustomEvent("expressionchange", {
      detail: { expression_id: expr.expression_id, expression: expr },
    }),
  );
  assert.equal(r.expressionChangeCount, 1);
  assert.equal(r.lastExpression?.expression_id, "smile");

  host.dispatchEvent(
    new CustomEvent("expressionchange", {
      detail: { expression_id: null, expression: null },
    }),
  );
  assert.equal(r.expressionChangeCount, 2);
  assert.equal(r.lastExpression, null);

  const calls = mf.apps[0]?.setExpressionCalls ?? [];
  assert.equal(calls.length, 2);
  assert.equal(calls[0]?.expression_id, "smile");
  assert.equal(calls[1], null);
  r.destroy();
});

test("createPixiRenderer: createApp 완료 전 motion/expression 이 오면 app ready 후 replay (P1-S3)", async () => {
  const mf = makeMockFactory({ defer: true });
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  assert.equal(r.stage, "initializing");
  host.dispatchEvent(
    new CustomEvent("motionstart", {
      detail: { pack_id: "idle.default", motion: sampleMotion() },
    }),
  );
  host.dispatchEvent(
    new CustomEvent("expressionchange", {
      detail: { expression_id: "smile", expression: sampleExpression() },
    }),
  );
  assert.equal(r.motionStartCount, 1);
  assert.equal(r.expressionChangeCount, 1);

  await mf.flushCreate();
  assert.equal(r.stage, "ready");
  assert.equal(mf.apps[0]?.setMotionCalls.length, 1, "replay motion after app ready");
  assert.equal(mf.apps[0]?.setExpressionCalls.length, 1, "replay expression after app ready");
  r.destroy();
});

test("createPixiRenderer: malformed motion/expression ignored (P1-S3)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(new CustomEvent("motionstart", { detail: null }));
  host.dispatchEvent(new CustomEvent("motionstart", { detail: { pack_id: 1 } as never }));
  host.dispatchEvent(
    new CustomEvent("motionstart", {
      detail: { pack_id: "x", motion: { pack_id: "x" } } as never,
    }),
  );
  assert.equal(r.motionStartCount, 0);

  host.dispatchEvent(new CustomEvent("expressionchange", { detail: null }));
  host.dispatchEvent(
    new CustomEvent("expressionchange", {
      detail: { expression_id: "x", expression: null } as never,
    }),
  );
  assert.equal(r.expressionChangeCount, 0, "expression with id but null payload ignored");
  r.destroy();
});

test("createPixiRenderer: destroy 후 motion/expression 이벤트 no-op (P1-S3)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(1) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  r.destroy();

  host.dispatchEvent(
    new CustomEvent("motionstart", {
      detail: { pack_id: "idle.default", motion: sampleMotion() },
    }),
  );
  host.dispatchEvent(
    new CustomEvent("expressionchange", {
      detail: { expression_id: "smile", expression: sampleExpression() },
    }),
  );
  assert.equal(r.motionStartCount, 0);
  assert.equal(r.expressionChangeCount, 0);
  assert.equal(mf.apps[0]?.setMotionCalls.length, 0);
  assert.equal(mf.apps[0]?.setExpressionCalls.length, 0);
});

// ─── β P1-S4: per-part parameter binding ─────────────────────────────────────

function boundMeta(): RendererBundleMeta {
  return {
    parts: [
      { role: "head", slot_id: "head_slot", parameter_ids: ["head_angle_z"] },
      { role: "ahoge", slot_id: "ahoge_slot", parameter_ids: ["ahoge_sway"] },
      { role: "body", slot_id: "body_slot" },
    ],
    parameters: [
      { id: "head_angle_z", range: [-30, 30], default: 0 },
      { id: "ahoge_sway", range: [-1, 1], default: 0 },
    ],
  };
}

test("createPixiRenderer: parameter_ids 를 가진 파츠만 per-part setPartTransform 호출 (P1-S4)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: boundMeta() });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_z", value: 30 } }),
  );
  const calls = mf.apps[0]?.setPartTransformCalls ?? [];
  assert.equal(calls.length, 1, "바인드된 파츠 1개만");
  assert.equal(calls[0]?.slot_id, "head_slot");
  const rad = calls[0]?.transform.rotation ?? 0;
  assert.ok(Math.abs(rad - Math.PI / 6) < 1e-9, "angle_z 휴리스틱 → 30deg=π/6 rad");
  assert.equal(mf.apps[0]?.rotationCalls.length, 0, "바인드된 파츠가 있으면 root setRotation 은 skip");
  r.destroy();
});

test("createPixiRenderer: Cubism 축 분리 — angle_x→offsetY, angle_y→offsetX, angle_z→rotation (P1-S5)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({
    meta: {
      parts: [
        {
          role: "face",
          slot_id: "face_slot",
          parameter_ids: ["head_angle_x", "head_angle_y", "head_angle_z"],
        },
      ],
      parameters: [
        { id: "head_angle_x", range: [-30, 30], default: 0 },
        { id: "head_angle_y", range: [-30, 30], default: 0 },
        { id: "head_angle_z", range: [-30, 30], default: 0 },
      ],
    },
  });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 30 } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_y", value: -30 } }),
  );
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_z", value: 15 } }),
  );
  const calls = mf.apps[0]?.setPartTransformCalls ?? [];
  assert.equal(calls.length, 3);
  // angle_x → offsetY (pitch = 끄덕임 = 수직 이동 Mock)
  assert.equal(calls[0]?.transform.offsetY, 12, "angle_x 30deg → offsetY 12px");
  assert.equal(calls[0]?.transform.rotation, undefined);
  assert.equal(calls[0]?.transform.offsetX, undefined);
  // angle_y → offsetX (yaw = 좌우 = 수평 이동 Mock)
  assert.equal(calls[1]?.transform.offsetX, -12, "angle_y -30deg → offsetX -12px");
  assert.equal(calls[1]?.transform.rotation, undefined);
  assert.equal(calls[1]?.transform.offsetY, undefined);
  // angle_z → rotation (roll = 실 2D 회전)
  const rad = calls[2]?.transform.rotation ?? 0;
  assert.ok(Math.abs(rad - Math.PI / 12) < 1e-9, "angle_z 15deg → π/12 rad");
  assert.equal(calls[2]?.transform.offsetX, undefined);
  assert.equal(calls[2]?.transform.offsetY, undefined);
  r.destroy();
});

test("createPixiRenderer: sway 파라미터는 offsetY 로 매핑 (P1-S4)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: boundMeta() });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "ahoge_sway", value: 0.5 } }),
  );
  const calls = mf.apps[0]?.setPartTransformCalls ?? [];
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.slot_id, "ahoge_slot");
  assert.equal(calls[0]?.transform.offsetY, 6, "sway 0.5 * 12px = 6px");
  r.destroy();
});

test("createPixiRenderer: 바인드된 파츠가 없는 파라미터는 root rotation fallback (P1-S4)", async () => {
  const mf = makeMockFactory();
  // 기존 sampleMeta 는 parameter_ids 를 안 실어 binding 없음.
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 45 } }),
  );
  assert.equal(mf.apps[0]?.setPartTransformCalls.length, 0, "per-part binding 없음");
  assert.equal(mf.apps[0]?.rotationCalls.length, 1, "rotationParameter fallback 유지");
  r.destroy();
});

test("createPixiRenderer: 같은 파라미터가 여러 파츠에 바인드되면 전부 호출 (P1-S4)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({
    meta: {
      parts: [
        { role: "left", slot_id: "left_slot", parameter_ids: ["body_breath"] },
        { role: "right", slot_id: "right_slot", parameter_ids: ["body_breath"] },
      ],
      parameters: [{ id: "body_breath", range: [0, 1], default: 0 }],
    },
  });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  // body_breath 는 휴리스틱 매칭 (angle/sway/offset_x 아무것도 안 맞음) → transform null
  // → setPartTransform 은 안 호출되고 fallback rotation 도 안 됨.
  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "body_breath", value: 0.7 } }),
  );
  assert.equal(mf.apps[0]?.setPartTransformCalls.length, 0, "매핑 없는 파라미터는 미반영");
  assert.equal(r.parameterChangeCount, 1, "하지만 count 는 증가");
  r.destroy();
});

test("createPixiRenderer: 바인드된 파라미터는 rotationParameter 와 동일해도 root fallback 은 skip (P1-S4/5)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({
    meta: {
      parts: [
        { role: "a", slot_id: "a", parameter_ids: ["head_angle_x"] },
        { role: "b", slot_id: "b", parameter_ids: ["head_angle_x"] },
      ],
      parameters: [{ id: "head_angle_x", range: [-30, 30], default: 0 }],
    },
  });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
    // 기본 rotationParameter = "head_angle_x" — 바인드 파츠가 있으면 root fallback 은 skip 되어야.
  });
  await mf.flushCreate();

  host.dispatchEvent(
    new CustomEvent("parameterchange", { detail: { id: "head_angle_x", value: 15 } }),
  );
  const calls = mf.apps[0]?.setPartTransformCalls ?? [];
  assert.equal(calls.length, 2, "두 파츠 모두 호출");
  assert.equal(calls[0]?.slot_id, "a");
  assert.equal(calls[1]?.slot_id, "b");
  // P1-S5: angle_x → offsetY (Mock pitch). 축이 rotation 이 아니라도 per-part 로 처리됐으므로 root 는 skip.
  assert.equal(calls[0]?.transform.offsetY, 6, "angle_x 15deg → offsetY 6px");
  assert.equal(mf.apps[0]?.rotationCalls.length, 0, "per-part 로 처리됐으므로 root 는 skip");
  r.destroy();
});

test("createPixiRenderer: regenerate() 는 Promise 를 반환하며 rebuild 완료 후 resolve (P2-S3)", async () => {
  // MockApp.rebuild 는 Promise.resolve() 를 즉시 반환. regenerate 반환이 실제
  // promise 를 노출하는지 + await 로 동기적 추적 가능한지 검증. timing 측정의 기반.
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();

  const atlas: RendererAtlas = {
    textures: [{ path: "t.png", width: 16, height: 16 }],
    slots: [{ slot_id: "slot_0", texture_path: "t.png", uv: [0, 0, 0.5, 1] }],
  };
  const initialRebuilds = mf.apps[0]?.rebuildCalls.length ?? 0;
  const promise = r.regenerate({ atlas, textureUrl: "blob://new" });
  assert.ok(promise && typeof promise.then === "function", "regenerate 가 Promise 를 반환");
  await promise;
  assert.equal(
    mf.apps[0]?.rebuildCalls.length,
    initialRebuilds + 1,
    "await 완료 시점에 rebuild 가 한 번 더 호출됐음",
  );
  const lastRebuild = mf.apps[0]?.rebuildCalls[mf.apps[0]!.rebuildCalls.length - 1];
  assert.equal(lastRebuild?.textureUrl, "blob://new", "새 textureUrl 반영");
  assert.equal(lastRebuild?.atlas, atlas, "새 atlas 반영");
  r.destroy();
});

test("createPixiRenderer: regenerate() Promise 는 destroy 후에도 안전하게 resolve (P2-S3)", async () => {
  const mf = makeMockFactory();
  const host = makeHost({ meta: sampleMeta(2) });
  const r = createPixiRenderer({
    element: host,
    mount: makeMount(),
    createApp: mf.createApp,
  });
  await mf.flushCreate();
  r.destroy();
  const promise = r.regenerate({ textureUrl: "blob://after-destroy" });
  assert.ok(promise && typeof promise.then === "function");
  await promise; // throw 하지 않아야
});

test("resolvePivotPlacement: pivot_uv 없으면 slot 중심 (이전 anchor=0.5 동작) (P1-S7)", () => {
  const res = resolvePivotPlacement({
    slot: { uv: [0.2, 0.1, 0.6, 0.5] },
    frame: { x: 204, y: 102, width: 410, height: 410 },
    canvasW: 1024,
    canvasH: 1024,
    fit: 1,
    originX: 0,
    originY: 0,
  });
  assert.ok(Math.abs(res.anchorX - 0.5) < 1e-9, "anchor.x = 중심");
  assert.ok(Math.abs(res.anchorY - 0.5) < 1e-9, "anchor.y = 중심");
  // centerU = 0.4, centerV = 0.3 → position = (0.4*1024, 0.3*1024)
  assert.ok(Math.abs(res.spriteX - 0.4 * 1024) < 1e-9);
  assert.ok(Math.abs(res.spriteY - 0.3 * 1024) < 1e-9);
});

test("resolvePivotPlacement: pivot_uv = 슬롯 우상단 → anchor 우상단, position = 우상단 (P1-S7)", () => {
  const res = resolvePivotPlacement({
    slot: { uv: [0.2, 0.1, 0.6, 0.5], pivot_uv: [0.6, 0.1] },
    frame: { x: 204, y: 102, width: 410, height: 410 },
    canvasW: 1024,
    canvasH: 1024,
    fit: 1,
    originX: 0,
    originY: 0,
  });
  // du = 0.4, dv = 0.4 → anchor = ((0.6-0.2)/0.4, (0.1-0.1)/0.4) = (1, 0) = 우상단
  assert.equal(res.anchorX, 1);
  assert.equal(res.anchorY, 0);
  assert.equal(res.spriteX, 0.6 * 1024);
  assert.equal(res.spriteY, 0.1 * 1024);
});

test("resolvePivotPlacement: pivot_uv 가 슬롯 바깥 (머리 위) 이어도 안전 + 절대 좌표 정확 (P1-S7)", () => {
  // ahoge (더듬이) 는 얼굴 위쪽이 피벗. pivot_uv 가 slot UV 바깥인 경우.
  const res = resolvePivotPlacement({
    slot: { uv: [0.4, 0.0, 0.6, 0.1], pivot_uv: [0.5, 0.2] },
    frame: { x: 0, y: 0, width: 100, height: 100 },
    canvasW: 1000,
    canvasH: 1000,
    fit: 0.5,
    originX: 10,
    originY: 20,
  });
  // pivotV 가 slot 바깥 (0.2 > 0.1) — 그래도 anchor 가 계산되어야 (v 축 방향으로 extrapolation).
  // du = 0.2 → anchorX = (0.5-0.4)/0.2 = 0.5
  // dv = 0.1 → anchorY = (0.2-0.0)/0.1 = 2.0
  assert.equal(res.anchorX, 0.5);
  assert.equal(res.anchorY, 2);
  // position: origin + pivotUV * canvas * fit
  assert.equal(res.spriteX, 10 + 0.5 * 1000 * 0.5); // 10 + 250 = 260
  assert.equal(res.spriteY, 20 + 0.2 * 1000 * 0.5); // 20 + 100 = 120
});
