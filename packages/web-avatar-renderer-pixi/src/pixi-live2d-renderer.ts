/**
 * createPixiLive2DRenderer - ADR 001 decision 실 구현체.
 *
 * createPixiRenderer 가 파츠 grid 기반 구조 프리뷰라면, 본 렌더러는
 * pixi-live2d-display-advanced 를 래핑해 실 .moc3 drawable 렌더.
 *
 * ## 런타임 선행 조건
 *
 * - 전역에 window.Live2DCubismCore 로드되어야 함 (ADR 002)
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
 * 커스텀 resolver 를 주입할 수 있으므로 CDN 호스팅 등 다른 레이아웃도 지원.
 *
 * ## 테스트 전략
 *
 * - 브라우저 WebGL 필수 → Node 단위 테스트는 계약만 검증 (클래스 존재, 메서드 시그니처).
 * - 실 렌더 검증은 apps/web-preview Playwright E2E 로 (P1.E).
 *
 * ## 상태
 *
 * skeleton (P1.D) - 타입 확정 + 메서드 골격. 실 loadBundle / setParameter 내부는
 * P1.E 착수 시 pixi-live2d-display-advanced API 에 맞춰 구현.
 */

import type {
  Renderer,
  RendererReadyEventDetail,
  RendererHost,
} from "@geny/web-avatar-renderer";

export interface PixiLive2DRendererOptions {
  readonly element: RendererHost;
  readonly mount: Element;
  /**
   * Cubism Core 가 전역에 로드됐는지 확인. 기본은 window.Live2DCubismCore 존재 여부.
   * 테스트에서 주입 가능.
   */
  readonly hasCubismCore?: () => boolean;
  /**
   * 모델 로드 URL 해석 훅. ready 이벤트의 detail 전체를 받아 model3.json 절대 URL 반환.
   * 기본 resolver 는 detail.bundle.bundleUrl 을 기반으로 옆 디렉토리 runtime_assets 추정.
   */
  readonly resolveModelUrl?: (detail: RendererReadyEventDetail) => string;
}

export type PixiLive2DRendererStatus = "before-ready" | "loading" | "ready" | "error" | "destroyed";

export interface PixiLive2DRendererHandle extends Renderer {
  readonly getStatus: () => PixiLive2DRendererStatus;
  /**
   * Live2D parameter 값 주입. parameter id 는 Cubism 네이티브 (ParamAngleX 등).
   * 우리 프리셋의 snake_case id 로 넘기면 cubism_mapping 을 통해 변환 예정 (P1.E).
   */
  readonly setParameter: (id: string, value: number) => void;
  readonly playMotion: (packId: string) => void;
  readonly setExpression: (id: string | null) => void;
}

/**
 * 기본 model3.json URL resolver - bundleUrl 옆 runtime_assets/ 하위에서 .model3.json 찾음.
 * 3rd-party 프리셋 경로 규약: <root>/<slug>/<version>/bundle.json
 * → <root>/<slug>/<version>/runtime_assets/<slug>.model3.json
 * 간단 경로 규약: <root>/<slug>/bundle.json
 * → <root>/<slug>/runtime_assets/<slug>.model3.json
 */
export function defaultResolveModelUrl(detail: RendererReadyEventDetail): string {
  const bundleUrl = detail.bundle.bundleUrl;
  if (!bundleUrl) {
    throw new Error(
      "[pixi-live2d-renderer] bundleUrl missing in ready event - " +
        "provide custom resolveModelUrl or ensure <geny-avatar> emits bundleUrl.",
    );
  }
  // Query string 제거 후 분리.
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
  // 마지막 세그먼트가 버전 (vX.Y.Z) 패턴이면 그 앞이 slug, 아니면 마지막이 slug.
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

/**
 * 생성자. 실 Live2DModel.from(url) 로드는 ready 이벤트 수신 시 수행.
 * P1.D 는 skeleton - 실 구현은 P1.E.
 */
export function createPixiLive2DRenderer(
  opts: PixiLive2DRendererOptions,
): PixiLive2DRendererHandle {
  const hasCore =
    opts.hasCubismCore ??
    (() =>
      typeof globalThis !== "undefined" &&
      typeof (globalThis as { Live2DCubismCore?: unknown }).Live2DCubismCore !== "undefined");
  const resolver = opts.resolveModelUrl ?? defaultResolveModelUrl;

  let status: PixiLive2DRendererStatus = "before-ready";

  const onReady = (event: Event) => {
    if (status === "destroyed") return;
    if (!hasCore()) {
      status = "error";
      const err = new Error(
        "[pixi-live2d-renderer] window.Live2DCubismCore not loaded. " +
          "앱 index.html 에 script 태그로 /vendor/live2dcubismcore.min.js 선행 + " +
          "scripts/setup-cubism-core.mjs 실행 확인 (ADR 002).",
      );
      opts.element.dispatchEvent(
        new CustomEvent("error", { detail: { error: err, code: "CUBISM_CORE_MISSING" } }),
      );
      return;
    }
    status = "loading";
    const detail = (event as CustomEvent<RendererReadyEventDetail>).detail;
    let modelUrl: string;
    try {
      modelUrl = resolver(detail);
    } catch (err) {
      status = "error";
      opts.element.dispatchEvent(
        new CustomEvent("error", {
          detail: { error: err as Error, code: "RESOLVE_MODEL_URL_FAILED" },
        }),
      );
      return;
    }
    // P1.E: 여기서 Live2DModel.from(modelUrl) → app.stage.addChild(model).
    //       현재는 skeleton 으로 URL 만 해결해 이벤트 드라이버 확인.
    void modelUrl;
    status = "ready";
  };

  opts.element.addEventListener("ready", onReady as EventListener);

  const handle: PixiLive2DRendererHandle = {
    getStatus() {
      return status;
    },
    setParameter(_id, _value) {
      throw new Error("[pixi-live2d-renderer] setParameter not implemented yet (P1.E)");
    },
    playMotion(_packId) {
      throw new Error("[pixi-live2d-renderer] playMotion not implemented yet (P1.E)");
    },
    setExpression(_id) {
      throw new Error("[pixi-live2d-renderer] setExpression not implemented yet (P1.E)");
    },
    destroy() {
      status = "destroyed";
      opts.element.removeEventListener("ready", onReady as EventListener);
    },
  };

  return handle;
}
