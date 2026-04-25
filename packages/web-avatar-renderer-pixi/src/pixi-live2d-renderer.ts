/**
 * createPixiLive2DRenderer - ADR 001/002 구현체 (P1.D skeleton → P1.E 실 연결).
 *
 * createPixiRenderer 가 파츠 grid 기반 구조 프리뷰라면, 본 렌더러는
 * pixi-live2d-display-advanced 를 래핑해 실 .moc3 drawable 렌더.
 *
 * ## 런타임 선행 조건
 *
 * - 전역에 window.Live2DCubismCore 로드 (ADR 002)
 * - script 태그로 /vendor/live2dcubismcore.min.js 를 앱 index.html 에 선행 포함
 * - scripts/setup-cubism-core.mjs 가 Live2D 공식 다운로드 바이너리를
 *   apps 하위 public/vendor 로 배포
 *
 * ## 번들 경로 규약
 *
 * ready 이벤트의 detail.bundle.bundleUrl 이 web-avatar bundle.json URL 이면
 * runtime_assets 는 그 옆 디렉토리에 있다고 가정. 예:
 *   bundleUrl = /rig-templates/base/mao_pro/v1.0.0/bundle.json
 *   → modelUrl = /rig-templates/base/mao_pro/v1.0.0/runtime_assets/mao_pro.model3.json
 *
 * ## 테스트 전략
 *
 * - Node 단위 테스트는 createApp / loadModel 훅 주입으로 Live2DModel 을 mock.
 * - 실 WebGL 렌더 검증은 브라우저 (apps/web-preview) 수동 스모크 — 이후 Playwright.
 */

import type {
  Renderer,
  RendererReadyEventDetail,
  RendererHost,
  RendererParameterChangeEventDetail,
  RendererMotionStartEventDetail,
  RendererExpressionChangeEventDetail,
} from "@geny/web-avatar-renderer";

// ------ dependency-injected surface (Live2DModel / PIXI.Application 동적) ------

export interface PixiLive2DAppOptions {
  readonly mount: Element;
  readonly backgroundColor?: number;
  readonly width?: number;
  readonly height?: number;
}

/** Live2DModel 이 add 될 PIXI 스테이지 + 라이프사이클 훅. */
export interface PixiLive2DAppHandle {
  /** PIXI Container — Live2DModel 을 add 할 대상. Live2DModel 도 Container 이므로 */
  readonly stage: {
    addChild(child: unknown): void;
    removeChild(child: unknown): void;
  };
  /** canvas 등 DOM 리소스 해제. */
  destroy(): void;
}

export type CreatePixiLive2DApp = (opts: PixiLive2DAppOptions) => Promise<PixiLive2DAppHandle>;

/**
 * Live2DModel 의 최소 런타임 surface. 우리가 실제로 호출하는 메서드만 노출 —
 * pixi-live2d-display-advanced 의 Live2DModel 실체는 이 계약을 자동 만족.
 */
export interface Live2DModelLike {
  /** 모델이 add 된 stage 에서 제거할 때 사용. */
  readonly destroy?: () => void;
  /** model.internalModel.coreModel.setParameterValueById(cubismId, value). */
  readonly internalModel: {
    readonly coreModel: {
      setParameterValueById(id: string, value: number, weight?: number): void;
      getParameterValueById?: (id: string) => number;
    };
  };
  /** Cubism Motion 그룹 재생. priority 는 pixi-live2d-display-advanced MotionPriority. */
  readonly motion: (group: string, index?: number, priority?: number) => Promise<boolean>;
  /** Cubism Expression 적용 (name 또는 index). null 은 초기화. */
  readonly expression: (id?: number | string | null) => Promise<boolean>;
}

export type LoadLive2DModel = (modelUrl: string) => Promise<Live2DModelLike>;

// ------ 옵션/핸들 ------

