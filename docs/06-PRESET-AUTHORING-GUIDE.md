# 06. 프리셋 저작 가이드

> **범위**: 본 문서는 `docs/01-RIG-PRESET.md` 의 _스펙_ 을 전제로, 한 명의 저작자가
> 새 derived 프리셋을 Cubism Editor 5.x 에서 시작해 카탈로그 등재까지 수행하는 **절차**
> 에 집중한다. 3rd-party preset 편입은 `scripts/rig-template/import-cubism-preset.mjs` 를
> 그대로 사용하면 되므로 §10 의 간단한 체크리스트만 추가.

## 1. 준비물

| 툴/자산 | 버전/경로 | 비고 |
|---|---|---|
| Cubism Editor | 5.x | Live2D 공식. 저작·export 전담 (무상 for non-commercial). |
| Node | ≥ 22.11 | `package.json#engines.node`. |
| pnpm | ≥ 9 | monorepo 설치/빌드. |
| 레퍼런스 프리셋 | `rig-templates/base/halfbody/v1.3.0/` | 네이밍·physics·atlas 모범. |
| 스키마 | `schema/v1/*.schema.json` | 모든 JSON 은 여기에 맞춘다. |
| validator | `pnpm run validate:schemas` | 커밋 전 반드시 green. |

실 벤더 키(Gemini/OpenAI) 는 **프리셋 저작 단계에는 필요 없다** — 텍스처는 mock 만으로도 파이프라인을 돌릴 수 있다.

## 2. 스코프 정하기

새 프리셋이 필요한가? 다음 셋 중 하나여야 한다:

1. **기존 프리셋으로 커버 안 되는 비율** (예: chibi 2-head, 수인형 전신)
2. **기존 프리셋과 motion/expression 라이브러리가 호환 안 됨** (완전 재설계 필요)
3. **라이선스·출처 이유로 별개 엔트리 필요** (3rd-party → §10)

단순 텍스처 variation 이나 "파츠 하나 추가"는 프리셋이 아니라 **텍스처 자산**으로 풀어야 한다 (slot override, slot_overrides prompt 주입 → `docs/02` §5 참조). 프리셋을 늘리면 유지비용이 곱해진다.

결정 후 id 선정:

| 필드 | 예시 | 규칙 |
|---|---|---|
| `family` | `halfbody` / `fullbody` / `chibi` / `mascot` … | 시각적 비율 묶음. |
| `slug` | `halfbody_noir`, `chibi_round` | snake_case, 3~20자, `^[a-z][a-z0-9_]{1,40}$`. |
| `version` | `1.0.0` | semver. slot/parameter breaking change 는 major 올림. |
| `id` | `tpl.base.v<major>.<slug>` | `tpl.base.v1.halfbody_noir` 처럼 id 에 major 반영. v2 로 올라가면 id 도 바뀐다. |

## 3. Cubism Editor 에서 저작

### 3.1 초기 설정

1. 레퍼런스 `.cmo3` 는 `rig-templates/base/halfbody/v1.3.0/runtime_assets/` (없으면 mao_pro 참조).
2. 새 `.cmo3` 는 **Cubism 표준 파라미터 이름 그대로 사용** (`ParamAngleX`, `ParamEyeLOpen` …). 우리 alias 는 `template.manifest.json.cubism_mapping` 으로 따로 선언할 수 있다 (필요시만).
3. 디포머 계층은 halfbody 와 동형이면 파라미터/피직스 이식이 쉽다. 달라야 한다면 §4 `physics/design_notes.md` 에 근거를 남긴다.

### 3.2 파츠 네이밍 규약

슬롯 프롬프트 엔진 (`apps/api/src/lib/slot-prompts.ts`) 은 slot_id prefix 로 카테고리를 판정한다 — 저작 시 다음 규약을 따르면 AI 생성이 의미 있는 힌트를 받는다:

