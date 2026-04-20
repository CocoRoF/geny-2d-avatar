/**
 * `createLoggingRenderer` — `createNullRenderer` 와 동일한 상태 추적 + **사용자가
 * 주입한 `logger` 로 각 이벤트를 보고**. 세션 115 — dev/debug 용.
 *
 * `logger(event, payload)` 은 stdout/console 한정이 아니라 임의 sink (메모리 버퍼,
 * Prometheus counter, 에디터 디버그 패널) 에 붙일 수 있도록 함수로 추상화. 기본값은
 * 없다 — `logger` 를 반드시 지정해 "의도하지 않은 console 오염" 을 차단한다.
 */

import type {
  RendererBundleMeta,
  RendererHost,
  RendererParameterChangeEventDetail,
} from "./contracts.js";
import { createNullRenderer, type NullRenderer } from "./null-renderer.js";

/**
 * logger 에 전달되는 이벤트 종류. `"ready"` / `"parameterchange"` / `"destroy"` 세
 * 축이 최소 집합 — 구현체가 확장 이벤트(예: `"render"`) 를 넣고 싶어지면 discriminated
 * union 으로 확장.
 */
export type LoggingRendererEvent =
  | { readonly kind: "ready"; readonly meta: RendererBundleMeta }
  | { readonly kind: "parameterchange"; readonly detail: RendererParameterChangeEventDetail }
  | { readonly kind: "destroy" };

export interface LoggingRendererOptions {
  readonly element: RendererHost;
  readonly logger: (event: LoggingRendererEvent) => void;
}

export interface LoggingRenderer extends NullRenderer {}

export function createLoggingRenderer(opts: LoggingRendererOptions): LoggingRenderer {
  const { element, logger } = opts;

  // NullRenderer 로 상태 추적을 위임하고, 같은 호스트에 logger-only 리스너를 한 쌍 더
  // 붙인다. 순서 보장: addEventListener 호출 순으로 발화되므로 null-renderer 의
  // 상태 반영이 먼저 끝난 뒤 logger 가 읽을 수 있게 null-renderer 를 먼저 등록.
  const inner = createNullRenderer({ element });

  function onReady(evt: Event): void {
    const detail = (evt as CustomEvent<{ bundle?: { meta?: RendererBundleMeta } }>).detail;
    if (!detail || !detail.bundle || !detail.bundle.meta) return;
    logger({ kind: "ready", meta: detail.bundle.meta });
  }

  function onParameterChange(evt: Event): void {
    const detail = (evt as CustomEvent<RendererParameterChangeEventDetail>).detail;
    if (!detail || typeof detail.id !== "string" || typeof detail.value !== "number") return;
    logger({ kind: "parameterchange", detail: { id: detail.id, value: detail.value } });
  }

  element.addEventListener("ready", onReady);
  element.addEventListener("parameterchange", onParameterChange);

  // late-attach: host 가 이미 bundle 을 갖고 있으면 inner 가 이미 반영했으므로, logger
  // 에도 즉시 ready 를 한 번 알려준다 (drop-in 대칭).
  const existing = element.bundle;
  if (existing && existing.meta) {
    logger({ kind: "ready", meta: existing.meta });
  }

  return {
    destroy(): void {
      element.removeEventListener("ready", onReady);
      element.removeEventListener("parameterchange", onParameterChange);
      inner.destroy();
      logger({ kind: "destroy" });
    },
    get partCount(): number {
      return inner.partCount;
    },
    get lastMeta(): RendererBundleMeta | null {
      return inner.lastMeta;
    },
    get lastParameterChange(): RendererParameterChangeEventDetail | null {
      return inner.lastParameterChange;
    },
    get readyCount(): number {
      return inner.readyCount;
    },
    get parameterChangeCount(): number {
      return inner.parameterChangeCount;
    },
  };
}
