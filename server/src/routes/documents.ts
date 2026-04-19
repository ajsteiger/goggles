import { Router } from "express";
import { documents } from "../storage.js";

export const documentsRouter = Router();

documentsRouter.get("/", async (_req, res) => {
  res.json(await documents.list());
});

documentsRouter.get("/:id", async (req, res) => {
  const d = await documents.get(req.params.id);
  if (!d) return res.status(404).json({ error: "not found" });
  res.json(d);
});

documentsRouter.post("/", async (req, res) => {
  const { baseTemplateId, name } = req.body ?? {};
  if (!baseTemplateId) return res.status(400).json({ error: "baseTemplateId required" });
  try {
    const d = await documents.create(baseTemplateId, name ?? "Untitled");
    res.json(d);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

documentsRouter.patch("/:id", async (req, res) => {
  try {
    const m = await documents.updateManifest(req.params.id, req.body ?? {});
    res.json(m);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

documentsRouter.put("/:id/template", async (req, res) => {
  const { content } = req.body ?? {};
  if (typeof content !== "string") return res.status(400).json({ error: "content required" });
  await documents.setTemplateOverride(req.params.id, content);
  res.json({ ok: true });
});

documentsRouter.delete("/:id/template", async (req, res) => {
  await documents.clearTemplateOverride(req.params.id);
  res.json({ ok: true });
});

documentsRouter.post("/:id/forks", async (req, res) => {
  const { sourceSnippetId } = req.body ?? {};
  if (!sourceSnippetId) return res.status(400).json({ error: "sourceSnippetId required" });
  try {
    const fork = await documents.createFork(req.params.id, sourceSnippetId);
    res.json(fork);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

documentsRouter.put("/:id/forks/:forkId", async (req, res) => {
  try {
    const fork = await documents.updateFork(req.params.id, req.params.forkId, req.body ?? {});
    res.json(fork);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});

documentsRouter.delete("/:id/forks/:forkId", async (req, res) => {
  await documents.deleteFork(req.params.id, req.params.forkId);
  res.json({ ok: true });
});
