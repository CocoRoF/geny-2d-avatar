/**
 * docs/05 §2.3 폴백 AI 어댑터 skeleton — nano-banana 5xx/DEADLINE 시
 * `AdapterRegistry.route()` 로 자동 내려가는 SDXL(edit/style_ref) + Flux-Fill(mask).
 *
 * Foundation 단계는 Mock 클라이언트만 노출; 실제 HTTP 어댑터는 세션 26+.
 */

export { SDXLAdapter, SDXLMockClient } from "./sdxl-adapter.js";
export type {
  SDXLAdapterOptions,
  SDXLClient,
  SDXLRequest,
  SDXLResponse,
} from "./sdxl-adapter.js";

export { FluxFillAdapter, FluxFillMockClient } from "./flux-fill-adapter.js";
export type {
  FluxFillAdapterOptions,
  FluxFillClient,
  FluxFillRequest,
  FluxFillResponse,
} from "./flux-fill-adapter.js";

export { HttpSDXLClient } from "./http-sdxl-client.js";
export type { HttpSDXLClientOptions } from "./http-sdxl-client.js";
export { HttpFluxFillClient } from "./http-flux-fill-client.js";
export type { HttpFluxFillClientOptions } from "./http-flux-fill-client.js";
