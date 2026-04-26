import { Router } from "express";
import { exec } from "node:child_process";
import { mkdir, writeFile, readFile, rm, stat, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { nanoid } from "nanoid";
import { documents } from "../storage.js";
import { assembleBuild } from "@goggles/shared/src";
import { SNIPPET_ASSET_BASE_DIRS, documentDir } from "../paths.js";
import {
  candidateAssetSourcePaths,
  extractAssetRefs,
  isSafeAssetRef,
  stageDestinationPath,
} from "../assetRefs.js";

const execAsync = promisify(exec);

export const buildRouter = Router();

export type BuildPdfSuccess = {
  ok: true;
  pdf: Buffer;
};

export type BuildMissingAssetsFailure = {
  ok: false;
  status: 422;
  error: "missing assets";
  missingAssets: string[];
};

export type BuildPdflatexFailure = {
  ok: false;
  status: 422;
  error: "pdflatex failed";
  log: string;
};

export type BuildDocumentResult =
  | BuildPdfSuccess
  | BuildMissingAssetsFailure
  | BuildPdflatexFailure;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isReadableRegularFile(filePath: string): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    return fileStat.isFile();
  } catch {
    return false;
  }
}

async function stageAsset(ref: string, dir: string, docId: string, baseDirs: string[]) {
  if (!isSafeAssetRef(ref)) return false;
  const destPath = stageDestinationPath(dir, ref);
  if (!destPath) return false;

  for (const sourcePath of candidateAssetSourcePaths(ref, documentDir(docId), baseDirs)) {
    if (!(await pathExists(sourcePath))) continue;
    if (!(await isReadableRegularFile(sourcePath))) continue;
    try {
      await mkdir(path.dirname(destPath), { recursive: true });
      await copyFile(sourcePath, destPath);
    } catch {
      continue;
    }
    return true;
  }
  return false;
}

export async function stageBuildAssets(docId: string, tex: string, dir: string) {
  const assetRefs = extractAssetRefs(tex);
  const assetBaseDirs = Array.from(new Set([
    ...SNIPPET_ASSET_BASE_DIRS,
  ]));
  const staged = await Promise.all(assetRefs.map(async (ref) => ({
    ref,
    resolved: await stageAsset(ref, dir, docId, assetBaseDirs),
  })));
  return {
    assetRefs,
    missingAssets: staged.filter((entry) => !entry.resolved).map((entry) => entry.ref),
  };
}

export async function buildDocumentPdf(docId: string): Promise<BuildDocumentResult> {
  const doc = await documents.get(docId);
  if (!doc) {
    return {
      ok: false,
      status: 422,
      error: "pdflatex failed",
      log: "document not found",
    };
  }

  const tex = assembleBuild(doc);
  const dir = path.join(tmpdir(), `goggles-${nanoid(8)}`);

  try {
    await mkdir(dir, { recursive: true });
    const { missingAssets } = await stageBuildAssets(doc.id, tex, dir);
    if (missingAssets.length) {
      return {
        ok: false,
        status: 422,
        error: "missing assets",
        missingAssets,
      };
    }

    const texPath = path.join(dir, "doc.tex");
    await writeFile(texPath, tex, "utf8");

    try {
      await execAsync(
        `pdflatex -interaction=nonstopmode -output-directory "${dir}" "${texPath}"`,
      );
    } catch (_error: unknown) {
      // pdflatex exits 1 on warnings too — try to read the pdf anyway
      const logPath = path.join(dir, "doc.log");
      let log = "";
      try { log = await readFile(logPath, "utf8"); } catch {}
      const pdfPath = path.join(dir, "doc.pdf");
      try {
        const pdf = await readFile(pdfPath);
        return { ok: true, pdf };
      } catch {
        return { ok: false, status: 422, error: "pdflatex failed", log };
      }
    }

    const pdf = await readFile(path.join(dir, "doc.pdf"));
    return { ok: true, pdf };
  } finally {
    rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

buildRouter.post("/:id/build", async (req, res) => {
  const doc = await documents.get(req.params.id);
  if (!doc) return res.status(404).json({ error: "not found" });

  const result = await buildDocumentPdf(doc.id);
  if (result.ok) {
    res.setHeader("content-type", "application/pdf");
    return res.send(result.pdf);
  }

  if (result.error === "missing assets") {
    return res.status(result.status).json({
      error: result.error,
      missingAssets: result.missingAssets,
    });
  }

  return res.status(result.status).json({ error: result.error, log: result.log });
});
