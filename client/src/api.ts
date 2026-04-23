import type {
  Template,
  Snippet,
  SnippetFork,
  DocumentManifest,
  DocumentFull,
  ParamBinding,
} from "@goggles/shared";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const cache = new Map<string, { value: unknown; expires: number }>();
const TTL = 30_000;

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return fn().then((v) => { cache.set(key, { value: v, expires: Date.now() + TTL }); return v; });
}

function bust(...keys: string[]) {
  keys.forEach((k) => cache.delete(k));
}

export const api = {
  listTemplates: () => cached("templates", () => fetch("/api/templates").then(j<Template[]>)),
  getTemplate: (id: string) => cached(`template:${id}`, () => fetch(`/api/templates/${id}`).then(j<Template>)),
  putTemplate: (id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) =>
    fetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, description, notes, paramDescs, tags }),
    }).then(j<Template>).then((v) => { bust("templates", `template:${id}`); return v; }),
  forkTemplate: (id: string, targetId: string) =>
    fetch(`/api/templates/${id}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: targetId }),
    }).then(j<Template>).then((v) => { bust("templates", `template:${id}`, `template:${targetId}`); return v; }),

  listSnippets: () => cached("snippets", () => fetch("/api/snippets").then(j<Snippet[]>)),
  getSnippet: (id: string) => cached(`snippet:${id}`, () => fetch(`/api/snippets/${id}`).then(j<Snippet>)),
  putSnippet: (
    id: string,
    content: string,
    description: string,
    notes: string,
    conversionNotes: string,
    paramDescs: Record<string, string>,
    tags: string[],
  ) =>
    fetch(`/api/snippets/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, description, notes, conversionNotes, paramDescs, tags }),
    }).then(j<Snippet>).then((v) => { bust("snippets", `snippet:${id}`); return v; }),
  forkSnippet: (id: string, targetId: string) =>
    fetch(`/api/snippets/${id}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: targetId }),
    }).then(j<Snippet>).then((v) => { bust("snippets", `snippet:${id}`, `snippet:${targetId}`); return v; }),

  listDocuments: () => cached("documents", () => fetch("/api/documents").then(j<DocumentManifest[]>)),
  getDocument: (id: string) => cached(`document:${id}`, () => fetch(`/api/documents/${id}`).then(j<DocumentFull>)),
  createDocument: (baseTemplateId: string, name: string) =>
    fetch("/api/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseTemplateId, name }),
    }).then(j<DocumentFull>).then((v) => { bust("documents"); return v; }),
  forkDocument: (id: string, name: string) =>
    fetch(`/api/documents/${id}/fork`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    }).then(j<DocumentFull>).then((v) => { bust("documents", `document:${id}`, `document:${v.id}`); return v; }),
  patchDocument: (
    id: string,
    patch: Partial<Pick<DocumentManifest, "name" | "notes" | "paramBindings" | "tags">>,
  ) =>
    fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<DocumentManifest>).then((v) => { bust(`document:${id}`, "documents"); return v; }),
  setDocumentTemplate: (id: string, content: string) =>
    fetch(`/api/documents/${id}/template`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content }),
    }).then(j<{ ok: true }>),
  clearDocumentTemplate: (id: string) =>
    fetch(`/api/documents/${id}/template`, { method: "DELETE" }).then(j<{ ok: true }>),

  createFork: (docId: string, sourceSnippetId: string) =>
    fetch(`/api/documents/${docId}/forks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sourceSnippetId }),
    }).then(j<SnippetFork>).then((v) => { bust(`document:${docId}`); return v; }),
  updateFork: (
    docId: string,
    forkId: string,
    patch: { content?: string; notes?: string },
  ) =>
    fetch(`/api/documents/${docId}/forks/${forkId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<SnippetFork>).then((v) => { bust(`document:${docId}`); return v; }),
  deleteFork: (docId: string, forkId: string) =>
    fetch(`/api/documents/${docId}/forks/${forkId}`, { method: "DELETE" }).then(
      j<{ ok: true }>
    ).then((v) => { bust(`document:${docId}`); return v; }),
};

export type { Template, Snippet, SnippetFork, DocumentManifest, DocumentFull, ParamBinding };
