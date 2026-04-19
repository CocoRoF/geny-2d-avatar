# Session 59 — fullbody v1.0.0 실 저작 5단계(최종): E2E 번들 + sha256 golden + ADR 0005 L4 활성

- **날짜**: 2026-04-19
- **범위**: 세션 52 저작 계획 §7 의 최종 X+4 단계. expressions + test_poses + textures + pose.json + aria 급 번들(zoe) 생성 + sha256 golden 고정.
- **산출물**: `rig-templates/base/fullbody/v1.0.0/{expressions/, test_poses/, textures/, pose.json}` + `samples/avatars/sample-02-zoe-fullbody.{avatar,export,bundle.snapshot}.json` + exporter-core golden 테스트 1건.
- **상태**: 완료
- **선행**: 세션 55 (스캐폴딩), 56 (parts/deformers), 57 (physics), 58 (motions)
- **후행**: 세션 60 후보 (BullMQ 드라이버 실장)

---

## 1. 배경

세션 55~58 로 fullbody v1.0.0 의 뼈대(manifest/parameters/parts/deformers/physics/motions) 가 완성됐다. 이번 세션은 **남은 3 리소스(expressions/test_poses/textures) + pose.json + exporter-core 엔드투엔드 번들** 을 저작해 **ADR 0005 L4 파이프라인 불변식** 을 활성화한다.

L4 정의 (ADR 0005 §5): "exporter-core 가 실 템플릿 디렉터리를 입력으로 받아 Cubism 호환 번들을 생성하고, 해당 번들의 `bundle.json` sha256 이 골든과 byte-for-byte 일치한다." — 이 게이트가 닫히면 fullbody 리그 저작이 **완결**되고, 이후 수정은 회귀 차단된다.

---

## 2. 설계 결정

### D1. expressions 3종 / pose.json — halfbody v1.3.0 **무수정 복제**

- `expression.smile@1.0.0` (`eye_smile_l/r` + `mouth_up` + `brow_l/r_y`) · `expression.wink@1.0.0` (`eye_open_r=0`) · `expression.neutral@1.0.0` (대량 중립 reset) — 전부 상반신 전용 파라미터만 참조.
- **결정**: `cp rig-templates/base/halfbody/v1.3.0/expressions/*.expression.json fullbody/v1.0.0/expressions/` — 하반신 파라미터 블렌드가 현재 기획(docs/11 §3.2) 에 없어 추가 저작 불필요.
- `pose.json` 역시 상반신 팔(arm_l/r_a/b) Cubism pose group 만 담음 — fullbody 도 arm 파츠 그대로 승계(세션 56) 이므로 복제.
- **근거**: Cubism export 포맷 관점에서 expressions/pose 는 상반신 전용 컨텐츠라 차이 없음. 하반신 pose group(예: 다리 교차시 레이어 전환) 수요가 생기면 별도 세션에서 추가.

### D2. `test_poses/validation_set.json` — halfbody 20 포즈 승계 + 하반신 8 포즈 신규

신규 8 포즈 (category 는 schema 허용 `body` 로 통일 — `lower_body` 는 schema enum 에 없어 거부됨, D5 참조):

| ID | 목적 |
|---|---|
| `body_sway_skirt` | `body_angle_x=10` → Setting13 skirt_sway_phys + Setting17 hip_phys + Setting11 cloth_cape_sway 동시 유도 검증. |
| `leg_stride_l` | `leg_l_angle=15` (range 상한, 초기에 20 시도 → schema range [-15,15] 위반으로 조정). Setting15 leg_sway_phys_l 유도. 오른다리 0 → skirt_sway 에 L/R 비대칭 입력 생성. |
| `leg_stride_r` | `leg_r_angle=15` → Setting16 leg_sway_phys_r (reflect) 유도. 좌우 대칭 회귀. |
| `leg_stride_both` | 양다리 동일 각 → Setting13 의 `leg_l(25w) - leg_r(25w,reflect)` 상쇄 = **대칭 보행 시 치마 sway 소거** 검증(세션 57 D2 설계 의도 직결). |
| `foot_flex_l/r` | foot_l/r_angle=15 — foot_warp 단독 검증 (physics 입력 아님). |
| `pose_walk_mid` | 걷기 중간 프레임 근사 (`body_angle_x=5, leg_l=15, leg_r=-10`) — 모든 physics_output 동시 활성. |
| `pose_idle_breathe` | `body_breath=1, body_angle_x=-3` — hip_phys + skirt_fuwa 동시 활성, 다리는 중립. |

