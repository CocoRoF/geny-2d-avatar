/**
 * /api/bundle/:id/* - 조립된 번들 파일 정적 서빙 + zip 다운로드.
 *
 * 엔드포인트:
 *   GET /api/bundle/<id>/bundle.json       - 직접 참조 (cached)
 *   GET /api/bundle/<id>/<any-file>        - 번들 내 임의 파일 (model3.json / motion3.json / ...)
 *   GET /api/bundle/<id>/download          - 전체 번들 zip 스트리밍
 */
import { existsSync } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { extname, join, resolve, relative } from "node:path";
import archiver from "archiver";
const MIME = {
    ".json": "application/json; charset=utf-8",
    ".moc3": "application/octet-stream",
    ".png": "image/png",
    ".webp": "image/webp",
    ".js": "text/javascript; charset=utf-8",
    ".html": "text/html; charset=utf-8",
};
function contentType(path) {
    return MIME[extname(path).toLowerCase()] ?? "application/octet-stream";
}
export const bundleRoute = async (fastify, opts) => {
    const bundlesDir = resolve(opts.bundlesDir);
    // bundle_id + filepath 파라미터.
    // fastify v5 에서 wildcard 는 `*` 대신 `:subpath(*)` 형식 or Types.
    fastify.get("/api/bundle/:id/*", async (request, reply) => {
        const id = request.params.id;
        const subpath = request.params["*"] ?? "";
        if (!/^bnd_[a-f0-9]{32}$/.test(id)) {
            return reply
                .code(400)
                .send({ error: { code: "INVALID_BUNDLE_ID", message: "bundle_id 포맷 오류." } });
        }
        const bundleDir = join(bundlesDir, id);
        if (!existsSync(bundleDir)) {
            return reply
                .code(404)
                .send({ error: { code: "BUNDLE_NOT_FOUND", message: "bundle_id=" + id } });
        }
        // "download" 는 zip 스트리밍 (subpath="download").
        if (subpath === "download") {
            reply.header("content-type", "application/zip");
            reply.header("content-disposition", 'attachment; filename="' + id + '.zip"');
            const archive = archiver("zip", { zlib: { level: 6 } });
            archive.on("error", (err) => {
                request.log.error({ err }, "archiver error");
            });
            // Fastify v5 send Readable
            archive.directory(bundleDir, false);
            archive.finalize();
            return reply.send(archive);
        }
        // 파일 경로 안전성 체크 (.. 차단).
        const filePath = resolve(bundleDir, subpath);
        if (!filePath.startsWith(bundleDir + "/") && filePath !== bundleDir) {
            return reply.code(403).send({ error: { code: "FORBIDDEN", message: "경로 탈출 금지." } });
        }
        if (!existsSync(filePath)) {
            return reply
                .code(404)
                .send({ error: { code: "FILE_NOT_FOUND", message: "bundle/" + relative(bundleDir, filePath) } });
        }
        const st = await stat(filePath);
        if (!st.isFile()) {
            return reply
                .code(404)
                .send({ error: { code: "NOT_A_FILE", message: subpath + " 는 파일이 아닙니다." } });
        }
        const buf = await readFile(filePath);
        reply.header("content-type", contentType(filePath));
        reply.header("content-length", String(buf.length));
        return reply.send(buf);
    });
};
//# sourceMappingURL=bundle.js.map