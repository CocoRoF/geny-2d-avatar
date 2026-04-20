/**
 * `createStructureRenderer` 회귀 — `<geny-avatar>` 의 `ready` + `parameterchange`
 * 이벤트를 duck-typed EventTarget 으로 구동한다 (실 element 불필요).
 *
 * happy-dom Window 에서 SVG 생성이 가능하므로 DOM 어서션만으로 렌더링 결과를
 * 검증 (픽셀 draw 는 Foundation 범위 밖).
 */

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { Window } from "happy-dom";

import {
  createStructureRenderer,
  type RendererBundleMeta,
  type RendererHost,
  type RendererPart,
} from "../src/renderer.js";

let window: Window;

before(() => {
  window = new Window({ url: "https://test.local/" });
});

after(async () => {
  await (window as unknown as { happyDOM: { close(): Promise<void> } }).happyDOM.close();
});

/** 테스트용 파츠 + 파라미터 고정. halfbody smoke 축소판. */
function sampleMeta(parts = 6): RendererBundleMeta {
  return {
    parts: Array.from({ length: parts }, (_, i) => ({
      role: `role_${i}`,
      slot_id: `slot_${i}`,
    })),
    parameters: [
      { id: "head_angle_x", range: [-30, 30], default: 0 },
      { id: "head_angle_y", range: [-30, 30], default: 0 },
      { id: "body_breath", range: [0, 1], default: 0 },
    ],
  };
}

/** `<geny-avatar>` 없이 duck-typed host — EventTarget + bundle getter. */
function makeHost(initialBundle?: { meta: RendererBundleMeta }): RendererHost {
  const target = new (window as unknown as { EventTarget: typeof EventTarget }).EventTarget();
  return Object.assign(target, {
    bundle: initialBundle ?? null,
  }) as unknown as RendererHost;
}

test("createStructureRenderer: renders 1 SVG per part after ready event", () => {
  const doc = (window as unknown as { document: Document }).document;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });

  // build 전: SVG 는 있지만 root group 은 비어 있음.
  const svg = mount.querySelector('svg[data-testid="structure-preview"]');
  assert.ok(svg, "svg host element exists");
  assert.equal(renderer.partCount, 0, "partCount is 0 before ready");

  const meta = sampleMeta(6);
  host.dispatchEvent(new (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent("ready", {
    detail: { bundle: { meta } },
  }));

  assert.equal(renderer.partCount, 6, "partCount = 6 after ready");
  const rects = svg!.querySelectorAll("rect");
  const texts = svg!.querySelectorAll("text");
  assert.equal(rects.length, 6, "6 <rect> for 6 parts");
  assert.equal(texts.length, 6, "6 <text> for 6 parts");
  for (let i = 0; i < 6; i += 1) {
    const rect = rects[i]!;
    assert.equal(rect.dataset.slotId, `slot_${i}`);
    assert.equal(rect.dataset.role, `role_${i}`);
    assert.equal(texts[i]!.textContent, `role_${i}`);
  }

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: parameterchange rotates root group by value", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });

  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(3) } } }));
  assert.equal(renderer.rotationDeg, 0, "initial rotation = 0");

  // 자동 선택된 rotationParameter = "head_angle_x" (첫 "angle" 포함 id).
  host.dispatchEvent(new CE("parameterchange", { detail: { id: "head_angle_x", value: 15 } }));
  assert.equal(renderer.rotationDeg, 15, "rotation updated to 15");

  const rootGroup = mount.querySelector('g[data-testid="structure-root"]')!;
  assert.match(
    rootGroup.getAttribute("transform")!,
    /rotate\(15 200 250\)/,
    "transform reflects rotation + viewBox center",
  );

  // 다른 파라미터는 무시.
  host.dispatchEvent(new CE("parameterchange", { detail: { id: "body_breath", value: 0.5 } }));
  assert.equal(renderer.rotationDeg, 15, "non-rotation param ignored");

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: explicit rotationParameter overrides auto-selection", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({
    element: host,
    mount,
    rotationParameter: "body_breath",
  });

  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(3) } } }));

  host.dispatchEvent(new CE("parameterchange", { detail: { id: "head_angle_x", value: 20 } }));
  assert.equal(renderer.rotationDeg, 0, "explicit override ignores head_angle_x");

  host.dispatchEvent(new CE("parameterchange", { detail: { id: "body_breath", value: 0.7 } }));
  assert.equal(renderer.rotationDeg, 0.7, "explicit param drives rotation");

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: builds immediately if host.bundle already set", () => {
  const doc = (window as unknown as { document: Document }).document;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost({ meta: sampleMeta(4) });
  const renderer = createStructureRenderer({ element: host, mount });

  assert.equal(renderer.partCount, 4, "partCount = 4 from existing bundle");
  assert.equal(mount.querySelectorAll("rect").length, 4);

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: destroy removes listeners and DOM", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(2) } } }));
  assert.equal(renderer.partCount, 2);

  renderer.destroy();
  assert.equal(mount.querySelector("svg"), null, "svg removed from mount");

  // 이후 이벤트는 무시돼야 함 — partCount 불변.
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(10) } } }));
  assert.equal(renderer.partCount, 2, "listener detached — partCount frozen");

  mount.remove();
});

