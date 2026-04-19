import { useEffect, useMemo, useState } from "react";
import { extractParams } from "@goggles/shared/src";
import { api, type Template, type Snippet } from "./api.js";
import { LaTeXEditor } from "./LaTeXEditor.js";

type Tab = "templates" | "snippets";
type Item = Template | Snippet;

function fuzzyMatch(item: Item, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = [item.id, item.description, item.notes, ...item.tags].join(" ").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token));
}

export function Library() {
  const [tab, setTab] = useState<Tab>("templates");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [paramDescs, setParamDescs] = useState<Record<string, string>>({});
  const [tagsInput, setTagsInput] = useState("");
  const [dirty, setDirty] = useState(false);
  const [query, setQuery] = useState("");

  async function refresh() {
    const [t, s] = await Promise.all([api.listTemplates(), api.listSnippets()]);
    setTemplates(t);
    setSnippets(s);
  }

  useEffect(() => { refresh(); }, []);

  const items = tab === "templates" ? templates : snippets;
  const filtered = items.filter((i) => fuzzyMatch(i, query));
  const current = items.find((i) => i.id === selected) ?? null;

  function open(id: string) {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    setSelected(id);
    setContent(item.content);
    setDescription(item.description);
    setNotes(item.notes);
    setParamDescs(item.paramDescs ?? {});
    setTagsInput(item.tags.join(", "));
    setDirty(false);
  }

  // Live-derive params from current content; merge with existing descs.
  const detectedParams = useMemo(() => extractParams(content), [content]);

  const mergedDescs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of detectedParams) out[p] = paramDescs[p] ?? "";
    return out;
  }, [detectedParams, paramDescs]);

  function setParamDesc(name: string, desc: string) {
    setParamDescs((prev) => ({ ...prev, [name]: desc }));
    setDirty(true);
  }

  async function save() {
    if (!current) return;
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    if (tab === "templates")
      await api.putTemplate(current.id, content, description, notes, mergedDescs, tags);
    else
      await api.putSnippet(current.id, content, description, notes, mergedDescs, tags);
    await refresh();
    setDirty(false);
  }

  async function create() {
    const label = tab === "templates" ? "template" : "snippet";
    const id = prompt(`new ${label} id?`);
    if (!id) return;
    if (tab === "templates") await api.putTemplate(id, "", "", "", {}, []);
    else await api.putSnippet(id, "", "", "", {}, []);
    await refresh();
    open(id);
  }

  function mark() { setDirty(true); }

  return (
    <aside className="library">
      <div className="library-tabs">
        <button
          className={tab === "templates" ? "active" : ""}
          onClick={() => { setTab("templates"); setSelected(null); setQuery(""); }}
        >
          templates
        </button>
        <button
          className={tab === "snippets" ? "active" : ""}
          onClick={() => { setTab("snippets"); setSelected(null); setQuery(""); }}
        >
          questions
        </button>
        <button className="library-new" onClick={create} title="new">+</button>
      </div>

      <div className="library-search">
        <input
          type="search"
          placeholder="filter by name, tag…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <ul className="library-list">
        {filtered.map((i) => (
          <li
            key={i.id}
            className={i.id === selected ? "active" : ""}
            onClick={() => open(i.id)}
          >
            <div className="name">{i.id}</div>
            {i.tags.length > 0 && (
              <div className="tags">
                {i.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}
            {i.description && <div className="meta">{i.description}</div>}
          </li>
        ))}
        {filtered.length === 0 && <li className="empty">no matches</li>}
      </ul>

      {current && (
        <div className="library-view">
          <div className="library-view-head">
            <strong>{current.id}</strong>
            <button disabled={!dirty} onClick={save}>save</button>
          </div>
          <label className="field">
            <span>tags <small>(comma-separated)</small></span>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => { setTagsInput(e.target.value); mark(); }}
              placeholder="algebra, quadratic…"
            />
          </label>
          <label className="field">
            <span>description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); mark(); }}
              placeholder="one-line summary…"
            />
          </label>
          <label className="field">
            <span>author notes</span>
            <textarea
              value={notes}
              onChange={(e) => { setNotes(e.target.value); mark(); }}
              rows={3}
              placeholder="detailed pedagogy, source, variations…"
            />
          </label>
          <label className="field">
            <span>content</span>
            <LaTeXEditor
              value={content}
              onChange={(v) => { setContent(v); mark(); }}
              minHeight="180px"
            />
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
                    onChange={(e) => setParamDesc(p, e.target.value)}
                    placeholder="describe this parameter…"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
