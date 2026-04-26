import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gogglesRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(gogglesRoot, "..");

function buildServer() {
  execFileSync("npm", ["run", "build", "-w", "shared"], {
    cwd: gogglesRoot,
    stdio: "inherit",
  });
  execFileSync("npm", ["run", "build", "-w", "server"], {
    cwd: gogglesRoot,
    stdio: "inherit",
  });
}

function readRuntimeSummary(env = {}) {
  const script = [
    "const mod = await import(process.argv[1]);",
    "console.log(JSON.stringify(mod.getRuntimeSummary()));",
  ].join(" ");
  const output = execFileSync(
    "node",
    [
      "--input-type=module",
      "--eval",
      script,
      path.join(gogglesRoot, "server", "dist", "index.js"),
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        GOGGLES_IMPORT_ONLY: "1",
        ...env,
      },
      encoding: "utf8",
    },
  );
  return JSON.parse(output.trim());
}

function expectLine(lines, expected) {
  assert.ok(lines.includes(expected), `expected runtime summary line: ${expected}\nactual:\n${lines.join("\n")}`);
}

function main() {
  buildServer();

  const defaultLines = readRuntimeSummary();
  expectLine(defaultLines, `goggles data dir: ${path.join(gogglesRoot, "data")}`);
  expectLine(defaultLines, "goggles runtime:");
  expectLine(defaultLines, `  snippets source: external corpus`);
  expectLine(defaultLines, `  corpus dir: ${path.join(workspaceRoot, "goggles-export")}`);
  expectLine(defaultLines, `  writable overlay dir: ${path.join(gogglesRoot, "data", "snippets-local")}`);
  expectLine(defaultLines, "  asset overrides: none");

  const overrideLines = readRuntimeSummary({
    GOGGLES_SNIPPETS_DIR: "goggles/data/snippets",
    GOGGLES_LOCAL_SNIPPETS_DIR: "goggles/data/snippets-local-test",
    GOGGLES_SNIPPET_ASSET_ROOT: [
      "goggles-export/assets/intake-r11-p1",
      "goggles-export/assets/intake-r11-p1",
      "goggles-export/assets/intake-1115-problems-p1",
    ].join(path.delimiter),
  });
  expectLine(overrideLines, "  snippets source: bundled corpus");
  expectLine(overrideLines, `  corpus dir: ${path.join(gogglesRoot, "data", "snippets")}`);
  expectLine(overrideLines, `  writable overlay dir: ${path.join(gogglesRoot, "data", "snippets-local-test")}`);
  expectLine(
    overrideLines,
    `  asset overrides: ${path.join(workspaceRoot, "goggles-export", "assets", "intake-r11-p1")}, ${path.join(workspaceRoot, "goggles-export", "assets", "intake-1115-problems-p1")}`,
  );

  console.log("verify-runtime-summary: PASS");
}

try {
  main();
} catch (error) {
  console.error("verify-runtime-summary: FAIL");
  console.error(error);
  process.exit(1);
}
