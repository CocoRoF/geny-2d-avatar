# 세션 111 — @geny/migrator 패키지 skeleton + v1.2.0→v1.3.0 migration 이식

**일자**: 2026-04-20
**워크스트림**: Pipeline + Data
**선행 세션**: 세션 27 (migrator 최초 작성), 세션 37 (mechanical patches 추가)
**선행 ADR**: [0005](../adr/0005-rig-authoring-gate.md) L1 migrator 자동 패치 축

---

## 1. 문제

세션 27/37 에서 누적된 migrator 로직은 `scripts/rig-template/migrate.mjs` 한 파일(약 530 줄) 에 **MIGRATORS 레지스트리 + 데이터 블록 + 파일 I/O 헬퍼 + CLI 진입점** 이 전부 혼재. 세션 105 D1 에서 legacy opt-in 3 블로커 중 (b) "migrator 인프라 부재" 가 명시 — 패키지화 전에는 `v1.3.0 → v1.4.0` 같은 미래 bump 를 얹기 어렵고, 소비자(exporter-pipeline / web-editor prepare / legacy opt-in 복제) 가 programmatic API 로 migrator 를 호출할 수 없다.

세션 110 리브랜딩 이후 `progress_0420/PLAN.md §7` 가 후보 B (본 세션) 를 최우선으로 지명. **BL-MIGRATOR 내부 블로커** 해소가 이번 목표.

---

## 2. 변경

### 2.1 새 패키지 `packages/migrator/` (TS ESM, Node 22.11+)

레이아웃:

```
packages/migrator/
├── package.json          @geny/migrator@0.1.0 (TS + build/test 스크립트 — license-verifier 패턴 미러)
├── tsconfig.{json,build.json,test.json}
├── .gitignore            dist/ dist-test/ node_modules/ *.tsbuildinfo
├── README.md             사용법 + migrator 작성 규칙
├── src/
│   ├── index.ts          공개 API re-export
│   ├── types.ts          Migrator / ParameterDef / DeformerNodeDef / MigrateOptions / MigrateResult
│   ├── io.ts             patchJson / writeIfAbsent / appendIfMissing / writeReport
│   ├── migrate.ts        planMigrations + migrate(srcDir, outDir, options)
│   └── migrations/
│       ├── index.ts              MIGRATORS 레지스트리 (3 엔트리 순서 고정)
│       ├── v1-0-0-to-v1-1-0.ts   첫 번째 hop: arm pose/angle 파라미터
│       ├── v1-1-0-to-v1-2-0.ts   두 번째 hop: cloth/hair fuwa 5 + overall 3
│       ├── v1-2-0-to-v1-3-0.ts   세 번째 hop: ahoge/accessory sway 3 + mechanical patches (parts/deformers/md)
│       └── data/
│           ├── v1-1-0.ts         V1_1_0_NEW_PARAMETERS
│           ├── v1-2-0.ts         V1_2_0_NEW_PARAMETERS
│           └── v1-3-0.ts         V1_3_0_NEW_PARAMETERS + AHOGE_PART + DEFORMERS + MAO_PRO_APPENDIX
└── tests/
    └── migrate.test.ts   8 tests: plan / registry / full chain / single hop / mechanical / 결정론 / outDir 거절
```

**공개 API** (`src/index.ts`):

```ts
export { migrate, planMigrations } from "./migrate.js";
export { MIGRATORS } from "./migrations/index.js";
export type { Migrator, ParameterDef, DeformerNodeDef, MigrateOptions, MigrateResult, MigrationReportGroup } from "./types.js";
```

`migrate()` 시그니처:

```ts
async function migrate(srcDir: string, outDir: string, options?: MigrateOptions): Promise<MigrateResult>
```

- `outDir` 기존 존재 시 throw (`refusing to write`).
- 진행 메시지는 던지지 않음 — 호출자가 `appliedSteps` 를 보고 직접 로깅.

### 2.2 CLI shim `scripts/rig-template/migrate.mjs` — 530 줄 → 53 줄

기존 로직을 전부 제거하고 dynamic import 로 `@geny/migrator/dist/index.js` 의 `migrate()` 에 위임.

```js
const migratorDist = resolve(__dirname, "..", "..", "packages", "migrator", "dist", "index.js");
const { migrate } = await import(migratorDist);
```

