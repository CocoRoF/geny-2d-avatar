# rig-templates/

`docs/03` 에서 정의한 **베이스 리그 템플릿** 의 구현. 각 템플릿은 파라미터 · 디포머 · 파츠 슬롯 · 물리 · 모션 · 표정 · 포즈 · 텍스처를 **모두 선언** 한다.

모든 JSON 은 `schema/v1/*.schema.json` 에 대해 `scripts/validate-schemas.mjs` 로 검증되며, 리그 저작 규약(C1~C14) 은 `scripts/rig-template/rig-template-lint.mjs` (runbook `progress/runbooks/03-rig-template-lint-rules.md`) 로 강제. Authoring gate 는 ADR 0005 L1~L4.

## 네임스페이스

- `base/*` — 공식 템플릿 (`docs/14 §9.1` 릴리스 단계별 공급). 현재 **halfbody (4 버전)** + **fullbody (1 버전)**.
- `community/*` — 커뮤니티 공개 템플릿 (GA 이후, `docs/03 §2.2`). 현재 미포함.
- `custom/*` — 엔터프라이즈 파생 (`docs/03 §11`). 이 저장소에는 포함하지 않음.

## 버전 디렉터리 (ADR 0003)

템플릿 루트 아래 **SemVer 풀 버전** 으로 디렉터리를 둔다 (`v1.3.0/` 형태). 동일 major 내에서 minor/patch 는 개별 디렉터리로 병렬 유지 — ADR 0004 참조형 아바타가 `template_version` 으로 하나를 지정 (deprecation 정책은 `docs/03 §7.3`, 현재 **BL-DEPRECATION-POLICY** 대기).

```
rig-templates/base/halfbody/
├── v1.0.0/
├── v1.1.0/
├── v1.2.0/
└── v1.3.0/
```

## 공식 베이스 템플릿 카탈로그

각 행 = 실측(`parameters.json` / `deformers.json` / `physics.json` / `parts/*.spec.json` JSON len). 개별 `v*.*.*/README.md` 의 narrative 카운트는 author 관점 (예: `overall_*` 구조 파라미터 제외) 이라 -1 차이가 있으나, **본 카탈로그는 JSON 실측을 권위로 삼는다** (세션 123 · 124 와 동일 원칙, 세션 125 D2).

| 템플릿 | family | parts | parameters | deformers | physics_settings | expressions | motions | test_poses | 도입 |
|---|---|---|---|---|---|---|---|---|---|
| `base/halfbody/v1.0.0/` | halfbody | 27 | 38 | 14 | 3 | 0 | 7 | 1 | 세션 01~02 (스키마 + 파츠) |
| `base/halfbody/v1.1.0/` | halfbody | 29 | 41 | 16 | 3 | 0 | 7 | 1 | 세션 06 (arm A/B variant + 첫 pose.json) |
| `base/halfbody/v1.2.0/` | halfbody | 29 | 46 | 18 | 9 | 3 | 7 | 1 | 세션 32~35 (Fuwa 5 + overall_warp 연결 + Stage 1/3 후처리 연계) |
| `base/halfbody/v1.3.0/` | halfbody | 30 | 50 | 21 | 12 | 3 | 9 | 1 | 세션 45~50 (ahoge + accessory warp 분리 + 12/12 PhysicsSetting 달성) |
| `base/fullbody/v1.0.0/` | fullbody | 38 | 60 | 29 | 17 | 3 | 9 | 1 | 세션 55~71 (fullbody 1 차 저작, halfbody 50 공유 + fullbody 전용 10) |

**파라미터 관계**: `fullbody v1.0.0` 의 60 parameters = halfbody v1.3.0 50 parameters(공유) + fullbody 전용 10 (leg/hip/foot 축). 실측 `len(set(halfbody ids) ∩ set(fullbody ids)) == 50`.

## 단일 버전 디렉터리 구조

