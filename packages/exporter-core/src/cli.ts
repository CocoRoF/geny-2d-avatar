import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "./loader.js";
import { convertPoseFromTemplate } from "./converters/pose.js";
import { convertPhysicsFromTemplate } from "./converters/physics.js";
import { convertMotionFromTemplate } from "./converters/motion.js";
import { canonicalJson } from "./util/canonical-json.js";

type Command = "pose" | "physics" | "motion";

interface Args {
  command: Command;
  template: string;
  out: string;
  pack?: string;
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
  if (first !== "pose" && first !== "physics" && first !== "motion") {
    usage(`unknown command '${first}' (supported: pose, physics, motion)`);
  }
  const command = first;

  let template: string | undefined;
  let out: string | undefined;
  let pack: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--template":
        template = argv[++i];
        break;
      case "--out":
        out = argv[++i];
        break;
      case "--pack":
        pack = argv[++i];
        break;
      case "-h":
      case "--help":
        printHelp();
        process.exit(0);
        break;
      default:
        usage(`unknown argument '${arg}'`);
    }
  }
  if (!template) usage("missing --template <dir>");
  if (!out) usage("missing --out <file>");
  if (command === "motion" && !pack) usage("motion: missing --pack <pack_id>");
  return { command, template, out, ...(pack ? { pack } : {}) };
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
      "",
      "common options:",
      "  --template <dir>   Path to rig template directory (template.manifest.json at root)",
      "  --out <file>       Output path for the generated JSON",
      "",
      "motion-only options:",
      "  --pack <pack_id>   Motion pack id (e.g. 'idle.default'). Must exist under <template>/motions/.",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tpl = loadTemplate(resolve(args.template));
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
  }
  const bytes = canonicalJson(json);
  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes, "utf8");
  process.stderr.write(`exporter-core: wrote ${outPath} (${bytes.length} bytes)\n`);
}

main();