이유: 루트 `package.json` 에 `@geny/migrator` workspace 의존을 추가하지 않아도 됨 (bare specifier 자체가 repo root 수준에서 resolve 되지 않음). CLI 는 항상 packaged `dist/` 를 소비해 배포/개발 경계가 일관.

Stdio 계약 보존:
- `migrate: applying <from> → <to>` 라인 반복 (세션 27 로그 포맷).
- `migrate: ✅ done. target version <to>. Manual TODOs → <reportPath>` 종료 라인.
- Usage 에러 exit 2, 실제 마이그레이션 에러 exit 1 (패키지 throw).

### 2.3 골든 러너 step 14 — `scripts/test-golden.mjs`

`runRigMigrateTests` 가 CLI 테스트만 돌렸던 것을 3 단으로 확장:

```js
await run("pnpm", ["-F", "@geny/migrator", "build"], { cwd: repoRoot });
await run("pnpm", ["-F", "@geny/migrator", "test"], { cwd: repoRoot });
await run("node", ["scripts/rig-template/migrate.test.mjs"], { cwd: repoRoot });
```

(1) 패키지 빌드 (CLI shim 의 dist/ 의존 성립) → (2) 패키지 단위 테스트 → (3) 기존 CLI 회귀.

### 2.4 회귀

- `pnpm -F @geny/migrator test` — **8/8 pass** (planMigrations 3 케이스 + MIGRATORS 1 + migrate 3 end-to-end + outDir 거절).
- `node scripts/rig-template/migrate.test.mjs` — **3/3 pass** (v1.0.0→v1.3.0 full chain + v1.2.0→v1.3.0 single hop + deterministic).
- `node scripts/test-golden.mjs` — **all steps pass** (29 step 전부 green, step 14 `rig-template migrate tests` 2139ms).

### 2.5 byte-equal 검증

기존 CLI 테스트 (`migrate.test.mjs`) 가 manifest.version / cubism_mapping / parameters / 파츠 spec / deformers 트리 / mao_pro_mapping 전수를 검증하는 구조였으므로, 이 테스트가 patch 없이 pass 한다는 사실이 **출력이 bit-by-bit 동일** 임을 보장. 별도 sha256 골든 추가 없이도 현 계약 유지.

---

## 3. 결정 축 (D1–D5)

### D1. 세션 111 범위 = 3 migrator 전부 이식 (v1.2.0→v1.3.0 단일 이식 아님)
- **결정**: PLAN.md §7 의 "`v1.2.0→v1.3.0.mjs`" 를 "이 hop 만 이식" 이 아니라 "**이 hop 까지 포함하는 전체 체인 이식**" 으로 해석. 3 migrator 전부를 패키지에 넣는다.
- **이유**: 일부만 이식하면 CLI 가 `if (version === "1.2.0") import(package) else legacy` 분기를 가져야 하고, 이건 세션 111 이후 세션 112 에서 다시 건드려야 할 부담. 총 코드량은 데이터 블록 위주라 3 migrator 이식 비용이 1 migrator 이식 비용과 큰 차이 없음. CLI shim 을 **깔끔히 원자적으로** 바꾸는 게 리그 게이트 L1 의 인지 부하를 줄인다.

### D2. TS 패키지 (license-verifier 패턴 미러)
- **결정**: 순수 `.mjs` ESM 가 아닌 **TypeScript + dist/ 빌드** 로 구성. `tsconfig.json` 은 license-verifier 와 동일.
- **이유**: 다른 13 개 패키지가 전부 TS. 신규 패키지가 혼자 JS 면 `@types/*` 의 계약 참조가 깨지고, 미래에 `MigrateOptions` / `Migrator` 같은 타입을 노출할 때 consumer 가 안정 타입 가드를 얻는다. CI 빌드 오버헤드는 step 14 에 한정 (약 500ms 추가).

### D3. CLI shim 은 dynamic import + 상대 경로 (workspace 의존 추가 없음)
- **결정**: `scripts/rig-template/migrate.mjs` 는 `@geny/migrator` 를 bare specifier 로 import 하지 않고 `packages/migrator/dist/index.js` 를 절대 경로 dynamic import.
- **이유**: (a) 루트 `package.json` 에 `workspace:*` 의존을 추가하지 않아 pnpm-lock 영향 최소. (b) CLI 는 "패키지 소비자" 가 아니라 "repo 내부 shim" — 빌드된 dist 를 직접 참조하는 게 의도적으로 명시적. (c) bare specifier 해소를 위해 `pnpm install` 사이드이펙트를 늘리지 않음.
- **트레이드오프**: 패키지 배포 시(만약 public 배포한다면) consumer 는 당연히 bare specifier 로 쓰지만, 그건 외부 계약. 본 shim 은 repo 전용.