| prefix | 카테고리 | 슬롯 예 |
|---|---|---|
| `face_base`, `face_shadow` | face_base | 피부 base 레이어 |
| `eye_*`, `brow_*`, `mouth_*`, `nose`, `cheek_*` | facial_element | `eye_iris_l`, `brow_r`, `mouth_inner` |
| `hair_*`, `ahoge` | hair | `hair_front`, `hair_side_l` |
| `cloth_*`, `torso`, `neck`, `arm_*`, `leg_*`, `foot_*` | clothing | `cloth_main`, `arm_l_a`, `leg_r` |
| `accessory_*`, `acc_*` | accessory | `accessory_front`, `acc_belt` |
| 그 외 | general | 매칭 안 됨 — 가급적 위 prefix 중 하나로 맞출 것 |

신규 카테고리가 필요하면 먼저 `slot-prompts.ts` 의 `categorizeSlot()` 과 테스트를 확장하고, 그 PR 이 머지된 뒤 프리셋을 저작.

### 3.3 Export

Cubism Editor → 파일 → 런타임 파일 내보내기. 기본 옵션 그대로 두면 다음이 만들어진다:

```
<export>/
├── <name>.moc3                 # binary
├── <name>.model3.json          # 파일 매니페스트
├── <name>.physics3.json        # 우리 physics/physics.json 원본
├── <name>.pose3.json           # 우리 pose.json 원본
├── <name>.cdi3.json            # 디스플레이 메타 (파츠·그룹)
├── motions/*.motion3.json      # 모션
├── expressions/*.exp3.json     # 표정
└── <name>.<size>/texture_00.png  # 아틀라스 기본 PNG
```

**원본을 쓰레기통에 버리지 말 것** — `runtime_assets/` 에 그대로 넣는다 (§4.8).

## 4. 디렉토리 스켈레톤 만들기

프로젝트 루트에서:

```bash
FAMILY=halfbody
SLUG=halfbody_noir
VER=1.0.0
DIR=rig-templates/base/$SLUG/v$VER

mkdir -p "$DIR"/{parts,physics,motions,expressions,textures,test_poses,runtime_assets}
```

각 디렉토리의 역할은 `docs/01 §2` 참조. 이제 파일별로 채운다.

### 4.1 `template.manifest.json`

`rig-templates/base/halfbody/v1.3.0/template.manifest.json` 을 복사 기반으로 고친다:

```jsonc
{
  "schema_version": "v1",
  "id": "tpl.base.v1.halfbody_noir",
  "version": "1.0.0",
  "display_name": {
    "en": "Halfbody Noir",
    "ko": "하프바디 느와르",
    "ja": "ハーフボディ・ノワール"
  },
  "intended_vibe": "그림자 강조, 채도 낮은 상반신 (VTuber 다크 컨셉용). halfbody v1.3.0 의 파츠/피직스 승계.",
  "family": "halfbody",
  "canvas": { "width": 2048, "height": 2048 },
  "ratio": { "head_to_body": "1:3" },
  "parameters_file": "parameters.json",
  "parts_dir": "parts/",
  "deformers_file": "deformers.json",
  "physics_file": "physics/physics.json",
  "motions_dir": "motions/",
  "expressions_dir": "expressions/",
  "test_poses_file": "test_poses/validation_set.json",
  "lipsync_mapping": "../../shared/lipsync_mapping.v1.json",
  "physics_preset": "normal",
  "authoring": {
    "authors": [{ "name": "your-name", "role": "engineer", "contact": "you@example.com" }],
    "created_at": "2026-04-24T00:00:00Z",
    "tool": "cubism-editor@5.x"
  },
  "compat": { "runtimes": ["cubism-5.x"] }
}
```

`origin` 필드는 **derived preset 은 생략** (생략 시 default `derived` 로 처리). 3rd-party 경우만 §10 처럼 명시.

### 4.2 `parameters.json`

Cubism Editor 의 파라미터 패널에 있는 모든 파라미터를 스키마 (`schema/v1/parameters.schema.json`) 에 맞게 나열. mao_pro 가 이미 130개 수준이라 tedious 하지만 **.moc3 파서가 없어서 수동이 최소비용**. halfbody v1.3.0 의 `parameters.json` 을 복붙해 필요한 것만 수정.

