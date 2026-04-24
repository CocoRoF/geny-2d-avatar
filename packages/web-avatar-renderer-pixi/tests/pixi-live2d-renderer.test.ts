// P1.E 테스트 - mock createApp/loadModel 으로 실 연결 경로 검증.
// 실 WebGL + Cubism Core 동작은 apps/web-preview 브라우저 수동 스모크 (P1.5).

import test from "node:test";
import assert from "node:assert/strict";
import {
  createPixiLive2DRenderer,
  defaultResolveModelUrl,
  type Live2DModelLike,
  type PixiLive2DAppHandle,
} from "../src/pixi-live2d-renderer.js";
import type { RendererReadyEventDetail } from "@geny/web-avatar-renderer";

function fakeHost() {
  const listeners = new Map<string, Set<EventListener>>();
  return {
    addEventListener: (type: string, listener: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: EventListener) => {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: (event: Event) => {
      const set = listeners.get(event.type);
      if (set) for (const l of set) l(event);
      return true;
    },
    _fire: (type: string, detail: unknown) => {
      const ev = new CustomEvent(type, { detail });
      const set = listeners.get(type);
      if (set) for (const l of set) l(ev);
    },
  };
}

function readyDetail(bundleUrl?: string): RendererReadyEventDetail {
  const bundle: RendererReadyEventDetail["bundle"] = {
    meta: { parts: [], parameters: [] },
    atlas: null,
    ...(bundleUrl !== undefined ? { bundleUrl } : {}),
  };
  return { bundle };
}

function makeMockModel(): Live2DModelLike & {
  _params: Map<string, number>;
  _motions: string[];
  _expressions: (string | number | null)[];
  _destroyed: boolean;
} {
  const params = new Map<string, number>();
  const motions: string[] = [];
  const expressions: (string | number | null)[] = [];
  return {
    _params: params,
    _motions: motions,
    _expressions: expressions,
    _destroyed: false,
    destroy() {
      (this as unknown as { _destroyed: boolean })._destroyed = true;
    },
    internalModel: {
      coreModel: {
        setParameterValueById(id: string, value: number) {
          params.set(id, value);
        },
        getParameterValueById(id: string) {
          return params.get(id) ?? 0;
        },
      },
    },
    async motion(group: string, _index?: number) {
      motions.push(group);
      return true;
    },
    async expression(id?: number | string | null) {
      expressions.push(id ?? null);
      return true;
    },
  };
}

function makeMockApp(): PixiLive2DAppHandle & { _children: unknown[]; _destroyed: boolean } {
  const children: unknown[] = [];
  const handle: PixiLive2DAppHandle & { _children: unknown[]; _destroyed: boolean } = {
    _children: children,
    _destroyed: false,
    stage: {
      addChild(child: unknown) {
        children.push(child);
      },
      removeChild(child: unknown) {
        const idx = children.indexOf(child);
        if (idx >= 0) children.splice(idx, 1);
      },
    },
    destroy() {
      handle._destroyed = true;
    },
  };
  return handle;
}

// ---- defaultResolveModelUrl ----

test("defaultResolveModelUrl: /rig-templates/base/mao_pro/v1.0.0/bundle.json → runtime_assets/mao_pro.model3.json", () => {
  const url = defaultResolveModelUrl(
    readyDetail("/rig-templates/base/mao_pro/v1.0.0/bundle.json"),
  );
  assert.equal(url, "/rig-templates/base/mao_pro/v1.0.0/runtime_assets/mao_pro.model3.json");
});

test("defaultResolveModelUrl: /public/sample/halfbody/bundle.json → runtime_assets/halfbody.model3.json", () => {
  const url = defaultResolveModelUrl(readyDetail("/public/sample/halfbody/bundle.json"));
  assert.equal(url, "/public/sample/halfbody/runtime_assets/halfbody.model3.json");
});

test("defaultResolveModelUrl: bundleUrl 누락 시 throw", () => {
  assert.throws(() => defaultResolveModelUrl(readyDetail()), /bundleUrl missing/);
});

test("defaultResolveModelUrl: 패턴 불일치 시 throw", () => {
  assert.throws(
    () => defaultResolveModelUrl(readyDetail("/some/random/file.json")),
    /doesn't match expected pattern/,
  );
});

// ---- createPixiLive2DRenderer: 기본 상태 전이 ----

test("createPixiLive2DRenderer: 초기 status=before-ready, destroy 시 destroyed", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => makeMockModel(),
  });
  assert.equal(renderer.getStatus(), "before-ready");
  renderer.destroy();
  assert.equal(renderer.getStatus(), "destroyed");
});

test("createPixiLive2DRenderer: Cubism Core 미로드 시 error 이벤트 + status=error", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => false,
    createApp: async () => makeMockApp(),
    loadModel: async () => makeMockModel(),
  });
  let captured: { error: Error; code: string } | null = null;
  host.addEventListener("error", (e: Event) => {
    captured = (e as CustomEvent<{ error: Error; code: string }>).detail;
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  assert.ok(captured, "should dispatch error when Cubism Core missing");
  assert.equal((captured as unknown as { code: string }).code, "CUBISM_CORE_MISSING");
  assert.match(
    (captured as unknown as { error: Error }).error.message,
    /window\.Live2DCubismCore not loaded/,
  );
  assert.equal(renderer.getStatus(), "error");
  renderer.destroy();
});

