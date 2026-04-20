#!/usr/bin/env node
// scripts/rig-template/migrate.mjs
// 공식 `halfbody` 계열 리그 템플릿 순방향 마이그레이션 CLI shim.
//
// 세션 111 — 마이그레이터 로직은 `@geny/migrator` 로 이동했다. 이 파일은
// argv 를 파싱해 `migrate()` 에 위임하고 stderr 진행 메시지만 찍는 얇은 shim.
//
// CLI:
//   node scripts/rig-template/migrate.mjs <srcDir> <outDir>
//
// 예:
//   node scripts/rig-template/migrate.mjs rig-templates/base/halfbody/v1.0.0 /tmp/migrated-v1.3.0
//
// 동작:
//   1) <srcDir> 를 <outDir> 로 전체 복사 (outDir 비어 있어야 함).
//   2) template.manifest.json 의 version 을 읽어 현재 버전 감지.
//   3) MIGRATORS 레지스트리 순서대로 적용 (v1.0.0 → v1.1.0 → v1.2.0 → v1.3.0).
//   4) MIGRATION_REPORT.md 에 수동 TODO 를 기록.
//
// 참고: `@geny/migrator` 가 빌드되어 있어야 한다 — CI 는 골든 러너가 책임.
// 결정: migrator 는 보수적 (세션 10 D1). 데이터 손실 없음. downgrade 없음.

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migratorDist = resolve(
  __dirname,
  "..",
  "..",
  "packages",
  "migrator",
  "dist",
  "index.js",
);
const { migrate } = await import(migratorDist);

async function main() {
  const [srcArg, outArg] = process.argv.slice(2);
  if (!srcArg || !outArg) {
    process.stderr.write(
      "usage: node scripts/rig-template/migrate.mjs <srcDir> <outDir>\n",
    );
    process.exit(2);
  }
  const srcDir = resolve(srcArg);
  const outDir = resolve(outArg);

  try {
    const result = await migrate(srcDir, outDir);
    for (const step of result.appliedSteps) {
      process.stderr.write(`migrate: applying ${step.from} → ${step.to}\n`);
    }
    process.stderr.write(
      `migrate: ✅ done. target version ${result.targetVersion}. Manual TODOs → ${result.reportPath}\n`,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.startsWith("migrate: ")) {
      process.stderr.write(`${msg}\n`);
      process.exit(2);
    }
    process.stderr.write(`migrate: ${err instanceof Error ? (err.stack ?? msg) : msg}\n`);
    process.exit(1);
  }
}

main();
