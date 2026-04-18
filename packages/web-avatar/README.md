# @geny/web-avatar

`geny-2d-avatar` 의 **브라우저 런타임 (Web Components)**. `web-avatar` 번들을 읽어
`<geny-avatar>` 커스텀 엘리먼트로 렌더링한다. (docs/11 §4)

## 현재 상태 (세션 15 stage 1)

이 패키지는 **스캐폴드 전용**이다. 실제 런타임 코드는 아직 없다. 배포되는 구성 요소는
입력 포맷 정의와 번들 파이프라인뿐이다:

- **입력 포맷**: `schema/v1/web-avatar.schema.json` — 번들 메타 JSON.
- **번들 조립기**: `@geny/exporter-core` v0.6.0 의 `assembleWebAvatarBundle(template, outDir, opts)`.
- **CLI**: `exporter-core web-avatar --template <dir> --out-dir <dir>` — `web-avatar.json` +
  `bundle.json` (kind=`web-avatar-bundle`) 을 emit.

## 향후 계획

stage 2+ 에서 실장 예정:

- `<geny-avatar src="./web-avatar.json">` Web Components 엘리먼트.
- PNG/WebP 텍스처 번들(텍스처 atlas + 메쉬) 지원 — 현재 `web-avatar.schema.json` 의
  `textures[]` 필드는 참조 경로만 허용, 실제 파일 동봉은 이후 stage.
- 파라미터·모션·표정 런타임 제어 API (`setParameter`, `playMotion`, `setExpression`).
- 물리 엔진 통합. 번들의 `physics_summary` 가 런타임이 해당 설정을 loading 해야 하는지
  여부만 알려주며, 상세 `physics_settings` 는 별도 페치 경로에서 처리.

## 결정론 규칙

번들 내 `web-avatar.json` 과 `bundle.json` 은 canonical JSON(키 ASCII 정렬, 2-space,
LF, trailing `\n`) 이다 — 동일 입력 → 동일 바이트. CI 골든(`packages/exporter-core/
tests/golden/halfbody_v1.2.0.web-avatar-bundle.snapshot.json`) 이 이를 강제한다.