export interface PixiLive2DRendererOptions {
  readonly element: RendererHost;
  readonly mount: Element;
  /**
   * window.Live2DCubismCore 로드 여부. 기본은 globalThis 의 해당 심볼 존재 검사.
   */
  readonly hasCubismCore?: () => boolean;
  /**
   * ready 이벤트로부터 model3.json URL 해석. 기본은 defaultResolveModelUrl.
   */
  readonly resolveModelUrl?: (detail: RendererReadyEventDetail) => string;
  /**
   * PIXI.Application 생성 훅. 주입 안 되면 런타임에 pixi.js 동적 import.
   * 테스트에서는 mock 주입.
   */
  readonly createApp?: CreatePixiLive2DApp;
  /**
   * Live2DModel.from 대응 훅. 주입 안 되면 런타임에 pixi-live2d-display-advanced 동적 import.
   * 테스트에서는 mock 주입.
   */
  readonly loadModel?: LoadLive2DModel;
  /** 스테이지 배경색. 기본 0xf7f8fa (editor bg-page 근사). */
  readonly backgroundColor?: number;
  /** 스테이지 크기. 기본 512×512. */
  readonly width?: number;
  readonly height?: number;
}

export type PixiLive2DRendererStatus =
  | "before-ready"
  | "loading"
  | "ready"
  | "error"
  | "destroyed";

export interface PixiLive2DRendererHandle extends Renderer {
  readonly getStatus: () => PixiLive2DRendererStatus;
  /** Live2D parameter id (Cubism 네이티브, 예: ParamAngleX) 에 값 주입. 모델 로드 전 호출은 무시됨. */
  readonly setParameter: (cubismId: string, value: number) => void;
  /** Cubism Motion 그룹 재생. group 은 model3.json 의 Groups 이름. */
  readonly playMotion: (group: string, index?: number) => void;
  /** Cubism Expression 적용. null 은 초기화. */
  readonly setExpression: (idOrIndex: string | number | null) => void;
  /** 테스트용. 로드된 모델 참조 (없으면 null). */
  readonly getModel: () => Live2DModelLike | null;
}

// ------ defaultResolveModelUrl ------

/**
 * 기본 model3.json URL resolver. bundleUrl 옆 runtime_assets/ 하위에서 <slug>.model3.json 찾음.
 * 3rd-party: <root>/<slug>/<version>/bundle.json → <root>/<slug>/<version>/runtime_assets/<slug>.model3.json
 * 간단: <root>/<slug>/bundle.json → <root>/<slug>/runtime_assets/<slug>.model3.json
 */
