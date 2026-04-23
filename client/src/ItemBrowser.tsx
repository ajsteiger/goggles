import { useEffect, useMemo, useState } from "react";
import { extractParams } from "@goggles/shared";
import { api, type Template, type Snippet } from "./api.js";
import { LazyLaTeXEditor } from "./LazyLaTeXEditor.js";
import { TagEditor } from "./TagEditor.js";

type ItemKind = "templates" | "snippets";
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

function ItemEditor({
  item,
  kind,
  onSave,
  autoFocusEditor,
  onFocused,
}: {
  item: Item;
  kind: ItemKind;
  onSave: (nextId?: string) => void;
  autoFocusEditor: boolean;
  onFocused: () => void;
}) {
  const [content, setContent] = useState(item.content);
  const [description, setDescription] = useState(item.description);
  const [notes, setNotes] = useState(item.notes);
  const [conversionNotes, setConversionNotes] = useState(item.conversionNotes ?? "");
  const [paramDescs, setParamDescs] = useState<Record<string, string>>(item.paramDescs ?? {});
  const [tags, setTags] = useState(item.tags);
  const [forkName, setForkName] = useState("");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setContent(item.content);
    setDescription(item.description);
    setNotes(item.notes);
    setConversionNotes(item.conversionNotes ?? "");
    setParamDescs(item.paramDescs ?? {});
    setTags(item.tags);
    setForkName(`${item.id}-copy`);
    setDirty(false);
  }, [kind, item.id, item.content, item.description, item.notes, item.conversionNotes, item.paramDescs, item.tags]);

  useEffect(() => {
    if (!autoFocusEditor) return;
    onFocused();
  }, [autoFocusEditor, onFocused]);

  const detectedParams = useMemo(() => extractParams(content), [content]);
  const mergedDescs = useMemo(() => {
    const out: Record<string, string> = {};
    for (const p of detectedParams) out[p] = paramDescs[p] ?? "";
    return out;
  }, [detectedParams, paramDescs]);

  async function save() {
    if (kind === "templates") {
      await api.putTemplate(item.id, content, description, notes, mergedDescs, tags);
    } else {
      await api.putSnippet(item.id, content, description, notes, conversionNotes, mergedDescs, tags);
    }
    setDirty(false);
    onSave();
  }

  async function fork() {
    const targetId = forkName.trim();
    if (!targetId) return;
    await save();
    if (kind === "templates") {
      await api.forkTemplate(item.id, targetId);
    } else {
      await api.forkSnippet(item.id, targetId);
    }
    onSave(targetId);
  }

  const mark = () => setDirty(true);

  return (
    <div className="entity-editor">
      <div className="entity-editor-header">
        <h2>{item.id}</h2>
        <div className="editor-actions editor-actions-wide">
          <input
            type="text"
            value={forkName}
            onChange={(e) => setForkName(e.target.value)}
            placeholder={`copy ${kind === "templates" ? "template" : "question"}…`}
          />
          <button onClick={fork}>copy</button>
          <button disabled={!dirty} onClick={save}>save</button>
        </div>
      </div>

      <div className="item-editor-fields">
        <label className="field">
          <span>tags</span>
          <TagEditor
            tags={tags}
            onChange={(next) => {
              setTags(next);
              mark();
            }}
            placeholder="add tag…"
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
          <LazyLaTeXEditor
            value={notes}
            onChange={(v) => { setNotes(v); mark(); }}
            minHeight="80px"
          />
        </label>
        {kind === "snippets" && (
          <label className="field">
            <span>conversion notes</span>
            <textarea
              value={conversionNotes}
              onChange={(e) => { setConversionNotes(e.target.value); mark(); }}
              placeholder="conversion debug info…"
              rows={5}
            />
          </label>
        )}
      </div>

      <label className="field">
        <span>content</span>
        <LazyLaTeXEditor
          value={content}
          onChange={(v) => { setContent(v); mark(); }}
          minHeight="300px"
          autoFocus={autoFocusEditor}
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
                onChange={(e) => { setParamDescs((prev) => ({ ...prev, [p]: e.target.value })); mark(); }}
                placeholder="describe this parameter…"
              />
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function ItemBrowser({ kind }: { kind: ItemKind }) {
  const [items, setItems] = useState<Item[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [autoFocusEditor, setAutoFocusEditor] = useState(false);

  async function refresh(nextSelectedId?: string) {
    const list = kind === "templates" ? await api.listTemplates() : await api.listSnippets();
    setItems(list);
    if (nextSelectedId) setSelectedId(nextSelectedId);
  }

  useEffect(() => { refresh(); }, [kind]);

  async function create() {
    const id = newName.trim();
    if (!id) return;
    if (kind === "templates") {
      await api.putTemplate(id, "", "", "", {}, []);
    } else {
      await api.putSnippet(id, "", "", "", "", {}, []);
    }
    setNewName("");
    await refresh(id);
    setAutoFocusEditor(true);
  }

  const filtered = items.filter((i) => fuzzyMatch(i, query));
  const selected = items.find((i) => i.id === selectedId);
  const label = kind === "templates" ? "template" : "question";

  return (
    <div className="browser">
      <div className="browser-sidebar">
        <div className="browser-toolbar browser-create-section">
          <div className="browser-toolbar-label">create {label}</div>
          <input
            type="text"
            placeholder={`${label} name…`}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <button onClick={create} disabled={!newName.trim()}>create</button>
        </div>
        <div className="browser-toolbar browser-filter-section">
          <div className="browser-toolbar-label">filter</div>
          <input
            type="search"
            placeholder={`filter ${label}s…`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ul className="browser-list">
          {filtered.map((i) => (
            <li
              key={i.id}
              className={i.id === selectedId ? "active" : ""}
              onClick={() => { setSelectedId(i.id); setAutoFocusEditor(false); }}
            >
              <div className="name">{i.id}</div>
              {i.tags.length > 0 && (
                <div className="tags">{i.tags.map((t) => <span key={t} className="tag">{t}</span>)}</div>
              )}
              {i.description && <div className="meta">{i.description}</div>}
            </li>
          ))}
          {filtered.length === 0 && <li className="empty">no matches</li>}
        </ul>
      </div>
      <div className="browser-content">
        {selected ? (
          <ItemEditor
            item={selected}
            kind={kind}
            onSave={(nextId) => refresh(nextId)}
            autoFocusEditor={autoFocusEditor}
            onFocused={() => setAutoFocusEditor(false)}
          />
        ) : (
          <div className="empty">select or create a {label}</div>
        )}
      </div>
    </div>
  );
}

export function TemplateBrowser() {
  return <ItemBrowser kind="templates" />;
}

export function SnippetBrowser() {
  return <ItemBrowser kind="snippets" />;
}
