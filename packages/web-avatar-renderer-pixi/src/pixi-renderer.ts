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
  RendererAtlas,
  RendererBundleMeta,
  RendererExpression,
  RendererExpressionChangeEventDetail,
  RendererHost,
  RendererMotion,
  RendererMotionStartEventDetail,
  RendererParameterChangeEventDetail,
  RendererReadyEventDetail,
} from "@geny/web-avatar-renderer";
import { atlasUvToFrame } from "./atlas-uv.js";

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
  readonly lastAtlas: RendererAtlas | null;
  readonly lastTextureUrl: string | null;
  readonly lastParameterChange: RendererParameterChangeEventDetail | null;
  readonly lastMotion: RendererMotion | null;
  readonly lastExpression: RendererExpression | null;
  readonly readyCount: number;
  readonly parameterChangeCount: number;
  readonly motionStartCount: number;
  readonly expressionChangeCount: number;
  /** 생명 주기 단계 — "idle" | "initializing" | "ready" | "destroyed". */
  readonly stage: PixiRendererStage;
  /**
   * 현재 meta 는 유지한 채 atlas/textureUrl 만 교체해 재-rebuild (β P2-S1 live swap).
   * Prompt → Mock texture 경로가 새 blob URL 을 넘겨줄 때 사용. host 에 ready 를 재-디스패치
   * 하지 않으므로 parameter 상태는 초기화되지 않는다.
   */
  readonly regenerate: (input: RegenerateInput) => void;
}

export interface RegenerateInput {
  readonly atlas?: RendererAtlas | null;
  readonly textureUrl?: string | null;
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
 *
 * `rebuild` 의 `scene` 은 β P1-S2 에서 확장 — atlas slots 가 있으면 실 texture 스프라이트,
 * 없으면 fallback 색상 사각형 grid.
 */
export interface PixiAppHandle {
  readonly rebuild: (scene: PixiSceneInput) => void;
  readonly setRotation: (radians: number) => void;
  /**
   * motion pack 이 시작되면 호출 (β P1-S3). `null` 은 현재 motion 해제 의미.
   * loop=true 인 motion 은 subtle idle breath (sine scale.y) 를 ticker 에 걸고,
   * loop=false 는 현재 fade 기간만 적용 후 자동 해제 (Mock — 실 curve 는 β P3+).
   */
  readonly setMotion: (motion: RendererMotion | null) => void;
  /**
   * expression 이 바뀌면 호출 (β P1-S3). `null` 은 neutral resting state.
   * 실 parameter delta 블렌딩은 β P3+ 실 expression asset 합류 시점. 현재는
   * stage.alpha 를 미세하게 건드려 "표정이 바뀌었음" 을 시각적으로 알리는 Mock.
   */
  readonly setExpression: (expression: RendererExpression | null) => void;
  /**
   * 슬롯 단위 변환 적용 (β P1-S4). parameter_ids 를 가진 파츠에만 per-part
   * rotation/offset 을 줄 때 호출. 축 미제공 필드는 이전 값 유지.
   */
  readonly setPartTransform: (slot_id: string, transform: PixiPartTransform) => void;
  readonly destroy: () => void;
}

/**
 * slot 에 적용할 per-part 변환 축 (β P1-S4). 모든 필드 optional — 일부만 바뀔 때
 * 나머지는 이전 값 유지. 실 Cubism 의 warp/rotation 디포머의 최소 Mock 대응.
 */
export interface PixiPartTransform {
  readonly rotation?: number; // radians
  readonly offsetX?: number;
  readonly offsetY?: number;
}

/**
 * PIXI 앱이 그려야 할 장면의 소스 — meta (파츠 열거) + 선택적으로 atlas + texture URL.
 * atlas + textureUrl 이 모두 있으면 실 PIXI.Sprite 경로, 아니면 구조 프리뷰 grid.
 */
export interface PixiSceneInput {
  readonly meta: RendererBundleMeta;
  readonly atlas?: RendererAtlas | null;
  readonly textureUrl?: string | null;
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
  let lastAtlas: RendererAtlas | null = null;
  let lastTextureUrl: string | null = null;
  let lastParameterChange: RendererParameterChangeEventDetail | null = null;
  let lastMotion: RendererMotion | null = null;
  let lastExpression: RendererExpression | null = null;
  let readyCount = 0;
  let parameterChangeCount = 0;
  let motionStartCount = 0;
  let expressionChangeCount = 0;
  let app: PixiAppHandle | null = null;
  let destroyed = false;
  // β P1-S4: parameter_id → 바인드된 slot_id 역색인. `lastMeta` 바뀔 때 재구성.
  let paramToSlots: Map<string, string[]> = new Map();

