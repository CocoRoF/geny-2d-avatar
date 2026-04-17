import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "./loader.js";
import { convertPoseFromTemplate } from "./converters/pose.js";
import { convertPhysicsFromTemplate } from "./converters/physics.js";
import { convertMotionFromTemplate } from "./converters/motion.js";
import { convertCdiFromTemplate } from "./converters/cdi.js";
import { convertModelFromTemplate } from "./converters/model.js";
import { convertExpressionFromTemplate } from "./converters/expression.js";
import { assembleBundle, snapshotBundle } from "./bundle.js";
import { assembleAvatarBundle, readAvatarExportSpec } from "./avatar-bundle.js";
import { canonicalJson } from "./util/canonical-json.js";

type Command =
  | "pose"
  | "physics"
  | "motion"
  | "cdi"
  | "model"
  | "expression"
  | "bundle"
  | "avatar";

interface Args {
  command: Command;
  /** pose/physics/motion/cdi/model/bundle: template dir. avatar: unused. */
  template?: string;
  /** avatar: avatar-export spec file. */
  spec?: string;
  /** avatar: rig-templates root directory. */
  rigTemplatesRoot?: string;
  /** JSON 출력 경로 (pose/physics/motion/cdi/model). bundle/avatar 은 `--out-dir` 사용. */
  out?: string;
  /** bundle/avatar 전용 — 번들 출력 디렉터리. */
  outDir?: string;
  pack?: string;
  /** expression: expression_id (e.g., 'expression.smile'). */
  expression?: string;
  mocPath?: string;
  texturePaths?: string[];
  lipsync?: "simple" | "precise";
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0) {
    usage("missing <command>");
  }
  const first = argv[0];
  if (first === "-h" || first === "--help") {
    printHelp();
    process.exit(0);
  }
  if (
    first !== "pose" &&
    first !== "physics" &&
    first !== "motion" &&
    first !== "cdi" &&
    first !== "model" &&
    first !== "expression" &&
    first !== "bundle" &&
    first !== "avatar"
  ) {
    usage(
      `unknown command '${first}' (supported: pose, physics, motion, cdi, model, expression, bundle, avatar)`,
    );
  }
  const command = first;

  let template: string | undefined;
  let spec: string | undefined;
  let rigTemplatesRoot: string | undefined;
  let out: string | undefined;
  let outDir: string | undefined;
  let pack: string | undefined;
  let expression: string | undefined;
  let mocPath: string | undefined;
  let texturePaths: string[] | undefined;
  let lipsync: "simple" | "precise" | undefined;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--template":
        template = argv[++i];
        break;
      case "--spec":
        spec = argv[++i];
        break;
      case "--rig-templates-root":
        rigTemplatesRoot = argv[++i];
        break;
      case "--out":
        out = argv[++i];
        break;
      case "--out-dir":
        outDir = argv[++i];
        break;
      case "--pack":
        pack = argv[++i];
        break;
      case "--expression":
        expression = argv[++i];
        break;
      case "--moc":
        mocPath = argv[++i];
        break;
      case "--texture": {
        const v = argv[++i];
        if (!v) usage("missing value for --texture");
        (texturePaths ??= []).push(v!);
        break;
      }
      case "--lipsync": {
        const v = argv[++i];
        if (v !== "simple" && v !== "precise") usage(`--lipsync must be 'simple' or 'precise'`);
        lipsync = v;
        break;
      }
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        usage(`unknown argument '${arg}'`);
    }
  }
  if (command === "avatar") {
    if (!spec) usage("avatar: missing --spec <path>");
    if (!rigTemplatesRoot) usage("avatar: missing --rig-templates-root <dir>");
    if (!outDir) usage("avatar: missing --out-dir <dir>");
    if (mocPath || texturePaths || lipsync) {
      usage(
        "avatar: --moc / --texture / --lipsync are not accepted; set them inside the export spec (session 11 D7)",
      );
    }
  } else {
    if (!template) usage("missing --template <dir>");
    if (command === "bundle") {
      if (!outDir) usage("bundle: missing --out-dir <dir>");
    } else {
      if (!out) usage("missing --out <file>");
    }
    if (command === "motion" && !pack) usage("motion: missing --pack <pack_id>");
    if (command === "expression" && !expression) {
      usage("expression: missing --expression <expression_id>");
    }
  }
  return {
    command,
    ...(template ? { template } : {}),
    ...(spec ? { spec } : {}),
    ...(rigTemplatesRoot ? { rigTemplatesRoot } : {}),
    ...(out ? { out } : {}),
    ...(outDir ? { outDir } : {}),
    ...(pack ? { pack } : {}),
    ...(expression ? { expression } : {}),
    ...(mocPath ? { mocPath } : {}),
    ...(texturePaths ? { texturePaths } : {}),
    ...(lipsync ? { lipsync } : {}),
  };
}

