import { readFile, writeFile, readdir, mkdir, stat, rm } from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import {
  TEMPLATES_DIR,
  SNIPPETS_DIR,
  DOCUMENTS_DIR,
  documentDir,
  documentManifestPath,
  documentTemplatePath,
  documentForksDir,
  forkContentPath,
  forkMetaPath,
} from "./paths.js";
import {
  extractDesc,
  injectDesc,
  extractAuthorNotes,
  injectAuthorNotes,
  extractParamDescs,
  injectParamDescs,
  extractTags,
  injectTags,
  type Template,
  type Snippet,
  type SnippetFork,
  type DocumentManifest,
  type DocumentFull,
} from "@goggles/shared/src";

async function exists(p: string) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function listTex(dir: string): Promise<string[]> {
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  return entries.filter((e) => e.endsWith(".tex")).map((e) => e.slice(0, -4));
}

async function readTexItem(dir: string, id: string) {
  const raw = await readFile(path.join(dir, `${id}.tex`), "utf8");
  const { description, stripped: s1 } = extractDesc(raw);
  const { notes, stripped: s2 } = extractAuthorNotes(s1);
  const { paramDescs, stripped: s3 } = extractParamDescs(s2);
  const { tags, stripped } = extractTags(s3);
  return { id, name: id, content: stripped, description, notes, paramDescs, tags };
}

async function writeTexItem(
  dir: string,
  id: string,
  content: string,
  description: string,
  notes: string,
  paramDescs: Record<string, string>,
  tags: string[],
) {
  await mkdir(dir, { recursive: true });
  let full = injectDesc(content, description);
  full = injectAuthorNotes(full, notes);
  full = injectParamDescs(full, paramDescs);
  full = injectTags(full, tags);
  await writeFile(path.join(dir, `${id}.tex`), full, "utf8");
}

export const templates = {
  async list(): Promise<Template[]> {
    const ids = await listTex(TEMPLATES_DIR);
    return Promise.all(ids.map((id) => readTexItem(TEMPLATES_DIR, id)));
  },
  async get(id: string): Promise<Template | null> {
    if (!(await exists(path.join(TEMPLATES_DIR, `${id}.tex`)))) return null;
    return readTexItem(TEMPLATES_DIR, id);
  },
  async put(id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) {
    await writeTexItem(TEMPLATES_DIR, id, content, description, notes, paramDescs, tags);
    return readTexItem(TEMPLATES_DIR, id);
  },
};

export const snippets = {
  async list(): Promise<Snippet[]> {
    const ids = await listTex(SNIPPETS_DIR);
    return Promise.all(ids.map((id) => readTexItem(SNIPPETS_DIR, id)));
  },
  async get(id: string): Promise<Snippet | null> {
    if (!(await exists(path.join(SNIPPETS_DIR, `${id}.tex`)))) return null;
    return readTexItem(SNIPPETS_DIR, id);
  },
  async put(id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) {
    await writeTexItem(SNIPPETS_DIR, id, content, description, notes, paramDescs, tags);
    return readTexItem(SNIPPETS_DIR, id);
  },
};

async function readManifest(id: string): Promise<DocumentManifest | null> {
  const p = documentManifestPath(id);
  if (!(await exists(p))) return null;
  return JSON.parse(await readFile(p, "utf8"));
}

async function writeManifest(m: DocumentManifest) {
  await mkdir(documentDir(m.id), { recursive: true });
  await writeFile(documentManifestPath(m.id), JSON.stringify(m, null, 2));
}

async function readForks(docId: string): Promise<SnippetFork[]> {
  const dir = documentForksDir(docId);
  if (!(await exists(dir))) return [];
  const entries = await readdir(dir);
  const ids = entries.filter((e) => e.endsWith(".tex")).map((e) => e.slice(0, -4));
  return Promise.all(
    ids.map(async (id) => {
      const content = await readFile(forkContentPath(docId, id), "utf8");
      const metaRaw = (await exists(forkMetaPath(docId, id)))
        ? JSON.parse(await readFile(forkMetaPath(docId, id), "utf8"))
        : { sourceSnippetId: "", notes: "" };
      return {
        id,
        sourceSnippetId: metaRaw.sourceSnippetId ?? "",
        notes: metaRaw.notes ?? "",
        content,
      };
    })
  );
}

