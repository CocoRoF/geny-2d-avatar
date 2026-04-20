#!/usr/bin/env node
/**
 * web-editor 정적 서버 — Node 내장 http 만 사용 (web-preview 와 동일 패턴, 의존성 0).
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const port = Number.parseInt(process.env.PORT ?? "4174", 10);

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
        `404 ${rel}\n\nDid you run \`pnpm run build:public\` first?`,
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
  process.stdout.write(`[web-editor] http://localhost:${port}/\n`);
});

for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, () => {
    server.close(() => process.exit(0));
  });
}