function usage(msg: string): never {
  process.stderr.write(`exporter-core: ${msg}\n`);
  printHelp();
  process.exit(2);
}

function printHelp(): void {
  process.stderr.write(
    [
      "usage: exporter-core <command> [options]",
      "",
      "commands:",
      "  pose       Convert template pose.json → Cubism pose3.json",
      "  physics    Convert template physics/physics.json → Cubism physics3.json",
      "  motion     Convert a single motion pack → Cubism motion3.json (requires --pack)",
      "  cdi        Convert parameters + parts → Cubism cdi3.json",
      "  model      Build Cubism model3.json (bundle manifest)",
      "  expression Convert a single expression pack → Cubism exp3.json (requires --expression)",
      "  bundle     Assemble a full Cubism bundle directory (all 5 JSONs + motions/ + expressions/)",
      "  avatar     Assemble a Cubism bundle from an avatar-export spec (session 11)",
      "",
      "common options:",
      "  --template <dir>               Path to rig template directory (pose/physics/motion/cdi/model/bundle)",
      "  --spec <path>                  Avatar export spec path (avatar only)",
      "  --rig-templates-root <dir>     rig-templates/ root (avatar only)",
      "  --out <file>                   Output path for the generated JSON (pose/physics/motion/cdi/model)",
      "  --out-dir <dir>                Output directory (bundle, avatar)",
      "",
      "command-specific options:",
      "  --pack <pack_id>             motion: motion pack id (e.g. 'idle.default')",
      "  --expression <id>            expression: expression id (e.g. 'expression.smile')",
      "  --moc <path>                 model/bundle: override Moc path (default 'avatar.moc3')",
      "  --texture <path>             model/bundle: repeatable; override Textures list",
      "  --lipsync simple|precise     model/bundle: LipSync group mode (default simple)",
      "",
      "note: avatar takes overrides only via the spec file; --moc/--texture/--lipsync are rejected there (session 11 D7).",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.command === "avatar") {
    const specPath = resolve(args.spec!);
    const spec = readAvatarExportSpec(specPath);
    const root = resolve(args.rigTemplatesRoot!);
    const outDir = resolve(args.outDir!);
    const res = assembleAvatarBundle(spec, root, outDir);
    const snap = snapshotBundle(res);
    process.stdout.write(snap);
    process.stderr.write(
      `exporter-core: wrote avatar bundle at ${outDir} — ${res.files.length} files, ${
        res.files.reduce((a, f) => a + f.bytes, 0)
      } bytes (bundle_name=${spec.bundle_name})\n`,
    );
    return;
  }

  const tpl = loadTemplate(resolve(args.template!));

  if (args.command === "bundle") {
    const outDir = resolve(args.outDir!);
    const opts: Parameters<typeof assembleBundle>[2] = {};
    if (args.mocPath !== undefined) opts.mocPath = args.mocPath;
    if (args.texturePaths !== undefined) opts.texturePaths = args.texturePaths;
    if (args.lipsync !== undefined) opts.lipsync = args.lipsync;
    const res = assembleBundle(tpl, outDir, opts);
    const snap = snapshotBundle(res);
    process.stdout.write(snap);
    process.stderr.write(
      `exporter-core: wrote bundle at ${outDir} — ${res.files.length} files, ${
        res.files.reduce((a, f) => a + f.bytes, 0)
      } bytes\n`,
    );
    return;
  }

  let json: unknown;
  switch (args.command) {
    case "pose":
      json = convertPoseFromTemplate(tpl);
      break;
    case "physics":
      json = convertPhysicsFromTemplate(tpl);
      break;
    case "motion":
      json = convertMotionFromTemplate(tpl, args.pack!);
      break;
    case "cdi":
      json = convertCdiFromTemplate(tpl);
      break;
    case "expression":
      json = convertExpressionFromTemplate(tpl, args.expression!);
      break;
    case "model": {
      const opts: Parameters<typeof convertModelFromTemplate>[1] = {};
      if (args.mocPath !== undefined) opts.mocPath = args.mocPath;
      if (args.texturePaths !== undefined) opts.texturePaths = args.texturePaths;
      if (args.lipsync !== undefined) opts.lipsync = args.lipsync;
      json = convertModelFromTemplate(tpl, opts);
      break;
    }
  }
  const bytes = canonicalJson(json);
  const outPath = resolve(args.out!);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes, "utf8");
  process.stderr.write(`exporter-core: wrote ${outPath} (${bytes.length} bytes)\n`);
}

main();