주의:
- 각 파라미터 `id` 는 Cubism 표준 이름 (`ParamAngleX`). 우리 alias 가 필요하면 `template.manifest.json.cubism_mapping` 에.
- `range: [min, max]` 와 `default` 는 .model3.json 의 group 기본값 또는 Cubism Editor 값 확인.

### 4.3 `deformers.json`

디포머 계층도 수동. mao_pro 의 `deformers.json` 을 참고하되 새 프리셋에서 계층이 다르면 반영.

### 4.4 `parts/<part_id>.spec.json`

각 파츠마다 한 개 파일. `.cdi3.json` 의 Parts 배열 + `.model3.json` 의 drawable 매핑을 합쳐 스키마(`schema/v1/part-spec.schema.json`) 에 넣는다.

### 4.5 `physics/physics.json`

`<name>.physics3.json` 원본을 스키마 (`schema/v1/physics.schema.json`) 로 변환. 주의사항:

- Cubism 은 `X/Y` 대문자, 우리는 소문자 — `scripts/rig-template/import-cubism-preset.mjs` 가 사용하는 `lowerXY()` 헬퍼가 변환 로직 참조.
- `Type` enum: X / Y / Angle → 그대로 유지.
- `delay` ≤ 1 로 clamp (Cubism 이 드물게 1.5 같은 값을 쓰는 경우 있음).
- PhysicsSetting ID 는 `"PhysicsSetting" + i` 패턴 유지.

자동 변환이 편하면 `scripts/rig-template/import-cubism-preset.mjs --physics-only <physics3.json>` 사용 (신규 플래그가 없다면 스크립트 수정이 먼저).

`physics/design_notes.md` 에 설계 근거를 간단히 남긴다:

```md
# PhysicsSetting 설계 근거

mao_pro v5.x 의 16 PhysicsSetting 에서 12 개 차용 + Noir 전용 2개 추가.

| ours | origin (mao) | 변경 |
|---|---|---|
| hair_front | Hair1 | delay 0.3 → 0.2 (빠른 흔들림) |
| hair_side_l | Hair2 | identity |
| cape | (신규) | 케이프 떨림용, halfbody 는 없음 |
```

### 4.6 `pose.json`

`<name>.pose3.json` 의 Groups 를 그대로 스키마에 맞춰 옮김.

### 4.7 `motions/<pack>.json`, `expressions/<id>.json`

원본 `<motion3.json>` / `<exp3.json>` 들을 개별 파일로 복사하지 말고, 스키마 (`motion-pack` / `expression-pack`) 의 래퍼 구조에 넣는다. 각 팩은 `id`, `curves`, `meta` 등 필수 필드를 갖는다. halfbody 예시 참고.

### 4.8 `runtime_assets/`

Cubism Editor export 결과 전부 그대로 복사 (또는 `ln -s`). 즉:

```
runtime_assets/
├── halfbody_noir.moc3
├── halfbody_noir.model3.json
├── halfbody_noir.physics3.json
├── halfbody_noir.pose3.json
├── halfbody_noir.cdi3.json
├── motions/*.motion3.json
├── expressions/*.exp3.json
└── halfbody_noir.4096/texture_00.png  # 또는 .2048 등
```

웹 렌더러 (`packages/web-avatar-renderer-pixi`) 가 이 디렉토리의 `model3.json` 을 직접 불러온다. **파일명이 템플릿 id 의 slug 과 다르면** `apps/web-preview/scripts/prepare.mjs` 의 `MAO_PRO` 같은 명시 블록을 모방해 복사 규칙을 추가해야 한다. 또는 `scripts/rig-template/import-cubism-preset.mjs` 의 복사 로직이 자동으로 처리.

### 4.9 `textures/base.png` + `textures/atlas.json`

