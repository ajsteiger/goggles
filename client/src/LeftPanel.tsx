import { useEffect, useMemo, useState } from "react";
import { extractParams } from "@goggles/shared/src";
import { api, type Template, type Snippet, type DocumentManifest } from "./api.js";
import { LaTeXEditor } from "./LaTeXEditor.js";

type Tab = "templates" | "questions" | "docs";

function fuzzyMatch(item: { id: string; description?: string; notes?: string; tags?: string[] }, q: string) {
  if (!q.trim()) return true;
  const hay = [item.id, item.description ?? "", item.notes ?? "", ...(item.tags ?? [])].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => hay.includes(t));
}

// ── Shared item editor ──────────────────────────────────────────────────────

function ItemEditor({
  item,
  kind,
  onSave,
}: {
  item: Template | Snippet;
  kind: "templates" | "snippets";
  onSave: () => void;
}) {
  const [content, setContent] = useState(item.content);
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes);
  const [paramDescs, setParamDescs] = useState<Record<string, string>>(item.paramDescs ?? {});
  const [tagsInput, setTagsInput] = useState(item.tags.join(", "));
  const [dirty, setDirty] = useState(false);

  const detectedParams = useMemo(() => extractParams(content), [content]);
  const mergedDescs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of detectedParams) out[p] = paramDescs[p] ?? "";
    return out;
  }, [detectedParams, paramDescs]);

  async function save() {
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (kind === "templates") await api.putTemplate(item.id, content, description, notes, mergedDescs, tags);
    else await api.putSnippet(item.id, content, description, notes, mergedDescs, tags);
    setDirty(false);
    onSave();
  }

  const m = () => setDirty(true);

  return (
    <div className="item-editor">
      <div className="item-editor-head">
        <strong>{item.id}</strong>
        <button disabled={!dirty} onClick={save}>save</button>
      </div>
      <label className="field">
        <span>tags</span>
        <input type="text" value={tagsInput} onChange={(e) => { setTagsInput(e.target.value); m(); }} placeholder="algebra, quadratic…" />
      </label>
      <label className="field">
        <span>description</span>
        <input type="text" value={description} onChange={(e) => { setDescription(e.target.value); m(); }} placeholder="one-line summary…" />
      </label>
      <label className="field">
        <span>author notes</span>
        <textarea value={notes} onChange={(e) => { setNotes(e.target.value); m(); }} rows={3} placeholder="pedagogy, source, variations…" />
      </label>
      <label className="field">
        <span>content</span>
        <LaTeXEditor value={content} onChange={(v) => { setContent(v); m(); }} minHeight="180px" />
      </label>
      {detectedParams.length > 0 && (
        <div className="param-descs">
          <div className="param-descs-head">parameters</div>
          {detectedParams.map((p) => (
            <label key={p} className="field param-desc-row">
              <span className="param-desc-name">\@@{p}</span>
              <input
                type="text"
                value={mergedDescs[p] ?? ""}
                onChange={(e) => { setParamDescs((prev) => ({ ...prev, [p]: e.target.value })); m(); }}
                placeholder="describe this parameter…"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Item list tab (templates or questions) ──────────────────────────────────

function ItemListTab({ kind }: { kind: "templates" | "snippets" }) {
  const [items, setItems] = useState<(Template | Snippet)[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  async function refresh() {
    const list = kind === "templates" ? await api.listTemplates() : await api.listSnippets();
    setItems(list);
  }
  useEffect(() => { refresh(); }, [kind]);

  async function create() {
    const id = prompt(`new ${kind === "templates" ? "template" : "question"} id?`);
    if (!id) return;
    if (kind === "templates") await api.putTemplate(id, "", "", "", {}, []);
    else await api.putSnippet(id, "", "", "", {}, []);
    await refresh();
    setSelected(id);
  }

  const filtered = items.filter((i) => fuzzyMatch(i, query));
  const current = items.find((i) => i.id === selected) ?? null;

  return (
    <div className="left-tab-content">
      <div className="left-tab-toolbar">
        <input
          type="search"
          placeholder="filter…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="left-search"
        />
        <button onClick={create}>+</button>
      </div>
      <ul className="item-list">
        {filtered.map((i) => (
          <li key={i.id} className={i.id === selected ? "active" : ""} onClick={() => setSelected(i.id)}>
            <div className="name">{i.id}</div>
            {i.tags.length > 0 && (
              <div className="tags">{i.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
            )}
            {i.description && <div className="meta">{i.description}</div>}
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">no matches</li>}
      </ul>
      {current && (
        <ItemEditor key={current.id} item={current} kind={kind} onSave={refresh} />
      )}
    </div>
  );
}

// ── Docs tab ────────────────────────────────────────────────────────────────

function DocsTab({
  activeDocId,
  onSelectDoc,
}: {
  activeDocId: string | null;
  onSelectDoc: (id: string) => void;
}) {
  const [docs, setDocs] = useState<DocumentManifest[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [newName, setNewName] = useState("");
  const [newTemplateId, setNewTemplateId] = useState("");

  async function refresh() {
    const [d, t] = await Promise.all([api.listDocuments(), api.listTemplates()]);
    setDocs(d);
    setTemplates(t);
    if (!newTemplateId && t.length) setNewTemplateId(t[0].id);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    if (!newTemplateId) return;
    const name = newName.trim() || "Untitled";
    const d = await api.createDocument(newTemplateId, name);
    setNewName("");
    await refresh();
    onSelectDoc(d.id);
  }

  return (
    <div className="left-tab-content">
      <div className="new-doc-form">
        <input
          type="text"
          placeholder="document name…"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
        <select value={newTemplateId} onChange={(e) => setNewTemplateId(e.target.value)}>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
        </select>
        <button onClick={create} disabled={!newTemplateId}>create</button>
      </div>
      <ul className="item-list">
        {docs.map((d) => (
          <li
            key={d.id}
            className={d.id === activeDocId ? "active" : ""}
            onClick={() => onSelectDoc(d.id)}
          >
            <div className="name">{d.name}</div>
            <div className="meta">{d.baseTemplateId}</div>
          </li>
        ))}
        {docs.length === 0 && <li className="empty">no documents yet</li>}
      </ul>
    </div>
  );
}

// ── LeftPanel ───────────────────────────────────────────────────────────────

export function LeftPanel({
  activeDocId,
  onSelectDoc,
}: {
  activeDocId: string | null;
  onSelectDoc: (id: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("docs");

  return (
    <aside className="left-panel">
      <div className="left-tabs">
        {(["docs", "templates", "questions"] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === "docs" && <DocsTab activeDocId={activeDocId} onSelectDoc={onSelectDoc} />}
      {tab === "templates" && <ItemListTab kind="templates" />}
      {tab === "questions" && <ItemListTab kind="snippets" />}
    </aside>
  );
}
