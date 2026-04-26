import express from "express";
import cors from "cors";
import { mkdir } from "node:fs/promises";
import { CORPUS_SNIPPETS_DIR, DATA_DIR, DOCUMENTS_DIR, LOCAL_SNIPPETS_DIR, OVERRIDE_SNIPPET_ASSET_BASE_DIRS, TEMPLATES_DIR, USING_EXTERNAL_SNIPPETS } from "./paths.js";
import { templatesRouter } from "./routes/templates.js";
import { snippetsRouter } from "./routes/snippets.js";
import { documentsRouter } from "./routes/documents.js";
import { buildRouter } from "./routes/build.js";
import { swiftlatexRouter } from "./routes/swiftlatex.js";

const PORT = Number(process.env.PORT ?? 5174);

function summarizeAssetOverrides(): string {
  if (OVERRIDE_SNIPPET_ASSET_BASE_DIRS.length === 0) return "none";
  return OVERRIDE_SNIPPET_ASSET_BASE_DIRS.join(", ");
}

async function ensureDataDirs() {
  await mkdir(TEMPLATES_DIR, { recursive: true });
  await mkdir(LOCAL_SNIPPETS_DIR, { recursive: true });
  await mkdir(DOCUMENTS_DIR, { recursive: true });
}

async function main() {
  await ensureDataDirs();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "4mb" }));
  app.use("/api/swiftlatex/pdftex/10/swiftlatexpdftex.fmt", express.raw({ type: "application/octet-stream", limit: "64mb" }));
  app.use("/api/templates", templatesRouter);
  app.use("/api/snippets", snippetsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/documents", buildRouter);
  app.use("/api/swiftlatex", swiftlatexRouter);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.listen(PORT, () => {
    console.log(`goggles server on :${PORT}`);
    console.log(`goggles data dir: ${DATA_DIR}`);
    console.log("goggles runtime:");
    console.log(`  snippets source: ${USING_EXTERNAL_SNIPPETS ? "external corpus" : "bundled corpus"}`);
    console.log(`  corpus dir: ${CORPUS_SNIPPETS_DIR}`);
    console.log(`  writable overlay dir: ${LOCAL_SNIPPETS_DIR}`);
    console.log(`  asset overrides: ${summarizeAssetOverrides()}`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
