# Session 08b — `packages/exporter-core` v0.1.0: physics3 + motion3 변환기

- **Date**: 2026-04-18
- **Workstreams**: Pipeline
- **Linked docs**: `docs/03 §6.2, §12.1`, `docs/11 §3`, `docs/11 §3.3`
- **Linked ADRs**: `progress/adr/0003`, `progress/adr/0004`
- **Previous**: 세션 08a — 패키지 스켈레톤 + canonicalJson + pose3 (commit `a133f64`)

---

## 1. 목표 (Goals)

- [x] `src/converters/physics.ts` — 내부 `physics.json` → Cubism `physics3.json` 변환기.
- [x] `src/converters/motion.ts` — 내부 motion pack (`motions/<pack>.motion.json`) → Cubism `motion3.json` per pack.
- [x] 로더 확장 — `loadTemplate(dir).physics` + `loadTemplate(dir).motions` (pack_id → pack 맵).
- [x] golden 회귀: halfbody v1.2.0 의 physics3.json + 2 개 motion pack (`idle.default`, `greet.wave`).
- [x] CLI `physics` + `motion` 하위 명령 추가.
- [x] 패키지 버전 `0.0.1` → `0.1.0` bump — 두 변환기 더해져 번들링 핵심 중 3/5 확보.

### 범위 경계 (세션 09 로 미룸)

- `cdi3.json` (파라미터/파츠 UI 메타 — 그룹, 다국어 이름)
- `model3.json` (번들 FileReferences, Groups, HitAreas 결합)
- `.moc3` 바이너리 — 외부 SDK 필요
- `motion pack` 메타 기반 일괄 배치·경로 규약 — 세션 09 번들 작업 때 통합.

## 2. 사전 맥락 (Context)

- 세션 08a 에서 **결정론 프레임** (canonicalJson, loader, golden 워크플로) 을 고정. 이번 세션은 그 위에 두 개의 더 큰 변환기를 얹는다.
- 내부 `physics.json` 은 snake_case · mao_pro 기준 필드 이름. Cubism `physics3.json` 은 **PascalCase** 이며 파라미터 ID 도 Cubism 규약(`ParamAngleX` 등). 매핑 테이블은 `template.manifest.json.cubism_mapping`.
- 내부 motion pack 은 timeline segment 를 `[[t0,v0], [kind, ...seg]]` 형태로 그대로 저장 — Cubism `Segments` 와 동일. 파라미터 ID 변환과 헤더 구조만 감싸주면 된다 (세션 04 D3 에서 이 결정을 미리 해둠).
- physics 의 `presets` (normal/light/heavy damping 배율) 는 우리만의 확장 — Cubism physics3 에는 존재하지 않는다. 변환기는 지정된 preset 의 `damping_multiplier` 를 mobility/acceleration 에 곱해 반영할 수 있으나, 기본 동작은 **preset 미적용** (= damping_multiplier 1.0 의 normal 과 동일). 이유: Cubism 런타임은 단일 물리 결과를 기대하고, preset 스위칭은 우리 편의 메타.
- physics 변환기의 결정론 핵심은 **부동소수점 수의 문자열화**. JavaScript `JSON.stringify(1.12)` → `"1.12"`, `JSON.stringify(0.1 + 0.2)` → `"0.30000000000000004"`. 우리 입력 파일은 이미 사람이 작성한 짧은 소수이므로 추가 정규화 불필요 (canonicalJson → `JSON.stringify` 내부).

## 3. 산출물 (Deliverables)

| 산출물 | 경로 | Done 정의 | 결과 |
|---|---|---|---|
| physics3 변환기 | `src/converters/physics.ts` | 입력: `{physics, manifest}`. 출력: Cubism physics3.json (Version/Meta/PhysicsSettings). | ✅ |
| motion3 변환기 | `src/converters/motion.ts` | 입력: `{motion, manifest}`. 출력: Cubism motion3.json per pack (Version/Meta/Curves/UserData). | ✅ |
| 로더 확장 | `src/loader.ts` | `loadTemplate().physics` + `loadTemplate().motions`. motions 는 `{ [packId]: MotionPack }`. | ✅ (7 pack 로드 확인) |
| golden 회귀 | `tests/golden/halfbody_v1.2.0.physics3.json` (15 151 bytes) + `halfbody_v1.2.0__idle_default.motion3.json` (1 134) + `halfbody_v1.2.0__greet_wave.motion3.json` (846) | byte-for-byte 일치. | ✅ |
| CLI 확장 | `src/cli.ts` | `exporter-core {pose,physics,motion}` 3 서브커맨드. | ✅ 3 스모크 전부 golden 과 일치 |
| 버전 bump | `package.json` | `0.0.1` → `0.1.0`. | ✅ |

## 4. 결정 (Decisions)

