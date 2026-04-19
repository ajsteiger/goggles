import { Router } from "express";
import { exec } from "node:child_process";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import { documents } from "../storage.js";
import { assembleBuild } from "@goggles/shared/src";

const execAsync = promisify(exec);

export const buildRouter = Router();

buildRouter.post("/:id/build", async (req, res) => {
  const doc = await documents.get(req.params.id);
  if (!doc) return res.status(404).json({ error: "not found" });

  const tex = assembleBuild(doc);
  const dir = path.join(tmpdir(), `goggles-${nanoid(8)}`);

  try {
    await mkdir(dir, { recursive: true });
    const texPath = path.join(dir, "doc.tex");
    await writeFile(texPath, tex, "utf8");

    try {
      await execAsync(
        `pdflatex -interaction=nonstopmode -output-directory "${dir}" "${texPath}"`,
      );
    } catch (e: any) {
      // pdflatex exits 1 on warnings too — try to read the pdf anyway
      const logPath = path.join(dir, "doc.log");
      let log = "";
      try { log = await readFile(logPath, "utf8"); } catch {}
      const pdfPath = path.join(dir, "doc.pdf");
      try {
        const pdf = await readFile(pdfPath);
        res.setHeader("content-type", "application/pdf");
        return res.send(pdf);
      } catch {
        return res.status(422).json({ error: "pdflatex failed", log });
      }
    }

    const pdf = await readFile(path.join(dir, "doc.pdf"));
    res.setHeader("content-type", "application/pdf");
    res.send(pdf);
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
});