### D4. 데이터 블록을 `migrations/data/` 서브디렉터리로 분리
- **결정**: `V1_1_0_NEW_PARAMETERS` 등 데이터 constants 를 `v1-1-0.ts` 같은 별도 파일로 분리 (migrator 로직은 `v1-1-0-to-v1-2-0.ts` 에).
- **이유**: 데이터 블록은 **읽기 대상** 이고 (세션 105 legacy opt-in 복제 작업 같은 후속에서 다시 읽는다), migrator 함수는 **호출 대상**. 두 축이 한 파일에 섞이면 긴 상수 배열을 스크롤해 내려간 뒤 함수 로직을 읽어야 해 인지 부하 상승. 미래 `v1-4-0.ts` 데이터 블록 추가 시 diff 가 명확해진다는 부수 효과.

### D5. tests 는 `node:test` API 사용 (license-verifier 와 동일)
- **결정**: `test()` 함수 import, `describe/it` 대신 flat 구조.
- **이유**: 이미 license-verifier / metrics-http / worker-generate 등 repo 전체가 `node:test` flat 패턴. Jest/Vitest 도입 없음. 8 test 는 독립 케이스라 nested suite 필요 없음.

---

## 4. 후속 (세션 112+)

- **후보 C (legacy opt-in 복제)** 의 블로커 (b) 는 본 세션으로 해소. (a) BL-DEPRECATION-POLICY + (c) Runtime 소비자는 여전히 외부 의존.
- **v1.3.0→v1.4.0 migrator** — 가까운 후속. 본 스켈레톤의 첫 external 확장 케이스. `src/migrations/v1-3-0-to-v1-4-0.ts` 작성만으로 레지스트리 append.
- **후보 G (C14 parts↔deformers)** — 본 세션과 독립. rig-template-lint 확장. 언제든 병렬.
- **exporter-pipeline / web-editor prepare 이관** — 세션 105 의 halfbody v1.2.0 → v1.3.0 bump 스크립트가 현재 별도 로직을 가지고 있다면, `migrate()` API 로 위임 가능한지 확인. 본 세션 범위 밖.
- **세션 96 (staging)** — cluster access 대기 유지.

---

## 5. 인덱스 갱신

- `progress/sessions/` 에 본 파일 추가 (세션 111).
- `progress_0420/INDEX.md`:
  - §1 누적 세션 110 → **111**.
  - §1 누적 패키지 13 → **14** (+ @geny/migrator).
  - §4 세션 111 후보 제거, 세션 112 후보 재배열.
- `progress_0420/PLAN.md`:
  - §2 후보 B 상태 ✅ 완료 표시 (세션 111).
  - §3 우선순위에서 후보 B 제거, 후보 C 의 (b) 블로커 해소 표기.
  - §7 다음 행동을 세션 112 후보 G 또는 v1.3.0→v1.4.0 migrator 자리표시자 로 전환.
- `progress_0420/SUMMARY.md`:
  - §13 migrator 패키지 추가 항목.
  - 타임라인 item 12 (session 111) 신규.

---

## 6. 산출물 요약

| 영역 | 변경 |
|---|---|
| `packages/migrator/` (신규) | TS 패키지 skeleton + 3 migrator + 데이터 블록 3 + io 헬퍼 4 + migrate() 진입점 + 8 tests |
| `scripts/rig-template/migrate.mjs` | 530 줄 → 53 줄 shim (dynamic import) |
| `scripts/test-golden.mjs` | step 14 에 `pnpm -F @geny/migrator build && test` 2 단 추가 |
| 회귀 | 패키지 테스트 8/8 + CLI 테스트 3/3 + golden 29 step 전수 pass |
| 누적 패키지 | 13 → **14** (@geny/migrator) |
| BL-MIGRATOR | ✅ 해소 — 후보 C (legacy opt-in) 의 (b) 블로커 풀림 |
