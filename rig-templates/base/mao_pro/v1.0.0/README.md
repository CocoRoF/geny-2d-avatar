# Mao Pro (Nijiiro) (tpl.base.v1.mao_pro@1.0.0)

3rd-party Cubism 프리셋 wrapper. 원본: Live2D Inc. / Nijiiro Mao Pro.

2026-04-24 P1.A — `scripts/rig-template/import-cubism-preset.mjs` 로 자동 생성.
원본 파일은 `runtime_assets/` 에 보존되어 Cubism Framework 가 직접 로드 (texture 만 교체 가능).

## 구성

- `template.manifest.json` — origin=third-party / family=custom
- `parameters.json` — 130 params (Cubism 네이티브 ID → snake_case 변환, cubism 필드에 원본 ID 보존)
- `parts/*.spec.json` — 32 파츠 wrapper (anatomical 분해 X, Cubism Part 그룹만 참조)
- `deformers.json` — root-only placeholder (드로어블 단위 디포머 계층은 .moc3 내재)
- `physics/physics.json` — 원본 `physics3.json` 을 snake_case 로 정규화
- `pose.json` — 원본 `pose3.json` 정규화
- `motions/`, `expressions/` — 원본 motion3/exp3 wrapper (target_id 만 snake_case)
- `textures/atlas.json` + `textures/base.png` — 1 texture, slots=[] (drawable 단위 slot 은 P3+)
- `runtime_assets/` — 원본 `.moc3` + JSON 4종 (Cubism Framework 가 직접 로드)

## 제한

- **drawable 단위 atlas slot 추출 미제공**. per-slot 텍스처 생성이 필요하면 `.moc3` 파서 구현 후 재생성.
- **parameter range/default 는 convention 기반 추정**. 정확한 값은 .moc3 권위.
- **parts anatomical role 미부여**. 3rd-party 프리셋은 카테고리만 'other' 로 wrapper.

## 라이선스

원본 라이선스: `mao_pro_ko/ReadMe.txt` 참조.
