# @geny/exporter-pipeline

`@geny/exporter-core` + `@geny/post-processing` 를 실제 PNG decode/encode 로 연결하는 e2e 참조 구현. 세션 35 에서 `assembleWebAvatarBundle` 에 열어둔 `textureOverrides?` 훅을 채우기 위한 **얇은** 층 — exporter-core 자체는 이미지 라이브러리에 의존하지 않는다는 원칙 (bytes-only 순수성) 을 유지한다.

## 사용 예

```ts
import { loadTemplate } from "@geny/exporter-core";
import { runWebAvatarPipeline } from "@geny/exporter-pipeline";

const tpl = loadTemplate("rig-templates/base/halfbody/v1.2.0");
runWebAvatarPipeline(tpl, "out/web-avatar-v1.2.0");
// → out/web-avatar-v1.2.0/{web-avatar.json, atlas.json, bundle.json, textures/*.png}
```

기본 동작은 `applyAlphaSanitation({})` — Stage 1 기본 (alpha threshold noise 제거, bbox 계산). 추가 옵션은 `{ sanitation: { close, feather, uvClip, ... } }` 로.

임의 transform 은 `transform` 으로:

```ts
runWebAvatarPipeline(tpl, outDir, {
  transform: (img) => {
    // ImageBuffer (straight RGBA8) in → ImageBuffer out
    return img;
  },
});
```

## API

- `decodePng(Buffer): ImageBuffer` — PNG → straight RGBA8 (premultiplied=false).
- `encodePng(ImageBuffer): Buffer` — 결정론적 PNG.
- `buildTextureOverride(src, transform)` — 한 텍스처 항목 decode→transform→encode + sha256/bytes 재계산. `path` 는 원본 유지.
- `runWebAvatarPipeline(template, outDir, opts?)` — 편의 진입점. textures 를 모두 처리한 뒤 `assembleWebAvatarBundle` 호출.

## 설계 결정

- `pngjs` 7.x 는 color=6 (RGBA) + bit depth=8 로 출력하고 Deflate 스트림이 결정론적 — 동일 픽셀 입력에 동일 바이트가 나온다 (pipeline.test 의 case: "determinism" 이 확인).
- 원본 `path` 보존은 `assembleWebAvatarBundle` 의 textureOverrides 가드가 강제한다. 본 pipeline 은 `TemplateTextureFile.path` 를 절대 변경하지 않는다.
- exporter-core 는 여전히 pngjs 를 몰라야 한다 — 이 패키지 위에 다른 이미지 라이브러리 기반 pipeline 을 병행해도 됨 (ex. `sharp` 기반 WebP 변환기).
