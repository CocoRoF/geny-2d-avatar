// P1.D skeleton test - 계약 (클래스 존재, 시그니처, defaultResolveModelUrl 동작) 만 검증.
// 실 pixi-live2d-display-advanced + WebGL 렌더 테스트는 Playwright E2E (P1.E).

import test from "node:test";
import assert from "node:assert/strict";
import {
  createPixiLive2DRenderer,
  defaultResolveModelUrl,
} from "../src/pixi-live2d-renderer.js";
import type { RendererReadyEventDetail } from "@geny/web-avatar-renderer";

function fakeHost() {
  const listeners = new Map<string, EventListener>();
  return {
    addEventListener: (type: string, listener: EventListener) => {
      listeners.set(type, listener);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
    dispatchEvent: (event: Event) => {
      const l = listeners.get(event.type);
      if (l) l(event);
      return true;
    },
    _fire: (type: string, detail: unknown) => {
      const ev = new CustomEvent(type, { detail });
      const l = listeners.get(type);
      if (l) l(ev);
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

test("createPixiLive2DRenderer: 초기 status=before-ready, destroy 시 destroyed", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
  });
  assert.equal(renderer.getStatus(), "before-ready");
  renderer.destroy();
  assert.equal(renderer.getStatus(), "destroyed");
});

test("createPixiLive2DRenderer: Cubism Core 미로드 시 ready 이벤트에 error 발행 + status=error", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => false,
  });
  let capturedError: Error | null = null;
  host.addEventListener("error", (e: Event) => {
    const detail = (e as CustomEvent<{ error: Error; code: string }>).detail;
    capturedError = detail.error;
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  assert.ok(capturedError, "should dispatch error when Cubism Core missing");
  assert.match(
    (capturedError as unknown as Error).message,
    /window\.Live2DCubismCore not loaded/,
  );
  assert.equal(renderer.getStatus(), "error");
  renderer.destroy();
});

test("createPixiLive2DRenderer: Cubism Core 있고 bundle ready → status=ready (skeleton)", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
  });
  host._fire("ready", readyDetail("/r/base/mao_pro/v1.0.0/bundle.json"));
  assert.equal(renderer.getStatus(), "ready");
  renderer.destroy();
});

test("createPixiLive2DRenderer: resolveModelUrl 커스텀 주입 가능", () => {
  const host = fakeHost();
  let resolvedWith: RendererReadyEventDetail | null = null;
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
    resolveModelUrl: (d) => {
      resolvedWith = d;
      return "https://cdn.example.com/custom.model3.json";
    },
  });
  host._fire("ready", readyDetail("/r/base/foo/v1.0.0/bundle.json"));
  assert.ok(resolvedWith, "custom resolver should be called");
  assert.equal(renderer.getStatus(), "ready");
});

test("createPixiLive2DRenderer: 잘못된 bundleUrl → status=error + error 이벤트", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
  });
  let captured: { code: string; error: Error } | null = null;
  host.addEventListener("error", (e: Event) => {
    captured = (e as CustomEvent<{ error: Error; code: string }>).detail;
  });
  host._fire("ready", readyDetail()); // bundleUrl missing → resolver throws
  assert.ok(captured, "should dispatch error");
  assert.equal((captured as unknown as { code: string }).code, "RESOLVE_MODEL_URL_FAILED");
  assert.equal(renderer.getStatus(), "error");
});

test("createPixiLive2DRenderer: setParameter/playMotion/setExpression 은 P1.E 전 not implemented", () => {
  const host = fakeHost();
  const renderer = createPixiLive2DRenderer({
    element: host as unknown as Parameters<typeof createPixiLive2DRenderer>[0]["element"],
    mount: {} as Element,
    hasCubismCore: () => true,
  });
  assert.throws(() => renderer.setParameter("head_angle_x", 0), /not implemented yet \(P1\.E\)/);
  assert.throws(() => renderer.playMotion("mao.mtn_01"), /not implemented yet \(P1\.E\)/);
  assert.throws(() => renderer.setExpression("expression.exp_01"), /not implemented yet \(P1\.E\)/);
});
