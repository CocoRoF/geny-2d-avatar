/**
 * `@geny/web-avatar-renderer` 공통 계약 — 브라우저 런타임 렌더러가 `<geny-avatar>`
 * 로부터 소비하는 duck-typed 인터페이스 모음. 세션 91 에서 `@geny/web-editor-renderer`
 * 내부에 정의됐던 것을 세션 114 (ADR 0007 선행) 에서 승격 분리.
 *
 * 본 패키지는 **런타임 코드 없음** 을 원칙으로 하지만, 소비자 유용성을 위해 가벼운
 * 타입 가드(`isRendererBundleMeta` 등) 는 허용한다 — Stage 렌더러 드라이버(PixiJS /
 * 자체 WebGL2) 가 `unknown` 원시 번들을 받을 때 바로 분기할 수 있도록.
 *
 * docs/01 §8 ("@geny/web-avatar 런타임은 렌더러 의존성 없음") 계약을 **반대 방향**
 * 으로 보존: 렌더러는 `@geny/web-avatar` 에 직접 의존하지 않고 이 패키지의 duck-typed
 * 인터페이스만 참조한다. ADR 0007 의 A/D/E 어떤 렌더러 경로를 택해도 본 계약은 불변.
 */

/**
 * 번들 메타에 실린 파트의 최소 표현 — 렌더러는 `role` 과 `slot_id` 두 축만 필요.
 * 실제 번들은 이 외에 texture/pivot/parameter_ids 등을 싣지만, 렌더러 레이어는
 * 그 detail 에 구속될 이유가 없다 (세션 91 D2 duck-typed 원칙).
 */
export interface RendererPart {
  readonly role: string;
  readonly slot_id: string;
  /**
   * 이 파츠의 변형을 드라이브하는 parameter id 들 — β P1-S4 에서 추가.
   * `<geny-avatar>` 번들의 `WebAvatarPart.parameter_ids` 와 동일. 렌더러는 이 목록
   * 을 역색인해 parameterchange 시 해당 파츠의 sprite 에만 변환을 적용한다.
   * 빠진 파츠(empty/undef)는 어떤 파라미터 변화에도 직접 반응하지 않음.
   */
  readonly parameter_ids?: readonly string[];
}

/**
 * 렌더러가 build 시점에 읽는 메타 — `parts[]` 와 `parameters[]` 두 축. 파라미터의
 * `range` / `default` 는 rotation slider 자동 선택(세션 91) 과 미래 clamp 용.
 */
export interface RendererBundleMeta {
  readonly parts: readonly RendererPart[];
  readonly parameters: readonly {
    readonly id: string;
    readonly range: readonly [number, number];
    readonly default: number;
  }[];
}

/**
 * atlas.json 의 slot UV 엔트리 — 렌더러가 part 배치에 직접 쓰는 축소 표현.
 * β P1-S2 에서 도입. uv 는 `[x, y, w, h]` 정규화 좌표(0~1).
 */
export interface RendererAtlasSlot {
  readonly slot_id: string;
  readonly texture_path: string;
  readonly uv: readonly [number, number, number, number];
}

/**
 * atlas.json 의 텍스처 메타 — path 는 bundleUrl 기준 상대 경로.
 */
export interface RendererAtlasTexture {
  readonly path: string;
  readonly width: number;
  readonly height: number;
}

/**
 * `<geny-avatar>` 가 이미 해석한 atlas.json. β P1-S2 이전엔 duck-typed 로만 접근했고,
 * 지금은 pixi 렌더러가 slot/texture 를 직접 쓰므로 명시 계약.
 */
export interface RendererAtlas {
  readonly textures: readonly RendererAtlasTexture[];
  readonly slots: readonly RendererAtlasSlot[];
}

/**
 * `<geny-avatar>` 의 `ready` CustomEvent detail. 렌더러는 `detail.bundle.meta` 를
 * 기본 축으로 읽고, atlas 구동 렌더러 (β P1-S2 pixi) 는 `bundle.atlas` + `bundle.bundleUrl`
 * 를 추가 사용. 두 field 모두 optional — atlas 가 없거나 URL 기반 resolve 가 필요 없는
 * 렌더러는 무시하면 된다.
 */
export interface RendererReadyEventDetail {
  readonly bundle: {
    readonly meta: RendererBundleMeta;
    readonly atlas?: RendererAtlas | null;
    readonly bundleUrl?: string;
  };
}

/**
 * `<geny-avatar>` 의 `parameterchange` CustomEvent detail. 세션 90 에서 도입된
 * `setParameter(id, value)` 와 대칭.
 */
export interface RendererParameterChangeEventDetail {
  readonly id: string;
  readonly value: number;
}

