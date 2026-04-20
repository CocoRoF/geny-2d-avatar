# @geny/migrator

Geny 리그 템플릿 순방향 마이그레이터 (halfbody v1.0.0 → v1.3.0 체인).

세션 27/37 에 걸쳐 `scripts/rig-template/migrate.mjs` 에 누적되던 migrator 로직을
세션 111 에서 본 패키지로 이식. CLI shim 은 `migrate()` 만 호출.

## 기능

- `migrate(srcDir, outDir, options?)` — 대상 디렉터리로 전체 복사 후 필요한 bump 체인 실행.
- `planMigrations(from)` — 특정 버전에서 시작하는 bump 체인 반환.
- `MIGRATORS` — 등록된 migrator 레지스트리 (현재 3 엔트리: 1.0.0→1.1.0 / 1.1.0→1.2.0 / 1.2.0→1.3.0).

## 스코프

- **Mechanical only**. 각 migrator 는 결정론적 구조 변경만 수행한다.
  파츠 추가/분할, 물리 튜닝, deformers 트리 변경 같은 저작 결정은 `MIGRATION_REPORT.md` 에 TODO 로 기록.
- **버전 호환 무손실**. downgrade 는 지원하지 않는다. 이미 최신인 버전은 `migrate()` 가 거절.
- **idempotency**. 같은 src 에서 두 번 migrate 하면 결과 파일 내용이 byte-equal.

## 사용

```ts
import { migrate } from "@geny/migrator";

const result = await migrate(
  "rig-templates/base/halfbody/v1.2.0",
  "/tmp/halfbody-migrated",
);
console.log(result.targetVersion);   // "1.3.0"
console.log(result.appliedSteps);    // [{ from: "1.2.0", to: "1.3.0" }]
console.log(result.reportPath);      // "/tmp/halfbody-migrated/MIGRATION_REPORT.md"
```

## Migrator 작성 규칙

- 파일 배치: `src/migrations/<from>-to-<to>.ts` (kebab case, dot-separated 버전은 하이픈으로 치환).
  데이터 블록(파츠 spec, 파라미터 정의 등) 은 `src/migrations/data/<to>.ts` 에 분리.
- 공개 인터페이스: `Migrator { from: string; to: string; apply(outDir): Promise<string[]> }`.
  `apply` 의 반환 배열은 수동 TODO 문자열 목록 — `MIGRATION_REPORT.md` 에 체크박스로 전사됨.
- 반드시 `template.manifest.json` 의 `version` 을 `to` 로 bump + `cubism_mapping` 에 신규 파라미터 추가.
- 파츠/deformers 변경은 가능하면 `patchJson` / `writeIfAbsent` 로 mechanical 하게. 저작 판단이
  섞이면 TODO 로 분리.

등록: `src/migrations/index.ts` 의 `MIGRATORS` 배열 끝에 순서대로 append.

## 테스트

```
pnpm -F @geny/migrator test
```

`tests/migrate.test.ts` — 8 case (plan / registry / full chain / single hop / mechanical patch /
결정론 / outDir 거절). 골든 러너 step 14 에서 CLI shim (`scripts/rig-template/migrate.test.mjs`) 과
함께 실행.