export function defaultResolveModelUrl(detail: RendererReadyEventDetail): string {
  const bundleUrl = detail.bundle.bundleUrl;
  if (!bundleUrl) {
    throw new Error(
      "[pixi-live2d-renderer] bundleUrl missing in ready event - " +
        "provide custom resolveModelUrl or ensure <geny-avatar> emits bundleUrl.",
    );
  }
  const clean = bundleUrl.replace(/[?#].*$/, "");
  if (!clean.endsWith("/bundle.json")) {
    throw new Error(
      "[pixi-live2d-renderer] bundleUrl doesn't match expected pattern " +
        "'<root>/<slug>[/<version>]/bundle.json': " +
        bundleUrl,
    );
  }
  const withoutBundle = clean.slice(0, -"/bundle.json".length);
  const parts = withoutBundle.split("/");
  const last = parts[parts.length - 1] ?? "";
  const isVersion = /^v[0-9]+(?:\.[0-9]+){0,2}$/.test(last);
  const slugRaw = isVersion ? parts[parts.length - 2] : last;
  const slug = slugRaw ?? "";
  if (!slug) {
    throw new Error(
      "[pixi-live2d-renderer] cannot extract slug from bundleUrl: " + bundleUrl,
    );
  }
  return withoutBundle + "/runtime_assets/" + slug + ".model3.json";
}

// ------ 기본 createApp / loadModel (런타임 동적 import) ------

async function defaultCreatePixiApp(opts: PixiLive2DAppOptions): Promise<PixiLive2DAppHandle> {
  const pixi = (await import("pixi.js")) as typeof import("pixi.js");
  const app = new pixi.Application();
  await app.init({
    background: opts.backgroundColor ?? 0xf7f8fa,
    width: opts.width ?? 512,
    height: opts.height ?? 512,
    antialias: true,
    resolution: typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
  });
  const canvas = app.canvas;
  opts.mount.appendChild(canvas);
  return {
    stage: {
      addChild(child: unknown) {
        app.stage.addChild(child as never);
      },
      removeChild(child: unknown) {
        app.stage.removeChild(child as never);
      },
    },
    destroy() {
      canvas.remove();
      app.destroy();
    },
  };
}

async function defaultLoadModel(modelUrl: string): Promise<Live2DModelLike> {
  // /cubism = Cubism 4/5 전용 sub-entry. main 엔트리는 Cubism 2 (live2d.min.js) 도 요구해서
  // mao_pro 같은 Cubism 4/5 모델 로드 시 "Could not find Cubism 2 runtime" 으로 실패.
  const mod = await import("pixi-live2d-display-advanced/cubism");
  const Live2DModel = (mod as { Live2DModel: { from: (url: string) => Promise<Live2DModelLike> } })
    .Live2DModel;
  return Live2DModel.from(modelUrl);
}

// ------ 핵심 factory ------

export function createPixiLive2DRenderer(
  opts: PixiLive2DRendererOptions,
): PixiLive2DRendererHandle {
  const hasCore =
    opts.hasCubismCore ??
    (() =>
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { Live2DCubismCore?: unknown }).Live2DCubismCore !== "undefined");
  const resolver = opts.resolveModelUrl ?? defaultResolveModelUrl;
  const createApp = opts.createApp ?? defaultCreatePixiApp;
  const loadModel = opts.loadModel ?? defaultLoadModel;

  let status: PixiLive2DRendererStatus = "before-ready";
  let app: PixiLive2DAppHandle | null = null;
  let model: Live2DModelLike | null = null;
  const pendingParameters = new Map<string, number>();

  function applyPendingParameters() {
    if (!model) return;
    for (const [id, value] of pendingParameters) {
      try {
        model.internalModel.coreModel.setParameterValueById(id, value);
      } catch (e) {
        // Cubism 모델에 없는 id 는 silently skip (우리 Wrapper 의 참조 param 이
        // Cubism 에 없을 수 있음 — mao_pro 의 undocumented param 포함)
        void e;
      }
    }
    pendingParameters.clear();
  }

  function emitError(code: string, error: Error) {
    status = "error";
    opts.element.dispatchEvent(
      new CustomEvent("error", { detail: { error, code } }),
    );
  }

  const onReady = (event: Event) => {
    if (status === "destroyed") return;
    if (!hasCore()) {
      emitError(
        "CUBISM_CORE_MISSING",
        new Error(
          "[pixi-live2d-renderer] window.Live2DCubismCore not loaded. " +
            "앱 index.html 에 script 태그로 /vendor/live2dcubismcore.min.js 선행 + " +
            "scripts/setup-cubism-core.mjs 실행 확인 (ADR 002).",
        ),
      );
      return;
    }
    status = "loading";
    const detail = (event as CustomEvent<RendererReadyEventDetail>).detail;
    let modelUrl: string;
    try {
      modelUrl = resolver(detail);
    } catch (err) {
      emitError("RESOLVE_MODEL_URL_FAILED", err as Error);
      return;
    }
    // 비동기 파이프라인: createApp → loadModel → stage.addChild.
    (async () => {
      try {
        const appOpts: PixiLive2DAppOptions = {
          mount: opts.mount,
          ...(opts.backgroundColor !== undefined
            ? { backgroundColor: opts.backgroundColor }
            : {}),
          ...(opts.width !== undefined ? { width: opts.width } : {}),
          ...(opts.height !== undefined ? { height: opts.height } : {}),
        };
        app = await createApp(appOpts);
        if ((status as PixiLive2DRendererStatus) === "destroyed") {
          app.destroy();
          app = null;
          return;
        }
        const loaded = await loadModel(modelUrl);
        if ((status as PixiLive2DRendererStatus) === "destroyed") {
          if (app) app.destroy();
          app = null;
          loaded.destroy?.();
          return;
        }
        model = loaded;
        app.stage.addChild(loaded);
        applyPendingParameters();
        status = "ready";
      } catch (err) {
        if (app) {
          try {
            app.destroy();
          } catch (e) {
            void e;
          }
          app = null;
        }
        emitError("MODEL_LOAD_FAILED", err as Error);
      }
    })();
  };

  const onParameterChange = (event: Event) => {
    if (status === "destroyed") return;
    const detail = (event as CustomEvent<RendererParameterChangeEventDetail>).detail;
    // detail.id 는 우리 (snake_case) id 또는 Cubism id — 양쪽 다 시도하지 않고
    // 호출자(element)가 Cubism id 로 보낸다고 가정. 혼용 시 상위 레이어에서 정규화.
    if (model) {
      try {
        model.internalModel.coreModel.setParameterValueById(detail.id, detail.value);
      } catch (e) {
        void e; // Cubism 에 없는 param — silently skip.
      }
    } else {
      pendingParameters.set(detail.id, detail.value);
    }
  };

  const onMotionStart = (event: Event) => {
    if (status === "destroyed" || !model) return;
    const detail = (event as CustomEvent<RendererMotionStartEventDetail>).detail;
    // detail.pack_id 는 우리 wrapper id (mao.mtn_01). Cubism 그룹 이름과 매핑은
    // 상위 레이어가 책임 — 여기선 그대로 motion() 호출.
    model.motion(detail.pack_id).catch((e) => {
      void e; // motion 못 찾으면 silently skip.
    });
  };

  const onExpressionChange = (event: Event) => {
    if (status === "destroyed" || !model) return;
    const detail = (event as CustomEvent<RendererExpressionChangeEventDetail>).detail;
    model.expression(detail.expression_id ?? null).catch((e) => {
      void e;
    });
  };

  opts.element.addEventListener("ready", onReady as EventListener);
  opts.element.addEventListener("parameterchange", onParameterChange as EventListener);
  opts.element.addEventListener("motionstart", onMotionStart as EventListener);
  opts.element.addEventListener("expressionchange", onExpressionChange as EventListener);

  return {
    getStatus() {
      return status;
    },
    getModel() {
      return model;
    },
    setParameter(cubismId, value) {
      if (model) {
        try {
          model.internalModel.coreModel.setParameterValueById(cubismId, value);
        } catch (e) {
          void e;
        }
      } else {
        pendingParameters.set(cubismId, value);
      }
    },
    playMotion(group, index) {
      if (!model) return;
      model.motion(group, index).catch((e) => {
        void e;
      });
    },
    setExpression(idOrIndex) {
      if (!model) return;
      model.expression(idOrIndex ?? null).catch((e) => {
        void e;
      });
    },
    destroy() {
      status = "destroyed";
      opts.element.removeEventListener("ready", onReady as EventListener);
      opts.element.removeEventListener(
        "parameterchange",
        onParameterChange as EventListener,
      );
      opts.element.removeEventListener("motionstart", onMotionStart as EventListener);
      opts.element.removeEventListener(
        "expressionchange",
        onExpressionChange as EventListener,
      );
      if (model) {
        try {
          model.destroy?.();
        } catch (e) {
          void e;
        }
        model = null;
      }
      if (app) {
        try {
          app.destroy();
        } catch (e) {
          void e;
        }
        app = null;
      }
      pendingParameters.clear();
    },
  };
}
