# @geny/web-avatar

`geny-2d-avatar` 의 **브라우저 런타임 (Web Components)**. `web-avatar` 번들을 읽어
`<geny-avatar>` 커스텀 엘리먼트로 렌더링한다. (docs/11 §4)

## 현재 상태 (세션 18 stage 2)

- ✅ **번들 로더**: `loadWebAvatarBundle(bundleUrl)` — `bundle.json → web-avatar.json → atlas.json` 해석.
- ✅ **Custom Element 스켈레톤**: `<geny-avatar src="...">` 모듈 import 시 자동 등록. `ready` / `error` 이벤트 방출.
- ✅ **텍스처 + atlas 계약**: `schema/v1/atlas.schema.json` 신설. `web-avatar.schema.json` 의 `textures[].{width,height,bytes,sha256}` + `atlas` 필드 확정.
- ⏳ **렌더링은 Stage 3 이후**: GPU 업로더, 파라미터·모션·표정 제어 API, 물리 엔진 통합 미구현. 현재 `setParameter/playMotion/setExpression` 는 예외 throw.

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
- `ready` — `detail: { bundle: WebAvatarBundle }`.
- `error` — `detail: { error: unknown }`.

## 향후 계획 (Stage 3+)

- WebGL/Canvas 2D 렌더러 + `moc3` 파서 통합.
- `setParameter(id, value)` / `playMotion(packId)` / `setExpression(expressionId)` 실장.
- `SubtleCrypto.digest` 로 번들 파일 sha256 integrity 검증.
- 물리 엔진 통합 — `physics_summary` 존재 시 설정 별도 페치.

## 결정론 규칙

번들 내 `web-avatar.json` / `atlas.json` / `bundle.json` 은 canonical JSON
(키 ASCII 정렬, 2-space, LF, trailing `\n`) 이다 — 동일 입력 → 동일 바이트.
CI 골든(`packages/exporter-core/tests/golden/halfbody_v1.2.0.*`) 이 이를 강제한다.