- **D1 (필드 케이스 변환)**: snake_case → PascalCase 는 **whitelist 기반 고정 테이블** 로 처리. 동적 camelCase 변환기(`_` → 대문자) 는 `physics_setting_count` 같은 애매한 경우 (`PhysicsSettingCount` vs `PhysicsSettingsCount`)가 있어 오동작 가능. 변환기 모듈마다 `INPUT_KEY_MAP` 상수로 규약 고정.
- **D2 (파라미터 ID 매핑은 manifest.cubism_mapping 로만)**: 변환기 단에서 추측 금지. 매핑이 없으면 throw — 템플릿 작성자가 manifest 를 갱신해야 한다. 세션 07 에서 Fuwa/overall 5+3 entry 가 이미 들어가 있어 v1.2.0 변환에 충분.
- **D3 (PhysicsDictionary.Name 은 `en` 고정)**: 내부 `{en,ko,ja}` 구조를 Cubism 단일 문자열로 접을 때 `en` 을 default 로 선택. CDI3 (세션 09) 에서 로케일별 override 를 지원할 예정이므로 physics3 본체는 안정된 ASCII 영문으로.
- **D4 (presets 는 physics3 변환에서 무시)**: Cubism physics3 는 preset 개념 없음. 우리 `presets.normal.damping_multiplier` 는 런타임·에디터 차원 파생값 — 세션 09+ 의 model3 FileReferences 또는 런타임 설정 계층에서 처리. 변환기는 `physics_settings` 배열만 소비.
- **D5 (motion segment 는 그대로 복제)**: 내부 motion pack 의 `segments` 구조가 이미 Cubism `Segments` 1:1 이식 (세션 04 D3). 변환기는 파라미터 ID 만 교체·total counts 만 재계산.
- **D6 (motion3 은 pack 당 1 파일)**: `motion3.json` 은 개별 애니메이션 단위. 한 template 에서 N 개 pack → N 개 motion3 파일. model3.json (세션 09) 이 FileReferences 로 한데 묶는다. CLI 는 `--pack <id>` 로 단일 변환.
- **D7 (motion3 Meta 계산은 runtime 필수 필드만)**: `Duration`, `Fps`, `Loop`, `AreBeziersRestricted`, `CurveCount`, `TotalSegmentCount`, `TotalPointCount`, `UserDataCount`, `TotalUserDataSize`. 우리 내부 pack 에서 Duration/Fps/Loop 은 metadata, CurveCount 등은 파생.
- **D8 (Curve.Target 은 Parameter 단일 타입 고정)**: 세션 04 까지 모션 팩은 파라미터만 제어. 파츠 opacity 제어(`Target: "PartOpacity"`) 는 향후 세션 09+ 에서 cdi/model 과 같이.
- **D9 (버전 0.1.0 bump)**: 결정론 프레임(세션 08a) 에 실제 Cubism 필드 3 종 (pose3 + physics3 + motion3) 이 얹어진 시점 — 패키지는 더 이상 "예시 구조" 가 아닌 실제 작동 가능 변환기 셋. 0.0.x → 0.1.x 전환 정당.

## 5. 변경 요약 (Changes)

- `packages/exporter-core/` — 두 변환기 + 로더 확장 + 테스트.
- `packages/exporter-core/tests/golden/` — physics3 1 + motion3 2 추가.
- `progress/INDEX.md` — session 08b 행 추가, Pipeline 진행도 업데이트.

## 6. 블록 (Blockers / Open Questions)

- motion3 의 `Fps` 기본값은 30. 우리 pack 에 `fps` 가 없는 경우 30 을 주입 (결정론). 향후 pack 별 커스텀 fps 필요 시 메타 확장.
- motion3 `AreBeziersRestricted` — 사용하는 bezier segment 가 모두 X 값 범위 제약 안에 있으면 `true` 로 설정 가능하나, 우리는 안전하게 `false` 고정 (Cubism 런타임 기본).
- physics 의 `effective_forces.wind` 를 preset 별로 바꾸는 기능은 런타임 측에서 — 변환기는 `physics.meta.effective_forces` 만 참조.

## 7. 다음 세션 제안 (Next)

- **세션 09**: `cdi3.json` + `model3.json` 변환기. parameters.json + deformers.json + parts/* + manifest.hit_areas → 단일 번들. 이 세션 이후 처음으로 "로드 가능한 Cubism 패키지" 산출 (텍스처·moc3 제외).
- **세션 10**: `scripts/rig-template/migrate.mjs` (v1.0.0/v1.1.0 → v1.2.0) + 골든셋 회귀 CI. Foundation Exit 체크리스트 2번 달성.

## 8. 지표 (Metrics)

- **변환기 수**: 3 (pose + physics + motion).
- **골든 fixture 수**: pose 2 + physics 1 + motion 2 = 5 (17 474 bytes).
- **테스트 수**: 23 pass (canonicalJson 4 + pose 6 + physics 6 + motion 7).
- **검증**: `node scripts/validate-schemas.mjs` → `checked=124 failed=0` (변경 없음). `pnpm -F @geny/exporter-core test` → 23/23. CLI 스모크 3종 (`pose`, `physics`, `motion idle.default`) 모두 golden 과 byte 일치.

## 9. 인용 (Doc Anchors)

- [docs/11 §3 Cubism 번들 구조](../../docs/11-export-and-deployment.md#3-cubism-핵심)
- [docs/11 §3.3 모션 번들](../../docs/11-export-and-deployment.md#33-모션-번들)
- [docs/03 §12.1 mao_pro 기준](../../docs/03-rig-template-spec.md#121-cubism-공식-샘플-mao_pro-를-기준선으로)
- [progress session 04 — motion 스펙 D3](./2026-04-18-session-04-motions.md)
