#!/usr/bin/env node
/**
 * @geny/license-verifier CLI — docs/11 §9.3 `license.verify` 의 커맨드라인 투영.
 *
 * 사용:
 *   license-verifier verify \
 *     --kind license|provenance \
 *     --file <doc.json> \
 *     --registry <registry.json> \
 *     [--bundle <bundle.json>] \
 *     [--trust production|fixture] \
 *     [--now <RFC3339>]
 *
 * 성공: exit 0 + stdout "ok key=<key_id> trust=<scope>"
 * 실패: exit 1 + stderr "✖ <code>: <message>"
 */

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const distUrl = pathToFileURL(resolve(here, "..", "dist", "index.js")).toString();
const {
  SignerRegistry,
  LicenseVerifyError,
  verifyLicense,
  verifyProvenance,
} = await import(distUrl);

const args = parseArgs(process.argv.slice(2));

if (args._[0] !== "verify") {
  usage("missing subcommand");
}
if (!args.kind || !["license", "provenance"].includes(args.kind)) {
  usage("--kind must be 'license' or 'provenance'");
}
if (!args.file) usage("--file is required");
if (!args.registry) usage("--registry is required");

const trust = args.trust ?? "production";
if (!["production", "fixture"].includes(trust)) {
  usage(`--trust must be 'production' or 'fixture' (got ${trust})`);
}

const now = args.now ? new Date(args.now) : new Date();
if (Number.isNaN(now.getTime())) usage(`--now is not a valid date: ${args.now}`);

let registry;
try {
  registry = SignerRegistry.loadFromFile(resolve(args.registry));
} catch (err) {
  fatal(err);
}

let doc;
try {
  doc = JSON.parse(readFileSync(resolve(args.file), "utf8"));
} catch (err) {
  fatal(new Error(`file read/parse: ${err.message ?? err}`));
}

let expectedBundleManifestSha256 = undefined;
if (args.bundle) {
  const bundleBytes = readFileSync(resolve(args.bundle));
  expectedBundleManifestSha256 = createHash("sha256").update(bundleBytes).digest("hex");
}

const opts = { trust, now };
if (expectedBundleManifestSha256 !== undefined) {
  opts.expectedBundleManifestSha256 = expectedBundleManifestSha256;
}

try {
  const result = args.kind === "license"
    ? verifyLicense(doc, registry, opts)
    : verifyProvenance(doc, registry, opts);
  process.stdout.write(`ok key=${result.key.key_id} trust=${result.trust}\n`);
  process.exit(0);
} catch (err) {
  fatal(err);
}

// ---- helpers ----

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const tok = argv[i];
    if (tok.startsWith("--")) {
      const name = tok.slice(2);
      const val = argv[i + 1];
      if (val === undefined || val.startsWith("--")) {
        out[name] = true;
      } else {
        out[name] = val;
        i++;
      }
    } else {
      out._.push(tok);
    }
  }
  return out;
}

function usage(msg) {
  if (msg) process.stderr.write(`✖ ${msg}\n\n`);
  process.stderr.write(
    [
      "usage: license-verifier verify --kind <license|provenance> --file <path> --registry <path>",
      "         [--bundle <bundle.json>] [--trust production|fixture] [--now <RFC3339>]",
      "",
      "exit 0 on ok, 1 on verify failure, 2 on usage error.",
    ].join("\n") + "\n",
  );
  process.exit(2);
}

function fatal(err) {
  if (err instanceof LicenseVerifyError) {
    process.stderr.write(`✖ ${err.code}: ${err.message}\n`);
  } else {
    process.stderr.write(`✖ ${err?.stack ?? err}\n`);
  }
  process.exit(1);
}
