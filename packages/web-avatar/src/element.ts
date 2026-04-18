/**
 * `<geny-avatar>` Custom Element 스켈레톤.
 *
 * Stage 2 범위: src(bundle.json) 해석 → `ready` / `error` 이벤트. 렌더링은 Stage 3.
 *
 * 사용 예:
 * ```html
 * <geny-avatar src="/avatars/avt.demo/bundle.json"></geny-avatar>
 * <script type="module">
 *   import "@geny/web-avatar";
 *   const el = document.querySelector("geny-avatar");
 *   el.addEventListener("ready", (e) => console.log(e.detail.bundle));
 * </script>
 * ```
 *
 * 제어 API(setParameter/playMotion/setExpression)는 스텁이며 Stage 3 에서 구현.
 */

import { loadWebAvatarBundle, WebAvatarBundleError, type WebAvatarBundle } from "./loader.js";

export type GenyAvatarReadyEvent = CustomEvent<{ bundle: WebAvatarBundle }>;
export type GenyAvatarErrorEvent = CustomEvent<{ error: unknown }>;

/**
 * 환경 (브라우저/WebView) 에 HTMLElement 가 있을 때만 Custom Element 클래스를 만든다.
 * Node 에서 모듈을 import 해도 런타임 에러가 나지 않도록 lazy factory 로 감쌌다.
 */
export function createGenyAvatarElementClass(): typeof HTMLElement {
  class GenyAvatarElement extends HTMLElement {
    #bundle: WebAvatarBundle | null = null;
    #loadToken = 0;

    static get observedAttributes(): string[] {
      return ["src"];
    }

    get bundle(): WebAvatarBundle | null {
      return this.#bundle;
    }

    connectedCallback(): void {
      const src = this.getAttribute("src");
      if (src) void this.#load(src);
    }

    attributeChangedCallback(name: string, oldVal: string | null, newVal: string | null): void {
      if (name === "src" && newVal !== null && newVal !== oldVal) {
        void this.#load(newVal);
      }
    }

    async #load(src: string): Promise<void> {
      const token = ++this.#loadToken;
      try {
        const base = this.baseURI;
        const url = resolveSrc(src, base);
        const bundle = await loadWebAvatarBundle(url);
        if (token !== this.#loadToken) return; // superseded by newer src
        this.#bundle = bundle;
        this.dispatchEvent(
          new CustomEvent("ready", { detail: { bundle } }) satisfies GenyAvatarReadyEvent,
        );
      } catch (err) {
        if (token !== this.#loadToken) return;
        this.dispatchEvent(
          new CustomEvent("error", { detail: { error: err } }) satisfies GenyAvatarErrorEvent,
        );
      }
    }

    setParameter(_id: string, _value: number): void {
      throw new WebAvatarBundleError(
        "setParameter is not implemented in stage 2",
        "INVALID_SCHEMA",
      );
    }

    playMotion(_packId: string): void {
      throw new WebAvatarBundleError(
        "playMotion is not implemented in stage 2",
        "INVALID_SCHEMA",
      );
    }

    setExpression(_expressionId: string): void {
      throw new WebAvatarBundleError(
        "setExpression is not implemented in stage 2",
        "INVALID_SCHEMA",
      );
    }
  }
  return GenyAvatarElement;
}

/**
 * `<geny-avatar>` 를 customElements 레지스트리에 등록. 이미 등록되어 있으면 no-op.
 * 기본 태그명은 `geny-avatar` 이며 override 가능 (마이크로프론트엔드 격리용).
 */
export function registerGenyAvatar(tagName: string = "geny-avatar"): void {
  if (typeof customElements === "undefined") return;
  if (customElements.get(tagName)) return;
  customElements.define(tagName, createGenyAvatarElementClass());
}

function resolveSrc(src: string, base: string): string {
  try {
    return new URL(src, base).toString();
  } catch {
    return src;
  }
}
