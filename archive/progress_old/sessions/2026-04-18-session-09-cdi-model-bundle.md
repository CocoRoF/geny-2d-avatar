# Session 09 — `packages/exporter-core` v0.2.0: cdi3 + model3 + 번들 조립

- **Date**: 2026-04-18
- **Workstreams**: Pipeline
- **Linked docs**: `docs/11 §3.2, §3.5`, `docs/03 §12.1`
- **Linked ADRs**: `progress/adr/0003`, `progress/adr/0004`
- **Previous**: 세션 08b — physics3 + motion3 (commit `5a28bf7`)

---

## 1. 목표 (Goals)

- [ ] `src/converters/cdi.ts` — 내부 `parameters.json` + `parts/*.spec.json` → Cubism `cdi3.json` 변환기.
- [ ] `src/converters/model.ts` — `manifest` + FileReferences 입력 → Cubism `model3.json` 변환기.
- [ ] `src/bundle.ts` — `assembleBundle(template, outDir)` : 5 개 Cubism 파일(pose3, physics3, cdi3, model3, motion3×N)을 일관된 번들 디렉터리에 기록.
- [ ] 로더 확장 — `loadTemplate(dir).parameters` 도 메모리에 포함.
- [ ] golden 회귀: halfbody v1.2.0 의 cdi3.json + model3.json (placeholder moc/texture 경로). 번들 파일 목록 스냅샷.
- [ ] CLI `cdi`, `model`, `bundle` 서브커맨드.
- [ ] 버전 `0.1.0` → `0.2.0` bump — 이 세션 이후 처음으로 "외부 Cubism SDK 없이도 로드 가능한 패키지 구조" 가 나옴.

### 범위 경계

- `.moc3` 바이너리·텍스처 아틀라스 — 외부 SDK 의존, 범위 밖. model3 는 경로 placeholder 로.
- Expression(exp3) — docs/11 §3.2.2 는 있지만 파츠·파라미터 완성이 우선. 세션 10 이후로.
- 마이그레이션 스크립트·CI — 세션 10.

## 2. 사전 맥락 (Context)

- cdi3 는 Cubism Editor 의 디스플레이·UI 메타 — 파라미터 이름(로케일), 그룹 계층, 파츠 이름, 2D 조이스틱(CombinedParameters).
- model3 는 번들 매니페스트 — 다른 JSON 파일과 .moc3·텍스처 경로를 한데 묶고, EyeBlink/LipSync 파라미터 그룹·HitArea 정의를 포함.
- 우리 템플릿 `parameters.json` 의 각 파라미터는 인라인 `cubism` 필드가 대부분 (eye/body/hair 등 표준 매핑) 이나, `overall_*` 계열은 `cubism` 필드가 빠져 있고 `manifest.cubism_mapping` 에만 정의 — converter 가 두 소스를 병합해야 한다.
- docs/11 §3.2: "모델3 Groups 에 `EyeBlink [ParamEyeLOpen, ParamEyeROpen]`, `LipSync [ParamA]` 기본, 정밀 모드는 5 vowel". cdi3 converter 와 model3 converter 둘 다 이 규약을 내재화.
- `assembleBundle()` 의 결정론은 파일 내용(canonicalJson 경유) + 파일 이름·배치 두 축. 이름 규약은 `docs/11 §3.5` 암묵적 — 우리가 이 세션에서 확정.

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 |
|---|---|---|
| cdi3 변환기 | `src/converters/cdi.ts` | 입력: `{parameters, partsById, manifest}`. 출력: Cubism cdi3.json (Parameters/ParameterGroups/Parts/CombinedParameters). |
| model3 변환기 | `src/converters/model.ts` | 입력: `{manifest, parameters, fileReferences}`. 출력: Cubism model3.json (FileReferences/Groups/HitAreas). |
| 번들 조립기 | `src/bundle.ts` | `assembleBundle(template, outDir, opts?)` → 5+ 개 Cubism JSON 파일 기록, 번들 파일 목록 반환. |
| 로더 확장 | `src/loader.ts` | `loadTemplate(dir).parameters` 로드. |
| golden | `tests/golden/halfbody_v1.2.0.cdi3.json`, `halfbody_v1.2.0.model3.json`, `halfbody_v1.2.0.bundle.snapshot.json` | byte-for-byte. |
| CLI | `src/cli.ts` | `cdi`/`model`/`bundle` 서브커맨드. |
| 버전 bump | `package.json` | `0.1.0` → `0.2.0`. |

## 4. 결정 (Decisions)

