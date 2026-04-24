# 01. 리그 프리셋

## 1. 프리셋이란

**프리셋 = "완성된 뼈대 번들"**. 드로어블·디포머·파라미터·물리·모션·표정·atlas 규격이 하나로 묶여 있는 재사용 가능한 자산.

이 프로젝트는 **뼈대를 코드로 저작하거나 런타임에 조립하지 않는다** — 프리셋을 고르고, 그 위에 텍스처를 얹을 뿐.

모든 뼈대는 프리셋 형태로 동등하게 취급된다:
- **3rd-party preset**: Live2D Inc. 의 `mao_pro` 같은 외부 제공 완제품
- **derived preset**: 우리가 Cubism Editor 로 저작한 프리셋 (halfbody v1.3.0 등)
- **user preset** (미래): 사용자가 업로드한 `.moc3` + 관련 파일을 카탈로그에 등재

`mao_pro` 를 다르게 취급하지 않는다 — 그저 "가장 먼저 들어온, 그리고 다른 프리셋의 설계 기준이 된" 프리셋일 뿐.

## 2. 프리셋 디렉토리 규격

모든 프리셋은 **같은 파일 트리**를 갖는다 (`rig-templates/base/<id>/<version>/`):

```
rig-templates/base/<id>/<version>/
├── template.manifest.json      # 프리셋 메타 + cubism_mapping (우리 ↔ Cubism 표준 이름)
├── parameters.json             # 파라미터 목록 (범위·기본값)
├── deformers.json              # 디포머 계층
├── parts/<part_id>.spec.json   # 파츠 명세 (drawable ID, atlas slot)
├── physics/
│   ├── physics.json            # PhysicsSetting 배열
│   └── design_notes.md         # 설계 근거 (mao 대비 매핑 등)
├── pose.json                   # 포즈 그룹
├── motions/<pack>.json         # 모션 팩
├── expressions/<id>.json       # 표정 팩
├── textures/
│   ├── atlas.json              # UV 슬롯 (part_id → rect)
│   └── base.png                # 레퍼런스/플레이스홀더 텍스처
├── test_poses/<name>.json      # 렌더 회귀용 고정 포즈
├── runtime_assets/             # (3rd-party 의 경우) 원본 .moc3 등 바이너리
└── README.md                   # 프리셋 요약
```

권위 스키마: `schema/v1/rig-template.schema.json` 외 `parameters / deformers / part-spec / physics / pose / atlas / motion-pack / expression-pack / test-poses` 각 schema.

### 3rd-party preset 의 경우

외부 바이너리 `.moc3` 를 **재생성할 수 없으므로** 원본을 `runtime_assets/` 에 그대로 보존하고, JSON 파일들(`parameters/deformers/parts/physics/pose/atlas`) 은 `.moc3` 를 분석해 추출·반영한다. `template.manifest.json` 의 `origin` 필드로 라이선스·출처 명시.

```jsonc
// mao_pro v1.0.0 template.manifest.json 예시
{
  "schema_version": "v1",
  "template_id": "tpl.base.mao_pro",
  "version": "1.0.0",
  "origin": {
    "kind": "third-party",
    "vendor": "Live2D Inc.",
    "product": "Nijiiro Mao Pro",
    "license_ref": "mao_pro_ko/ReadMe.txt",
    "source_path": "mao_pro_ko/runtime/"
  },
  "cubism_mapping": { /* mao 는 이미 Cubism 표준 이름이므로 identity */ },
  "compatible_runtimes": ["cubism-5.x"]
}
```

## 3. 프리셋 카탈로그 (현재·계획)

| 프리셋 ID | 종류 | 경로 | 상태 | 비고 |
|---|---|---|---|---|
| `tpl.base.v1.mao_pro@1.0.0` | 3rd-party | `rig-templates/base/mao_pro/v1.0.0/` | **활성 (P1.A 2026-04-24)** | `scripts/rig-template/import-cubism-preset.mjs` 로 `mao_pro_ko/runtime/` → wrapper 변환. 130 params + 32 parts + 16 physics settings + 7 motions + 8 expressions. `.moc3` + 원본 JSON 은 `runtime_assets/`. |
| `tpl.base.halfbody@1.3.0` | derived | `rig-templates/base/halfbody/v1.3.0/` | 존재 (atlas 슬롯 비어 있음) | Phase 1 에서 `atlas.json slots[]` 채움. mao_pro 에서 12/16 PhysicsSetting 차용. |
| `tpl.base.halfbody@1.0.0 ~ 1.2.0` | derived (구버전) | `archive/rig-templates/halfbody/v1.0.0 ~ v1.2.0/` | **archive (P0.3.3)** | 이전 iteration. 2026-04-24 P0.3.3 에서 archive 이동. 레퍼런스로만 유지. |
| `tpl.base.fullbody@1.0.0` | derived | `rig-templates/base/fullbody/v1.0.0/` | 후속 스코프 (Phase 5) | 전신 프리셋 초기안. 카탈로그 확장 검증용. |
| `tpl.user.<id>@<ver>` | user | 동적 | 미래 (Phase 6+) | 사용자 업로드 `.moc3` 등재 경로 |

### `mao_pro` 프리셋 편입 (Phase 1 deliverable)

`mao_pro_ko/` 의 원본은 **수정 없이** 라이선스 준수 상태로 유지. 동시에 `rig-templates/base/mao_pro/v1.0.0/` 에 프리셋 엔트리를 만들어:

1. `template.manifest.json` — `origin.source_path: "mao_pro_ko/runtime/"` 로 원본 참조
2. `parameters.json` — `mao_pro.cdi3.json` + `mao_pro.model3.json` 에서 파라미터 목록 추출
3. `deformers.json` — `.moc3` 에서 디포머 계층 추출 (or Cubism Viewer 로 확인 후 수기 기술)
4. `parts/*.spec.json` — `mao_pro.cdi3.json` 의 Parts + drawable ID 매핑 추출
5. `physics/physics.json` — **이미 JSON 포맷이므로** `mao_pro.physics3.json` 을 스키마에 맞게 변환
6. `pose.json` — `mao_pro.pose3.json` 변환
7. `motions/*.json` + `expressions/*.json` — `mao_pro_ko/runtime/motions/*.motion3.json` + `expressions/*.exp3.json` 을 motion-pack/expression-pack 스키마로 래핑
8. `textures/atlas.json` — `mao_pro.4096/texture_00.png` 의 UV 슬롯을 `.moc3` drawable 데이터에서 추출
9. `textures/base.png` — `mao_pro_ko/runtime/mao_pro.4096/texture_00.png` 의 심볼릭 링크 또는 복사 (license 유지 표시 필수)
10. `runtime_assets/mao_pro.moc3` — 원본 바이너리 복사 (or 경로 참조만)

**중요**: 원본 `mao_pro_ko/` 는 삭제·수정하지 않는다. 프리셋 편입은 "스키마에 맞춘 metadata 레이어" 이지 원본 재배치가 아니다.

## 4. halfbody v1.3.0 파츠 구성 (참고)

mao_pro 에서 차용된 파츠 분해 기준 (30 파츠):

- **얼굴** (14): `face_base`, `face_shadow`, `brow_l/r`, `eye_white_l/r`, `eye_iris_l/r`, `eye_lash_upper_l/r`, `eye_lash_lower_l/r`, `cheek_blush`, `nose`, `mouth_base`, `mouth_inner`
- **머리** (5): `hair_front`, `hair_side_l/r`, `hair_back`, `ahoge`
- **몸·의상** (7): `neck`, `torso`, `cloth_main`, `arm_l_a/b`, `arm_r_a/b`
- **액세서리** (2): `accessory_front`, `accessory_back`

## 5. 아틀라스 규격

프리셋이 규정하는 UV 계약. 텍스처 생성기는 이 파일을 읽어 각 slot 크기에 맞게 픽셀을 채운다.

스키마: `schema/v1/atlas.schema.json`

```jsonc
{
  "schema_version": "v1",
  "format": 1,
  "textures": [
    { "path": "textures/base.png", "width": 4096, "height": 4096, "format": "png", "premultiplied_alpha": false }
  ],
  "slots": [
    { "part_id": "face_base",  "texture": 0, "uv": { "x": 0,    "y": 0,    "w": 1024, "h": 1024 } },
    { "part_id": "hair_front", "texture": 0, "uv": { "x": 1024, "y": 0,    "w": 1024, "h": 1024 } }
    // ...
  ]
}
```

### 현 상태 (2026-04-24)
- `halfbody/v1.3.0/textures/atlas.json` — `slots[]` 비어 있음, `base.png` 4×4 placeholder
- `mao_pro` 의 atlas 는 Phase 1 등재 시 `.moc3` drawable 에서 추출 예정

Phase 1 의 첫 기술 과제: **`.moc3` → atlas.json slots 자동 추출 스크립트** (`scripts/rig-template/extract-atlas.mjs`)

## 6. 프리셋 추가 워크플로우

### derived preset (우리 저작)

1. Cubism Editor 에서 `.cmo3` 저작 (mao_pro 네이밍·계층 규약 참고)
2. Cubism Editor → `.moc3` + 각 JSON 파일 export
3. `rig-templates/base/<id>/v<X.Y.Z>/` 디렉토리 생성, 위 규격대로 파일 배치
4. `template.manifest.json` 의 `cubism_mapping` 작성 (우리 파라미터 이름 ↔ `ParamAngleX` 등 표준)
5. `physics/design_notes.md` 작성 (mao 대비 어떤 PhysicsSetting 을 차용·변형했는지)
6. `scripts/rig-template/extract-atlas.mjs` 로 `atlas.json` 생성
7. 검증: `pnpm run validate:schemas` + `scripts/rig-template/physics-lint.mjs` + `pnpm run test:golden`
8. `apps/web-editor` 의 카탈로그 drop-down 에 자동 노출 (`rig-templates/` 스캔)

### 3rd-party preset 편입 (mao_pro, 사용자 업로드 등)

1. 원본 파일을 별도 위치에 보존 (라이선스 준수)
2. `rig-templates/base/<id>/v<X.Y.Z>/` 에 `template.manifest.json.origin` 으로 원본 경로·라이선스 참조 기록
3. `.moc3` 분석으로 parameters/deformers/parts/physics/pose/atlas 추출 → JSON 파일 배치
4. motions/expressions 는 원본 `.motion3.json`/`.exp3.json` 을 스키마 래퍼에 넣어 변환
5. 라이선스 문서 복사 (`runtime_assets/LICENSE.*` 또는 `README.md` 에 명시)
6. 검증·등재 동일

## 7. 참고

- `mao_pro_ko/ReadMe.txt` — Live2D Inc. 라이선스 원문 (보존 필수)
- `rig-templates/base/halfbody/v1.3.0/physics/mao_pro_mapping.md` — mao PhysicsSetting 16 종 → halfbody v1.3.0 12 종 매핑 근거
- `rig-templates/base/halfbody/v1.3.0/README.md` — halfbody v1.3.0 상세
- `schema/v1/rig-template.schema.json` — 프리셋 루트 스키마
- `archive/docs/03-rig-template-spec.md` / `04-parts-specification.md` — 이전 스코프 스펙 (디테일 참고)