test("createPixiLive2DRenderer: 잘못된 bundleUrl → RESOLVE_MODEL_URL_FAILED", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => makeMockModel(),
  });
  let captured: { error: Error; code: string } | null = null;
  host.addEventListener("error", (e: Event) => {
    captured = (e as CustomEvent<{ error: Error; code: string }>).detail;
  });
  host._fire("ready", readyDetail());
  assert.equal((captured as unknown as { code: string }).code, "RESOLVE_MODEL_URL_FAILED");
  assert.equal(renderer.getStatus(), "error");
  renderer.destroy();
});

// ---- ready → load → ready 실 경로 ----

test("createPixiLive2DRenderer: ready → createApp → loadModel → stage.addChild → status=ready", async () => {
  const host = fakeHost();
  const mockApp = makeMockApp();
  const mockModel = makeMockModel();
  let resolvedUrl = "";
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => mockApp,
    loadModel: async (url) => {
      resolvedUrl = url;
      return mockModel;
    },
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  // 비동기 — 다음 microtask 대기.
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(renderer.getStatus(), "ready");
  assert.equal(
    resolvedUrl,
    "/r/base/mao_pro/v1.0.0/runtime_assets/mao_pro.model3.json",
    "should resolve correct model URL",
  );
  assert.equal(mockApp._children.length, 1, "model should be added to stage");
  assert.equal(renderer.getModel(), mockModel, "model accessible via getModel()");
  renderer.destroy();
  assert.equal(renderer.getStatus(), "destroyed");
  assert.equal(mockModel._destroyed, true, "model.destroy() called");
  assert.equal(mockApp._destroyed, true, "app.destroy() called");
});

test("createPixiLive2DRenderer: loadModel 에러 시 MODEL_LOAD_FAILED", async () => {
  const host = fakeHost();
  let captured: { error: Error; code: string } | null = null;
  host.addEventListener("error", (e: Event) => {
    captured = (e as CustomEvent<{ error: Error; code: string }>).detail;
  });
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => {
      throw new Error("네트워크 오류 시뮬");
    },
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(captured);
  assert.equal((captured as unknown as { code: string }).code, "MODEL_LOAD_FAILED");
  assert.equal(renderer.getStatus(), "error");
  renderer.destroy();
});

// ---- setParameter / playMotion / setExpression 직접 호출 ----

test("createPixiLive2DRenderer: setParameter - 모델 로드 전 호출은 buffer, 로드 후 적용", async () => {
  const host = fakeHost();
  const mockModel = makeMockModel();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => mockModel,
  });
  // before ready 시점에 setParameter 호출 - buffer 되어야 함.
  renderer.setParameter("ParamAngleX", 15);
  renderer.setParameter("ParamEyeLOpen", 0.5);
  assert.equal(mockModel._params.size, 0, "not applied yet (model not loaded)");
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(mockModel._params.get("ParamAngleX"), 15, "pending param applied after ready");
  assert.equal(mockModel._params.get("ParamEyeLOpen"), 0.5);
  // 로드 후 직접 호출은 즉시 적용.
  renderer.setParameter("ParamAngleY", -10);
  assert.equal(mockModel._params.get("ParamAngleY"), -10);
  renderer.destroy();
});

test("createPixiLive2DRenderer: playMotion / setExpression 로드 후 전달", async () => {
  const host = fakeHost();
  const mockModel = makeMockModel();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => mockModel,
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  renderer.playMotion("Idle");
  renderer.setExpression("exp_01");
  renderer.setExpression(null);
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(mockModel._motions, ["Idle"]);
  assert.deepEqual(mockModel._expressions, ["exp_01", null]);
  renderer.destroy();
});

test("createPixiLive2DRenderer: parameterchange 이벤트 → setParameterValueById", async () => {
  const host = fakeHost();
  const mockModel = makeMockModel();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => makeMockApp(),
    loadModel: async () => mockModel,
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  host._fire("parameterchange", { id: "ParamAngleX", value: 25 });
  assert.equal(mockModel._params.get("ParamAngleX"), 25);
  renderer.destroy();
});

test("createPixiLive2DRenderer: destroy 중 loadModel 완료해도 정리", async () => {
  const host = fakeHost();
  const mockApp = makeMockApp();
  const mockModel = makeMockModel();
  let resolveLoad: (m: Live2DModelLike) => void;
  const loadPromise = new Promise<Live2DModelLike>((r) => {
    resolveLoad = r;
  });
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    createApp: async () => mockApp,
    loadModel: () => loadPromise,
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  // createApp 은 동기 (마이크로태스크) 로 resolve. 그 사이 destroy.
  await new Promise((r) => setTimeout(r, 0));
  renderer.destroy();
  // 이제 loadModel 완료 시키기
  resolveLoad!(mockModel);
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
  // destroy 된 상태에서 로드된 모델은 정리되어야 함.
  assert.equal(mockModel._destroyed, true, "model should be destroyed when load completes after renderer.destroy()");
});