- `base.png`: 저작 단계에서는 `runtime_assets/.../texture_00.png` 를 복사 (또는 4x4 투명 placeholder).
- `atlas.json`: `scripts/rig-template/populate-atlas-slots.mjs <preset-dir>` 실행 → parts 디렉토리 스캔해 UV 자동 생성.

## 5. 검증

각 단계 후 `pnpm run validate:schemas` 를 돌려 점진적으로 green 상태 유지.

전체 회귀:

```bash
pnpm run validate:schemas
pnpm run test:golden
pnpm -F @geny/api test
```

API 에서 새 프리셋 응답 확인:

```bash
pnpm -F @geny/api dev   # 포트 3000
curl -s http://localhost:3000/api/presets | jq '.presets[] | select(.id=="tpl.base.v1.halfbody_noir")'
```

다음이 모두 참이어야 한다:
- `atlas.slot_count > 0`
- `motion_count`, `expression_count` > 0
- `origin` 은 `derived`

## 6. 텍스처 생성 E2E

새 프리셋으로 실제 파이프라인이 도는지 확인:

```bash
curl -s -X POST http://localhost:3000/api/texture/generate/slots \
  -H 'content-type: application/json' \
  -d '{
        "preset_id":      "tpl.base.v1.halfbody_noir",
        "preset_version": "1.0.0",
        "prompt":         "pastel anime girl",
        "seed":           42,
        "feather_px":     4
      }' | jq '{slot_count, success_count, width, height, feather_px}'
```

예상: `slot_count == success_count`, `width/height >= 256`, `feather_px == 4`.

## 7. 골든 회귀에 포함 (선택적)

장기 유지하려는 프리셋은 `scripts/test-golden.mjs` 에 단계를 추가하거나 `apps/api/tests/texture-generate-slots.test.ts` 에 preset-specific 테스트를 추가한다. 예:

```ts
test("POST /api/texture/generate/slots: halfbody_noir v1.0.0 는 N slot 성공", async () => {
  const textures = scratch();
  const app = await buildApp({ rigTemplatesRoot, texturesDir: textures });
  try {
    const res = await app.inject({
      method: "POST",
      url: "/api/texture/generate/slots",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        preset_id: "tpl.base.v1.halfbody_noir",
        preset_version: "1.0.0",
        prompt: "guard",
        seed: 1,
      }),
    });
    assert.equal(res.statusCode, 200);
    const json = res.json() as { slot_count: number; success_count: number };
    assert.equal(json.slot_count, 30);
    assert.equal(json.success_count, 30);
  } finally {
    await app.close();
    rmSync(textures, { recursive: true, force: true });
  }
});
```

이걸 추가하면 이후 슬롯이 하나라도 깨질 때 CI 가 잡아낸다.

## 8. UI 확인

`apps/web-preview/builder.html` 을 열면 (`?api=http://localhost:3000`) family 탭과 카드 그리드에 새 프리셋이 자동 노출된다 (`scanPresets()` 가 `rig-templates/base/**` 를 매 요청마다 스캔). 별도 등록 코드 필요 없음.

P5.1 (2026-04-24) 이후 카드에는 `origin` 뱃지 (derived/third-party/user) 가 색상으로 구분되어 뜬다.

## 9. 커밋 · PR

```bash
git checkout -b feat/preset-<slug>
git add rig-templates/base/<slug>/
git commit -m "feat(preset): add tpl.base.v1.<slug> (<short-desc>)"
git push -u origin feat/preset-<slug>
gh pr create --title "feat(preset): <slug> 프리셋 편입" --body ...
```

PR description 에는:
1. 프리셋 목적 / 시각 컨셉
2. family / canvas / slot count / motion·expression count
3. halfbody / fullbody / mao 대비 physics 차이 (design_notes.md 요약)
4. 테스트 출력 (validate + test:golden + api test)
5. 수동 확인: `/api/presets` 응답 + builder.html 카드 표시 스크린샷 또는 설명

## 10. 3rd-party 편입 체크리스트

Cubism Sample 같이 완제품을 편입할 때는 `scripts/rig-template/import-cubism-preset.mjs` 를 사용:

```bash
pnpm exec node scripts/rig-template/import-cubism-preset.mjs \
  --source path/to/vendor_name_ko/runtime \
  --id tpl.base.v1.<slug> \
  --version 1.0.0 \
  --vendor "Live2D Inc." \
  --product "<Product Name>" \
  --license-ref "<path/to/ReadMe.txt>"
```

스크립트가 처리:
- runtime_assets 전체 복사 (재귀)
- parameters/deformers/parts/physics/pose 변환
- motions/expressions 래핑
- atlas placeholder + slots[] 비움 (drawable 추출 전 단계)
- template.manifest.json 에 `origin.kind=third-party` + source/vendor/license_ref

이후:
1. `populate-atlas-slots.mjs` 는 parts spec 기반이므로 3rd-party 가 부정확한 slot UV 를 줄 수 있음 → 실 drawable UV 는 `.moc3` 파서 (Phase 3+) 완료 후 교체.
2. `atlas.slots[]` 가 비어있으면 `/api/texture/generate/slots` 는 **422 ATLAS_SLOTS_EMPTY** 반환 (fully expected).
3. 원본 파일 수정 금지 — 수정이 필요하면 `rig-templates/base/<slug>/v<X.Y.Z>/` 안의 파일만 손댄다.

## 11. 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| `pnpm run validate:schemas` 에서 `atlas.slots[]` 가 너무 적음 | `populate-atlas-slots.mjs` 가 parts 를 못 읽음 | parts/*.spec.json 이 schema 통과하는지 먼저 확인. 개별 파트 id 와 drawable 이 매핑되었는지. |
| `/api/texture/generate/slots` 가 422 `ATLAS_SLOTS_EMPTY` | atlas.json 의 `slots` 배열이 빈 배열 | §4.9 `populate-atlas-slots.mjs` 실행. 3rd-party 는 `.moc3` 파서 대기 (Phase 3+). |
| 슬롯은 성공하는데 atlas 가 256×256 으로 작음 | `atlas.textures[0].width/height` 가 4x4 placeholder | 실 텍스처로 `base.png` 교체 or 저작 시 `textures[0].width` 를 실 사이즈로 기록. P4.2 의 floor=256 로 최소 출력 보장. |
| 프리셋이 /api/presets 에 안 나옴 | `template.manifest.json` 파싱 실패 | JSON 유효성 (trailing comma, 따옴표) 확인. `schema/v1/rig-template.schema.json` 으로 검증. |
| Live2D 렌더러 (live2d-demo.html) 에서 로드 실패 | `runtime_assets/*.model3.json` 이 없음 or 파일명 mismatch | `apps/web-preview/scripts/prepare.mjs` 의 복사 규칙 확인. slug 와 model3.json 이름이 같아야 기본 resolver 가 동작. |
| `physics-lint` 가 PhysicsSetting delay 초과 지적 | Cubism Editor 가 1.5 같은 값을 내보냄 | physics.json 변환 시 `delay` 를 `Math.min(delay, 1)` 로 clamp. |
| 카드 그리드에 새 프리셋이 안 뜸 | scanPresets 가 디렉토리 버전 regex 매칭 안 함 | `v<X.Y.Z>` 정확히 맞는지. `v1.0` 은 거부됨. |

## 12. 참고

- `docs/01-RIG-PRESET.md` — 프리셋 스펙 원본
- `docs/02-TEXTURE-PIPELINE.md` — 텍스처 파이프라인
- `scripts/rig-template/import-cubism-preset.mjs` — 3rd-party 편입
- `scripts/rig-template/populate-atlas-slots.mjs` — atlas slots 자동 채움
- `rig-templates/base/halfbody/v1.3.0/` — derived preset 모범 사례
- `rig-templates/base/mao_pro/v1.0.0/` — 3rd-party preset 모범 사례
- `apps/api/src/lib/slot-prompts.ts` — 슬롯 prefix 규약 (categorizeSlot)
- `schema/v1/*.schema.json` — 모든 JSON 권위 스키마