```
v*.*.*/
├── template.manifest.json           # 템플릿 메타 (family / version / root_id / cubism_mapping)
├── parameters.json                  # 표준 파라미터 세트 (docs/03 §3)
├── deformers.json                   # 디포머 트리 (docs/03 §4, 세션 02)
├── parts/
│   └── *.spec.json                  # 파츠 스펙 (docs/04 §3)
├── physics/
│   ├── physics.json                 # Cubism physics3 정규화 (docs/03 §6.2)
│   └── mao_pro_mapping.json         # 벤치마크 매핑 (세션 03~)
├── motions/
│   └── *.json                       # motion-pack (docs/03 §6.1, 세션 04)
├── test_poses/
│   └── validation_set.json          # 검수 포즈 (docs/08 §3, 세션 04)
├── pose.json                        # Pose3 mutex 그룹 (docs/11 §3.2.1, v1.1.0+)
├── expressions/                     # Expression Pack 디렉터리 (docs/11 §3.2.2, v1.2.0+)
│   └── *.exp.json
├── textures/                        # 번들 텍스처 (v1.2.0+, web-avatar 번들 조립 입력)
└── README.md                        # 버전 narrative (역사 보존 — JSON 이 진실)
```

**진화 축**: v1.0.0 → v1.1.0 에 `pose.json` 첫 등장, v1.1.0 → v1.2.0 에 `expressions/` · `textures/` 등장. `v*.*.*/README.md` 는 버전별 저자 narrative — 당시 설계 의도 보존용, 실측 갱신 대상 아님.

## 검증 & 저작 게이트

### 스키마 검증
```bash
node scripts/validate-schemas.mjs
```
Ajv 2020-12 로 `schema/v1/**` + `rig-templates/base/**/v*.*.*/` 전수 검증. 디렉터리명(`v1.3.0`) 과 `template.manifest.json.version` 일치도 확인 (ADR 0003). 실측 `checked=244 failed=0`.

### 저작 규약 (rig-template-lint C1~C14)
```bash
node scripts/rig-template/rig-template-lint.mjs rig-templates/base/halfbody/v1.3.0
```
14 규칙 × 34 테스트 상세는 [`progress/runbooks/03-rig-template-lint-rules.md`](../progress/runbooks/03-rig-template-lint-rules.md). 공식 5 템플릿(halfbody v1.0.0~v1.3.0 + fullbody v1.0.0) 모두 clean.

### Baseline diff (마이너 버전 저작 시)
```bash
node scripts/rig-template/rig-template-lint.mjs <new> --baseline <old>
```
PhysicsSetting 구조 diff. `v1.2.0 → v1.3.0` 에서 `+3 settings` 회귀 고정 (runbook 03 §8).

## 마이그레이션 체인

`@geny/migrator@0.1.0` (세션 111) 가 전체 체인 제공:
- `v1.0.0 → v1.1.0 → v1.2.0 → v1.3.0` (세션 111 D1 으로 3 migrator 전부 이식).
- 공개 API: `migrate(srcDir, outDir, options?)` / `planMigrations(from)` / `MIGRATORS`.
- CLI shim: `scripts/rig-template/migrate.mjs` (53 줄, dynamic import).

`v1.3.0 → v1.4.0` 자리는 공석 (리그 변경 범위 사용자 선행 판단 대기).

## 참고

- [`docs/03-rig-template-spec.md`](../docs/03-rig-template-spec.md) — 파라미터 / 디포머 / 물리 / 모션 계약.
- [`docs/04-part-slot-spec.md §3`](../docs/04-part-slot-spec.md) — 파츠 스펙 + `parameter_ids` / `deformation_parent`.
- [`progress/adr/0003-rig-template-versioning.md`](../progress/adr/0003-rig-template-versioning.md) — 디렉터리 버저닝.
- [`progress/adr/0005-rig-authoring-gate.md`](../progress/adr/0005-rig-authoring-gate.md) — L1~L4 저작 게이트.
- [`progress/runbooks/03-rig-template-lint-rules.md`](../progress/runbooks/03-rig-template-lint-rules.md) — 14 rule 카탈로그.
- [`schema/README.md`](../schema/README.md) — 22 계약 카탈로그.
