/**
 * `createPixiRenderer` — `<geny-avatar>` 계약의 **실 픽셀 구현체**. ADR 0007 Option E
 * (hybrid) 의 primary 렌더러. `ready` 이벤트로 meta 를 받아 PIXI.Application 에
 * 파츠당 사각형을 grid 배치하고, `parameterchange` (head_angle_*) 로 전체 컨테이너를
 * 회전한다.
 *
 * β 로드맵 P1-S1 — scaffold + 구조 프리뷰 (사각형 그리드). P1-S2 에서 atlas 슬롯
 * 이 populate 되면 실 texture 스프라이트로 교체. 현재 샘플 번들의 atlas.slots 는
 * 비어있으므로 구조 프리뷰만 그린다.
 *
 * ## Dependency injection
 *
 * `createApp` 옵션으로 PIXI.Application 생성을 주입 가능. 기본값은 실 PIXI 를 동적
 * import 해 Application 을 init 하므로, node 단위 테스트에선 `createApp` 를 모킹해
 * WebGL 컨텍스트 요구를 우회한다.
 */

import type {
  Renderer,
  RendererBundleMeta,
  RendererHost,
  RendererParameterChangeEventDetail,
  RendererReadyEventDetail,
} from "@geny/web-avatar-renderer";

export interface PixiRendererOptions {
  readonly element: RendererHost;
  readonly mount: Element;
  /**
   * PIXI.Application 생성 훅. 주입 안 되면 실 PIXI 를 dynamic import.
   * 반환된 handle 은 렌더러가 meta 에 맞춰 `rebuild()` / `setRotation()` 을
   * 호출해 그림을 갱신한다.
   */
  readonly createApp?: CreatePixiApp;
  /**
   * 회전을 드라이브할 파라미터 id. 기본 `head_angle_x`. 값은 degree 단위로 받아
   * radians 로 내부 변환.
   */
  readonly rotationParameter?: string;
  /**
   * 스테이지 배경색. 기본 `0xf7f8fa` (editor bg-page 와 근사).
   */
  readonly backgroundColor?: number;
}

export interface PixiRenderer extends Renderer {
  readonly partCount: number;
  readonly lastMeta: RendererBundleMeta | null;
  readonly lastParameterChange: RendererParameterChangeEventDetail | null;
  readonly readyCount: number;
  readonly parameterChangeCount: number;
  /** 생명 주기 단계 — "idle" | "initializing" | "ready" | "destroyed". */
  readonly stage: PixiRendererStage;
}

export type PixiRendererStage = "idle" | "initializing" | "ready" | "destroyed";

export interface CreatePixiAppOptions {
  readonly mount: Element;
  readonly backgroundColor: number;
}

export type CreatePixiApp = (options: CreatePixiAppOptions) => Promise<PixiAppHandle>;

/**
 * 렌더러가 PIXI.Application 을 조작하는 최소 API. 실 구현(`default-create-app.ts`)
 * 과 테스트 더블(`tests/mocks.ts`) 모두 이 shape 를 만족하면 된다.
 */
export interface PixiAppHandle {
  readonly rebuild: (meta: RendererBundleMeta) => void;
  readonly setRotation: (radians: number) => void;
  readonly destroy: () => void;
}

