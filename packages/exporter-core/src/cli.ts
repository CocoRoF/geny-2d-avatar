import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadTemplate } from "./loader.js";
import { convertPoseFromTemplate } from "./converters/pose.js";
import { canonicalJson } from "./util/canonical-json.js";

interface Args {
  command: "pose";
  template: string;
  out: string;
}

function parseArgs(argv: string[]): Args {
  if (argv.length === 0) {
    usage("missing <command>");
  }
  const command = argv[0];
  if (command === "-h" || command === "--help") {
    printHelp();
    process.exit(0);
  }
  if (command !== "pose") {
    usage(`unknown command '${command}' (supported: pose)`);
  }

  let template: string | undefined;
  let out: string | undefined;
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--template":
        template = argv[++i];
        break;
      case "--out":
        out = argv[++i];
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
  return { command, template, out };
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
      "  pose    Convert template pose.json → Cubism pose3.json",
      "",
      "options for 'pose':",
      "  --template <dir>   Path to rig template directory (must contain template.manifest.json + pose.json + parts/)",
      "  --out <file>       Output path for the generated pose3.json",
      "",
    ].join("\n"),
  );
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const tpl = loadTemplate(resolve(args.template));
  const pose3 = convertPoseFromTemplate(tpl);
  const bytes = canonicalJson(pose3);
  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, bytes, "utf8");
  process.stderr.write(`exporter-core: wrote ${outPath} (${bytes.length} bytes)\n`);
}

main();
