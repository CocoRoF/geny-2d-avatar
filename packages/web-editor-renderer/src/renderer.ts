/**
 * `@geny/web-editor-renderer` 구조 프리뷰 — 세션 91 Stage 3 kick-off,
 * 세션 92 에서 파츠 선택 ↔ Preview 하이라이트 양방향 바인딩 추가.
 *
 * `<geny-avatar>` 의 `ready` + `parameterchange` 이벤트를 구독해 파츠 메타를
 * SVG 그리드로 투영한다. Cubism/WebGL 실 렌더러는 후속 세션 — 지금은 setter
 * 계약 (세션 90) 위에 수직 슬라이스를 하나 올려 plumbing 을 증명하는 층.
 *
 * docs/01 §8 ("@geny/web-avatar 런타임은 렌더러 의존성 없음") 계약을 보존하기
 * 위해 `@geny/web-avatar` 에 의존하지 않고 duck-typed 인터페이스로 엘리먼트를
 * 받는다 — 테스트에서 실 `<geny-avatar>` 없이도 `EventTarget` 계열이면 드라이
 * 가능.
 *
 * 세션 114 — duck-typed 인터페이스(Renderer*) 는 `@geny/web-avatar-renderer` 로
 * 승격 분리. 본 파일은 첫 구현체로 그 계약을 소비한다. ADR 0007 의 어느 렌더러
 * 경로(PixiJS / 자체 WebGL2 / 하이브리드) 로 확정되어도 인터페이스는 불변.
 */

import type {
  RendererBundleMeta,
  RendererHost,
  RendererParameterChangeEventDetail,
  RendererPart,
  RendererReadyEventDetail,
} from "@geny/web-avatar-renderer";

export type {
  RendererBundleMeta,
  RendererHost,
  RendererParameterChangeEventDetail,
  RendererPart,
  RendererReadyEventDetail,
};

export interface StructureRendererOptions {
  /** `<geny-avatar>` 또는 duck-typed EventTarget — `ready` + `parameterchange` 구독원. */
  readonly element: RendererHost;
  /** SVG 를 주입할 컨테이너 (보통 `.stage-inner`). */
  readonly mount: Element;
  /**
   * parameterchange 시 root group 에 `rotate(° ...)` 를 적용할 파라미터 id.
   * 미지정 시 자동 선택 (id 에 "angle" 포함된 첫 파라미터).
   */
  readonly rotationParameter?: string;
  /**
   * 사용자가 SVG `<rect>` 를 클릭해 선택이 바뀔 때 호출되는 콜백 (세션 92).
   * 같은 슬롯을 두 번 클릭하면 선택이 해제되고 `null` 로 호출된다.
   * 에디터 쪽 사이드바와 Preview 의 선택 상태를 동기하는 훅.
   */
  readonly onSelectPart?: (part: RendererPart | null) => void;
}

export interface StructureRenderer {
  /**
   * 이벤트 리스너 제거 + mount DOM 비우기. 호출 후 renderer 는 재사용 불가.
   */
  destroy(): void;
  /**
   * 마지막 build 호출 후 렌더된 part 수 (테스트 가시성용).
   */
  readonly partCount: number;
  /**
   * 현재 root group 에 적용된 rotation 각도 (degrees). 아직 parameterchange 없으면 0.
   */
  readonly rotationDeg: number;
  /**
   * 현재 선택된 파츠의 slot_id. 선택 없음이면 `null` (세션 92).
   */
  readonly selectedSlotId: string | null;
  /**
   * 프로그래매틱 선택 API (사이드바 → Preview 방향). 매칭되는 `<rect>` 가
   * 하이라이트되고, 없는 slot_id 는 무시. `null` 은 선택 해제.
   * `onSelectPart` 콜백은 **호출되지 않는다** — 외부 소스가 이미 상태를
   * 알고 있으므로 echo-back 루프를 방지.
   */
  setSelectedSlot(slotId: string | null): void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_W = 400;
const VIEWBOX_H = 500;
const COLUMN_COUNT = 5;
const CELL_W = VIEWBOX_W / COLUMN_COUNT;

const RECT_STROKE_DEFAULT = "#2b4a8b";
const RECT_STROKE_WIDTH_DEFAULT = "0.5";
const RECT_FILL_DEFAULT = "#eef4ff";
const RECT_STROKE_SELECTED = "#ff7a00";
const RECT_STROKE_WIDTH_SELECTED = "2";
const RECT_FILL_SELECTED = "#fff1e0";

export function createStructureRenderer(opts: StructureRendererOptions): StructureRenderer {
  const { element, mount } = opts;
  const doc = mount.ownerDocument;
  if (!doc) {
    throw new Error("createStructureRenderer: mount must be attached to a document");
  }

  let partCount = 0;
  let rotationDeg = 0;
  let rotationParameterId: string | null = opts.rotationParameter ?? null;
  let rootGroup: SVGGElement | null = null;
  let selectedSlotId: string | null = null;
  let partsBySlot: Map<string, RendererPart> = new Map();
  let rectsBySlot: Map<string, SVGRectElement> = new Map();
  const onSelectPart = opts.onSelectPart;

  const svg = doc.createElementNS(SVG_NS, "svg") as SVGSVGElement;
  svg.setAttribute("viewBox", `0 0 ${VIEWBOX_W} ${VIEWBOX_H}`);
  svg.setAttribute("width", "100%");
  svg.setAttribute("height", "100%");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Avatar structure preview");
  svg.dataset.testid = "structure-preview";
  mount.appendChild(svg);

  function build(meta: RendererBundleMeta): void {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const g = doc.createElementNS(SVG_NS, "g") as SVGGElement;
    g.dataset.testid = "structure-root";
    svg.appendChild(g);
    rootGroup = g;

    partsBySlot = new Map();
    rectsBySlot = new Map();
    selectedSlotId = null;

    partCount = meta.parts.length;
    meta.parts.forEach((p, i) => {
      const col = i % COLUMN_COUNT;
      const row = Math.floor(i / COLUMN_COUNT);
      const x = col * CELL_W + 4;
      const y = row * 30 + 20;
      const rect = doc.createElementNS(SVG_NS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(CELL_W - 8));
      rect.setAttribute("height", "22");
      rect.setAttribute("rx", "3");
      rect.setAttribute("fill", RECT_FILL_DEFAULT);
      rect.setAttribute("stroke", RECT_STROKE_DEFAULT);
      rect.setAttribute("stroke-width", RECT_STROKE_WIDTH_DEFAULT);
      rect.dataset.slotId = p.slot_id;
      rect.dataset.role = p.role;
      rect.style.cursor = "pointer";
      rect.addEventListener("click", () => onRectClick(p.slot_id));
      g.appendChild(rect);
      partsBySlot.set(p.slot_id, p);
      rectsBySlot.set(p.slot_id, rect);

      const text = doc.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(x + (CELL_W - 8) / 2));
      text.setAttribute("y", String(y + 15));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "8");
      text.setAttribute("font-family", "system-ui, sans-serif");
      text.setAttribute("fill", "#2b4a8b");
      text.style.pointerEvents = "none";
      text.textContent = p.role;
      g.appendChild(text);
    });