- **D1 (cdi3 Parameters.Name 은 en 고정)**: physics3 와 동일 정책 (세션 08b D3). 한국어·일본어 이름은 CDI3 locale override 레이어(추후) 에서. 변환기는 영문 ASCII 로만 채움.
- **D2 (cdi3 GroupId 는 PascalCase 로 변환)**: 내부 group id `eyes` → Cubism `Eyes`. 간단히 첫 글자 대문자. Cubism Editor UI 가 PascalCase 를 관행으로 채택.
- **D3 (CombinedParameters 는 parameters.json combined_axes 에서 직접 매핑)**: 내부 `["head_angle_x","head_angle_y"]` → `{ParameterIdH:"ParamAngleX", ParameterIdV:"ParamAngleY"}`. 매핑은 `cubism` 인라인 필드 우선, 그 다음 manifest.cubism_mapping.
- **D4 (cdi3 Parts 는 parts/*.spec.json 의 cubism_part_id + display 이름 유추)**: 내부 파츠 spec 에 `display_name` 이 없으므로 `role + slot_id` 를 human-readable 영문으로 합성 (예: `slot_id: arm_l_a, role: arm_l` → `Arm L A`). 결정론 확보 위해 규칙 고정: slot_id 의 `_` → 공백·각 토큰 대문자화.
- **D5 (model3 Groups EyeBlink/LipSync 는 고정 매핑)**: EyeBlink = `eye_open_l` + `eye_open_r` (있는 것만), LipSync = `mouth_vowel_a` (있을 때). 파라미터가 없으면 해당 그룹을 생성하지 않는다. 정밀 LipSync(5 vowel) 는 `opts.lipsync: "precise"` 에서.
- **D6 (model3 HitAreas 는 manifest.hit_areas 에서 직역)**: id 는 그대로, Name 은 `role` 의 PascalCase (Head, Body).
- **D7 (model3 FileReferences.Moc/Textures 기본 placeholder)**: 실제 moc3/아틀라스는 외부 도구 산출. 변환기는 기본값 `"avatar.moc3"` + `["textures/texture_00.png"]` 을 주입하고, 호출자가 override 가능. 이게 결정론적 golden 을 만들 수 있게 한다.
- **D8 (bundle 파일명 규약)**:
  - `avatar.model3.json`, `avatar.cdi3.json`, `avatar.pose3.json`, `avatar.physics3.json`
  - motions → `motions/<pack_id_slug>.motion3.json` (슬러그 = pack_id 의 `.` → `_`, lower)
  - 이유: Cubism Editor 관례는 프로젝트 이름을 파일 prefix 로 쓰나, 번들은 자기완결적이어야 하고 prefix 가 외부 결정 요소가 되면 결정론 깨짐. 중립 prefix `avatar` 사용. 호출자가 `opts.bundleName` 으로 override 가능.
- **D9 (assembleBundle 의 결정론 = 파일 목록도 결정론)**: `assembleBundle` 반환값에 `files: Array<{path, sha256, bytes}>` 를 포함. 번들 전체 스냅샷 = 이 목록의 canonicalJson. golden 에서 byte 비교.
- **D10 (버전 0.2.0 bump)**: v0.1.0 은 3/5 변환기, v0.2.0 은 5/5 + 번들. 의미 있는 마일스톤.

## 5. 변경 요약 (Changes)

- `packages/exporter-core/src/` — cdi.ts, model.ts, bundle.ts + loader/index.ts 확장.
- `packages/exporter-core/tests/` — cdi·model·bundle 테스트 + 3 개 golden.
- `packages/exporter-core/src/cli.ts` — 3 서브커맨드 추가.
- `progress/INDEX.md` — session 09 row, Pipeline 진행도 갱신.

## 6. 블록 (Blockers / Open Questions)

- 실제 Cubism Editor 로 cdi3/model3 를 열어 "유효 여부" 확인은 이 세션에서 불가 (Editor 미설치). 포맷 규격은 Live2D 공식 문서 기준으로 작성 — 호환성 검증은 Foundation Exit 체크리스트 "단일 아바타 Cubism export 수동 테스트" 단계에서.
- model3 FileReferences.Moc/Textures 는 placeholder — 실제 bundle 로드 전에 호출자가 override 해야 함. CLI `bundle` 은 `--moc` / `--texture` 플래그 미지원(세션 11).

## 7. 다음 세션 제안 (Next)

- **세션 10**: `scripts/rig-template/migrate.mjs` (v1.0.0/v1.1.0 → v1.2.0) + 골든셋 회귀 CI. Foundation Exit 체크리스트 2번 달성.
- **세션 11**: `samples/avatars/sample-01-aria` 재작성 + avatar 단 end-to-end export 스모크 (rig template + avatar refs → Cubism 번들 폴더 with moc/texture override).
- **세션 12**: Expression(exp3) 변환기 + Web Avatar 번들 포맷 가교.

## 8. 지표 (Metrics)

- **변환기 수**: 5 (pose + physics + motion + cdi + model)
- **골든 fixture 수**: 목표 8 (pose 2 + physics 1 + motion 2 + cdi 1 + model 1 + bundle snapshot 1)
- **테스트 수**: 목표 ~35 (기존 23 + cdi ~6 + model ~4 + bundle ~2)
- **검증**: `node scripts/validate-schemas.mjs` 불변, `pnpm -F @geny/exporter-core test` 전부 pass, CLI 스모크 5종.

## 9. 인용 (Doc Anchors)

- [docs/11 §3.2 파라미터 매핑](../../docs/11-export-and-deployment.md#32-파라미터-매핑)
- [docs/11 §3.5 빌드 경로](../../docs/11-export-and-deployment.md#35-빌드-경로)
- [docs/03 §12.1 mao_pro 기준](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