export const documents = {
  async list(): Promise<DocumentManifest[]> {
    if (!(await exists(DOCUMENTS_DIR))) return [];
    const entries = await readdir(DOCUMENTS_DIR);
    const out: DocumentManifest[] = [];
    for (const id of entries) {
      const m = await readManifest(id);
      if (m) out.push(m);
    }
    return out;
  },
  async get(id: string): Promise<DocumentFull | null> {
    const m = await readManifest(id);
    if (!m) return null;
    let templateContent = "";
    if (m.hasTemplateOverride && (await exists(documentTemplatePath(id)))) {
      templateContent = await readFile(documentTemplatePath(id), "utf8");
    } else {
      const t = await templates.get(m.baseTemplateId);
      templateContent = t?.content ?? "";
    }
    const forks = await readForks(id);
    return { ...m, templateContent, forks };
  },
  async create(baseTemplateId: string, name: string): Promise<DocumentFull> {
    const t = await templates.get(baseTemplateId);
    if (!t) throw new Error("template not found");
    const id = nanoid(10);
    const m: DocumentManifest = {
      id,
      name,
      baseTemplateId,
      hasTemplateOverride: false,
      paramBindings: {},
      notes: "",
    };
    await mkdir(documentForksDir(id), { recursive: true });
    await writeManifest(m);
    return { ...m, templateContent: t.content, forks: [] };
  },
  async updateManifest(id: string, patch: Partial<DocumentManifest>): Promise<DocumentManifest> {
    const cur = await readManifest(id);
    if (!cur) throw new Error("not found");
    const next: DocumentManifest = { ...cur, ...patch, id: cur.id };
    await writeManifest(next);
    return next;
  },
  async setTemplateOverride(id: string, content: string) {
    const cur = await readManifest(id);
    if (!cur) throw new Error("not found");
    await writeFile(documentTemplatePath(id), content, "utf8");
    if (!cur.hasTemplateOverride) {
      cur.hasTemplateOverride = true;
      await writeManifest(cur);
    }
  },
  async clearTemplateOverride(id: string) {
    const cur = await readManifest(id);
    if (!cur) throw new Error("not found");
    const p = documentTemplatePath(id);
    if (await exists(p)) await rm(p);
    cur.hasTemplateOverride = false;
    await writeManifest(cur);
  },
  async createFork(docId: string, sourceSnippetId: string): Promise<SnippetFork> {
    const s = await snippets.get(sourceSnippetId);
    if (!s) throw new Error("snippet not found");
    const id = nanoid(10);
    await mkdir(documentForksDir(docId), { recursive: true });
    await writeFile(forkContentPath(docId, id), s.content, "utf8");
    const meta = { sourceSnippetId, notes: "" };
    await writeFile(forkMetaPath(docId, id), JSON.stringify(meta, null, 2));
    return { id, sourceSnippetId, content: s.content, notes: "" };
  },
  async updateFork(
    docId: string,
    forkId: string,
    patch: { content?: string; notes?: string }
  ): Promise<SnippetFork> {
    const cp = forkContentPath(docId, forkId);
    const mp = forkMetaPath(docId, forkId);
    if (!(await exists(cp))) throw new Error("fork not found");
    if (patch.content != null) await writeFile(cp, patch.content, "utf8");
    const meta = (await exists(mp))
      ? JSON.parse(await readFile(mp, "utf8"))
      : { sourceSnippetId: "", notes: "" };
    if (patch.notes != null) meta.notes = patch.notes;
    await writeFile(mp, JSON.stringify(meta, null, 2));
    const content = await readFile(cp, "utf8");
    return { id: forkId, sourceSnippetId: meta.sourceSnippetId ?? "", content, notes: meta.notes ?? "" };
  },
  async deleteFork(docId: string, forkId: string) {
    const cp = forkContentPath(docId, forkId);
    const mp = forkMetaPath(docId, forkId);
    if (await exists(cp)) await rm(cp);
    if (await exists(mp)) await rm(mp);
  },
};
