/**
 * Web Avatar 번들 로더.
 *
 * 런타임 진입점. `<geny-avatar src="…/bundle.json">` 혹은 직접 `loadWebAvatarBundle()`
 * 호출 모두 여기를 통과한다. Stage 2 범위:
 *   1) `bundle.json` (kind=web-avatar-bundle) fetch + validate
 *   2) `web-avatar.json` fetch
 *   3) `atlas.json` (meta.atlas !== null 일 때만) fetch
 *   4) 결과를 `WebAvatarBundle` 로 반환 — 텍스처 바이너리 로딩·렌더링은 Stage 3+.
 *
 * `fetch` 는 주입 가능 (`opts.fetch`). 미지정 시 `globalThis.fetch`.
 * 브라우저/Node 22+ 공통 동작 — 테스트는 fs 기반 mock fetch 로 주입.
 */

import type {
  AtlasJson,
  WebAvatarBundleManifestJson,
  WebAvatarJson,
} from "./types.js";

export interface WebAvatarBundle {
  /** bundle.json 자체를 가리키는 절대 URL (resolve 기준점). */
  bundleUrl: string;
  /** bundle.json 콘텐츠 — kind=web-avatar-bundle 검증 완료. */
  manifest: WebAvatarBundleManifestJson;
  /** web-avatar.json 콘텐츠. */
  meta: WebAvatarJson;
  /** atlas.json (meta.atlas !== null 일 때) 혹은 null. */
  atlas: AtlasJson | null;
}

export interface LoadWebAvatarBundleOptions {
  /**
   * fetch 구현 override. 기본 `globalThis.fetch`. 테스트에서 fs 기반 mock 주입용.
   * `URL` 인자와 `RequestInit` 만 받는 축소 시그니처 — 헤더/옵션 전파 요구되면 확장.
   */
  fetch?: (url: URL) => Promise<Response>;
}

export class WebAvatarBundleError extends Error {
  override readonly name = "WebAvatarBundleError";
  constructor(
    message: string,
    readonly code:
      | "FETCH_FAILED"
      | "INVALID_JSON"
      | "INVALID_KIND"
      | "INVALID_SCHEMA"
      | "MISSING_FILE",
    readonly url?: string,
  ) {
    super(message);
  }
}

/**
 * bundle.json URL 에서 시작해 web-avatar 런타임이 필요한 모든 JSON 을 해석.
 * 텍스처 PNG/WebP 바이트는 여기서 로딩하지 않는다 (Stage 3 GPU 업로더가 담당).
 */
export async function loadWebAvatarBundle(
  bundleUrl: string | URL,
  opts: LoadWebAvatarBundleOptions = {},
): Promise<WebAvatarBundle> {
  const fetchFn = opts.fetch ?? defaultFetch();
  const absoluteBundleUrl = toAbsoluteUrl(bundleUrl);

  const manifest = await fetchJson<WebAvatarBundleManifestJson>(fetchFn, absoluteBundleUrl);
  if (manifest.schema_version !== "v1" || manifest.format !== 1) {
    throw new WebAvatarBundleError(
      `Unsupported bundle schema_version/format: ${manifest.schema_version}/${manifest.format}`,
      "INVALID_SCHEMA",
      absoluteBundleUrl.toString(),
    );
  }
  if (manifest.kind !== "web-avatar-bundle") {
    throw new WebAvatarBundleError(
      `Expected kind="web-avatar-bundle", got "${manifest.kind}"`,
      "INVALID_KIND",
      absoluteBundleUrl.toString(),
    );
  }

  const webAvatarEntry = manifest.files.find((f) => f.path === "web-avatar.json");
  if (!webAvatarEntry) {
    throw new WebAvatarBundleError(
      "bundle.json missing web-avatar.json entry",
      "MISSING_FILE",
      absoluteBundleUrl.toString(),
    );
  }
  const webAvatarUrl = new URL(webAvatarEntry.path, absoluteBundleUrl);
  const meta = await fetchJson<WebAvatarJson>(fetchFn, webAvatarUrl);

  let atlas: AtlasJson | null = null;
  if (meta.atlas) {
    const atlasUrl = new URL(meta.atlas.path, absoluteBundleUrl);
    atlas = await fetchJson<AtlasJson>(fetchFn, atlasUrl);
  }

  return {
    bundleUrl: absoluteBundleUrl.toString(),
    manifest,
    meta,
    atlas,
  };
}

async function fetchJson<T>(
  fetchFn: (url: URL) => Promise<Response>,
  url: URL,
): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new WebAvatarBundleError(
      `fetch failed: ${String((err as Error)?.message ?? err)}`,
      "FETCH_FAILED",
      url.toString(),
    );
  }
  if (!res.ok) {
    throw new WebAvatarBundleError(
      `fetch failed: HTTP ${res.status}`,
      "FETCH_FAILED",
      url.toString(),
    );
  }
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new WebAvatarBundleError(
      "invalid JSON",
      "INVALID_JSON",
      url.toString(),
    );
  }
}

function toAbsoluteUrl(input: string | URL): URL {
  if (input instanceof URL) return input;
  try {
    return new URL(input);
  } catch {
    const base =
      typeof document !== "undefined" && typeof document.baseURI === "string"
        ? document.baseURI
        : typeof location !== "undefined" && typeof location.href === "string"
          ? location.href
          : null;
    if (!base) {
      throw new WebAvatarBundleError(
        `cannot resolve relative URL without document/location: ${input}`,
        "FETCH_FAILED",
      );
    }
    return new URL(input, base);
  }
}

function defaultFetch(): (url: URL) => Promise<Response> {
  if (typeof globalThis.fetch !== "function") {
    throw new WebAvatarBundleError(
      "global fetch is not available; pass opts.fetch",
      "FETCH_FAILED",
    );
  }
  return (url: URL) => globalThis.fetch(url);
}
