/**
 * `@geny/web-avatar` — `<geny-avatar>` Web Components 런타임 진입점.
 *
 * Side-effect: 모듈 import 시 브라우저 환경이면 자동으로 `<geny-avatar>` 를 등록.
 * 프레임워크 통합 시점 제어가 필요하면 `"@geny/web-avatar/element"` 를 직접 import 하고
 * `registerGenyAvatar(tagName)` 를 호출한다.
 */

export * from "./types.js";
export * from "./loader.js";
export * from "./element.js";

import { registerGenyAvatar } from "./element.js";

if (typeof customElements !== "undefined") {
  registerGenyAvatar();
}
