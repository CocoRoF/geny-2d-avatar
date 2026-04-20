/**
 * `@geny/web-editor-renderer` 구조 프리뷰 — 세션 91 Stage 3 kick-off.
 *
 * `<geny-avatar>` 의 `ready` + `parameterchange` 이벤트를 구독해 파츠 메타를
 * SVG 그리드로 투영한다. Cubism/WebGL 실 렌더러는 후속 세션 — 지금은 setter
 * 계약 (세션 90) 위에 수직 슬라이스를 하나 올려 plumbing 을 증명하는 층.
 *
 * docs/01 §8 ("@geny/web-avatar 런타임은 렌더러 의존성 없음") 계약을 보존하기
 * 위해 `@geny/web-avatar` 에 의존하지 않고 duck-typed 인터페이스로 엘리먼트를
 * 받는다 — 테스트에서 실 `<geny-avatar>` 없이도 `EventTarget` 계열이면 드라이
 * 가능.
 */

export interface RendererPart {
  readonly role: string;
  readonly slot_id: string;
}

export interface RendererBundleMeta {
  readonly parts: readonly RendererPart[];
  readonly parameters: readonly { id: string; range: readonly [number, number]; default: number }[];
}

export interface RendererReadyEventDetail {
  readonly bundle: { readonly meta: RendererBundleMeta };
}

export interface RendererParameterChangeEventDetail {
  readonly id: string;
  readonly value: number;
}

export interface RendererHost extends EventTarget {
  readonly bundle?: { readonly meta: RendererBundleMeta } | null;
}

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
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEWBOX_W = 400;
const VIEWBOX_H = 500;
const COLUMN_COUNT = 5;
const CELL_W = VIEWBOX_W / COLUMN_COUNT;

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
      rect.setAttribute("fill", "#eef4ff");
      rect.setAttribute("stroke", "#2b4a8b");
      rect.setAttribute("stroke-width", "0.5");
      rect.dataset.slotId = p.slot_id;
      rect.dataset.role = p.role;
      g.appendChild(rect);

      const text = doc.createElementNS(SVG_NS, "text");
      text.setAttribute("x", String(x + (CELL_W - 8) / 2));
      text.setAttribute("y", String(y + 15));
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("font-size", "8");
      text.setAttribute("font-family", "system-ui, sans-serif");
      text.setAttribute("fill", "#2b4a8b");
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
    },
    get partCount(): number {
      return partCount;
    },
    get rotationDeg(): number {
      return rotationDeg;
    },
  };
}
