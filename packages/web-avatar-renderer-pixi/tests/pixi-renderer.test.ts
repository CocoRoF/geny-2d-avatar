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
  type PixiAppHandle,
  type CreatePixiApp,
  type PixiSceneInput,
} from "../src/index.js";
import type {
  RendererAtlas,
  RendererBundleMeta,
  RendererHost,
} from "@geny/web-avatar-renderer";

interface MockApp extends PixiAppHandle {
  readonly rebuildCalls: readonly PixiSceneInput[];
  readonly rotationCalls: readonly number[];
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
          destroyed: false,
        };
        const handle: MockApp = {
          rebuildCalls: state.rebuildCalls,
          rotationCalls: state.rotationCalls,
          get destroyed() {
            return state.destroyed;
          },
          rebuild(scene) {
            state.rebuildCalls.push(scene);
          },
          setRotation(rad) {
            state.rotationCalls.push(rad);
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
