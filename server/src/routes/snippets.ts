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
  const { content = "", description = "", notes = "", paramDescs = {}, tags = [] } = req.body ?? {};
  const s = await snippets.put(req.params.id, content, description, notes, paramDescs, tags);
  res.json(s);
});
