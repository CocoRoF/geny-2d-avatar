import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

import { loadWebAvatarBundle, WebAvatarBundleError } from "../src/loader.js";

const here = dirname(fileURLToPath(import.meta.url));
// Compiled location is `packages/web-avatar/dist-test/tests/loader.test.js`, so
// climb four levels to reach the repo root.
const repoRoot = resolve(here, "..", "..", "..", "..");
const goldenDir = resolve(repoRoot, "packages", "exporter-core", "tests", "golden");
const halfbodyTemplateDir = resolve(
  repoRoot,
  "rig-templates",
  "base",
  "halfbody",
  "v1.3.0",
);

/** 임시 번들 디렉터리 구성 — 골든 JSON + 템플릿 PNG 를 배치. */
function materializeGoldenBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-"));
  const webAvatar = readFileSync(join(goldenDir, "halfbody_v1.3.0.web-avatar.json"));
  const atlas = readFileSync(join(goldenDir, "halfbody_v1.3.0.atlas.json"));
  const bundleSnapshot = JSON.parse(
    readFileSync(join(goldenDir, "halfbody_v1.3.0.web-avatar-bundle.snapshot.json"), "utf8"),
  ) as { files: Array<{ path: string; sha256: string; bytes: number }> };

  writeFileSync(join(dir, "web-avatar.json"), webAvatar);
  writeFileSync(join(dir, "atlas.json"), atlas);
  const textureBuf = readFileSync(join(halfbodyTemplateDir, "textures/base.png"));
  mkdirSync(join(dir, "textures"), { recursive: true });
  writeFileSync(join(dir, "textures/base.png"), textureBuf);

  const manifest = {
    schema_version: "v1" as const,
    kind: "web-avatar-bundle" as const,
    format: 1 as const,
    template_id: "geny.base.halfbody",
    template_version: "1.2.0",
    avatar_id: null,
    files: bundleSnapshot.files.filter((f) => f.path !== "bundle.json"),
  };
  writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest, null, 2));
  return dir;
}

/** file:// URL 을 받아 Response 를 만드는 fetch — 브라우저 fetch 를 대체. */
function fsFetch(url: URL): Promise<Response> {
  if (url.protocol !== "file:") {
    return Promise.resolve(new Response(null, { status: 400 }));
  }
  try {
    const buf = readFileSync(fileURLToPath(url));
    return Promise.resolve(new Response(buf, { status: 200 }));
  } catch {
    return Promise.resolve(new Response(null, { status: 404 }));
  }
}

test("loadWebAvatarBundle: resolves bundle.json → web-avatar.json → atlas.json", async () => {
  const dir = materializeGoldenBundle();
  try {
    const bundleUrl = pathToFileURL(join(dir, "bundle.json"));
    const result = await loadWebAvatarBundle(bundleUrl, { fetch: fsFetch });

    assert.equal(result.manifest.kind, "web-avatar-bundle");
    assert.equal(result.manifest.schema_version, "v1");
    assert.equal(result.manifest.format, 1);

    assert.equal(result.meta.schema_version, "v1");
    assert.equal(result.meta.format, 1);
    assert.ok(result.meta.parameters.length > 0);
    assert.ok(result.meta.parts.length > 0);

    assert.ok(result.atlas !== null);
    assert.equal(result.atlas!.schema_version, "v1");
    assert.equal(result.atlas!.textures.length, 1);
    assert.equal(result.atlas!.textures[0]!.path, "textures/base.png");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadWebAvatarBundle: atlas is null when meta.atlas is null", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-noatlas-"));
  try {
    const meta = {
      schema_version: "v1" as const,
      format: 1 as const,
      template_id: null,
      template_version: null,
      avatar_id: null,
      parameter_groups: [],
      parameters: [],
      parts: [],
      motions: [],
      expressions: [],
      textures: [],
      atlas: null,
      physics_summary: null,
    };
    writeFileSync(join(dir, "web-avatar.json"), JSON.stringify(meta));
    const manifest = {
      schema_version: "v1" as const,
      kind: "web-avatar-bundle" as const,
      format: 1 as const,
      template_id: null,
      template_version: null,
      avatar_id: null,
      files: [{ path: "web-avatar.json", sha256: "a".repeat(64), bytes: 1 }],
    };
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest));
    const result = await loadWebAvatarBundle(pathToFileURL(join(dir, "bundle.json")), {
      fetch: fsFetch,
    });
    assert.equal(result.atlas, null);
    assert.equal(result.meta.atlas, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadWebAvatarBundle: throws INVALID_KIND on cubism-bundle", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-kind-"));
  try {
    const manifest = {
      schema_version: "v1",
      kind: "cubism-bundle",
      format: 1,
      template_id: null,
      template_version: null,
      avatar_id: null,
      files: [],
    };
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest));
    await assert.rejects(
      () =>
        loadWebAvatarBundle(pathToFileURL(join(dir, "bundle.json")), {
          fetch: fsFetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof WebAvatarBundleError);
        assert.equal((err as WebAvatarBundleError).code, "INVALID_KIND");
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadWebAvatarBundle: throws MISSING_FILE when web-avatar.json not in files[]", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-missing-"));
  try {
    const manifest = {
      schema_version: "v1",
      kind: "web-avatar-bundle",
      format: 1,
      template_id: null,
      template_version: null,
      avatar_id: null,
      files: [],
    };
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest));
    await assert.rejects(
      () =>
        loadWebAvatarBundle(pathToFileURL(join(dir, "bundle.json")), {
          fetch: fsFetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof WebAvatarBundleError);
        assert.equal((err as WebAvatarBundleError).code, "MISSING_FILE");
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadWebAvatarBundle: throws FETCH_FAILED on HTTP 404", async () => {
  const mockFetch = (): Promise<Response> =>
    Promise.resolve(new Response(null, { status: 404 }));
  await assert.rejects(
    () =>
      loadWebAvatarBundle("https://example.test/missing/bundle.json", {
        fetch: mockFetch,
      }),
    (err: unknown) => {
      assert.ok(err instanceof WebAvatarBundleError);
      assert.equal((err as WebAvatarBundleError).code, "FETCH_FAILED");
      return true;
    },
  );
});

test("loadWebAvatarBundle: throws INVALID_JSON on malformed bundle.json", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-badjson-"));
  try {
    writeFileSync(join(dir, "bundle.json"), "{not json");
    await assert.rejects(
      () =>
        loadWebAvatarBundle(pathToFileURL(join(dir, "bundle.json")), {
          fetch: fsFetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof WebAvatarBundleError);
        assert.equal((err as WebAvatarBundleError).code, "INVALID_JSON");
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("loadWebAvatarBundle: throws INVALID_SCHEMA on schema_version mismatch", async () => {
  const dir = mkdtempSync(join(tmpdir(), "geny-web-avatar-loader-schema-"));
  try {
    const manifest = {
      schema_version: "v2",
      kind: "web-avatar-bundle",
      format: 1,
      template_id: null,
      template_version: null,
      avatar_id: null,
      files: [],
    };
    writeFileSync(join(dir, "bundle.json"), JSON.stringify(manifest));
    await assert.rejects(
      () =>
        loadWebAvatarBundle(pathToFileURL(join(dir, "bundle.json")), {
          fetch: fsFetch,
        }),
      (err: unknown) => {
        assert.ok(err instanceof WebAvatarBundleError);
        assert.equal((err as WebAvatarBundleError).code, "INVALID_SCHEMA");
        return true;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
