import { readFile, writeFile, readdir, mkdir, stat, rm, rename } from "node:fs/promises";
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

const serverCache = new Map<string, { value: unknown; expires: number }>();
const SERVER_TTL = 60_000;

function scGet<T>(key: string): T | undefined {
  const hit = serverCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as T;
  return undefined;
}
function scSet(key: string, value: unknown) {
  serverCache.set(key, { value, expires: Date.now() + SERVER_TTL });
}
function scBust(...keys: string[]) {
  keys.forEach((k) => serverCache.delete(k));
}

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

async function forkTexItem(dir: string, sourceId: string, targetId: string) {
  const item = await readTexItem(dir, sourceId);
  await writeTexItem(dir, targetId, item.content, item.description, item.notes, item.paramDescs, item.tags);
  return readTexItem(dir, targetId);
}

export const templates = {
  async list(): Promise<Template[]> {
    const cached = scGet<Template[]>("templates:list");
    if (cached) return cached;
    const ids = await listTex(TEMPLATES_DIR);
    const result = await Promise.all(ids.map((id) => readTexItem(TEMPLATES_DIR, id)));
    scSet("templates:list", result);
    return result;
  },
  async get(id: string): Promise<Template | null> {
    const cached = scGet<Template>(`template:${id}`);
    if (cached) return cached;
    if (!(await exists(path.join(TEMPLATES_DIR, `${id}.tex`)))) return null;
    const result = await readTexItem(TEMPLATES_DIR, id);
    scSet(`template:${id}`, result);
    return result;
  },
  async put(id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) {
    await writeTexItem(TEMPLATES_DIR, id, content, description, notes, paramDescs, tags);
    scBust("templates:list", `template:${id}`);
    return readTexItem(TEMPLATES_DIR, id);
  },
  async fork(sourceId: string, targetId: string) {
    const item = await templates.get(sourceId);
    if (!item) throw new Error("template not found");
    await writeTexItem(TEMPLATES_DIR, targetId, item.content, item.description, item.notes, item.paramDescs, item.tags);
    scBust("templates:list", `template:${sourceId}`, `template:${targetId}`);
    return readTexItem(TEMPLATES_DIR, targetId);
  },
};

export const snippets = {
  async list(): Promise<Snippet[]> {
    const cached = scGet<Snippet[]>("snippets:list");
    if (cached) return cached;
    const ids = await listTex(SNIPPETS_DIR);
    const result = await Promise.all(ids.map((id) => readTexItem(SNIPPETS_DIR, id)));
    scSet("snippets:list", result);
    return result;
  },
  async get(id: string): Promise<Snippet | null> {
    const cached = scGet<Snippet>(`snippet:${id}`);
    if (cached) return cached;
    if (!(await exists(path.join(SNIPPETS_DIR, `${id}.tex`)))) return null;
    const result = await readTexItem(SNIPPETS_DIR, id);
    scSet(`snippet:${id}`, result);
    return result;
  },
  async put(id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) {
    await writeTexItem(SNIPPETS_DIR, id, content, description, notes, paramDescs, tags);
    scBust("snippets:list", `snippet:${id}`);
    return readTexItem(SNIPPETS_DIR, id);
  },
  async fork(sourceId: string, targetId: string) {
    const item = await snippets.get(sourceId);
    if (!item) throw new Error("snippet not found");
    await writeTexItem(SNIPPETS_DIR, targetId, item.content, item.description, item.notes, item.paramDescs, item.tags);
    scBust("snippets:list", `snippet:${sourceId}`, `snippet:${targetId}`);
    return readTexItem(SNIPPETS_DIR, targetId);
  },
};

async function readManifest(id: string): Promise<DocumentManifest | null> {
  const p = documentManifestPath(id);
  if (!(await exists(p))) return null;
  const parsed = JSON.parse(await readFile(p, "utf8")) as DocumentManifest;
  return { ...parsed, tags: parsed.tags ?? [] };
}

async function writeManifest(m: DocumentManifest) {
  await mkdir(documentDir(m.id), { recursive: true });
  const target = documentManifestPath(m.id);
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify(m, null, 2));
  await rename(temp, target);
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
    const results = await Promise.all(entries.map((id) => readManifest(id)));
    return results.filter((m): m is DocumentManifest => m !== null);
  },
  async get(id: string): Promise<DocumentFull | null> {
    const m = await readManifest(id);
    if (!m) return null;
    const [templateContent, forks] = await Promise.all([
      m.hasTemplateOverride && (await exists(documentTemplatePath(id)))
        ? readFile(documentTemplatePath(id), "utf8")
        : templates.get(m.baseTemplateId).then((t) => t?.content ?? ""),
      readForks(id),
    ]);
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
      tags: [],
    };
    await mkdir(documentForksDir(id), { recursive: true });
    await writeManifest(m);
    return { ...m, templateContent: t.content, forks: [] };
  },
  async fork(sourceId: string, name: string): Promise<DocumentFull> {
    const doc = await documents.get(sourceId);
    if (!doc) throw new Error("document not found");
    const created = await documents.create(doc.baseTemplateId, name);
    await documents.updateManifest(created.id, {
      paramBindings: doc.paramBindings,
      notes: doc.notes,
      tags: doc.tags,
    });
    if (doc.hasTemplateOverride) {
      await documents.setTemplateOverride(created.id, doc.templateContent);
    }
    for (const fork of doc.forks) {
      await mkdir(documentForksDir(created.id), { recursive: true });
      await writeFile(forkContentPath(created.id, fork.id), fork.content, "utf8");
      await writeFile(forkMetaPath(created.id, fork.id), JSON.stringify({ sourceSnippetId: fork.sourceSnippetId, notes: fork.notes }, null, 2));
    }
    return documents.get(created.id) as Promise<DocumentFull>;
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