  function captureBundle(bundle: {
    meta: RendererBundleMeta;
    atlas?: RendererAtlas | null;
    bundleUrl?: string;
  }): void {
    lastMeta = bundle.meta;
    lastAtlas = bundle.atlas ?? null;
    lastTextureUrl = resolveTextureUrl(bundle.atlas ?? null, bundle.bundleUrl);
    paramToSlots = buildParamToSlots(bundle.meta);
  }

  function onReady(evt: Event): void {
    const detail = (evt as CustomEvent<RendererReadyEventDetail>).detail;
    if (!detail || !detail.bundle || !detail.bundle.meta) return;
    captureBundle(detail.bundle);
    readyCount += 1;
    applyMeta();
  }

  function onParameterChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererParameterChangeEventDetail>).detail;
    if (!detail || typeof detail.id !== "string" || typeof detail.value !== "number") return;
    lastParameterChange = { id: detail.id, value: detail.value };
    parameterChangeCount += 1;
    const boundSlots = paramToSlots.get(detail.id);
    if (boundSlots && boundSlots.length > 0 && app) {
      const transform = transformFromParameter(detail.id, detail.value);
      if (transform) {
        for (const slotId of boundSlots) {
          app.setPartTransform(slotId, transform);
        }
      }
      return;
    }
    // 바인드된 파츠가 없으면 root 레벨 rotationParameter fallback 유지 — demo 편의.
    if (detail.id === rotationParameter && app) {
      app.setRotation(degToRad(detail.value));
    }
  }

  function onMotionStart(evt: Event): void {
    const detail = (evt as CustomEvent<RendererMotionStartEventDetail>).detail;
    if (!detail || typeof detail.pack_id !== "string" || !detail.motion) return;
    const motion = detail.motion;
    if (
      typeof motion.pack_id !== "string" ||
      typeof motion.duration_sec !== "number" ||
      typeof motion.fade_in_sec !== "number" ||
      typeof motion.fade_out_sec !== "number" ||
      typeof motion.loop !== "boolean"
    ) {
      return;
    }
    lastMotion = {
      pack_id: motion.pack_id,
      duration_sec: motion.duration_sec,
      fade_in_sec: motion.fade_in_sec,
      fade_out_sec: motion.fade_out_sec,
      loop: motion.loop,
    };
    motionStartCount += 1;
    if (app) app.setMotion(lastMotion);
  }

  function onExpressionChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererExpressionChangeEventDetail>).detail;
    if (!detail) return;
    if (detail.expression_id === null) {
      lastExpression = null;
      expressionChangeCount += 1;
      if (app) app.setExpression(null);
      return;
    }
    const expression = detail.expression;
    if (
      !expression ||
      typeof expression.expression_id !== "string" ||
      typeof expression.name_en !== "string" ||
      typeof expression.fade_in_sec !== "number" ||
      typeof expression.fade_out_sec !== "number"
    ) {
      return;
    }
    lastExpression = {
      expression_id: expression.expression_id,
      name_en: expression.name_en,
      fade_in_sec: expression.fade_in_sec,
      fade_out_sec: expression.fade_out_sec,
    };
    expressionChangeCount += 1;
    if (app) app.setExpression(lastExpression);
  }

  function applyMeta(): void {
    if (destroyed || !lastMeta) return;
    if (app) {
      app.rebuild(currentScene(lastMeta));
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
        if (lastMeta) handle.rebuild(currentScene(lastMeta));
        // app 이 createApp 완료 전에 발생한 motion/expression 을 놓치지 않도록
        // 마지막 상태를 재생.
        if (lastMotion) handle.setMotion(lastMotion);
        if (lastExpression) handle.setExpression(lastExpression);
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
  element.addEventListener("motionstart", onMotionStart);
  element.addEventListener("expressionchange", onExpressionChange);

  // late-attach: host 가 이미 bundle 을 갖고 있으면 즉시 meta 반영.
  const existing = element.bundle;
  if (existing && existing.meta) {
    captureBundle(existing);
    readyCount += 1;
    applyMeta();
  }

  function currentScene(meta: RendererBundleMeta): PixiSceneInput {
    return { meta, atlas: lastAtlas, textureUrl: lastTextureUrl };
  }

  return {
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      element.removeEventListener("ready", onReady);
      element.removeEventListener("parameterchange", onParameterChange);
      element.removeEventListener("motionstart", onMotionStart);
      element.removeEventListener("expressionchange", onExpressionChange);
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
    get lastAtlas(): RendererAtlas | null {
      return lastAtlas;
    },
    get lastTextureUrl(): string | null {
      return lastTextureUrl;
    },
    get lastParameterChange(): RendererParameterChangeEventDetail | null {
      return lastParameterChange;
    },
    get lastMotion(): RendererMotion | null {
      return lastMotion;
    },
    get lastExpression(): RendererExpression | null {
      return lastExpression;
    },
    get readyCount(): number {
      return readyCount;
    },
    get parameterChangeCount(): number {
      return parameterChangeCount;
    },
    get motionStartCount(): number {
      return motionStartCount;
    },
    get expressionChangeCount(): number {
      return expressionChangeCount;
    },
    get stage(): PixiRendererStage {
      return stage;
    },
    regenerate(input: RegenerateInput): void {
      if (destroyed) return;
      if (input.atlas !== undefined) lastAtlas = input.atlas ?? null;
      if (input.textureUrl !== undefined) lastTextureUrl = input.textureUrl ?? null;
      if (!lastMeta) return;
      applyMeta();
    },
  };
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * parts 역색인 — parameter_id → 바인드된 slot_id[]. 순서 보존 (Map iteration 순).
 * parameter_ids 가 없거나 빈 파츠는 색인 미포함.
 */
function buildParamToSlots(meta: RendererBundleMeta): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const part of meta.parts) {
    const ids = part.parameter_ids;
    if (!ids || ids.length === 0) continue;
    for (const pid of ids) {
      let list = map.get(pid);
      if (!list) {
        list = [];
        map.set(pid, list);
      }
      list.push(part.slot_id);
    }
  }
  return map;
}