export function createPixiRenderer(opts: PixiRendererOptions): PixiRenderer {
  const {
    element,
    mount,
    rotationParameter = "head_angle_x",
    backgroundColor = 0xf7f8fa,
  } = opts;
  const createApp: CreatePixiApp = opts.createApp ?? defaultCreateApp;

  let stage: PixiRendererStage = "idle";
  let lastMeta: RendererBundleMeta | null = null;
  let lastParameterChange: RendererParameterChangeEventDetail | null = null;
  let readyCount = 0;
  let parameterChangeCount = 0;
  let app: PixiAppHandle | null = null;
  let destroyed = false;

  function onReady(evt: Event): void {
    const detail = (evt as CustomEvent<RendererReadyEventDetail>).detail;
    if (!detail || !detail.bundle || !detail.bundle.meta) return;
    lastMeta = detail.bundle.meta;
    readyCount += 1;
    applyMeta();
  }

  function onParameterChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererParameterChangeEventDetail>).detail;
    if (!detail || typeof detail.id !== "string" || typeof detail.value !== "number") return;
    lastParameterChange = { id: detail.id, value: detail.value };
    parameterChangeCount += 1;
    if (detail.id === rotationParameter && app) {
      app.setRotation(degToRad(detail.value));
    }
  }

  function applyMeta(): void {
    if (destroyed || !lastMeta) return;
    if (app) {
      app.rebuild(lastMeta);
      return;
    }
    if (stage === "initializing") return;
    stage = "initializing";
    createApp({ mount, backgroundColor }).then(
      (handle) => {
        if (destroyed) {
          handle.destroy();
          return;
        }
        app = handle;
        stage = "ready";
        if (lastMeta) handle.rebuild(lastMeta);
      },
      (err: unknown) => {
        stage = "idle";
        // 구조상 렌더러가 깨져도 `<geny-avatar>` 는 여전히 meta 를 들고 있으므로
        // 호출측이 error 를 관찰할 다른 경로가 있다. 여기선 console.error 로만 남김.
        console.error("[pixi-renderer] failed to init PIXI.Application", err);
      },
    );
  }

  element.addEventListener("ready", onReady);
  element.addEventListener("parameterchange", onParameterChange);

  // late-attach: host 가 이미 bundle 을 갖고 있으면 즉시 meta 반영.
  const existing = element.bundle;
  if (existing && existing.meta) {
    lastMeta = existing.meta;
    readyCount += 1;
    applyMeta();
  }

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener("ready", onReady);
      element.removeEventListener("parameterchange", onParameterChange);
      if (app) {
        app.destroy();
        app = null;
      }
      stage = "destroyed";
    },
    get partCount(): number {
      return lastMeta ? lastMeta.parts.length : 0;
    },
    get lastMeta(): RendererBundleMeta | null {
      return lastMeta;
    },
    get lastParameterChange(): RendererParameterChangeEventDetail | null {
      return lastParameterChange;
    },
    get readyCount(): number {
      return readyCount;
    },
    get parameterChangeCount(): number {
      return parameterChangeCount;
    },
    get stage(): PixiRendererStage {
      return stage;
    },
  };
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * 실 PIXI.Application 생성. dynamic import 로 pixi.js 를 로드 — 번들이 pixi 없이
 * tree-shake 되는 경로를 남기기 위함 (null/logging 렌더러만 쓰는 프로젝트는
 * 본 패키지를 load 하지 않아도 됨).
 */
async function defaultCreateApp(options: CreatePixiAppOptions): Promise<PixiAppHandle> {
  const pixi = await import("pixi.js");
  const app = new pixi.Application();
  await app.init({
    background: options.backgroundColor,
    resizeTo: options.mount as HTMLElement,
    antialias: true,
    autoDensity: true,
    resolution: globalThis.devicePixelRatio || 1,
  });
  const canvas = app.canvas;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  options.mount.appendChild(canvas);

  const root = new pixi.Container();
  app.stage.addChild(root);

  return {
    rebuild(meta) {
      root.removeChildren();
      const count = meta.parts.length;
      if (count === 0) return;
      const cols = Math.ceil(Math.sqrt(count));
      const rows = Math.ceil(count / cols);
      const stageW = app.renderer.width;
      const stageH = app.renderer.height;
      const cellW = stageW / cols;
      const cellH = stageH / rows;
      const padding = Math.min(cellW, cellH) * 0.08;
      for (let i = 0; i < count; i += 1) {
        const part = meta.parts[i];
        if (!part) continue;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = col * cellW + cellW / 2;
        const cy = row * cellH + cellH / 2;
        const g = new pixi.Graphics();
        g.roundRect(
          -cellW / 2 + padding,
          -cellH / 2 + padding,
          cellW - padding * 2,
          cellH - padding * 2,
          6,
        );
        g.fill({ color: hashColor(part.slot_id), alpha: 0.85 });
        g.stroke({ color: 0x2b4a8b, width: 1, alpha: 0.4 });
        g.position.set(cx, cy);
        root.addChild(g);
      }
      // stage 중심 기준 회전을 위해 root 의 pivot 을 canvas 중앙으로.
      root.pivot.set(stageW / 2, stageH / 2);
      root.position.set(stageW / 2, stageH / 2);
    },
    setRotation(radians) {
      root.rotation = radians;
    },
    destroy() {
      app.destroy(true, { children: true, texture: false });
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    },
  };
}

function hashColor(slotId: string): number {
  let h = 2166136261;
  for (let i = 0; i < slotId.length; i += 1) {
    h ^= slotId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = ((h >>> 0) % 360) / 360;
  return hslToHex(hue, 0.45, 0.7);
}

function hslToHex(h: number, s: number, l: number): number {
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hueToRgb(p, q, h + 1 / 3);
  const g = hueToRgb(p, q, h);
  const b = hueToRgb(p, q, h - 1 / 3);
  return (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}