- **결정**: 28 포즈(20+8) 으로 확장. fullbody 전용 파라미터(leg/foot) 와 physics_output 연동 케이스를 **명시적으로 네이밍**해서 저자가 실 렌더 튜닝 시점에 기준점으로 사용하도록 함(ADR 0005 L3 저자 튜닝 보조).

### D3. `textures/{atlas.json, base.png}` — halfbody 4×4 PNG 복제 (placeholder)

- halfbody v1.3.0 의 `atlas.json` + 4×4 PNG 를 그대로 복제. **실 아트워크 저작은 Foundation 범위 밖** — Editor/저자 도구가 채울 슬롯.
- `atlas.json` 의 `slots: []` 유지 — fullbody 전용 슬롯 매핑은 실 base.png 저작 시점에 추가.
- **근거**: exporter-core 번들 검증은 텍스처의 **경로 존재 + sha256 정합**만 요구 — 4×4 placeholder 도 골든 스냅샷에서 일관된 해시 값으로 역할. 아트워크 교체 시 스냅샷 한 번 갱신하는 것이 정상 경로.

### D4. exporter-core — family=fullbody **분기 추가 없음** (이미 family-agnostic)

- `resolveTemplateDir(root, templateId, version)` 가 `TEMPLATE_ID_RE = /^tpl\.([a-z]+)\.v(\d+)\.([a-z_]+)$/` 로 channel/major/family 를 파싱해 `<root>/<channel>/<family>/v<version>/` 로 해석.
- `tpl.base.v1.fullbody` + `1.0.0` → `rig-templates/base/fullbody/v1.0.0/` 로 자동 해석 — **코드 변경 0 라인**.
- **결정**: `family=fullbody` 전용 분기를 만들지 않음. 세션 52 플래너가 "없으면 halfbody 로직 재사용" 으로 옵션을 열어뒀던 지점 — 실제로 필요 없음을 확인.
- **근거**: exporter-core 의 의도 = **template directory contract 에만 의존**. 가족 간 차이는 리소스 내용물에서 흡수되고, 파일 구성은 동일(parameters/parts/deformers/physics/motions/expressions/test_poses/textures/pose). 만약 fullbody 전용 번들 파일(예: `walk_cycle_meta.json`) 이 생긴다면 그때 분기 검토.

### D5. schema 엄격성 — 스키마 확장 없이 기존 enum 내에서 저작

- 초기 시도: test_poses category 에 `lower_body` 사용 → schema enum `["baseline","eyes","mouth","head","body","brow","combo"]` 밖이라 거부.
- **결정**: **schema 확장 거부**. `lower_body` → `body` 로 통일.
- **근거**: 세션 56 D4 와 동일 원칙 — fullbody 가 추가로 필요로 하는 스키마 enum 확장은 **별도 PR 로 명시적 스코프** 에서 다룬다. 현재 세션에서 schema 를 바꾸면 (a) halfbody/masc_halfbody 전체 파츠·포즈 검증에 파급 (b) migrator 호환성 재검토 필요 → 리스크 대비 이득 낮음. `body` 범주로 충분히 의미 전달됨.
- 두 번째 시도: leg_l/r_angle=20° → parameters.json range `[-15, 15]` 위반 → 15 로 조정. **파라미터 range 는 세션 55 에서 저자가 확정한 계약**이라 test_pose 쪽을 맞춤.

