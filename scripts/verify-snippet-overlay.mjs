import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { access, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const gogglesRoot = path.resolve(__dirname, "..");
const smokeId = "plan-overlay-smoke";
const forkId = "intake-connectivity-copy";

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readSnapshot(filePath) {
  if (!(await pathExists(filePath))) return null;
  const [fileStat, content] = await Promise.all([
    stat(filePath),
    readFile(filePath),
  ]);
  return {
    size: fileStat.size,
    mtimeMs: fileStat.mtimeMs,
    content,
  };
}

async function restoreFile(filePath, snapshot) {
  if (snapshot === null) {
    await rm(filePath, { force: true });
    return;
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, snapshot.content);
}

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

async function main() {
  buildServer();

  const { snippets } = await import(pathToFileURL(path.join(gogglesRoot, "server", "dist", "storage.js")).href);
  const { CORPUS_SNIPPETS_DIR, LOCAL_SNIPPETS_DIR } = await import(pathToFileURL(path.join(gogglesRoot, "server", "dist", "paths.js")).href);
  const smokeLocalPath = path.join(LOCAL_SNIPPETS_DIR, `${smokeId}.tex`);
  const forkLocalPath = path.join(LOCAL_SNIPPETS_DIR, `${forkId}.tex`);
  const smokeCorpusPath = path.join(CORPUS_SNIPPETS_DIR, `${smokeId}.tex`);

  await mkdir(LOCAL_SNIPPETS_DIR, { recursive: true });

  const smokeLocalBefore = await readSnapshot(smokeLocalPath);
  const forkLocalBefore = await readSnapshot(forkLocalPath);
  const corpusBefore = await readSnapshot(smokeCorpusPath);

  try {
    const listed = await snippets.list();
    assert.ok(listed.length > 1000, `expected more than 1000 snippets, got ${listed.length}`);

    await snippets.put(
      smokeId,
      "\\begin{problem}Overlay smoke test.\\end{problem}\n",
      "overlay smoke",
      "",
      "",
      {},
      ["overlay-smoke"],
    );

    assert.ok(await pathExists(smokeLocalPath), `expected local smoke file at ${smokeLocalPath}`);

    const corpusAfterPut = await readSnapshot(smokeCorpusPath);
    if (corpusBefore === null) {
      assert.equal(corpusAfterPut, null, `expected ${smokeCorpusPath} to remain absent`);
    } else {
      assert.ok(corpusAfterPut, `expected ${smokeCorpusPath} to still exist`);
      assert.equal(corpusAfterPut.size, corpusBefore.size, "expected corpus smoke file size to stay unchanged");
      assert.equal(corpusAfterPut.mtimeMs, corpusBefore.mtimeMs, "expected corpus smoke file mtime to stay unchanged");
      assert.deepEqual(corpusAfterPut.content, corpusBefore.content, "expected corpus smoke file content to stay unchanged");
    }

    await snippets.fork("intake-connectivity", forkId);
    assert.ok(await pathExists(forkLocalPath), `expected fork file at ${forkLocalPath}`);
  } finally {
    await restoreFile(smokeLocalPath, smokeLocalBefore);
    await restoreFile(forkLocalPath, forkLocalBefore);
  }

  console.log("verify-snippet-overlay: PASS");
}

main().catch((error) => {
  console.error("verify-snippet-overlay: FAIL");
  console.error(error);
  process.exit(1);
});
