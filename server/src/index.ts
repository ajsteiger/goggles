import express from "express";
import cors from "cors";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "./paths.js";
import { templatesRouter } from "./routes/templates.js";
import { snippetsRouter } from "./routes/snippets.js";
import { documentsRouter } from "./routes/documents.js";
import { buildRouter } from "./routes/build.js";

const PORT = Number(process.env.PORT ?? 5174);

async function ensureDataDirs() {
  await mkdir(path.join(DATA_DIR, "templates"), { recursive: true });
  await mkdir(path.join(DATA_DIR, "snippets"), { recursive: true });
  await mkdir(path.join(DATA_DIR, "documents"), { recursive: true });
}

async function main() {
  await ensureDataDirs();
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "4mb" }));
  app.use("/api/templates", templatesRouter);
  app.use("/api/snippets", snippetsRouter);
  app.use("/api/documents", documentsRouter);
  app.use("/api/documents", buildRouter);
  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.listen(PORT, () => console.log(`goggles server on :${PORT}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
