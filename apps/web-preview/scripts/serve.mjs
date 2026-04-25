#!/usr/bin/env node
/**
 * web-preview 정적 서버.
 *
 * Node 내장 http 모듈로 앱 루트(`apps/web-preview/`) 를 서빙. 의존성 추가 없음 —
 * Foundation 레벨 E2E 에서는 빌드 체인 단순화가 우선.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    let rel = urlPath === "/" ? "/index.html" : urlPath;
    const full = resolve(appRoot, "." + rel);
    if (!full.startsWith(appRoot)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(full).catch(() => null);
    if (!info || !info.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end(
        `404 ${rel}\n\nDid you run \`pnpm run prepare\` first?`,
      );
      return;
    }
    const buf = await readFile(full);
    const mime = MIME[extname(full)] ?? "application/octet-stream";
    res.writeHead(200, {
      "content-type": mime,
      "cache-control": "no-store",
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(500).end(String(err?.message ?? err));
  }
});

server.listen(port, () => {
  // 첫 줄은 e2e-check.mjs 가 파싱 — 형식 유지.
  process.stdout.write(`[web-preview] http://localhost:${port}/\n`);
  process.stdout.write(`[web-preview] ➜ Builder UI:    http://localhost:${port}/builder.html\n`);
  process.stdout.write(`[web-preview] ➜ Live2D Demo:   http://localhost:${port}/live2d-demo.html\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