    // rotationParameter 자동 선택: id 에 "angle" 포함된 첫 파라미터.
    if (!rotationParameterId) {
      const candidate = meta.parameters.find((p) => p.id.includes("angle"));
      rotationParameterId = candidate ? candidate.id : null;
    }
    rotationDeg = 0;
    applyRotation();
  }

  function applySelectionStyle(rect: SVGRectElement, selected: boolean): void {
    if (selected) {
      rect.setAttribute("fill", RECT_FILL_SELECTED);
      rect.setAttribute("stroke", RECT_STROKE_SELECTED);
      rect.setAttribute("stroke-width", RECT_STROKE_WIDTH_SELECTED);
      rect.dataset.selected = "true";
    } else {
      rect.setAttribute("fill", RECT_FILL_DEFAULT);
      rect.setAttribute("stroke", RECT_STROKE_DEFAULT);
      rect.setAttribute("stroke-width", RECT_STROKE_WIDTH_DEFAULT);
      delete rect.dataset.selected;
    }
  }

  function updateSelection(nextSlotId: string | null): void {
    if (selectedSlotId === nextSlotId) return;
    if (selectedSlotId) {
      const prevRect = rectsBySlot.get(selectedSlotId);
      if (prevRect) applySelectionStyle(prevRect, false);
    }
    selectedSlotId = nextSlotId;
    if (nextSlotId) {
      const nextRect = rectsBySlot.get(nextSlotId);
      if (nextRect) applySelectionStyle(nextRect, true);
    }
  }

  function onRectClick(slotId: string): void {
    // 같은 slot 재클릭 → 선택 해제.
    const next = selectedSlotId === slotId ? null : slotId;
    updateSelection(next);
    if (onSelectPart) {
      onSelectPart(next ? partsBySlot.get(next) ?? null : null);
    }
  }

  function applyRotation(): void {
    if (!rootGroup) return;
    rootGroup.setAttribute(
      "transform",
      `rotate(${rotationDeg} ${VIEWBOX_W / 2} ${VIEWBOX_H / 2})`,
    );
  }

  function onReady(evt: Event): void {
    const detail = (evt as CustomEvent<RendererReadyEventDetail>).detail;
    if (!detail || !detail.bundle || !detail.bundle.meta) return;
    build(detail.bundle.meta);
  }

  function onParameterChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererParameterChangeEventDetail>).detail;
    if (!detail || !rotationParameterId) return;
    if (detail.id !== rotationParameterId) return;
    rotationDeg = detail.value;
    applyRotation();
  }

  element.addEventListener("ready", onReady);
  element.addEventListener("parameterchange", onParameterChange);

  // 이미 bundle 이 로드돼 있으면 즉시 build (renderer 가 ready 이벤트 뒤에 붙은 경우).
  const existing = element.bundle;
  if (existing && existing.meta) build(existing.meta);

  return {
    destroy(): void {
      element.removeEventListener("ready", onReady);
      element.removeEventListener("parameterchange", onParameterChange);
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      if (svg.parentNode) svg.parentNode.removeChild(svg);
      rootGroup = null;
      partsBySlot.clear();
      rectsBySlot.clear();
      selectedSlotId = null;
    },
    get partCount(): number {
      return partCount;
    },
    get rotationDeg(): number {
      return rotationDeg;
    },
    get selectedSlotId(): string | null {
      return selectedSlotId;
    },
    setSelectedSlot(slotId: string | null): void {
      if (slotId !== null && !rectsBySlot.has(slotId)) return;
      updateSelection(slotId);
    },
  };
}
