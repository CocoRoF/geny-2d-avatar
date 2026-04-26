/**
 * Geny API 실행 진입점. 로컬 dev / 배포 공용.
 *
 * 인프라 환경변수:
 *   PORT                                 (default 3000)
 *   GENY_RIG_TEMPLATES                   (default 저장소 루트 기준 rig-templates/)
 *   GENY_LOG                             (default false)
 *
 * AI 벤더 키 — `.env` 파일에 두면 dev/start 스크립트가 `node --env-file-if-exists` 로 자동 로드:
 *   GEMINI_API_KEY 또는 GOOGLE_API_KEY   (nano-banana / Google Gemini 2.5 Flash Image)
 *   OPENAI_API_KEY                       (openai-image / gpt-image-1 / dall-e-3)
 *
 * `.env` 우선순위 (뒤에 로드된 파일이 override):
 *   1. 저장소 루트 `.env`
 *   2. `apps/api/.env`
 *
 * .env.example 참고. 키 없는 어댑터는 supports()=false 로 자동 skip → pollinations + mock 폴백.
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
// 기본은 활성. 명시적으로 GENY_LOG=false 일 때만 끔. 어댑터 호출 / 라우트 진입 / 응답 등
// 모든 활동을 stdout 으로 출력해 사용자가 어디서 무엇이 일어나는지 볼 수 있도록.
const logger = process.env.GENY_LOG !== "false";

const app = await buildApp({ rigTemplatesRoot, logger });

// 시작 시 어댑터 키 상태 출력 (env 로드 검증용).
function reportKeyStatus() {
  const has = (k: string) => (process.env[k] ?? "").length > 0;
  const lines = [
    "  GEMINI_API_KEY    : " + (has("GEMINI_API_KEY") ? "✓ set" : "✗ missing"),
    "  GOOGLE_API_KEY    : " + (has("GOOGLE_API_KEY") ? "✓ set" : "✗ missing"),
    "  OPENAI_API_KEY    : " + (has("OPENAI_API_KEY") ? "✓ set" : "✗ missing"),
  ];
  const disabled = [];
  if (process.env.GENY_NANO_BANANA_DISABLED === "true") disabled.push("nano-banana");
  if (process.env.GENY_OPENAI_IMAGE_DISABLED === "true") disabled.push("openai-image");
  if (process.env.GENY_POLLINATIONS_DISABLED === "true") disabled.push("pollinations");
  return lines.join("\n") +
    (disabled.length > 0 ? "\n  disabled adapters : " + disabled.join(", ") : "");
}

try {
  const addr = await app.listen({ port, host: "0.0.0.0" });
  process.stdout.write(`[geny/api] listening on ${addr}\n`);
  process.stdout.write(`[geny/api] rig-templates root: ${rigTemplatesRoot}\n`);
  process.stdout.write(`[geny/api] adapter keys:\n${reportKeyStatus()}\n`);
} catch (err) {
  process.stderr.write(`[geny/api] listen failed: ${(err as Error).message}\n`);
  process.exit(1);
}