### D6. aria 급 샘플 아바타 `zoe` 신설 + sha256 golden 고정

- `samples/avatars/sample-02-zoe-fullbody.{avatar,export}.json`:
  - `avatar_id = av_02JBNMBTC8X6GS1YZBVX39Q8A6` (ULID 계열, schema pattern `^av_[0-9A-HJKMNP-TV-Z]{26}$` 준수 — 초기에 `U` 포함 → Crockford base32 제외 문자라 거부 → `Y` 로 치환).
  - `template_id = tpl.base.v1.fullbody`, `template_version = 1.0.0`, `bundle_name = zoe`, `lipsync = precise`.
- `sample-02-zoe-fullbody.bundle.snapshot.json` (신규 golden): `file_count=17` (9 motions + 3 expressions + 4 sibling JSONs[`cdi3/model3/pose3/physics3`] + 1 `bundle.json`), `total_bytes=55008`.
  - 하이라이트: `zoe.physics3.json` **28,393 B** (halfbody aria 15,151 B 대비 +87% — 17 PhysicsSetting 확장 반영). `bundle.json` **2,786 B** (aria 2,452 B + motion/expression 엔트리 증분).
- `packages/exporter-core/tests/avatar-bundle.test.ts` +1 테스트 `assembleAvatarBundle: fullbody zoe spec produces 17 files + snapshot matches golden (ADR 0005 L4)` — file count + path 존재성 4종 + snapshot byte-for-byte 일치.
- **근거**: aria 가 halfbody v1.2.0 의 E2E 회귀 고정 기준인 것과 대칭으로, zoe 가 fullbody v1.0.0 의 E2E 회귀 고정 기준. 이 테스트가 통과하는 한 fullbody 리그 저작물의 모든 수정은 **의도된 골든 갱신** 이어야 하며(세션 당 1줄), 실수 변경은 exit 1 로 차단됨 = **L4 파이프라인 불변식 활성**.

### D7. license/provenance 샘플 — 세션 59 범위에서 제외

- `sample-01-aria.license.json` / `sample-01-aria.provenance.json` 에 대응하는 zoe 쌍을 만들지 않음.
- **근거**: 두 문서는 (a) `bundle_manifest_sha256` 를 실 번들 해시로 고정 (b) Ed25519 서명 필요 — 서명 키 + 툴 흐름은 이미 halfbody aria 에서 검증됨. 두 번째 샘플은 **중복 검증**에 그치고, 서명 생성은 세션 예약 시간 밖. Foundation Exit gates 는 이미 aria 로 pass 됨.
- 필요 시 세션 61+ 에서 `scripts/sign-sample.mjs` (가칭) 로 자동화 후 추가 — 이번 세션 범위 밖.

---

## 3. 변경 산출물

**신규 파일** (10):
- `rig-templates/base/fullbody/v1.0.0/expressions/neutral.expression.json` (복제)
- `rig-templates/base/fullbody/v1.0.0/expressions/smile.expression.json` (복제)
- `rig-templates/base/fullbody/v1.0.0/expressions/wink.expression.json` (복제)
- `rig-templates/base/fullbody/v1.0.0/pose.json` (복제)
- `rig-templates/base/fullbody/v1.0.0/textures/atlas.json` (복제)
- `rig-templates/base/fullbody/v1.0.0/textures/base.png` (복제, 4×4 placeholder)
- `rig-templates/base/fullbody/v1.0.0/test_poses/validation_set.json` (20+8=28 포즈)
- `samples/avatars/sample-02-zoe-fullbody.avatar.json`
- `samples/avatars/sample-02-zoe-fullbody.export.json`
- `samples/avatars/sample-02-zoe-fullbody.bundle.snapshot.json`
- `progress/sessions/2026-04-19-session-59-fullbody-e2e.md` (본 파일)