/**
 * parameter id 이름을 휴리스틱으로 분류해 (β P1-S4) per-part 변환 축을 계산.
 * - `*_angle_*` / `*_angle` → rotation (degrees) — 2D Z-axis 기준.
 * - `*_sway*` / `*_shake*` → offsetY (정규화 [-1, 1] * 12px).
 * - `*_offset_x*` → offsetX (정규화 * 12px).
 * - 그 외 → null (명시적 매핑이 생기기 전까지는 per-part 반영 보류).
 *
 * 실 Cubism 디포머는 parameter_id → deformer_id → 축이 데이터 기반 매핑이지만,
 * β 단계에서 그 메타는 번들에 실리지 않아 이름 기반 휴리스틱으로 대체. 실 asset
 * 합류 시점(β P3+) 에 데이터 기반 매핑으로 교체.
 */
function transformFromParameter(id: string, value: number): PixiPartTransform | null {
  if (id.includes("angle")) {
    return { rotation: degToRad(value) };
  }
  if (id.includes("sway") || id.includes("shake")) {
    return { offsetY: value * 12 };
  }
  if (id.includes("offset_x") || id.includes("position_x")) {
    return { offsetX: value * 12 };
  }
  return null;
}

/**
 * atlas.textures[0].path + bundleUrl → 절대 텍스처 URL. atlas 가 없거나 텍스처 항목이
 * 없거나 bundleUrl 이 빠지면 null. 다수 텍스처는 현재 지원 안 함 (β 는 single-sheet).
 */
