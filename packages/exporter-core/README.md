# @geny/exporter-core

결정론적 Cubism 번들 변환 라이브러리. 내부 리그 템플릿(`rig-templates/base/halfbody/vX.Y.Z/`) + 아바타 인스턴스 → Cubism Editor 가 읽을 수 있는 `*.pose3.json` / `*.physics3.json` / `*.motion3.json` / `*.cdi3.json` / `*.model3.json` 산출.

**결정론의 의미**: 동일 입력 → 동일 byte. 모든 직렬화는 `canonicalJson()` 을 경유 (키 알파벳 정렬, 2-space indent, LF, 마지막 개행 1개). 테스트는 golden fixture 와 **byte-for-byte** 비교.

**관련 문서**:
- `docs/11 §3` — Cubism 번들 구조
- `docs/11 §3.2.1` — pose3 대체 포즈 그룹
- `progress/adr/0003` — 리그 템플릿 버저닝
- `progress/adr/0004` — 참조형 아바타

## 범위 (v0.1.0 = 세션 08b)

- [x] `canonicalJson()` — 공용 직렬화 유틸 (세션 08a)
- [x] `loadTemplate(dir)` — 리그 템플릿 로더 (pose + parts + physics + motions 로드, 세션 08a→08b)
- [x] `pose3` 변환기 (세션 08a)
- [x] `physics3` 변환기 (세션 08b — mao_pro 9 Setting 호환)
- [x] `motion3` 변환기 (세션 08b — 파라미터 타깃 전용, segment 1:1 이식)
- [ ] `cdi3` + `model3` 변환기 (세션 09)
- [ ] `.moc3` 바이너리 — Live2D 라이선스 SDK 필요, 범위 밖

## 사용

### 라이브러리

```ts
import { loadTemplate } from "@geny/exporter-core/loader";
import { convertPose } from "@geny/exporter-core/converters/pose";
import { canonicalJson } from "@geny/exporter-core/util/canonical-json";

const tpl = loadTemplate("rig-templates/base/halfbody/v1.2.0");
const pose3 = convertPose(tpl);
process.stdout.write(canonicalJson(pose3));
```

### CLI

```bash
pnpm -F @geny/exporter-core build

node packages/exporter-core/dist/cli.js pose \
  --template rig-templates/base/halfbody/v1.2.0 \
  --out out/halfbody_v1.2.0.pose3.json

node packages/exporter-core/dist/cli.js physics \
  --template rig-templates/base/halfbody/v1.2.0 \
  --out out/halfbody_v1.2.0.physics3.json

node packages/exporter-core/dist/cli.js motion \
  --template rig-templates/base/halfbody/v1.2.0 \
  --pack idle.default \
  --out out/halfbody_v1.2.0__idle_default.motion3.json
```

또는 `bin` 심볼릭:

```bash
exporter-core <pose|physics|motion> --template <dir> [--pack <id>] --out <file>
```

## 개발

```bash
pnpm -F @geny/exporter-core build      # tsc → dist/
pnpm -F @geny/exporter-core test       # node --test dist/tests/
```

### 골든 회귀

`tests/golden/` 하위 커밋된 기대 byte 파일을 생성 결과와 byte-for-byte 비교한다. 회귀가 발생하면:

1. 의도된 변경이면 → golden 파일 직접 갱신 후 PR 에 "골든 갱신" 명시.
2. 의도치 않은 변경이면 → 변환기·canonicalJson 을 점검.

## 런타임 의존성

**0개**. Node built-in 만 사용 (fs, path, url, node:test). typescript 는 devDependency.
