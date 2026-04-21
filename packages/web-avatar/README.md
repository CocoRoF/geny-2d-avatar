# @geny/web-avatar

`geny-2d-avatar` 의 **브라우저 런타임 (Web Components)**. `web-avatar` 번들을 읽어
`<geny-avatar>` 커스텀 엘리먼트로 렌더링한다. (docs/11 §4)

## 현재 상태 (세션 18 → 114)

- ✅ **번들 로더** (세션 18): `loadWebAvatarBundle(bundleUrl)` — `bundle.json → web-avatar.json → atlas.json` 해석.
- ✅ **Custom Element + 이벤트 5 종** (세션 18 → 94): `<geny-avatar src="...">` 자동 등록. `ready` / `error` / `parameterchange` (세션 90) / `motionstart` / `expressionchange` (세션 94) CustomEvent 방출.
- ✅ **텍스처 + atlas 계약** (세션 18): `schema/v1/atlas.schema.json` 신설. `web-avatar.schema.json` 의 `textures[].{width,height,bytes,sha256}` + `atlas` 필드 확정.
- ✅ **파라미터 write-through** (세션 90): `setParameter(id, value)` — range clamp + `parameterchange` 이벤트 브로드캐스트. `getParameters()` 스냅샷.
- ✅ **모션/표정 상태 API** (세션 94): `playMotion(packId)` / `setExpression(id)` / `currentMotion` / `currentExpression`. 실 애니메이션 재생은 렌더러 Runtime.
- ✅ **렌더러 계약 분리** (세션 114): 렌더러 레이어와의 duck-typed 인터페이스(`Renderer*`)는 `@geny/web-avatar-renderer` 로 승격. 본 패키지는 렌더러 의존 없음(docs/01 §8 계약 불변).
- ⏳ **실 렌더링은 Runtime 이후** — ADR 0007 Decision (렌더러 기술) 대기. Foundation 범위는 이벤트·상태 계약과 `@geny/web-avatar-renderer` 소비면 갖추기.

## 사용 예 (Stage 2 범위)

```html
<geny-avatar src="/avatars/avt.demo/bundle.json"></geny-avatar>
<script type="module">
  import "@geny/web-avatar";
  const el = document.querySelector("geny-avatar");
  el.addEventListener("ready", (e) => {
    console.log("bundle loaded", e.detail.bundle.manifest.template_id);
    console.log("parameters:", e.detail.bundle.meta.parameters.length);
    console.log("textures:", e.detail.bundle.meta.textures);
    console.log("atlas:", e.detail.bundle.atlas);
  });
  el.addEventListener("error", (e) => console.error(e.detail.error));
</script>
```

자동 등록을 건너뛰고 태그명을 커스터마이즈하려면:

```ts
import { registerGenyAvatar } from "@geny/web-avatar/element";
registerGenyAvatar("geny-avatar-sandbox");
```

Framework-ready — Custom Element 스펙을 사용하므로 React/Vue/Svelte 전부 HTML 태그로 직접 사용 가능.

## 입력 포맷

- **번들 매니페스트**: `bundle.json` (`schema/v1/bundle-manifest.schema.json`, kind=`web-avatar-bundle`).
- **런타임 메타**: `web-avatar.json` (`schema/v1/web-avatar.schema.json`).
- **텍스처 UV 매핑**: `atlas.json` (`schema/v1/atlas.schema.json`).
- **텍스처 바이너리**: `textures/*.{png,webp}` — canonical JSON 과 별개로 byte-copy.

번들 빌더는 `@geny/exporter-core` v0.6.0 의 `assembleWebAvatarBundle(template, outDir, opts)`, 혹은 CLI `exporter-core web-avatar --template <dir> --out-dir <dir>`.

## API

### `loadWebAvatarBundle(url, opts?)`
- `url`: `string | URL` — `bundle.json` 절대 URL 혹은 WC baseURI 기준 상대 URL.
- `opts.fetch?`: `(url: URL) => Promise<Response>` — fetch 주입 (기본 `globalThis.fetch`).
- 반환: `WebAvatarBundle { bundleUrl, manifest, meta, atlas }`.
- 에러: `WebAvatarBundleError` (`.code`: `FETCH_FAILED | INVALID_JSON | INVALID_KIND | INVALID_SCHEMA | MISSING_FILE`).

### `<geny-avatar src="...">` 이벤트

| 이벤트 | `detail` | 도입 |
|---|---|---|
| `ready` | `{ bundle: WebAvatarBundle }` | 세션 18 |
| `error` | `{ error: unknown }` | 세션 18 |
| `parameterchange` | `{ id: string, value: number }` | 세션 90 |
| `motionstart` | `{ pack_id: string, motion }` | 세션 94 |
| `expressionchange` | `{ expression_id: string \| null, expression }` | 세션 94 |

### `<geny-avatar>` 상태 API

- `setParameter(id, value)` → clamp 후 적용, `parameterchange` 이벤트 발화.
- `getParameters()` → 현재 값 스냅샷 (`Record<id, number>`).
- `playMotion(packId)` → `motionstart` 이벤트 발화. 미등록 id 는 `INVALID_SCHEMA` throw.
- `setExpression(id | null)` → `expressionchange` 이벤트 발화. `null` 은 해제.
- `currentMotion` / `currentExpression` → 현재 활성 id (`string | null`).

## 렌더러 계약 (`@geny/web-avatar-renderer`)

세션 114 에서 렌더러 레이어가 `<geny-avatar>` 로부터 소비하는 duck-typed 인터페이스
5 개 + 가드 2 개를 `@geny/web-avatar-renderer` 로 분리했다. 본 패키지는 그 계약에
의존하지 않고도 독립 동작하며, 렌더러 구현체(구조 프리뷰 `@geny/web-editor-renderer`,
테스트 더블 NullRenderer/LoggingRenderer, 향후 PixiJS/WebGL2 실 구현체)는 모두 `<geny-avatar>`
의 이벤트 계약을 통해 attach 한다. docs/01 §8 "@geny/web-avatar 런타임은 렌더러
의존성 없음" 계약이 양방향으로 보존되는 셈.

## 향후 계획 (Runtime 단계)

- ADR 0007 Decision 에 따라 실 렌더러 패키지 (`@geny/web-avatar-renderer-{pixi,webgl2}`) 합류 — 본 패키지는 계약 불변.
- `SubtleCrypto.digest` 로 번들 파일 sha256 integrity 검증.
- 물리 엔진 통합 — `physics_summary` 존재 시 설정 별도 페치.

## 결정론 규칙

번들 내 `web-avatar.json` / `atlas.json` / `bundle.json` 은 canonical JSON
(키 ASCII 정렬, 2-space, LF, trailing `\n`) 이다 — 동일 입력 → 동일 바이트.
CI 골든(`packages/exporter-core/tests/golden/halfbody_v1.2.0.*`) 이 이를 강제한다.
