#!/usr/bin/env node
/**
 * scripts/setup-cubism-core.mjs
 *
 * Live2D Cubism Core (`vendor/live2dcubismcore/live2dcubismcore.min.js`) 검증 +
 * 각 앱의 `public/vendor/` 로 복사.
 *
 * ADR 002 — Cubism Core 는 Live2D proprietary, 재배포 금지 → 저장소에는 포함 無.
 * 사용자가 수동 다운로드 후 본 스크립트로 배포.
 *
 * 동작:
 *   1) `vendor/live2dcubismcore/live2dcubismcore.min.js` 존재 + 최소 크기 체크
 *   2) sha256 계산 (로그에 노출)
 *   3) `apps/web-preview/public/vendor/`, `apps/web-editor/public/vendor/` 로 복사
 *   4) 각 복사본 sha256 일치 검증
 *
 * Exit 0: 전 앱에 정상 배포. Exit 2: 원본 파일 없음 (사용자 설치 필요).
 */

import { readFile, writeFile, mkdir, cp, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");
const SOURCE = join(REPO_ROOT, "vendor", "live2dcubismcore", "live2dcubismcore.min.js");
const MIN_SIZE_BYTES = 100_000; // 실 Core 는 수백 KB. 잘못된 파일(빈 파일 등) 방어용 하한.

const TARGET_APPS = [
  "apps/web-preview",
  "apps/web-editor",
];

async function sha256(path) {
  const buf = await readFile(path);
  return createHash("sha256").update(buf).digest("hex");
}

async function main() {
  if (!existsSync(SOURCE)) {
    process.stderr.write(
      `[cubism-core] ❌ 소스 파일 없음: ${SOURCE}\n` +
        `\n` +
        `수동 설치 절차 (ADR 002):\n` +
        `  1) https://www.live2d.com/sdk/download/web/ 에서 Cubism SDK for Web 다운로드\n` +
        `  2) 압축 해제 → Core/live2dcubismcore.min.js 파일을 복사\n` +
        `     vendor/live2dcubismcore/live2dcubismcore.min.js 로 배치\n` +
        `  3) 본 스크립트 재실행\n`,
    );
    process.exit(2);
  }

  const st = await stat(SOURCE);
  if (st.size < MIN_SIZE_BYTES) {
    process.stderr.write(
      `[cubism-core] ❌ 소스 파일 크기 의심스러움 (${st.size} bytes < ${MIN_SIZE_BYTES} bytes 하한).\n` +
        `   잘못된 파일이거나 일부만 복사됐을 수 있음. Live2D 다운로드 재확인.\n`,
    );
    process.exit(1);
  }

  const srcSha = await sha256(SOURCE);
  process.stdout.write(
    `[cubism-core] ✅ source 검증 OK (bytes=${st.size}, sha256=${srcSha.slice(0, 16)}…)\n`,
  );

  let okCount = 0;
  for (const appRel of TARGET_APPS) {
    const appPublic = join(REPO_ROOT, appRel, "public", "vendor");
    const appDest = join(appPublic, "live2dcubismcore.min.js");
    await mkdir(appPublic, { recursive: true });
    await cp(SOURCE, appDest);
    const destSha = await sha256(appDest);
    if (destSha !== srcSha) {
      process.stderr.write(
        `[cubism-core] ❌ 복사본 sha 불일치: ${appDest}\n  expected=${srcSha}\n  actual=${destSha}\n`,
      );
      process.exit(1);
    }
    process.stdout.write(`[cubism-core] ✅ ${appRel}/public/vendor/live2dcubismcore.min.js 복사\n`);
    okCount += 1;
  }

  process.stdout.write(`\n[cubism-core] ✅ ${okCount}/${TARGET_APPS.length} 앱 배포 완료\n`);
}

await main();