/**
 * motion pack 의 렌더러 관점 축소 표현 — β P1-S3 에서 도입. 렌더러는 `loop` /
 * `duration_sec` / fade 두 축만 쓰고 실 motion3 curve 는 소비하지 않는다 (curve
 * 평가는 β P3+ 실 asset 합류 시점).
 */
export interface RendererMotion {
  readonly pack_id: string;
  readonly duration_sec: number;
  readonly fade_in_sec: number;
  readonly fade_out_sec: number;
  readonly loop: boolean;
}

/**
 * expression 의 렌더러 관점 축소 표현 — β P1-S3 에서 도입. 실 parameter delta 합성은
 * β P3+ 실 expression asset 합류 시점.
 */
export interface RendererExpression {
  readonly expression_id: string;
  readonly name_en: string;
  readonly fade_in_sec: number;
  readonly fade_out_sec: number;
}

/**
 * `<geny-avatar>` 의 `motionstart` CustomEvent detail. `playMotion(pack_id)` 호출
 * 이후 발사. 세션 94 의 계약을 β P1-S3 에서 renderer 계약으로 승격.
 */
export interface RendererMotionStartEventDetail {
  readonly pack_id: string;
  readonly motion: RendererMotion;
}

/**
 * `<geny-avatar>` 의 `expressionchange` CustomEvent detail. `setExpression(id | null)`
 * 대칭. null 전달 시 중립 복귀 의미.
 */
export interface RendererExpressionChangeEventDetail {
  readonly expression_id: string | null;
  readonly expression: RendererExpression | null;
}

/**
 * 렌더러가 구독하는 호스트 — 실 `<geny-avatar>` 또는 테스트용 `EventTarget` 래퍼.
 * `bundle` 이 optional 인 이유: renderer 가 ready 이벤트 뒤늦게 붙었을 때 즉시
 * build 로 catch-up 할 수 있게 (renderer.ts 의 late-attach 경로, 세션 91).
 */
export interface RendererHost extends EventTarget {
  readonly bundle?:
    | {
        readonly meta: RendererBundleMeta;
        readonly atlas?: RendererAtlas | null;
        readonly bundleUrl?: string;
      }
    | null;
}

/**
 * 타입 가드 — 외부에서 `unknown` 으로 들어온 값이 `RendererBundleMeta` 모양인지
 * 판별. 주 용도: 드라이버 레이어에서 번들 파싱 경계 직후 빠른 rejection.
 * 검사 범위는 **존재성 + 타입** 뿐이고 값 범위(range tuple 순서 등) 는 검사하지
 * 않음 — 그 책임은 schema validator 에 귀속 (ADR 0002).
 */
export function isRendererBundleMeta(value: unknown): value is RendererBundleMeta {
  if (!value || typeof value !== "object") return false;
  const v = value as { parts?: unknown; parameters?: unknown };
  if (!Array.isArray(v.parts)) return false;
  if (!Array.isArray(v.parameters)) return false;
  for (const p of v.parts) {
    if (!p || typeof p !== "object") return false;
    const part = p as { role?: unknown; slot_id?: unknown };
    if (typeof part.role !== "string" || typeof part.slot_id !== "string") return false;
  }
  for (const p of v.parameters) {
    if (!p || typeof p !== "object") return false;
    const param = p as { id?: unknown; range?: unknown; default?: unknown };
    if (typeof param.id !== "string") return false;
    if (typeof param.default !== "number") return false;
    if (!Array.isArray(param.range) || param.range.length !== 2) return false;
    if (typeof param.range[0] !== "number" || typeof param.range[1] !== "number") return false;
  }
  return true;
}

/**
 * 타입 가드 — `parameterchange` detail 모양 검사. 드라이버가 이벤트 브로커를 지날 때
 * 쓰도록.
 */
export function isRendererParameterChangeEventDetail(
  value: unknown,
): value is RendererParameterChangeEventDetail {
  if (!value || typeof value !== "object") return false;
  const v = value as { id?: unknown; value?: unknown };
  return typeof v.id === "string" && typeof v.value === "number";
}

/**
 * 모든 렌더러 구현체의 최소 계약 — `destroy()` 로 이벤트 리스너 해제 + 내부 상태
 * 정리. 호출 후 재사용 불가. ADR 0007 의 어떤 경로(A PixiJS / D 자체 WebGL2 /
 * E 하이브리드)로 확정되어도 `Renderer` 는 각 구현체의 기반 타입이 된다 —
 * Option E 의 facade 라우터는 본 인터페이스만 알면 하위 구현체를 switch 가능.
 *
 * 본 인터페이스는 의도적으로 **작게** 유지 (세션 115 D1). `partCount` 나 `rotationDeg`
 * 같은 구현체별 readout 은 각자의 확장 인터페이스(StructureRenderer / NullRenderer /
 * LoggingRenderer 등) 에 둔다.
 */
export interface Renderer {
  readonly destroy: () => void;
}
