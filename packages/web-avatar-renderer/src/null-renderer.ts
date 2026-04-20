/**
 * `createNullRenderer` — `<geny-avatar>` 계약을 충족하지만 **아무 출력도 하지 않는**
 * 렌더러. 세션 115 — ADR 0007 Decision 확정 전에도 소비자(테스트 / 에디터 스토리북
 * / 드라이런) 가 계약을 드라이브할 수 있게 한다.
 *
 * - ready 이벤트 → 마지막 meta 의 `parts.length` 를 `partCount` 로 노출
 * - parameterchange 이벤트 → 마지막 detail 을 `lastParameterChange` 로 노출
 * - DOM 조작 / canvas / timer 생성 없음
 *
 * 실 구현 렌더러(PixiJS / 자체 WebGL2) 합류 시 상위 `StructureRendererOptions.element`
 * 와 동일한 `RendererHost` 를 주입하면 되므로 drop-in 테스트 더블로 쓸 수 있다.
 */

import type {
  Renderer,
  RendererBundleMeta,
  RendererHost,
  RendererParameterChangeEventDetail,
  RendererReadyEventDetail,
} from "./contracts.js";

export interface NullRendererOptions {
  readonly element: RendererHost;
}

export interface NullRenderer extends Renderer {
  /** 마지막 ready 이벤트의 파츠 수. 아직 ready 없으면 0. */
  readonly partCount: number;
  /** 마지막 ready 이벤트의 meta. 아직 ready 없으면 null. */
  readonly lastMeta: RendererBundleMeta | null;
  /** 마지막 parameterchange detail. 아직 이벤트 없으면 null. */
  readonly lastParameterChange: RendererParameterChangeEventDetail | null;
  /** 누적 ready 이벤트 횟수 (template 스왑 감지용). */
  readonly readyCount: number;
  /** 누적 parameterchange 이벤트 횟수. */
  readonly parameterChangeCount: number;
}

export function createNullRenderer(opts: NullRendererOptions): NullRenderer {
  const { element } = opts;
  let lastMeta: RendererBundleMeta | null = null;
  let lastParameterChange: RendererParameterChangeEventDetail | null = null;
  let readyCount = 0;
  let parameterChangeCount = 0;

  function onReady(evt: Event): void {
    const detail = (evt as CustomEvent<RendererReadyEventDetail>).detail;
    if (!detail || !detail.bundle || !detail.bundle.meta) return;
    lastMeta = detail.bundle.meta;
    readyCount += 1;
  }

  function onParameterChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererParameterChangeEventDetail>).detail;
    if (!detail || typeof detail.id !== "string" || typeof detail.value !== "number") return;
    lastParameterChange = { id: detail.id, value: detail.value };
    parameterChangeCount += 1;
  }

  element.addEventListener("ready", onReady);
  element.addEventListener("parameterchange", onParameterChange);

  // late-attach: host 가 이미 bundle 을 갖고 있으면 즉시 상태 반영. StructureRenderer 와
  // 대칭 — renderer 가 ready 이후 붙어도 drop-in 된다.
  const existing = element.bundle;
  if (existing && existing.meta) {
    lastMeta = existing.meta;
    readyCount += 1;
  }

  return {
    destroy(): void {
      element.removeEventListener("ready", onReady);
      element.removeEventListener("parameterchange", onParameterChange);
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
  };
}
