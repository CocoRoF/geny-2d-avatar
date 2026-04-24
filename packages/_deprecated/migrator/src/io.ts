import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";

import type { MigrationReportGroup } from "./types.js";

export async function patchJson(
  path: string,
  fn: (doc: any) => any,
): Promise<void> {
  const raw = await readFile(path, "utf8");
  const doc = JSON.parse(raw);
  const next = fn(doc);
  const serialized = JSON.stringify(next, null, 2) + "\n";
  await writeFile(path, serialized, "utf8");
}

export async function writeIfAbsent(
  path: string,
  content: string,
): Promise<void> {
  if (existsSync(path)) return;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

export async function appendIfMissing(
  path: string,
  sentinel: string,
  appendix: string,
): Promise<void> {
  if (!existsSync(path)) return;
  const cur = await readFile(path, "utf8");
  if (cur.includes(sentinel)) return;
  const sep = cur.endsWith("\n") ? "" : "\n";
  await writeFile(path, cur + sep + appendix, "utf8");
}

export async function writeReport(
  path: string,
  srcVersion: string,
  groups: MigrationReportGroup[],
): Promise<void> {
  const lines: string[] = [];
  lines.push(`# Migration Report`);
  lines.push("");
  lines.push(`- Source version: \`${srcVersion}\``);
  lines.push(
    `- Applied steps: ${groups.map((g) => `\`${g.from}→${g.to}\``).join(", ")}`,
  );
  lines.push("");
  lines.push(
    "이 파일은 자동 마이그레이션이 **수행하지 않은** 수동 작업 목록입니다. 파츠 spec, 물리 튜닝, deformers 트리, pose 그룹 등은 저작자 판단이 필요합니다.",
  );
  lines.push("");
  for (const g of groups) {
    lines.push(`## ${g.from} → ${g.to}`);
    lines.push("");
    if (g.todos.length === 0) {
      lines.push("- (자동 이행 항목만 있었음. 수동 작업 없음.)");
    } else {
      for (const t of g.todos) lines.push(`- [ ] ${t}`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(
    "마이그레이션 후 `pnpm run validate:schemas` 와 `pnpm run test:golden` 을 실행해 회귀를 확인하세요.",
  );
  lines.push("");
  await writeFile(path, lines.join("\n"), "utf8");
}
