import { Router } from "express";
import { snippets } from "../storage.js";

export const snippetsRouter = Router();

snippetsRouter.get("/", async (_req, res) => {
  res.json(await snippets.list());
});

snippetsRouter.get("/:id", async (req, res) => {
  const s = await snippets.get(req.params.id);
  if (!s) return res.status(404).json({ error: "not found" });
  res.json(s);
});

snippetsRouter.put("/:id", async (req, res) => {
  const {
    content = "",
    description = "",
    notes = "",
    conversionNotes = "",
    paramDescs = {},
    tags = [],
  } = req.body ?? {};
  const s = await snippets.put(req.params.id, content, description, notes, conversionNotes, paramDescs, tags);
  res.json(s);
});

snippetsRouter.post("/:id/fork", async (req, res) => {
  const { id } = req.body ?? {};
  if (!id) return res.status(400).json({ error: "id required" });
  try {
    const s = await snippets.fork(req.params.id, id);
    res.json(s);
  } catch (e: any) {
    res.status(400).json({ error: e.message });
  }
});