function resolveTextureUrl(
  atlas: RendererAtlas | null,
  bundleUrl: string | undefined,
): string | null {
  if (!atlas || atlas.textures.length === 0 || !bundleUrl) return null;
  const first = atlas.textures[0];
  if (!first) return null;
  try {
    return new URL(first.path, bundleUrl).toString();
  } catch {
    return null;
  }
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

  let baseTexture: { readonly texture: unknown; readonly source: string } | null = null;

  // β P1-S4: per-part display object 색인. rebuild 마다 재생성. 각 entry 는 baseline
  // 좌표 (rotation=0, offset=0 기준) 를 들고 있어 setPartTransform 호출 시 delta 를
  // 적용할 수 있다.
  type PartEntry = {
    readonly obj: { position: { set: (x: number, y: number) => void }; rotation: number };
    readonly baseX: number;
    readonly baseY: number;
  };
  const partEntries = new Map<string, PartEntry>();

  async function loadTexture(url: string): Promise<unknown | null> {
    if (baseTexture && baseTexture.source === url) return baseTexture.texture;
    try {
      const tex = await pixi.Assets.load(url);
      baseTexture = { texture: tex, source: url };
      return tex;
    } catch (err) {
      console.warn("[pixi-renderer] failed to load texture", url, err);
      return null;
    }
  }

  function buildSpriteScene(
    scene: PixiSceneInput,
    texture: unknown,
    stageW: number,
    stageH: number,
  ): boolean {
    const atlas = scene.atlas;
    if (!atlas || atlas.slots.length === 0 || atlas.textures.length === 0) return false;
    const primary = atlas.textures[0];
    if (!primary) return false;
    const textureSize = { width: primary.width, height: primary.height };
    const slotById = new Map(atlas.slots.map((s) => [s.slot_id, s] as const));

    // atlas.textures[0] 기준 canvas → stage 매핑 — 가장 긴 변을 stage 90% 에 맞추고
    // aspect 유지. pivot 은 canvas 중앙.
    const canvasW = primary.width;
    const canvasH = primary.height;
    const fit = Math.min((stageW * 0.9) / canvasW, (stageH * 0.9) / canvasH);
    const originX = stageW / 2 - (canvasW * fit) / 2;
    const originY = stageH / 2 - (canvasH * fit) / 2;

    let drawn = 0;
    for (const part of scene.meta.parts) {
      const slot = slotById.get(part.slot_id);
      if (!slot) continue;
      const frame = atlasUvToFrame({ uv: slot.uv }, textureSize);
      // PIXI v8: new Texture({ source, frame }) — source 는 TextureSource, frame 은 Rectangle.
      // `texture` 는 Assets.load 결과로 실제 pixi.Texture 이므로 `.source` 가 TextureSource.
      const baseSource = (texture as { source: import("pixi.js").TextureSource }).source;
      const partTexture = new pixi.Texture({
        source: baseSource,
        frame: new pixi.Rectangle(frame.x, frame.y, frame.width, frame.height),
      });
      const sprite = new pixi.Sprite(partTexture);
      const spriteX = originX + frame.x * fit;
      const spriteY = originY + frame.y * fit;
      sprite.position.set(spriteX, spriteY);
      sprite.width = frame.width * fit;
      sprite.height = frame.height * fit;
      root.addChild(sprite);
      partEntries.set(part.slot_id, { obj: sprite, baseX: spriteX, baseY: spriteY });
      drawn += 1;
    }
    return drawn > 0;
  }

  function buildFallbackScene(meta: RendererBundleMeta, stageW: number, stageH: number): void {
    const count = meta.parts.length;
    if (count === 0) return;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
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
      partEntries.set(part.slot_id, { obj: g, baseX: cx, baseY: cy });
    }
  }

  // β P1-S3: idle breath. motion.loop=true 면 ticker 에 sine scale.y 를 건다.
  // 진폭 4% / 주기 = motion.duration_sec (fallback 4s). fade_in 동안 진폭이 0→max 로,
  // fade_out (해제 시) 에서 max→0 로 선형 램프. 실 motion3 curve 는 β P3+ 에서 대체.
  let breathMotion: RendererMotion | null = null;
  let breathElapsedMs = 0;
  let breathRampMs = 0;
  let breathRampDurationMs = 0;
  let breathRampDirection: "in" | "out" = "in";
  let breathRampFactor = 0; // 0 ~ 1
  const tickerCallback = (opts: { deltaMS?: number }): void => {
    const dt = typeof opts.deltaMS === "number" ? opts.deltaMS : 16.6667;
    if (breathRampDurationMs > 0) {
      breathRampMs += dt;
      const t = Math.min(1, breathRampMs / breathRampDurationMs);
      breathRampFactor = breathRampDirection === "in" ? t : 1 - t;
      if (t >= 1) {
        breathRampDurationMs = 0;
        breathRampFactor = breathRampDirection === "in" ? 1 : 0;
        if (breathRampDirection === "out") {
          // fade_out 완료 — ticker 를 끄고 scale 복귀.
          app.ticker.remove(tickerCallback);
          root.scale.set(1, 1);
          breathMotion = null;
          return;
        }
      }
    }
    if (!breathMotion) return;
    breathElapsedMs += dt;
    const periodMs = Math.max(500, breathMotion.duration_sec * 1000);
    const phase = (breathElapsedMs / periodMs) * Math.PI * 2;
    const amplitude = 0.04 * breathRampFactor;
    const sy = 1 + Math.sin(phase) * amplitude;
    root.scale.set(1, sy);
  };

  return {
    rebuild(scene) {
      root.removeChildren();
      partEntries.clear();
      const stageW = app.renderer.width;
      const stageH = app.renderer.height;
      // stage 중심 기준 회전.
      root.pivot.set(stageW / 2, stageH / 2);
      root.position.set(stageW / 2, stageH / 2);
      if (scene.textureUrl && scene.atlas && scene.atlas.slots.length > 0) {
        const url = scene.textureUrl;
        // 비동기 — fire-and-forget. 로드 실패 시 fallback grid 로 교체.
        loadTexture(url).then((texture) => {
          if (!texture) {
            buildFallbackScene(scene.meta, stageW, stageH);
            return;
          }
          const ok = buildSpriteScene(scene, texture, stageW, stageH);
          if (!ok) buildFallbackScene(scene.meta, stageW, stageH);
        });
        return;
      }
      buildFallbackScene(scene.meta, stageW, stageH);
    },
    setRotation(radians) {
      root.rotation = radians;
    },
    setPartTransform(slot_id, transform) {
      const entry = partEntries.get(slot_id);
      if (!entry) return;
      if (transform.rotation !== undefined) entry.obj.rotation = transform.rotation;
      const dx = transform.offsetX ?? 0;
      const dy = transform.offsetY ?? 0;
      entry.obj.position.set(entry.baseX + dx, entry.baseY + dy);
    },
    setMotion(motion) {
      if (motion === null) {
        if (!breathMotion) return;
        breathRampDirection = "out";
        breathRampMs = 0;
        breathRampDurationMs = Math.max(0, (breathMotion.fade_out_sec || 0) * 1000);
        if (breathRampDurationMs === 0) {
          app.ticker.remove(tickerCallback);
          root.scale.set(1, 1);
          breathMotion = null;
          breathRampFactor = 0;
        }
        return;
      }
      if (!motion.loop) {
        // loop=false motion 은 idle breath 로 잡지 않음 — one-shot 은 실 curve
        // 가 있어야 의미 있으므로 β P3+ 에서 처리.
        return;
      }
      if (!breathMotion) {
        app.ticker.add(tickerCallback);
      }
      breathMotion = motion;
      breathElapsedMs = 0;
      breathRampDirection = "in";
      breathRampMs = 0;
      breathRampDurationMs = Math.max(0, (motion.fade_in_sec || 0) * 1000);
      breathRampFactor = breathRampDurationMs === 0 ? 1 : 0;
    },
    setExpression(expression) {
      // Mock: 표정 변경 시 stage alpha 를 잠깐 낮췄다가 복귀시켜 "표정이 전환됐음"
      // 을 시각적으로 알림. 실 parameter delta 합성은 β P3+ 실 expression asset
      // 합류 시점.
      const fadeIn = expression ? expression.fade_in_sec : 0.15;
      const targetAlpha = expression ? 1 : 0.95;
      let elapsed = 0;
      const duration = Math.max(60, fadeIn * 1000);
      const startAlpha = root.alpha;
      const blinkCallback = (o: { deltaMS?: number }): void => {
        const dt = typeof o.deltaMS === "number" ? o.deltaMS : 16.6667;
        elapsed += dt;
        const t = Math.min(1, elapsed / duration);
        root.alpha = startAlpha + (targetAlpha - startAlpha) * t;
        if (t >= 1) app.ticker.remove(blinkCallback);
      };
      app.ticker.add(blinkCallback);
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
