import { cp, mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { writeReport } from "./io.js";
import { MIGRATORS } from "./migrations/index.js";
import type {
  MigrateOptions,
  MigrateResult,
  MigrationReportGroup,
  Migrator,
} from "./types.js";

export function planMigrations(from: string): Migrator[] {
  const plan: Migrator[] = [];
  let cursor = from;
  for (;;) {
    const next = MIGRATORS.find((m) => m.from === cursor);
    if (!next) break;
    plan.push(next);
    cursor = next.to;
  }
  return plan;
}

export async function migrate(
  srcDir: string,
  outDir: string,
  options: MigrateOptions = {},
): Promise<MigrateResult> {
  if (existsSync(outDir)) {
    const s = await stat(outDir);
    if (s.isDirectory()) {
      throw new Error(`migrate: refusing to write to existing ${outDir}`);
    }
  }

  const manifestPath = join(srcDir, "template.manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`migrate: no template.manifest.json at ${srcDir}`);
  }
  const srcManifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const srcVersion = String(srcManifest.version ?? "");

  const plan = planMigrations(srcVersion);
  if (plan.length === 0) {
    throw new Error(
      `migrate: no migrators for ${srcVersion} — already latest or unsupported. Available: ${MIGRATORS.map((m) => `${m.from}→${m.to}`).join(", ")}`,
    );
  }

  await mkdir(outDir, { recursive: true });
  await cp(srcDir, outDir, { recursive: true });

  const groups: MigrationReportGroup[] = [];
  for (const mig of plan) {
    const todos = await mig.apply(outDir);
    groups.push({ from: mig.from, to: mig.to, todos });
  }

  const reportPath = options.reportPath ?? join(outDir, "MIGRATION_REPORT.md");
  await writeReport(reportPath, srcVersion, groups);

  const lastStep = plan[plan.length - 1]!;
  return {
    appliedSteps: plan.map((m) => ({ from: m.from, to: m.to })),
    targetVersion: lastStep.to,
    reportPath,
    todos: groups,
  };
}
