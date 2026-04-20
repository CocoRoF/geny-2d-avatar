/**
 * `<geny-avatar>` Custom Element 스켈레톤.
 *
 * Stage 2 범위: src(bundle.json) 해석 → `ready` / `error` 이벤트. 렌더링은 Stage 3.
 *
 * 세션 90 — Stage 3 setter contract 진입. `setParameter/getParameters` + `parameterchange`
 * 이벤트로 에디터 ↔ 엘리먼트 write-through 상태 계약을 개방했다. 렌더러는 이 상태를
 * 구독해 후속 세션에서 합류 (Cubism/WebGL draw 는 별도 `@geny/web-editor-renderer`).
 *
 * 세션 94 — `playMotion`/`setExpression` 스텁 해소. id 유효성 검증 + state tracking
 * (`currentMotion`/`currentExpression`) + `motionstart`/`expressionchange` 이벤트
 * 디스패치. 실 motion3 curve interpolation / expression parameter blending 은 Runtime
 * phase 의 Cubism/WebGL 렌더러 소관 — Foundation 에선 id 계약과 이벤트 플러밍만 닫는다.
 *
 * 사용 예:
 * ```html
 * <geny-avatar src="/avatars/avt.demo/bundle.json"></geny-avatar>
 * <script type="module">
 *   import "@geny/web-avatar";
 *   const el = document.querySelector("geny-avatar");
 *   el.addEventListener("ready", (e) => console.log(e.detail.bundle));
 *   el.addEventListener("parameterchange", (e) => console.log(e.detail));
 *   el.addEventListener("motionstart", (e) => console.log(e.detail));
 *   el.addEventListener("expressionchange", (e) => console.log(e.detail));
 * </script>
 * ```
 *
 * 제어 API: `setParameter` (세션 90) · `playMotion`/`setExpression` (세션 94) 구현.
 * 실 애니메이션 재생 루프는 Runtime phase 에서 이 상태 + 이벤트 위에 올린다.
 */

import { loadWebAvatarBundle, WebAvatarBundleError, type WebAvatarBundle } from "./loader.js";
import type { WebAvatarExpression, WebAvatarMotion } from "./types.js";

export type GenyAvatarReadyEvent = CustomEvent<{ bundle: WebAvatarBundle }>;
export type GenyAvatarErrorEvent = CustomEvent<{ error: unknown }>;
export type GenyAvatarParameterChangeEvent = CustomEvent<{
  id: string;
  value: number;
  values: Readonly<Record<string, number>>;
}>;
export type GenyAvatarMotionStartEvent = CustomEvent<{
  pack_id: string;
  motion: WebAvatarMotion;
}>;
export type GenyAvatarExpressionChangeEvent = CustomEvent<{
  expression_id: string | null;
  expression: WebAvatarExpression | null;
}>;

/**
 * 환경 (브라우저/WebView) 에 HTMLElement 가 있을 때만 Custom Element 클래스를 만든다.
 * Node 에서 모듈을 import 해도 런타임 에러가 나지 않도록 lazy factory 로 감쌌다.
 */
export function createGenyAvatarElementClass(): typeof HTMLElement {
  class GenyAvatarElement extends HTMLElement {
    #bundle: WebAvatarBundle | null = null;
    #loadToken = 0;
    // 세션 90 — parameter write-through. 번들 meta.parameters[].default 로 시드되고
    // setParameter 호출 시 range 로 클램프해서 갱신. getParameters 는 프리즈된 스냅샷.
    #parameters: Map<string, number> = new Map();
    #parameterRanges: Map<string, readonly [number, number]> = new Map();
    // 세션 94 — motion/expression 스텁 해소. 번들 meta 로 허용된 id 집합을 시드하고
    // 현재 상태(선택 id)를 tracking. 실 재생은 Runtime 렌더러가 이 state+event 위에 올림.
    #motions: Map<string, WebAvatarMotion> = new Map();
    #expressions: Map<string, WebAvatarExpression> = new Map();
    #currentMotion: string | null = null;
    #currentExpression: string | null = null;

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
        this.#seedParameters(bundle);
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

    #seedParameters(bundle: WebAvatarBundle): void {
      this.#parameters = new Map();
      this.#parameterRanges = new Map();
      for (const p of bundle.meta.parameters) {
        this.#parameters.set(p.id, p.default);
        this.#parameterRanges.set(p.id, p.range);
      }
      // 세션 94 — motion/expression 레지스트리 + 상태 리셋. 템플릿 스왑 시 이전 번들의
      // pack_id 가 새 번들에 없을 수 있어 current* 를 null 로 되돌리는 것이 안전.
      this.#motions = new Map();
      for (const m of bundle.meta.motions) this.#motions.set(m.pack_id, m);
      this.#expressions = new Map();
      for (const e of bundle.meta.expressions) this.#expressions.set(e.expression_id, e);
      this.#currentMotion = null;
      this.#currentExpression = null;
    }

    getParameters(): Readonly<Record<string, number>> {
      return Object.freeze(Object.fromEntries(this.#parameters));
    }

    setParameter(id: string, value: number): number {
      const range = this.#parameterRanges.get(id);
      if (!range) {
        throw new WebAvatarBundleError(
          `unknown parameter id: ${id}`,
          "INVALID_SCHEMA",
        );
      }
      if (!Number.isFinite(value)) {
        throw new WebAvatarBundleError(
          `parameter value must be finite: ${id}=${value}`,
          "INVALID_SCHEMA",
        );
      }
      const clamped = Math.min(range[1], Math.max(range[0], value));
      this.#parameters.set(id, clamped);
      this.dispatchEvent(
        new CustomEvent("parameterchange", {
          detail: { id, value: clamped, values: this.getParameters() },
        }) satisfies GenyAvatarParameterChangeEvent,
      );
      return clamped;
    }

    get currentMotion(): string | null {
      return this.#currentMotion;
    }

    get currentExpression(): string | null {
      return this.#currentExpression;
    }

    playMotion(packId: string): void {
      const motion = this.#motions.get(packId);
      if (!motion) {
        throw new WebAvatarBundleError(
          `unknown motion pack_id: ${packId}`,
          "INVALID_SCHEMA",
        );
      }
      this.#currentMotion = packId;
      this.dispatchEvent(
        new CustomEvent("motionstart", {
          detail: { pack_id: packId, motion },
        }) satisfies GenyAvatarMotionStartEvent,
      );
    }

    /**
     * 표정을 전환. `null` 을 전달하면 현재 표정 해제 (neutral resting state).
     * 알 수 없는 id 는 INVALID_SCHEMA throw — 번들에 없는 표정은 의미가 없으므로 입구 차단.
     */
    setExpression(expressionId: string | null): void {
      if (expressionId === null) {
        this.#currentExpression = null;
        this.dispatchEvent(
          new CustomEvent("expressionchange", {
            detail: { expression_id: null, expression: null },
          }) satisfies GenyAvatarExpressionChangeEvent,
        );
        return;
      }
      const expression = this.#expressions.get(expressionId);
      if (!expression) {
        throw new WebAvatarBundleError(
          `unknown expression_id: ${expressionId}`,
          "INVALID_SCHEMA",
        );
      }
      this.#currentExpression = expressionId;
      this.dispatchEvent(
        new CustomEvent("expressionchange", {
          detail: { expression_id: expressionId, expression },
        }) satisfies GenyAvatarExpressionChangeEvent,
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