test("createStructureRenderer: setSelectedSlot highlights matching rect (세션 92)", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(4) } } }));

  assert.equal(renderer.selectedSlotId, null, "initial selection is null");

  renderer.setSelectedSlot("slot_2");
  assert.equal(renderer.selectedSlotId, "slot_2");
  const svg = mount.querySelector('svg[data-testid="structure-preview"]')!;
  const selectedRects = svg.querySelectorAll('rect[data-selected="true"]');
  assert.equal(selectedRects.length, 1, "exactly one rect marked selected");
  assert.equal((selectedRects[0] as SVGRectElement).dataset.slotId, "slot_2");

  // 다른 slot 으로 변경 — 이전 하이라이트 해제, 새 하이라이트 적용.
  renderer.setSelectedSlot("slot_0");
  assert.equal(renderer.selectedSlotId, "slot_0");
  assert.equal(svg.querySelectorAll('rect[data-selected="true"]').length, 1);
  assert.equal(
    (svg.querySelector('rect[data-selected="true"]') as SVGRectElement).dataset.slotId,
    "slot_0",
  );

  // null → 모든 선택 해제.
  renderer.setSelectedSlot(null);
  assert.equal(renderer.selectedSlotId, null);
  assert.equal(svg.querySelectorAll('rect[data-selected="true"]').length, 0);

  // 존재하지 않는 slot_id → 무시 (현재 상태 유지).
  renderer.setSelectedSlot("slot_99");
  assert.equal(renderer.selectedSlotId, null, "unknown slot_id ignored");

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: rect click → onSelectPart callback (세션 92)", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const calls: (RendererPart | null)[] = [];
  const host = makeHost();
  const renderer = createStructureRenderer({
    element: host,
    mount,
    onSelectPart: (part) => calls.push(part),
  });
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(3) } } }));

  const svg = mount.querySelector('svg[data-testid="structure-preview"]')!;
  const rect1 = svg.querySelector('rect[data-slot-id="slot_1"]') as SVGRectElement;
  assert.ok(rect1, "rect for slot_1 exists");

  rect1.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("click", { bubbles: true }));
  assert.equal(renderer.selectedSlotId, "slot_1");
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.slot_id, "slot_1");
  assert.equal(calls[0]?.role, "role_1");

  // 같은 rect 재클릭 → 선택 해제 + null 콜백.
  rect1.dispatchEvent(new (window as unknown as { Event: typeof Event }).Event("click", { bubbles: true }));
  assert.equal(renderer.selectedSlotId, null);
  assert.equal(calls.length, 2);
  assert.equal(calls[1], null);

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: setSelectedSlot does NOT fire onSelectPart (세션 92)", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const calls: (RendererPart | null)[] = [];
  const host = makeHost();
  const renderer = createStructureRenderer({
    element: host,
    mount,
    onSelectPart: (part) => calls.push(part),
  });
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(3) } } }));

  renderer.setSelectedSlot("slot_1");
  renderer.setSelectedSlot("slot_0");
  renderer.setSelectedSlot(null);
  assert.equal(calls.length, 0, "programmatic selection must not echo back via onSelectPart");

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: rebuild on ready clears selection (세션 92)", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(4) } } }));
  renderer.setSelectedSlot("slot_2");
  assert.equal(renderer.selectedSlotId, "slot_2");

  // 두 번째 ready — 새 part 세트로 rebuild, 선택 리셋.
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(2) } } }));
  assert.equal(renderer.selectedSlotId, null, "selection cleared on rebuild");
  const svg = mount.querySelector('svg[data-testid="structure-preview"]')!;
  assert.equal(svg.querySelectorAll('rect[data-selected="true"]').length, 0);

  renderer.destroy();
  mount.remove();
});

test("createStructureRenderer: re-dispatching ready rebuilds (template swap)", () => {
  const doc = (window as unknown as { document: Document }).document;
  const CE = (window as unknown as { CustomEvent: typeof CustomEvent }).CustomEvent;
  const mount = doc.createElement("div");
  doc.body.appendChild(mount);

  const host = makeHost();
  const renderer = createStructureRenderer({ element: host, mount });

  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(3) } } }));
  assert.equal(renderer.partCount, 3);
  host.dispatchEvent(new CE("parameterchange", { detail: { id: "head_angle_x", value: 10 } }));
  assert.equal(renderer.rotationDeg, 10);

  // 두 번째 ready — 새 템플릿 스왑 시나리오.
  host.dispatchEvent(new CE("ready", { detail: { bundle: { meta: sampleMeta(8) } } }));
  assert.equal(renderer.partCount, 8, "partCount = 8 after rebuild");
  assert.equal(renderer.rotationDeg, 0, "rotation reset to 0 on rebuild");
  assert.equal(mount.querySelectorAll("rect").length, 8);

  renderer.destroy();
  mount.remove();
});
