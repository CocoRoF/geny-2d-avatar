/**
 * Geny API 실행 진입점. 로컬 dev / 배포 공용.
 *
 * 환경변수:
 *   PORT                  (default 3000)
 *   GENY_RIG_TEMPLATES    (default 저장소 루트 기준 rig-templates/)
 *   GENY_LOG              (default false)
 */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..", "..");

const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const rigTemplatesRoot = process.env.GENY_RIG_TEMPLATES
  ? resolve(process.env.GENY_RIG_TEMPLATES)
  : resolve(repoRoot, "rig-templates");
const logger = process.env.GENY_LOG === "true";

const app = await buildApp({ rigTemplatesRoot, logger });

try {
  const addr = await app.listen({ port, host: "0.0.0.0" });
  process.stdout.write(`[geny/api] listening on ${addr}\n`);
  process.stdout.write(`[geny/api] rig-templates root: ${rigTemplatesRoot}\n`);
} catch (err) {
  process.stderr.write(`[geny/api] listen failed: ${(err as Error).message}\n`);
  process.exit(1);
}