**수정 파일** (2):
- `packages/exporter-core/tests/avatar-bundle.test.ts` — +1 테스트 (zoe fullbody).
- `progress/INDEX.md` — row 59 + §3 checked=237→244 + §6 checked=244 + §8 rotate.

**변경 없음 (명시)**:
- `packages/exporter-core/src/**` — family-agnostic 설계가 이미 fullbody 를 커버 (D4).
- `schema/v1/**` — 스키마 확장 거부 (D5).
- `scripts/validate-schemas.mjs`, `scripts/test-golden.mjs` — 신규 step 불필요 (zoe 테스트는 기존 `exporter-core tests` step 에 포함).

---

## 4. 검증

- `node scripts/validate-schemas.mjs` → **checked=244 failed=0** (237→244: +3 expressions +1 test_poses +1 atlas +1 zoe avatar +1 zoe export).
- `node scripts/rig-template/physics-lint.mjs rig-templates/base/fullbody/v1.0.0` → **✓ all checks pass** (family=fullbody settings=17 in=43 out=19 verts=34) — 세션 57/58 결과 불변.
- `cd packages/exporter-core && pnpm test` → **96/96 pass** (기존 95 + zoe 1).
- `pnpm run test:golden` → **20/20 step pass**.
- `node scripts/rig-template/physics-lint.test.mjs` → 13/13 pass.
- `node scripts/rig-template/migrate.test.mjs` → 3/3 pass.

**ADR 0005 게이트 상태** (fullbody v1.0.0):
- L1 migrator auto-patch: **N/A** (halfbody→fullbody 승계 경로 없음, 독립 family).
- L2 physics-lint: **✅ 활성** (세션 57).
- L3 저자 튜닝: **✅ 문서화** (physics/mao_pro_mapping.md §5, test_poses 28 포즈로 기준점 제공).
- L4 파이프라인 불변식: **✅ 활성** (세션 59 — `assembleAvatarBundle` golden 테스트가 byte-for-byte 고정).

---

## 5. 커밋

단일 커밋:

```
feat(rig): fullbody v1.0.0 최종 저작 — expressions + test_poses + textures + zoe E2E golden (세션 59, ADR 0005 L4 활성)
```

포함:
- `rig-templates/base/fullbody/v1.0.0/expressions/*.expression.json` (3 신규)
- `rig-templates/base/fullbody/v1.0.0/pose.json` (신규)
- `rig-templates/base/fullbody/v1.0.0/textures/{atlas.json,base.png}` (2 신규)
- `rig-templates/base/fullbody/v1.0.0/test_poses/validation_set.json` (신규, 28 포즈)
- `samples/avatars/sample-02-zoe-fullbody.{avatar,export,bundle.snapshot}.json` (3 신규)
- `packages/exporter-core/tests/avatar-bundle.test.ts` (+1 zoe 테스트)
- `progress/sessions/2026-04-19-session-59-fullbody-e2e.md` (신규)
- `progress/INDEX.md` (row 59 + §3/§6 checked=244 + §8 rotate)

---

## 6. 다음 세션

§8 새 순서:

- **세션 60**: BullMQ 드라이버 실장 — ADR 0006 §D3 선행 조건 완결(세션 53) 후 첫 drivers 구현. `@geny/job-driver-bullmq` v0.1.0 + Redis 연결 래퍼 + JobStore 인터페이스 호환 + `idempotency_key` → `jobId` pass-through.
- **세션 61 후보**: orchestrator-service `--driver bullmq` flag + worker-generate wiring (BullMQ 드라이버 주입) + perf-harness `--driver bullmq` 대조 런.
- **세션 62 후보**: Helm chart 확장 — Redis 7.2 subchart + secret wiring + `--driver bullmq` 디플로이 매니페스트 + ADR 0006 §4 토폴로지 반영.
