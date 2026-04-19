import type {
  Template,
  Snippet,
  SnippetFork,
  DocumentManifest,
  DocumentFull,
  ParamBinding,
} from "@goggles/shared/src";

async function j<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export const api = {
  listTemplates: () => fetch("/api/templates").then(j<Template[]>),
  getTemplate: (id: string) => fetch(`/api/templates/${id}`).then(j<Template>),
  putTemplate: (id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) =>
    fetch(`/api/templates/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, description, notes, paramDescs, tags }),
    }).then(j<Template>),

  listSnippets: () => fetch("/api/snippets").then(j<Snippet[]>),
  putSnippet: (id: string, content: string, description: string, notes: string, paramDescs: Record<string, string>, tags: string[]) =>
    fetch(`/api/snippets/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content, description, notes, paramDescs, tags }),
    }).then(j<Snippet>),

  listDocuments: () => fetch("/api/documents").then(j<DocumentManifest[]>),
  getDocument: (id: string) => fetch(`/api/documents/${id}`).then(j<DocumentFull>),
  createDocument: (baseTemplateId: string, name: string) =>
    fetch("/api/documents", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseTemplateId, name }),
    }).then(j<DocumentFull>),
  patchDocument: (
    id: string,
    patch: Partial<Pick<DocumentManifest, "name" | "notes" | "paramBindings">>,
  ) =>
    fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<DocumentManifest>),
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
    }).then(j<SnippetFork>),
  updateFork: (
    docId: string,
    forkId: string,
    patch: { content?: string; notes?: string },
  ) =>
    fetch(`/api/documents/${docId}/forks/${forkId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then(j<SnippetFork>),
  deleteFork: (docId: string, forkId: string) =>
    fetch(`/api/documents/${docId}/forks/${forkId}`, { method: "DELETE" }).then(
      j<{ ok: true }>,
    ),
};

export type { Template, Snippet, SnippetFork, DocumentManifest, DocumentFull, ParamBinding };
